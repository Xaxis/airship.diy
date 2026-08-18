import type { HullGeometry } from '../geometry/hull.js'
import { liftCurveSlope } from './lifting-body.js'
import type { Newtons, Radians } from '@airship/units'
import { AERODYNAMIC_SURFACE_AREAL_MASS, v } from '@airship/data'
import { N } from '@airship/units'

/**
 * Real wings, outboard of a fully buoyant hull.
 *
 * WHY THIS IS THE RIGHT WAY TO BUY AERODYNAMIC LIFT, AND WHY IT STILL MIGHT NOT
 * BE WORTH BUYING.
 *
 * Induced drag goes as L^2 / (q * pi * b^2 * e). It depends on SPAN SQUARED and
 * not on planform area, which is the single fact that decides how to add a
 * lifting surface to an airship. Flattening the hull into lobes does buy span,
 * and the fabric bill is not what kills it. What kills it is the QUALITY of that
 * span: a lobed hull is a very low aspect ratio surface, and `lifting-body.ts`
 * measures what that costs rather than assuming it. Its calibration against the
 * Airlander gives an aspect ratio of 0.581, a lift-curve slope of 0.387 per
 * radian after HULL_LIFT_EFFICIENCY, and an induced-drag law of
 * CDi = 1.976 CL^2, which is a span efficiency of 0.28.
 *
 * Do not restate those three here, and in particular do not quote a span
 * efficiency without the aspect ratio it belongs to: the repo's hull law is a
 * flat CDi = 1.976 CL^2, so e = 1 / (pi * AR * 1.976) and it MOVES with AR.
 * Quoting one without the other is how "near 0.6" survived in this comment
 * while the module next door had measured 0.28.
 *
 * A wing of the same added area at aspect ratio 6 to 8 has a span efficiency
 * near 0.85 against that, and, far more importantly, puts its area at the
 * EXTREMITIES where it extends b.
 *
 * So if this vehicle is to carry part of its weight aerodynamically, it should
 * do it with wings and not by fattening the envelope. That is settled.
 *
 * WHAT IS NOT SETTLED is whether it should carry any of its weight
 * aerodynamically at all, and the arithmetic is unkind. Note first that the
 * question only arises at a REDUCED BUOYANCY RATIO. Fully buoyant, the gas
 * carries the whole weight at zero speed and for free, so there is no weight
 * for the wing to take off anything and no crossover exists at any speed: the
 * wing is pure added drag whenever it is not carrying payload. The trade below
 * therefore describes a vehicle deliberately flown heavy.
 *
 * On that footing: hull drag saved by flying lighter grows as v^3 while induced
 * drag falls as 1/v^2, so a crossover must exist. `wingTrade` finds it, and the
 * speed and the power are ITS answer rather than numbers written here. This
 * comment used to quote 870 kW, the solver returned 592, and the arrangement
 * told the reader "half a megawatt": three numbers for one quantity, which is
 * the failure CLAUDE.md names first.
 *
 * What is safe to say without computing it is the SHAPE of the answer. The
 * crossover is always fast, because of the v^3 against 1/v^2. It is always far
 * outside this vehicle's installed shaft power, which is tens of kilowatts
 * against the hundreds the crossover needs, and further still outside the
 * annual-average solar harvest. So any transit at a reduced buoyancy ratio is a
 * FUEL-BURNING DASH and has to be priced against stored hydrogen, never against
 * the array.
 *
 * THE SECOND REASON FOR A WING, which nobody costs, is that it is FLAT. A hull
 * is a doubly curved surface whose photovoltaic modules spend most of the day at
 * a poor incidence, and the cosine losses are large. A wing's upper surface is
 * very nearly horizontal, which is the best orientation available to a vehicle
 * that cannot tilt its array. `wingSolarAdvantage` prices that, AND IT IS THE
 * SMALLER OF THE TWO EFFECTS, because this project already took most of that
 * win elsewhere. The advantage goes as b / sin(b) in the array band half-angle
 * b, which is 36 percent at the 75 degrees this design started with and 5
 * percent at the 32 degrees it cut to. Five percent on the wing's own area is a
 * rounding error against what the hull band collects.
 */

