import { describe, expect, it } from 'vitest'
import { SEA_STATE } from '@airship/data'
import { kg, m, m2, mps } from '@airship/units'
import { atmosphere } from '../src/atmosphere.js'
import { hullGeometry } from '../src/geometry/hull.js'
import {
  ballastToLandOnWater,
  ballastVolume,
  floatingState,
  rightingMoments,
  seaAnchorArea,
  windage,
} from '../src/marine/hydrostatics.js'

const hull = hullGeometry(m(90), 5)
const seaLevel = atmosphere(m(0))

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
 * The actual problem with marine operation. The vehicle is an enormous sail
 * with almost no keel.
 */
describe('windage is the binding constraint on water', () => {
  it('presents on the order of a thousand square metres of lateral area', () => {
    const w = windage(hull, seaLevel, mps(10), m2(20))
    expect(w.lateralArea).toBeGreaterThan(1000)
    expect(w.lateralArea).toBeLessThan(1400)
  })

  it('drifts at a large fraction of wind speed with nothing deployed', () => {
    // Air is 840 times less dense than seawater, which sounds decisive. It is
    // not: the area ratio runs the other way by two orders of magnitude.
    const w = windage(hull, seaLevel, mps(10), m2(20))
    expect(w.leewayRatio).toBeGreaterThan(0.1)
    expect(w.leewayRatio).toBeLessThan(0.6)
  })

  it('leeway ratio is independent of wind speed, so drift scales linearly', () => {
    // Both sides of the balance go as velocity squared, so the ratio cancels.
    // That means a 20 m/s wind drives twice the drift of a 10 m/s wind, not
    // four times, which is the one piece of good news in this section.
    const slow = windage(hull, seaLevel, mps(5), m2(20))
    const fast = windage(hull, seaLevel, mps(20), m2(20))
    expect(fast.leewayRatio).toBeCloseTo(slow.leewayRatio, 6)
    expect(fast.driftSpeed / slow.driftSpeed).toBeCloseTo(4, 3)
  })

  it('side force is large enough to matter structurally', () => {
    // At 15 m/s this is a substantial load into whatever the drogue rode is
    // attached to, and it acts at the bow.
    const w = windage(hull, seaLevel, mps(15), m2(20))
    expect(w.sideForce).toBeGreaterThan(50000)
  })

  /**
   * THE FINDING for marine operation, and it is a negative one.
   *
   * Holding position on the water is not achievable. Cutting drift to a
   * near-stationary 0.5 m/s in only a 10 m/s wind needs a canopy around 17 m
   * across, which is not an object two people deploy and recover from a
   * gondola. A sea anchor is still worth carrying, because it buys roughly a
   * factor of two on drift and, more importantly, it makes the vehicle
   * weathervane bow-on instead of lying beam-on. But the vehicle afloat is a
   * DRIFTING habitat, not a moored one.
   *
   * That is acceptable in open ocean and disqualifying near a lee shore, which
   * makes proximity to land the real constraint on where this vehicle may touch
   * down.
   */
  it('cannot be held stationary by any sea anchor of practical size', () => {
    const w = windage(hull, seaLevel, mps(10), m2(20))
    const nearStationary = seaAnchorArea(w.sideForce, mps(0.5))
    const canopyDiameter = Math.sqrt((4 * nearStationary) / Math.PI)

    expect(canopyDiameter).toBeGreaterThan(12)
  })

  it('a practical sea anchor roughly halves drift without stopping it', () => {
    // A 6 m parachute is about the largest a two-person crew can handle.
    const practicalDiameter = 6
    const practicalArea = (Math.PI * practicalDiameter ** 2) / 4

    const w = windage(hull, seaLevel, mps(10), m2(20))
    // Solve the same balance the anchor sizing inverts: V = sqrt(F / (0.5 rho A Cd)).
    const anchored = Math.sqrt(w.sideForce / (0.5 * 1025 * practicalArea * 1.4))

    expect(anchored).toBeLessThan(w.driftSpeed)
    expect(anchored).toBeGreaterThan(0.5)
    // Still a couple of knots of drift, which over a day is tens of miles.
    expect(anchored * 1.94384).toBeGreaterThan(1.5)
  })

  it('refuses a zero drift target, because an anchor slows drift and does not stop it', () => {
    const w = windage(hull, seaLevel, mps(10), m2(20))
    expect(() => seaAnchorArea(w.sideForce, mps(0))).toThrow(RangeError)
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
