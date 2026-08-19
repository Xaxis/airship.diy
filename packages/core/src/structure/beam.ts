import type { Meters, Newtons, NewtonMeters } from '@airship/units'
import { N, Nm } from '@airship/units'
import { v, CONSTANTS } from '@airship/data'

/**
 * The hull as a beam.
 *
 * This is the primary structural output of the whole project. Every laminate
 * schedule downstream is sized against the shear and bending moment diagrams
 * this module produces.
 *
 * THE CORE FACT. Buoyancy is distributed along the hull in proportion to
 * cross-sectional area, and weight is distributed in proportion to where the
 * structure, the cover, the tanks, the habitat and the machinery actually are.
 * THOSE TWO DISTRIBUTIONS DO NOT MATCH. Buoyancy is fattest amidships where the
 * hull is widest; weight is concentrated wherever the heavy things were bolted
 * on. The mismatch is what bends the ship, and it bends it even in perfectly
 * still air with the vehicle in exact global equilibrium.
 *
 * A ship whose ends are relatively heavy sags. A ship whose middle is
 * relatively heavy hogs. Both are ordinary and both have to be carried.
 *
 * EQUILIBRIUM AND INERTIAL RELIEF. A free-flying vehicle is not supported at
 * its ends: there are no reactions to solve for. If the applied loads do not
 * sum to zero in force and moment, the body accelerates, and the correct
 * analysis adds the resulting inertia load as a distributed d'Alembert force.
 * That is what makes the shear and moment vanish at both free ends, which is
 * the boundary condition a free-free beam must satisfy.
 *
 * Solving for that acceleration is not a numerical trick to force the diagram
 * closed. It is the physics: an airship 500 kg heavy really is accelerating
 * downward, and the structure really does carry the corresponding inertia
 * relief. Forcing the residual to zero any other way would hide a genuine load
 * case.
 *
 * @source Standard beam theory and d'Alembert's principle. The application to
 *   airship hulls follows Khoury, Airship Technology, chapter on structures.
 */

export interface DistributedLoad {
  /** Axial position from the nose, m. */
  readonly x: Meters
  /** Upward force per unit length from buoyancy, N/m. Always positive. */
  readonly buoyancy: number
  /** Downward force per unit length from distributed mass, N/m. Positive. */
  readonly weight: number
}

export interface PointLoad {
  readonly name: string
  readonly x: Meters
  /** Mass, kg. Converted to a downward force internally. */
  readonly mass: number
}

export interface BeamStation {
  readonly x: Meters
  /** Net upward load per unit length after inertial relief, N/m. */
  readonly netLoad: number
  /** Shear force, N. Positive means the portion forward of the cut pushes up. */
  readonly shear: Newtons
  /** Bending moment, N.m. Positive is HOGGING (ends down, middle up). */
  readonly moment: NewtonMeters
}

export interface BeamResult {
  readonly stations: readonly BeamStation[]
  /** Peak absolute bending moment and where it occurs. */
  readonly maximumMoment: NewtonMeters
  readonly maximumMomentStation: Meters
  readonly maximumShear: Newtons
  readonly maximumShearStation: Meters
  /**
   * Net vertical force before inertial relief, N. Positive is buoyant-up.
   * This is static heaviness expressed as a force, and it should be near zero
   * on a trimmed ship.
   */
  readonly residualForce: Newtons
  /** Net pitching moment before relief, N.m. Nonzero means the ship is out of trim. */
  readonly residualMoment: NewtonMeters
  /** Vertical acceleration implied by the residual, m/s^2. */
  readonly verticalAcceleration: number
  /** Angular acceleration in pitch implied by the residual, rad/s^2. */
  readonly pitchAcceleration: number
  /** True when the moment is positive amidships: ends down, middle up. */
  readonly hogging: boolean
}

/** @source Standard gravity, exact by definition. */
const G0 = v(CONSTANTS.g0)

/**
 * Solve the hull beam.
 *
 * @param distributed Buoyancy and weight per unit length, at stations that need
 *   not be equally spaced but must be ordered from nose to tail.
 * @param pointLoads Gondola, engines, fin roots, tanks. Concentrated loads are
 *   what produce the sharp shear steps that size local reinforcement, so they
 *   are kept as points rather than smeared.
 * @param applyInertialRelief When false, the residual is left in and the beam
 *   is analysed as if externally reacted. Only useful for checking a moored or
 *   supported condition; free flight always wants relief.
 */
