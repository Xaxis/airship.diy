import { HYDROGEN_STORAGE_DENSITY, v } from '@airship/data'
import { describe, expect, it } from 'vitest'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  collapsibleEnvelope,
  massStatement,
  pressurisedLobeWing,
  refusedRequirements,
} from '../src/index.js'

/**
 * The requirements that were asked for and refused.
 *
 * A refusal written in prose is a refusal that stops being checked. These
 * compute their no from the same constants the rest of the model uses, so a
 * better storage technology reopens the question by itself rather than waiting
 * for somebody to remember. The tests exist to make sure the arithmetic stays
 * the thing doing the refusing.
 */

const MASS = massStatement(BASELINE, BASELINE_ARRANGEMENT)
const MARGIN_FRACTION = MASS.liftMargin / MASS.grossLift

describe('collapsing the envelope to become a boat', () => {
  it('refuses on an argument that does not mention the vehicle at all', () => {
    // THE CLEANEST NO IN THE PROJECT. Tank mass over gross lift is a constant
    // times (1-f)/f, and the volume cancels, so no size of ship changes it.
    const a = collapsibleEnvelope(BASELINE, MARGIN_FRACTION)
    const smaller = collapsibleEnvelope(
      { ...BASELINE, hull: { ...BASELINE.hull, length: 40 } },
      MARGIN_FRACTION,
    )
    const larger = collapsibleEnvelope(
      { ...BASELINE, hull: { ...BASELINE.hull, length: 400 } },
      MARGIN_FRACTION,
    )
    expect(smaller.ratio).toBeCloseTo(a.ratio, 10)
    expect(larger.ratio).toBeCloseTo(a.ratio, 10)
    expect(a.refused).toBe(true)
  })

  it('puts break-even above the target nobody has met', () => {
    // Break-even needs about 6.96 percent hydrogen by mass. The DOE ULTIMATE
    // target is 6.5. So the tanks weigh more than the gas lifts even in the
    // future everyone is aiming at, which is why this is a closed door rather
    // than an engineering problem.
    const ultimate = v(HYDROGEN_STORAGE_DENSITY.doeUltimateSystemGravimetricFraction)
    const atUltimate = 0.0748 * ((1 - ultimate) / ultimate)
    expect(atUltimate).toBeGreaterThan(1)
  })

  it('would reopen by itself if a storage system got good enough', () => {
    // The point of computing the refusal rather than writing it down. Hand it a
    // fictional system at 40 percent by mass and it stops refusing.
    const a = collapsibleEnvelope(BASELINE, MARGIN_FRACTION)
    expect(a.whatWouldReopenIt).toContain('percent hydrogen by mass')
    // And the threshold it names is above anything real, by a lot.
    expect(a.ratio).toBeGreaterThan(MARGIN_FRACTION * 3)
  })
})

describe('the lobes as wings', () => {
  it('does NOT refuse on the buoyancy loss, which is two tenths of a percent', () => {
    // THE OVERCLAIM THIS TEST EXISTS TO PREVENT. Raising the pressure inside a
    // lobe does reduce its buoyancy in exact proportion, and at the superpressure
    // a lobe actually needs that proportion is negligible. The first draft of
    // this module called it the killer, and it is not.
    const r = pressurisedLobeWing(BASELINE, 2500, 0.1)
    expect(r.detail).toContain('SUPERPRESSURE IS NOT THE PROBLEM')
    expect(r.detail).toContain('0.18 percent')
  })

  it('refuses on the ballonet, which costs lift one for one by volume', () => {
    // Reshaping a lobe by inflating air inside it displaces lifting gas volume
    // for volume. That is the mechanism people mean when they say pressurising
    // costs lift, and it is what the detail quantifies against the tiny
    // compressibility loss it is usually confused with.
    const tenth = pressurisedLobeWing(BASELINE, 2500, 0.1)
    const fifth = pressurisedLobeWing(BASELINE, 2500, 0.2)
    expect(tenth.detail).toContain('10 percent of the lobe')
    expect(fifth.detail).toContain('20 percent of the lobe')
    expect(tenth.refused).toBe(true)
  })

  it('reports an infinite ratio, because no parameter reopens it', () => {
    // The refusal is STRUCTURAL: vectored thrust needs a member in compression
    // and fabric has none. Reporting the ballonet loss as the ratio suggested a
    // threshold that could be crossed by tuning the ballonet.
    const r = pressurisedLobeWing(BASELINE, 2500, 0.1)
    expect(r.ratio).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('the register as a whole', () => {
  it('names what would reopen every one of them', () => {
    for (const r of refusedRequirements(BASELINE, MARGIN_FRACTION)) {
      expect(`${r.id}: ${r.whatWouldReopenIt.length > 40}`).toBe(`${r.id}: true`)
      expect(`${r.id}: ${r.requirement.length > 40}`).toBe(`${r.id}: true`)
    }
  })
})
