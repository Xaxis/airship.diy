import * as THREE from 'three'

import { arrangement } from '../../lib/model'

/**
 * ONE SHIP, BUILT ONCE, FROM THE MODEL.
 *
 * Every viewer in this app used to build its own airship out of primitives, and
 * they disagreed with each other and with the solver. The flight simulator drew
 * its cruciform as a 0.3 m slab of `BoxGeometry` whose span was `sqrt(area/4) *
 * 1.4` and whose station was `0.36` of the length, against a model that says
 * the fins sit at 0.9 with a root chord of 0.16 L and a taper ratio of 0.5. It
 * drew no propulsors at all, on a vehicle whose landing case is decided by
 * four of them. The marine view drew a different ship again.
 *
 * That is the same class of defect as a number appearing twice in prose: if the
 * picture and the mass statement disagree, one of them is lying and it does not
 * matter which. So the geometry is derived here, once, from the arrangement
 * bridge, and the viewers only choose what to show and how to light it.
 *
 * BODY FRAME, and it is the solver's: +X forward out of the nose, +Y up, +Z to
 * starboard. Lathes revolve about Y, so the hull buffer is rotated once on
 * construction and everything downstream is in the frame the physics uses. The
 * viewers that want a different orientation rotate the group they are handed.
 */

/** @derived Station 0 is the nose and 1 the tail; this puts the origin amidships. */
export const xAtStation = (station: number, length: number): number => length / 2 - station * length

