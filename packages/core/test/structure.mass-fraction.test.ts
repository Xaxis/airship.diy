import { describe, expect, it } from 'vitest'
import { STRUCTURAL_FLEET, STRUCTURAL_SCALING } from '@airship/data'
import { m3, kg } from '@airship/units'
import {
  benchmark,
  massFractionAt,
  massFractionSweep,
  minimumViableVolume,
  scaledEmptyWeight,
} from '../src/structure/mass-fraction.js'

const BASELINE_VOLUME = m3(15803)

/**
 * THE PHASE 3 GATE, and the honest answer is that it depends on a number the
 * historical record cannot pin down.
 */
describe('phase 3 gate: can a ship this small carry its own structure?', () => {
  it('closes comfortably if structural mass scales linearly with volume', () => {
    const linear = massFractionAt(BASELINE_VOLUME, 1.0)
    expect(linear.infeasible).toBe(false)
    expect(linear.emptyWeightFraction).toBeLessThan(0.55)
  })

  /**
   * The result that matters, and it is a negative one. At the exponent the
   * square-cube law would predict for a purely surface-driven structure, the
   * baseline ship cannot lift its own empty weight.
   */
  it('CANNOT FLY at the theoretical square-cube exponent', () => {
    const theoretical = massFractionAt(BASELINE_VOLUME, STRUCTURAL_SCALING.theoreticalAreaLaw)
    expect(theoretical.infeasible).toBe(true)
    expect(theoretical.emptyWeightFraction).toBeGreaterThan(1)
    expect(theoretical.usefulLift).toBeLessThan(0)
  })

  it('and has nothing useful left at 0.8', () => {
    const pessimistic = massFractionAt(BASELINE_VOLUME, 0.8)
    expect(pessimistic.emptyWeightFraction).toBeGreaterThan(0.8)
    expect(pessimistic.emptyWeightFraction).toBeLessThan(1)
  })

  /**
   * The two candidate exponents disagree about the DIRECTION of the entire
   * size trade, which is why the sweep is the output rather than a single
   * curve.
   */
  it('the fleet fit and the theory disagree about whether bigger is better', () => {
    const smallFleet = massFractionAt(m3(5953), STRUCTURAL_SCALING.allShipsExponent)
    const largeFleet = massFractionAt(m3(200000), STRUCTURAL_SCALING.allShipsExponent)
    // Fleet-wide fit: bigger is WORSE.
    expect(smallFleet.emptyWeightFraction).toBeLessThan(largeFleet.emptyWeightFraction)

    const smallTheory = massFractionAt(m3(5953), STRUCTURAL_SCALING.theoreticalAreaLaw)
    const largeTheory = massFractionAt(m3(200000), STRUCTURAL_SCALING.theoreticalAreaLaw)
    // Theory: bigger is BETTER.
    expect(smallTheory.emptyWeightFraction).toBeGreaterThan(largeTheory.emptyWeightFraction)
  })

  it('all exponents agree at the reference ship, because that is where they are anchored', () => {
    const atReference = [1.13, 1.0, 0.9, 0.8, 2 / 3].map(
      (e) => massFractionAt(m3(200000), e).emptyWeightFraction,
    )
    for (const f of atReference) expect(f).toBeCloseTo(atReference[0] ?? 0, 9)
  })

  it('reports infeasibility rather than a large useful load number', () => {
    // A caller receiving a negative useful lift must not be able to mistake it
    // for a small positive one.
    const dead = massFractionAt(m3(3000), 2 / 3)
    expect(dead.infeasible).toBe(true)
    expect(dead.usefulLift).toBeLessThan(0)
  })

  it('the sweep returns a family of curves, not one answer', () => {
    const sweep = massFractionSweep([5953, 15803, 37458])
    expect(sweep.length).toBe(15)
    expect(new Set(sweep.map((s) => s.exponent)).size).toBe(5)
  })
})

describe('minimum viable hull size', () => {
  it('grows sharply as the scaling exponent falls', () => {
    const optimistic = minimumViableVolume(kg(4000), 1.0)
    const pessimistic = minimumViableVolume(kg(4000), 0.8)
    expect(optimistic).not.toBeNull()
    expect(pessimistic).not.toBeNull()
    expect(pessimistic ?? 0).toBeGreaterThan(optimistic ?? 0)
  })

  it('a low exponent does not make the ship impossible, only large', () => {
    // Worth being precise about, because the intuition goes the wrong way. At
    // an exponent below 1, lift grows faster than structure, so there is always
    // SOME size that works: the 15,800 m3 baseline fails at 0.67 not because
    // the physics forbids a ship but because it forbids a SMALL one. At 0.5 the
    // answer is about 60,000 m3.
    const solved = minimumViableVolume(kg(4000), 0.5)
    expect(solved).not.toBeNull()
    expect(solved ?? 0).toBeGreaterThan(30000)
  })

  it('returns null when the requirement exceeds what any hull in range can lift', () => {
    // A real result the caller has to handle, not a large number that looks
    // like a design.
    expect(minimumViableVolume(kg(5e6), 0.9, 500000)).toBeNull()
  })

  /**
   * The direction reversal, stated as a test because it is the single most
   * counterintuitive consequence of the exponent being unresolved.
   */
  it('above an exponent of 1 there is a MAXIMUM viable size, not a minimum', () => {
    // Structure then grows faster than lift, so ships get worse as they get
    // bigger. The crossover for the fleet-fitted 1.13 sits around 30 million
    // cubic metres, so it does not bind in practice, but the sign of the trade
    // is the opposite of what the brief assumes.
    const small = massFractionAt(m3(5000), 1.13)
    const large = massFractionAt(m3(500000), 1.13)
    expect(large.emptyWeightFraction).toBeGreaterThan(small.emptyWeightFraction)
  })
})

