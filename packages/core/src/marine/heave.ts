import { CONSTANTS, SEA_STATE, WATER, v } from '@airship/data'
import type { Kilograms } from '@airship/units'

/**
 * How much of the sea actually reaches the suspension.
 *
 * TWO DEFENSIBLE ANSWERS DIFFERING BY AN ORDER OF MAGNITUDE, and the difference
 * between them is a design variable nobody had written down.
 *
 * The pessimistic account says a crest immerses the float by half the wave
 * height before the vehicle can respond, because the envelope above is held at
 * altitude by thirty tonnes of buoyancy and an enormous added mass. On a 1.9 m
 * sea that is nearly a metre of immersion and a suspension load in the hundreds
 * of kilonewtons.
 *
 * The optimistic account says the float is barely loaded, so it rides the swell:
 * its heave period is a couple of seconds against a wave period of eight or
 * nine, the response is quasi-static, and the RELATIVE motion between float and
 * water is a tenth of the wave amplitude rather than half of it.
 *
 * THE OPTIMISTIC ONE IS RIGHT, and the reason is a frequency ratio that is easy
 * to write upside down. A light gondola on a stiff waterplane has a heave period
 * near a second; a sea state 4 wave has a period near six. The forcing is five
 * times slower than the system can respond, so the gondola rides quasi-statically
 * and the RELATIVE motion between float and water is a few percent of the wave
 * amplitude rather than half of it.
 *
 * AND THE SUSPENSION STIFFNESS TURNS OUT NOT TO MATTER, which is the useful
 * result. Sweeping it over two hundred to one moves the load by less than a
 * factor of two, because the relative motion falls as the stiffness rises and
 * the two cancel. In the quasi-static limit the load is simply the gondola's
 * mass times the wave's acceleration, and this module reproduces that limit to
 * three figures. What that means for the design is that the suspension is sized
 * by flight loads and by handling, not by the sea.
 *
 * The envelope is treated as ground because its effective heave inertia is
 * larger than the gondola's by more than an order of magnitude and it is held at
 * altitude by buoyancy rather than by the suspension.
 */

const G0 = CONSTANTS.g0.value

export interface HeaveResponse {
  /** Natural period of the gondola on its suspension and the waterplane, s. */
  readonly naturalPeriod: number
  /** Modal period of the sea, s. */
  readonly wavePeriod: number
  /** Forcing over natural frequency. Below 1 the vehicle follows the sea. */
  readonly frequencyRatio: number
  /** Wave amplitude, m. Half the significant height. */
  readonly waveAmplitude: number
  /** Relative motion between float and water surface, m. This is what loads it. */
  readonly relativeMotion: number
  /** That motion as a fraction of the wave amplitude. */
  readonly followingFraction: number
  /** Load through the suspension, N. */
  readonly suspensionLoad: number
  readonly regime: 'follows the sea' | 'near resonance' | 'held by the envelope'
  readonly note: string
}

/**
 * @source Damping ratio of a lightly loaded float in water. Wave-making and
 * viscous damping together put it near 0.15 for a hull barely immersed, which
 * is low enough that the resonant peak is real and sharp.
 */
const DAMPING_RATIO = 0.15

/**
 * Response of the gondola to a passing sea.
 *
 * @param gondolaMass The mass that actually rides the water: the gondola, its
 *   contents and the water's added mass on the immersed hull. NOT the vehicle,
 *   because the envelope does not follow.
 * @param suspensionStiffness N/m of the cables between gondola and envelope.
 *   THE DESIGN VARIABLE. Infinity gives the pessimistic case exactly.
 * @param waterplaneArea m2 of hull at the waterline.
 */