/** Hull radius at a station, interpolated from the profile the model publishes. */
export const radiusAtStation = (station: number): number => {
  const radii = arrangement.radii
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
 * @source NACA Report 460, the four-digit thickness distribution. The fins are
 * drawn with a section rather than as a flat plate because the flat plate is
 * what made the old drawing read as a placeholder, and because a control
 * surface with no thickness has nowhere to put a hinge.
 */
const sectionHalfThickness = (u: number, thickness: number): number =>
  5 *
  thickness *
  (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4)

/** @source Typical airship fin section, thick enough to carry its own spar. */
export const FIN_THICKNESS_RATIO = 0.12

/**
 * Half-thickness of the fin section at a fraction of chord, in metres.
 *
 * Exported so the cutaway builds the SAME fin as the flight and marine views.
 * It used to build its own, with a leading-edge sweep of 0.32 root chords
 * against this module's 0.5, which is two different tails for one set of
 * numbers in the mass statement.
 */
export const finHalfThickness = (chordFraction: number, chord: number): number =>
  sectionHalfThickness(chordFraction, FIN_THICKNESS_RATIO) * chord

/**
 * Leading-edge sweep of the fin, in metres.
 *
 * @derived The trailing edges are aligned, so the sweep is whatever the taper
 * leaves: root chord minus tip chord. There is no independent sweep parameter,
 * which is the point. A separate one is a number nothing sources and nothing
 * checks, and this repository had one.
 */
export const finLeadingEdgeSweep = (rootChord: number, tipChord: number): number =>
  rootChord - tipChord

/** Points around one fin section, exported so both builders step it the same. */
export const FIN_SECTION_POINTS = 24
/**
 * One tapered fin, lofted between a root section on the hull surface and a tip
 * section at the span the model gives.
 *
 * Trailing edges are aligned and the leading edge is swept aft by the taper,
 * which is how airship cruciforms are actually built: the sweep falls out of the
 * taper rather than being a separate parameter, so there is nothing here that
 * the model does not already say.
 */
const finGeometry = (
  rootChord: number,
  tipChord: number,
  span: number,
  rootRadius: number,
  trailingEdgeX: number,
): THREE.BufferGeometry => {
  const positions: number[] = []
  const indices: number[] = []

  const ring = (chord: number, y: number) => {
    const start = positions.length / 3
    for (let i = 0; i < FIN_SECTION_POINTS; i += 1) {
      // Around the section: down the upper surface from the leading edge, then
      // back along the lower. The section closes on itself at the trailing edge.
      const angle = (i / FIN_SECTION_POINTS) * Math.PI * 2
      const u = (1 - Math.cos(angle)) / 2
      const sign = angle <= Math.PI ? 1 : -1
      const halfThickness = sectionHalfThickness(u, FIN_THICKNESS_RATIO) * chord
      positions.push(trailingEdgeX + chord * (1 - u), y, sign * halfThickness)
    }
    return start
  }

  const root = ring(rootChord, rootRadius)
  const tip = ring(tipChord, rootRadius + span)

  for (let i = 0; i < FIN_SECTION_POINTS; i += 1) {
    const next = (i + 1) % FIN_SECTION_POINTS
    indices.push(root + i, tip + i, root + next)
    indices.push(root + next, tip + i, tip + next)
  }

  // Cap the tip so the fin is a closed solid rather than a shell.
  const capCentre = positions.length / 3
  positions.push(trailingEdgeX + tipChord / 2, rootRadius + span, 0)
  for (let i = 0; i < FIN_SECTION_POINTS; i += 1) {
    indices.push(capCentre, tip + i, tip + ((i + 1) % FIN_SECTION_POINTS))
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export interface ShipMaterials {
  readonly cover: THREE.Material
  readonly structure: THREE.Material
  readonly accent: THREE.Material
}

export const defaultMaterials = (): ShipMaterials => ({
  cover: new THREE.MeshStandardMaterial({ color: 0x39434f, metalness: 0.05, roughness: 0.85 }),
  // Lighter than the cover, not darker. The tail and the propulsors are hard
  // structure hanging off a fabric envelope, and a fin painted darker than the
  // hull reads as a hole in the silhouette rather than as a surface.
  structure: new THREE.MeshStandardMaterial({ color: 0x4a5765, metalness: 0.25, roughness: 0.6 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x4d5f73, metalness: 0.35, roughness: 0.5 }),
})

export interface ShipOptions {
  /** Radial segments on the hull lathe. Lower it for the simulators. */
  readonly hullSegments?: number
  /** Draw the gas cell bulkhead rings. */
  readonly rings?: boolean
  /** Draw the hull as a wireframe over the skin. */
  readonly wireframe?: boolean
  /** Draw the hull itself. The dedicated hull view draws its own, with framing. */
  readonly hull?: boolean
  /** Draw the cruciform tail. */
  readonly fins?: boolean
  /** Draw the propulsor units. */
  readonly propulsors?: boolean
  /**
   * Draw the car. The marine view animates its own, because the whole subject
   * there is the car meeting the water while the hull stays above it.
   */
  readonly car?: boolean
  readonly materials?: ShipMaterials
}

export interface BuiltShip {
  readonly group: THREE.Group
  readonly length: number
  readonly maxRadius: number
  /** Everything allocated, so a viewer can dispose without walking the tree. */
  readonly dispose: () => void
}

/**
 * The whole vehicle, in the body frame, at the model's own dimensions.
 */
export const buildShip = (options: ShipOptions = {}): BuiltShip => {
  const { length, maxRadius, cellCount, fins, propulsors } = arrangement
  const segments = options.hullSegments ?? 64
  const materials = options.materials ?? defaultMaterials()
  const disposables: { dispose: () => void }[] = []

  const group = new THREE.Group()

  // ---- hull ---------------------------------------------------------------
  const profile = arrangement.radii.map((r, i, all) => {
    const station = i / (all.length - 1)
    return new THREE.Vector2(Math.max(r, 1e-4), station * length - length / 2)
  })
  const drawHull = options.hull ?? true
  const hullGeometry = new THREE.LatheGeometry(profile, segments)
  // Lathes revolve about Y, with the profile running nose to tail up +Y. A
  // quarter turn about Z maps that to nose at +X and the radial direction to
  // +Y, which is the solver's frame, and leaves every consumer in it.
  //
  // The SIGN matters and is easy to get backwards: -PI/2 also produces a
  // plausible-looking airship, but a mirrored one, with the fins at the nose
  // and the car on top. It shows up as bulkhead rings floating outside the
  // skin, because the rings are placed from `xAtStation` and the hull is not.
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
      const radius = radiusAtStation(station)
      const x = xAtStation(station, length)
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= segments; i += 1) {
        const theta = (i / segments) * Math.PI * 2
        points.push(new THREE.Vector3(x, Math.cos(theta) * radius, Math.sin(theta) * radius))
      }
      const ringGeometry = new THREE.BufferGeometry().setFromPoints(points)
      disposables.push(ringGeometry)
      group.add(new THREE.Line(ringGeometry, ringMaterial))
    }
  }

  // ---- cruciform tail -----------------------------------------------------
  // Root sits ON the hull, at the station the stability rule used, and the
  // trailing edge is where that station puts it.
  if (options.fins ?? true) {
    const finRootRadius = radiusAtStation(fins.station) * 0.94
    const trailingEdgeX = xAtStation(fins.station, length) - fins.rootChord / 2
    const finBlank = finGeometry(
      fins.rootChord,
      fins.tipChord,
      fins.span,
      finRootRadius,
      trailingEdgeX,
    )
    disposables.push(finBlank)
    for (let i = 0; i < 4; i += 1) {
      const fin = new THREE.Mesh(finBlank, materials.structure)
      // Cruciform: up, starboard, down, port. Rotating about X keeps the section
      // in the plane of the flow for all four.
      fin.rotation.x = (i * Math.PI) / 2
      group.add(fin)
    }
  }

  // ---- propulsors ---------------------------------------------------------
  for (const propulsor of (options.propulsors ?? true) ? propulsors : []) {
    const unit = new THREE.Group()
    const radius = propulsor.diameter / 2
    const nacelleLength = propulsor.diameter * 0.55

    const nacelleGeometry = new THREE.CapsuleGeometry(radius * 0.28, nacelleLength, 4, 16)
    nacelleGeometry.rotateZ(Math.PI / 2)
    disposables.push(nacelleGeometry)
    unit.add(new THREE.Mesh(nacelleGeometry, materials.structure))

    if (propulsor.ducted) {
      const ductGeometry = new THREE.CylinderGeometry(
        radius * 1.08,
        radius * 1.02,
        nacelleLength * 1.2,
        28,
        1,
        true,
      )
      ductGeometry.rotateZ(Math.PI / 2)
      disposables.push(ductGeometry)
      const duct = new THREE.Mesh(ductGeometry, materials.accent)
      duct.material.side = THREE.DoubleSide
      unit.add(duct)
    }

    /** @derived Four blades, which is what the arrangement's units carry. */
    const BLADES = 4
    const bladeGeometry = new THREE.BoxGeometry(radius * 0.12, radius * 0.92, radius * 0.02)
    bladeGeometry.translate(0, radius * 0.5, 0)
    disposables.push(bladeGeometry)
    for (let b = 0; b < BLADES; b += 1) {
      const blade = new THREE.Mesh(bladeGeometry, materials.accent)
      blade.rotation.x = (b / BLADES) * Math.PI * 2
      // A little pitch, so a still frame does not read as a paddle wheel.
      blade.rotation.z = 0.28
      unit.add(blade)
    }

    const hullRadius = radiusAtStation(propulsor.station)
    const y = propulsor.heightFraction * hullRadius
    const z = propulsor.lateralOffset * maxRadius
    unit.position.set(xAtStation(propulsor.station, length), y, z)

    // A pylon back to the hull, because a propulsor floating in space beside
    // the envelope was one of the things that made these read as placeholders.
    const standoff = Math.hypot(y, z) - hullRadius * 0.9
    if (standoff > 0) {
      const pylonGeometry = new THREE.BoxGeometry(radius * 0.5, standoff, radius * 0.12)
      disposables.push(pylonGeometry)
      const pylon = new THREE.Mesh(pylonGeometry, materials.structure)
      const inward = new THREE.Vector3(0, -y, -z).normalize()
      pylon.position.set(0, (inward.y * standoff) / 2, (inward.z * standoff) / 2)
      pylon.rotation.x = Math.atan2(z, y) * -1
      unit.add(pylon)
    }

    group.add(unit)
  }

  // ---- the gondola, at the compartment's own dimensions --------------------
  // Not derived from the keel and not invented. `gondola-structure` is the
  // compartment the marine module floats on, so the thing drawn here is the
  // thing whose waterplane decides whether boat mode exists.
  if (options.car ?? true) {
    const gondola = arrangement.compartments.find((c) => c.id === 'gondola-structure')
    if (gondola) {
      const gondolaGeometry = new THREE.BoxGeometry(gondola.extent, gondola.height, gondola.width)
      disposables.push(gondolaGeometry)
      const car = new THREE.Mesh(gondolaGeometry, materials.structure)
      // Hung under the hull, which is where the habitable volume has to be:
      // no enclosed space above or adjacent to a gas cell.
      car.position.set(
        xAtStation(gondola.station, length),
        -radiusAtStation(gondola.station) - gondola.height * 0.42,
        0,
      )
      group.add(car)

      // A window strip. It is the one detail that makes the scale readable at
      // a glance: it says a person stands here, on a hull long enough that
      // nothing else in the frame gives the eye a size.
      const windowGeometry = new THREE.BoxGeometry(
        gondola.extent * 0.9,
        gondola.height * 0.34,
        gondola.width * 1.02,
      )
      disposables.push(windowGeometry)
      const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x8fc7ff,
        emissive: 0x27506f,
        metalness: 0.1,
        roughness: 0.25,
      })
      disposables.push(windowMaterial)
      const windows = new THREE.Mesh(windowGeometry, windowMaterial)
      windows.position.copy(car.position)
      windows.position.y += gondola.height * 0.14
      group.add(windows)
    }
  }

  return {
    group,
    length,
    maxRadius,
    dispose: () => {
      for (const item of disposables) item.dispose()
      for (const material of Object.values(materials)) material.dispose()
    },
  }
}
