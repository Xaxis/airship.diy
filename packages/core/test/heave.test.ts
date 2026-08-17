import { describe, expect, it } from 'vitest'

import {
  emergence,
  heaveResponse,
  quasiStaticSuspensionLoad,
  resonantWaveHeight,
} from '../src/index.js'
import { kg } from '@airship/units'

/**
 * What the sea actually does to a vehicle that floats on millimetres.
 *
 * Every intuition here comes from boats and seaplanes, and every one of them is
 * about a hull that carries its own weight. This one carries six hundred
 * kilograms of a twenty-six tonne vehicle, and almost everything follows from
 * that single fact.
 */

/** @derived Gondola, contents and the water's added mass on the immersed hull, kg. */
const GONDOLA = kg(4000)
/** @derived Waterplane area of the gondola hulls, m2. */
const WATERPLANE = 24
/** @derived Static heaviness the vehicle rests at, kg. */
const TRIM = kg(600)
/** @derived A stiff suspension, N/m. */
const STIFF = 1e6

describe('the frequency ratio, which is easy to write upside down', () => {
  it('puts a light gondola well below resonance in any real sea', () => {
    // A light mass on a stiff waterplane has a heave period near a second; a
    // sea state 4 wave has a period near six. The forcing is five times slower
    // than the system can respond, so the gondola rides.
    const r = heaveResponse(4, GONDOLA, STIFF, WATERPLANE)
    expect(r.naturalPeriod).toBeLessThan(2)
    expect(r.wavePeriod).toBeGreaterThan(4)
    expect(r.frequencyRatio).toBeLessThan(0.4)
    expect(r.regime).toBe('follows the sea')
  })

  it('moves only a few percent of the wave amplitude', () => {
    const r = heaveResponse(4, GONDOLA, STIFF, WATERPLANE)
    expect(r.followingFraction).toBeLessThan(0.1)
  })
})

describe('the suspension load', () => {
  it('is the gondola mass times the wave acceleration, and nothing else', () => {
    // The full response reduces to the quasi-static limit to three figures,
    // which is the check that the dynamics are being done rather than guessed.
    const full = heaveResponse(4, GONDOLA, STIFF, WATERPLANE).suspensionLoad
    const limit = quasiStaticSuspensionLoad(GONDOLA, 1.88)
    expect(full / limit).toBeGreaterThan(0.95)
    expect(full / limit).toBeLessThan(1.05)
  })

  it('barely moves when the suspension stiffness moves two hundredfold', () => {
    // The relative motion falls as the stiffness rises and the two cancel. What
    // it means for the design is that the cables are sized by flight loads and
    // by handling, not by the sea.
    const soft = heaveResponse(4, GONDOLA, 5e4, WATERPLANE).suspensionLoad
    const rigid = heaveResponse(4, GONDOLA, Infinity, WATERPLANE).suspensionLoad
    expect(rigid / soft).toBeLessThan(2)
  })

  it('does not grow with the sea state at all', () => {
    // A fully developed sea has a modal period going as the square root of the
    // height, so the wave ACCELERATION is nearly constant across sea states.
    // Sea state 6 loads the suspension no harder than sea state 2, and the
    // vehicle's seakeeping limit is therefore not a wave height.
    const loads = [0.3, 0.88, 1.88, 3.25, 5.0].map((hs) =>
      quasiStaticSuspensionLoad(GONDOLA, hs),
    )
    const smallest = Math.min(...loads)
    const largest = Math.max(...loads)
    expect(largest / smallest).toBeLessThan(1.01)
  })
})

describe('resonance, which inverts the usual isolation intuition', () => {
  it('is pushed UP into a real chop by softening the suspension', () => {
    // Vibration isolation says soften the mount to get below the forcing. Here
    // every useful forcing frequency is BELOW the natural one, so softening
    // drags the resonance up into the sea states the vehicle will meet.
    const soft = resonantWaveHeight(GONDOLA, 5e4, WATERPLANE)
    const stiff = resonantWaveHeight(GONDOLA, Infinity, WATERPLANE)
    expect(soft).toBeGreaterThan(stiff)
    expect(soft).toBeGreaterThan(0.2)
    expect(stiff).toBeLessThan(0.06)
  })

  it('sits on a ripple with a stiff suspension, where the amplitude is nothing', () => {
    const hs = resonantWaveHeight(GONDOLA, STIFF, WATERPLANE)
    expect(hs).toBeLessThan(0.1)
  })
})

describe('emergence, which is the real load case', () => {
  it('lifts the float clear in every sea, because it floats on millimetres', () => {
    for (const seaState of [2, 3, 4, 5, 6]) {
      const e = emergence(seaState, TRIM, GONDOLA, STIFF, WATERPLANE)
      expect(`${seaState}: ${e.emerges}`).toBe(`${seaState}: true`)
      expect(e.draught).toBeLessThan(0.05)
    }
  })

  it('sets it down again at a speed you could not feel', () => {
    // A seaplane arrives at several metres per second and that is why it slams.
    // This arrives at millimetres per second, and the impact pressure is the
    // square of that.
    for (const seaState of [2, 3, 4, 5, 6]) {
      const e = emergence(seaState, TRIM, GONDOLA, STIFF, WATERPLANE)
      expect(`${seaState}: ${e.reentryVelocity < 0.05}`).toBe(`${seaState}: true`)
      expect(`${seaState}: ${e.impactPressure < 100}`).toBe(`${seaState}: true`)
    }
  })

  it('stays immersed if the vehicle is landed heavy enough', () => {
    // Which is the other half of the trade: a heavier trim buys immersion and
    // costs everything the gear and the propulsors have to carry.
    const heavy = emergence(4, kg(20000), GONDOLA, STIFF, WATERPLANE)
    expect(heavy.emerges).toBe(false)
  })
})