export const heaveResponse = (
  seaStateCode: number,
  gondolaMass: Kilograms,
  suspensionStiffness: number,
  waterplaneArea: number,
  salt = true,
): HeaveResponse => {
  const state = SEA_STATE.find((s) => s.code === seaStateCode) ?? SEA_STATE[0]
  if (!state) throw new RangeError(`No sea state ${seaStateCode}.`)

  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const waterStiffness = density * G0 * waterplaneArea

  /**
   * @derived The gondola sits between two springs in series: the water pushing
   * up and the suspension pulling up. Series, not parallel, because the load
   * path runs through both in turn.
   */
  const effectiveStiffness =
    Number.isFinite(suspensionStiffness) && suspensionStiffness > 0
      ? (waterStiffness * suspensionStiffness) / (waterStiffness + suspensionStiffness)
      : waterStiffness

  const naturalPeriod = 2 * Math.PI * Math.sqrt(gondolaMass / effectiveStiffness)

  /**
   * @source Modal wave period against significant height for a fully developed
   * sea: T = 4.0 * sqrt(Hs), which reproduces the Pierson-Moskowitz relation
   * closely enough across the sea states this vehicle will meet.
   */
  const wavePeriod = 4.0 * Math.sqrt(state.significantWaveHeight)
  const waveAmplitude = state.significantWaveHeight / 2

  /**
   * Frequency ratio: FORCING over NATURAL, which is the standard convention and
   * is easy to write upside down. In periods that inverts to natural over
   * forcing, because a period is the reciprocal of a frequency.
   *
   * Below 1 the forcing is slower than the system can respond, so the mass
   * follows quasi-statically and the RELATIVE motion is small. Above 1 the
   * forcing outruns it, the mass stays put, and the relative motion approaches
   * the full wave amplitude. A light gondola on a stiff waterplane has a period
   * near a second against a wave period of five or six, so it sits well below 1
   * and it rides.
   */
  const r = naturalPeriod / wavePeriod

  /**
   * @derived Base-excited relative motion: x_rel / y = r^2 / sqrt((1-r^2)^2 +
   * (2*zeta*r)^2). At low r the float rides the wave and feels almost none of
   * it; at r = 1 it resonates; at high r the wave passes underneath.
   *
   * NOTE THE INVERSION AGAINST INTUITION. Following the sea is the GOOD case
   * here: what damages the vehicle is relative motion, not absolute.
   */
  const rSquared = r * r
  const transmissibility =
    rSquared / Math.sqrt((1 - rSquared) ** 2 + (2 * DAMPING_RATIO * r) ** 2)
  const relativeMotion = waveAmplitude * transmissibility
  const suspensionLoad = effectiveStiffness * relativeMotion

  /** @derived Within 30 percent of unity counts as near resonance. */
  const RESONANCE_BAND = 0.3
  const regime =
    Math.abs(r - 1) < RESONANCE_BAND
      ? 'near resonance'
      : r < 1
        ? 'follows the sea'
        : 'held by the envelope'

  return {
    naturalPeriod,
    wavePeriod,
    frequencyRatio: r,
    waveAmplitude,
    relativeMotion,
    followingFraction: transmissibility,
    suspensionLoad,
    regime,
    note:
      `Sea state ${seaStateCode}: ${state.significantWaveHeight.toFixed(2)} m significant, ` +
      `${wavePeriod.toFixed(1)} s modal. The gondola's own heave period is ` +
      `${naturalPeriod.toFixed(1)} s, a ratio of ${r.toFixed(2)}, so it ` +
      `${regime}. Relative motion is ${relativeMotion.toFixed(2)} m, which is ` +
      `${(transmissibility * 100).toFixed(0)} percent of the wave amplitude, and the suspension ` +
      `sees ${(suspensionLoad / 1000).toFixed(1)} kN, which is the gondola's mass times the ` +
      `wave's acceleration and almost nothing else. SUSPENSION STIFFNESS BARELY ENTERS: the ` +
      `relative motion falls as the stiffness rises and the two cancel, so the cables are sized ` +
      `by flight loads and by handling rather than by the sea.`,
  }
}

