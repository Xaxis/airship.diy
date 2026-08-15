import { describe, expect, it } from 'vitest'
import {
  CARBON_FIBRES,
  RESIN_SYSTEMS,
  TEMPERATURE_LIMITS,
  WET_LAYUP,
  WOVEN_KNOCKDOWN,
  maximumOperatingTemperature,
  v,
} from '../src/index.js'

const fibre = (id: string) => {
  const found = CARBON_FIBRES.find((f) => f.id === id)
  if (!found) throw new Error(`No fibre ${id}`)
  return found
}

const resin = (id: string) => {
  const found = RESIN_SYSTEMS.find((r) => r.id === id)
  if (!found) throw new Error(`No resin ${id}`)
  return found
}

const C = (kelvin: number) => kelvin - 273.15

/**
 * THE BINDING MATERIALS CONSTRAINT, asserted so it cannot be quietly lost when
 * somebody edits a resin datasheet entry.
 *
 * It is glass transition temperature rather than strength, and it rules out
 * every ambient-cure epoxy for primary structure. How much worse than that it
 * is depends on a moisture basis nobody has pinned down.
 */
describe('temperature is the binding materials constraint, not strength', () => {
  const SATURATED = v(WET_LAYUP.voidContent)
  const resinBasis = v(TEMPERATURE_LIMITS.resinSaturationMoistureFraction)
  const laminateBasis = v(TEMPERATURE_LIMITS.laminateSaturationMoistureFraction)
  const saturation = resinBasis

  it('ambient-cure marine epoxy permits a maximum operating temperature below freezing', () => {
    // West System 105/206 is the default marine laminating epoxy and the first
    // thing any builder reaches for. Saturated, the FAA margin puts its limit
    // at about -28 C, which is not a margin to trim. It is a wall.
    const mot = maximumOperatingTemperature(resin('west-105-206').dryGlassTransition, saturation)
    expect(C(mot)).toBeLessThan(0)
  })

  it('the other ambient-cure system fails the same way', () => {
    const mot = maximumOperatingTemperature(
      resin('proset-lam125-ambient').dryGlassTransition,
      saturation,
    )
    expect(C(mot)).toBeLessThan(0)
  })

  it('an 82 C post-cure buys 32 K of dry Tg and is the difference between usable and not', () => {
    const ambient = resin('proset-lam125-ambient').dryGlassTransition
    const postCured = resin('proset-lam125-postcured').dryGlassTransition
    expect(postCured - ambient).toBeGreaterThan(30)
    expect(C(maximumOperatingTemperature(postCured, saturation))).toBeGreaterThan(0)
  })

  it('but even post-cured, the harsh reading permits only about 8 C', () => {
    const mot = maximumOperatingTemperature(
      resin('proset-lam125-postcured').dryGlassTransition,
      resinBasis,
    )
    expect(C(mot)).toBeGreaterThan(0)
    expect(C(mot)).toBeLessThan(20)
  })

  /**
   * THE PIVOT. Only the resin absorbs water, so 3 percent of resin mass is about
   * 1.4 percent of laminate mass. Wright's paper does not say which basis its
   * moisture axis uses, and the difference is 32 K of permissible operating
   * temperature: 8 C against 40 C. That is the difference between a design
   * killer and a design constraint.
   */
  it('the moisture basis moves the limit by 32 K, and nobody knows which applies', () => {
    const dryTg = resin('proset-lam125-postcured').dryGlassTransition
    const harsh = maximumOperatingTemperature(dryTg, resinBasis)
    const generous = maximumOperatingTemperature(dryTg, laminateBasis)

    expect(C(harsh)).toBeLessThan(20)
    expect(C(generous)).toBeGreaterThan(30)
    expect(generous - harsh).toBeGreaterThan(25)
  })

  it('ambient cure fails on EITHER basis, which is the part that is settled', () => {
    const dryTg = resin('west-105-206').dryGlassTransition
    expect(C(maximumOperatingTemperature(dryTg, resinBasis))).toBeLessThan(0)
    expect(C(maximumOperatingTemperature(dryTg, laminateBasis))).toBeLessThan(15)
  })

  it('a dry laminate would be fine, which is why the moisture assumption carries the result', () => {
    // The whole finding rests on the saturation figure. Dry, the post-cured
    // system permits 68 C and there is no problem at all. The frame sits inside
    // the envelope, shaded and separated from rain by the cover, so its real
    // moisture uptake is somewhere between and nobody has measured it.
    const dry = maximumOperatingTemperature(resin('proset-lam125-postcured').dryGlassTransition, 0)
    expect(C(dry)).toBeGreaterThan(60)
  })

  it('the limit falls 20 K for every percent of absorbed moisture', () => {
    const dryTg = resin('proset-lam125-postcured').dryGlassTransition
    const atOne = maximumOperatingTemperature(dryTg, 0.01)
    const atTwo = maximumOperatingTemperature(dryTg, 0.02)
    expect(atOne - atTwo).toBeCloseTo(20, 6)
  })

  it('keeps the void content sane, since it is used elsewhere', () => {
    expect(SATURATED).toBeGreaterThan(0)
    expect(SATURATED).toBeLessThan(0.06)
  })
})

