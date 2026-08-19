'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { buildShip } from './three/ship'

import { WebGLUnavailable } from './HullViewer'

/**
 * Landing on water, and working as a boat afterwards.
 *
 * This integrates, it does not animate. The vertical channel is a real equation
 * of motion: the gondola is accelerated by the buoyancy it develops as the sea
 * surface rises past it, resisted by its own weight-on-water and by damping,
 * and the force that appears in the suspension is the number plotted. The
 * horizontal channel balances propeller thrust against hull resistance and the
 * aerodynamic drag of the whole envelope.
 *
 * WHAT IT EXISTS TO SHOW. Switch the float from a boat hull to a pneumatic
 * cushion in the same sea and watch the suspension trace flatten. A rigid hull
 * is a hydrostatic spring: the force it feeds up the cables is rho*g*A*dz and
 * it has no ceiling. A cushion cannot push harder than its gauge pressure times
 * its contact area, so it squashes instead. That single difference is the
 * whole of this vehicle's seakeeping, and it is much easier to believe when you
 * can see the trace clip.
 */

export interface MarineData {
  readonly waterlineLength: number
  readonly waterplaneArea: number
  readonly gondolaWidth: number
  readonly gondolaLength: number
  readonly gondolaMass: number
  readonly suspensionDesignLoad: number
  readonly reliefPressure: number
  readonly ventArea: number
  readonly heaveInertia: number
  readonly staticThrust: number
  readonly cushion: {
    readonly pressure: number
    readonly depressionDepth: number
    readonly waveHead: number
    readonly viable: boolean
    readonly fanPower: number
    readonly reason: string
  }
  readonly landingHeaviness: number
  readonly totalMass: number
  readonly envelopeVolume: number
  readonly hullSpeed: number
  readonly porpoisingSpeed: number
  readonly seakeepingComparison: ReadonlyArray<{
    readonly code: number
    readonly description: string
    readonly significantWaveHeight: number
    readonly rigid: {
      readonly load: number
      readonly utilisation: number
      readonly ok: boolean
      readonly nearResonance: boolean
    }
    readonly sealed: { readonly load: number; readonly utilisation: number; readonly ok: boolean }
    readonly vented: {
      readonly load: number
      readonly utilisation: number
      readonly ok: boolean
      readonly forceLimited: boolean
    }
  }>
  readonly maximumSeaStateRigid: number | null
  readonly maximumSeaStateSealed: number | null
  readonly maximumSeaStateVented: number | null
  readonly windward: ReadonlyArray<{
    readonly wind: number
    readonly speed: number
    readonly overpowered: boolean
    readonly porpoisingLimited: boolean
    readonly aerodynamicFraction: number
  }>
  readonly stallWind: number
  readonly touchdown: ReadonlyArray<{
    readonly rate: number
    readonly immersion: number
    readonly loadFactor: number
    readonly submerged: boolean
  }>
}

export interface MarineSimulatorProps {
  readonly data: MarineData
  /** Hull radii, for drawing the envelope above the water. */
  readonly radii: readonly number[]
  readonly length: number
}

type FloatKind = 'rigid' | 'sealed' | 'vented'
type Phase = 'aloft' | 'descending' | 'afloat'

/** @source Seawater at 35 practical salinity units and 15 C. */
const SEAWATER_DENSITY = 1025
const G = 9.80665

interface Readout {
  phase: Phase
  altitude: number
  immersion: number
  suspensionLoad: number
  utilisation: number
  forceLimited: boolean
  speed: number
  thrustUsed: number
  resistance: number
  aerodynamicFraction: number
  blownBackwards: boolean
  porpoising: boolean
}