export interface WingGeometry {
  /** Tip to tip, INCLUDING the part that crosses the hull. */
  readonly span: number
  /** Reference area, including the carryover across the hull. */
  readonly area: number
  readonly aspectRatio: number
  readonly meanChord: number
  /** Root chord, m, at the taper ratio below. */
  readonly rootChord: number
  readonly tipChord: number
  /**
   * Area of the EXPOSED panels, outboard of the hull. Less than the reference
   * area by whatever the hull occupies, and it is the only part that has to be
   * built, carried and hangared.
   */
  readonly exposedArea: number
  /** Exposed semi-span each side, m. */
  readonly exposedSemiSpan: number
  /**
   * Structural mass, kg: the exposed panels at full areal mass plus the
   * carry-through beam across the hull at half of it. Charging the whole
   * reference area overstates it and charging only the exposed area forgets
   * the most concentrated load path on the vehicle.
   */
  readonly mass: number
  /**
   * Body radius over wing semispan. Zero for a free-standing wing, and it is
   * what lets the payload envelope know a hull is there at all: before this
   * existed, a wing with 40 of its 60 m buried carried exactly what a
   * free-standing one carried.
   */
  readonly bodySpanFraction: number
}

/**
 * @source Taper ratio of a wing sized for structural efficiency rather than for
 * an elliptical lift distribution. 0.4 is the usual compromise and it is what
 * almost every transport wing uses.
 */
const TAPER_RATIO = 0.4

/**
 * Areal mass of a wing built the way this project builds everything else.
 *
 * FROM @airship/data, not restated here. It used to read `2.2 * 1.4`, where the
 * 40 percent uplift was justified as "the spar carry-through and the attachment
 * fittings". Both halves of that were wrong: this module charges the
 * carry-through separately, a few lines below, and the 2.2 it borrowed from the
 * fins already includes the attachment fitting by its own citation. So the
 * uplift charged the carry-through twice and the fittings against a source that
 * already contained them.
 */
const WING_AREAL_MASS = v(AERODYNAMIC_SURFACE_AREAL_MASS.arealMass)

/**
 * What the carryover section costs, as a fraction of the exposed wing's areal
 * mass.
 *
 * NOT ZERO, WHICH IS WHAT A NAIVE EXPOSED-AREA ACCOUNTING CHARGES. The span
 * inside the hull is not a lifting surface, but it is a spar carry-through: a
 * beam across the envelope reacting two wing root bending moments into a
 * structure that is mostly fabric. It is less than a wing per square metre
 * because it has no skin, no control surfaces and no leading edge, and it is far
 * from free because it is the single most concentrated load path on the vehicle.
 *
 * @source Half the exposed areal mass, which is the usual share for a
 * carry-through on an aircraft whose wing is not continuous.
 */
const CARRY_THROUGH_FRACTION = 0.5

/**
 * Span efficiency of a real wing at moderate aspect ratio.
 *
 * @source 0.85 is the standard figure for a tapered planform without twist
 * optimisation, against 1.0 for the elliptical ideal and about 0.6 for a lobed
 * hull acting as a lifting surface.
 */
export const WING_SPAN_EFFICIENCY = 0.85

/**
 * @source Profile drag coefficient of a clean laminar-flow section at the
 * Reynolds numbers this vehicle flies, referenced to wing area. 0.010 is
 * achievable on a smooth surface and is what the crossover analysis assumes; a
 * fabric-covered wing with exposed ribs would be two to three times this.
 */
export const WING_PROFILE_DRAG_COEFFICIENT = 0.01

/**
 * Lift coefficient at which the section stops working.
 *
 * ONE NUMBER, because the force model and the payload envelope have to agree
 * about where the wing stops flying. It lived as a private default parameter on
 * `wingPayloadEnvelope` and again as prose on `WingPayload.liftCoefficient`,
 * and `wingForces` knew about neither: it would return CL = 3.4 at 40 degrees
 * and an induced drag computed from it, and a caller would use that number.
 *
 * @source A clean section with modest camber stalls around here.
 */
