import type { Kilograms, Newtons, Watts } from '@airship/units'

/**
 * Tilting propulsors: what they can lift, what they can hold, and what happens
 * when one stops.
 *
 * THE ONE PLACE IN THIS PROJECT WHERE THE ANSWER IS BETTER THAN EXPECTED.
 *
 * A buoyant vehicle does not have to lift its weight. It has to lift its
 * RESIDUAL HEAVINESS, which on a well-trimmed airship is a couple of percent of
 * the weight, so the thrust needed is two orders of magnitude below what a
 * helicopter of the same mass would need. Zeppelin NT is certified to 400 kg of
 * static heaviness at take-off on an 8,050 kg vehicle, which is 5.0 percent, and
 * it lifts that on tilting propellers.
 *
 * THE DESIGN VARIABLE THAT MATTERS IS DIAMETER AND NOTHING ELSE COMES CLOSE.
 * Momentum theory gives thrust proportional to (rho * A * P^2)^(1/3), so at
 * fixed power the thrust goes as the two-thirds power of disc area and therefore
 * as the four-thirds power of diameter. Doubling the diameter is worth 2.5 times
 * the thrust for the same kilowatt. Four 8 m propulsors hover this vehicle's
 * landing trim on the power it already has; four 3 m propulsors do not come
 * close. Everything else in the propulsion group is a rounding error against
 * that.
 *
 * AND A DUCT IS WORTH A FACTOR OF TWO IN STATIC THRUST at equal power, because
 * the shroud carries a suction load of its own and stops the tip vortex
 * contracting the wake. It costs in cruise, where the duct is wetted area doing
 * nothing, so the choice is not free: it is a hover-versus-endurance trade and
 * this vehicle spends its life in the second regime.
 *
 * MOMENTUM THEORY OVER-PREDICTS AND THE MARGIN IS LARGE. Against certified
 * airship installations the realisation factor is about 0.37: real thrust is a
 * third of the ideal, because of tip losses, non-uniform inflow, the download on
 * the body under the wake, and the fact that a propulsor sized for cruise is
 * badly matched at zero airspeed. Sizing an installation from momentum theory
 * alone would overstate what it can lift by nearly three times.
 */

export interface HoverCapability {
  /** Total disc area, m2. */
  readonly discArea: number
  /** Static thrust the installation makes, N. */
  readonly staticThrust: number
  /** Heaviness it can lift, kg. */
  readonly liftableHeaviness: number
  /** That heaviness as a fraction of gross weight. */
  readonly heavinessFraction: number
  /** Disc loading, N/m2. Low is good and it is the whole game. */
  readonly discLoading: number
  /** Power actually needed to hold the vehicle's own trim, W. */
  readonly powerAtTrim: number
  /** True when the installed power holds the trim. */
  readonly liftsItsTrim: boolean
  readonly note: string
}

/**
 * Realisation factor of a real installation against momentum theory.
 *
 * @source Derived from certified airship vectored-thrust installations: Zeppelin
 * NT lifts 400 kg of static heaviness on three 147 kW engines with 2.7 m
 * propellers, which is 0.37 of what momentum theory says that disc and that
 * power should give. Tip losses, non-uniform inflow, the download on the body
 * under the wake, and a propulsor sized for cruise operating at zero airspeed.
 */
export const VECTORED_THRUST_REALISATION = 0.37

/**
 * Static thrust gain from shrouding a propulsor.
 *
 * @source Measured shrouded against unshrouded static thrust at equal power, a
 * factor of two. The duct carries a suction load and prevents the wake
 * contracting. It costs in cruise, where it is wetted area doing nothing.
 */
export const DUCT_STATIC_THRUST_GAIN = 2

/** @source Standard gravity, m/s2. */
const G0 = 9.80665

/** @source ISA sea level air density, kg/m3. */
const SEA_LEVEL_DENSITY = 1.225

