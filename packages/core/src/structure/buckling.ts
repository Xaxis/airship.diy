import { END_FIXITY, SP8007, v } from '@airship/data'
import type { Meters, Pascals } from '@airship/units'
import { Pa } from '@airship/units'

/**
 * Buckling of slender composite compression members.
 *
 * BUCKLING GOVERNS, NOT STRENGTH. Historical rigid airship girders failed this
 * way essentially every time, and the failure was almost always LOCAL: the
 * shell wall wrinkled or the section crippled long before the member reached
 * its Euler load.
 *
 * The module computes all three modes and reports which one governs, because
 * the answer changes with bay length and a designer who assumes Euler will size
 * the wrong thing.
 */

export type BucklingMode = 'euler' | 'local-shell' | 'crippling'

export interface BucklingResult {
  /** Allowable compressive stress, Pa, after all knockdowns. */
  readonly allowableStress: Pascals
  readonly governingMode: BucklingMode
  readonly eulerStress: Pascals
  readonly localShellStress: Pascals
  /** Warnings where the correlation is being used outside its fitted range. */
  readonly warnings: readonly string[]
}

/**
 * Euler column buckling stress of a thin-walled tube.
 *
 * @derived sigma = C * pi^2 * E * (rho/L)^2, with radius of gyration
 * rho = r/sqrt(2) for a thin-walled circular tube.
 *
 * @param endFixity The C coefficient. Defaults to the airship girder value,
 *   which is uncertain across a factor of 2.5 because a wire-braced joint is
 *   neither pinned nor fixed. Historical practice assumed pinned, which is
 *   conservative and wasteful.
 */
export const eulerBucklingStress = (
  modulus: Pascals,
  radius: Meters,
  length: Meters,
  endFixity = v(END_FIXITY.airshipGirder),
): Pascals => {
  if (length <= 0 || radius <= 0) throw new RangeError('Member dimensions must be positive.')
  /** @derived Radius of gyration of a thin-walled circular tube. */
  const gyradius = radius / Math.SQRT2
  return Pa(endFixity * Math.PI ** 2 * modulus * (gyradius / length) ** 2)
}

/**
 * Local shell buckling stress of a thin-walled tube in axial compression,
 * per NASA SP-8007.
 *
 * @derived sigma = 0.605 * gamma * E * t / r, with the empirical knockdown
 *   gamma = 1 - 0.901 * (1 - exp(-phi)),  phi = (1/16) * sqrt(r/t)
 *
 * The classical theory over-predicts by a factor of three or more on a thin
 * shell because real shells have imperfections, and the knockdown is a lower
 * bound fitted to test data rather than a physical model.
 *
 * @param inBending Use the bending knockdown, which is LESS severe than the
 *   compression one even though the theoretical stress is identical. SP-8007
 *   flags this itself: a shell in bending has only part of its circumference at
 *   peak stress, so an imperfection is less likely to sit where it matters.
 *   Applying the bending knockdown to a compression case is unconservative.
 */
export const localShellBucklingStress = (
  modulus: Pascals,
  radius: Meters,
  thickness: Meters,
  inBending = false,
): Pascals => {
  if (thickness <= 0 || radius <= 0) throw new RangeError('Shell dimensions must be positive.')

  const radiusToThickness = radius / thickness
  const phi = v(SP8007.axialKnockdownPhiCoefficient) * Math.sqrt(radiusToThickness)
  const asymptote = inBending
    ? v(SP8007.bendingKnockdownAsymptote)
    : v(SP8007.axialKnockdownAsymptote)
  const gamma = 1 - asymptote * (1 - Math.exp(-phi))

  return Pa(v(SP8007.classicalAxialStressCoefficient) * gamma * modulus * (thickness / radius))
}

/**
 * Slenderness at which the Johnson parabola is tangent to the Euler curve.
 *
 * @derived The parabola is constructed to meet Euler with matching slope, which
 * happens at F_col = F_cc / 2 and therefore at (L'/rho) = pi * sqrt(2E / F_cc).
 *
 * BELOW this slenderness the section cripples and the parabola applies. ABOVE
 * it Euler applies. Using the parabola beyond tangency drives it negative,
 * which is not a physical result: it is the formula being evaluated outside its
 * domain.
 */
