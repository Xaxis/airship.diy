import { describe, expect, it } from 'vitest'

import { alightingGear } from '../src/index.js'
import { kg } from '@airship/units'

/**
 * What a buoyant vehicle's landing gear actually carries.
 *
 * THIS MODULE HAD NO TESTS AT ALL until an adversarial pass went looking, which
 * is why it was shipping a gear mass that double-counted its own dynamic
 * factor, an `asFractionOfGross` of Infinity, and a note reading "the 0 kg the
 * vehicle weighs". The repo's rule is that unit tests catch regressions and
 * validation catches being wrong; this had neither.
 */

/** @derived Gross lift of the baseline at sea level, kg. */
const DISPLACEMENT = kg(32124)
/** @derived The landing trim, kg. */
const TRIM = 600
/** @derived Lift excursion from 20 K of diurnal superheat, kg. */
const SWING = 2307
/** @derived Water the vehicle can put over the side to hold trim, kg. */
const DUMPABLE = 2500

describe('what the gear is sized by', () => {
  it('is the static heaviness, not the weight', () => {
    // The whole point. A floatplane's floats carry the aeroplane; these carry
    // the residual heaviness, which is a couple of percent of it.
    const gear = alightingGear(DISPLACEMENT, TRIM, SWING, true, DUMPABLE)
    expect(gear.totalMass).toBeLessThan(gear.seaplaneBasisMass / 10)
    expect(gear.asFractionOfGross).toBeLessThan(0.01)
    expect(Number.isFinite(gear.asFractionOfGross)).toBe(true)
  })

  it('does not charge the dynamic factor twice', () => {
    // The 3 to 6 percent aircraft statistic is normalised on STATIC maximum
    // landing weight, and certified gear already reacts 2 to 3 g at that
    // weight. Multiplying the static load by a dynamic factor before applying
    // the fraction counts the same allowance twice: run the old method on the
    // aircraft the constant came from and it returns 21 percent of landing
    // weight against the 3 to 6 it was derived from.
    //
    // Only the EXCESS over the embedded factor is charged, so the ground gear
    // is 1.4 times the water gear's structure and not 3.5 times.
    const afloat = alightingGear(DISPLACEMENT, TRIM, SWING, false, DUMPABLE)
    const ashore = alightingGear(DISPLACEMENT, TRIM, SWING, true, DUMPABLE)
    const structureRatio = ashore.waterMass / afloat.waterMass
    expect(structureRatio).toBeGreaterThan(1.3)
    expect(structureRatio).toBeLessThan(1.5)
  })
})

describe('the superheat swing, which was being paid for twice', () => {
  it('is the gear load only where the ballast cannot shed it', () => {
    // The arrangement carries a seawater bladder sized for the whole excursion
    // and the superheat gate passes on it. This function then charged the gear
    // for the same excursion as though the loop did not exist, so both gates
    // went green on one 2.3 tonnes.
    const withBallast = alightingGear(DISPLACEMENT, TRIM, SWING, true, DUMPABLE)
    const without = alightingGear(DISPLACEMENT, TRIM, SWING, true, 0)

    expect(withBallast.superheatShare).toBe(0)
    expect(without.superheatShare).toBeGreaterThan(0.7)
    expect(without.totalMass).toBeGreaterThan(withBallast.totalMass * 4)
  })

  it('leaves a real coupling between the gear and the ballast system', () => {
    // Which is the honest consequence of crediting it: a gear sized for the
    // trim and a ballast system that fails overnight leaves more than two
    // tonnes on a structure built for six hundred kilograms.
    const sized = alightingGear(DISPLACEMENT, TRIM, SWING, true, DUMPABLE)
    const failed = alightingGear(DISPLACEMENT, TRIM, SWING, true, 0)
    expect(failed.designLoad / sized.designLoad).toBeGreaterThan(4)
  })

  it('covers a partial ballast inventory partially', () => {
    const half = alightingGear(DISPLACEMENT, TRIM, SWING, true, SWING / 2)
    expect(half.designLoad).toBeGreaterThan(
      alightingGear(DISPLACEMENT, TRIM, SWING, true, DUMPABLE).designLoad,
    )
    expect(half.designLoad).toBeLessThan(
      alightingGear(DISPLACEMENT, TRIM, SWING, true, 0).designLoad,
    )
  })
})

describe('landing on ground as well as water', () => {
  it('costs wheels, legs and brakes on top of the water structure', () => {
    const afloat = alightingGear(DISPLACEMENT, TRIM, SWING, false, DUMPABLE)
    const ashore = alightingGear(DISPLACEMENT, TRIM, SWING, true, DUMPABLE)
    expect(afloat.landMass).toBe(0)
    expect(ashore.landMass).toBeGreaterThan(0)
    expect(ashore.totalMass).toBeGreaterThan(afloat.totalMass)
  })
})
