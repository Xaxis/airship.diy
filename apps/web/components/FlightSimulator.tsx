'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { atmosphere, hullGeometry, hullRadiusAt, hullShapeForPrismatic } from '@airship/core'
import { WebGLUnavailable } from './HullViewer'
import { REST, minimumFinAreaForStability, step, yawStaticMargin } from '@airship/solvers'
import type { Controls, VehicleConfig, VehicleState } from '@airship/solvers'

/**
 * The flight simulator.
 *
 * It runs the ACTUAL solver from @airship/solvers, not a simplified version for
 * the browser. The same `step` function the validation gates exercise is called
 * here at 100 Hz, which is the whole point: if the vehicle feels wrong on
 * screen, the model is wrong, and there is no second implementation to blame.
 *
 * Two consequences of that worth knowing before flying it.
 *
 * IT IS SLOW TO RESPOND AND SLOW TO STOP. The effective mass in sway and heave
 * is nearly double the ship's own, because the displaced air has to be
 * accelerated too. Control inputs take tens of seconds to show.
 *
 * IT WALLOWS WHEN STOPPED AND IS DEAD-BEAT UNDER WAY. The pitch pendulum has a
 * period around thirty seconds and NO aerodynamic damping at zero airspeed,
 * because the fins have no dynamic pressure to work with. Above about ten
 * metres per second the same mode is overdamped. Both are correct and the
 * difference is large.
 */

export interface FlightSimulatorProps {
  readonly length: number
  readonly finenessRatio: number
  readonly prismaticCoefficient: number
  readonly cellCount: number
}

/** Fixed physics timestep, seconds. Decoupled from the frame rate on purpose. */
const PHYSICS_DT = 0.01

interface Readout {
  airspeed: number
  altitude: number
  pitch: number
  roll: number
  yaw: number
  heaviness: number
  climbRate: number
  thrust: number
  margin: number
}

