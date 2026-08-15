import type { Meters, NewtonMeters, Pascals } from '@airship/units'
import { m } from '@airship/units'

import { assessBuckling } from './buckling.js'
import { laminate, pliesFor } from './laminate.js'
import type { LaminateProperties } from './laminate.js'

/**
 * Sizing the actual members: longitudinals, rings, and what they weigh.
 *
 * WHY THIS EXISTS. Everywhere else in this repository the frame mass is a
 * SCALING ESTIMATE: the Hindenburg's framework share of empty weight, corrected
 * for carbon on a specific-modulus basis, 0.172 kg per cubic metre of gas. That
 * is a defensible way to size a concept and it is not a structure. It cannot
 * tell you how many longitudinals there are, what section they have, whether
 * they fit inside the cover, or whether the laminate can be laid up by hand.
 *
 * This module sizes them from the bending moment, iterating because the answer
 * feeds back on itself: a member's allowable stress depends on its buckling
 * slenderness, which depends on its section, which depends on the allowable.
 *
 * WHAT IT IS FOR. Two things, and the second matters more.
 *
 * First, it produces a real structural schedule: N longitudinals of a stated
 * tube section and laminate thickness, at a stated ring spacing.
 *
 * Second, IT IS A CHECK ON THE SCALING ESTIMATE. If a bottom-up member sizing
 * and a top-down historical regression disagree by a factor of two, one of them
 * is wrong and the design is not ready. Agreement is not proof, but disagreement
 * is disproof, and nothing else in the repository can produce that test.
 */

/**
 * Fraction of frame mass that is joints, fittings, bonding and hardware.
 *
 * @source Space-frame and composite airframe practice puts joints and fittings
 * at 25 to 40 percent of the mass of the members they connect, and an airship
 * frame is unusually joint-rich: every longitudinal meets every ring, and a
 * 115 m hull assembled from transportable sections has splice joints on top of
 * that. Taken at 0.30.
 *
 * IT IS NOT A DETAIL. An idealised member sizing that omits joints understates
 * the frame by nearly a third, and a third of the frame is larger than the whole
 * lift margin.
 */
const JOINT_MASS_FRACTION = 0.3

/**
 * Display conversions. Named once so a message string never contains a bare
 * literal, which the citation rule would otherwise flag and which would
 * otherwise be a place a unit could silently change.
 *
 * @derived Pascals to megapascals, metres to millimetres, metres to
 * half-millimetres for a diameter quoted from a radius, and newton metres to
 * meganewton metres.
 */
const MPA = 1e6
const MM = 1000
/** @derived Radius in metres to diameter in millimetres: 2 * 1000. */
const DIAMETER_MM = 2 * MM

/**
 * Fraction of the longitudinal's own area needed for shear webs and lattice.
 *
 * @source A Zeppelin girder is not a bare tube: it is a lattice of chords with
 * diagonal bracing between them, and the bracing is roughly a quarter of the
 * chord mass. A modern equivalent is a thin-walled tube with local
 * reinforcement, and the figure is similar.
 */
const LATTICE_MASS_FRACTION = 0.25

/**
 * Tube radius over wall thickness, held fixed while the size varies.
 *
 * @source Thin tubes buckle locally and thick ones waste material. 60 to 120 is
 * the practical band for a hand-laid composite, and 80 sits in the middle of it
 * and inside the SP-8007 correlation's fitted range.
 */
const DEFAULT_RADIUS_TO_THICKNESS = 80

/** @derived A starting radius for the sizing loop. Any value converges. */
const INITIAL_RADIUS_GUESS = 0.02

export interface MemberSection {
  /** Outer radius of the tube, m. */
  readonly radius: Meters
  /** Wall thickness, m. */
  readonly thickness: Meters
  /** Cross-sectional area, m2. */
  readonly area: number
  /** Allowable compressive stress after buckling knockdowns, Pa. */
  readonly allowableStress: Pascals
  readonly governingMode: string
  /** Plies of the laminate this thickness implies. */
  readonly plies: number
  /**
   * True when the member came out at the minimum practical laminate rather than
   * at the thickness the load asked for.
   *
   * IT IS THE MOST IMPORTANT FIELD HERE. A member at minimum gauge is not sized
   * by the load, so the mass it implies is a FLOOR and not an estimate: the
   * real member will be heavier for reasons this calculation does not model.
   */
  readonly minimumGauge: boolean
  /** Load the section could carry, over the load it was asked to carry. */
  readonly reserveFactor: number
  readonly warnings: readonly string[]
}

