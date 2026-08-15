import { describe, expect, it } from 'vitest'
import { END_FIXITY, SP8007, v } from '@airship/data'
import { m, Pa } from '@airship/units'
import {
  assessBuckling,
  columnAllowable,
  eulerBucklingStress,
  johnsonParabolaStress,
  johnsonTangencySlenderness,
  localShellBucklingStress,
  localToEulerTransitionLength,
  mayUseUniversalCompositeKnockdown,
  minimumPracticalThickness,
} from '../src/structure/buckling.js'

/** A wet-laid woven CFRP tube longeron: modest modulus, 600 MPa compression. */
const E = Pa(70e9)
const FCU = Pa(600e6)
const RADIUS = m(0.04)

describe('buckling governs, and which mode depends on bay length', () => {
  it('a short bay fails locally, a long bay fails as a column', () => {
    // The result that decides where design effort goes. A designer who assumes
    // Euler will size the wall for the wrong failure.
    const short = assessBuckling(E, FCU, RADIUS, m(0.0006), m(0.5))
    const long = assessBuckling(E, FCU, RADIUS, m(0.0006), m(5))

    expect(short.governingMode).not.toBe('euler')
    expect(long.governingMode).toBe('euler')
  })

  it('the transition sits around thirty radii, which is longer than a typical bay', () => {
    // So local modes govern almost everywhere on this structure.
    const transition = localToEulerTransitionLength(RADIUS, m(0.0006))
    expect(transition / RADIUS).toBeGreaterThan(20)
    expect(transition / RADIUS).toBeLessThan(60)
  })

  it('Euler stress falls as the inverse square of bay length', () => {
    const a = eulerBucklingStress(E, RADIUS, m(2))
    const b = eulerBucklingStress(E, RADIUS, m(4))
    expect(a / b).toBeCloseTo(4, 6)
  })

  it('local shell stress rises FASTER than linearly with wall thickness', () => {
    // The classical term is linear in t/r, but the empirical knockdown improves
    // as r/t falls: a thicker shell is less imperfection-sensitive. Quadrupling
    // the wall multiplies the allowable by about five, not four.
    //
    // Worth pinning because it means the usual intuition understates what a
    // slightly thicker wall buys, right up to the point where the material
    // strength caps it.
    const thin = localShellBucklingStress(E, RADIUS, m(0.0005))
    const thick = localShellBucklingStress(E, RADIUS, m(0.002))
    expect(thick / thin).toBeGreaterThan(4)
    expect(thick / thin).toBeLessThan(6)
  })

  it('and the knockdown itself improves as the shell gets thicker', () => {
    // The mechanism behind the super-linear scaling, asserted separately so a
    // change to the correlation shows up here rather than as a surprise in the
    // combined result.
    const thinShell = localShellBucklingStress(E, RADIUS, m(0.0005)) / (0.0005 / RADIUS)
    const thickShell = localShellBucklingStress(E, RADIUS, m(0.002)) / (0.002 / RADIUS)
    expect(thickShell).toBeGreaterThan(thinShell)
  })

  /**
   * THE DESIGN FINDING. Past a certain wall thickness the member stops being
   * buckling-limited and becomes material-limited, and every gram beyond that
   * is dead mass.
   */
  it('above about a millimetre of wall, extra thickness buys nothing', () => {
    const oneMil = assessBuckling(E, FCU, RADIUS, m(0.001), m(1.5))
    const twoMil = assessBuckling(E, FCU, RADIUS, m(0.002), m(1.5))
    expect(twoMil.allowableStress).toBeCloseTo(oneMil.allowableStress, -3)
  })

  it('and the saturation point is where local shell stress passes material strength', () => {
    const saturated = localShellBucklingStress(E, RADIUS, m(0.002))
    expect(saturated).toBeGreaterThan(FCU)
  })
})

describe('the column curve is two branches, and each is invalid outside its own', () => {
  it('the Johnson parabola goes negative for a long column, which is not physical', () => {
    // It is the formula being evaluated outside its domain. columnAllowable
    // switches to Euler instead, and this test exists because clamping the
    // parabola at zero silently produced an allowable of zero for every long
    // bay in an earlier version.
    const tangency = johnsonTangencySlenderness(FCU, E)
    const beyond = johnsonParabolaStress(FCU, E, tangency * 2)
    expect(beyond).toBe(0)

    const correct = columnAllowable(FCU, E, tangency * 2)
    expect(correct).toBeGreaterThan(0)
  })

  it('the two branches meet at the tangency slenderness', () => {
    const tangency = johnsonTangencySlenderness(FCU, E)
    const justBelow = columnAllowable(FCU, E, tangency * 0.999)
    const justAbove = columnAllowable(FCU, E, tangency * 1.001)
    expect(Math.abs(justAbove / justBelow - 1)).toBeLessThan(0.01)
  })

  it('and the meeting point is at half the crippling stress, as constructed', () => {
    const tangency = johnsonTangencySlenderness(FCU, E)
    expect(columnAllowable(FCU, E, tangency)).toBeCloseTo(FCU / 2, -5)
  })
})

