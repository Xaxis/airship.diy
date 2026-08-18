import { CONSTANTS, SEA_STATE, WATER, v } from '@airship/data'
import type { Kilograms } from '@airship/units'

/**
 * How much of the sea actually reaches the suspension.
 *
 * THE ANSWER IS A BRACKET, NOT A NUMBER, AND THAT IS THE RESULT. This module
 * previously reported about 5 kN in every sea state and concluded that the
 * suspension is sized by flight loads rather than by the sea. Three modelling
 * errors produced that, each of them in the flattering direction, and none of
 * them survive:
 *
 * THE ENVELOPE IS NOT GROUND. It was treated as ground because its inertia is
 * an order of magnitude larger than the gondola's, which is the wrong test.
 * What decides whether a body acts as ground is its inertial IMPEDANCE at the
 * forcing frequency, m * omega^2, against the stiffness connecting to it. At
 * wave frequencies m * omega^2 for this envelope is around 60 kN/m against a
 * suspension near 1 MN/m, so the envelope is a nearly free mass that the
 * suspension drags along. The two heave as one body, and what oscillates on
 * the waterplane is the whole vehicle: a heave period near three and a half
 * seconds, not the one second a light gondola alone would give.
 *
 * THE SPRINGS ARE NOT IN SERIES. Series is only valid across a massless node,
 * and the mass at that node is the entire subject of the analysis.
 *
 * AND THE FLOAT IS NOT IN THE WATER. rho * g * A is the restoring force of a
 * continuously immersed wall-sided float, valid while the relative motion stays
 * inside the draught. This float draws about twenty millimetres, because the
 * vehicle is nearly neutrally buoyant, and the relative motion is hundreds. It
 * is clear of the surface for part of every cycle in every sea state, so the
 * contact is one-sided: water can push and it cannot pull.
 *
 * WHAT SURVIVES. The linear transfer function is reported, flagged as out of
 * validity, and bracketed by two bounds that do not depend on it. The lower is
 * quasi-static, the vehicle following the surface with the suspension carrying
 * the envelope's inertia times the wave's acceleration. The upper is
 * hydrostatic, the vehicle holding station while a crest immerses the float by
 * the full wave amplitude. On this design they are 31 to 36 kN in a smooth sea
 * and 63 to 603 kN in a very rough one. Closing that gap needs a time-domain
 * solve with one-sided contact, and until somebody writes one the honest thing
 * is to size against the upper bound and to say which sea states that permits.
 *
 * THE ONE CLEAN RESULT IS BACKWARDS FROM INTUITION. The vehicle's heave period
 * is a few seconds, so it is the SHORT smooth seas that excite it and the long
 * rough ones it rides. Sea state 2 sits at a frequency ratio of 1.06, which is
 * resonance. A vehicle that is comfortable in a gale and bad in a chop is not
 * what anybody expects, and it is what the period says.
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
  /**
   * True while the float stays immersed through the whole cycle. When false the
   * linearised waterplane spring every number above depends on is outside its
   * validity, because water can push and cannot pull.
   */
  readonly contactMaintained: boolean
  /**
   * Lower bound on the suspension load, N: the vehicle follows the surface and
   * the suspension carries the envelope's inertia times the wave acceleration.
   */
  readonly quasiStaticLoad: number
  /**
   * Upper bound, N: the vehicle holds station and the crest immerses the float
   * by the full wave amplitude against the waterplane stiffness.
   */
  readonly fullImmersionLoad: number
  /** Static draught the float floats at, m. */
  readonly draught: number
  /** What the whole vehicle contributes to the heave, kg. */
  readonly oscillatingMass: number
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
  /**
   * Effective heave inertia of the envelope and everything hanging from it,
   * kg, INCLUDING added mass. Required, because whether the envelope acts as
   * ground is the question this module used to get wrong by assuming it.
   */
  envelopeHeaveInertia: number,
  /**
   * Static heaviness resting on the water, kg. Sets the draught, and therefore
   * whether the float stays in contact at all.
   */
  staticDraught: number,
  salt = true,
): HeaveResponse => {
  // NO FALLBACK. The `?? SEA_STATE[0]` that used to sit here made the throw
  // below unreachable for every real input, so a typo was answered as sea state
  // 1: the one state where this system sits closest to resonance, and therefore
  // the one that returns the largest load in the table with no indication that
  // anything is wrong.
  const state = SEA_STATE.find((s) => s.code === seaStateCode)
  if (!state) throw new RangeError(`No sea state ${seaStateCode}.`)

  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const waterStiffness = density * G0 * waterplaneArea

  /**
   * THE PERIOD COMES FROM THE DATA LAYER. It used to be 4.0 * sqrt(Hs), cited
   * as "the Pierson-Moskowitz relation", which it is not: PM gives a modal
   * period of 5.00 * sqrt(Hs) and a zero-crossing period of 3.56. Four is
   * neither, so the citation did not support the number attached to it. And
   * @airship/data already tabulates a period for every sea state, so this was a
   * second number for a quantity the repository had already answered, and one
   * that ignores the low states where the sea is not fully developed and the
   * closed form is worst.
   */
  const wavePeriod = state.meanPeriod
  const waveAmplitude = state.significantWaveHeight / 2
  const omega = (2 * Math.PI) / wavePeriod

  /**
   * WHAT ACTUALLY OSCILLATES ON THE WATERPLANE IS THE WHOLE VEHICLE.
   *
   * This module used to treat the envelope as ground, on the grounds that its
   * inertia is an order of magnitude larger than the gondola's. That is the
   * wrong criterion. Whether a body acts as ground is set by its inertial
   * IMPEDANCE at the forcing frequency, m * omega^2, against the stiffness that
   * connects to it. At wave frequencies m2 * omega^2 is an order of magnitude
   * SMALLER than a stiff suspension, so the envelope is not ground at all: it
   * is a nearly free mass that the suspension drags along, and the two heave
   * essentially as one body.
   *
   * @derived Solving the two-body system with the envelope free gives the
   * envelope's dynamic mass as seen from the gondola,
   * M_eff = k_s * m2 / (k_s - m2 * omega^2), which tends to m2 as the
   * suspension stiffens and to zero as it goes slack. The gondola then rides
   * the waterplane spring alone carrying m1 + M_eff.
   *
   * The two springs are NOT in series. Series is only valid across a massless
   * node, and the mass at that node is the entire subject of the analysis. Both
   * springs deflect by the gondola's own displacement, so from the mass's
   * standpoint they are in parallel, and the suspension's connection is to a
   * body that moves rather than to ground.
   */
  const stiff = Number.isFinite(suspensionStiffness) && suspensionStiffness > 0
  const envelopeDynamicMass = stiff
    ? (suspensionStiffness * envelopeHeaveInertia) /
      (suspensionStiffness - envelopeHeaveInertia * omega * omega)
    : 0
  const oscillatingMass = gondolaMass + envelopeDynamicMass

  const effectiveStiffness = waterStiffness
  const naturalPeriod = 2 * Math.PI * Math.sqrt(Math.abs(oscillatingMass) / effectiveStiffness)

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

  /**
   * THE SUSPENSION CARRIES THE ENVELOPE'S INERTIA, not the waterplane spring's
   * deflection.
   *
   * This used to be `effectiveStiffness * relativeMotion`, which is the force
   * in the WATER spring, and then reported it as the force in the SUSPENSION.
   * The suspension force is whatever it takes to accelerate the envelope, which
   * from the free body above is m2 * omega^2 * |z2|, and the envelope's own
   * motion follows from the gondola's.
   */
  const gondolaAbsolute =
    Math.abs(waterStiffness / (waterStiffness - omega * omega * oscillatingMass)) * waveAmplitude
  const envelopeAbsolute = stiff
    ? gondolaAbsolute *
      Math.abs(
        suspensionStiffness / (suspensionStiffness - envelopeHeaveInertia * omega * omega),
      )
    : 0
  const suspensionLoad = envelopeHeaveInertia * omega * omega * envelopeAbsolute

  /**
   * IS THE FLOAT EVEN IN THE WATER?
   *
   * k_w = rho * g * A is the linearised restoring force of a CONTINUOUSLY
   * IMMERSED wall-sided float, and it is valid only while the relative motion
   * stays inside the draught. Past that the float is clear of the surface for
   * part of every cycle, the restoring force becomes one-sided (water can push
   * and never pull), and every number above was computed with a spring that is
   * not in contact.
   *
   * The module used to compute this load and then, in a separate function,
   * declare that the float emerges on every wave in every sea state, without
   * either result knowing about the other.
   */
  const draught = staticDraught / (density * waterplaneArea)
  const contactMaintained = relativeMotion <= draught

  /**
   * TWO BOUNDS, BECAUSE THE LINEAR ANSWER IS NOT AVAILABLE.
   *
   * With the float clear of the water for part of every cycle the contact is
   * one-sided: water can push and cannot pull. That is a nonlinear problem and
   * no closed form settles it, so what is honest is the bracket.
   *
   * The LOWER bound is quasi-static: the vehicle follows the surface and the
   * suspension carries the envelope's inertia times the wave's acceleration.
   * The UPPER bound is hydrostatic: the vehicle stays where it is, the crest
   * immerses the float by up to the wave amplitude, and the suspension carries
   * rho * g * A times that immersion. The truth is between them, and getting it
   * needs a time-domain simulation with one-sided contact rather than a
   * transfer function.
   */
  const quasiStaticLoad = envelopeHeaveInertia * omega * omega * waveAmplitude
  const fullImmersionLoad = waterStiffness * waveAmplitude

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
    contactMaintained,
    quasiStaticLoad,
    fullImmersionLoad,
    draught,
    oscillatingMass,
    note:
      `Sea state ${seaStateCode}: ${state.significantWaveHeight.toFixed(2)} m significant, ` +
      `${wavePeriod.toFixed(1)} s modal. The gondola's own heave period is ` +
      `${naturalPeriod.toFixed(1)} s, a ratio of ${r.toFixed(2)}, so it ` +
      `${regime}. Relative motion is ${relativeMotion.toFixed(2)} m, which is ` +
      `${(transmissibility * 100).toFixed(0)} percent of the wave amplitude, and the suspension ` +
      `sees ${(suspensionLoad / 1000).toFixed(1)} kN. ` +
      (contactMaintained
        ? `The float stays in contact with the water throughout, so the linear waterplane spring ` +
          `is valid here.`
        : `BUT THE FLOAT LEAVES THE WATER: the relative motion is ` +
          `${(relativeMotion * 1000).toFixed(0)} mm against ${(draught * 1000).toFixed(0)} mm of ` +
          `draught, so it is clear of the surface for part of every cycle. Contact is one-sided ` +
          `there, water can push and never pull, and the linearised waterplane spring above is ` +
          `outside its validity. What is defensible is the BRACKET: between ` +
          `${(quasiStaticLoad / 1000).toFixed(0)} kN if the vehicle follows the surface and ` +
          `${(fullImmersionLoad / 1000).toFixed(0)} kN if it holds station and the crest comes to ` +
          `it. Closing that gap needs a time-domain solve with one-sided contact, not a transfer ` +
          `function.`) +
      (regime === 'near resonance'
        ? ` THIS SEA STATE IS AT RESONANCE, which is the opposite of what the intuition says: the ` +
          `vehicle's heave period is a few seconds, so it is the SHORT smooth seas that excite it ` +
          `and the long rough ones it rides.`
        : ''),
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
  // NO FALLBACK. The `?? SEA_STATE[0]` that used to sit here made the throw
  // below unreachable for every real input, so a typo was answered as sea state
  // 1: the one state where this system sits closest to resonance, and therefore
  // the one that returns the largest load in the table with no indication that
  // anything is wrong.
  const state = SEA_STATE.find((s) => s.code === seaStateCode)
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
  envelopeHeaveInertia: number,
  salt = true,
): number => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const waterStiffness = density * G0 * waterplaneArea
  /**
   * @derived The LOWER root of the two-degree-of-freedom characteristic
   * equation, gondola on the waterplane and envelope on the suspension:
   *
   *   m1 m2 w^4 - w^2 (k_w m2 + k_s m2 + m1 k_s) + k_w k_s = 0
   *
   * Its limits are the check. As k_s goes to infinity the envelope is rigidly
   * attached and w^2 -> k_w / (m1 + m2). As k_s goes to zero the lower root
   * goes to zero with it: the envelope hangs on nothing and the mode becomes a
   * slow wallow of the two masses against each other.
   *
   * So SOFTENING MOVES THE RESONANCE INTO LONGER WAVES AND BIGGER SEAS, which
   * is the opposite of what vibration isolation teaches, and stiffening moves
   * it towards a chop. That much the old model got right. What it got wrong is
   * where the limit sits: even a RIGID suspension puts the resonance at about
   * half a metre of significant height, which is a slight sea the vehicle will
   * meet routinely. There is no stiffness that puts it on a ripple.
   */
  const naturalFrequencySquared = (() => {
    if (!Number.isFinite(suspensionStiffness) || suspensionStiffness <= 0) {
      return waterStiffness / (gondolaMass + envelopeHeaveInertia)
    }
    const a = gondolaMass * envelopeHeaveInertia
    const b = -(
      waterStiffness * envelopeHeaveInertia +
      suspensionStiffness * envelopeHeaveInertia +
      gondolaMass * suspensionStiffness
    )
    const c = waterStiffness * suspensionStiffness
    const discriminant = Math.sqrt(b * b - 4 * a * c)
    return (-b - discriminant) / (2 * a)
  })()
  const naturalPeriod = (2 * Math.PI) / Math.sqrt(naturalFrequencySquared)
  /**
   * @source Inverting the Pierson-Moskowitz modal period, T = 5.00 * sqrt(Hs).
   * The coefficient here used to be 4.0, which is neither the PM modal value
   * nor its zero-crossing value of 3.56, and so supported neither citation.
   *
   * This is a closed form and the sea state table is not, so the two will
   * disagree at the low states where a real sea is not fully developed. It is
   * used only to say WHICH sea excites the vehicle, not to size anything.
   */
  const MODAL_PERIOD_COEFFICIENT = 5.0
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
  heaveInertia: number,
  seaStateCode: number,
): number => {
  const state = SEA_STATE.find((st) => st.code === seaStateCode)
  if (!state) throw new RangeError(`No sea state ${seaStateCode}.`)
  const omega = (2 * Math.PI) / state.meanPeriod
  const amplitude = state.significantWaveHeight / 2
  return heaveInertia * omega * omega * amplitude
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
  envelopeHeaveInertia: number,
  salt = true,
): EmergenceVerdict => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const response = heaveResponse(
    seaStateCode,
    gondolaMass,
    suspensionStiffness,
    draughtArea,
    envelopeHeaveInertia,
    landingTrim,
    salt,
  )

  /** @derived Archimedes: the displaced volume over the waterplane area. */
  const draught = landingTrim / (density * draughtArea)
  const emerges = response.relativeMotion > draught

  const omega = (2 * Math.PI) / response.wavePeriod

  /**
   * RE-ENTRY VELOCITY, WHICH IS NOT THE PEAK VELOCITY AND IS NOT ZERO.
   *
   * For a relative displacement z(t) = Z sin(omega t), the float re-enters when
   * z falls back through the draught d, and its velocity there is
   * omega * sqrt(Z^2 - d^2).
   *
   * The docstring above used to claim omega * Z, the code computed
   * omega * (Z - d), and the correct answer is neither. The code's form is the
   * worst of the three, because it goes to zero exactly where the physics does
   * not: a float that barely clears the water re-enters at close to its full
   * relative velocity, not gently. Impact pressure goes as v^2, so the error is
   * squared.
   */
  const reentryVelocity = emerges
    ? omega * Math.sqrt(response.relativeMotion ** 2 - draught ** 2)
    : 0

  /**
   * @source Peak impact pressure p = 0.5 * Cp * rho * v^2. Wagner water-entry
   * theory gives Cp = 1 + pi^2 / (4 tan^2 beta) in the deadrise angle beta, and
   * Cp = 15 corresponds to beta of about 22 degrees: MODERATE deadrise, not
   * shallow. This value was previously described as "large" for a "shallow
   * deadrise hull", which is backwards twice over: 15 is at the small end of
   * the published range, and a shallow deadrise gives a far larger coefficient,
   * so quoting it for a flat-bottomed float would under-predict the slam.
   *
   * Validity: this is the deadrise the float must actually be built to. A flat
   * bottom at beta = 5 degrees would give Cp near 130.
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