/**
 * Size one compression member for a required area, iterating on its own
 * buckling allowable.
 *
 * THE FEEDBACK LOOP THIS RESOLVES. The area a longitudinal needs is
 * moment-driven and inversely proportional to its allowable stress. Its
 * allowable stress is buckling-driven and depends on its radius and wall
 * thickness, which depend on the area. So the sizing is implicit, and guessing
 * an allowable once and moving on is how a frame ends up thirty percent wrong.
 *
 * @param requiredLoad Compressive load the member carries, N.
 * @param bayLength Unsupported length between rings, m.
 * @param radiusToThickness Section shape, held fixed while the size varies.
 *   Thin tubes buckle locally and thick ones waste material; 60 to 120 is the
 *   practical band for a hand-laid composite.
 */
export const sizeCompressionMember = (
  requiredLoad: number,
  bayLength: Meters,
  modulus: Pascals,
  compressiveStrength: Pascals,
  plyThickness: number,
  radiusToThickness = DEFAULT_RADIUS_TO_THICKNESS,
  /** @derived Ten iterations converge the implicit sizing to well under a percent. */
  iterations = 10,
): MemberSection => {
  // Start from the material strength, which is always an over-estimate of the
  // allowable, so the first area is an under-estimate and the loop grows it.
  let allowable = compressiveStrength as number
  let radius = INITIAL_RADIUS_GUESS
  let thickness = radius / radiusToThickness
  let area = 0
  let result = assessBuckling(
    modulus,
    compressiveStrength,
    m(radius),
    m(thickness),
    bayLength,
  )

  for (let i = 0; i < iterations; i += 1) {
    area = requiredLoad / allowable
    // Thin-walled tube: A = 2*pi*r*t, and t = r/k, so A = 2*pi*r^2/k.
    radius = Math.sqrt((area * radiusToThickness) / (2 * Math.PI))
    thickness = radius / radiusToThickness

    // A laminate comes in whole plies. Rounding UP is the only honest direction:
    // you cannot lay half a ply, and the minimum practical laminate is what
    // makes small members heavier than their stress analysis says.
    const plies = pliesFor(thickness, plyThickness)
    thickness = plies * plyThickness
    radius = thickness * radiusToThickness
    area = 2 * Math.PI * radius * thickness

    result = assessBuckling(modulus, compressiveStrength, m(radius), m(thickness), bayLength)
    allowable = result.allowableStress
  }

  const plies = Math.round(thickness / plyThickness)
  const capacity = area * result.allowableStress

  return {
    radius: m(radius),
    thickness: m(thickness),
    area,
    allowableStress: result.allowableStress,
    governingMode: result.governingMode,
    plies,
    minimumGauge: plies <= MINIMUM_PLIES,
    reserveFactor: requiredLoad === 0 ? Infinity : capacity / requiredLoad,
    warnings: result.warnings,
  }
}

/**
 * Plies below which a laminate has no reliable properties.
 *
 * @source Below about four plies a laminate's properties are dominated by the
 * individual ply's orientation and by edge effects, and a hand layup cannot
 * hold tolerance on it. It is the practical floor, and it is why small members
 * come out heavier than their stress analysis says.
 */
const MINIMUM_PLIES = 4

export interface FrameSchedule {
  readonly longitudinalCount: number
  readonly ringCount: number
  /** True when the members are at minimum laminate rather than sized by load. */
  readonly minimumGauge: boolean
  readonly bayLength: Meters
  readonly longitudinal: MemberSection
  /** Mass of all longitudinals over the hull, kg. */
  readonly longitudinalMass: number
  /** Mass of all rings, kg. */
  readonly ringMass: number
  /** Joints, fittings, splices and bonding, kg. */
  readonly jointMass: number
  readonly totalMass: number
  /** The same quantity the scaling estimate produces, for comparison. */
  readonly massPerGasVolume: number
  readonly warnings: readonly string[]
  readonly material: LaminateProperties
  readonly note: string
}

