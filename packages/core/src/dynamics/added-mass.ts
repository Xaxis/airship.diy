import { CONSTANTS } from '@airship/data'
import type { KilogramsPerCubicMeter, CubicMeters } from '@airship/units'

/**
 * Added mass.
 *
 * MANDATORY, not a refinement. An airship accelerating through air also
 * accelerates a large volume of air around it, and for a buoyant vehicle the
 * displaced air mass is comparable to the vehicle's own mass. A 15,800 m3 hull
 * displaces about 19 tonnes of air at sea level while the ship itself masses
 * perhaps 18. The transverse added mass coefficient is about 0.89, so a
 * sideways acceleration has to shift roughly 17 tonnes of air as well as the
 * ship: the effective mass nearly DOUBLES.
 *
 * A 6-DOF airship simulation without this term is not slightly optimistic, it
 * is wrong by about a factor of two in transverse and heave response, and the
 * vehicle will feel and behave nothing like the real thing.
 *
 * The coefficients come from potential flow over an equivalent prolate
 * spheroid, which is the classical result and is still the right source.
 *
 * @source Lamb, H. (1932), Hydrodynamics, 6th edition, articles 111-114 and
 *   122. The equivalent-spheroid approximation for a real airship hull is
 *   standard practice; see Khoury, Airship Technology, chapter on dynamics.
 */

export interface InertiaCoefficients {
  /** Axial. Small, because a slender body slips through the air lengthwise. */
  readonly k1: number
  /** Transverse. Close to 1, because broadside the body pushes a wall of air. */
  readonly k2: number
  /** Rotational, about a transverse axis through the centre. */
  readonly kPrime: number
  /** Lamb's alpha0, retained because published tables are given in these terms. */
  readonly alpha0: number
  /** Lamb's beta0. */
  readonly beta0: number
}

/**
 * Lamb's inertia coefficients for a prolate spheroid of a given fineness ratio.
 *
 * With eccentricity e = sqrt(1 - (b/a)^2) for semi-axes a > b = c:
 *
 *   alpha0 = (2(1-e^2)/e^3) * (0.5*ln((1+e)/(1-e)) - e)
 *   beta0  = 1/e^2 - ((1-e^2)/(2e^3)) * ln((1+e)/(1-e))
 *   k1 = alpha0 / (2 - alpha0)
 *   k2 = beta0  / (2 - beta0)
 *
 * VERIFICATION. Two independent checks, both asserted in the tests. At fineness
 * ratio 5 this gives k1 = 0.0591 and k2 = 0.8943, matching the values airship
 * practice quotes as roughly 0.06 and 0.90. And in the sphere limit, fineness
 * ratio 1, both must converge to exactly 0.5, which is the classical result
 * that a sphere's added mass is half the mass of the fluid it displaces. They
 * do, to five decimal places.
 *
 * The rotational coefficient:
 *
 *   k' = ((b^2-a^2)^2 (alpha0 - beta0)) /
 *        ((2(b^2-a^2) + (b^2+a^2)(beta0 - alpha0)) * (b^2+a^2))
 *
 * A DOCUMENTED DISAGREEMENT. This yields k' = 0.700 at fineness ratio 5, where
 * the project brief states "roughly 0.66". The form implemented here is kept
 * because it satisfies the one constraint that is not negotiable: k' must go to
 * ZERO in the sphere limit, since a sphere rotating in an ideal fluid carries no
 * added inertia at all. It does, to five decimals. An alternative arrangement of
 * the same terms that omits the trailing (a^2+b^2) fails that limit by orders of
 * magnitude, which is how this one was chosen.
 *
 * The 6 percent gap against the brief is not resolved and is not tuned away. It
 * may be a different fineness ratio, a different definition of the reference
 * inertia, or an error in either source. TODO(uncertainty): resolve against
 * Lamb article 122 directly.
 */
export const inertiaCoefficients = (finenessRatio: number): InertiaCoefficients => {
  if (finenessRatio <= 1) {
    throw new RangeError(
      `Fineness ratio ${finenessRatio} is not a prolate spheroid. At exactly 1 the ` +
        `eccentricity is zero and the coefficients are singular; the limiting values are ` +
        `k1 = k2 = 0.5 and k' = 0.`,
    )
  }

  /** @derived Eccentricity of a prolate spheroid with a/b = finenessRatio. */
  const e = Math.sqrt(1 - 1 / finenessRatio ** 2)
  /** @derived The log term common to both coefficients. */
  const logTerm = Math.log((1 + e) / (1 - e))

  /** @source Lamb, Hydrodynamics 6th ed., art. 114. */
  const alpha0 = ((2 * (1 - e * e)) / e ** 3) * (0.5 * logTerm - e)
  /** @source Lamb, Hydrodynamics 6th ed., art. 114. */
  const beta0 = 1 / (e * e) - ((1 - e * e) / (2 * e ** 3)) * logTerm

  // Semi-axes normalised to b = 1, which is all the rotational expression needs.
  const a2 = finenessRatio * finenessRatio
  const b2 = 1

  const numerator = (b2 - a2) ** 2 * (alpha0 - beta0)
  const denominator = (2 * (b2 - a2) + (b2 + a2) * (beta0 - alpha0)) * (b2 + a2)

  return {
    k1: alpha0 / (2 - alpha0),
    k2: beta0 / (2 - beta0),
    kPrime: denominator === 0 ? 0 : numerator / denominator,
    alpha0,
    beta0,
  }
}

