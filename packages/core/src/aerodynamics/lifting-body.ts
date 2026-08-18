import type { Meters, Newtons, Radians, SquareMeters } from '@airship/units'
import { m } from '@airship/units'
import { CONSTANTS, ISA, v } from '@airship/data'
import {
  CONVENTIONAL_PRISMATIC_COEFFICIENT,
  hullGeometry,
  hullShapeForPrismatic,
} from '../geometry/hull.js'

/**
 * Aerodynamic lift from the hull itself, for hybridLift architectures.
 *
 * A hybridLift airship carries part of its weight buoyantly and part on the
 * hull acting as a very low aspect ratio wing. The Airlander 10 is the flying
 * example: 38,000 m3, 98 m long, 50 m across, and somewhere between 60 and 80
 * percent of its weight held up by helium with the rest coming from the hull at
 * forward speed.
 *
 * WHY THIS MODULE EXISTS, AND WHY IT MOSTLY ARGUES AGAINST ITSELF. Hybrid-lift
 * solves the airship's worst operational problem: a vehicle that is exactly
 * neutrally buoyant is uncontrollable on the ground and has to trade ballast for
 * every kilogram of cargo. Flying heavy fixes that, which is why every serious
 * modern airship programme is hybridLift.
 *
 * It also does nothing whatsoever at zero airspeed, and THIS vehicle's figure of
 * merit is days aloft while holding station. `minimumFlyingSpeed` makes the
 * conflict quantitative: a vehicle 4 tonnes heavy must hold 8 m/s or descend,
 * and the power to do that for a year is not available from an array, because
 * propulsive power goes as the cube of speed.
 *
 * ONE MORE THING THE ENTHUSIASM LEAVES OUT, THOUGH LESS OF IT THAN THIS MODULE
 * ONCE CLAIMED. A flattened multi-lobe hull carries more skin per unit volume
 * than a body of revolution, and how much more depends entirely on which body
 * of revolution. The Airlander's hull comes out at 7.24 on the wetted-area
 * coefficient. An equal-volume body of revolution is 6.14 at fineness 4, 6.55
 * at 5, 6.92 at 6 and 7.26 at 7, so the penalty runs from 18 percent down
 * through zero. Against the fineness this project's own hull uses it is
 * 11 to 18 percent. More skin is more cover mass, more permeating area and more
 * friction drag, and all three are paid every hour of every day whether or not
 * the vehicle is moving fast enough to collect any hull lift at all.
 *
 * That is a real cost and not a decisive one, which is why the argument against
 * hybridLift here rests on the zero-airspeed case above and not on skin.
 */


/**
 * Lift curve slope of a low aspect ratio surface, per radian.
 *
 * @source Helmbold's equation, the standard low-aspect-ratio correction to thin
 * aerofoil theory:
 *
 *   CL_alpha = 2 * pi * AR / (2 + sqrt(AR^2 + 4))
 *
 * It reduces to 2*pi per radian as AR goes to infinity and to Jones' slender
 * wing result of pi*AR/2 as AR goes to zero, so it covers the whole range a
 * lifting-body hull can occupy. At the Airlander's aspect ratio of about 0.65 it
 * gives 1.00 per radian, against 2*pi for a high aspect ratio wing: a
 * lifting-body hull is roughly a sixth as effective per unit area as a wing, and
 * that is before the drag penalty.
 */
export const liftCurveSlope = (aspectRatio: number): number =>
  (2 * Math.PI * aspectRatio) / (2 + Math.sqrt(aspectRatio * aspectRatio + 4))

/**
 * Vortex lift factor for a slender body at incidence.
 *
 * @source Polhamus leading-edge suction analogy: a low aspect ratio planform
 * develops an additional non-linear lift from the separated vortices along its
 * edges, going as sin^2(alpha)*cos(alpha) rather than linearly with alpha. The
 * coefficient is close to the potential-flow lift curve slope for a sharp-edged
 * delta; a rounded multi-lobe hull achieves considerably less, and 0.6 of it is
 * the figure used here.
 *
 * It matters because it is what keeps a lifting body flying past the incidence
 * where a wing would have stalled. A hull does not stall in the usual sense; it
 * runs out of pitch authority first.
 */