export const johnsonTangencySlenderness = (
  cripplingStress: Pascals,
  modulus: Pascals,
): number => Math.PI * Math.sqrt((2 * modulus) / cripplingStress)

/**
 * The Johnson parabola, which handles the transition between crippling and
 * Euler instead of letting either run past its validity.
 *
 * Valid only below `johnsonTangencySlenderness`. See `columnAllowable` for the
 * combined curve.
 *
 * @derived F_col = F_cc * [1 - F_cc * (L'/rho)^2 / (4 * pi^2 * E)]
 *
 * @source AFFDL Stress Analysis Manual (October 1986). The intercept F_cc is
 *   the section CRIPPLING or local shell allowable, not a yield stress. Carbon
 *   epoxy has no yield stress, which is why Gerard's crippling method cannot be
 *   transferred to it as published: every formula in NACA TN 3784 and 3785 is
 *   normalised on compressive yield.
 *
 * Below the tangency slenderness the section cripples; above it Euler governs;
 * the parabola blends the two.
 */
export const johnsonParabolaStress = (
  cripplingStress: Pascals,
  modulus: Pascals,
  slendernessRatio: number,
): Pascals => {
  const reduction =
    (cripplingStress * slendernessRatio * slendernessRatio) / (4 * Math.PI ** 2 * modulus)
  return Pa(Math.max(cripplingStress * (1 - reduction), 0))
}

/**
 * The combined column curve: Johnson below tangency, Euler above it.
 *
 * This is what a column allowable actually is, and evaluating either branch
 * outside its domain is the classic way to get a nonsense answer. The parabola
 * goes negative for a long column; the Euler curve exceeds the material
 * strength for a short one.
 */
export const columnAllowable = (
  cripplingStress: Pascals,
  modulus: Pascals,
  slendernessRatio: number,
): Pascals =>
  slendernessRatio < johnsonTangencySlenderness(cripplingStress, modulus)
    ? johnsonParabolaStress(cripplingStress, modulus, slendernessRatio)
    : Pa((Math.PI ** 2 * modulus) / (slendernessRatio * slendernessRatio))

/**
 * Bay length at which local shell buckling and Euler buckling give the same
 * stress.
 *
 * @derived Equating the two expressions gives
 *   L/r = pi * sqrt( C * (r/t) / (1.21 * gamma) )
 *
 * THE RESULT THAT REDIRECTS THE DESIGN EFFORT. For a thin tube at r/t = 100
 * this lands around thirty radii, which is far longer than a typical airship
 * bay. So LOCAL modes govern almost everywhere on this structure, and the
 * literature's focus on the SP-8007 knockdown, while correct, is aimed at the
 * mode that is already the binding one rather than at a competition between
 * two.
 */
export const localToEulerTransitionLength = (
  radius: Meters,
  thickness: Meters,
  endFixity = v(END_FIXITY.airshipGirder),
): Meters => {
  const radiusToThickness = radius / thickness
  const phi = v(SP8007.axialKnockdownPhiCoefficient) * Math.sqrt(radiusToThickness)
  const gamma = 1 - v(SP8007.axialKnockdownAsymptote) * (1 - Math.exp(-phi))

  /** @derived 1.21 is 2 * 0.605, from combining the two stress expressions. */
  const combined = 1.21 * gamma
  return (radius * Math.PI * Math.sqrt((endFixity * radiusToThickness) / combined)) as Meters
}

/**
 * Full buckling assessment of a compression member, reporting which mode
 * governs and where the correlation is being pushed outside its fitted range.
 */