export const WING_STALL_COEFFICIENT = 1.2

/**
 * Relative tolerance on "can the powerplant afford this".
 *
 * @derived On the power-limited branch the comparison sits exactly on its own
 * boundary by construction: the induced drag was sized to spend the whole
 * budget, so the recomputed power equals the installed power and floating point
 * decides the verdict. This is the difference between "spends exactly what it
 * has" and "unaffordable", and it is not a physical quantity.
 */
const AFFORDABILITY_EPSILON = 1e-9

/**
 * @param hullWidth Beam of the body the wing crosses, m. The part of the span
 *   inside it is carryover rather than structure, and passing zero gives a
 *   free-standing wing.
 *
 * THE DISTINCTION THIS EXISTS TO MAKE. A 40 m wing on a 23 m hull has 17 m of
 * exposed span, not 40, and MORE THAN HALF ITS REFERENCE AREA IS FUSELAGE. That
 * matters twice over. The reference span is the right one for induced drag,
 * because the body does carry lift across its width and the trailing vortices
 * leave from the tips; but the MASS follows the exposed panels, because that is
 * what has to be built. Charging areal mass against the reference area
 * overstates the wing by the carryover fraction, which here is most of it.
 *
 * The drawing showed this before the model did: the wings barely project past
 * the hull, and the reason is that on a fat body a modest span is mostly body.
 */
/**
 * Lift on the exposed panels in the presence of the body, K_W(B).
 *
 * Slender-body wing-body interference, NACA TR 1307 (Pitts, Nielsen and
 * Kaattari). Referenced to the wing formed by joining the exposed panels, so
 * K_W(B) > 1: a panel next to a body carries more than the same panel alone,
 * because the body's own upwash field adds to its incidence. The body's share
 * is K_B(W), and the two sum to (1 + lambda)^2 with lambda the body radius over
 * the wing semispan.
 *
 * THIS EXISTS TO CAP THE STALL. A section stall coefficient is a property of
 * the aerofoil, so it binds on the PANELS. Comparing it against a lift
 * coefficient referenced to the whole planform, most of which is hull, asks the
 * panels for a coefficient they do not have.
 *
 * @source Reproduces the published K_W(B) = 1.16 at lambda = 0.2.
 * Validity: 0 <= lambda < 1. At lambda -> 1 the hull has swallowed the span and
 * there is no panel left to stall.
 */
export const panelLiftFactor = (lambda: number): number => {
  if (lambda <= 0) return 1
  if (lambda >= 1) return Infinity
  /** @derived The slender-body integral, TR 1307 equation for K_W(B). */
  const numerator =
    (2 / Math.PI) *
    ((1 + lambda ** 4) * (0.5 * Math.atan(0.5 * (1 / lambda - lambda)) + Math.PI / 4) -
      lambda * lambda * (1 / lambda - lambda + 2 * Math.atan(lambda)))
  return numerator / (1 - lambda) ** 2
}

export const wingGeometry = (span: number, area: number, hullWidth = 0): WingGeometry => {
  const meanChord = area / span
  const rootChord = (2 * meanChord) / (1 + TAPER_RATIO)
  const exposedSemiSpan = Math.max((span - hullWidth) / 2, 0)

  /**
   * @derived Buried area by INTEGRATING THE DECLARED PLANFORM, not by taking a
   * fraction of the span. For a straight taper c(y) = rootChord * (1 - (1 -
   * TAPER_RATIO) * 2y / span), the area inboard of a half-width y is
   * 2 * rootChord * (y - (1 - TAPER_RATIO) * y^2 / span).
   *
   * `area * hullWidth / span` is the RECTANGULAR wing's answer, and this wing
   * is declared tapered a few lines above. The buried centre section is the
   * widest-chord part of the planform, so the rectangular form understates what
   * the hull swallows and overstates the panel. It ran the wrong way twice: the
   * panel it inflated is what the stall cap and the mass both key off, and the
   * carry-through it deflated is the most concentrated load path on the
   * vehicle. On a 40 m wing of 200 m2 across a 23.3 m hull it is the difference
   * between 84 m2 of panel and 63.
   */
  const buriedSemiSpan = Math.min(hullWidth, span) / 2
  const coveredArea =
    2 * rootChord * (buriedSemiSpan - ((1 - TAPER_RATIO) * buriedSemiSpan * buriedSemiSpan) / span)
  const exposedArea = Math.max(area - coveredArea, 0)

  /** @derived Body radius over wing semispan, the slender-body interference parameter. */
  const bodySpanFraction = span > 0 ? Math.min(hullWidth, span) / span : 0

  return {
    span,
    area,
    aspectRatio: (span * span) / area,
    meanChord,
    rootChord,
    tipChord: rootChord * TAPER_RATIO,
    exposedArea,
    exposedSemiSpan,
    bodySpanFraction,
    mass:
      exposedArea * WING_AREAL_MASS +
      (area - exposedArea) * WING_AREAL_MASS * CARRY_THROUGH_FRACTION,
  }
}