const VORTEX_LIFT_FRACTION = 0.6

/** @source Airship hulls run out of usable incidence around 20 degrees. */
const MAXIMUM_USABLE_INCIDENCE = (20 * Math.PI) / 180

export interface LiftingBodyGeometry {
  readonly length: Meters
  /** Maximum width across the lobes, m. */
  readonly beam: Meters
  /** Maximum height, m. */
  readonly height: Meters
  readonly planformArea: SquareMeters
  readonly aspectRatio: number
  readonly volume: number
  /** Wetted area over volume^(2/3). A sphere is 4.836; a good hull about 5.4. */
  readonly wettedAreaCoefficient: number
  readonly wettedArea: SquareMeters
}

/**
 * Volume coefficient of a multi-lobe hull, V / (L * B * H).
 *
 * THIS WAS 0.2585 AND IT IS GEOMETRICALLY IMPOSSIBLE.
 *
 * A multi-lobe section is a union of equal circles. The section fullness of any
 * such union, area over the bounding rectangle, has a HARD FLOOR of pi/4 =
 * 0.7854: it reaches that value both when the lobes are tangent and when they
 * are fully merged into one circle, and it is higher everywhere in between,
 * peaking at 0.871 for three lobes. So a trilobe at a prismatic coefficient of
 * 0.69 cannot have a volume coefficient below 0.69 * 0.7854 = 0.542, for any
 * lobe count and any overlap. 0.2585 is less than half of that.
 *
 * The error is in the inputs, not the arithmetic. 0.2585 came from Airlander
 * 10's published 38,000 m3 inside "98 m by 50 m by 30 m", and the 50 m is
 * Wikipedia's WINGSPAN row rather than a hull beam, while the 30 m evidently
 * includes the fins and the gondola. Using the hull's own dimensions gives
 * 0.587, which sits where the geometry says it must.
 *
 * WHAT THIS COST. Everything downstream inherited it: lift per unit volume,
 * skin mass, permeating area, and above all the wetted-area penalty of a lobed
 * hull, which this project computed as 63 percent and used as its central
 * argument against hybridLift. The corrected number is 11 percent against an
 * equal-volume body of revolution at fineness 5, rising to 18 at fineness 4 and
 * falling to nothing by fineness 7. That is a penalty worth carrying in the
 * mass statement and nowhere near a disqualification, so the architecture
 * chapter rejected hybridLift on a figure five times too large. It is rejected
 * here for other reasons, which survive.
 *
 * Two errors were compounding: this coefficient, and a wetted area that treated
 * each lobe as spanning beam/lobes rather than standing as tall as the hull.
 * They pushed in opposite directions, so an intermediate correction of this one
 * alone briefly reported a few percent, which was no better founded than the 63.
 *
 * @source Airlander 10's hull, 92 m by 42 m, at the published 38,000 m3.
 */
const MULTI_LOBE_VOLUME_COEFFICIENT = 0.587

/**
 * Hard geometric floor on the section fullness of a union of equal circles.
 *
 * @derived Both limiting cases, tangent lobes and fully merged lobes, give
 * exactly pi/4; every intermediate overlap is fuller. A model that produces a
 * lobed hull below this has a dimension that is not what it claims to be, and
 * saying so is more useful than quietly accepting it.
 */
export const MINIMUM_LOBED_SECTION_FULLNESS = Math.PI / 4

/** @source A single lobe is a body of revolution: pi/6 for an ellipsoid. */
const SINGLE_LOBE_VOLUME_COEFFICIENT = Math.PI / 6

