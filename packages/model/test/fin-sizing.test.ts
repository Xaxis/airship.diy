import { GOODYEAR_FIN_SIZING, v } from '@airship/data'
import { hullRadiusAt, hullShapeForPrismatic, finBodyLiftFactor } from '@airship/core'
import { m } from '@airship/units'
import { describe, expect, it } from 'vitest'

import { BASELINE, BASELINE_ARRANGEMENT, finPlanform, validateArrangement } from '../src/index.js'

/**
 * VALIDATION: the tail, against the two independent things that can check it.
 *
 * This is the gate that was missing when the model produced 869 m2 of cruciform
 * on a 118 m hull and nobody noticed, because the number was only ever compared
 * against a requirement the model also invented.
 */

/** @source NASA CR-137692 Appendix G, total area of a four-surface tail. */
const goodyearTotalFinArea = (volume: number, fineness: number): number =>
  v(GOODYEAR_FIN_SIZING.coefficient) *
  volume ** (2 / 3) *
  ((v(GOODYEAR_FIN_SIZING.constantTerm) + v(GOODYEAR_FIN_SIZING.finenessTerm) * fineness) /
    fineness ** (2 / 3))

describe("Goodyear's parametric tail", () => {
  it('reproduces the appendix worked example, which is how the OCR was confirmed', () => {
    // The printed formula came through a 1975 scan badly enough that it had to
    // be decoded rather than read. The example is the check: 100e6 ft3 at
    // fineness 3.50 should give 75,500 ft2 for the four surfaces together.
    const computed = goodyearTotalFinArea(
      v(GOODYEAR_FIN_SIZING.exampleVolume),
      v(GOODYEAR_FIN_SIZING.exampleFineness),
    )
    const published = v(GOODYEAR_FIN_SIZING.exampleTotalFinArea)
    expect(Math.abs(computed / published - 1)).toBeLessThan(0.001)
  })

  it('is scale free, which the competing correlation is not', () => {
    // THE REASON THIS SOURCE WAS CHOSEN OVER THE OBVIOUS ONE. Colozza fits fin
    // area to volume LINEARLY, and area over volume has units of one over
    // length, so it cannot be a similarity ratio. Across the size range it was
    // fitted on it implies a fin coefficient that varies threefold.
    //
    // Goodyear's V^(2/3) is what the physics gives: the Munk moment goes as
    // volume, the restoring moment as area times arm, so at fixed fineness the
    // required area goes as volume to the two thirds and the coefficient is
    // constant.
    const coefficient = (volume: number) =>
      goodyearTotalFinArea(volume, 5) / volume ** (2 / 3)
    const small = coefficient(8000)
    const large = coefficient(200000)
    expect(Math.abs(large / small - 1)).toBeLessThan(1e-9)

    // Whereas the linear ratio moves by a factor of three over the same range.
    const colozza = (volume: number) => (0.0121 * volume) / volume ** (2 / 3)
    expect(colozza(200000) / colozza(8000)).toBeGreaterThan(2.9)
  })
})

describe('this vehicle against the historical fleet', () => {
  const fins = finPlanform(BASELINE, BASELINE_ARRANGEMENT)
  const { length, finenessRatio, prismaticCoefficient } = BASELINE.hull
  /** @derived Hull volume at the baseline geometry, m3. */
  const VOLUME = 35616

  it('carries more tail than historical practice, and by a stated factor', () => {
    // NOT a failure. It is a design choice, made because this vehicle has two
    // people aboard for months and no relief watch, where Akron had a bridge
    // crew standing rudder watches around the clock. But it is a departure and
    // the model must say by how much rather than quietly claim to be normal.
    const historical = goodyearTotalFinArea(VOLUME, finenessRatio)
    const ratio = fins.area / historical
    expect(ratio).toBeGreaterThan(1)
    expect(ratio).toBeLessThan(3)
  })

  it("puts Goodyear's own tail BELOW neutral on this model's criterion", () => {
    // THE CROSS-CHECK THAT MATTERS, and it is the one that found the missing
    // physics. Evaluate the historical tail against our Munk criterion and it
    // should come out slightly unstable, because Munk says in TR 184 that real
    // finned airships were slightly unstable. Before the wing-body carryover
    // was credited it came out at 0.52, which is not "not much so"; with it
    // credited it is near 0.8, which is.
    const yaw = validateArrangement(BASELINE, BASELINE_ARRANGEMENT).find(
      (f) => f.id === 'yaw-static-margin',
    )
    const minimum = Number(/against a ([0-9.]+) m2 minimum/.exec(yaw?.detail ?? '')?.[1])
    expect(Number.isFinite(minimum)).toBe(true)

    const historicalVerticalPair = goodyearTotalFinArea(VOLUME, finenessRatio) / 2
    const historicalMargin = historicalVerticalPair / minimum
    expect(historicalMargin).toBeGreaterThan(0.6)
    expect(historicalMargin).toBeLessThan(1)
  })

  it('credits the fin with the load it induces on the hull', () => {
    // The correction. A panel on a body carries more than the same panel alone
    // AND induces a load on the body, both at the tail arm, and the criterion
    // counted neither. TR 1307 puts the pair at (1 + lambda)^2.
    const rootRadius = hullRadiusAt(
      m(length),
      finenessRatio,
      BASELINE_ARRANGEMENT.finStation,
      hullShapeForPrismatic(prismaticCoefficient),
    )
    const lambda = rootRadius / (rootRadius + fins.span)
    expect(lambda).toBeGreaterThan(0.15)
    expect(lambda).toBeLessThan(0.4)
    // Worth more than half a tail on this vehicle, which is why leaving it out
    // was worth roughly a tonne of fin.
    expect(finBodyLiftFactor(lambda)).toBeGreaterThan(1.4)
  })

  it('has a lambda of zero recover the free-surface answer exactly', () => {
    expect(finBodyLiftFactor(0)).toBe(1)
  })
})
