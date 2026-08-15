import { measured, uncertain, under } from '../citation.js'

/**
 * Buckling allowables, which GOVERN this structure.
 *
 * Historical rigid airship girders failed by buckling essentially every time,
 * not by running out of material strength. The members are extremely slender
 * compression elements and the failure sequence is almost always local: the
 * shell wall wrinkles or the section cripples long before the member reaches
 * its Euler load.
 *
 * A CORRECTION TO THE PROJECT BRIEF. The brief instructs that FAA-P-8110-2
 * "Airship Design Criteria" supplies the structural load cases. It does not.
 * Its introduction scopes it to "conventional, near-equilibrium, NONRIGID
 * airships", and its structural subpart contains loads, factors of safety and
 * gust criteria but NO girder buckling criteria of any kind. It is still worth
 * having for its load cases, which are encoded below, but the buckling
 * allowables come from NASA SP-8007 and the AFFDL Stress Analysis Manual.
 *
 * THE THREE FAILURE MODES, and which one governs depends on the bay length:
 *
 *   Euler column buckling  sigma = C * pi^2 * E * (rho/L)^2
 *   Local shell buckling   sigma = 0.605 * gamma * E * t / r
 *   Crippling              a Johnson parabola with the crippling stress as its
 *                          intercept, per the AFFDL manual
 *
 * Equating the first two gives a transition bay length. Below it the section
 * cripples or the shell wrinkles; above it Euler governs. For a thin tube at
 * r/t = 100 the transition lands around 30 radii, which is longer than a
 * typical airship bay, so LOCAL modes govern and the literature's focus on the
 * SP-8007 knockdown is partly beside the point.
 */

/**
 * NASA SP-8007 shell buckling correlation.
 *
 * The classical theory over-predicts thin-shell buckling by a factor of three
 * or more because real shells have imperfections, so the standard applies an
 * empirical knockdown fitted to a lower bound of test data.
 *
 * READ THE VALIDITY NOTES. This is the single most misapplied correlation in
 * composite structures.
 */
export const SP8007 = under('sp8007', () => ({
  /** Classical buckling stress coefficient: sigma = 0.605 * gamma * E * t/r. */
  classicalAxialStressCoefficient: measured(0.605, {
    unit: '1',
    source: 'nasa-sp-8007',
    relativeUncertainty: 0,
  }),

  /**
   * Knockdown for axial compression: gamma = 1 - 0.901*(1 - exp(-phi)), with
   * phi = (1/16)*sqrt(r/t).
   */
  axialKnockdownAsymptote: measured(0.901, {
    unit: '1',
    source: 'nasa-sp-8007',
    relativeUncertainty: 0,
  }),
  axialKnockdownPhiCoefficient: measured(0.0625, {
    unit: '1',
    source: 'nasa-sp-8007',
    relativeUncertainty: 0,
    note: 'One sixteenth. Exact as published.',
  }),

  /**
   * Knockdown for BENDING, which is LESS severe than for compression even
   * though the theoretical critical stress is the same.
   *
   * SP-8007 flags this itself as counterintuitive: a shell in bending has only
   * part of its circumference at peak stress, so an imperfection is less likely
   * to sit where it matters. Applying the compression knockdown to a bending
   * case is conservative but wasteful, and applying the bending knockdown to a
   * compression case is unconservative.
   */
  bendingKnockdownAsymptote: measured(0.731, {
    unit: '1',
    source: 'nasa-sp-8007',
    relativeUncertainty: 0,
  }),

  /** Phi coefficient for the orthotropic (composite) form. */
  orthotropicPhiCoefficient: measured(0.033557, {
    unit: '1',
    source: 'nasa-sp-8007',
    relativeUncertainty: 0,
    note: 'One divided by 29.8. Exact as published.',
  }),

  // --- validity, and the two traps -----------------------------------------

  /**
   * The correlation is fitted to test data over these ranges. Outside them it
   * is extrapolation, not a standard.
   */
  validRadiusToThicknessMin: measured(80, { unit: '1', source: 'nasa-sp-8007', relativeUncertainty: 0 }),
  validRadiusToThicknessMax: measured(4150, { unit: '1', source: 'nasa-sp-8007', relativeUncertainty: 0 }),
  validLengthToRadiusMin: measured(0.5, { unit: '1', source: 'nasa-sp-8007', relativeUncertainty: 0 }),
  validLengthToRadiusMax: measured(5, { unit: '1', source: 'nasa-sp-8007', relativeUncertainty: 0 }),

  /**
   * TRAP ONE: the universal 0.65 composite knockdown is not conservative.
   *
   * It is widely applied as a blanket factor for composite cylinders. NESC
   * Technical Bulletin 16-01 warns that for anisotropic composite shells the
   * appropriate knockdown "can be significantly lower than 0.65", so using it
   * as a floor is unconservative rather than safe. It also should not be
   * applied at all to composite cylinders that are not cross-ply.
   */
  deprecatedUniversalCompositeKnockdown: measured(0.65, {
    unit: '1',
    source: 'nesc-tb-16-01',
    relativeUncertainty: 0,
    note: 'DEPRECATED as a blanket factor. Recorded so the model can refuse it explicitly rather than by omission.',
  }),

  /**
   * TRAP TWO: the 1968 orthotropic equation requires the laminate coupling
   * terms to vanish; the 2020 revision does not.
   *
   * The two editions are not interchangeable. SP-8007 (1968) eq. 44 is
   * conditioned on the coupling coefficients being negligible, which requires a
   * symmetric laminate. SP-8007-2020 Rev 2 eq. 52 carries the coupling terms
   * explicitly and has no such condition. Citing "SP-8007" without an edition
   * is therefore ambiguous in a way that changes the answer.
   */
  stiffenedCylinderKnockdown1968: measured(0.75, {
    unit: '1',
    source: 'nasa-sp-8007',
    relativeUncertainty: 0,
  }),
  stiffenedCylinderKnockdownRev2: measured(0.65, {
    unit: '1',
    source: 'nasa-sp-8007-rev2',
    relativeUncertainty: 0,
    note: 'Rev 2 lowered it. Another reason the edition has to be stated.',
  }),

  /**
   * Modern composite cylinder tests routinely reach 70 to 90 percent of the
   * theoretical load, far above the SP-8007 lower bound. Rev 2 acknowledges
   * this and still forbids taking credit for it without test justification, so
   * the model uses the lower bound and records the headroom rather than
   * spending it.
   */
  modernTestFractionOfTheoretical: uncertain({
    low: 0.7,
    nominal: 0.8,
    high: 0.9,
    unit: '1',
    reason:
      'Rev 2 states it as an observation about recent testing rather than as a design allowable, and explicitly requires justification before credit is taken.',
    resolvedBy:
      'Buckling test of a representative bay. Expensive, and the payoff is large: the gap between the 1968 lower bound and modern test data is most of the structural margin.',
    source: 'nasa-sp-8007-rev2',
  }),
}))

