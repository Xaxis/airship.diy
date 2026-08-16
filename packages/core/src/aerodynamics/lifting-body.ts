import type { Meters, Newtons, Radians, SquareMeters } from '@airship/units'

/**
 * Aerodynamic lift from the hull itself, for hybrid-lift architectures.
 *
 * A hybrid-lift airship carries part of its weight buoyantly and part on the
 * hull acting as a very low aspect ratio wing. The Airlander 10 is the flying
 * example: 38,000 m3, 98 m long, 50 m across, and somewhere between 60 and 80
 * percent of its weight held up by helium with the rest coming from the hull at
 * forward speed.
 *
 * WHY THIS MODULE EXISTS, AND WHY IT MOSTLY ARGUES AGAINST ITSELF. Hybrid-lift
 * solves the airship's worst operational problem: a vehicle that is exactly
 * neutrally buoyant is uncontrollable on the ground and has to trade ballast for
 * every kilogram of cargo. Flying heavy fixes that, which is why every serious
 * modern airship programme is hybrid-lift.
 *
 * It also does nothing whatsoever at zero airspeed, and THIS vehicle's figure of
 * merit is days aloft while holding station. `minimumFlyingSpeed` makes the
 * conflict quantitative: a vehicle 4 tonnes heavy must hold 8 m/s or descend,
 * and the power to do that for a year is not available from an array, because
 * propulsive power goes as the cube of speed.
 *
 * ONE MORE THING THE ENTHUSIASM LEAVES OUT. A flattened multi-lobe hull has far
 * more skin per unit volume than a body of revolution: 8.8 against 5.4 on the
 * wetted-area coefficient, calibrated on the Airlander. More skin is more cover
 * mass, more permeating area and more friction drag, and all three are paid
 * every hour of every day whether or not the vehicle is moving fast enough to
 * collect any hull lift at all.
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
 * the manufacturer's loiter speed is 20 knots. A single lift coefficient of
 * 0.07 at 12 degrees reproduces BOTH: 39.6 percent of MTOW at 28 m/s and 5.4
 * percent at 10.29 m/s, because lift goes as the square of speed and the two
 * conditions differ only in dynamic pressure.
 *
 * That coefficient implies an effective lift curve slope of 0.387 per radian,
 * against the 0.894 Helmbold gives for an aspect ratio of 0.581. So a lobed
 * hull achieves 43 percent of what a thin wing of the same aspect ratio would.
 *
 * IT IS NOT A FUDGE, IT IS THE DIFFERENCE BETWEEN A WING AND A BODY. Helmbold
 * describes a thin lifting surface; a hull is a thick body whose planform area
 * includes a great deal of volume that is not making lift, and whose flow
 * separates well before a wing's would. Using the thin-wing figure flattered
 * hybrid-lift by a factor of three on the term that decides whether it can be
 * afforded, and this module did exactly that in its first version.
 */
const HULL_LIFT_EFFICIENCY = 0.433

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
 * argument against hybrid lift. At the corrected coefficient the penalty is 4
 * to 7 percent against a body of revolution at the same volume, and against one
 * at the drag-optimum fineness the lobed hull is actually BETTER by about 5
 * percent. The architecture chapter rejected hybrid lift for a reason that was
 * an artifact of this constant. It is rejected here for other reasons, which
 * survive.
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

/**
 * Published dimensions for Airlander 10, which do not agree with each other.
 *
 * Recorded rather than resolved, per the project rule. The length is quoted as
 * 91 m (the HAV 304 / LEMV spec table), 92 m (the German Wikipedia article) and
 * 98 m (the English one). The beam is quoted as 34 m (again HAV 304), 42 m, 43.5
 * m, and 50 m as a "wingspan" that is almost certainly fin tip to fin tip. The
 * 33,285 kg MTOW and the AAIB lift measurement belong to the Airlander 10 set,
 * so mixing in the HAV 304 numbers, which this module did, describes no vehicle
 * at all.
 */
export const AIRLANDER_DIMENSION_DISCREPANCY = {
  lengthQuoted: [91, 92, 98],
  beamQuoted: [34, 42, 43.5, 50],
  note: 'The smallest of each is the HAV 304 spec table, a different configuration. Taking the smallest silently is the choice that flatters every derived coefficient, which is why this is written down instead.',
} as const

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
const LOBE_HIDDEN_FRACTION = 0.15

/**
 * Wetted area form factor for a body of revolution.
 *
 * @source A cylinder of the same length and diameter has pi*d*L. A well-formed
 * airship hull with a rounded nose and a fine tail comes to about 0.72 of that,
 * which is the figure the conventional hull module reproduces from its own
 * shape function.
 */
const REVOLUTION_AREA_FACTOR = 0.72

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

  const lobeDiameter = beam / lobes
  const bareLobeArea = REVOLUTION_AREA_FACTOR * Math.PI * lobeDiameter * length
  const wettedArea = lobes * bareLobeArea * (1 - LOBE_HIDDEN_FRACTION * (lobes - 1) / lobes)

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
 * hull pays for it in mass and in lift, and it is the term that quick hybrid-lift
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
   * This module used the ideal form first, and it flattered hybrid-lift by
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
 * @source NACA TR-432. The value the hybrid-lift power comparison needs, and it
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
 * The comparison that settles hybrid-lift for a station-keeping mission.
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
  /** Speed below which the hybrid-lift vehicle cannot hold altitude, m/s. */
  readonly minimumFlyingSpeed: number
  /** True when the vehicle can hold station at zero airspeed. */
  readonly canHover: boolean
  readonly verdict: string
}

/**
 * What a hybrid-lift vehicle costs a vehicle whose job is to stay up rather than to go
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