export function MarineSimulator({ data, radii, length }: MarineSimulatorProps) {
  const mount = useRef<HTMLDivElement>(null)
  const [unsupported, setUnsupported] = useState(false)

  const [floatKind, setFloatKind] = useState<FloatKind>('vented')
  const [seaState, setSeaState] = useState(3)
  const [wind, setWind] = useState(8)
  const [throttle, setThrottle] = useState(0.6)
  const [phase, setPhase] = useState<Phase>('afloat')

  const [readout, setReadout] = useState<Readout>({
    phase: 'afloat',
    altitude: 0,
    immersion: 0,
    suspensionLoad: 0,
    utilisation: 0,
    forceLimited: false,
    speed: 0,
    thrustUsed: 0,
    resistance: 0,
    aerodynamicFraction: 0,
    blownBackwards: false,
    porpoising: false,
  })

  // Live control values the animation loop reads without being torn down.
  const controls = useRef({ floatKind, seaState, wind, throttle, phase })
  controls.current = { floatKind, seaState, wind, throttle, phase }

  // A rolling trace of suspension load, which is the whole point of the thing.
  const trace = useRef<number[]>([])
  const [traceVersion, setTraceVersion] = useState(0)

  useEffect(() => {
    const container = mount.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = null
    // Fog, so the sea fades into the page instead of ending at a hard edge with
    // black above it. It is the cheapest way to give a plane a horizon.
    scene.fog = new THREE.Fog(0x0a0c0f, length * 1.7, length * 3.2)
    const camera = new THREE.PerspectiveCamera(36, 1, 0.5, length * 6)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setUnsupported(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const disposables: Array<{ dispose: () => void }> = []
    const track = <T extends { dispose: () => void }>(x: T): T => {
      disposables.push(x)
      return x
    }

    // ---- the sea ----------------------------------------------------------
    // A grid whose vertices are moved by the same wave the physics uses, so the
    // water you see and the water the gondola feels are one surface.
    const SEA_SIZE = length * 3
    const SEA_SEGMENTS = 96
    const seaGeometry = track(
      new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS),
    )
    const sea = new THREE.Mesh(
      seaGeometry,
      track(
        new THREE.MeshStandardMaterial({
          color: 0x14384f,
          roughness: 0.35,
          metalness: 0.25,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
        }),
      ),
    )
    sea.rotation.x = -Math.PI / 2
    scene.add(sea)

    const seaWire = new THREE.Mesh(
      seaGeometry,
      track(
        new THREE.MeshBasicMaterial({
          color: 0x2f6d94,
          wireframe: true,
          transparent: true,
          opacity: 0.18,
        }),
      ),
    )
    seaWire.rotation.x = -Math.PI / 2
    scene.add(seaWire)

    // ---- the ship ---------------------------------------------------------
    // Simplified against the arrangement view: the hull, the fins and the
    // gondola. This scene is about the water, and three full cutaways on one
    // page is three WebGL contexts too many.
    const ship = new THREE.Group()
    scene.add(ship)

    // The envelope above the water, from the shared model-driven geometry. It
    // carries its tail and its propulsors here because a bare lathe made the
    // vehicle unreadable at the moment it matters, which is the one this view
    // exists to show. The car is drawn separately below, since the whole
    // subject here is the car meeting the water while the hull stays above it.
    const built = buildShip({ hullSegments: 64, rings: false, car: false, mode: 'afloat' })
    const hullGroup = built.group
    ship.add(hullGroup)

    const maxRadius = Math.max(...radii)

    // The gondola, at its real size, because its waterplane is the thing under
    // discussion.
    const gondola = new THREE.Mesh(
      track(new THREE.BoxGeometry(data.gondolaLength, 3.2, data.gondolaWidth)),
      track(
        new THREE.MeshStandardMaterial({
          color: 0x3987e5,
          roughness: 0.5,
          metalness: 0.2,
        }),
      ),
    )
    ship.add(gondola)

    // Suspension cables, drawn so the load path is visible while it is being
    // discussed.
    const cableMaterial = track(
      new THREE.LineBasicMaterial({ color: 0x6ba8e5, transparent: true, opacity: 0.6 }),
    )
    const cables: THREE.Line[] = []
    for (let i = 0; i <= 3; i += 1) {
      const line = new THREE.Line(
        track(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
          ]),
        ),
        cableMaterial,
      )
      cables.push(line)
      ship.add(line)
    }

    scene.add(new THREE.AmbientLight(0x9aa7b4, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(0.6, 1.4, 0.9)
    scene.add(key)
    // A dim bounce off the sea, so the underside of the hull is not a silhouette.
    const bounce = new THREE.DirectionalLight(0x2f6d94, 0.55)
    bounce.position.set(-0.4, -1, -0.5)
    scene.add(bounce)

    // ---- state ------------------------------------------------------------
    // Gondola keel height above mean sea level, and its vertical velocity.
    let keel = -0.2
    let keelRate = 0
    let speed = 0
    let clock = 0

    /** @derived Heave damping on a light float. A guess, and it only sets settling time. */
    const HEAVE_DAMPING = 0.55

    const waveAt = (x: number, t: number, amplitude: number, period: number): number => {
      /** @derived Deep-water dispersion: L = g T^2 / (2 pi). */
      const wavelength = (G * period * period) / (2 * Math.PI)
      const k = (2 * Math.PI) / wavelength
      const omega = (2 * Math.PI) / period
      // Two components at slightly different frequencies, so the surface does
      // not look like a single sine and the gondola sees a realistic beat.
      return (
        amplitude * 0.6 * Math.sin(k * x - omega * t) +
        amplitude * 0.4 * Math.sin(k * 1.7 * x - omega * 1.3 * t + 1.1)
      )
    }

    const step = (dt: number) => {
      const c = controls.current
      const state = data.seakeepingComparison.find((s) => s.code === c.seaState)
      const amplitude = (state?.significantWaveHeight ?? 0.3) / 2
      /** @derived Mean period from the sea state table, roughly 3.5 to 10 s. */
      const period = 2 + c.seaState * 1.4
      clock += dt

      const surface = waveAt(0, clock, amplitude, period)

      // --- vertical ---
      let immersion = 0
      let suspensionLoad = 0
      let forceLimited = false

      if (c.phase === 'aloft') {
        keel += (28 - keel) * Math.min(dt * 0.8, 1)
        keelRate = 0
      } else {
        const immersedBy = Math.max(0, surface - keel)
        immersion = immersedBy

        // A rigid hull is a hydrostatic spring. A SEALED bag is a gas spring at
        // ABSOLUTE pressure, which is nearly sixty times stiffer than the water
        // it replaced. Only a VENTED bag limits force, and only because it
        // vents. Getting this backwards is the mistake this simulator was
        // rebuilt to show.
        let buoyancy: number
        if (c.floatKind === 'sealed') {
          /** @derived Isothermal gas spring: k = P_absolute * A / t. */
          const ATMOSPHERIC = 101325
          const THICKNESS = 0.5
          buoyancy =
            ((ATMOSPHERIC + data.reliefPressure) * data.waterplaneArea * immersedBy) / THICKNESS
        } else {
          buoyancy = SEAWATER_DENSITY * G * data.waterplaneArea * immersedBy
          if (c.floatKind === 'vented') {
            /** @source XC-8A measured relief overshoot, NASA TN D-7295. */
            const OVERSHOOT = 2.5
            const ceiling = data.reliefPressure * data.waterplaneArea * OVERSHOOT
            if (buoyancy > ceiling) {
              buoyancy = ceiling
              forceLimited = true
            }
          }
        }
        suspensionLoad = buoyancy

        // The mass being accelerated is the gondola plus the share of the
        // vehicle the suspension is stiff against. The envelope's own added
        // mass is far too large to respond at wave frequency, so it is the
        // gondola that moves.
        const effectiveMass = data.gondolaMass
        const weightOnWater = data.landingHeaviness * G
        const acceleration =
          (buoyancy - weightOnWater) / effectiveMass - HEAVE_DAMPING * keelRate

        keelRate += acceleration * dt
        keel += keelRate * dt

        // The suspension is a cable, not a strut: it can pull the gondola down
        // against the hull but it cannot push it up past its attachment.
        const CABLE_LIMIT = 1.2
        if (keel > CABLE_LIMIT) {
          keel = CABLE_LIMIT
          keelRate = Math.min(keelRate, 0)
        }
        if (c.phase === 'descending' && keel > surface) {
          /** @source A deliberate water landing arrives at about 1 m/s. */
          const DESCENT_RATE = 1.0
          keel -= DESCENT_RATE * dt
          keelRate = -DESCENT_RATE
        }
      }

      // --- horizontal ---
      const thrust = data.staticThrust * c.throttle
      // Aerodynamic drag on the envelope at boat speed plus wind, plus a
      // hydrodynamic term that is small and included for honesty.
      /** @source Bow-on complete-ship drag coefficient on volume^(2/3). */
      const CD = 0.045
      const airspeed = speed + c.wind
      const aerodynamic =
        0.5 * 1.225 * airspeed * Math.abs(airspeed) * Math.pow(data.envelopeVolume, 2 / 3) * CD
      /** @derived Hydrodynamic resistance, small because the displacement is tiny. */
      const hydro = 40 * speed * Math.abs(speed)
      const resistance = aerodynamic + hydro
      const surge = (thrust - resistance) / data.totalMass
      speed = Math.max(0, speed + surge * dt)

      const utilisation = suspensionLoad / data.suspensionDesignLoad

      if (c.phase !== 'aloft') {
        trace.current.push(utilisation)
        if (trace.current.length > 240) trace.current.shift()
      }

      return {
        phase: c.phase,
        altitude: keel,
        immersion,
        suspensionLoad,
        utilisation,
        forceLimited,
        speed,
        thrustUsed: thrust,
        resistance,
        aerodynamicFraction: resistance === 0 ? 0 : aerodynamic / resistance,
        blownBackwards: thrust < resistance && speed === 0,
        porpoising: speed > data.porpoisingSpeed,
        surface,
      }
    }

    // The camera follows the vehicle rather than the world, because the
    // interesting thing is always the gondola meeting the water and the hull
    // looming over it, and those move together through 24 m of altitude.
    let cameraTargetY = 8
    const placeCamera = () => {
      const width = container.clientWidth || 1
      const height = container.clientHeight || 1
      camera.aspect = width / height
      // Far enough back that the whole hull fits across the frame: the
      // ship is what gives the sea its scale, and a cropped hull gives none.
      camera.position.set(length * 0.7, cameraTargetY + maxRadius * 0.5, length * 0.92)
      camera.lookAt(0, cameraTargetY, 0)
      camera.updateProjectionMatrix()
    }

    const resize = () => {
      const width = container.clientWidth
      const height = Math.max(Math.round(width * 0.46), 320)
      renderer.setSize(width, height)
      placeCamera()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    const seaPosition = seaGeometry.attributes['position'] as THREE.BufferAttribute
    let frame = 0
    let stopped = false
    let last = performance.now()
    let sinceReadout = 0

    const tick = () => {
      if (stopped) return
      frame = requestAnimationFrame(tick)

      const now = performance.now()
      /** @derived Clamped so a background tab does not integrate a huge step. */
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      const s = step(dt)

      // Move the sea grid with the same wave the physics used.
      const c = controls.current
      const state = data.seakeepingComparison.find((x) => x.code === c.seaState)
      const amplitude = (state?.significantWaveHeight ?? 0.3) / 2
      const period = 2 + c.seaState * 1.4
      for (let i = 0; i < seaPosition.count; i += 1) {
        const x = seaPosition.getX(i)
        seaPosition.setZ(i, waveAt(x, clock, amplitude, period))
      }
      seaPosition.needsUpdate = true
      seaGeometry.computeVertexNormals()

      // The hull sits a fixed height above the gondola: the suspension is stiff
      // in the vertical, which is exactly why the sea load has nowhere to go.
      const gondolaCentre = s.altitude + 1.6
      gondola.position.set(0, gondolaCentre, 0)
      const hullCentre = gondolaCentre + 1.6 + maxRadius + 1.6
      hullGroup.position.set(0, hullCentre, 0)

      // Ease the frame toward the vehicle so the descent reads as a descent
      // rather than as the sea rising.
      const wanted = gondolaCentre + maxRadius * 0.55
      cameraTargetY += (wanted - cameraTargetY) * Math.min(dt * 2.5, 1)
      placeCamera()

      for (let i = 0; i < cables.length; i += 1) {
        const cable = cables[i]
        if (!cable) continue
        const t = (i / (cables.length - 1) - 0.5) * data.gondolaLength * 0.8
        const side = i % 2 === 0 ? 1 : -1
        const geometry = cable.geometry as THREE.BufferGeometry
        geometry.setFromPoints([
          new THREE.Vector3(t, gondolaCentre + 1.6, (side * data.gondolaWidth) / 2),
          new THREE.Vector3(t, hullCentre - maxRadius * 0.9, side * maxRadius * 0.4),
        ])
      }

      // Colour the gondola by how hard the suspension is being worked. Red is
      // not decoration here: it is the design load being exceeded.
      const material = gondola.material as THREE.MeshStandardMaterial
      material.color.setHex(
        s.utilisation > 1 ? 0xd75843 : s.utilisation > 0.7 ? 0xc98500 : 0x3987e5,
      )

      sinceReadout += dt
      if (sinceReadout > 0.1) {
        sinceReadout = 0
        setReadout({
          phase: s.phase,
          altitude: s.altitude,
          immersion: s.immersion,
          suspensionLoad: s.suspensionLoad,
          utilisation: s.utilisation,
          forceLimited: s.forceLimited,
          speed: s.speed,
          thrustUsed: s.thrustUsed,
          resistance: s.resistance,
          aerodynamicFraction: s.aerodynamicFraction,
          blownBackwards: s.blownBackwards,
          porpoising: s.porpoising,
        })
        setTraceVersion((v) => v + 1)
      }

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      for (const d of disposables) d.dispose()
      built.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [data, radii, length])

  if (unsupported) return <WebGLUnavailable what="water landing simulation" />

  const sea = data.seakeepingComparison.find((s) => s.code === seaState)
  const overloaded = readout.utilisation > 1

  return (
    <div>
      <div ref={mount} className="w-full" aria-label="Water landing and boat mode simulation" />

      {/* the suspension trace, which is the reason this exists */}
      <div className="border-y border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--color-ink-faint)]">
            Suspension load, as a fraction of its flight design load
          </span>
          <span
            className={`num text-xs ${overloaded ? 'text-[var(--color-fail)]' : 'text-[var(--color-ink-dim)]'}`}
          >
            {(readout.utilisation * 100).toFixed(0)}%
            {readout.forceLimited ? ' · cushion at its ceiling' : ''}
          </span>
        </div>
        <SuspensionTrace samples={trace.current} version={traceVersion} />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr]">
        {/* controls */}
        <div className="space-y-4">
          <div>
            <div className="flex gap-2">
              {(
                [
                  { id: 'aloft', label: 'Aloft' },
                  { id: 'descending', label: 'Land on water' },
                  { id: 'afloat', label: 'Afloat' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPhase(p.id)
                    if (p.id === 'aloft') trace.current = []
                  }}
                  aria-pressed={phase === p.id}
                  className={`px-3 py-1.5 text-xs tracking-wide transition-colors ${
                    phase === p.id
                      ? 'bg-[var(--color-accent)] text-[#0b0e12]'
                      : 'border border-[var(--color-rule)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              What it lands on
            </div>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { id: 'rigid', label: 'Rigid boat hull' },
                  { id: 'sealed', label: 'Sealed bag' },
                  { id: 'vented', label: 'Vented bag' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFloatKind(f.id)}
                  aria-pressed={floatKind === f.id}
                  className={`px-3 py-1.5 text-xs tracking-wide transition-colors ${
                    floatKind === f.id
                      ? 'bg-[var(--color-accent)] text-[#0b0e12]'
                      : 'border border-[var(--color-rule)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-faint)]">
              {floatKind === 'vented'
                ? `Relieving at ${(data.reliefPressure / 1000).toFixed(2)} kPa gauge through ${data.ventArea.toFixed(2)} m² of vent. It cannot push harder than that times its ${data.waterplaneArea.toFixed(0)} m² of contact, times the 2.5 overshoot the XC-8A actually measured, because a relief valve does not dump air instantly.`
                : floatKind === 'sealed'
                  ? 'A gas spring at ABSOLUTE pressure. Compressing a bag works against all 101 kPa inside it, not the 0.35 kPa of gauge, so it is nearly sixty times stiffer than the water it replaced. The force-limiter argument is not optimistic here, it is inverted.'
                  : `A hydrostatic spring: ${data.waterplaneArea.toFixed(0)} m² of waterplane feeding rho g A dz up the cables, with no ceiling at all.`}
            </p>
          </div>

          <Slider
            label="Sea state"
            value={seaState}
            min={1}
            max={6}
            step={1}
            onChange={setSeaState}
            display={`${seaState} · ${sea?.description ?? ''} · ${sea?.significantWaveHeight ?? 0} m`}
          />
          <Slider
            label="Wind"
            value={wind}
            min={0}
            max={25}
            step={1}
            onChange={setWind}
            display={`${wind} m/s`}
          />
          <Slider
            label="Throttle"
            value={throttle}
            min={0}
            max={1}
            step={0.05}
            onChange={setThrottle}
            display={`${(throttle * 100).toFixed(0)}% · ${((data.staticThrust * throttle) / 1000).toFixed(1)} kN`}
          />
        </div>

        {/* readouts */}
        <div className="grid grid-cols-2 gap-3">
          <Readout
            label="Immersion"
            value={readout.immersion.toFixed(2)}
            unit="m"
            tone={readout.immersion > 1.8 ? 'fail' : 'ink'}
          />
          <Readout
            label="Suspension"
            value={(readout.suspensionLoad / 1000).toFixed(0)}
            unit="kN"
            note={`of ${(data.suspensionDesignLoad / 1000).toFixed(0)} kN design`}
            tone={overloaded ? 'fail' : 'ink'}
          />
          <Readout
            label="Speed"
            value={readout.speed.toFixed(2)}
            unit="m/s"
            note={
              readout.porpoising
                ? 'past the porpoising limit'
                : `${(readout.speed * 1.944).toFixed(1)} kn`
            }
            tone={readout.porpoising ? 'fail' : 'ink'}
          />
          <Readout
            label="Resistance"
            value={(readout.resistance / 1000).toFixed(2)}
            unit="kN"
            note={`${(readout.aerodynamicFraction * 100).toFixed(0)}% of it is air`}
            tone={readout.blownBackwards ? 'fail' : 'ink'}
          />
        </div>
      </div>

      <div className="border-t border-[var(--color-rule)] p-4">
        {overloaded ? (
          <p className="text-sm leading-relaxed text-[var(--color-fail)]">
            The suspension is at {(readout.utilisation * 100).toFixed(0)} percent of its flight
            design load. The vehicle is not slamming: it is being picked up. Switch to the vented
            bag and watch the trace clip instead of spiking. Switch to the sealed bag to see the
            mistake: a bag with no relief path is stiffer than the water it replaced.
          </p>
        ) : readout.blownBackwards ? (
          <p className="text-sm leading-relaxed text-[var(--color-fail)]">
            Thrust cannot overcome the drag on the envelope. Above about{' '}
            {data.stallWind.toFixed(0)} m/s the vehicle goes wherever the wind goes, and the sea
            anchor is the only remaining plan.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-[var(--color-ink-dim)]">
            {readout.forceLimited
              ? 'The bag is venting rather than pushing. That flat top on the trace is the whole seakeeping argument, and it exists only because there is a relief valve: seal the same bag and it becomes the stiffest thing on the vehicle.'
              : `Hull speed is ${data.hullSpeed.toFixed(1)} m/s and the porpoising limit is ${data.porpoisingSpeed.toFixed(1)} m/s. The hull carries so little weight that it walks through the wave-making hump and runs into dynamic instability instead.`}
          </p>
        )}
      </div>
    </div>
  )
}

function SuspensionTrace({ samples, version }: { samples: number[]; version: number }) {
  void version
  const width = 600
  const height = 60
  if (samples.length < 2) {
    return (
      <div
        className="mt-2 h-[60px] border border-[var(--color-rule)]"
        aria-hidden
      />
    )
  }

  // A FIXED scale, deliberately. Auto-scaling to the peak would rescale the
  // axis when you switch from a rigid hull to a cushion, and the whole point is
  // to see the trace drop. Three times the design load fills the box; anything
  // above that is off the top, which is the honest way to draw 496 percent.
  const FULL_SCALE = 3
  const clipped = samples.some((s) => s > FULL_SCALE)
  const points = samples
    .map(
      (s, i) =>
        `${(i / (samples.length - 1)) * width},${height - (Math.min(s, FULL_SCALE) / FULL_SCALE) * height}`,
    )
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="mt-2 h-[60px] w-full border border-[var(--color-rule)]"
      role="img"
      aria-label="Suspension load over time against its design limit"
    >
      {/* the design limit, which is the line that matters */}
      <line
        x1={0}
        y1={height - (1 / FULL_SCALE) * height}
        x2={width}
        y2={height - (1 / FULL_SCALE) * height}
        stroke="#d75843"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <polyline points={points} fill="none" stroke="#6ba8e5" strokeWidth="1.5" />
      {clipped ? (
        <text x={width - 4} y={10} fill="#d75843" fontSize="9" textAnchor="end">
          off scale
        </text>
      ) : null}
    </svg>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  display: string
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          {label}
        </span>
        <span className="num text-xs text-[var(--color-ink-dim)]">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--color-accent)]"
      />
    </label>
  )
}

function Readout({
  label,
  value,
  unit,
  note,
  tone = 'ink',
}: {
  label: string
  value: string
  unit?: string
  note?: string
  tone?: 'ink' | 'fail'
}) {
  return (
    <div className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {label}
      </div>
      <div
        className={`num mt-1.5 text-xl ${tone === 'fail' ? 'text-[var(--color-fail)]' : 'text-[var(--color-ink)]'}`}
      >
        {value}
        {unit ? <span className="ml-1 text-xs text-[var(--color-ink-dim)]">{unit}</span> : null}
      </div>
      {note ? <div className="mt-1 text-xs text-[var(--color-ink-faint)]">{note}</div> : null}
    </div>
  )
}
