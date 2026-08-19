import * as THREE from 'three'

import { shipGeometries, shipGeometryFor } from '../../lib/model'

/**
 * ONE VEHICLE, BUILT FROM THE MODEL, IN EVERY CONFIGURATION IT HAS.
 *
 * WHAT THIS REPLACED, TWICE. First, four viewers each building their own
 * airship out of primitives, disagreeing with each other and with the solver:
 * a cruciform drawn as a 0.3 m slab at a station the model does not use, no
 * propulsors at all on a vehicle whose landing case is decided by four of them,
 * a gondola placed beside the hull rather than under it.
 *
 * Then a version that fixed the shapes but still drew ONE ship. It read the
 * baseline-only bridge, so the 65 m minimum-viable point and the 125 m stretch
 * rendered as the same 118 m vehicle, and it had no wings, no centreboard, no
 * movable control surfaces, and propulsors that could not tilt on a design
 * whose whole ground-handling argument is that they do.
 *
 * This one takes a geometry from `shipGeometries`, which exists per design
 * point, and a CONFIGURATION STATE: cruising, hovering, or afloat. Nothing here
 * decides a dimension. Every station, chord, span, diameter, tilt limit and the
 * waterline itself comes from the model.
 *
 * BODY FRAME, and it is the solver's: +X forward out of the nose, +Y up, +Z to
 * starboard. Lathes revolve about Y, so the hull is rotated once on
 * construction and everything downstream is in the frame the physics uses.
 */

export type ShipGeometry = (typeof shipGeometries)[number]

/**
 * What the vehicle is doing, which changes its shape.
 *
 * `cruise`   propulsors horizontal, centreboard retracted, wings clean.
 * `hover`    propulsors vectored to their own authority for landing or holding.
 * `afloat`   on the water: board down, propulsors vectored for manoeuvring,
 *            hull sitting at the draft the flotation state computes.
 */
export type ShipMode = 'cruise' | 'hover' | 'afloat'

/** @derived Station 0 is the nose and 1 the tail; origin amidships. */
export const xAtStation = (station: number, length: number): number =>
  length / 2 - station * length

/** Hull radius at a station, interpolated from the profile the model publishes. */
export const radiusAt = (geometry: ShipGeometry, station: number): number => {
  const radii = geometry.radii
  const clamped = Math.min(Math.max(station, 0), 1)
  const position = clamped * (radii.length - 1)
  const lower = Math.floor(position)
  const upper = Math.min(lower + 1, radii.length - 1)
  const fraction = position - lower
  return (radii[lower] ?? 0) * (1 - fraction) + (radii[upper] ?? 0) * fraction
}

/**
 * Half-thickness of a symmetric NACA four-digit section, as a fraction of chord.
 *
 * @source NACA Report 460 thickness distribution. Surfaces are drawn with a
 * section rather than as flat plates because a control surface with no
 * thickness has nowhere to put a hinge, and because the flat plates are what
 * made the first version read as a placeholder.
 */
const sectionHalfThickness = (u: number, thickness: number): number =>
  5 *
  thickness *
  (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4)

/** @source Airship fin section, thick enough to carry its own spar. */
export const FIN_THICKNESS_RATIO = 0.12

export const finHalfThickness = (chordFraction: number, chord: number): number =>
  sectionHalfThickness(chordFraction, FIN_THICKNESS_RATIO) * chord

/**
 * @derived Trailing edges are aligned, so the sweep is whatever the taper
 * leaves. There is no independent sweep parameter, which is the point: a
 * separate one is a number nothing sources and nothing checks.
 */
export const finLeadingEdgeSweep = (rootChord: number, tipChord: number): number =>
  rootChord - tipChord

export const FIN_SECTION_POINTS = 24

/**
 * A tapered lifting surface, lofted between a root and a tip section.
 *
 * Built in its own frame: span along +Y, chord along +X with the trailing edge
 * at x = 0, thickness on Z. The caller rotates and places it, which is what
 * lets one function serve fins, rudders, wings and the centreboard.
 */