/**
 * Fraction of a lobe's own surface hidden where it meets its neighbours.
 *
 * @derived Two tangent bodies of revolution share a waist; the fabric there is
 * a diaphragm carrying the pressure difference rather than outer skin, so it is
 * not wetted area, but it IS mass and it IS permeating area. Taken at 0.15 per
 * internal seam from the geometry of two intersecting cylinders at the depth of
 * intersection a lobed hull uses.
 */
/**
 * @derived Ceiling on the hidden fraction. The intersection formula is exact
 * for two lobes at a time and does not know that a third lobe can bury surface
 * the first two already counted, so at extreme overlap it would over-hide.
 */
const LOBE_HIDDEN_CEILING = 0.6

/**
 * Wetted area form factor for a body of revolution.
 *
 * COMPUTED FROM THE HULL MODULE RATHER THAN ASSERTED ABOUT IT. This was the
 * literal 0.72, cited as "the figure the conventional hull module reproduces
 * from its own shape function". It does not: `hullGeometry` integrates its own
 * profile and returns 0.78 to 0.83 across the prismatic range, never 0.72. The
 * citation was checkable in one command and it failed, and the error understated
 * the lobed hull's skin by 11 to 16 percent, which feeds envelope mass and
 * permeation area for every multi-lobe architecture.
 *
 * @derived wettedArea / (pi * L * D) for the conventional hull at the prismatic
 * coefficient this project uses. Scale-free, so the reference length is
 * arbitrary.
 */
const REVOLUTION_AREA_FACTOR = (() => {
  /** @derived An arbitrary reference hull; the ratio does not depend on its size. */
  const REFERENCE_LENGTH = 100
  /** @derived The drag-optimum fineness, which is where this ratio is wanted. */
  const REFERENCE_FINENESS = 5
  const reference = hullGeometry(
    m(REFERENCE_LENGTH),
    REFERENCE_FINENESS,
    hullShapeForPrismatic(CONVENTIONAL_PRISMATIC_COEFFICIENT),
  )
  const diameter = REFERENCE_LENGTH / REFERENCE_FINENESS
  return (reference.wettedArea as number) / (Math.PI * REFERENCE_LENGTH * diameter)
})()

/**
 * Geometry of a multi-lobe lifting-body hull.
 *
 * @param lobes Number of side-by-side lobes. Three is the Lockheed and Airlander
 *   arrangement; one degenerates to a body of revolution.
 *
 * @derived The planform is an ellipse of length by beam, so S = pi/4 * L * B,
 * and the aspect ratio of an elliptical planform is AR = B^2 / S = 4B/(pi*L).
 * For the Airlander's 98 m by 50 m that gives 0.65, which is the value every
 * aerodynamic figure in this module is calibrated at.
 *
 * The volume comes from the calibrated coefficient above rather than from a
 * bounding ellipsoid, and the wetted area from summing the lobes as separate
 * bodies of revolution of diameter B/lobes, less the fraction hidden at the
 * waists. Summing lobes is the physical picture: a lobed hull IS a row of
 * airship hulls sharing diaphragms.
 */