export const solveBeam = (
  distributed: readonly DistributedLoad[],
  pointLoads: readonly PointLoad[] = [],
  applyInertialRelief = true,
): BeamResult => {
  if (distributed.length < 3) {
    throw new RangeError('A beam needs at least three stations to integrate.')
  }

  const first = distributed[0]
  const last = distributed[distributed.length - 1]
  if (!first || !last) throw new RangeError('Malformed station list.')

  const length = last.x - first.x
  if (length <= 0) throw new RangeError('Stations must be ordered from nose to tail.')

  // --- station spacing, for the trapezoidal integrals ------------------------
  // Each station owns half the gap to its neighbours, so the sum of the widths
  // is exactly the hull length and no load is double counted at the joins.
  const width = distributed.map((station, i) => {
    const previous = distributed[i - 1]
    const next = distributed[i + 1]
    const back = previous ? (station.x - previous.x) / 2 : 0
    const forward = next ? (next.x - station.x) / 2 : 0
    return back + forward
  })

  // --- assemble the applied load --------------------------------------------
  // Net upward force per unit length. Point loads are added to the station they
  // fall nearest, divided by that station's width so that the units stay N/m.
  const applied = distributed.map((station) => station.buoyancy - station.weight)

  for (const load of pointLoads) {
    let nearest = 0
    let bestDistance = Infinity
    for (let i = 0; i < distributed.length; i += 1) {
      const station = distributed[i]
      if (!station) continue
      const d = Math.abs(station.x - load.x)
      if (d < bestDistance) {
        bestDistance = d
        nearest = i
      }
    }
    const w = width[nearest] ?? 0
    if (w > 0) applied[nearest] = (applied[nearest] ?? 0) - (load.mass * G0) / w
  }

  // --- residual force and moment --------------------------------------------
  const totalMass =
    distributed.reduce((sum, station, i) => sum + (station.weight / G0) * (width[i] ?? 0), 0) +
    pointLoads.reduce((sum, load) => sum + load.mass, 0)

  const residualForce = applied.reduce((sum, q, i) => sum + q * (width[i] ?? 0), 0)

  // Moments about the centroid of mass, so that a pure force residual produces
  // no spurious angular acceleration.
  const massCentroid =
    totalMass > 0
      ? (distributed.reduce(
          (sum, station, i) => sum + (station.weight / G0) * (width[i] ?? 0) * station.x,
          0,
        ) +
          pointLoads.reduce((sum, load) => sum + load.mass * load.x, 0)) /
        totalMass
      : first.x + length / 2

  const residualMoment = applied.reduce(
    (sum, q, i) => sum + q * (width[i] ?? 0) * ((distributed[i]?.x ?? 0) - massCentroid),
    0,
  )

  // Pitch inertia about the mass centroid, from the distributed and point mass.
  const pitchInertia =
    distributed.reduce(
      (sum, station, i) => sum + (station.weight / G0) * (width[i] ?? 0) * (station.x - massCentroid) ** 2,
      0,
    ) + pointLoads.reduce((sum, load) => sum + load.mass * (load.x - massCentroid) ** 2, 0)

  const verticalAcceleration = totalMass > 0 ? residualForce / totalMass : 0
  const pitchAcceleration = pitchInertia > 0 ? residualMoment / pitchInertia : 0

  // --- inertial relief -------------------------------------------------------
  // The d'Alembert load: every element of mass resists the rigid-body
  // acceleration in proportion to its own mass, so the relief is distributed
  // like the WEIGHT and not like the buoyancy. Getting that backwards is a
  // subtle way to produce a plausible diagram that is wrong everywhere.
  const netLoad = applied.map((q, i) => {
    if (!applyInertialRelief) return q

    const station = distributed[i]
    if (!station) return q
    const w = width[i] ?? 0

    const localMassPerLength = station.weight / G0
    const lever = station.x - massCentroid

    let relief = localMassPerLength * (verticalAcceleration + pitchAcceleration * lever)

    // Point masses carry their own relief at their own station.
    if (w > 0) {
      for (const load of pointLoads) {
        let nearest = 0
        let bestDistance = Infinity
        for (let j = 0; j < distributed.length; j += 1) {
          const s = distributed[j]
          if (!s) continue
          const d = Math.abs(s.x - load.x)
          if (d < bestDistance) {
            bestDistance = d
            nearest = j
          }
        }
        if (nearest === i) {
          relief += (load.mass * (verticalAcceleration + pitchAcceleration * (load.x - massCentroid))) / w
        }
      }
    }

    return q - relief
  })

  // --- integrate -------------------------------------------------------------
  // Shear is the running integral of net load; moment is the running integral of
  // shear. On a correctly relieved free-free beam both return to zero at the
  // tail, and the test suite asserts exactly that.
  const stations: BeamStation[] = []
  let shear = 0
  let moment = 0

  for (let i = 0; i < distributed.length; i += 1) {
    const station = distributed[i]
    if (!station) continue

    const q = netLoad[i] ?? 0
    const w = width[i] ?? 0

    shear += q * w
    moment += shear * w

    stations.push({
      x: station.x,
      netLoad: q,
      shear: N(shear),
      moment: Nm(moment),
    })
  }

  let maximumMoment = 0
  let maximumMomentStation = first.x
  let maximumShear = 0
  let maximumShearStation = first.x

  for (const station of stations) {
    if (Math.abs(station.moment) > Math.abs(maximumMoment)) {
      maximumMoment = station.moment
      maximumMomentStation = station.x
    }
    if (Math.abs(station.shear) > Math.abs(maximumShear)) {
      maximumShear = station.shear
      maximumShearStation = station.x
    }
  }

  const amidships = stations[Math.floor(stations.length / 2)]

  return {
    stations,
    maximumMoment: Nm(maximumMoment),
    maximumMomentStation,
    maximumShear: N(maximumShear),
    maximumShearStation,
    residualForce: N(residualForce),
    residualMoment: Nm(residualMoment),
    verticalAcceleration,
    pitchAcceleration,
    hogging: (amidships?.moment ?? 0) > 0,
  }
}