/**
 * Euler end fixity coefficients, and the one that actually applies.
 *
 * The textbook cases are exact; the airship girder case is not, because a
 * wire-braced joint is neither pinned nor fixed. It carries some moment through
 * the gusset and the bracing, and how much depends on how the joint was built.
 */
export const END_FIXITY = under('endFixity', () => ({
  pinnedPinned: measured(1.0, { unit: '1', source: 'affdl-stress-manual', relativeUncertainty: 0 }),
  fixedFixed: measured(4.0, { unit: '1', source: 'affdl-stress-manual', relativeUncertainty: 0 }),
  fixedPinned: measured(2.05, { unit: '1', source: 'affdl-stress-manual', relativeUncertainty: 0 }),
  fixedFree: measured(0.25, { unit: '1', source: 'affdl-stress-manual', relativeUncertainty: 0 }),

  /**
   * A wire-braced airship girder joint. Genuinely uncertain, and the range
   * spans a factor of 2.5 in buckling load.
   */
  airshipGirder: uncertain({
    low: 1.0,
    nominal: 1.5,
    high: 2.5,
    unit: '1',
    reason:
      'A wire-braced joint is neither pinned nor fixed. It carries some moment through the gusset and the bracing, and the amount depends on gusset stiffness, bolt fit and how much the wire pretension has relaxed. Historical practice assumed pinned, which is conservative and wasteful.',
    resolvedBy:
      'Build a representative joint and test a bay in compression. This is a shop test rather than a laboratory one and it recovers real mass: designing at 1.0 when the truth is 2.0 leaves half the buckling capacity unused.',
  }),
}))

/**
 * Crippling.
 *
 * GERARD'S METHOD CANNOT BE TRANSFERRED TO CARBON FIBRE AS PUBLISHED, and this
 * is the trap in the crippling literature. Every generalised crippling formula
 * in NACA TN 3784 and TN 3785 is normalised on the COMPRESSIVE YIELD STRESS.
 * Carbon epoxy has no yield stress: it is linear to failure. Composite
 * crippling correlations therefore normalise on ultimate or first-ply-failure
 * stress instead, with their own fitted coefficients, and the Gerard
 * coefficients do not carry across.
 */