export const liftingBodyGeometry = (
  length: Meters,
  beam: Meters,
  height: Meters,
  lobes: number,
): LiftingBodyGeometry => {
  if (lobes < 1) throw new RangeError('A hull needs at least one lobe.')

  const planformArea = (Math.PI / 4) * length * beam
  const aspectRatio = (beam * beam) / planformArea

  const volumeCoefficient =
    lobes === 1 ? SINGLE_LOBE_VOLUME_COEFFICIENT : MULTI_LOBE_VOLUME_COEFFICIENT
  const volume = volumeCoefficient * length * beam * height

  /**
   * A LOBE'S DIAMETER IS THE HULL HEIGHT, not the beam over the lobe count.
   *
   * A multi-lobe section is a row of circles of diameter equal to the section
   * height, overlapping each other to span the beam. Beam over lobes is only
   * the TANGENT case, and tangency forces H = B/n, which is a constraint this
   * function does not impose and the Airlander does not satisfy: 92 by 42 by 20
   * gives B/n = 14 m against a 20 m height.
   *
   * So the wetted area was describing a different body from the one the volume
   * model describes, and it ignored `height` altogether: a hull could be made
   * arbitrarily deep at no cost in skin.
   */
  const lobeDiameter = height
  const bareLobeArea = REVOLUTION_AREA_FACTOR * Math.PI * lobeDiameter * length

  /**
   * THE HIDDEN FRACTION IS DERIVED FROM THE OVERLAP, not asserted as a constant.
   *
   * It was a flat 0.15 per seam, applied as (n-1)/n so that a trilobe hid 10
   * percent. Two things were wrong with that. Each seam hides surface on BOTH
   * lobes it joins, so the count is 2(n-1) lobe-fractions and not (n-1). And
   * 0.15 describes one particular depth of intersection, while the depth is set
   * by the beam, the height and the lobe count together: on the Airlander's
   * 92 by 42 by 20 the lobes overlap by nine metres, which is 45 percent of
   * their diameter, and at that depth far more than 15 percent is buried.
   *
   * @derived Two circles of radius r whose centres are s apart intersect at
   * angle acos(s / 2r) from the line of centres, so the arc of each that lies
   * inside the other is 2*acos(s/2r) out of 2*pi. With n lobes of diameter d
   * spanning beam B, adjacent centres are (B - d)/(n - 1) apart.
   */
  const lobeRadius = lobeDiameter / 2
  const centreSpacing = lobes > 1 ? (beam - lobeDiameter) / (lobes - 1) : Infinity
  const hiddenPerSeam =
    lobes > 1 && centreSpacing < lobeDiameter && centreSpacing > 0
      ? Math.acos(Math.min(centreSpacing / (2 * lobeRadius), 1)) / Math.PI
      : 0
  const hiddenFraction = Math.min((2 * (lobes - 1) * hiddenPerSeam) / lobes, LOBE_HIDDEN_CEILING)
  const wettedArea = lobes * bareLobeArea * (1 - hiddenFraction)

  return {
    length,
    beam,
    height,
    planformArea: planformArea as SquareMeters,
    aspectRatio,
    volume,
    wettedArea: wettedArea as SquareMeters,
    wettedAreaCoefficient: wettedArea / Math.pow(volume, 2 / 3),
  }
}

/**
 * Diaphragm area between the lobes, m2.
 *
 * Not wetted area, and not free either: every square metre is barrier film
 * carrying a pressure difference, and it permeates in both directions. A lobed
 * hull pays for it in mass and in lift, and it is the term that quick hybridLift
 * comparisons leave out.
 */
export const diaphragmArea = (geometry: LiftingBodyGeometry, lobes: number): number => {
  if (lobes < 2) return 0
  /** @derived Each internal seam is roughly a rectangle of length by height. */
  return (lobes - 1) * geometry.length * geometry.height * 0.6
}

export interface HullLift {
  /** Lift coefficient, referenced to planform area. */
  readonly liftCoefficient: number
  /** Induced drag coefficient, same reference. */
  readonly inducedDragCoefficient: number
  readonly lift: Newtons
  readonly inducedDrag: Newtons
  /** Lift over induced drag. Not the whole L/D: friction is elsewhere. */
  readonly liftToInducedDrag: number
}

