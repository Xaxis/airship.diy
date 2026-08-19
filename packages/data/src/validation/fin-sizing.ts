import { measured, under } from '../citation.js'

/**
 * How large a tail an airship actually carried, against how large this model
 * says it needs.
 *
 * WHY THIS FIXTURE EXISTS. The baseline came out with 869 m2 of cruciform on a
 * 118 m hull: nearly two tonnes of surface on a fifty-metre lever, sized by a
 * yaw static margin requirement of 1.3 that was documented as "airship practice
 * wants 1.3 to 1.8" and cited to nothing. Drawing the tail at the planform the
 * model demanded is what made it obvious, because it looked absurd.
 *
 * Two independent checks say the requirement, not the arithmetic, was the
 * problem, and a third says part of the arithmetic was wrong too.
 */

/**
 * Goodyear's parametric fin sizing, from the NASA modern-airship study.
 *
 * @source NASA CR-137692 (Feasibility Study of Modern Airships, Phase I),
 * Volume IV appendix G. The relation is given as
 *
 *   4 * A_fin = 1.10 * V^(2/3) * (0.5 + 0.067 * F) / F^(2/3)
 *
 * for the TOTAL area of a four-surface tail, with V the gross volume and F the
 * fineness ratio. The appendix's own worked example takes V = 100e6 ft3 and
 * F = 3.50 and gets 75,500 ft2; this expression returns 75,510, which is how
 * the OCR of the printed formula was confirmed.
 *
 * It is dimensionally sound, which matters because the other correlation in the
 * literature is not. Colozza (NASA/CR-2003-212724) fits fin area to volume
 * LINEARLY at 0.0121 m2/m3, and area over volume has units of one over length,
 * so that ratio cannot be scale free: applied across its own fitting range it
 * implies a fin area coefficient that varies by three times between a Zeppelin
 * NT and a Hindenburg. Goodyear's V^(2/3) is the scaling the physics gives,
 * because the Munk moment goes as volume and the fin's restoring moment goes as
 * area times arm.
 */
export const GOODYEAR_FIN_SIZING = under('goodyearFinSizing', () => ({
  coefficient: measured(1.1, {
    unit: '1',
    source: 'nasa-cr-137692',
    relativeUncertainty: 0.02,
  }),
  constantTerm: measured(0.5, {
    unit: '1',
    source: 'nasa-cr-137692',
    relativeUncertainty: 0.05,
  }),
  finenessTerm: measured(0.067, {
    unit: '1',
    source: 'nasa-cr-137692',
    relativeUncertainty: 0.05,
  }),

  /** The worked example the decode was checked against. */
  exampleVolume: measured(100e6, { unit: 'ft3', source: 'nasa-cr-137692', relativeUncertainty: 0 }),
  exampleFineness: measured(3.5, { unit: '1', source: 'nasa-cr-137692', relativeUncertainty: 0 }),
  exampleTotalFinArea: measured(75500, {
    unit: 'ft2',
    source: 'nasa-cr-137692',
    relativeUncertainty: 0.001,
  }),
}))

/**
 * What Munk says about whether real airships were even stable.
 *
 * THE FINDING THAT REFRAMED THE REQUIREMENT. This project computes the Munk
 * moment from NACA TR 184, and the same report states plainly that finned
 * airships of the day did not overcome it:
 *
 *   "Now the actual airships with fins are statically unstable (as the word is
 *   generally understood, not aerostatically of course), but not much so, and
 *   for the present general discussion it can be assumed that the unstable
 *   moment of the hull is nearly neutralized by the transverse force of the
 *   fins."
 *
 * A static margin of "nearly neutralized" is slightly under one, not 1.3. So
 * the model was holding this vehicle to a standard no rigid airship ever met,
 * on the authority of a sentence with no citation behind it, and paying for it
 * in tail mass on the longest lever in the ship.
 *
 * Applying `finBodyLiftFactor` and then evaluating Goodyear's tail against this
 * model's own Munk criterion gives a static margin near 0.8, which is what
 * "unstable but not much so" should look like. Two sources fifty years apart
 * agreeing to that precision is the closest thing to a validation case this
 * quantity has.
 */
export const HISTORICAL_YAW_STATIC_MARGIN = under('historicalYawStaticMargin', () => ({
  nominal: measured(0.82, {
    unit: '1',
    source: 'nasa-cr-137692',
    relativeUncertainty: 0.2,
    note: "Goodyear's parametric tail evaluated against this model's Munk criterion with wing-body carryover credited. Below one, which is what Munk describes and what every rigid airship flew at.",
  }),
}))
