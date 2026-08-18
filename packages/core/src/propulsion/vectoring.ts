import type { Kilograms, Newtons, Watts } from '@airship/units'
import { uncertain, v } from '@airship/data'

/**
 * Tilting propulsors: what they can lift, what they can hold, and what happens
 * when one stops.
 *
 * THE ONE PLACE IN THIS PROJECT WHERE THE ANSWER IS BETTER THAN EXPECTED.
 *
 * A buoyant vehicle does not have to lift its weight. It has to lift its
 * RESIDUAL HEAVINESS, which on a well-trimmed airship is a couple of percent of
 * the weight, so the thrust needed is two orders of magnitude below what a
 * helicopter of the same mass would need. Zeppelin NT is CERTIFIED to 400 kg of
 * static heaviness at take-off on an 8,050 kg vehicle, which is 5.0 percent,
 * and it lifts that on tilting propellers. Note the word certified: that is an
 * operating limit in a flight manual, not a measurement of what the
 * installation can lift, and it is not evidence for any particular realisation
 * factor. See VECTORED_THRUST_REALISATION.
 *
 * DIAMETER AND POWER ARE WORTH EXACTLY THE SAME, PERCENT FOR PERCENT. Momentum
 * theory gives T = (2 rho A P^2)^(1/3). The area sits inside the cube root to
 * the first power, so T goes as A^(1/3), which is D^(2/3), and power goes as
 * P^(2/3): the same exponent. Differentiating,
 *
 *   dT/T = (2/3) dD/D + (2/3) dP/P
 *
 * so a one percent bigger disc and a one percent bigger motor buy the same one
 * percent more thrust. Doubling either is worth 2^(2/3) = 1.59 times.
 *
 * THIS MODULE USED TO CLAIM THE OPPOSITE, that thrust goes as D^(4/3) and that
 * "diameter is the only variable that matters", which reads the exponent off
 * the area rather than off the cube root of the area. It is the reason the
 * propulsors grew from 4.6 m to 6 m rather than the motors growing, and the
 * flight page printed the correct formula and the wrong conclusion drawn from
 * it in consecutive clauses. Which lever to pull is a mass and drag question,
 * not an exponent one: a bigger disc costs structure and cruise drag, a bigger
 * motor costs motor mass and nothing else.
 *
 * MOMENTUM THEORY OVER-PREDICTS AND BY HOW MUCH IS NOT MEASURED. See
 * VECTORED_THRUST_REALISATION: the figure this module used to carry was pinned
 * to a Zeppelin NT number that turns out to be a certified operating LIMIT on
 * static heaviness rather than a measurement of what the installation lifts, so
 * it cannot calibrate anything, and the arithmetic offered for it did not
 * reproduce it either.
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
 * IT USED TO BE 0.37, JUSTIFIED BY A CALCULATION THAT GIVES 0.195. The stated
 * derivation was Zeppelin NT lifting 400 kg on three engines with 2.7 m
 * propellers. Two things are wrong with it. The arithmetic does not reproduce
 * the constant, and the data point cannot support any constant: 400 kg is the
 * certified operating limit on static heaviness at take-off, which is what the
 * flight manual permits, not a measurement of what the installation can lift.
 * Read as a measurement it implies a propeller figure of merit of 0.086, since
 * the realisation is FM^(2/3), and no propeller achieves that even stalled.
 *
 * So it is uncertain, and the range is built from the physics rather than from
 * the anecdote. A well-designed static propeller reaches a figure of merit of
 * 0.6 to 0.75, which is a realisation of 0.71 to 0.83 before installation
 * effects; the download on the hull under the wake, non-uniform inflow, and a
 * blade optimised for cruise working at zero advance ratio take back 10 to 30
 * percent of that.
 */
export const VECTORED_THRUST_REALISATION = v(
  uncertain({
    low: 0.45,
    nominal: 0.62,
    high: 0.78,
    unit: '1',
    reason:
      'No measured static thrust exists for a vectored airship installation of this size. The low end is a cruise-optimised blade with a heavy hull download; the high end is a purpose-designed lift rotor with little.',
    resolvedBy:
      'A static thrust measurement on the chosen propulsor, or a figure of merit from its manufacturer at zero advance ratio.',
  }),
)

/**
 * Static thrust gain from shrouding a propulsor, AT EQUAL POWER.
 *
 * THE FOLKLORE FACTOR OF TWO IS THE AREA EFFECT, NOT THE POWER EFFECT, and this
 * constant used to carry it with the wrong label. An open rotor's wake
 * contracts to half the disc area, so a duct that holds the wake at the disc
 * doubles the effective wake area and doubles the thrust AT FIXED INDUCED
 * VELOCITY. Hold POWER fixed instead, which is what a propulsion installation
 * actually does, and T goes as A^(1/3): doubling the effective area is worth
 * 2^(1/3) = 1.26. A factor of two at equal power is above the ideal-flow
 * ceiling, so no measurement can have produced it.
 *
 * @source The ideal ducted-fan result at fixed power, 2^(1/3), derated for
 * duct internal and external drag, which a real shroud does not escape.
 */
