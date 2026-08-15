import { describe, expect, it } from 'vitest'
import { SEA_STATE } from '@airship/data'
import { kg, m } from '@airship/units'
import { hullGeometry } from '../src/geometry/hull.js'
import {
  ballastToLandOnWater,
  ballastVolume,
  floatingState,
  rightingMoments,
} from '../src/marine/hydrostatics.js'

const hull = hullGeometry(m(90), 5)

// A trimmed baseline ship: 15,800 m3 of hydrogen lifts about 18 t, and the
// vehicle is flown a few hundred kilograms heavy, which is the safe direction.
const GROSS_LIFT = kg(18015)
const TOTAL_WEIGHT = kg(18315)

describe('floating: the load on the water is the static heaviness', () => {
  it('a ship 300 kg heavy rests 300 kg on the water', () => {
    // The connection back to the buoyancy module. The envelope does not stop
    // lifting when the hull touches the sea.
    const state = floatingState(TOTAL_WEIGHT, GROSS_LIFT)
    expect(state.waterborneLoad).toBeCloseTo(300, 6)
    expect(state.afloat).toBe(true)
  })

  it('displacement is trivial next to the envelope volume', () => {
    const state = floatingState(TOTAL_WEIGHT, GROSS_LIFT)
    expect(state.displacement).toBeLessThan(0.5)
    expect(state.displacement / hull.volume).toBeLessThan(1e-4)
  })

  it('even a badly out-of-trim ship displaces almost nothing', () => {
    const state = floatingState(kg(20015), GROSS_LIFT)
    expect(state.displacement).toBeLessThan(3)
  })

  it('carries under two percent of its weight on the water', () => {
    const state = floatingState(TOTAL_WEIGHT, GROSS_LIFT)
    expect(state.waterborneFraction).toBeLessThan(0.02)
  })

  it('a light ship does not float, it rises', () => {
    // Arriving on the water is a ballast operation before it is a piloting one.
    const state = floatingState(kg(17800), GROSS_LIFT)
    expect(state.afloat).toBe(false)
    expect(state.displacement).toBe(0)
  })

  it('sits deeper in fresh water than in salt', () => {
    const salt = floatingState(TOTAL_WEIGHT, GROSS_LIFT, true)
    const fresh = floatingState(TOTAL_WEIGHT, GROSS_LIFT, false)
    expect(fresh.displacement).toBeGreaterThan(salt.displacement)
    expect(fresh.displacement / salt.displacement).toBeCloseTo(1025 / 998.2, 3)
  })
})

/**
 * The genuinely surprising result. A boat this lightly loaded would be
 * desperately tender. This vehicle is not, because the envelope is a pendulum
 * and its righting couple scales with GROSS LIFT rather than with displacement.
 */
describe('stability afloat comes from the envelope, not the waterplane', () => {
  const state = floatingState(TOTAL_WEIGHT, GROSS_LIFT)

  it('the pendulum term dominates the metacentric term by orders of magnitude', () => {
    const moments = rightingMoments(
      GROSS_LIFT,
      m(20),
      m(8),
      state.waterborneLoad,
      m(1.5),
    )
    expect(moments.pendulumDominance).toBeGreaterThan(50)
  })

  it('so the usual metacentric criterion does not govern', () => {
    // Halving GM barely moves total roll stiffness, which would be untrue of
    // any real boat and is the clearest statement of how different this case is.
    const good = rightingMoments(GROSS_LIFT, m(20), m(8), state.waterborneLoad, m(1.5))
    const poor = rightingMoments(GROSS_LIFT, m(20), m(8), state.waterborneLoad, m(0.75))
    expect(poor.total / good.total).toBeGreaterThan(0.98)
  })

  it('refuses an inverted pendulum rather than reporting a small positive stiffness', () => {
    expect(() => rightingMoments(GROSS_LIFT, m(8), m(20), state.waterborneLoad, m(1.5))).toThrow(
      RangeError,
    )
  })
})

/**
 * The operational point that makes water landing more than a party trick.
 */
describe('the ocean is unlimited ballast and unlimited feedstock', () => {
  it('computes the ballast needed to arrive at a target heaviness', () => {
    expect(ballastToLandOnWater(kg(100), kg(600))).toBeCloseTo(500, 9)
  })

  it('a tonne of ballast is a cubic metre of tank', () => {
    expect(ballastVolume(kg(1025))).toBeCloseTo(1, 6)
  })

  it('taking on ballast to sit safely costs a volume the ship can obviously hold', () => {
    const wanted = ballastToLandOnWater(kg(300), kg(2000))
    expect(ballastVolume(wanted)).toBeLessThan(2)
  })
})

describe('sea states', () => {
  it('are ordered by wave height', () => {
    for (let i = 1; i < SEA_STATE.length; i += 1) {
      const previous = SEA_STATE[i - 1]
      const here = SEA_STATE[i]
      expect(here?.significantWaveHeight).toBeGreaterThan(previous?.significantWaveHeight ?? 0)
    }
  })

  it('sea state 4 waves are a substantial fraction of the float depth', () => {
    // Which is the real reason there is an upper sea state for water operation,
    // and it is not about stability.
    const state4 = SEA_STATE.find((s) => s.code === 4)
    expect(state4?.significantWaveHeight).toBeGreaterThan(1.5)
  })
})