export const hoverCapability = (
  propulsorCount: number,
  diameter: number,
  installedPower: Watts,
  ducted: boolean,
  grossWeight: Kilograms,
  landingTrim: number,
  airDensity = SEA_LEVEL_DENSITY,
): HoverCapability => {
  const discArea = propulsorCount * Math.PI * ((diameter / 2) ** 2)

  /**
   * @derived Momentum theory static thrust: T = (2 * rho * A * P^2)^(1/3),
   * then knocked down to what real installations achieve and multiplied by the
   * duct gain if there is one.
   */
  const ideal = Math.cbrt(2 * airDensity * discArea * installedPower ** 2)
  const staticThrust = ideal * VECTORED_THRUST_REALISATION * (ducted ? DUCT_STATIC_THRUST_GAIN : 1)

  const liftableHeaviness = staticThrust / G0

  /**
   * @derived Inverting the same relation for the power a given thrust needs:
   * P = sqrt(T^3 / (2 * rho * A)), with the realisation and duct factors
   * applied to the thrust before inverting.
   */
  const trimThrust = (landingTrim * G0) / (VECTORED_THRUST_REALISATION * (ducted ? DUCT_STATIC_THRUST_GAIN : 1))
  const powerAtTrim = Math.sqrt(trimThrust ** 3 / (2 * airDensity * discArea))

  return {
    discArea,
    staticThrust,
    liftableHeaviness,
    heavinessFraction: liftableHeaviness / grossWeight,
    discLoading: installedPower / discArea,
    powerAtTrim,
    liftsItsTrim: powerAtTrim <= installedPower,
    note:
      `${propulsorCount} ${ducted ? 'ducted ' : ''}propulsors of ${diameter} m on ` +
      `${(installedPower / 1e3).toFixed(0)} kW lift ${liftableHeaviness.toFixed(0)} kg of ` +
      `heaviness, which is ${((liftableHeaviness / grossWeight) * 100).toFixed(1)} percent of the ` +
      `vehicle. Against a landing trim of ${landingTrim.toFixed(0)} kg it needs ` +
      `${(powerAtTrim / 1e3).toFixed(0)} kW, so it ${powerAtTrim <= installedPower ? 'CAN' : 'CANNOT'} ` +
      `lift itself off. DIAMETER IS THE ONLY VARIABLE THAT MATTERS HERE: thrust goes as the ` +
      `four-thirds power of it at fixed power, so doubling the diameter is worth 2.5 times the ` +
      `thrust for the same kilowatt, and no other change in the propulsion group comes close. ` +
      `Momentum theory alone would have promised ${(ideal / G0).toFixed(0)} kg, ` +
      `${(1 / VECTORED_THRUST_REALISATION).toFixed(1)} times what a certified installation ` +
      `achieves.`,
  }
}

export interface VectoredControl {
  /** Crosswind the propulsors can hold at zero airspeed, m/s. */
  readonly crosswindHold: number
  /** The same bow-on, where the vehicle is a streamlined body. */
  readonly headwindHold: number
  /** Ratio between them, which is why weathervaning is not optional. */
  readonly attitudeRatio: number
  readonly note: string
}

/**
 * What vectored thrust can hold the vehicle against at zero airspeed.
 *
 * THE ANSWER TO THE GROUND HANDLING PROBLEM, AND ONLY HALF OF IT. Two people can
 * hold this vehicle broadside in about a metre a second, which is what makes
 * ground handling the hardest unsolved part of the build chapter. Vectored
 * thrust does much better than two people and still does not solve the broadside
 * case, because the broadside force is fifty times the bow-on one and thrust
 * scales with power rather than with attitude.
 *
 * What it DOES solve is the requirement for a ground crew and a mast at all: a
 * vehicle that can hold itself bow-on in a serious wind does not need eighteen
 * people and two mechanical mules to dock. That is a real capability the rigid
 * design does not have, and it is worth naming precisely.
 */