export const assessBuckling = (
  modulus: Pascals,
  compressiveStrength: Pascals,
  radius: Meters,
  thickness: Meters,
  length: Meters,
  endFixity = v(END_FIXITY.airshipGirder),
): BucklingResult => {
  const warnings: string[] = []

  const radiusToThickness = radius / thickness
  if (radiusToThickness < v(SP8007.validRadiusToThicknessMin)) {
    warnings.push(
      `r/t of ${radiusToThickness.toFixed(0)} is below the ${v(SP8007.validRadiusToThicknessMin)} lower bound of the SP-8007 test data. The correlation is extrapolating and is likely over-conservative for a thick shell.`,
    )
  }
  if (radiusToThickness > v(SP8007.validRadiusToThicknessMax)) {
    warnings.push(
      `r/t of ${radiusToThickness.toFixed(0)} exceeds the ${v(SP8007.validRadiusToThicknessMax)} upper bound of the SP-8007 test data. This is extrapolation, not a standard.`,
    )
  }

  const lengthToRadius = length / radius
  if (lengthToRadius > v(SP8007.validLengthToRadiusMax)) {
    warnings.push(
      `L/r of ${lengthToRadius.toFixed(1)} exceeds the ${v(SP8007.validLengthToRadiusMax)} upper bound of the SP-8007 data, so the local shell result is an extrapolation. Check whether Euler governs instead.`,
    )
  }

  const euler = eulerBucklingStress(modulus, radius, length, endFixity)
  const localShell = localShellBucklingStress(modulus, radius, thickness)

  // Crippling is bounded above by the material's compressive strength: a
  // section cannot cripple at a stress the laminate cannot reach.
  const crippling = Pa(Math.min(localShell, compressiveStrength))

  /**
   * @derived Slenderness ratio using the thin-tube radius of gyration, with the
   * end fixity folded in as an effective length.
   */
  const slenderness = length / Math.sqrt(endFixity) / (radius / Math.SQRT2)
  const tangency = johnsonTangencySlenderness(crippling, modulus)
  const column = columnAllowable(crippling, modulus, slenderness)

  const allowable = Math.min(column, compressiveStrength)

  // The column curve already blends the two, so the governing mode is decided
  // by which branch of it applies and by whether the material strength caps it.
  let governing: BucklingMode = slenderness < tangency ? 'crippling' : 'euler'
  if (allowable === compressiveStrength && compressiveStrength < column) {
    governing = 'crippling'
  } else if (governing === 'crippling' && Math.abs(crippling - localShell) < 1) {
    governing = 'local-shell'
  }

  return {
    allowableStress: Pa(allowable),
    governingMode: governing,
    eulerStress: euler,
    localShellStress: localShell,
    warnings,
  }
}

/**
 * Minimum practical laminate thickness for a hand-laid part.
 *
 * Below a few plies the member is not governed by buckling at all: it is
 * governed by whether it survives being carried across a shop, dropped, leaned
 * on, or stepped on during a repair. A structure optimised purely against
 * buckling converges on wall thicknesses that no one can build or maintain.
 *
 * The number is a build constraint rather than a physical one, which is exactly
 * why it belongs in an explicit function instead of being discovered when the
 * optimiser returns something absurd.
 */
export const minimumPracticalThickness = (plyThickness: number, minimumPlies = 4): Meters =>
  (plyThickness * minimumPlies) as Meters

/**
 * Whether the universal 0.65 composite knockdown may be used.
 *
 * ALWAYS FALSE, and the function exists to say so rather than to compute
 * anything. NESC Technical Bulletin 16-01 warns that for anisotropic composite
 * shells the appropriate knockdown "can be significantly lower than 0.65", so
 * applying it as a blanket floor is UNCONSERVATIVE rather than safe. It also
 * should not be applied to composite cylinders that are not cross-ply.
 *
 * Encoded as a refusal because a value that is widely used and wrong is more
 * dangerous than one nobody has heard of, and a silent omission would let it
 * back in.
 */
export const mayUseUniversalCompositeKnockdown = (): { allowed: false; reason: string } => ({
  allowed: false,
  reason:
    'The 0.65 universal composite knockdown is deprecated. NESC TB 16-01 states the appropriate ' +
    'value for anisotropic composite shells can be significantly LOWER than 0.65, so using it as a ' +
    'floor is unconservative. Use the SP-8007 orthotropic route with the correct edition, and state ' +
    'which edition: the 1968 equation requires the laminate coupling terms to vanish and the 2020 ' +
    'revision does not.',
})