const surfaceGeometry = (
  rootChord: number,
  tipChord: number,
  span: number,
  rootOffset: number,
  thicknessRatio: number,
  chordStart = 0,
  chordEnd = 1,
): THREE.BufferGeometry => {
  const positions: number[] = []
  const indices: number[] = []

  const ring = (chord: number, y: number, sweep: number) => {
    const start = positions.length / 3
    for (let i = 0; i < FIN_SECTION_POINTS; i += 1) {
      const angle = (i / FIN_SECTION_POINTS) * Math.PI * 2
      // Cosine spacing over the REQUESTED chord slice, so a rudder cut from the
      // aft 30 percent keeps the section's real thickness at its hinge.
      const local = (1 - Math.cos(angle)) / 2
      const u = chordStart + local * (chordEnd - chordStart)
      const sign = angle <= Math.PI ? 1 : -1
      const half = sectionHalfThickness(u, thicknessRatio) * chord
      positions.push(sweep + chord * (1 - u), y, sign * half)
    }
    return start
  }

  const sweep = finLeadingEdgeSweep(rootChord, tipChord)
  const root = ring(rootChord, rootOffset, 0)
  const tip = ring(tipChord, rootOffset + span, sweep)

  for (let i = 0; i < FIN_SECTION_POINTS; i += 1) {
    const next = (i + 1) % FIN_SECTION_POINTS
    indices.push(root + i, tip + i, root + next)
    indices.push(root + next, tip + i, tip + next)
  }

  // Cap both ends so the surface is a closed solid rather than a shell.
  const capTip = positions.length / 3
  positions.push(sweep + tipChord / 2, rootOffset + span, 0)
  for (let i = 0; i < FIN_SECTION_POINTS; i += 1) {
    indices.push(capTip, tip + i, tip + ((i + 1) % FIN_SECTION_POINTS))
  }
  const capRoot = positions.length / 3
  positions.push(rootChord / 2, rootOffset, 0)
  for (let i = 0; i < FIN_SECTION_POINTS; i += 1) {
    indices.push(capRoot, root + ((i + 1) % FIN_SECTION_POINTS), root + i)
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

export interface ShipMaterials {
  readonly cover: THREE.Material
  readonly structure: THREE.Material
  readonly accent: THREE.Material
  readonly glass: THREE.Material
  readonly immersed: THREE.Material
}

export const defaultMaterials = (): ShipMaterials => ({
  cover: new THREE.MeshStandardMaterial({ color: 0x39434f, metalness: 0.05, roughness: 0.85 }),
  // Lighter than the cover, not darker. Hard structure hanging off a fabric
  // envelope; a fin painted darker reads as a hole in the silhouette.
  structure: new THREE.MeshStandardMaterial({ color: 0x4a5765, metalness: 0.25, roughness: 0.6 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x6b8299, metalness: 0.35, roughness: 0.45 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x8fc7ff,
    emissive: 0x27506f,
    metalness: 0.1,
    roughness: 0.25,
  }),
  immersed: new THREE.MeshStandardMaterial({ color: 0x2f6f8f, metalness: 0.3, roughness: 0.5 }),
})

export interface ShipOptions {
  readonly geometry?: ShipGeometry
  readonly designId?: string
  readonly mode?: ShipMode
  /**
   * Propulsor tilt, radians above horizontal. Clamped per unit to that unit's
   * own `vectorAuthority`, which is how the mid pair reaches vertical and the
   * aft pair does not.
   */
  readonly vectorAngle?: number
  /** Rudder deflection, radians, positive to starboard. */
  readonly rudder?: number
  /** Elevator deflection, radians, positive trailing edge down. */
  readonly elevator?: number
  readonly hullSegments?: number
  readonly rings?: boolean
  readonly wireframe?: boolean
  readonly hull?: boolean
  readonly fins?: boolean
  readonly propulsors?: boolean
  readonly car?: boolean
  readonly wings?: boolean
  readonly centreboard?: boolean
  readonly materials?: ShipMaterials
}

export interface BuiltShip {
  readonly group: THREE.Group
  readonly geometry: ShipGeometry
  readonly length: number
  readonly maxRadius: number
  /**
   * Height of the hull axis above the waterline in `afloat` mode, so a scene
   * can put its water plane at y = 0 and drop the ship onto it.
   */
  readonly waterlineOffset: number
  /** Propulsor pivots, so a scene can animate tilt without rebuilding. */
  readonly propulsorPivots: readonly THREE.Object3D[]
  /** Control surface pivots: rudders first, then elevators. */
  readonly rudderPivots: readonly THREE.Object3D[]
  readonly elevatorPivots: readonly THREE.Object3D[]
  readonly dispose: () => void
}

export const buildShip = (options: ShipOptions = {}): BuiltShip => {
  const geometry =
    options.geometry ?? (options.designId ? shipGeometryFor(options.designId) : shipGeometries[0]!)
  const { length, maxRadius, cellCount, fins, propulsors, wing, centreboard, gondola, flotation } =
    geometry

  const mode: ShipMode = options.mode ?? 'cruise'
  const segments = options.hullSegments ?? 64
  const materials = options.materials ?? defaultMaterials()
  const disposables: { dispose: () => void }[] = []
  const group = new THREE.Group()
  const propulsorPivots: THREE.Object3D[] = []
  const rudderPivots: THREE.Object3D[] = []
  const elevatorPivots: THREE.Object3D[] = []

  const drawHull = options.hull ?? true

  // ---- hull ---------------------------------------------------------------
  const profile = geometry.radii.map((r, i, all) => {
    const station = i / (all.length - 1)
    return new THREE.Vector2(Math.max(r, 1e-4), station * length - length / 2)
  })
  const hullGeometry = new THREE.LatheGeometry(profile, segments)
  // Lathes revolve about Y with the profile running nose to tail up +Y. A
  // quarter turn about Z maps that to nose at +X and radial to +Y.
  //
  // THE SIGN MATTERS and is easy to get backwards: -PI/2 also produces a
  // plausible airship, but a MIRRORED one, with the fins at the nose and the
  // car on top. It shows up as bulkhead rings floating outside the skin.
  hullGeometry.rotateZ(Math.PI / 2)
  disposables.push(hullGeometry)
  if (drawHull) group.add(new THREE.Mesh(hullGeometry, materials.cover))

  if (drawHull && options.wireframe) {
    const wire = new THREE.MeshBasicMaterial({
      color: 0x5b6b7d,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
    })
    disposables.push(wire)
    group.add(new THREE.Mesh(hullGeometry, wire))
  }

  if (drawHull && (options.rings ?? true)) {
    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0x6ba8e5,
      transparent: true,
      opacity: 0.42,
    })
    disposables.push(ringMaterial)
    for (let cell = 1; cell < cellCount; cell += 1) {
      const station = cell / cellCount
      const r = radiusAt(geometry, station)
      const x = xAtStation(station, length)
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= segments; i += 1) {
        const t = (i / segments) * Math.PI * 2
        points.push(new THREE.Vector3(x, Math.cos(t) * r, Math.sin(t) * r))
      }
      const ringGeometry = new THREE.BufferGeometry().setFromPoints(points)
      disposables.push(ringGeometry)
      group.add(new THREE.Line(ringGeometry, ringMaterial))
    }
  }

  // ---- cruciform tail, with SEPARATE movable surfaces ----------------------
  // The fins were moulded solid, so a vehicle whose yaw authority is the whole
  // argument for its tail had no visible rudder. The aft `controlChordFraction`
  // of each surface is a control surface hinged on its own axis.
  if (options.fins ?? true) {
    const fixedFraction = 1 - fins.controlChordFraction
    const rootRadius = radiusAt(geometry, fins.station) * 0.94
    const trailingEdgeX = xAtStation(fins.station, length) - fins.rootChord / 2

    const fixed = surfaceGeometry(
      fins.rootChord,
      fins.tipChord,
      fins.span,
      rootRadius,
      FIN_THICKNESS_RATIO,
      0,
      fixedFraction,
    )
    disposables.push(fixed)

    // The movable part is built about its HINGE so it rotates correctly: the
    // hinge is the leading edge of the control surface, at fixedFraction of
    // the chord back from the leading edge of the whole fin.
    const control = surfaceGeometry(
      fins.rootChord,
      fins.tipChord,
      fins.span,
      rootRadius,
      FIN_THICKNESS_RATIO,
      fixedFraction,
      1,
    )
    control.translate(-fins.rootChord * (1 - fixedFraction), 0, 0)
    disposables.push(control)

    for (let i = 0; i < 4; i += 1) {
      // Cruciform: up, starboard, down, port. Rotating about X keeps every
      // section in the plane of the flow.
      const roll = (i * Math.PI) / 2
      const panel = new THREE.Group()
      panel.rotation.x = roll
      panel.position.x = trailingEdgeX

      panel.add(new THREE.Mesh(fixed, materials.structure))

      const hinge = new THREE.Group()
      hinge.position.x = fins.rootChord * (1 - fixedFraction)
      const surface = new THREE.Mesh(control, materials.accent)
      hinge.add(surface)
      panel.add(hinge)

      // Vertical surfaces are rudders, horizontal are elevators.
      if (i % 2 === 0) rudderPivots.push(hinge)
      else elevatorPivots.push(hinge)

      group.add(panel)
    }

    for (const h of rudderPivots) h.rotation.y = options.rudder ?? 0
    for (const h of elevatorPivots) h.rotation.y = options.elevator ?? 0
  }

  // ---- outboard wings, which were missing entirely ------------------------
  // The arrangement carries them and the mass statement weighs them. They are
  // the surfaces that carry WEIGHT rather than buy efficiency, so leaving them
  // out of every drawing hid one of the four things that make this vehicle
  // unlike a conventional airship.
  if ((options.wings ?? true) && wing.area > 0 && wing.span > 0) {
    /** @derived Straight taper, matching the fin convention. */
    const TAPER = 0.5
    const hullWidth = 2 * radiusAt(geometry, wing.station)
    const exposedSemiSpan = Math.max((wing.span - hullWidth) / 2, 0)
    if (exposedSemiSpan > 0) {
      const meanChord = wing.area / wing.span
      const rootChord = (2 * meanChord) / (1 + TAPER)
      const wingGeom = surfaceGeometry(
        rootChord,
        rootChord * TAPER,
        exposedSemiSpan,
        hullWidth / 2,
        FIN_THICKNESS_RATIO,
      )
      disposables.push(wingGeom)
      const x = xAtStation(wing.station, length) - rootChord / 2
      for (const side of [1, -1]) {
        const panel = new THREE.Mesh(wingGeom, materials.structure)
        panel.position.x = x
        // Span runs along +Y in the surface's own frame; roll it into the
        // horizontal plane, one panel each way.
        panel.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2
        group.add(panel)
      }
    }
  }

  // ---- propulsors, which now actually rotate ------------------------------
  if (options.propulsors ?? true) {
    for (const p of propulsors) {
      const unit = new THREE.Group()
      const radius = p.diameter / 2
      const nacelleLength = p.diameter * 0.55

      // A pivot the nacelle hangs from, so tilt happens about the pylon axis
      // rather than about the model origin.
      const pivot = new THREE.Group()

      const nacelle = new THREE.CapsuleGeometry(radius * 0.28, nacelleLength, 4, 16)
      nacelle.rotateZ(Math.PI / 2)
      disposables.push(nacelle)
      pivot.add(new THREE.Mesh(nacelle, materials.structure))

      if (p.ducted) {
        const duct = new THREE.CylinderGeometry(
          radius * 1.08,
          radius * 1.02,
          nacelleLength * 1.2,
          28,
          1,
          true,
        )
        duct.rotateZ(Math.PI / 2)
        disposables.push(duct)
        const mesh = new THREE.Mesh(duct, materials.accent)
        mesh.material.side = THREE.DoubleSide
        pivot.add(mesh)
      }

      /** @derived Four blades, which is what the arrangement's units carry. */
      const BLADES = 4
      const blade = new THREE.BoxGeometry(radius * 0.12, radius * 0.92, radius * 0.02)
      blade.translate(0, radius * 0.5, 0)
      disposables.push(blade)
      for (let b = 0; b < BLADES; b += 1) {
        const mesh = new THREE.Mesh(blade, materials.accent)
        mesh.rotation.x = (b / BLADES) * Math.PI * 2
        mesh.rotation.z = 0.28
        pivot.add(mesh)
      }

      // TILT, CLAMPED TO THIS UNIT'S OWN AUTHORITY. The mid pair reaches
      // vertical and the aft pair reaches sixty degrees, and that difference is
      // in the model because it is what the arrangement decided. A drawing that
      // tilts all four the same amount is asserting something the model denies.
      const requested =
        options.vectorAngle ?? (mode === 'hover' ? Math.PI / 2 : mode === 'afloat' ? 0 : 0)
      pivot.rotation.z = Math.min(Math.abs(requested), p.vectorAuthority) * Math.sign(requested || 1)
      propulsorPivots.push(pivot)

      const hullRadius = radiusAt(geometry, p.station)
      const y = p.heightFraction * hullRadius
      const z = p.lateralOffset * maxRadius
      unit.position.set(xAtStation(p.station, length), y, z)

      // A pylon back to the hull, because a propulsor floating in space beside
      // the envelope was one of the things that made these read as placeholders.
      const standoff = Math.hypot(y, z) - hullRadius * 0.9
      if (standoff > 0) {
        const pylon = new THREE.BoxGeometry(radius * 0.5, standoff, radius * 0.12)
        disposables.push(pylon)
        const mesh = new THREE.Mesh(pylon, materials.structure)
        const inward = new THREE.Vector3(0, -y, -z).normalize()
        mesh.position.set(0, (inward.y * standoff) / 2, (inward.z * standoff) / 2)
        mesh.rotation.x = -Math.atan2(z, y)
        unit.add(mesh)
      }

      unit.add(pivot)
      group.add(unit)
    }
  }

  // ---- the gondola, at the compartment's own dimensions -------------------
  if ((options.car ?? true) && gondola) {
    const carGeom = new THREE.BoxGeometry(gondola.extent, gondola.height, gondola.width)
    disposables.push(carGeom)
    const car = new THREE.Mesh(carGeom, materials.structure)
    car.position.set(
      xAtStation(gondola.station, length),
      -radiusAt(geometry, gondola.station) - gondola.height * 0.42,
      0,
    )
    group.add(car)

    // A window strip. The one detail that makes the scale readable: it says a
    // person stands here, on a hull long enough that nothing else gives the eye
    // a size.
    const windows = new THREE.BoxGeometry(
      gondola.extent * 0.9,
      gondola.height * 0.34,
      gondola.width * 1.02,
    )
    disposables.push(windows)
    const glass = new THREE.Mesh(windows, materials.glass)
    glass.position.copy(car.position)
    glass.position.y += gondola.height * 0.14
    group.add(glass)

  }

  // ---- centreboard, deployed only on the water ---------------------------
  // THE PART THAT DECIDES WHETHER BOAT MODE EXISTS, and it had never been
  // drawn. Retracted it lives in a trunk inside the gondola; deployed it is by
  // far the deepest thing on the vehicle, and that is the operational point:
  // the ship draws centimetres and the board draws metres.
  //
  // It is deliberately NOT inside the gondola block. The marine view draws its
  // own animated gondola and switches the shared one off, and the first version
  // of this scoped the board with the car, so the one view whose entire subject
  // is boat mode was the one view with no centreboard in it.
  if ((options.centreboard ?? true) && centreboard.area > 0) {
    const boardGeom = surfaceGeometry(
      centreboard.rootChord,
      centreboard.tipChord,
      centreboard.span,
      0,
      centreboard.rootThickness / centreboard.rootChord,
    )
    disposables.push(boardGeom)
    const board = new THREE.Mesh(boardGeom, materials.immersed)
    // Span runs +Y in the surface frame; point it DOWN.
    board.rotation.z = Math.PI
    const keelY = gondola
      ? -radiusAt(geometry, gondola.station) - gondola.height * 0.42 - gondola.height / 2
      : -radiusAt(geometry, centreboard.station)
    board.position.set(
      xAtStation(centreboard.station, length) + centreboard.rootChord / 2,
      keelY,
      0,
    )
    board.visible = mode === 'afloat'
    group.add(board)
  }

  // Where the waterline sits relative to the hull axis, so a scene can place
  // its water at y = 0. The gondola bottom is immersed by the computed draft,
  // which is centimetres: a buoyant vehicle rests on its residual heaviness,
  // not its weight.
  const gondolaBottom = gondola
    ? -radiusAt(geometry, gondola.station) - gondola.height * 0.42 - gondola.height / 2
    : -maxRadius
  const waterlineOffset = -(gondolaBottom + flotation.draft)

  return {
    group,
    geometry,
    length,
    maxRadius,
    waterlineOffset,
    propulsorPivots,
    rudderPivots,
    elevatorPivots,
    dispose: () => {
      for (const d of disposables) d.dispose()
      for (const m of Object.values(materials)) m.dispose()
    },
  }
}