export const vectoredControl = (
  staticThrust: Newtons,
  hullVolume: number,
  beamOnCoefficient: number,
  bowOnCoefficient: number,
  airDensity = SEA_LEVEL_DENSITY,
): VectoredControl => {
  const reference = hullVolume ** (2 / 3)
  const speedFor = (coefficient: number): number =>
    Math.sqrt((2 * staticThrust) / (coefficient * airDensity * reference))

  const crosswindHold = speedFor(beamOnCoefficient)
  const headwindHold = speedFor(bowOnCoefficient)

  return {
    crosswindHold,
    headwindHold,
    attitudeRatio: headwindHold / crosswindHold,
    note:
      `${(staticThrust / 1e3).toFixed(1)} kN of vectored thrust holds the vehicle bow-on in ` +
      `${headwindHold.toFixed(0)} m/s and broadside in ${crosswindHold.toFixed(1)}, a ratio of ` +
      `${(headwindHold / crosswindHold).toFixed(1)}. IT DOES NOT SOLVE THE BROADSIDE CASE and no ` +
      `plausible installation does, because the broadside force is more than an order of magnitude ` +
      `larger and thrust scales with power. What it solves is the requirement for a ground crew: a ` +
      `vehicle that holds itself bow-on in ${headwindHold.toFixed(0)} m/s does not need eighteen ` +
      `people and two mechanical mules to dock, which is a capability the rigid design does not ` +
      `have and one of the four blockers in the build chapter.`,
  }
}

export interface PropulsorOut {
  /** Share of the total each surviving unit must now carry. */
  readonly loadShare: number
  /** Heaviness the survivors can still lift, kg. */
  readonly remainingHeaviness: number
  /** True when the survivors still hold the landing trim. */
  readonly stillLands: boolean
  readonly note: string
}

/**
 * One propulsor stops during a vertical landing.
 *
 * THE STRONGEST ARGUMENT FOR THE WHOLE ARCHITECTURE, and it is worth stating
 * plainly because it is the opposite of the helicopter case. A heavier-than-air
 * VTOL that loses a rotor in the hover is descending immediately and the only
 * question is how hard it lands. A buoyant vehicle that loses a propulsor in the
 * hover is still buoyant: it loses the ability to place itself and keeps the
 * ability to stay up. The residual is a thrust problem rather than a control
 * one, and the answer to it is to be light rather than to be redundant.
 */
export const propulsorOut = (
  propulsorCount: number,
  hover: HoverCapability,
  landingTrim: number,
): PropulsorOut => {
  const surviving = propulsorCount - 1
  const loadShare = propulsorCount / surviving

  /**
   * @derived Thrust goes as the two-thirds power of disc area at fixed power
   * per unit, so losing one of N leaves (N-1)/N of both the disc and the power
   * and therefore (N-1)/N of the thrust. The survivors do not spin up.
   */
  const remainingHeaviness = hover.liftableHeaviness * (surviving / propulsorCount)

  return {
    loadShare,
    remainingHeaviness,
    stillLands: remainingHeaviness >= landingTrim,
    note:
      `Losing one of ${propulsorCount} leaves ${remainingHeaviness.toFixed(0)} kg of liftable ` +
      `heaviness against a ${landingTrim.toFixed(0)} kg trim, so the vehicle ` +
      `${remainingHeaviness >= landingTrim ? 'still lands under control' : 'cannot hold its trim'}. ` +
      `THIS IS THE STRONGEST ARGUMENT FOR THE ARCHITECTURE and it is the opposite of the ` +
      `helicopter case: a heavier-than-air VTOL that loses a rotor in the hover is descending ` +
      `immediately, and this one is still buoyant. It loses the ability to PLACE itself and keeps ` +
      `the ability to stay up. The survivors must carry ${loadShare.toFixed(2)} times their share, ` +
      `which is a thrust problem and not a control one, and the answer to it is to be light rather ` +
      `than to be redundant.`,
  }
}
