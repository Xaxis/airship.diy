import { describe, expect, it } from 'vitest'
import { BASELINE, MINIMUM_VIABLE, STRETCH, DESIGN_POINTS } from '@airship/model'
import { energyBalance, maximumSustainableWind } from '../src/energy-balance.js'

/**
 * PHASE 2 GATE: does the loop close, and at what hull size and latitude?
 *
 * The answer, at every design point tried so far, is yes and by a wide margin,
 * and the margin is wide enough to be the finding rather than the reassurance.
 * Energy is not what limits this vehicle. Mass is, and phase 3 has to say so.
 */
describe('phase 2 gate: Regime A closes', () => {
  for (const design of [BASELINE, MINIMUM_VIABLE]) {
    it(`${design.name} closes the annual energy balance`, () => {
      const result = energyBalance(design)
      expect(result.closes).toBe(true)
      expect(result.worstDayMargin).toBeGreaterThan(0)
    })
  }

  /**
   * The stretch ship does NOT close as specified, and it is kept that way
   * deliberately rather than tuned until it passes.
   *
   * It fails on day 354 by 16 percent, with a comfortable 12.5 percent annual
   * surplus, which is precisely the trap a day-by-day balance exists to catch:
   * the annual average says yes and December says no.
   *
   * The cause is not hull size and not array area. It is the battery. On the
   * shortest day the 300 kWh pack saturates and 252 kWh of night demand spills
   * over into the hydrogen path at 32 percent round trip, so each of those
   * kilowatt hours costs 3.1 kWh of collection instead of 1.06. The overflow is
   * what eats the margin.
   */
  it('the stretch design does not close, and the battery is why', () => {
    const asSpecified = energyBalance(STRETCH)
    expect(asSpecified.closes).toBe(false)
    expect(asSpecified.annualMargin).toBeGreaterThan(0)
    expect(asSpecified.worstDayMargin).toBeLessThan(0)

    // The battery is saturated on the binding day.
    const worst = asSpecified.days[asSpecified.worstDay - 1]
    expect(worst?.batteryUse).toBeCloseTo(STRETCH.power.batteryEnergy, -6)
    expect(worst?.hydrogenUse).toBeGreaterThan(0)

    // Enlarging the pack fixes it. More array does not fix it nearly as
    // cheaply, which is the design lesson.
    const biggerBattery = energyBalance({
      ...STRETCH,
      power: { ...STRETCH.power, batteryEnergy: 700e3 * 3600 },
    })
    expect(biggerBattery.closes).toBe(true)
  })

  /**
   * Why the battery beats the hydrogen path for the diurnal cycle, stated as a
   * number rather than as an assertion. This is the single most load-bearing
   * fact in the power architecture.
   */
  it('a kilowatt hour through hydrogen costs about three times one through the battery', () => {
    const result = energyBalance(BASELINE)
    const viaBattery = 1 / 0.94
    const viaHydrogen = 1 / result.hydrogenRoundTrip
    expect(viaHydrogen / viaBattery).toBeGreaterThan(2.5)
    expect(viaHydrogen / viaBattery).toBeLessThan(3.5)
  })

  it('the binding day is in winter, not on the annual average', () => {
    // An annual average would hide a ship that banks a surplus in June and
    // runs a deficit in December. At 15 degrees north the worst day is in the
    // last month of the year, which is what a correct day-by-day balance must
    // find.
    const result = energyBalance(BASELINE)
    expect(result.worstDay).toBeGreaterThan(300)
    expect(result.worstDayMargin).toBeLessThan(result.annualMargin)
  })

  it('station keeping dominates demand, and it is cubic in wind speed', () => {
    const result = energyBalance(BASELINE)
    expect(result.propulsionEnergy).toBeGreaterThan(result.habitatEnergy)
    expect(result.propulsionEnergy).toBeGreaterThan(result.liftMakeupEnergy * 10)

    // The cube law, asserted directly. Doubling the wind must cost eight times
    // the power, and if it ever does not, the drag model has been broken.
    const slow = energyBalance({
      ...BASELINE,
      mission: { ...BASELINE.mission, stationKeepingWind: 5 },
    })
    const fast = energyBalance({
      ...BASELINE,
      mission: { ...BASELINE.mission, stationKeepingWind: 10 },
    })
    expect(fast.stationKeepingPower / slow.stationKeepingPower).toBeCloseTo(8, 1)
  })

  /**
   * The finding. Lift makeup, the thing that sounds like it should dominate a
   * hydrogen airship's energy budget, is under 2 percent of it.
   */
  it('lift makeup is a rounding error next to station keeping', () => {
    const result = energyBalance(BASELINE)
    const total = result.propulsionEnergy + result.habitatEnergy + result.liftMakeupEnergy
    expect(result.liftMakeupEnergy / total).toBeLessThan(0.05)
  })

  it('the array pays for itself in lift terms', () => {
    // A panel that masses more than the lift it enables is a net loss, and on a
    // buoyant vehicle that trade is real in a way it never is on a roof.
    for (const design of DESIGN_POINTS) {
      const result = energyBalance(design)
      expect(result.arrayMass).toBeLessThan(result.grossLiftAvailable * 0.25)
    }
  })

  it('permeation lands in the 1 to 5 percent per year band', () => {
    for (const design of DESIGN_POINTS) {
      const result = energyBalance(design)
      expect(result.annualLeakFraction).toBeGreaterThan(0.005)
      expect(result.annualLeakFraction).toBeLessThan(0.05)
    }
  })

  it('the hydrogen round trip is about a third, not most of the way', () => {
    // If this ever reads high, somebody has quoted a stack efficiency where a
    // system efficiency belongs, and the loop will appear to close far too
    // easily.
    const result = energyBalance(BASELINE)
    expect(result.hydrogenRoundTrip).toBeGreaterThan(0.25)
    expect(result.hydrogenRoundTrip).toBeLessThan(0.4)
  })
})