export interface WingForces {
  readonly lift: Newtons
  readonly inducedDrag: Newtons
  readonly profileDrag: Newtons
  readonly totalDrag: Newtons
  readonly liftCoefficient: number
}

/**
 * Lift and drag from the wing at a given incidence.
 *
 * @derived CL = a * alpha with Helmbold's finite-span slope; induced drag from
 * CDi = CL^2 / (pi * AR * e); profile drag from the section coefficient on wing
 * area. Nothing exotic, and nothing here is where the answer hides: the answer
 * hides in what the wing costs when it is not being used.
 */
export const wingForces = (
  wing: WingGeometry,
  incidence: Radians,
  dynamicPressure: number,
): WingForces => {
  const slope = liftCurveSlope(wing.aspectRatio)
  const liftCoefficient = slope * incidence

  // GUARD ON THE COEFFICIENT, not on a fixed angle, because the angle at which a
  // wing stalls depends on its aspect ratio through the lift-curve slope. Past
  // the section maximum the linear CL = a * alpha is not an approximation that
  // degrades, it is a different flow: lift falls rather than rises and the drag
  // is separation drag rather than induced. A number returned there would be
  // used, which is the whole reason this repository throws instead.
  if (Math.abs(liftCoefficient) > WING_STALL_COEFFICIENT) {
    throw new RangeError(
      `wingForces called at ${((incidence * 180) / Math.PI).toFixed(1)} degrees, where the ` +
        `lift coefficient would be ${liftCoefficient.toFixed(2)} against a section maximum of ` +
        `${WING_STALL_COEFFICIENT}. Past the stall the linear lift-curve slope does not describe ` +
        `the flow at all, and neither does the induced drag computed from it.`,
    )
  }

  const lift = liftCoefficient * dynamicPressure * wing.area
  const inducedCoefficient =
    (liftCoefficient * liftCoefficient) /
    (Math.PI * wing.aspectRatio * WING_SPAN_EFFICIENCY)
  const inducedDrag = inducedCoefficient * dynamicPressure * wing.area
  const profileDrag = WING_PROFILE_DRAG_COEFFICIENT * dynamicPressure * wing.area
  return {
    lift: N(lift),
    inducedDrag: N(inducedDrag),
    profileDrag: N(profileDrag),
    totalDrag: N(inducedDrag + profileDrag),
    liftCoefficient,
  }
}

export interface WingTrade {
  readonly wing: WingGeometry
  /** Speed at which the drag saved by flying lighter equals the drag the wing adds, m/s. */
  readonly crossoverSpeed: number
  /** Power the vehicle needs at that speed, W. */
  readonly crossoverPower: number
  /** Extra drag the wing costs at the station-keeping speed, N. */
  readonly stationKeepingDragPenalty: number
  /** That penalty as a fraction of the station-keeping power. */
  readonly stationKeepingPowerPenalty: number
  /** True when a crossover exists inside the speed range searched. */
  readonly crossoverExists: boolean
  readonly verdict: string
}

/**
 * Does the wing earn its keep?
 *
 * @param buoyancyRatio Fraction of weight carried buoyantly in transit. The
 *   wing carries the rest.
 * @param stationKeepingSpeed The speed the vehicle spends its life at, m/s.
 * @param hullDragCoefficient Volumetric drag coefficient of the complete ship.
 */