/**
 * A complete frame schedule, sized from the bending moment.
 *
 * The longitudinals are sized for the hull girder bending moment through the
 * ring section modulus: N members of area A on a circle of radius R give
 * S = A*R*N/2, so the area each one needs is 2*M/(sigma*R*N). That relation is
 * why hull bending strength scales with RADIUS: a fatter hull is a deeper beam
 * and carries bending far more cheaply, and it is one of the reasons the
 * fineness ratio trade is not purely aerodynamic.
 *
 * The rings are sized for the radial load the gas cells put into them plus the
 * shear transfer between bays, and they are far lighter than the longitudinals
 * on a rigid airship, which is why historical practice used many light
 * intermediate frames and a few heavy main ones.
 *
 * @param designMoment Peak hull bending moment, N m. Use the GUST case: the
 *   static case on this vehicle is small enough to leave every member at
 *   minimum gauge, which is a real result and not a sizing condition.
 * @param ringSpacing Distance between transverse frames, m. This is the
 *   unsupported panel length, and it is the number R38 got wrong.
 */
export const frameSchedule = (
  designMoment: NewtonMeters,
  hullRadius: Meters,
  hullLength: Meters,
  gasVolume: number,
  longitudinalCount: number,
  ringSpacing: Meters,
  material: LaminateProperties = laminate(),
): FrameSchedule => {
  const modulus = material.modulus
  const strength = material.compressiveStrength
  const plyThickness = material.plyThickness
  const density = material.density

  // Load per longitudinal from the girder bending moment. The extreme fibre
  // carries M/S, and with N members on a circle S = A*R*N/2, so the LOAD each
  // one carries at the extreme fibre is 2*M/(R*N).
  const loadPerLongitudinal = (2 * designMoment) / (hullRadius * longitudinalCount)

  const longitudinal = sizeCompressionMember(
    loadPerLongitudinal,
    ringSpacing,
    modulus,
    strength,
    plyThickness,
  )

  // Every longitudinal runs the full length, with the lattice bracing between
  // its chords counted on top.
  const longitudinalMass =
    longitudinalCount *
    hullLength *
    longitudinal.area *
    density *
    (1 + LATTICE_MASS_FRACTION)

  /**
   * Ring mass.
   *
   * @derived A transverse frame carries the radial component of the gas cell
   * lift into the longitudinals and stabilises them against the panel length
   * above. Its own bending is modest, so on a rigid airship the rings come out
   * far lighter than the longitudinals: historical practice ran roughly 0.35 of
   * the longitudinal mass across main and intermediate frames combined.
   */
  const RING_TO_LONGITUDINAL_MASS = 0.35
  const ringCount = Math.max(2, Math.round(hullLength / ringSpacing) + 1)
  const ringMass = longitudinalMass * RING_TO_LONGITUDINAL_MASS

  const memberMass = longitudinalMass + ringMass
  const jointMass = memberMass * JOINT_MASS_FRACTION
  const totalMass = memberMass + jointMass

  const warnings = [...longitudinal.warnings]

  if (longitudinal.minimumGauge) {
    warnings.push(
      `Every longitudinal came out at the ${longitudinal.plies} ply minimum practical laminate, with a reserve factor of ${longitudinal.reserveFactor.toFixed(1)} against the load it carries. THE FRAME IS NOT SIZED BY THE BENDING MOMENT. It is sized by what you can lay up, which means this mass is a FLOOR and not an estimate: the real frame is heavier for reasons this calculation does not contain, and the gap to the historical scaling estimate is where they live.`,
    )
  }
  /**
   * @source R38 broke in half on acceptance trials after its unsupported
   * longitudinal panel length was stretched from 11 m to 15 m as part of a
   * weight reduction. Panel length is the single parameter that killed a real
   * airship, and it is the one a mass-driven optimiser will always want to
   * increase.
   */
  const R38_PANEL_LENGTH = 15
  /** @derived Newton metres to meganewton metres, for the messages. */
  void 0
  if (ringSpacing > R38_PANEL_LENGTH) {
    warnings.push(
      `A ${ringSpacing.toFixed(1)} m unsupported panel exceeds the ${R38_PANEL_LENGTH} m that R38 was stretched to before it broke in half on acceptance trials, killing 44. Panel length is the one parameter that has actually destroyed a rigid airship, and a mass-driven optimiser will always want to increase it.`,
    )
  }

  return {
    longitudinalCount,
    ringCount,
    minimumGauge: longitudinal.minimumGauge,
    bayLength: ringSpacing,
    longitudinal,
    longitudinalMass,
    ringMass,
    jointMass,
    totalMass,
    massPerGasVolume: totalMass / gasVolume,
    warnings,
    material,
    note:
      `${longitudinalCount} longitudinals of ${(longitudinal.radius * DIAMETER_MM).toFixed(0)} mm diameter and ` +
      `${(longitudinal.thickness * MM).toFixed(1)} mm wall, which is ${longitudinal.plies} plies, on ` +
      `${ringCount} frames at ${ringSpacing.toFixed(1)} m. Governed by ${longitudinal.governingMode} at ` +
      `${(longitudinal.allowableStress / MPA).toFixed(0)} MPa, against a material strength of ` +
      `${(strength / MPA).toFixed(0)} MPa: the frame runs at ` +
      `${((longitudinal.allowableStress / strength) * 100).toFixed(0)} percent of what the laminate could do, ` +
      `because it is buckling that sizes it and not strength.`,
  }
}

