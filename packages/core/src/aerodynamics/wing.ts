import type { HullGeometry } from '../geometry/hull.js'
import { liftCurveSlope } from './lifting-body.js'
import type { Newtons, Radians } from '@airship/units'
import { N } from '@airship/units'

/**
 * Real wings, outboard of a fully buoyant hull.
 *
 * WHY THIS IS THE RIGHT WAY TO BUY AERODYNAMIC LIFT, AND WHY IT STILL MIGHT NOT
 * BE WORTH BUYING.
 *
 * Induced drag goes as L^2 / (q * pi * b^2 * e). It depends on SPAN SQUARED and
 * not on planform area, which is the single fact that decides how to add a
 * lifting surface to an airship. Flattening the hull into lobes buys span the
 * expensive way: going from one lobe to three gains 33 percent more span for 48
 * percent more fabric, and delivers a surface with a span efficiency near 0.6 at
 * an aspect ratio around 0.5, where Helmbold gives 0.74 per radian against 2*pi
 * for a real wing. A wing of the same added area at aspect ratio 6 to 8 has a
 * span efficiency near 0.85 and, far more importantly, puts that area at the
 * EXTREMITIES where it extends b. Per square metre added it is worth roughly ten
 * times as much.
 *
 * So if this vehicle is to carry part of its weight aerodynamically, it should
 * do it with wings and not by fattening the envelope. That is settled.
 *
 * WHAT IS NOT SETTLED is whether it should carry any of its weight
 * aerodynamically at all, and the arithmetic is unkind. Hull drag saved by
 * flying lighter grows as v^3 while induced drag falls as 1/v^2, so a crossover
 * must exist, and it does: around 33 to 38 m/s for a realistic wing. At that
 * speed the vehicle needs of order 870 kW against an annual-average solar
 * harvest of about 31 kW. The crossover is real and it is outside the
 * powerplant by a factor of nearly thirty. Any transit at a reduced buoyancy
 * ratio is a FUEL-BURNING DASH and has to be priced against stored hydrogen,
 * never against the array.
 *
 * THE SECOND REASON FOR A WING, which nobody costs, is that it is FLAT. A hull
 * is a doubly curved surface whose photovoltaic modules spend most of the day at
 * a poor incidence, and the cosine losses are large. A wing's upper surface is
 * very nearly horizontal, which is the best orientation available to a vehicle
 * that cannot tilt its array. `wingSolarAdvantage` prices that, and on this
 * vehicle it turns out to be the larger of the two effects.
 */

export interface WingGeometry {
  readonly span: number
  readonly area: number
  readonly aspectRatio: number
  readonly meanChord: number
  /** Root chord, m, at the taper ratio below. */
  readonly rootChord: number
  readonly tipChord: number
  /** Structural mass, kg. */
  readonly mass: number
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
 * @source A carbon-framed, film-covered surface at the same 2.2 kg/m2 the fins
 * use, plus 40 percent for the spar carry-through and the attachment fittings,
 * which a fin does not need because it is not carrying a bending moment into a
 * pressurised hull. A wing root fitting on a fabric-covered airship is a hard
 * point and hard points are heavy.
 */
const WING_AREAL_MASS = 2.2 * 1.4

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

export const wingGeometry = (span: number, area: number): WingGeometry => {
  const meanChord = area / span
  const rootChord = (2 * meanChord) / (1 + TAPER_RATIO)
  return {
    span,
    area,
    aspectRatio: (span * span) / area,
    meanChord,
    rootChord,
    tipChord: rootChord * TAPER_RATIO,
    mass: area * WING_AREAL_MASS,
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

  const netDragAt = (speed: number): number => {
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
    return hullSaved - induced - profile
  }

  /** @derived Lower search bound, m/s. Below this the wing makes no lift worth the name. */
  const SEARCH_LOW = 1
  /** @derived Upper search bound, m/s. Nothing above this is reachable by any powerplant here. */
  const SEARCH_HIGH = 200
  let crossover = 0
  let previous = netDragAt(SEARCH_LOW)
  /** @derived Steps across the search range. */
  const STEPS = 400
  for (let i = 1; i <= STEPS; i += 1) {
    const speed = SEARCH_LOW + ((SEARCH_HIGH - SEARCH_LOW) * i) / STEPS
    const value = netDragAt(speed)
    if (previous < 0 && value >= 0) {
      crossover = speed
      break
    }
    previous = value
  }
  const crossoverExists = crossover > 0

  const crossoverQ = 0.5 * airDensity * crossover * crossover
  const crossoverPower = crossoverExists
    ? (hullDragCoefficient * crossoverQ * shrunkReference * crossover) / propulsiveEfficiency
    : Infinity

  // What it costs on station, which is where the vehicle spends its life. At
  // station-keeping speed the wing makes no useful lift and is pure parasite.
  const stationQ = 0.5 * airDensity * stationKeepingSpeed * stationKeepingSpeed
  const stationKeepingDragPenalty = WING_PROFILE_DRAG_COEFFICIENT * stationQ * wing.area
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
  /** Wing lift coefficient required. Above about 1.2 it is stalled. */
  readonly liftCoefficient: number
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
  /** @source A clean section with modest camber stalls around here. */
  stallCoefficient = 1.2,
): WingPayloadEnvelope => {
  const reference = hull.volume ** (2 / 3)
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
    const capped = Math.min(liftCoefficient, stallCoefficient)
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
      affordable: power <= installedPower,
      liftCoefficient: capped,
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