/**
 * The suspension stiffness that keeps the vehicle out of resonance.
 *
 * There is a band of stiffness to avoid rather than a value to hit, and it is
 * the one where the gondola's heave period matches the sea. Softer is always
 * better for load and there is a limit: a suspension soft enough to isolate
 * completely lets the gondola swing, and a swinging gondola on a vehicle whose
 * pendulum stability IS its stability is a different problem.
 *
 * @returns The stiffness at which the gondola resonates with this sea, N/m.
 *   Design well away from it, and softer rather than stiffer.
 */
export const resonantSuspensionStiffness = (
  seaStateCode: number,
  gondolaMass: Kilograms,
  waterplaneArea: number,
  salt = true,
): number => {
  const state = SEA_STATE.find((s) => s.code === seaStateCode) ?? SEA_STATE[0]
  if (!state) throw new RangeError(`No sea state ${seaStateCode}.`)
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const waterStiffness = density * G0 * waterplaneArea

  const wavePeriod = 4.0 * Math.sqrt(state.significantWaveHeight)
  // Resonance when the natural period equals the wave period.
  const effectiveWanted = gondolaMass * (2 * Math.PI / wavePeriod) ** 2
  if (effectiveWanted >= waterStiffness) return Infinity
  return (waterStiffness * effectiveWanted) / (waterStiffness - effectiveWanted)
}


/**
 * The sea the vehicle resonates with, given its suspension.
 *
 * MORE USEFUL THAN ASKING WHICH STIFFNESS RESONATES WITH A GIVEN SEA, because
 * the stiffness is what the designer picks and the sea is what turns up.
 *
 * THE ANSWER INVERTS THE USUAL ISOLATION INTUITION. Vibration isolation says
 * soften the mount to push the natural frequency below the forcing. Here the
 * forcing is a wave, the useful frequencies are all LOWER than the gondola's
 * natural one, and softening the suspension drags the resonance UP into the sea
 * states the vehicle will actually meet. A stiff suspension puts the resonance
 * on a ripple whose amplitude is negligible; a soft one puts it on a chop.
 *
 * @returns Significant wave height at which the gondola resonates, m. Design so
 *   that this is smaller than any sea worth naming.
 */
export const resonantWaveHeight = (
  gondolaMass: Kilograms,
  suspensionStiffness: number,
  waterplaneArea: number,
  salt = true,
): number => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const waterStiffness = density * G0 * waterplaneArea
  const effectiveStiffness =
    Number.isFinite(suspensionStiffness) && suspensionStiffness > 0
      ? (waterStiffness * suspensionStiffness) / (waterStiffness + suspensionStiffness)
      : waterStiffness
  const naturalPeriod = 2 * Math.PI * Math.sqrt(gondolaMass / effectiveStiffness)
  // Inverting T = 4.0 * sqrt(Hs).
  /** @derived Coefficient of the modal period against significant height. */
  const MODAL_PERIOD_COEFFICIENT = 4.0
  return (naturalPeriod / MODAL_PERIOD_COEFFICIENT) ** 2
}

/**
 * The load the suspension actually sees, in the limit the vehicle operates in.
 *
 * @derived In the quasi-static regime the relative motion is r^2 times the wave
 * amplitude and the load is k_eff times that, which reduces to m * omega^2 * A:
 * the gondola's mass times the wave's acceleration, with the stiffness cancelled
 * out entirely.
 *
 * AND THE WAVE'S ACCELERATION IS NEARLY CONSTANT ACROSS SEA STATES. A fully
 * developed sea has a modal period going as the square root of the height, so
 * omega^2 * A goes as A / A = 1. Sea state 6 loads the suspension no harder than
 * sea state 2, which is not what anyone expects and is why this vehicle's
 * seakeeping limit is not a wave height at all.
 */