export const wingTrade = (
  wing: WingGeometry,
  hull: HullGeometry,
  grossWeight: number,
  buoyancyRatio: number,
  stationKeepingSpeed: number,
  airDensity: number,
  hullDragCoefficient: number,
  propulsiveEfficiency: number,
): WingTrade => {
  const reference = hull.volume ** (2 / 3)
  const weightToCarry = grossWeight * (1 - buoyancyRatio)

  /**
   * @derived Flying at a reduced buoyancy ratio means holding less gas, so the
   * hull is smaller and its parasite drag falls as volume to the two thirds.
   * That is the ONLY thing the trade has to offer, and it is why the crossover
   * exists at all.
   */
  const shrunkReference = (hull.volume * buoyancyRatio) ** (2 / 3)

  // Returned as components rather than a net, so the power at the crossover can
  // be assembled from the same three terms the root was found from and the
  // induced-drag formula is not written twice.
  const dragsAt = (speed: number) => {
    const q = 0.5 * airDensity * speed * speed
    const hullSaved = hullDragCoefficient * q * (reference - shrunkReference)
    // The wing must make exactly the lift the buoyancy no longer does.
    const requiredCoefficient = weightToCarry / (q * wing.area)
    const induced =
      ((requiredCoefficient * requiredCoefficient) /
        (Math.PI * wing.aspectRatio * WING_SPAN_EFFICIENCY)) *
      q *
      wing.area
    const profile = WING_PROFILE_DRAG_COEFFICIENT * q * wing.area
    const shrunkHull = hullDragCoefficient * q * shrunkReference
    return { q, hullSaved, induced, profile, shrunkHull, net: hullSaved - induced - profile }
  }
  const netDragAt = (speed: number): number => dragsAt(speed).net

  /** @derived Lower search bound, m/s. Below this the wing makes no lift worth the name. */
  const SEARCH_LOW = 1
  /** @derived Upper search bound, m/s. Nothing above this is reachable by any powerplant here. */
  const SEARCH_HIGH = 200

  // BRACKET, THEN BISECT. The old loop returned the first grid point at or past
  // the sign change and never interpolated, so it was biased high by up to a
  // step and never low, on a number the website prints.
  let crossover = 0
  const low = netDragAt(SEARCH_LOW)
  const high = netDragAt(SEARCH_HIGH)
  if (low < 0 && high >= 0) {
    let a = SEARCH_LOW
    let b = SEARCH_HIGH
    /** @derived Bisections. netDragAt is monotone across the bracket (hull saved and profile go as v^2, induced as 1/v^2), so 60 steps is exact to well below a millimetre per second. */
    const BISECTIONS = 60
    for (let i = 0; i < BISECTIONS; i += 1) {
      const mid = (a + b) / 2
      if (netDragAt(mid) < 0) a = mid
      else b = mid
    }
    crossover = (a + b) / 2
  }
  const crossoverExists = crossover > 0

  /**
   * Power the WHOLE VEHICLE needs at the crossover, which is what the field is
   * documented as and what the verdict string prints.
   *
   * This used to charge only the shrunk hull's parasite drag and omit the wing's
   * own induced and profile drag entirely. At the crossover those are not
   * negligible: by its definition they are exactly equal to the hull drag saved,
   * so leaving them out understated the cost of the dash by the full ratio of
   * the two references, and in the direction that flatters the wing.
   *
   * The identity is worth stating because it is also the test: at the crossover
   * the winged vehicle costs exactly what the unshrunk fully buoyant one costs.
   */
  const atCrossover = dragsAt(crossover)
  const crossoverPower = crossoverExists
    ? ((atCrossover.shrunkHull + atCrossover.induced + atCrossover.profile) * crossover) /
      propulsiveEfficiency
    : Infinity

  // What it costs on station, which is where the vehicle spends its life. At
  // station-keeping speed the wing makes no useful lift and is pure parasite.
  const stationQ = 0.5 * airDensity * stationKeepingSpeed * stationKeepingSpeed
  // Charged on the EXPOSED PANELS. Profile drag is skin friction plus form drag
  // on a wetted surface, and the span inside the hull has no wetted surface of
  // its own: it is a beam inside an envelope that is already paying its own
  // drag. Charging the reference area overstated the penalty by area over
  // exposed area, which on a fat body is most of it.
  const stationKeepingDragPenalty =
    WING_PROFILE_DRAG_COEFFICIENT * stationQ * (wing.exposedArea > 0 ? wing.exposedArea : wing.area)
  const hullStationDrag = hullDragCoefficient * stationQ * reference
  const stationKeepingPowerPenalty = stationKeepingDragPenalty / hullStationDrag

  return {
    wing,
    crossoverSpeed: crossover,
    crossoverPower,
    stationKeepingDragPenalty,
    stationKeepingPowerPenalty,
    crossoverExists,
    verdict: crossoverExists
      ? `A ${wing.span.toFixed(0)} m wing of ${wing.area.toFixed(0)} m2 lets the vehicle fly at ` +
        `${(buoyancyRatio * 100).toFixed(0)} percent buoyancy, and it starts paying at ` +
        `${crossover.toFixed(0)} m/s, where the vehicle needs ` +
        `${(crossoverPower / 1e3).toFixed(0)} kW. THAT IS A DASH, NOT A CRUISE: the hull drag it ` +
        `saves grows as the cube of speed while its own induced drag falls as the inverse square, ` +
        `so the crossover is always fast. Below it the wing is pure cost, and at the ` +
        `${stationKeepingSpeed} m/s this vehicle actually lives at it adds ` +
        `${(stationKeepingPowerPenalty * 100).toFixed(1)} percent to the station-keeping power ` +
        `and ${wing.mass.toFixed(0)} kg to the empty weight, every hour of every day.`
      : `No crossover exists at any speed. The wing costs ${wing.mass.toFixed(0)} kg and ` +
        `${(stationKeepingPowerPenalty * 100).toFixed(1)} percent of the station-keeping power and ` +
        `never repays either.`,
  }
}