/**
 * High modulus fibre looks right for a structure that buckles and is wrong.
 */
describe('high modulus fibre is a trap for a buckling-critical frame', () => {
  it('has far more modulus and far less composite compressive strength', () => {
    const standard = fibre('t700s')
    const high = fibre('m46j')

    expect(high.modulus / standard.modulus).toBeGreaterThan(1.8)
    expect(high.compositeCompressiveStrength60Vf).toBeLessThan(
      standard.compositeCompressiveStrength60Vf * 0.8,
    )
  })

  it('and less than half the strain to failure, which matters for a hand-built joint', () => {
    expect(fibre('m46j').strainToFailure).toBeLessThan(fibre('t700s').strainToFailure * 0.5)
  })

  it('and is denser, so it loses on every axis that governs', () => {
    expect(fibre('m46j').density).toBeGreaterThan(fibre('t700s').density)
  })
})

/**
 * The knockdown chain, decomposed. The folklore blanket factor is wrong in both
 * directions depending on which property you ask about.
 */
describe('the wet layup knockdown, decomposed rather than assumed', () => {
  it('fibre volume fraction is the dominant term', () => {
    const ratio = v(WET_LAYUP.fibreVolumeFraction) / v(WET_LAYUP.prepregFibreVolumeFraction)
    expect(ratio).toBeGreaterThan(0.75)
    expect(ratio).toBeLessThan(0.9)
  })

  it('skipping the vacuum bag costs another quarter, so the bag is not optional', () => {
    expect(v(WET_LAYUP.handLayupOnlyFibreVolumeFraction)).toBeLessThan(
      v(WET_LAYUP.fibreVolumeFraction) * 0.8,
    )
  })

  /**
   * A RETRACTED finding. Hand layup forces woven fabric, and an earlier
   * derivation appeared to show woven BEATING unidirectional in compression,
   * which would have made that forced choice an advantage. It was a
   * normalisation artifact. Woven is worse in tension and at best parity in
   * compression.
   */
  it('woven costs strength in tension and is at best PARITY in compression', () => {
    // An earlier version of this model claimed a 20 percent compression BONUS
    // from crimp. That was a normalisation artifact and it is retracted. The
    // test now pins the corrected values so the bonus cannot come back.
    expect(v(WOVEN_KNOCKDOWN.tension)).toBeLessThan(1)
    expect(v(WOVEN_KNOCKDOWN.compression)).toBeLessThanOrEqual(1)
    expect(v(WOVEN_KNOCKDOWN.compression)).toBeGreaterThan(0.85)
    expect(v(WOVEN_KNOCKDOWN.modulus)).toBeLessThan(1)
  })

  it('voids hit interlaminar shear hard and leave fibre properties alone', () => {
    // Which is why the cost of building by hand lands on the JOINTS. That is
    // actionable: spend the effort on joint area and bondline quality, not on
    // trying to make the members thinner.
    const ilssLoss = v(WET_LAYUP.ilssLossPerVoidFraction) * v(WET_LAYUP.voidContent)
    expect(ilssLoss).toBeGreaterThan(0.2)
    expect(ilssLoss).toBeLessThan(0.35)
  })
})