export const CRIPPLING = under('crippling', () => ({
  /** Gerard exponent for multi-corner sections. */
  multicornerExponent: measured(0.85, {
    unit: '1',
    source: 'naca-tn-3785',
    relativeUncertainty: 0,
    note: 'From TN 3785 eq. 2, NOT TN 3784. The two reports use different correlating variables: TN 3784 correlates on corner count, TN 3785 on cuts plus flanges.',
  }),
  twoCornerExponent: measured(0.75, {
    unit: '1',
    source: 'naca-tn-3784',
    relativeUncertainty: 0,
  }),

  /**
   * Cutoff above which the crippling correlation is capped. SECTION-CLASS
   * DEPENDENT, and quoting one value for all sections is wrong: 0.70 for square
   * tubes and multicorner sections, 0.75 for the one-corner set, 0.92 for
   * formed angles.
   */
  cutoffRatioSquareTube: measured(0.7, {
    unit: '1',
    source: 'naca-tn-3784',
    relativeUncertainty: 0,
  }),
  cutoffRatioOneCorner: measured(0.75, {
    unit: '1',
    source: 'naca-tn-3784',
    relativeUncertainty: 0,
  }),

  /** Composite crippling coefficients, one-edge-free and no-edge-free. */
  compositeOneEdgeFree: uncertain({
    low: 1.4,
    nominal: 1.63,
    high: 1.9,
    unit: '1',
    reason:
      'Composite crippling correlations are layup-dependent and the published coefficients scatter widely, because the failure is a matrix-dominated local instability rather than a fibre event.',
    resolvedBy: 'Crippling coupon tests of the actual section and layup.',
  }),
  compositeNoEdgeFree: uncertain({
    low: 9,
    nominal: 11,
    high: 13,
    unit: '1',
    reason: 'Same reasoning as the one-edge-free coefficient.',
    resolvedBy: 'Crippling coupon tests.',
  }),
}))

/**
 * Load cases from FAA-P-8110-2, which IS worth having even though it is a
 * nonrigid document with no buckling criteria.
 *
 * These are the gust and safety factor requirements the structure must meet,
 * and there is no better airship-specific source: there is no Part 23 or Part
 * 25 equivalent for airships at all.
 */
export const AIRSHIP_LOAD_CASES = under('loadCases', () => ({
  factorOfSafety: measured(1.5, {
    unit: '1',
    source: 'faa-p-8110-2',
    relativeUncertainty: 0,
  }),
  ultimateLoadHoldTime: measured(3, {
    unit: 's',
    source: 'faa-p-8110-2',
    relativeUncertainty: 0,
    note: 'Ultimate load must be carried for three seconds without failure, which for a composite is a creep-rupture requirement as well as a strength one.',
  }),

  /** Discrete gust at maximum level flight speed. 25 ft/s. */
  discreteGustAtMaxSpeed: measured(7.62, {
    unit: 'm/s',
    source: 'faa-p-8110-2',
    relativeUncertainty: 0,
  }),
  /** Discrete gust at design gust speed. 35 ft/s. */
  discreteGustAtGustSpeed: measured(10.668, {
    unit: 'm/s',
    source: 'faa-p-8110-2',
    relativeUncertainty: 0,
  }),
  /** Gust gradient length, 800 ft. */
  gustGradientLength: measured(243.84, {
    unit: 'm',
    source: 'faa-p-8110-2',
    relativeUncertainty: 0,
  }),
  /** Minimum design airspeed for gust cases, 35 kt. */
  minimumDesignGustAirspeed: measured(18.0056, {
    unit: 'm/s',
    source: 'faa-p-8110-2',
    relativeUncertainty: 0,
  }),

  /**
   * Casting factor for critical castings. Not directly applicable to a
   * composite structure, and recorded because the same principle applies to any
   * part whose quality cannot be verified by inspection, which describes a
   * hand-laid bonded joint exactly.
   */
  criticalCastingFactor: measured(1.25, {
    unit: '1',
    source: 'faa-p-8110-2',
    relativeUncertainty: 0,
  }),
}))

/**
 * Bending moment coefficient for the gust case, on the Woodward envelope.
 *
 * @source Woodward, D. (1975), post-DGAI airship structural criteria. The 1928
 *   US Navy Airship Design Competition criterion of about 0.02 is superseded
 *   and differs by a factor of two at the design point, so the edition matters
 *   as much as it does for SP-8007.
 */
export const GUST_BENDING_MOMENT_COEFFICIENT = under('loadCases', () =>
  measured(0.1, {
    unit: '1',
    source: 'woodward-1975',
    relativeUncertainty: 0.2,
    note: 'Peak of C_M/(Wo/Vo) over 0.5L to 0.65L. The older 1928 Navy criterion gives about half this, and using it would understate the design bending moment by a factor of two.',
  }),
)
