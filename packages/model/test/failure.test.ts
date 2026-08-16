import { describe, expect, it } from 'vitest'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  dumpableInventory,
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

  it('reads its ballast off the arrangement rather than being told', () => {
    // A failure analysis whose ballast figure is a literal will keep saying a
    // mode is survivable after the tank that made it survivable has been
    // deleted from the drawing. Summing the water compartments is what makes
    // this a check on the design rather than a description of one.
    const fromDrawing = dumpableInventory(BASELINE_ARRANGEMENT)
    const tanks = BASELINE_ARRANGEMENT.compartments.filter((c) => c.id.startsWith('water-'))
    expect(tanks.length).toBeGreaterThan(1)
    expect(fromDrawing).toBe(tanks.reduce((s, c) => s + c.mass, 0))
  })

  it('is saved by the ballast now, and it did not used to be', () => {
    // THE WINGS AND THE AMPHIBIOUS GEAR WERE PAID FOR OUT OF THE DAMAGE
    // TOLERANCE, and this is where that shows up. Before they were added the
    // lift margin alone covered a two-cell loss and the water was a
    // convenience; 1.7 tonnes of wing, centreboard and alighting gear later the
    // margin no longer reaches and the ballast is what makes the difference.
    // Nothing about the failure mode changed. The reserve behind it did.
    const dry = failureModes(BASELINE, BASELINE_ARRANGEMENT, 0)
    expect(dry.filter((m) => m.survivable).length).toBeLessThan(SUMMARY.survivable)
  })

  it('finds the loss where the ballast decides, and it is the second cell', () => {
    // One cell is inside the margin. Two is outside the margin and inside
    // margin plus water. Three is outside both, and that is the edge of what
    // the vehicle survives.
    const mass = massStatement(BASELINE, BASELINE_ARRANGEMENT)
    const perCell = mass.grossLift / BASELINE.hull.cellCount
    const ballast = dumpableInventory(BASELINE_ARRANGEMENT)

    expect(perCell).toBeLessThan(mass.liftMargin)
    expect(2 * perCell).toBeGreaterThan(mass.liftMargin)
    expect(2 * perCell).toBeLessThan(mass.liftMargin + ballast)
    expect(3 * perCell).toBeGreaterThan(mass.liftMargin + ballast)
  })
})