describe('the wind that stops it', () => {
  it('finds a finite maximum sustainable wind for each design', () => {
    for (const design of [BASELINE, MINIMUM_VIABLE, STRETCH]) {
      const wind = maximumSustainableWind(design)
      expect(wind).toBeGreaterThan(5)
      expect(wind).toBeLessThan(40)
    }
  })

  it('the loop fails above the maximum and holds below it', () => {
    const limit = maximumSustainableWind(BASELINE)
    const below = energyBalance({
      ...BASELINE,
      mission: { ...BASELINE.mission, stationKeepingWind: limit * 0.95 },
    })
    const above = energyBalance({
      ...BASELINE,
      mission: { ...BASELINE.mission, stationKeepingWind: limit * 1.1 },
    })
    expect(below.closes).toBe(true)
    expect(above.closes).toBe(false)
  })

  it('drifting rather than holding station buys a great deal', () => {
    // The cheapest energy saving available, and the one Loon built an entire
    // navigation strategy out of.
    const holding = maximumSustainableWind({
      ...BASELINE,
      mission: { ...BASELINE.mission, stationKeepingDutyCycle: 1.0 },
    })
    const drifting = maximumSustainableWind({
      ...BASELINE,
      mission: { ...BASELINE.mission, stationKeepingDutyCycle: 0.5 },
    })
    expect(drifting).toBeGreaterThan(holding * 1.15)
  })
})

describe('cloud is not optional', () => {
  it('the clear-sky margin is materially larger than the real one', () => {
    // Publishing a clear-sky energy margin as though it were the real one would
    // be exactly the overclaim this repository exists to prevent.
    const clear = energyBalance({
      ...BASELINE,
      mission: { ...BASELINE.mission, clearSkyFraction: 1.0 },
    })
    const real = energyBalance(BASELINE)
    expect(clear.annualMargin).toBeGreaterThan(real.annualMargin * 1.3)
  })

  it('a sufficiently cloudy station breaks the loop', () => {
    const overcast = energyBalance({
      ...BASELINE,
      mission: { ...BASELINE.mission, clearSkyFraction: 0.1, stationKeepingWind: 12 },
    })
    expect(overcast.closes).toBe(false)
    expect(overcast.bindingConstraint).toContain('does NOT close')
  })
})