export function FlightSimulator({
  length,
  finenessRatio,
  prismaticCoefficient,
  cellCount,
}: FlightSimulatorProps) {
  const mount = useRef<HTMLDivElement>(null)
  const [readout, setReadout] = useState<Readout | null>(null)
  const [running, setRunning] = useState(false)
  const [unsupported, setUnsupported] = useState(false)

  /**
   * Mutable pilot input, in a ref so the animation loop reads it without
   * re-binding. Deliberately NOT a `Controls`: that type is readonly because it
   * is a value handed to the solver, and a fresh one is built each step.
   */
  const input = useRef({ thrust: 0, elevator: 0, rudder: 0 })

  /**
   * Which controls are held down, whatever is holding them.
   *
   * The keyboard handlers and the on-screen buttons both write here and the
   * animation loop only reads. THE SIMULATOR WAS KEYBOARD ONLY, which meant it
   * was not merely awkward on a phone, it was inoperable: there is no W key on
   * a touch screen, so the vehicle sat at zero thrust forever. One shared set of
   * held controls is what lets both input devices drive the same solver rather
   * than the touch path being a second, subtly different implementation.
   */
  const held = useRef(new Set<string>())
  const [pressed, setPressed] = useState<readonly string[]>([])

  useEffect(() => {
    const container = mount.current
    if (!container) return

    // ---------------------------------------------------------------- physics
    const shape = hullShapeForPrismatic(prismaticCoefficient)
    const hull = hullGeometry(length as never, finenessRatio, shape)
    const air = atmosphere(1000 as never)
    const grossLift = hull.volume * 1.1397

    const finArm = length * 0.42
    const finSlope = 2.8
    const finArea = minimumFinAreaForStability(hull, finArm, finSlope) * 1.4

    const config: VehicleConfig = {
      hull,
      mass: grossLift,
      grossLift,
      buoyancyToGravity: 4,
      rollInertia: 2.0e6 * (length / 90) ** 5,
      pitchInertia: 1.2e7 * (length / 90) ** 5,
      yawInertia: 1.2e7 * (length / 90) ** 5,
      finArea,
      finArm,
      finLiftSlope: finSlope,
    }
    const margin = yawStaticMargin(config)

    let state: VehicleState = { ...REST, u: 8, down: -1000 }
    let ballastMass = 0

    // ----------------------------------------------------------------- scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0c0f)
    scene.fog = new THREE.Fog(0x0a0c0f, length * 2, length * 14)

    const camera = new THREE.PerspectiveCamera(50, 1, 1, length * 30)
    // See the note in HullViewer: an uncaught WebGL failure takes the whole
    // page down, not just this view.
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setUnsupported(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // The airship, built from the same shape function the model sizes with.
    const stations = 64
    const profile: THREE.Vector2[] = []
    for (let i = 0; i <= stations; i += 1) {
      const s = i / stations
      const r = hullRadiusAt(length as never, finenessRatio, s, shape)
      profile.push(new THREE.Vector2(Math.max(r, 1e-3), s * length - length / 2))
    }

    const ship = new THREE.Group()
    const hullGeom = new THREE.LatheGeometry(profile, 48)
    ship.add(
      new THREE.Mesh(
        hullGeom,
        new THREE.MeshStandardMaterial({ color: 0x39434f, metalness: 0.1, roughness: 0.8 }),
      ),
    )
    ship.add(
      new THREE.Mesh(
        hullGeom,
        new THREE.MeshBasicMaterial({ color: 0x5b6b7d, wireframe: true, transparent: true, opacity: 0.15 }),
      ),
    )

    // Rings at the gas cell bulkheads, so the structure reads while moving.
    const ringMaterial = new THREE.LineBasicMaterial({ color: 0x6ba8e5, transparent: true, opacity: 0.5 })
    for (let c = 1; c < cellCount; c += 1) {
      const s = c / cellCount
      const r = hullRadiusAt(length as never, finenessRatio, s, shape)
      const pts: THREE.Vector3[] = []
      for (let a = 0; a <= 48; a += 1) {
        const t = (a / 48) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(t) * r, s * length - length / 2, Math.sin(t) * r))
      }
      ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMaterial))
    }

    // Cruciform fins at the tail, drawn at the area the stability rule requires
    // so the picture and the physics agree.
    const finSpan = Math.sqrt(finArea / 4) * 1.4
    const finGeom = new THREE.BoxGeometry(finSpan, finSpan * 0.9, 0.3)
    const finMat = new THREE.MeshStandardMaterial({ color: 0x2b3947, metalness: 0.2, roughness: 0.7 })
    const tailY = length * 0.36
    for (let i = 0; i < 4; i += 1) {
      const fin = new THREE.Mesh(finGeom, finMat)
      const angle = (i * Math.PI) / 2
      fin.position.set(Math.sin(angle) * finSpan * 0.55, tailY, Math.cos(angle) * finSpan * 0.55)
      fin.rotation.y = -angle
      ship.add(fin)
    }

    // Gondola, below the hull where the habitable volume has to be.
    const gondola = new THREE.Mesh(
      new THREE.CapsuleGeometry(length * 0.012, length * 0.1, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x46525f, metalness: 0.3, roughness: 0.6 }),
    )
    gondola.rotation.z = Math.PI / 2
    gondola.rotation.y = Math.PI / 2
    gondola.position.set(0, -length * 0.08, -hullRadiusAt(length as never, finenessRatio, 0.34, shape) * 1.05)
    ship.add(gondola)

    // Lathe revolves about Y; rotate so the hull axis is the body x axis.
    ship.rotation.z = Math.PI / 2
    const shipPivot = new THREE.Group()
    shipPivot.add(ship)
    scene.add(shipPivot)

    // A ground grid, so motion and attitude are legible.
    const grid = new THREE.GridHelper(length * 40, 80, 0x33404e, 0x1b232c)
    scene.add(grid)

    scene.add(new THREE.AmbientLight(0x9aa7b4, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(0.6, 1, 0.4)
    scene.add(sun)

    // ---------------------------------------------------------------- controls
    const keys = held.current
    const down = (e: KeyboardEvent) => {
      if (
        ['w', 's', 'a', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
          e.key.toLowerCase(),
        )
      ) {
        e.preventDefault()
      }
      keys.add(e.key.toLowerCase())
    }
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    container.addEventListener('keydown', down)
    container.addEventListener('keyup', up)
    // A control held when the tab loses focus would stay held forever.
    const releaseAll = () => keys.clear()
    window.addEventListener('blur', releaseAll)

    // ------------------------------------------------------------------- loop
    const resize = () => {
      const width = container.clientWidth
      const height = Math.max(Math.round(width * 0.5), 320)
      // setSize's third argument is updateStyle, and passing false is a trap
      // here: it sets the drawing buffer but leaves the canvas CSS size alone,
      // so with a device pixel ratio of 2 the element lays out at TWICE the
      // intended height and the scene renders into a box half the size of the
      // one on screen. Let three.js set both.
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let frame = 0
    let stopped = false
    let last = performance.now()
    let accumulator = 0
    let sinceReadout = 0

    const tick = (now: number) => {
      if (stopped) return
      frame = requestAnimationFrame(tick)

      const elapsed = Math.min((now - last) / 1000, 0.25)
      last = now
      accumulator += elapsed

      // Read the keyboard into control positions. Rates are deliberate: this
      // vehicle does not respond quickly and pretending otherwise would make
      // the simulation feel like an aeroplane.
      const c = input.current
      const maxThrust = 12000 * (length / 90) ** 2
      if (keys.has('w')) c.thrust = Math.min(c.thrust + maxThrust * elapsed * 0.6, maxThrust)
      if (keys.has('s')) c.thrust = Math.max(c.thrust - maxThrust * elapsed * 0.6, -maxThrust * 0.4)
      if (keys.has('arrowup')) c.elevator = Math.max(c.elevator - elapsed * 0.5, -0.35)
      else if (keys.has('arrowdown')) c.elevator = Math.min(c.elevator + elapsed * 0.5, 0.35)
      else c.elevator *= 1 - Math.min(elapsed * 2, 1)
      if (keys.has('arrowleft')) c.rudder = Math.max(c.rudder - elapsed * 0.5, -0.35)
      else if (keys.has('arrowright')) c.rudder = Math.min(c.rudder + elapsed * 0.5, 0.35)
      else c.rudder *= 1 - Math.min(elapsed * 2, 1)
      // Ballast: the only way to change static heaviness, and it is slow.
      if (keys.has('q')) ballastMass = Math.max(ballastMass - 40 * elapsed, -600)
      if (keys.has('e')) ballastMass = Math.min(ballastMass + 40 * elapsed, 600)

      const live: VehicleConfig = { ...config, mass: grossLift + ballastMass }
      const commanded: Controls = {
        thrust: c.thrust,
        thrustVector: 0,
        elevator: c.elevator,
        rudder: c.rudder,
      }

      // Fixed-step physics, so the trajectory does not depend on frame rate.
      while (accumulator >= PHYSICS_DT) {
        try {
          state = step(state, live, air, commanded, PHYSICS_DT)
        } catch {
          // The integrator refuses to pass the Euler singularity. Reset rather
          // than freeze, and say nothing: it should not happen on this vehicle.
          state = { ...REST, u: 8, down: state.down }
        }
        accumulator -= PHYSICS_DT
      }

      // Attitude and position onto the scene. The ship stays at the origin and
      // the world moves, which keeps floating point sane over long flights.
      shipPivot.rotation.set(state.pitch, -state.yaw, state.roll, 'YXZ')
      grid.position.set(-state.east % (length / 2), state.down, -state.north % (length / 2))

      const chase = length * 1.5
      camera.position.set(
        -Math.sin(-state.yaw) * chase,
        length * 0.35,
        -Math.cos(-state.yaw) * chase,
      )
      camera.lookAt(0, 0, 0)

      sinceReadout += elapsed
      if (sinceReadout > 0.1) {
        sinceReadout = 0
        setReadout({
          airspeed: Math.hypot(state.u, state.v, state.w),
          altitude: -state.down,
          pitch: (state.pitch * 180) / Math.PI,
          roll: (state.roll * 180) / Math.PI,
          yaw: ((((state.yaw * 180) / Math.PI) % 360) + 360) % 360,
          heaviness: ballastMass,
          climbRate: -(state.u * Math.sin(state.pitch) * -1 + state.w * Math.cos(state.pitch)),
          thrust: c.thrust,
          margin,
        })
      }

      renderer.render(scene, camera)
    }

    setRunning(true)
    frame = requestAnimationFrame(tick)

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('blur', releaseAll)
      container.removeEventListener('keydown', down)
      container.removeEventListener('keyup', up)
      renderer.dispose()
      hullGeom.dispose()
      finGeom.dispose()
      container.removeChild(renderer.domElement)
      setRunning(false)
    }
  }, [length, finenessRatio, prismaticCoefficient, cellCount])

  if (unsupported) return <WebGLUnavailable what="flight simulator" />

  return (
    <div>
      <div
        ref={mount}
        tabIndex={0}
        className="w-full border border-[var(--color-rule)] bg-black outline-none focus:border-[var(--color-accent)]"
        aria-label="Flight simulator running the project's own 6-DOF solver"
      />

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
        {[
          ['Airspeed', readout ? `${readout.airspeed.toFixed(1)} m/s` : '—'],
          ['Altitude', readout ? `${readout.altitude.toFixed(0)} m` : '—'],
          ['Pitch', readout ? `${readout.pitch.toFixed(1)}°` : '—'],
          ['Roll', readout ? `${readout.roll.toFixed(1)}°` : '—'],
          ['Heading', readout ? `${readout.yaw.toFixed(0)}°` : '—'],
          ['Heaviness', readout ? `${readout.heaviness >= 0 ? '+' : ''}${readout.heaviness.toFixed(0)} kg` : '—'],
          ['Thrust', readout ? `${(readout.thrust / 1000).toFixed(1)} kN` : '—'],
          ['Yaw margin', readout ? `${readout.margin.toFixed(2)}` : '—'],
        ].map(([label, value]) => (
          <div key={label} className="border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              {label}
            </div>
            <div className="num mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ControlPad
          title="Thrust"
          hint="W and S"
          held={held}
          setPressed={setPressed}
          pressed={pressed}
          buttons={[
            { key: 'w', label: 'Ahead', span: 1 },
            { key: 's', label: 'Astern', span: 1 },
          ]}
        />
        <ControlPad
          title="Elevator and rudder"
          hint="Arrow keys"
          held={held}
          setPressed={setPressed}
          pressed={pressed}
          buttons={[
            { key: 'arrowup', label: 'Nose down', span: 1 },
            { key: 'arrowdown', label: 'Nose up', span: 1 },
            { key: 'arrowleft', label: 'Yaw left', span: 1 },
            { key: 'arrowright', label: 'Yaw right', span: 1 },
          ]}
        />
        <ControlPad
          title="Ballast"
          hint="Q and E"
          held={held}
          setPressed={setPressed}
          pressed={pressed}
          buttons={[
            { key: 'q', label: 'Drop', span: 1 },
            { key: 'e', label: 'Take on', span: 1 },
          ]}
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-faint)]">
        Hold a control above, or click the view and use the keyboard:{' '}
        <span className="num text-[var(--color-ink-dim)]">W</span> and{' '}
        <span className="num text-[var(--color-ink-dim)]">S</span> for thrust, arrow keys for
        elevator and rudder, <span className="num text-[var(--color-ink-dim)]">Q</span> and{' '}
        <span className="num text-[var(--color-ink-dim)]">E</span> to drop and take on ballast.
        Everything responds slowly, because the vehicle does.
        {running ? '' : ' Loading.'}
      </p>
    </div>
  )
}

