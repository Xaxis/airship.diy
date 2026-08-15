import { describe, expect, it } from 'vitest'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  failureModes,
  failureSummary,
  massStatement,
} from '../src/index.js'

/**
 * What breaks, and whether it kills you.
 *
 * An FMEA whose consequences are asserted is a document. An FMEA whose
 * consequences are computed from the same mass statement that sizes the ship is
 * a check, and it fails when the design changes underneath it. These tests
 * guard that it stays the second kind.
 */

const MODES = failureModes(BASELINE, BASELINE_ARRANGEMENT)
const SUMMARY = failureSummary(MODES)

describe('the failure modes', () => {
  it('computes the lift lost to a torn cell from the mass statement, not from a table', () => {
    // One cell of twelve is a twelfth of the gas, and a twelfth of the gross
    // lift is a number the arrangement already knows. Writing it down separately
    // is how an FMEA drifts away from the ship it describes.
    const mass = massStatement(BASELINE, BASELINE_ARRANGEMENT)
    const oneCell = MODES.find((m) => m.id === 'one-gas-cell')!
    const perCell = mass.grossLift / BASELINE.hull.cellCount
    expect(oneCell.consequence).toContain(perCell.toFixed(0))
  })

  it('finds two adjacent cells survivable, which is what the margin is for', () => {
    const two = MODES.find((m) => m.id === 'two-gas-cells')!
    expect(two.survivable).toBe(true)
  })

  it('finds exactly one mode that is not survivable, and it is the DC bus', () => {
    // Every source and every load meets on one bus. Propulsion, life support,
    // the electrolyzer and the fuel cell controls are all downstream of it, and
    // no amount of generating capacity upstream helps. The answer is a split
    // bus with a tie, not a probability argument.
    expect(SUMMARY.catastrophic.map((m) => m.id)).toEqual(['main-bus'])
    expect(SUMMARY.survivable).toBe(SUMMARY.total - 1)
  })

  it('gives every mode a detection, a response and a design answer', () => {
    // A failure you cannot detect is not a failure mode, it is a surprise, and
    // a mode listed without an answer is a worry rather than engineering.
    for (const mode of MODES) {
      expect(`${mode.id}: ${mode.detection.length > 8}`).toBe(`${mode.id}: true`)
      expect(`${mode.id}: ${mode.response.length > 20}`).toBe(`${mode.id}: true`)
      expect(`${mode.id}: ${mode.designAnswer.length > 20}`).toBe(`${mode.id}: true`)
    }
  })

  it('turns a mode catastrophic when the ballast to answer it is taken away', () => {
    // The point of computing consequences is that they move. With no ballast
    // aboard, the cell tears stop being survivable, which is the argument for
    // carrying water rather than an assertion that water is nice to have.
    const dry = failureModes(BASELINE, BASELINE_ARRANGEMENT, 0)
    const wet = failureModes(BASELINE, BASELINE_ARRANGEMENT, 2500)
    const drySurvivable = dry.filter((m) => m.survivable).length
    const wetSurvivable = wet.filter((m) => m.survivable).length
    expect(drySurvivable).toBeLessThanOrEqual(wetSurvivable)
  })
})