/**
 * How much of the thin-wing lift curve slope a thick lobed HULL actually
 * achieves.
 *
 * RECALIBRATED AT THE HULL'S REAL DIMENSIONS. This was 0.31, computed at an
 * aspect ratio of 0.65 that came from a 50 m "wingspan" row rather than the
 * hull's 42 m beam. At the real planform the aspect ratio is 0.581, the
 * Helmbold slope is 0.894 rather than 0.995, and the efficiency that reproduces
 * the same measured lift is 0.433.
 *
 * Note also that the AAIB says the vehicle carried UP TO 40 percent of its
 * weight aerodynamically, not 40 percent at cruise. The distinction matters
 * because it makes the anchor an upper bound rather than a design point.
 *
 * @source Anchored on the Airlander 10, twice, and the two anchors agree.
 * The AAIB records up to 40 percent of weight carried aerodynamically, and
 * the manufacturer's loiter speed is 20 knots. A single lift coefficient at 12
 * degrees reproduces BOTH: 39.6 percent of MTOW at 28 m/s and 5.3 percent at
 * 10.29 m/s, because lift goes as the square of speed and the two conditions
 * differ only in dynamic pressure. That coefficient is 0.07 referenced to the
 * overall 98 by 50, or 0.0887 referenced to the hull planform this model uses.
 *
 * THE CONSTANT IS SOLVED FROM THE WEIGHT FRACTION, NOT FROM THE 0.07, and the
 * difference is a trap worth describing because it nearly cost this module a
 * 27 percent error in the flattering direction.
 *
 * 0.07 is a lift coefficient, and a lift coefficient is meaningless without the
 * area it is referenced to. It is quoted against the Airlander's OVERALL
 * dimensions, 98 m by 50 m, which is the same wingspan-for-beam confusion that
 * `MULTI_LOBE_VOLUME_COEFFICIENT` documents below. This model references lift
 * to the HULL planform, 92 m by 42 m, which is 27 percent smaller, so the same
 * measured lift is a coefficient of 0.0886 here.
 *
 * Feeding 0.07 into this model's own areas therefore does not reproduce the
 * AAIB observation, it reproduces 31 percent of weight instead of 40, and it
 * would have looked like a correction because it moved the number the safe way.
 *
 * So the calibration is anchored on the AAIB weight fraction, which is an
 * observation, and the coefficient is left to come out wherever this model's
 * geometry puts it. The efficiency that results is 0.433: a lobed hull achieves
 * 43 percent of what a thin wing of the same aspect ratio would. Changing
 * VORTEX_LIFT_FRACTION, the Helmbold slope, or the planform now moves it with
 * them, which is the only way a calibration constant stays a calibration.
 *
 * IT IS NOT A FUDGE, IT IS THE DIFFERENCE BETWEEN A WING AND A BODY. Helmbold
 * describes a thin lifting surface; a hull is a thick body whose planform area
 * includes a great deal of volume that is not making lift, and whose flow
 * separates well before a wing's would. Using the thin-wing figure flattered
 * hybridLift by a factor of three on the term that decides whether it can be
 * afforded, and this module did exactly that in its first version.
 */
const HULL_LIFT_EFFICIENCY = (() => {
  /** @source AAIB: up to 39.6 percent of MTOW carried aerodynamically. */
  const ANCHOR_WEIGHT_FRACTION = 0.396
  /** @source Airlander 10 maximum take-off mass, kg. */
  const ANCHOR_MASS = 33285
  /** @source The AAIB cruise condition: 28 m/s at 12 degrees, sea level. */
  const ANCHOR_SPEED = 28
  /** @derived Twelve degrees, in radians. */
  const ANCHOR_INCIDENCE = (12 * Math.PI) / 180
  const ANCHOR_DENSITY = v(ISA.seaLevelDensity)

  /**
   * The Airlander's own hull planform, which is the area THIS model references
   * lift to. Aspect ratio and planform do not depend on the height, so an
   * arbitrary one is safe to pass here.
   *
   * @source Hull length and beam as recorded in AIRLANDER_DIMENSIONS, 92 m by
   * 42 m. The height is back-solved from the published 38,000 m3 envelope at
   * this module's own volume coefficient and cancels out of both quantities
   * used below.
   */
  const anchorGeometry = liftingBodyGeometry(m(92), m(42), m(16.75), 3)
  const dynamicPressure = 0.5 * ANCHOR_DENSITY * ANCHOR_SPEED * ANCHOR_SPEED
  const requiredCoefficient =
    (ANCHOR_WEIGHT_FRACTION * ANCHOR_MASS * v(CONSTANTS.g0)) /
    (dynamicPressure * anchorGeometry.planformArea)

  const s = Math.sin(ANCHOR_INCIDENCE)
  const c = Math.cos(ANCHOR_INCIDENCE)
  // Invert CL = k*a*s*c*(1 + VORTEX_LIFT_FRACTION*s) for k, the same expression
  // `hullLift` evaluates forwards.
  const shape = s * c * (1 + VORTEX_LIFT_FRACTION * s)
  return requiredCoefficient / (liftCurveSlope(anchorGeometry.aspectRatio) * shape)
})()

