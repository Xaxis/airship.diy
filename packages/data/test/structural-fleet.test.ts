import { describe, expect, it } from 'vitest'

import { STRUCTURAL_FLEET, STRUCTURAL_SCALING } from '../src/index.js'

/**
 * The structural fleet, which is where the square-cube law is anchored.
 *
 * This file did not exist, which is why the fleet-wide exponent could be stored
 * as a literal that the table it claims to be fitted to does not produce.
 */
describe('the fleet-wide exponent is fitted, not asserted', () => {
  /**
   * It was the literal 1.13 with an R^2 of 0.94, described as the fit over all
   * eight ships. The fit is 1.0603 with an R^2 of 0.9580. Nothing checked, so
   * the two could disagree indefinitely, and the stored value was the top rung
   * of the exponent ladder and rendered on the site.
   */
  it('reproduces an independent regression over the table', () => {
    const xs = STRUCTURAL_FLEET.map((s) => Math.log(s.gasVolume))
    const ys = STRUCTURAL_FLEET.map((s) => Math.log(s.emptyWeight))
    const n = xs.length
    const mx = xs.reduce((a, b) => a + b, 0) / n
    const my = ys.reduce((a, b) => a + b, 0) / n
    let sxy = 0
    let sxx = 0
    for (let i = 0; i < n; i += 1) {
      sxy += ((xs[i] as number) - mx) * ((ys[i] as number) - my)
      sxx += ((xs[i] as number) - mx) ** 2
    }
    expect(STRUCTURAL_SCALING.allShipsExponent).toBeCloseTo(sxy / sxx, 10)
  })

  it('moves if a ship is added or a mass is corrected', () => {
    // Which is the point of computing it. Dropping any single ship moves the
    // exponent between 1.000 and 1.101, so a stored constant would have gone
    // stale the first time the table was touched.
    expect(STRUCTURAL_SCALING.allShipsExponent).toBeGreaterThan(1.0)
    expect(STRUCTURAL_SCALING.allShipsExponent).toBeLessThan(1.11)
    expect(STRUCTURAL_SCALING.allShipsRSquared).toBeGreaterThan(0.9)
  })

  it('carries a standard error wide enough to admit the whole ladder', () => {
    // The record cannot distinguish a linear law from a superlinear one, which
    // is why the mass fraction is swept over a family rather than evaluated at
    // a point. The ladder's top rung must sit inside the interval.
    const { allShipsExponent: e, allShipsStandardError: se } = STRUCTURAL_SCALING
    expect(STRUCTURAL_SCALING.robustExponentHigh).toBeLessThan(e + 1.96 * se)
    expect(STRUCTURAL_SCALING.robustExponentLow).toBeGreaterThan(0)
  })
})