/**
 * The SP-8007 correlation is the most misapplied one in composite structures,
 * so the model says when it is being pushed outside its fitted range.
 */
describe('SP-8007 validity is checked, not assumed', () => {
  it('warns when the shell is thicker than the test data covers', () => {
    // r/t of 20 is well below the 80 lower bound.
    const result = assessBuckling(E, FCU, RADIUS, m(0.002), m(1))
    expect(result.warnings.some((w) => w.includes('below'))).toBe(true)
  })

  it('warns when the shell is thinner than the test data covers', () => {
    const result = assessBuckling(E, FCU, m(1.0), m(0.0002), m(2))
    expect(result.warnings.some((w) => w.includes('exceeds'))).toBe(true)
  })

  it('is quiet when the geometry sits inside the fitted range', () => {
    // r/t of 200, L/r of 2.5.
    const result = assessBuckling(E, FCU, m(0.1), m(0.0005), m(0.25))
    expect(result.warnings).toHaveLength(0)
  })

  it('the bending knockdown is LESS severe than the compression one', () => {
    // Counterintuitive, and SP-8007 flags it itself: a shell in bending has only
    // part of its circumference at peak stress. Applying the bending knockdown
    // to a compression case is unconservative.
    const compression = localShellBucklingStress(E, RADIUS, m(0.0006), false)
    const bending = localShellBucklingStress(E, RADIUS, m(0.0006), true)
    expect(bending).toBeGreaterThan(compression)
    expect(v(SP8007.bendingKnockdownAsymptote)).toBeLessThan(v(SP8007.axialKnockdownAsymptote))
  })

  /**
   * A refusal rather than a computation. The 0.65 universal composite knockdown
   * is widely used and is UNCONSERVATIVE, which is more dangerous than a value
   * nobody has heard of.
   */
  it('refuses the universal 0.65 composite knockdown, with a reason', () => {
    const verdict = mayUseUniversalCompositeKnockdown()
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('unconservative')
    expect(verdict.reason).toContain('edition')
  })
})

describe('end fixity is uncertain across a factor of 2.5', () => {
  it('a wire-braced joint is neither pinned nor fixed', () => {
    expect(v(END_FIXITY.airshipGirder)).toBeGreaterThan(v(END_FIXITY.pinnedPinned))
    expect(v(END_FIXITY.airshipGirder)).toBeLessThan(v(END_FIXITY.fixedFixed))
  })

  it('and assuming pinned leaves real capacity unused', () => {
    // Historical practice assumed pinned, which is conservative and wasteful:
    // designing at 1.0 when the truth is 2.0 leaves half the buckling capacity
    // on the table, and this is a shop test rather than a laboratory one.
    const pinned = eulerBucklingStress(E, RADIUS, m(3), v(END_FIXITY.pinnedPinned))
    const realistic = eulerBucklingStress(E, RADIUS, m(3), v(END_FIXITY.airshipGirder))
    expect(realistic / pinned).toBeCloseTo(v(END_FIXITY.airshipGirder), 6)
  })
})

describe('minimum practical thickness is a build constraint, not a physical one', () => {
  it('four plies, because below that handling damage governs', () => {
    // A structure optimised purely against buckling converges on walls nobody
    // can build, carry, or repair without breaking.
    const plyThickness = 0.25e-3
    expect(minimumPracticalThickness(plyThickness)).toBeCloseTo(1e-3, 9)
  })

  it('and the buckling optimum would go thinner than that if allowed', () => {
    // At 1.5 m bays the member is already material-limited at 1 mm, so pure
    // buckling optimisation would keep thinning the wall until it hit the
    // handling floor rather than a physics one.
    const atFloor = assessBuckling(E, FCU, RADIUS, m(1e-3), m(1.5))
    const belowFloor = assessBuckling(E, FCU, RADIUS, m(0.4e-3), m(1.5))
    expect(belowFloor.allowableStress).toBeLessThan(atFloor.allowableStress)
  })
})

describe('input validation', () => {
  it('refuses non-positive dimensions rather than returning infinity', () => {
    expect(() => eulerBucklingStress(E, RADIUS, m(0))).toThrow(RangeError)
    expect(() => localShellBucklingStress(E, RADIUS, m(0))).toThrow(RangeError)
  })
})