/**
 * Lift and induced drag of the hull at incidence.
 *
 * @derived Linear lift from Helmbold plus Polhamus vortex lift:
 *
 *   CL = CL_alpha * sin(alpha) * cos(alpha) + Kv * sin^2(alpha) * cos(alpha)
 *
 * The trigonometric form rather than the small-angle one, because a lifting body
 * is routinely flown at incidences where they differ by more than the accuracy
 * of anything else here.
 *
 * Induced drag is CL^2 / (pi * AR * e). At these aspect ratios the span
 * efficiency is close to unity for the potential part, but the vortex lift is
 * bought entirely with drag, so the whole CL is used. That is the honest form:
 * at AR 0.65 the induced drag at CL 0.3 is 0.044, which is comparable to the
 * ENTIRE zero-lift drag of a clean airship hull.
 *
 * @throws Outside the usable incidence range, because an extrapolated lift
 * coefficient produces a number and a number is what a caller will use.
 */
export const hullLift = (
  geometry: LiftingBodyGeometry,
  incidence: Radians,
  dynamicPressure: number,
): HullLift => {
  if (Math.abs(incidence) > MAXIMUM_USABLE_INCIDENCE) {
    throw new RangeError(
      `Incidence ${((incidence * 180) / Math.PI).toFixed(1)} degrees is outside the ` +
        `${((MAXIMUM_USABLE_INCIDENCE * 180) / Math.PI).toFixed(0)} degree range this model is valid over. ` +
        `A hull does not stall the way a wing does, but the pitch authority to hold it there runs out first, ` +
        `and beyond this the vortex lift model is extrapolation.`,
    )
  }

  const slope = liftCurveSlope(geometry.aspectRatio)
  const s = Math.sin(incidence)
  const c = Math.cos(incidence)

  const effective = slope * HULL_LIFT_EFFICIENCY
  const liftCoefficient =
    effective * s * c + VORTEX_LIFT_FRACTION * effective * s * Math.abs(s) * c

  /**
   * @source MEASURED induced drag of an airship hull at incidence, not the
   * elliptical-planform ideal. NACA TR-432 and NASA CR-137691 give
   * CDi = 1.976 * CL^2 referenced to planform area for a lifting-body hull.
   *
   * The ideal CL^2/(pi AR e) with e near unity gives 0.516 * CL^2 at this
   * aspect ratio, so the textbook figure is optimistic by a factor of 3.8. A
   * hull is not an elliptically loaded wing: it sheds vorticity along its whole
   * length rather than off two tips, and the span efficiency that implies is
   * 0.26 rather than 0.95.
   *
   * This module used the ideal form first, and it flattered hybridLift by
   * nearly four times on the term that decides whether it can be afforded.
   */
  const MEASURED_INDUCED_DRAG_FACTOR = 1.976
  const inducedDragCoefficient =
    MEASURED_INDUCED_DRAG_FACTOR * liftCoefficient * liftCoefficient

  const lift = liftCoefficient * dynamicPressure * geometry.planformArea
  const inducedDrag = inducedDragCoefficient * dynamicPressure * geometry.planformArea

  return {
    liftCoefficient,
    inducedDragCoefficient,
    lift: lift as Newtons,
    inducedDrag: inducedDrag as Newtons,
    liftToInducedDrag: inducedDrag === 0 ? Infinity : lift / inducedDrag,
  }
}

