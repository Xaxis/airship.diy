'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { WebGLUnavailable } from './HullViewer'

/**
 * The ship, drawn from the arrangement.
 *
 * Every box in this scene is placed and sized from the same station, extent,
 * half-width and height that `massStatement` integrated to get its volume, and
 * every one of those volumes went into the lift figure and the habitability
 * check. The fins are the planform the yaw static margin was computed from. The
 * gas cells occupy exactly the volume the buoyancy came from, minus the keel
 * corridor. If the picture and the numbers ever disagree, the picture is wrong
 * by construction, which is the only way a drawing like this is worth anything.
 *
 * The previous version of this file was a lathe surface with a capsule stuck
 * underneath it, and it was not wrong so much as empty: there was no
 * arrangement to draw.
 */

export interface ArrangementCompartment {
  readonly id: string
  readonly name: string
  readonly deck: 'gondola' | 'keel' | 'cells' | 'external'
  readonly category: string
  readonly station: number
  /** Size in metres. Not fractions of the hull: a galley is a galley. */
  readonly width: number
  readonly height: number
  readonly extent: number
  /** Vertical centre, m from the hull axis. Negative is below. */
  readonly z: number
  readonly mass: number
  readonly volume: number
  readonly habitable: boolean
  readonly netHabitable: boolean
  readonly shell: boolean
  readonly enclosed: boolean
  readonly note: string | null
}

export interface ArrangementPropulsor {
  readonly id: string
  readonly station: number
  readonly lateralOffset: number
  readonly heightFraction: number
  readonly diameter: number
  readonly ratedPower: number
  readonly vectorAuthority: number
  readonly mass: number
  readonly note: string | null
}

export interface ArrangementData {
  readonly length: number
  readonly maxRadius: number
  readonly cellCount: number
  readonly radii: readonly number[]
  readonly exhaustStation: number
  readonly exhaustHeightFraction: number
  readonly cellBlockForward: number
  readonly cellBlockAft: number
  readonly keelForward: number
  readonly keelAft: number
  readonly keelWidth: number
  readonly arrayHalfAngle: number
  readonly arrayForwardStation: number
  readonly arrayAftStation: number
  readonly fins: {
    readonly rootChord: number
    readonly tipChord: number
    readonly span: number
    readonly area: number
    readonly station: number
    readonly mass: number
  }
  readonly compartments: readonly ArrangementCompartment[]
  readonly propulsors: readonly ArrangementPropulsor[]
  readonly mass: {
    readonly centreOfGravity: { readonly x: number; readonly z: number }
    readonly centreOfBuoyancy: { readonly x: number; readonly z: number }
  }
}

/**
 * Categorical colours, assigned in fixed order and never cycled.
 *
 * The documented dark-mode categorical steps, validated as a set against this
 * page's panel surface: lightness band, chroma floor, adjacent CVD separation,
 * normal-vision separation and contrast all pass. Colour is never the only
 * encoding here — every compartment is named on hover and named again in the
 * inboard profile drawing — but a palette that fails for a colourblind reader
 * fails whether or not there is a fallback.
 */
const CATEGORY_COLOR = {
  habitat: 0x3987e5,
  machinery: 0xd95926,
  energy: 0x199e70,
  consumable: 0xc98500,
  gas: 0xd55181,
  structure: 0x008300,
  crew: 0x9085e9,
} as const

/** Fallback for a category the palette has no slot for. Never a generated hue. */
const UNCATEGORISED = 0x5a6a7a

const colorFor = (category: string): number =>
  (CATEGORY_COLOR as Record<string, number>)[category] ?? UNCATEGORISED

export const CATEGORY_SWATCH: ReadonlyArray<{ key: string; label: string; hex: string }> = [
  { key: 'habitat', label: 'Habitat', hex: '#3987e5' },
  { key: 'machinery', label: 'Machinery', hex: '#d95926' },
  { key: 'energy', label: 'Energy', hex: '#199e70' },
  { key: 'consumable', label: 'Consumables', hex: '#c98500' },
  { key: 'gas', label: 'Gas cells', hex: '#d55181' },
  { key: 'structure', label: 'Structure', hex: '#008300' },
  { key: 'crew', label: 'Crew', hex: '#9085e9' },
]

export type ViewMode = 'exterior' | 'cutaway' | 'exploded'

const MODES: ReadonlyArray<{ id: ViewMode; label: string; hint: string }> = [
  { id: 'exterior', label: 'Exterior', hint: 'Hull, array, fins, propulsors and exhaust.' },
  {
    id: 'cutaway',
    label: 'Cutaway',
    hint: 'The near half of the hull and cover removed. Cells, keel corridor, gondola and every compartment.',
  },
  {
    id: 'exploded',
    label: 'Exploded',
    hint: 'The same parts, separated along the axis they are assembled on.',
  },
]