export interface WingSolarAdvantage {
  /** Array area the wing offers, m2. */
  readonly area: number
  /** Mean cosine of incidence over a day on a flat horizontal surface. */
  readonly flatCosine: number
  /** The same for a doubly curved hull band, from the hull's own geometry. */
  readonly hullCosine: number
  /** How much more energy a square metre on the wing collects than one on the hull. */
  readonly advantage: number
  /** Module mass the wing array adds, kg. */
  readonly moduleMass: number
  readonly note: string
}

/**
 * What a flat surface is worth against a curved one, for photovoltaics.
 *
 * THE ARGUMENT FOR WINGS THAT NOBODY MAKES. A wing's upper surface is very
 * nearly horizontal, which is the best orientation available to a vehicle that
 * cannot tilt its array. A hull is doubly curved: at any instant most of its
 * band is at a poor incidence to the sun and the cosine losses are severe, and
 * they are severe in a way that is invisible if you multiply array area by peak
 * irradiance.
 *
 * @param hullCoverageHalfAngle Half-angle of the hull's array band, radians.
 *   The wider the band the worse its mean cosine, which is why widening it has
 *   sharply diminishing returns and why this project cut its band from 75
 *   degrees to 32.
 *
 * @derived Mean of cos(theta) over a band of half-angle b, taken about the
 * crown, is sin(b)/b. A flat horizontal surface has cos(theta) = 1 at every
 * point by definition, so the advantage is b/sin(b), which is 1 at a hairline
 * band and grows without bound as the band wraps toward the equator.
 */