/**
 * Buoyancy distributed along the hull in proportion to cross-sectional area.
 *
 * @param crossSections Area at each station, from the hull shape function.
 * @param specificLift Net lift per unit volume, kg/m3, from the buoyancy module.
 *   Using specific lift rather than air density is what makes this the NET
 *   buoyant load: the weight of the lifting gas is already subtracted, so the
 *   gas must not then be counted again in the weight distribution.
 */
export const buoyancyDistribution = (
  crossSections: ReadonlyArray<{ x: Meters; area: number }>,
  specificLift: number,
): ReadonlyArray<{ x: Meters; buoyancy: number }> =>
  crossSections.map((station) => ({
    x: station.x,
    // @derived Force per unit length = specific lift (kg/m3) * area (m2) * g.
    buoyancy: specificLift * station.area * G0,
  }))

/**
 * Section modulus required to carry a bending moment at a given allowable
 * stress.
 *
 * @derived From the engineer's bending formula, sigma = M*c/I = M/S, so the
 * required section modulus is S = M / sigma_allowable.
 *
 * For an airship hull the "section" is the ring of longitudinals at that
 * station, not a solid beam, so S is assembled from the longitudinal areas and
 * their distance from the neutral axis. That assembly lives in the ring sizing
 * module; this function is the demand side of it.
 */
export const requiredSectionModulus = (moment: NewtonMeters, allowableStress: number): number => {
  if (allowableStress <= 0) throw new RangeError('Allowable stress must be positive.')
  return Math.abs(moment) / allowableStress
}

/**
 * Section modulus of a ring of N longitudinals of equal area on a circle.
 *
 * @derived For longitudinals at radius R and angle theta_i, the second moment
 * of area about a horizontal neutral axis through the centre is
 * I = A * R^2 * sum(sin^2 theta_i), and for N equally spaced members
 * sum(sin^2) = N/2. So I = A*R^2*N/2 and S = I/R = A*R*N/2.
 *
 * This is the relation that makes hull bending strength scale with RADIUS as
 * well as with material: a fatter hull is a deeper beam and carries bending
 * far more cheaply. It is one of the reasons the fineness ratio trade is not
 * purely aerodynamic.
 */
export const ringSectionModulus = (
  longitudinalArea: number,
  radius: number,
  longitudinalCount: number,
): number => (longitudinalArea * radius * longitudinalCount) / 2