/**
 * THE BENCHMARK WAS WRONG, and the correction matters because the wrong one is
 * easier to beat.
 */
describe('the benchmark, corrected', () => {
  it('the brief cited a figure that is not a structure figure', () => {
    // Macon's 109,930 kg is the whole fixed weight: eight engines, an aircraft
    // hangar, a trapeze and armament included.
    expect(benchmark().briefCited).toBeCloseTo(0.601, 3)
  })

  it('about a third of the Macon to Hindenburg gap is gas choice, not design', () => {
    const b = benchmark()
    const corrected = b.maconOnHydrogenEquivalent
    expect(corrected).toBeLessThan(b.briefCited)
    expect(corrected).toBeGreaterThan(b.target)
    // 60.1 percent becomes 55.5 percent once both ships are compared on hydrogen.
    expect(corrected).toBeCloseTo(0.555, 2)
  })

  it('the real target is the Hindenburg, on an ISA basis', () => {
    // 51.8 percent, not the 48.8 first published here. That figure divided by a
    // 242 tonne gross lift only reachable with pure hydrogen at 0 degrees C,
    // which is not the basis anything else in this repository uses.
    expect(benchmark().target).toBeCloseTo(0.518, 3)
  })

  it('so 40 to 50 percent means BEATING the best ever, not equalling it', () => {
    // The correction makes the target harder. Hand wet layup in a 12 m shop has
    // to beat what Luftschiffbau Zeppelin achieved in duralumin in 1936 by two
    // to twelve points.
    expect(benchmark().target).toBeGreaterThan(0.5)
  })
})

describe('the historical fleet', () => {
  it('material swings the fraction by nine points at constant size and year', () => {
    // R100 and R101 were built to the same specification in the same year. The
    // only stainless steel ship in the set is also the worst, by more than any
    // size effect in the whole dataset.
    const r100 = STRUCTURAL_FLEET.find((s) => s.id === 'r100')
    const r101 = STRUCTURAL_FLEET.find((s) => s.id === 'r101')
    expect(r101?.material).toBe('stainless steel')
    expect((r101?.emptyWeightFraction ?? 0) - (r100?.emptyWeightFraction ?? 0)).toBeGreaterThan(0.08)
  })

  it('every apparent achievement in the table needs a gas and basis check first', () => {
    // Three of the eight entries were wrong in the first version of this file,
    // all in the direction that flattered the historical fleet. LZ-126 is
    // quoted at 43.5 percent on hydrogen and 59 on the helium it flew on.
    const lz126 = STRUCTURAL_FLEET.find((s) => s.id === 'lz126')
    expect(lz126?.liftingGas).toBe('helium')
    expect(lz126?.note).toContain('CONTESTED')
  })

  it('the one ship that reached 45 percent broke in half on acceptance trials', () => {
    // R-38 got there by stretching unsupported panel length from 11 m to 15 m
    // and cutting gas cells from 18 to 14. A low mass fraction is not by itself
    // evidence of a good design.
    const r38 = STRUCTURAL_FLEET.find((s) => s.id === 'r38')
    expect(r38?.emptyWeightFraction).toBeLessThan(0.5)
    expect(r38?.note).toContain('BROKE IN HALF')
  })

  it('empty weight per cubic metre is far more stable than mass fraction', () => {
    // Across eight ships, fifteen years, two gases, two materials and three
    // countries it spans only 1.56 to 1, while mass fraction spans nearly 30
    // percentage points. That is why it is the right sizing prior.
    const perVolume = STRUCTURAL_FLEET.map((s) => s.emptyWeight / s.gasVolume)
    const spread = Math.max(...perVolume) / Math.min(...perVolume)
    const fractions = STRUCTURAL_FLEET.map((s) => s.emptyWeightFraction)
    const fractionSpread = Math.max(...fractions) / Math.min(...fractions)
    expect(spread).toBeLessThan(fractionSpread)
  })

  it('the model computes the Hindenburg gross lift the fleet entry claims', () => {
    // A self-consistency check worth having: the fleet entry uses the model's
    // own ISA gross lift rather than a published figure on an unstated basis,
    // so the two must agree.
    const hindenburg = STRUCTURAL_FLEET.find((s) => s.id === 'lz129-hindenburg')
    expect(massFractionAt(m3(200000), 1.0).grossLift).toBeCloseTo(hindenburg?.grossLift ?? 0, -2)
  })

  it('scaled empty weight reproduces the Hindenburg at its own volume', () => {
    for (const exponent of [1.13, 1.0, 0.8, 2 / 3]) {
      expect(scaledEmptyWeight(m3(200000), exponent)).toBeCloseTo(118000, -3)
    }
  })
})