export const wingSolarAdvantage = (
  wingArea: number,
  hullCoverageHalfAngle: number,
  moduleArealMass: number,
): WingSolarAdvantage => {
  const flatCosine = 1
  const hullCosine =
    hullCoverageHalfAngle > 0 ? Math.sin(hullCoverageHalfAngle) / hullCoverageHalfAngle : 1
  const advantage = flatCosine / hullCosine
  const moduleMass = wingArea * moduleArealMass
  return {
    area: wingArea,
    flatCosine,
    hullCosine,
    advantage,
    moduleMass,
    note:
      `A square metre of wing collects ${advantage.toFixed(2)} times what a square metre of the ` +
      `hull band does, because the band's mean cosine over its ` +
      `${((hullCoverageHalfAngle * 180) / Math.PI).toFixed(0)} degree half-angle is ` +
      `${hullCosine.toFixed(3)} and a flat surface's is 1. On ${wingArea.toFixed(0)} m2 that is ` +
      `${moduleMass.toFixed(0)} kg of module for the collection of ` +
      `${(wingArea * advantage).toFixed(0)} equivalent square metres of hull. THE ADVANTAGE GROWS ` +
      `WITH THE BAND: it is the same arithmetic that made widening the hull band stop paying.`,
  }
}


export interface WingPayload {
  readonly speed: number
  /** Extra weight the wing can hold up at this speed, kg. */
  readonly extraPayload: number
  /** Power the whole vehicle needs to fly there, W. */
  readonly power: number
  /** True when that power is inside what is installed. */
  readonly affordable: boolean
  /**
   * Lift coefficient required, referenced to the WING AREA and therefore not
   * comparable to a section stall value directly: see `stallLimited`.
   */
  readonly liftCoefficient: number
  /**
   * True when the exposed panels reached their section maximum before the
   * powerplant ran out. On a wing whose span is mostly hull this is the usual
   * case, and a caller that cannot tell which branch produced the answer cannot
   * tell whether more power would buy anything.
   */
  readonly stallLimited: boolean
  /** Incidence the reference coefficient implies, rad. */
  readonly requiredIncidence: number
}

export interface WingPayloadEnvelope {
  readonly points: readonly WingPayload[]
  /** The most extra weight the wing can carry on the installed power, kg. */
  readonly bestPayload: number
  /** The speed at which it does that, m/s. */
  readonly bestSpeed: number
  readonly note: string
}

/**
 * What the wing is actually for, once the crossover question is set aside.
 *
 * THE CROSSOVER ANSWERS THE WRONG QUESTION. It asks at what speed a wing makes
 * the vehicle more efficient, and the answer is always "faster than you can
 * fly", because hull drag saved grows as the cube of speed. But nobody adds
 * wings to an airship for efficiency. They add them to CARRY MORE, and that is
 * a different sum with a different answer.
 *
 * At a fixed installed power, flying slower makes the hull cheap and the wing
 * expensive: hull drag falls as v^2 while the lift coefficient the wing needs
 * rises as 1/v^2 and its induced drag as 1/v^2 again. Somewhere in between there
 * is a speed at which the most extra weight can be held up inside the power the
 * vehicle actually has, and that speed is SLOW. It is a loiter-and-carry
 * capability rather than a dash, which is the opposite of what the crossover
 * analysis suggests and is much better suited to this vehicle.
 *
 * @param installedPower Shaft power available, W.
 * @param stallCoefficient Wing lift coefficient at which the section stalls.
 */