/**
 * Slowest speed at which the hull can carry a given heaviness, m/s.
 *
 * THE NUMBER THAT DECIDES WHETHER HYBRID-LIFT SUITS THIS MISSION. Such a vehicle
 * is not an airship that happens to fly a bit better; it is one that MUST keep
 * moving. Below this speed it descends, and there is no configuration change
 * that recovers it: buoyancy is fixed by the envelope and the hull makes no lift
 * standing still.
 *
 * Returns Infinity when the heaviness cannot be carried at any speed inside the
 * usable incidence range, which is a real answer.
 */
export const minimumFlyingSpeed = (
  geometry: LiftingBodyGeometry,
  heaviness: number,
  airDensity: number,
  /** @source Airship practice cruises well below the incidence limit. 12 degrees. */
  maximumIncidence: Radians = ((12 * Math.PI) / 180) as Radians,
): number => {
  if (heaviness <= 0) return 0

  /** @source Standard gravity, for turning a mass into a weight. */
  const g = 9.80665
  const weight = heaviness * g

  const clMax = hullLift(geometry, maximumIncidence, 1).liftCoefficient
  if (clMax <= 0) return Infinity

  return Math.sqrt((2 * weight) / (airDensity * geometry.planformArea * clMax))
}

/**
 * Zero-lift drag coefficient of an airship hull on volume^(2/3).
 *
 * @source NACA TR-432. The value the hybridLift power comparison needs, and it
 * is the same reference the conventional drag module uses.
 */
const HULL_ZERO_LIFT_DRAG = 0.024

/** @source Propeller plus drivetrain, for an electric vehicle at low speed. */
const PROPULSIVE_EFFICIENCY = 0.75

export interface StationKeepingPower {
  /** Continuous shaft power a heavy vehicle needs just to stay up, W. */
  readonly heavyPower: number
  /** Speed it must hold to do it, m/s. */
  readonly speed: number
  /** What the same hull needs neutrally buoyant, in the same wind, W. */
  readonly buoyantPower: number
  readonly ratio: number
  readonly verdict: string
}

/**
 * The comparison that settles hybridLift for a station-keeping mission.
 *
 * A vehicle flying 20 percent heavy must hold its minimum flying speed
 * continuously, and propulsive power goes as the CUBE of speed. The same hull
 * flown neutrally buoyant needs only to push against the wind, and in still air
 * it needs nothing at all.
 *
 * @source Calibrated against the Airlander: at its own 20 kt loiter speed the
 * hull provides 5.0 percent of MTOW aerodynamically, and 1.2 percent at 5 m/s.
 * The architecture's entire benefit evaporates at exactly the condition a
 * liveaboard spends its life in.
 */
export const stationKeepingPower = (
  geometry: LiftingBodyGeometry,
  heaviness: number,
  airDensity: number,
  windSpeed: number,
): StationKeepingPower => {
  const speed = minimumFlyingSpeed(geometry, heaviness, airDensity)

  const powerAt = (v: number, carryLift: boolean): number => {
    const q = 0.5 * airDensity * v * v
    const parasite = HULL_ZERO_LIFT_DRAG * q * Math.pow(geometry.volume, 2 / 3)
    if (!carryLift) return (parasite * v) / PROPULSIVE_EFFICIENCY
    /** @source Standard gravity, turning the heaviness into a lift requirement. */
    const g = 9.80665
    const cl = (heaviness * g) / (q * geometry.planformArea)
    /** @source The measured induced drag law, NACA TR-432 / NASA CR-137691. */
    const MEASURED_INDUCED_DRAG_FACTOR = 1.976
    const induced = MEASURED_INDUCED_DRAG_FACTOR * cl * cl * q * geometry.planformArea
    return ((parasite + induced) * v) / PROPULSIVE_EFFICIENCY
  }

  const heavyPower = heaviness > 0 && Number.isFinite(speed) ? powerAt(speed, true) : 0
  const buoyantPower = powerAt(windSpeed, false)

  return {
    heavyPower,
    speed,
    buoyantPower,
    ratio: buoyantPower === 0 ? Infinity : heavyPower / buoyantPower,
    verdict:
      heaviness <= 0
        ? `Neutrally buoyant: ${(buoyantPower / 1000).toFixed(1)} kW to hold station against ${windSpeed} m/s, and nothing at all in still air.`
        : `${(heavyPower / 1000).toFixed(0)} kW continuously to hold ${speed.toFixed(1)} m/s and stay up, against ${(buoyantPower / 1000).toFixed(1)} kW for the same hull flown neutrally buoyant in the same ${windSpeed} m/s wind. A factor of ${(heavyPower / buoyantPower).toFixed(0)}. There is no wind at which the heavy vehicle is cheaper, because the buoyant one pays only for the wind and the heavy one pays for the wind AND for staying up.`,
  }
}