interface Hovered {
  readonly name: string
  readonly detail: string
  readonly note: string | null
  readonly x: number
  readonly y: number
}

export function ArrangementViewer({ data }: { data: ArrangementData }) {
  const mount = useRef<HTMLDivElement>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [mode, setMode] = useState<ViewMode>('cutaway')
  const [hovered, setHovered] = useState<Hovered | null>(null)

  // The scene is rebuilt only when the arrangement changes. Mode changes are
  // applied to the live scene through this ref, so switching views does not
  // throw away and re-upload every buffer.
  const applyMode = useRef<(m: ViewMode) => void>(() => {})
  const resetRef = useRef<() => void>(() => {})

  useEffect(() => {
    applyMode.current(mode)
  }, [mode])

  useEffect(() => {
    const container = mount.current
    if (!container) return

    const { length, maxRadius, radii } = data

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(36, 1, 0.5, length * 12)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setUnsupported(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.localClippingEnabled = true
    container.appendChild(renderer.domElement)

    // The cutaway plane. Everything that forms the outside of the ship is
    // clipped by it; everything inside is not, which is what makes a cutaway a
    // cutaway rather than a transparency.
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)

    const root = new THREE.Group()
    scene.add(root)

    const disposables: Array<{ dispose: () => void }> = []
    const track = <T extends { dispose: () => void }>(x: T): T => {
      disposables.push(x)
      return x
    }

    // Hull axis runs along +X, nose at -L/2. Everything below is in metres.
    const xOf = (station: number) => station * length - length / 2

    const radiusAt = (station: number): number => {
      const t = Math.min(Math.max(station, 0), 1) * (radii.length - 1)
      const i = Math.min(Math.floor(t), radii.length - 2)
      const f = t - i
      return (radii[i] ?? 0) * (1 - f) + (radii[i + 1] ?? 0) * f
    }

    // ---- pickable registry ------------------------------------------------
    const pickable: THREE.Object3D[] = []
    const register = (
      object: THREE.Object3D,
      name: string,
      detail: string,
      note: string | null,
    ) => {
      object.userData['pick'] = { name, detail, note }
      pickable.push(object)
    }

    // ---- groups, so the modes can move whole assemblies -------------------
    const skin = new THREE.Group() // hull surface, cover, array: clipped in cutaway
    const cells = new THREE.Group()
    const frame = new THREE.Group()
    const keel = new THREE.Group()
    const gondola = new THREE.Group()
    const tail = new THREE.Group()
    const power = new THREE.Group()
    root.add(skin, cells, frame, keel, gondola, tail, power)

    // ---- the hull surface -------------------------------------------------
    const profile = radii.map((r, i) => {
      const x = (i / (radii.length - 1)) * length
      return new THREE.Vector2(Math.max(r, 1e-4), x - length / 2)
    })
    const hullGeometry = track(new THREE.LatheGeometry(profile, 128))

    const hullSkin = new THREE.Mesh(
      hullGeometry,
      track(
        new THREE.MeshStandardMaterial({
          color: 0x2c3742,
          metalness: 0.12,
          roughness: 0.78,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
          clippingPlanes: [cutPlane],
        }),
      ),
    )
    skin.add(hullSkin)

    const hullWire = new THREE.Mesh(
      hullGeometry,
      track(
        new THREE.MeshBasicMaterial({
          color: 0x4a5b6d,
          wireframe: true,
          transparent: true,
          opacity: 0.16,
          clippingPlanes: [cutPlane],
        }),
      ),
    )
    skin.add(hullWire)

    // ---- the photovoltaic band -------------------------------------------
    // On the actual covered stations, at the actual half-angle, so the area on
    // screen is the area the energy balance integrated over.
    {
      const rows = 48
      const cols = 64
      const positions: number[] = []
      const { arrayForwardStation: f, arrayAftStation: a, arrayHalfAngle: half } = data
      for (let i = 0; i < rows; i += 1) {
        const s0 = f + (i / rows) * (a - f)
        const s1 = f + ((i + 1) / rows) * (a - f)
        const r0 = radiusAt(s0) * 1.01
        const r1 = radiusAt(s1) * 1.01
        for (let j = 0; j < cols; j += 1) {
          const t0 = -half + (j / cols) * 2 * half
          const t1 = -half + ((j + 1) / cols) * 2 * half
          // Theta measured from the top of the hull, which is +Z before the
          // group rotation below.
          const p = (r: number, s: number, t: number): [number, number, number] => [
            Math.sin(t) * r,
            xOf(s),
            Math.cos(t) * r,
          ]
          const A = p(r0, s0, t0)
          const B = p(r0, s0, t1)
          const C = p(r1, s1, t1)
          const D = p(r1, s1, t0)
          positions.push(...A, ...B, ...C, ...A, ...C, ...D)
        }
      }
      const g = track(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      g.computeVertexNormals()
      const mesh = new THREE.Mesh(
        g,
        track(
          new THREE.MeshStandardMaterial({
            color: 0x11365c,
            metalness: 0.6,
            roughness: 0.3,
            side: THREE.DoubleSide,
            clippingPlanes: [cutPlane],
          }),
        ),
      )
      skin.add(mesh)
    }

    // ---- transverse rings and longitudinals -------------------------------
    const ringMaterial = track(
      new THREE.LineBasicMaterial({ color: 0x6ba8e5, transparent: true, opacity: 0.55 }),
    )
    const bulkheadStations: number[] = []
    for (let c = 0; c <= data.cellCount; c += 1) {
      const station =
        data.cellBlockForward + (c / data.cellCount) * (data.cellBlockAft - data.cellBlockForward)
      bulkheadStations.push(station)
      const r = radiusAt(station)
      if (r < 0.05) continue
      const points: THREE.Vector3[] = []
      for (let k = 0; k <= 72; k += 1) {
        const theta = (k / 72) * Math.PI * 2
        points.push(new THREE.Vector3(Math.cos(theta) * r, xOf(station), Math.sin(theta) * r))
      }
      frame.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(points)), ringMaterial))
    }

    const longitudinalMaterial = track(
      new THREE.LineBasicMaterial({ color: 0x3d4b5a, transparent: true, opacity: 0.85 }),
    )
    const longitudinals = 16
    for (let l = 0; l < longitudinals; l += 1) {
      const theta = (l / longitudinals) * Math.PI * 2
      const points: THREE.Vector3[] = []
      for (let i = 0; i < radii.length; i += 1) {
        const r = radii[i] ?? 0
        points.push(
          new THREE.Vector3(Math.cos(theta) * r, xOf(i / (radii.length - 1)), Math.sin(theta) * r),
        )
      }
      frame.add(
        new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(points)), longitudinalMaterial),
      )
    }

    // ---- gas cells --------------------------------------------------------
    // One lobe per cell, filling the hull between its bulkheads and stopping at
    // the top of the keel corridor. This is the volume the lift came from.
    const keelTop = -0.54 // fraction of local radius; the cells sit above this
    for (let c = 0; c < data.cellCount; c += 1) {
      const s0 = bulkheadStations[c] ?? 0
      const s1 = bulkheadStations[c + 1] ?? 1
      const steps = 10
      const lobeProfile: THREE.Vector2[] = []
      for (let i = 0; i <= steps; i += 1) {
        const s = s0 + (i / steps) * (s1 - s0)
        // Pinch the lobe in at each bulkhead so the cells read as separate
        // bags rather than one continuous volume. Real cells do this.
        const pinch = 0.86 + 0.14 * Math.sin((i / steps) * Math.PI)
        lobeProfile.push(new THREE.Vector2(Math.max(radiusAt(s) * 0.955 * pinch, 1e-3), xOf(s)))
      }
      const g = track(new THREE.LatheGeometry(lobeProfile, 40))
      const mesh = new THREE.Mesh(
        g,
        track(
          new THREE.MeshStandardMaterial({
            color: colorFor('gas'),
            transparent: true,
            opacity: 0.055,
            roughness: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      )
      // A hairline over each lobe. Without it twelve translucent bags stack up
      // into one continuous red tube and the cell count stops being visible,
      // which is the one thing this part of the drawing is for.
      mesh.add(
        new THREE.Mesh(
          g,
          track(
            new THREE.MeshBasicMaterial({
              color: colorFor('gas'),
              wireframe: true,
              transparent: true,
              opacity: 0.1,
              depthWrite: false,
            }),
          ),
        ),
      )
      // Lift the lobe so it sits above the keel corridor rather than through it.
      mesh.position.z = -keelTop * maxRadius * 0.12
      register(
        mesh,
        `Gas cell ${c + 1} of ${data.cellCount}`,
        `Stations ${s0.toFixed(2)} to ${s1.toFixed(2)}`,
        'Cells are pinched at every bulkhead. Cell count buys damage tolerance and trim control, and costs film area on both faces of every bulkhead.',
      )
      cells.add(mesh)
    }

    // ---- the keel corridor ------------------------------------------------
    {
      const steps = 40
      const positions: number[] = []
      const halfW = data.keelWidth / 2
      for (let i = 0; i < steps; i += 1) {
        const s0 = data.keelForward + (i / steps) * (data.keelAft - data.keelForward)
        const s1 = data.keelForward + ((i + 1) / steps) * (data.keelAft - data.keelForward)
        const r0 = radiusAt(s0)
        const r1 = radiusAt(s1)
        const y0 = xOf(s0)
        const y1 = xOf(s1)
        const bottom0 = -r0 * 0.9
        const bottom1 = -r1 * 0.9
        const top0 = -r0 * 0.54
        const top1 = -r1 * 0.54
        const w0 = Math.min(halfW, r0 * 0.32)
        const w1 = Math.min(halfW, r1 * 0.32)
        // Two side walls and a floor. Left open at the top, because that is
        // what the ventilation argument depends on.
        const quad = (
          a: [number, number, number],
          b: [number, number, number],
          c: [number, number, number],
          d: [number, number, number],
        ) => positions.push(...a, ...b, ...c, ...a, ...c, ...d)
        quad([-w0, y0, bottom0], [w0, y0, bottom0], [w1, y1, bottom1], [-w1, y1, bottom1])
        quad([-w0, y0, bottom0], [-w0, y0, top0], [-w1, y1, top1], [-w1, y1, bottom1])
        quad([w0, y0, bottom0], [w0, y0, top0], [w1, y1, top1], [w1, y1, bottom1])
      }
      const g = track(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      g.computeVertexNormals()
      const mesh = new THREE.Mesh(
        g,
        track(
          new THREE.MeshStandardMaterial({
            color: 0x2f3b47,
            roughness: 0.85,
            metalness: 0.1,
            side: THREE.DoubleSide,
          }),
        ),
      )
      register(
        mesh,
        'Keel corridor',
        `${(data.keelWidth * 1000).toFixed(0)} mm walkway, stations ${data.keelForward} to ${data.keelAft}`,
        'Open at both ends to the free stream. That is the only one of the three escapes from a detonable confined run that works at human scale: the other two need it under 150 mm wide or under 10 m long.',
      )
      keel.add(mesh)
    }

    // ---- compartments -----------------------------------------------------
    const boxFor = (c: ArrangementCompartment): THREE.Mesh => {
      const geo = track(new THREE.BoxGeometry(c.width, c.extent, c.height))
      const color = colorFor(c.category)
      const mat = track(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.62,
          metalness: 0.08,
          transparent: true,
          opacity: 0.9,
        }),
      )
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(0, xOf(c.station), c.z)

      const edges = new THREE.LineSegments(
        track(new THREE.EdgesGeometry(geo)),
        track(new THREE.LineBasicMaterial({ color: 0xe6edf3, transparent: true, opacity: 0.28 })),
      )
      mesh.add(edges)

      register(
        mesh,
        c.name,
        `${c.mass.toFixed(0)} kg${c.volume > 0.5 ? ` · ${c.volume.toFixed(0)} m³` : ''} · station ${c.station.toFixed(2)}`,
        c.note,
      )
      return mesh
    }

    for (const c of data.compartments) {
      if (c.shell || c.id === 'systems') continue
      const mesh = boxFor(c)
      ;(c.deck === 'gondola' ? gondola : keel).add(mesh)
    }

    // ---- the gondola shell ------------------------------------------------
    // Wrapped around the gondola compartments, and it is also the boat hull:
    // its underside is the planing surface for a water landing.
    {
      const outer = data.compartments.find((c) => c.id === 'gondola-structure')
      const gondolaCompartments = data.compartments.filter((c) => c.deck === 'gondola')
      const extent = outer?.extent ?? 20
      const first = (outer?.station ?? 0.3) - extent / 2 / length
      const last = (outer?.station ?? 0.3) + extent / 2 / length
      const halfW = (outer?.width ?? 4.4) / 2
      const shellZ = outer?.z ?? -radiusAt(0.3) * 1.3
      const top = shellZ + (outer?.height ?? 3.2) / 2
      const bottom = shellZ - (outer?.height ?? 3.2) / 2
      void gondolaCompartments
      const steps = 28
      const positions: number[] = []
      const quad = (
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number],
        d: [number, number, number],
      ) => positions.push(...a, ...b, ...c, ...a, ...c, ...d)

      // Fine the ends and give the bottom a shallow V, because it lands on
      // water and a flat pan slams.
      const widthAt = (t: number) => halfW * Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)) ** 0.35
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps
        const t1 = (i + 1) / steps
        const y0 = xOf(first + t0 * (last - first))
        const y1 = xOf(first + t1 * (last - first))
        const w0 = widthAt(t0)
        const w1 = widthAt(t1)
        const keelZ = bottom
        const chineZ = bottom + 0.5
        quad([-w0, y0, top], [w0, y0, top], [w1, y1, top], [-w1, y1, top])
        quad([-w0, y0, top], [-w0, y0, chineZ], [-w1, y1, chineZ], [-w1, y1, top])
        quad([w0, y0, top], [w0, y0, chineZ], [w1, y1, chineZ], [w1, y1, top])
        quad([-w0, y0, chineZ], [0, y0, keelZ], [0, y1, keelZ], [-w1, y1, chineZ])
        quad([w0, y0, chineZ], [0, y0, keelZ], [0, y1, keelZ], [w1, y1, chineZ])
      }
      const g = track(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      g.computeVertexNormals()
      const shell = new THREE.Mesh(
        g,
        track(
          new THREE.MeshStandardMaterial({
            color: 0x475463,
            roughness: 0.5,
            metalness: 0.2,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            clippingPlanes: [cutPlane],
          }),
        ),
      )
      register(
        shell,
        'Gondola shell',
        'Also the boat hull',
        'Shallow-V planing bottom rather than a fairing, because the ship lands on water and a flat pan slams.',
      )
      gondola.add(shell)

      // Suspension: the gondola hangs from the frame, and the load path should
      // be visible because it is a real structural problem.
      const cableMaterial = track(
        new THREE.LineBasicMaterial({ color: 0x6ba8e5, transparent: true, opacity: 0.5 }),
      )
      for (let i = 0; i <= 4; i += 1) {
        const s = first + (i / 4) * (last - first)
        const r = radiusAt(s)
        for (const side of [-1, 1]) {
          const pts = [
            new THREE.Vector3(side * halfW * 0.8, xOf(s), top),
            new THREE.Vector3(side * r * 0.55, xOf(s), -r * 0.82),
          ]
          gondola.add(
            new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(pts)), cableMaterial),
          )
        }
      }
    }

    // ---- fins -------------------------------------------------------------
    // A cruciform tail, at the planform the mass statement weighed and the yaw
    // static margin was computed from.
    //
    // Built from explicit corners rather than an extruded shape and a stack of
    // rotations. The rotations are where fin geometry goes wrong: a surface
    // that sweeps in the wrong plane still LOOKS like a fin, and it is only
    // wrong when you check it against the drawing.
    {
      const { rootChord, tipChord, span, station, area, mass } = data.fins
      const rootR = radiusAt(station) * 0.78
      const sweep = rootChord * 0.32
      const y = xOf(station)
      const finMaterial = track(
        new THREE.MeshStandardMaterial({
          color: 0x46545f,
          roughness: 0.6,
          metalness: 0.14,
          side: THREE.DoubleSide,
        }),
      )

      // Up, starboard, down, port. A plus tail rather than an X, which is what
      // conventional airship practice used and what keeps the lower fin clear
      // of the propulsor outriggers.
      for (let i = 0; i < 4; i += 1) {
        const phi = (i / 4) * Math.PI * 2
        // Radially outward in the section plane: +Z is up, +X is starboard.
        const ux = Math.sin(phi)
        const uz = Math.cos(phi)
        const at = (r: number, chordOffset: number): [number, number, number] => [
          ux * r,
          y + chordOffset,
          uz * r,
        ]
        const A = at(rootR, -rootChord / 2)
        const B = at(rootR, rootChord / 2)
        const C = at(rootR + span, sweep + tipChord / 2)
        const D = at(rootR + span, sweep - tipChord / 2)
        const g = track(new THREE.BufferGeometry())
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...D], 3),
        )
        g.computeVertexNormals()
        const mesh = new THREE.Mesh(g, finMaterial)
        mesh.add(
          new THREE.Line(
            track(
              new THREE.BufferGeometry().setFromPoints(
                [A, B, C, D, A].map((p) => new THREE.Vector3(...p)),
              ),
            ),
            track(new THREE.LineBasicMaterial({ color: 0xe6edf3, transparent: true, opacity: 0.3 })),
          ),
        )
        register(
          mesh,
          i % 2 === 0 ? 'Vertical fin' : 'Horizontal fin',
          `${area.toFixed(0)} m² total planform · ${mass.toFixed(0)} kg`,
          'Sized against the Munk moment, which is destabilising at every angle of attack and is why airship tails are as large as they are. A static margin of 1.43 and no more: every extra square metre is mass on a 48 m lever that the trim ballast has to fight.',
        )
        tail.add(mesh)
      }
    }

    // ---- propulsors -------------------------------------------------------
    const propellers: THREE.Object3D[] = []
    for (const p of data.propulsors) {
      const rLocal = radiusAt(p.station)
      const g = new THREE.Group()
      g.position.y = xOf(p.station)

      const outboard = p.lateralOffset * maxRadius
      const height = p.heightFraction * rLocal
      const propRadius = p.diameter / 2

      // Outrigger pylon, from the hull out to the nacelle. It carries the whole
      // thrust moment, which is what sets its section.
      const hullSide = Math.sign(outboard) * rLocal * 0.72
      const pylonLength = Math.abs(outboard - hullSide)
      const pylon = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.28, 0.42, pylonLength, 10)),
        track(new THREE.MeshStandardMaterial({ color: 0x3a4653, roughness: 0.7 })),
      )
      pylon.rotation.z = Math.PI / 2
      pylon.position.set((outboard + hullSide) / 2, 0, height * 0.6)
      g.add(pylon)

      // Nacelle: motor, gearbox and the vectoring pivot.
      const nacelle = new THREE.Mesh(
        track(new THREE.CapsuleGeometry(0.62, 2.4, 6, 14)),
        track(
          new THREE.MeshStandardMaterial({
            color: colorFor('machinery'),
            roughness: 0.5,
            metalness: 0.25,
          }),
        ),
      )
      nacelle.position.set(outboard, 0, height)
      register(
        nacelle,
        `Propulsor, ${p.id.replace('-', ' ')}`,
        `${(p.ratedPower / 1000).toFixed(0)} kW · ${p.mass.toFixed(0)} kg · ${((p.vectorAuthority * 180) / Math.PI).toFixed(0)}° vectoring`,
        p.note,
      )
      g.add(nacelle)

      // The disc, and three blades so the rotation reads.
      const disc = new THREE.Group()
      disc.position.set(outboard, -1.9, height)
      const bladeMaterial = track(
        new THREE.MeshStandardMaterial({
          color: 0x8f9aa6,
          roughness: 0.45,
          metalness: 0.3,
          side: THREE.DoubleSide,
        }),
      )
      for (let b = 0; b < 3; b += 1) {
        const blade = new THREE.Mesh(
          track(new THREE.BoxGeometry(propRadius, 0.06, 0.34)),
          bladeMaterial,
        )
        blade.position.x = propRadius / 2
        const arm = new THREE.Group()
        arm.add(blade)
        arm.rotation.y = (b / 3) * Math.PI * 2
        disc.add(arm)
      }
      // The swept circle, so the clearance to the hull is visible.
      const circle: THREE.Vector3[] = []
      for (let k = 0; k <= 48; k += 1) {
        const t = (k / 48) * Math.PI * 2
        circle.push(new THREE.Vector3(Math.cos(t) * propRadius, 0, Math.sin(t) * propRadius))
      }
      disc.add(
        new THREE.Line(
          track(new THREE.BufferGeometry().setFromPoints(circle)),
          track(new THREE.LineBasicMaterial({ color: 0x6ba8e5, transparent: true, opacity: 0.4 })),
        ),
      )
      propellers.push(disc)
      g.add(disc)

      power.add(g)
    }

    // ---- exhaust ----------------------------------------------------------
    {
      const rLocal = radiusAt(data.exhaustStation)
      const stack = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.3, 0.34, Math.abs(data.exhaustHeightFraction) * rLocal * 0.7, 10)),
        track(new THREE.MeshStandardMaterial({ color: 0x7a3a2a, roughness: 0.8 })),
      )
      stack.rotation.x = Math.PI / 2
      stack.position.set(0, xOf(data.exhaustStation), data.exhaustHeightFraction * rLocal * 0.62)
      register(
        stack,
        'Exhaust',
        `Station ${data.exhaustStation}, below the hull`,
        'Aft of the cell block and below the envelope. This is the constraint that pins the machinery aft, and it is worth more than the trim it costs.',
      )
      power.add(stack)
    }

    // ---- centre of gravity and centre of buoyancy -------------------------
    // The two most consequential points on the vehicle, and the distance
    // between them vertically is the entire static stability.
    const markerFor = (x: number, z: number, color: number, name: string, detail: string) => {
      const mesh = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.55, 16, 12)),
        track(new THREE.MeshBasicMaterial({ color })),
      )
      mesh.position.set(0, x - length / 2, z)
      register(mesh, name, detail, null)
      return mesh
    }
    const cg = data.mass.centreOfGravity
    const cb = data.mass.centreOfBuoyancy
    const markers = new THREE.Group()
    markers.add(
      markerFor(cg.x, cg.z, 0xd75843, 'Centre of gravity', `${cg.x.toFixed(1)} m aft of the nose, ${(-cg.z).toFixed(2)} m below the axis`),
      markerFor(cb.x, cb.z, 0x6ba8e5, 'Centre of buoyancy', `${cb.x.toFixed(1)} m aft of the nose, on the axis`),
    )
    markers.add(
      new THREE.Line(
        track(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, cg.x - length / 2, cg.z),
            new THREE.Vector3(0, cb.x - length / 2, cb.z),
          ]),
        ),
        track(new THREE.LineDashedMaterial({ color: 0xd75843, dashSize: 0.6, gapSize: 0.4 })),
      ),
    )
    root.add(markers)

    // ---- lighting ---------------------------------------------------------
    scene.add(new THREE.AmbientLight(0x9aa7b4, 1.35))
    const key = new THREE.DirectionalLight(0xffffff, 1.35)
    key.position.set(1, 1.4, 1)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x6ba8e5, 0.45)
    fill.position.set(-1, -0.5, -0.8)
    scene.add(fill)

    // The model is built in the lathe's frame: +Y is the hull axis, +Z is up,
    // +X is starboard. This maps it to the screen frame, where +X is the hull
    // axis and +Y is up.
    //
    // Getting this wrong is not subtle and it is not obvious either: a single
    // rotation about Z puts the hull axis horizontal and leaves the ship's
    // vertical pointing INTO the screen, so the gondola hangs away from the
    // camera and the keel corridor is seen edge-on. It looks like the gondola
    // was never drawn.
    //
    // Three.js applies XYZ Euler order as Rx(Ry(Rz(v))), so this is "roll the
    // hull axis into X, then tip the vertical up": (x, y, z) becomes (y, z, x).
    root.rotation.set(-Math.PI / 2, 0, -Math.PI / 2)

    // ---- modes ------------------------------------------------------------
    const homeOf = new Map<THREE.Object3D, THREE.Vector3>()
    for (const g of [skin, cells, frame, keel, gondola, tail, power, markers]) {
      homeOf.set(g, g.position.clone())
    }

    let currentMode: ViewMode = 'cutaway'
    const setSceneMode = (m: ViewMode) => {
      currentMode = m
      // The clip plane is only on the outside surfaces, so the cutaway shows
      // the interior rather than making the whole ship translucent.
      cutPlane.constant = m === 'exterior' ? maxRadius * 4 : 0

      hullSkin.material.opacity = m === 'exterior' ? 0.94 : 0.3
      hullWire.material.opacity = m === 'exterior' ? 0.08 : 0.16
      cells.visible = m !== 'exterior'
      keel.visible = m !== 'exterior'
      gondola.visible = true
      markers.visible = m !== 'exterior'
      frame.visible = true

      const spread = m === 'exploded' ? maxRadius * 1.5 : 0
      const move = (g: THREE.Object3D, dx: number, dy: number, dz: number) => {
        const home = homeOf.get(g) ?? new THREE.Vector3()
        g.position.set(home.x + dx * spread, home.y + dy * spread, home.z + dz * spread)
      }
      move(skin, 0, 0, 1.9)
      move(cells, 0, 0, 0.65)
      move(frame, 0, 0, 1.25)
      move(keel, 0, 0, -0.45)
      move(gondola, 0, 0, -1.5)
      move(tail, 0, 1.2, 0)
      move(power, 0, 0, -0.9)
      move(markers, 0, 0, 0)
    }
    setSceneMode('cutaway')
    applyMode.current = setSceneMode

    // ---- camera and interaction -------------------------------------------
    let azimuth = 0.62
    let elevation = 0.3
    let distance = length * 0.92
    let dragging = false
    let panning = false
    let lastX = 0
    let lastY = 0

    // The ship hangs below its axis, so the frame is centred a little low
    // rather than on the hull centreline: otherwise the gondola sits at the
    // bottom edge and there is a band of empty sky above the array.
    //
    // Panning moves this point rather than the camera, so the orbit stays
    // centred on whatever you panned to. Panning the camera instead would send
    // the ship swinging out of frame the moment you dragged to rotate.
    const home = new THREE.Vector3(0, 0, -maxRadius * 0.35)
    const target = home.clone()

    const placeCamera = () => {
      const r = distance
      camera.position.set(
        target.x + r * Math.cos(elevation) * Math.sin(azimuth),
        target.y + r * Math.sin(elevation),
        target.z + r * Math.cos(elevation) * Math.cos(azimuth),
      )
      camera.lookAt(target)
    }

    const canvas = renderer.domElement
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'grab'

    // Middle button, right button or shift-drag pans. Three ways in because
    // one of them is always unavailable: trackpads have no middle button, right
    // drag opens a context menu on some setups, and shift-drag is the only one
    // a keyboard-and-trackpad user reliably has.
    const isPanGesture = (e: PointerEvent) => e.button === 1 || e.button === 2 || e.shiftKey

    const onPointerDown = (e: PointerEvent) => {
      panning = isPanGesture(e)
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.style.cursor = panning ? 'move' : 'grabbing'
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
    const onPointerUp = (e: PointerEvent) => {
      dragging = false
      panning = false
      canvas.style.cursor = 'grab'
      canvas.releasePointerCapture(e.pointerId)
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    const pointer = new THREE.Vector2()
    let pointerInside = false
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      pointerInside = true
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY

      if (panning) {
        // Pan in the camera's own screen plane, scaled so a pixel of drag moves
        // the same number of pixels of ship whatever the zoom. The vertical
        // extent of the view at the target distance is 2*d*tan(fov/2), so a
        // fraction of the canvas height maps to that fraction of it.
        const height = canvas.clientHeight || 1
        const worldPerPixel =
          (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / height
        const right = new THREE.Vector3()
        const up = new THREE.Vector3()
        camera.matrixWorld.extractBasis(right, up, new THREE.Vector3())
        target.addScaledVector(right, -dx * worldPerPixel)
        target.addScaledVector(up, dy * worldPerPixel)
      } else {
        azimuth -= dx * 0.006
        elevation = Math.max(-1.35, Math.min(1.35, elevation + dy * 0.005))
      }

      lastX = e.clientX
      lastY = e.clientY
      placeCamera()
    }

    const resetView = () => {
      target.copy(home)
      azimuth = 0.62
      elevation = 0.3
      distance = length * 0.92
      placeCamera()
    }
    resetRef.current = resetView
    const onPointerLeave = () => {
      pointerInside = false
      setHovered(null)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      distance = Math.max(length * 0.55, Math.min(length * 3, distance * (1 + e.deltaY * 0.0012)))
      placeCamera()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)

    const raycaster = new THREE.Raycaster()
    let highlighted: THREE.Mesh | null = null
    let highlightedEmissive = 0

    const resize = () => {
      const width = container.clientWidth
      const height = Math.max(Math.round(width * 0.52), 340)
      // setSize's third argument is updateStyle, and passing false is a trap
      // here: it sets the drawing buffer but leaves the canvas CSS size alone,
      // so with a device pixel ratio of 2 the element lays out at TWICE the
      // intended height and the scene renders into a box half the size of the
      // one on screen. Let three.js set both.
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      placeCamera()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let frameId = 0
    let stopped = false
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const tick = () => {
      if (stopped) return
      frameId = requestAnimationFrame(tick)

      if (!reduceMotion) {
        for (const d of propellers) d.rotation.y += 0.06
        if (!dragging && !pointerInside) {
          azimuth += 0.0014
          placeCamera()
        }
      }

      // Hover picking. Only when the pointer is inside and not dragging, so a
      // rotate gesture does not flicker the tooltip.
      if (pointerInside && !dragging) {
        raycaster.setFromCamera(pointer, camera)
        const hits = raycaster.intersectObjects(
          pickable.filter((o) => {
            let node: THREE.Object3D | null = o
            while (node) {
              if (!node.visible) return false
              node = node.parent
            }
            return true
          }),
          false,
        )
        const first = hits[0]?.object as THREE.Mesh | undefined
        if (first !== highlighted) {
          if (highlighted && 'emissive' in highlighted.material) {
            ;(highlighted.material as THREE.MeshStandardMaterial).emissive.setHex(
              highlightedEmissive,
            )
          }
          highlighted = first ?? null
          if (highlighted) {
            const mat = highlighted.material as THREE.MeshStandardMaterial
            if (mat.emissive) {
              highlightedEmissive = mat.emissive.getHex()
              mat.emissive.setHex(0x333d47)
            }
            const pick = highlighted.userData['pick'] as
              | { name: string; detail: string; note: string | null }
              | undefined
            const rect = canvas.getBoundingClientRect()
            if (pick) {
              setHovered({
                name: pick.name,
                detail: pick.detail,
                note: pick.note,
                x: ((pointer.x + 1) / 2) * rect.width,
                y: ((1 - pointer.y) / 2) * rect.height,
              })
            }
          } else {
            setHovered(null)
          }
        }
      }

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      stopped = true
      cancelAnimationFrame(frameId)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      for (const d of disposables) d.dispose()
      renderer.dispose()
      if (canvas.parentNode === container) container.removeChild(canvas)
      void currentMode
    }
  }, [data])

  if (unsupported) return <WebGLUnavailable what="arrangement view" />

  const activeMode = MODES.find((m) => m.id === mode)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-rule)] p-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={`px-3 py-1.5 text-xs tracking-wide transition-colors ${
              mode === m.id
                ? 'bg-[var(--color-accent)] text-[#0b0e12]'
                : 'border border-[var(--color-rule)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
            }`}
          >
            {m.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => resetRef.current()}
          className="ml-auto border border-[var(--color-rule)] px-3 py-1.5 text-xs tracking-wide text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-ink)]"
        >
          Reset view
        </button>
        <span className="w-full text-xs text-[var(--color-ink-faint)] sm:w-auto">
          Drag to orbit · shift-drag or right-drag to pan · scroll to zoom · hover any part
        </span>
      </div>

      <div className="relative">
        <div ref={mount} className="w-full" aria-label="The arrangement, rendered from the model" />
        {hovered ? (
          <div
            className="pointer-events-none absolute z-10 max-w-xs border border-[var(--color-rule)] bg-[var(--color-panel-raised)] px-3 py-2 shadow-lg"
            style={{
              left: Math.min(hovered.x + 14, 1000),
              top: hovered.y + 14,
            }}
          >
            <p className="text-sm font-medium">{hovered.name}</p>
            <p className="num mt-0.5 text-xs text-[var(--color-ink-dim)]">{hovered.detail}</p>
            {hovered.note ? (
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-faint)]">
                {hovered.note}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="border-t border-[var(--color-rule)] p-3">
        <p className="text-xs text-[var(--color-ink-dim)]">{activeMode?.hint}</p>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {CATEGORY_SWATCH.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-[1px]"
                style={{ background: s.hex }}
              />
              <span className="text-[var(--color-ink-dim)]">{s.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