export const wingPayloadEnvelope = (
  wing: WingGeometry,
  hull: HullGeometry,
  airDensity: number,
  hullDragCoefficient: number,
  installedPower: number,
  propulsiveEfficiency: number,
  stallCoefficient = WING_STALL_COEFFICIENT,
): WingPayloadEnvelope => {
  const reference = hull.volume ** (2 / 3)

  /**
   * THE STALL BINDS ON THE PANELS, NOT ON THE PLANFORM.
   *
   * `stallCoefficient` is a section property. The lift coefficient this sweep
   * computes is referenced to `wing.area`, most of which is hull on a fat body:
   * on the baseline, 69 percent of the reference area is inside the envelope.
   * Comparing the two directly asked the 63 m2 of real panel for a coefficient
   * of 3.8, which is a deeply stalled wing reported as an unstalled one, and
   * because the optimum sits exactly on this cap it set the headline answer.
   *
   * Converting between them needs the wing-body interference split. The panels
   * carry K_W(B) / (1 + lambda)^2 of the configuration's lift on
   * exposedArea / area of its reference area, so the reference coefficient at
   * which they reach their section maximum is the section value scaled by both.
   *
   * The limits are the check that this is the right form: at lambda = 0 it
   * recovers the section value for a free-standing wing, and as the hull
   * swallows the span it goes to zero.
   */
  const lambda = wing.bodySpanFraction
  const referenceStallCoefficient =
    lambda <= 0
      ? stallCoefficient
      : (stallCoefficient * (wing.exposedArea / wing.area) * (1 + lambda) ** 2) /
        panelLiftFactor(lambda)

  /** @derived Standard gravity, m/s2, for turning a force into a mass. */
  const G0 = 9.80665
  /** @derived Lowest speed swept, m/s. Below this the wing makes no useful lift. */
  const LOW = 5
  /** @derived Highest speed swept, m/s. Above this nothing is affordable on this powerplant. */
  const HIGH = 30
  /** @derived Samples across that range, giving half a metre per second of resolution. */
  const STEPS = 51

  const points: WingPayload[] = []
  let bestPayload = 0
  let bestSpeed = 0

  for (let i = 0; i < STEPS; i += 1) {
    const speed = LOW + ((HIGH - LOW) * i) / (STEPS - 1)
    const q = 0.5 * airDensity * speed * speed
    const hullDrag = hullDragCoefficient * q * reference
    const profileDrag = WING_PROFILE_DRAG_COEFFICIENT * q * wing.area

    // Power left for induced drag once the hull and the wing's own profile are
    // paid for. If there is none, the wing carries nothing here.
    const powerBudget = installedPower * propulsiveEfficiency
    const dragBudget = powerBudget / speed - hullDrag - profileDrag

    let liftCoefficient = 0
    if (dragBudget > 0) {
      // CDi = CL^2 / (pi AR e), and D_i = CDi q S, so
      // CL = sqrt(D_i pi AR e / (q S)).
      liftCoefficient = Math.sqrt(
        (dragBudget * Math.PI * wing.aspectRatio * WING_SPAN_EFFICIENCY) / (q * wing.area),
      )
    }
    const capped = Math.min(liftCoefficient, referenceStallCoefficient)
    const stallLimited = liftCoefficient > referenceStallCoefficient
    const lift = capped * q * wing.area
    const extraPayload = lift / G0

    // Recompute the power actually used at the capped coefficient, because a
    // stalled-out wing does not spend the whole budget.
    const inducedDrag =
      ((capped * capped) / (Math.PI * wing.aspectRatio * WING_SPAN_EFFICIENCY)) * q * wing.area
    const power = ((hullDrag + profileDrag + inducedDrag) * speed) / propulsiveEfficiency

    if (extraPayload > bestPayload) {
      bestPayload = extraPayload
      bestSpeed = speed
    }

    points.push({
      speed,
      extraPayload,
      power,
      affordable: power <= installedPower * (1 + AFFORDABILITY_EPSILON),
      liftCoefficient: capped,
      stallLimited,
      /**
       * @derived Incidence the reference coefficient implies, rad. Reported so
       * a caller can see whether the answer sits on a trim state the vehicle
       * could actually hold.
       */
      requiredIncidence: capped / liftCurveSlope(wing.aspectRatio),
    })
  }

  return {
    points,
    bestPayload,
    bestSpeed,
    note:
      `A ${wing.span.toFixed(0)} m wing of ${wing.area.toFixed(0)} m2 carries up to ` +
      `${bestPayload.toFixed(0)} kg of extra weight at ${bestSpeed.toFixed(0)} m/s on the ` +
      `${(installedPower / 1e3).toFixed(0)} kW installed. THAT IS THE CAPABILITY, and it is a ` +
      `loiter-and-carry rather than a dash: flying slower makes the hull cheap and the wing dear, ` +
      `flying faster does the reverse, and the best carrying speed sits between them well below ` +
      `the speed at which a wing would start to SAVE power. The wing still costs ` +
      `${wing.mass.toFixed(0)} kg and its profile drag every hour it is not carrying anything, ` +
      `which is the trade the design has to justify.`,
  }
}