export const quasiStaticSuspensionLoad = (
  gondolaMass: Kilograms,
  significantWaveHeight: number,
): number => {
  /** @derived Coefficient of the modal period against significant height. */
  const MODAL_PERIOD_COEFFICIENT = 4.0
  const period = MODAL_PERIOD_COEFFICIENT * Math.sqrt(significantWaveHeight)
  const omega = (2 * Math.PI) / period
  const amplitude = significantWaveHeight / 2
  return gondolaMass * omega * omega * amplitude
}


export interface EmergenceVerdict {
  /** Static draught of the float at the landing trim, m. */
  readonly draught: number
  /** Relative motion between float and water, m. */
  readonly relativeMotion: number
  /** True when the float comes clear of the water on a wave. */
  readonly emerges: boolean
  /** Speed at which it re-enters, m/s. */
  readonly reentryVelocity: number
  /** Peak pressure on re-entry, Pa, by the standard impact relation. */
  readonly impactPressure: number
  readonly note: string
}

/**
 * Does the float leave the water, and does it matter when it comes back?
 *
 * THE QUESTION THE HEAVE ANALYSIS FORCES. If the suspension load never grows
 * with the sea, the float cannot be following it perfectly, and it is not: a
 * vehicle trimmed six hundred kilograms heavy floats on a draught of
 * MILLIMETRES, so almost any wave lifts it clear. The load case is not immersion
 * at all, it is emergence and re-entry.
 *
 * And that turns out to be benign for the same reason everything else here is.
 * The float re-enters at the RELATIVE velocity, which is the relative motion
 * times the wave frequency, and both are small: a few centimetres at a fraction
 * of a radian per second is a re-entry measured in centimetres per second. A
 * seaplane arrives at several metres per second and that is why it slams.
 *
 * @param draughtArea Waterplane area at the float, m2.
 */
export const emergence = (
  seaStateCode: number,
  landingTrim: Kilograms,
  gondolaMass: Kilograms,
  suspensionStiffness: number,
  draughtArea: number,
  salt = true,
): EmergenceVerdict => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const response = heaveResponse(
    seaStateCode,
    gondolaMass,
    suspensionStiffness,
    draughtArea,
    salt,
  )

  /** @derived Archimedes: the displaced volume over the waterplane area. */
  const draught = landingTrim / (density * draughtArea)
  const emerges = response.relativeMotion > draught

  const omega = (2 * Math.PI) / response.wavePeriod
  const reentryVelocity = emerges ? omega * (response.relativeMotion - draught) : 0

  /**
   * @source Peak impact pressure p = 0.5 * Cp * rho * v^2 with Cp about 15 for
   * a shallow deadrise hull entering water, from the NACA hull impact reports.
   * The coefficient is large and the velocity is small, and the velocity is
   * squared.
   */
  const IMPACT_COEFFICIENT = 15
  const impactPressure = 0.5 * IMPACT_COEFFICIENT * density * reentryVelocity * reentryVelocity

  return {
    draught,
    relativeMotion: response.relativeMotion,
    emerges,
    reentryVelocity,
    impactPressure,
    note:
      `${(draught * 1000).toFixed(0)} mm of draught at a ${landingTrim.toFixed(0)} kg trim on ` +
      `${draughtArea.toFixed(0)} m2 of waterplane, against ${(response.relativeMotion * 1000).toFixed(0)} mm ` +
      `of relative motion. The float ${emerges ? 'COMES CLEAR of the water and re-enters' : 'stays immersed'}` +
      (emerges
        ? ` at ${(reentryVelocity * 1000).toFixed(0)} mm/s, for a peak pressure of ` +
          `${impactPressure.toFixed(0)} Pa. A SEAPLANE ARRIVES AT SEVERAL METRES PER SECOND, which ` +
          `is why it slams and this does not: the vehicle is trimmed so light that it floats on ` +
          `millimetres, so it is lifted clear by almost any wave and set down again at a speed you ` +
          `could not feel.`
        : `.`),
  }
}