export const DUCT_STATIC_THRUST_GAIN = v(
  uncertain({
    low: 1.05,
    nominal: 1.18,
    high: 1.26,
    unit: '1',
    reason:
      'The 1.26 ceiling is the ideal-flow result at fixed power. What a real duct keeps of it depends on its length, lip radius and internal losses, none of which are chosen yet.',
    resolvedBy: 'A duct design, or static thrust measured shrouded against unshrouded at equal power.',
  }),
)

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
  /**
   * Smallest tilt authority in the fleet, radians. Every unit's thrust is
   * counted as fully vertical, which is only true at 90 degrees: a unit that
   * tilts to 60 puts sin(60) = 0.866 of its thrust upward and the remaining
   * half horizontally, where it has to be trimmed out by tilting another unit
   * back, costing more again.
   *
   * Defaults to full authority so existing callers are unchanged, and warns
   * rather than silently over-promising when it is not.
   */
  minimumVectorAuthority = Math.PI / 2,
): HoverCapability => {
  if (minimumVectorAuthority < Math.PI / 2) {
    // Not a throw: a partial-authority installation is a real design, it just
    // is not the one this closed form describes.
    console.warn(
      `hoverCapability assumes every propulsor tilts to vertical, and the least capable in this ` +
        `fleet reaches ${((minimumVectorAuthority * 180) / Math.PI).toFixed(0)} degrees. Its ` +
        `vertical component is ${Math.sin(minimumVectorAuthority).toFixed(3)} of its thrust and ` +
        `the rest has to be trimmed out. Treat the result as an upper bound.`,
    )
  }
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
    // THRUST over area, which is what disc loading means and what the field is
    // named after. It used to be POWER over area, which is power loading in
    // W/m2: a different quantity, in different units, reported under the name
    // of this one.
    discLoading: staticThrust / discArea,
    powerAtTrim,
    liftsItsTrim: powerAtTrim <= installedPower,
    note:
      `${propulsorCount} ${ducted ? 'ducted ' : ''}propulsors of ${diameter} m on ` +
      `${(installedPower / 1e3).toFixed(0)} kW lift ${liftableHeaviness.toFixed(0)} kg of ` +
      `heaviness, which is ${((liftableHeaviness / grossWeight) * 100).toFixed(1)} percent of the ` +
      `vehicle. Against a landing trim of ${landingTrim.toFixed(0)} kg it needs ` +
      `${(powerAtTrim / 1e3).toFixed(0)} kW, so it ${powerAtTrim <= installedPower ? 'CAN' : 'CANNOT'} ` +
      `lift itself off. DIAMETER AND POWER ARE WORTH THE SAME, percent for percent: thrust goes ` +
      `as (rho A P^2)^(1/3), so both carry the exponent 2/3 and doubling either is worth 1.59 ` +
      `times. Which one to buy is a mass and drag question rather than an exponent one. ` +
      `Momentum theory alone would have promised ${(ideal / G0).toFixed(0)} kg, ` +
      `${(ideal / (staticThrust || 1)).toFixed(1)} times what this installation is assumed to ` +
      `achieve, and that assumption is UNCERTAIN rather than measured: see ` +
      `VECTORED_THRUST_REALISATION.`,
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
/**
 * Static thrust of ONE propulsor, N.
 *
 * Exported because the fleet is not identical and lumping total area against
 * total power is only right when it is.
 */
export const staticThrustOf = (
  diameter: number,
  ratedPower: number,
  ducted: boolean,
  airDensity = SEA_LEVEL_DENSITY,
): number => {
  const area = Math.PI * (diameter / 2) ** 2
  const ideal = Math.cbrt(2 * airDensity * area * ratedPower ** 2)
  return ideal * VECTORED_THRUST_REALISATION * (ducted ? DUCT_STATIC_THRUST_GAIN : 1)
}

/**
 * What is left after the WORST single propulsor failure.
 *
 * THE (N-1)/N LAW IS ONLY RIGHT FOR N IDENTICAL UNITS, and this vehicle's are
 * not: two large ones amidships and two smaller ones aft. Losing a large one
 * removes 30 percent of the thrust rather than 25, and since the landing trim
 * was set by this very case with a margin of four kilograms, the difference
 * decides the gate rather than shading it.
 *
 * It also has to be the worst loss and not an average one. A failure mode
 * analysis that averages over which unit fails is not a failure mode analysis.
 */
export const propulsorOut = (
  units: readonly { readonly diameter: number; readonly ratedPower: number; readonly ducted: boolean }[],
  landingTrim: number,
  airDensity = SEA_LEVEL_DENSITY,
): PropulsorOut => {
  if (units.length < 2) throw new RangeError('A propulsor-out case needs at least two propulsors.')

  const thrusts = units.map((u) => staticThrustOf(u.diameter, u.ratedPower, u.ducted, airDensity))
  const total = thrusts.reduce((sum, t) => sum + t, 0)

  // The worst loss is the largest single contribution.
  const lost = Math.max(...thrusts)
  const remainingThrust = total - lost
  const remainingHeaviness = remainingThrust / G0
  const loadShare = total / remainingThrust

  /** @derived What the naive equal-units law would have said, for the comparison. */
  const naive = (total * (units.length - 1)) / units.length / G0

  return {
    loadShare,
    remainingHeaviness,
    stillLands: remainingHeaviness >= landingTrim,
    note:
      `Losing the LARGEST of ${units.length} leaves ${remainingHeaviness.toFixed(0)} kg of ` +
      `liftable heaviness against a ${landingTrim.toFixed(0)} kg trim, so the vehicle ` +
      `${remainingHeaviness >= landingTrim ? 'still lands under control' : 'CANNOT HOLD ITS TRIM'}. ` +
      `The units are not identical, so the equal-share law that would give ` +
      `${naive.toFixed(0)} kg does not apply: the biggest unit is worth more than its share and ` +
      `losing it costs more than its share. ` +
      `A heavier-than-air VTOL that loses a rotor in the hover is descending immediately, and ` +
      `this one is still buoyant: it loses the ability to PLACE itself and keeps the ability to ` +
      `stay up. The survivors carry ${loadShare.toFixed(2)} times their share, which is a thrust ` +
      `problem and not a control one, and the answer to it is to be light rather than redundant.`,
  }
}