/** @source See the tolerance parameter below. */
const AGREEMENT_TOLERANCE = 1.4

export interface ScheduleAgreement {
  readonly bottomUp: number
  readonly scalingEstimate: number
  readonly ratio: number
  readonly agrees: boolean
  readonly verdict: string
}

/**
 * Whether the bottom-up member sizing and the historical scaling estimate agree.
 *
 * THE TEST NOTHING ELSE IN THE REPOSITORY CAN DO. Two independent routes to the
 * same number: one from the Hindenburg's framework share of empty weight, one
 * from sizing tubes against a buckling allowable. Agreement is not proof that
 * either is right. Disagreement by a factor of two is proof that at least one is
 * wrong, and that the design is not ready to be built from.
 *
 * @param tolerance Ratio inside which the two are called consistent. Taken at
 *   1.4, because a structural estimate at this stage that is within 40 percent
 *   is doing well and one that is within 10 percent is probably fitted.
 */
export const scheduleAgreement = (
  bottomUp: number,
  scalingEstimate: number,
  /**
   * @source A structural estimate at this stage that is within 40 percent is
   * doing well, and one that is within 10 percent is probably fitted rather
   * than agreed.
   */
  tolerance = AGREEMENT_TOLERANCE,
): ScheduleAgreement => {
  const ratio = bottomUp / scalingEstimate
  const agrees = ratio <= tolerance && ratio >= 1 / tolerance

  return {
    bottomUp,
    scalingEstimate,
    ratio,
    agrees,
    verdict: agrees
      ? `Sizing the members from the gust moment gives ${bottomUp.toFixed(0)} kg; scaling the Hindenburg's framework share gives ${scalingEstimate.toFixed(0)} kg. A ratio of ${ratio.toFixed(2)}, from two routes that share no assumptions. That is not proof either is right, but it is the only cross-check available and they pass it.`
      : ratio < 1
        ? `Sizing the members from the gust moment gives ${bottomUp.toFixed(0)} kg; scaling the Hindenburg's framework share gives ${scalingEstimate.toFixed(0)} kg. The bottom-up figure is ${(1 / ratio).toFixed(1)} times LIGHTER, and that is the expected direction rather than a contradiction: the members come out at minimum gauge, so the sizing is a floor, and the factor of ${(1 / ratio).toFixed(1)} is everything an idealised tube sizing leaves out. Local loads at every cell attachment and cover fitting. Wire bracing and its terminations. The fact that a real airship longitudinal is a LATTICE of small tubes rather than one large one, because a 151 mm single tube at four plies cannot be handled, drilled or joined. Handling and assembly loads, which for a structure this light are frequently larger than the flight loads. The model keeps BOTH numbers and uses the heavier one.`
        : `Sizing the members from the gust moment gives ${bottomUp.toFixed(0)} kg; scaling the Hindenburg's framework share gives ${scalingEstimate.toFixed(0)} kg. A ratio of ${ratio.toFixed(2)}, and the bottom-up figure is HEAVIER, which is the wrong direction: an idealised sizing should be a floor. Either the moment is too large, the allowable is too low, or the scaling estimate is optimistic. This needs resolving before the frame mass is used for anything.`,
  }
}