export interface HybridLiftPenalty {
  /** Extra wetted area over a body of revolution of the same volume, fraction. */
  readonly wettedAreaPenalty: number
  /** Extra cover and film mass from that area, kg. */
  readonly skinMassPenalty: number
  /** Extra permeating area, m2. Lift lost every day, forever. */
  readonly permeationAreaPenalty: number
  /** Speed below which the hybridLift vehicle cannot hold altitude, m/s. */
  readonly minimumFlyingSpeed: number
  /** True when the vehicle can hold station at zero airspeed. */
  readonly canHover: boolean
  readonly verdict: string
}

/**
 * What a hybridLift vehicle costs a vehicle whose job is to stay up rather than to go
 * somewhere.
 *
 * The comparison is against a body of revolution of the SAME VOLUME, because
 * volume is what buys lift. A flattened hull holding the same gas has more skin,
 * and the skin is paid in three currencies at once: cover mass, film mass, and
 * permeation.
 *
 * @param conventionalWettedAreaCoefficient Wetted area over volume^(2/3) for the
 *   conventional hull being compared against. About 5.4 for a good airship form.
 * @param skinArealMass Combined cover and cell film areal mass, kg/m2.
 */
export const hybridLiftPenalty = (
  geometry: LiftingBodyGeometry,
  conventionalWettedAreaCoefficient: number,
  skinArealMass: number,
  heaviness: number,
  airDensity: number,
): HybridLiftPenalty => {
  const conventionalArea =
    conventionalWettedAreaCoefficient * Math.pow(geometry.volume, 2 / 3)
  const extraArea = geometry.wettedArea - conventionalArea
  const wettedAreaPenalty = extraArea / conventionalArea

  const speed = minimumFlyingSpeed(geometry, heaviness, airDensity)
  const canHover = heaviness <= 0

  return {
    wettedAreaPenalty,
    skinMassPenalty: extraArea * skinArealMass,
    permeationAreaPenalty: extraArea,
    minimumFlyingSpeed: speed,
    canHover,
    verdict: canHover
      ? `Neutrally buoyant, so it can hold station at zero airspeed and the hull lift is a bonus rather than a requirement. The ${(wettedAreaPenalty * 100).toFixed(0)} percent wetted area penalty and its ${(extraArea * skinArealMass).toFixed(0)} kg of extra skin are still paid every day.`
      : `${heaviness.toFixed(0)} kg heavy, so it must hold ${speed.toFixed(1)} m/s or descend. There is no configuration change that recovers this: buoyancy is fixed by the envelope and the hull makes no lift standing still. For a vehicle whose figure of merit is days aloft, that converts a ${(wettedAreaPenalty * 100).toFixed(0)} percent wetted area penalty and ${(extraArea * skinArealMass).toFixed(0)} kg of extra skin into a permanent propulsion bill as well.`,
  }
}