/**
 * The 6x6 added mass matrix, in body axes: surge, sway, heave, roll, pitch, yaw.
 *
 * For a body of revolution the matrix is diagonal in the classical
 * approximation, because the axes of symmetry are also the principal axes of the
 * added-inertia tensor. Two consequences worth stating:
 *
 *   - Added mass in ROLL is zero. A body of revolution spinning about its own
 *     axis in ideal flow moves no fluid, so there is no added inertia to it.
 *     Real roll damping comes from fins and viscosity, not from this term.
 *   - Pitch and yaw share the same coefficient, by symmetry.
 *
 * The off-diagonal Munk coupling that destabilises the hull is NOT in this
 * matrix. It arises when the body has both axial and transverse velocity at the
 * same time, and it belongs in the force model rather than the inertia model.
 * Folding it in here would double-count it.
 */
export interface AddedMassMatrix {
  readonly surge: number
  readonly sway: number
  readonly heave: number
  readonly roll: number
  readonly pitch: number
  readonly yaw: number
}

export const addedMassMatrix = (
  volume: CubicMeters,
  finenessRatio: number,
  airDensity: KilogramsPerCubicMeter,
  /**
   * Radius of gyration of the DISPLACED AIR about a transverse axis, m. For a
   * prolate spheroid this is close to a/sqrt(5) where a is the semi-major axis.
   */
  transverseGyradius: number,
): AddedMassMatrix => {
  const coefficients = inertiaCoefficients(finenessRatio)
  const displacedMass = airDensity * volume

  return {
    surge: coefficients.k1 * displacedMass,
    sway: coefficients.k2 * displacedMass,
    heave: coefficients.k2 * displacedMass,
    // Zero for a body of revolution in ideal flow. See the note above.
    roll: 0,
    pitch: coefficients.kPrime * displacedMass * transverseGyradius * transverseGyradius,
    yaw: coefficients.kPrime * displacedMass * transverseGyradius * transverseGyradius,
  }
}

/**
 * The Munk moment: the destabilising pitch and yaw moment on a bare hull.
 *
 * @derived M = 0.5 * rho * V * (k2 - k1) * U^2 * sin(2*alpha)
 *
 * A body of revolution at an angle of attack in potential flow experiences NO
 * net force but a pure couple, and that couple acts to increase the angle of
 * attack rather than reduce it. The bare hull is therefore statically UNSTABLE
 * in both pitch and yaw. This is not a small effect and it is not empirical: it
 * falls straight out of the difference between the transverse and axial added
 * mass coefficients, which for a slender hull is large.
 *
 * Fins exist because of this moment. An airship without them cannot be flown.
 *
 * The moment is implemented explicitly rather than folded into an empirical
 * stability derivative, because a lumped coefficient hides the fact that the
 * instability grows with the SAME term that makes the vehicle sluggish in sway,
 * so the two cannot be traded independently.
 *
 * @source Munk, M. M. (1924), NACA Report 394, "The aerodynamic forces on
 *   airship hulls".
 *
 * @param angleOfAttack Radians. The moment peaks at 45 degrees and vanishes at
 *   0 and 90, which is the signature of the sin(2*alpha) form.
 */
export const munkMoment = (
  volume: CubicMeters,
  finenessRatio: number,
  airDensity: KilogramsPerCubicMeter,
  speed: number,
  angleOfAttack: number,
): number => {
  const { k1, k2 } = inertiaCoefficients(finenessRatio)
  return 0.5 * airDensity * volume * (k2 - k1) * speed * speed * Math.sin(2 * angleOfAttack)
}

/**
 * Period of the CG-below-CB pendulum oscillation, seconds.
 *
 * @derived A physical pendulum: T = 2*pi*sqrt(I / (L*g*h)), where L is gross
 * lift as a mass, h is the vertical separation of the centre of buoyancy from
 * the centre of gravity, and I is the total pitch or roll inertia INCLUDING
 * added mass.
 *
 * This is a signature behaviour of the vehicle: a slow, heavily damped swing
 * with a period of tens of seconds. Getting it right matters because it is what
 * the crew feels continuously for a year, and because a control system tuned
 * against the wrong period will fight it.
 *
 * Including added mass in I lengthens the period noticeably, which is another
 * reason the added mass term is not optional.
 */
export const pendulumPeriod = (
  grossLift: number,
  buoyancyToGravitySeparation: number,
  totalInertia: number,
): number => {
  if (buoyancyToGravitySeparation <= 0) {
    throw new RangeError(
      'Centre of buoyancy is at or below the centre of gravity: there is no restoring ' +
        'moment and therefore no oscillation period, only a divergence.',
    )
  }
  return (
    2 * Math.PI * Math.sqrt(totalInertia / (grossLift * CONSTANTS.g0.value * buoyancyToGravitySeparation))
  )
}