/**
 * A group of hold-to-act controls that write into the same set the keyboard does.
 *
 * They are HOLD rather than TAP because that is what the solver expects: the
 * loop integrates for as long as a control is held, and a tap would be a
 * one-frame impulse on a vehicle that takes tens of seconds to respond to
 * anything. Releasing on pointer-leave and pointer-cancel matters more than it
 * looks: a finger that slides off the button would otherwise leave the thrust
 * latched on with nothing on screen saying so.
 */
function ControlPad({
  title,
  hint,
  buttons,
  held,
  pressed,
  setPressed,
}: {
  title: string
  hint: string
  buttons: readonly { key: string; label: string; span: number }[]
  held: React.RefObject<Set<string>>
  pressed: readonly string[]
  setPressed: (next: readonly string[]) => void
}) {
  const press = (key: string) => {
    held.current.add(key)
    setPressed([...held.current])
  }
  const release = (key: string) => {
    held.current.delete(key)
    setPressed([...held.current])
  }

  return (
    <div className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          {title}
        </span>
        <span className="num text-[10px] text-[var(--color-ink-faint)]">{hint}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {buttons.map((b) => {
          const on = pressed.includes(b.key)
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={on}
              onPointerDown={(e) => {
                e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                press(b.key)
              }}
              onPointerUp={() => release(b.key)}
              onPointerCancel={() => release(b.key)}
              onPointerLeave={() => release(b.key)}
              className={`min-h-11 select-none border px-2 py-2 text-xs transition-colors ${
                on
                  ? 'border-[var(--color-accent)] bg-[var(--color-panel-raised)] text-[var(--color-ink)]'
                  : 'border-[var(--color-rule)] text-[var(--color-ink-dim)] hover:border-[var(--color-rule-bright)]'
              }`}
              style={{ touchAction: 'none' }}
            >
              {b.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
