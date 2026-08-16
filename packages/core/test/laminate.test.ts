import { LAMINATE_ANCHORS, v } from '@airship/data'
import { describe, expect, it } from 'vitest'

import { laminate } from '../src/index.js'

/**
 * From fibre and resin to a laminate you can size a member against.
 *
 * THESE TESTS EXIST BECAUSE THIS MODULE WAS WRONG BY 60 PERCENT AND EVERY TEST
 * IN THE REPOSITORY PASSED. It built the woven case up with the rule of mixtures
 * and a crimp knockdown, got 102 GPa, and nothing anywhere compared that against
 * a laminate somebody had actually measured. A value that decides the frame mass
 * of the whole vehicle moved by 38 percent when it was corrected and not one
 * assertion noticed.
 *
 * So the rule these encode is: the answer must agree with a MEASUREMENT, and it
 * must agree with a SECOND, INDEPENDENT route to the same number.
 */

const WOVEN = laminate()
const TAPE = laminate({ woven: false })

/** @derived Pascals to gigapascals and to megapascals, for readable assertions. */
const GPA = 1e9
const MPA = 1e6

describe('a woven wet layup', () => {
  it('is stiffer than half its measured anchor and nowhere near the rule of mixtures', () => {
    // The anchor is 70 GPa at 50 percent fibre volume. At the 47 percent a
    // vacuum-bagged wet layup reaches, less 3.4 percent voids, it must land just
    // below that. The rule of mixtures on bare fibre gives 102 GPa, and any
    // answer near that means the aligned-fibre error has come back.
    const anchor = v(LAMINATE_ANCHORS.woven.modulus)
    expect(WOVEN.modulus).toBeLessThan(anchor)
    expect(WOVEN.modulus).toBeGreaterThan(anchor * 0.8)
    expect(WOVEN.modulus).toBeLessThan(80 * GPA)
  })

  it('agrees with an independent scaling of the same published table', () => {
    // The build research scaled the same Performance Composites fabric row to
    // Vf 0.45 and 3 percent voids and got 61.1 GPa. This module works at Vf 0.47
    // and 3.4 percent and should land a little above it. Two routes, one number.
    const independent = 61.1 * GPA
    expect(WOVEN.modulus / independent).toBeGreaterThan(0.95)
    expect(WOVEN.modulus / independent).toBeLessThan(1.15)
  })

  it('beats duralumin on specific modulus by the factor the frame model assumes', () => {
    // An airship frame is buckling critical, so it is sized by modulus over
    // density rather than by strength. The arrangement applies a 0.62 carbon
    // framework factor justified by a 1.6 to 1.9 band on this ratio. Before the
    // correction the laminate gave 2.7, outside that band, so the factor was
    // right by accident. It must now be right on purpose.
    /** @source 2024-T3 duralumin: 73 GPa over 2,780 kg/m3. */
    const DURALUMIN_SPECIFIC_MODULUS = 73e9 / 2780
    const ratio = WOVEN.modulus / WOVEN.density / DURALUMIN_SPECIFIC_MODULUS
    expect(ratio).toBeGreaterThan(1.6)
    expect(ratio).toBeLessThan(1.9)
  })

  it('loses more in tension than in stiffness, which is what crimp does', () => {
    // Where a tow crosses another it is not straight, and the stress
    // concentration there costs far more strength than the waviness costs
    // modulus. A model that knocks both down by the same fraction has not
    // understood the mechanism.
    const modulusFraction = WOVEN.modulus / TAPE.modulus
    const tensionFraction = WOVEN.tensileStrength / TAPE.tensileStrength
    expect(tensionFraction).toBeLessThan(modulusFraction)
  })

  it('is hurt in compression by voids and barely at all in stiffness', () => {
    // A fibre in compression is held straight by the matrix around it, and a
    // void is matrix that is not there. Tension and stiffness lose only the
    // volume the voids occupy.
    const voidless = laminate()
    expect(WOVEN.compressiveStrength).toBeLessThan(v(LAMINATE_ANCHORS.woven.compressiveStrength))
    // Roughly 7 percent of compressive strength per percent of voids, against
    // the 3.4 percent of volume that stiffness loses.
    expect(WOVEN.compressiveStrength / voidless.compressiveStrength).toBeCloseTo(1, 5)
    expect(WOVEN.compressiveStrength).toBeGreaterThan(300 * MPA)
    expect(WOVEN.compressiveStrength).toBeLessThan(500 * MPA)
  })
})

describe('the vacuum bag', () => {
  it('is worth a quarter of every fibre-dominated property', () => {
    const bagged = laminate({ vacuumBagged: true })
    const not = laminate({ vacuumBagged: false })
    const loss = 1 - not.modulus / bagged.modulus
    expect(loss).toBeGreaterThan(0.2)
    expect(loss).toBeLessThan(0.3)
  })
})

describe('unidirectional tape', () => {
  it('is far stiffer than the same fibre woven, which is the whole case for tube', () => {
    // Bought pultruded tube is made from aligned tape in a heated die. The
    // module's headline recommendation, buy the members rather than laying them
    // up, rests on this ratio, so it has to be real and it has to be stated at
    // the right size: it is a little over 1.6, not the 1.01 the broken laminate
    // model implied and not the 2 that a careless reading of the fibre
    // datasheets would suggest.
    const ratio = TAPE.modulus / WOVEN.modulus
    expect(ratio).toBeGreaterThan(1.5)
    expect(ratio).toBeLessThan(1.8)
  })
})
