import { describe, expect, it } from 'vitest'
import {
  BLEND_COMPONENTS,
  FUEL_OPTIONS,
  WATER_PER_HYDROGEN_BURNED,
  airDensityBlend,
  energyPerLiftGivenUp,
  engineDutyCycleLimit,
  heavinessPerKilogramOfCellHydrogenBurned,
  rankedByLiftCost,
} from '../src/power/fuel-decision.js'

const option = (id: string) => {
  const found = FUEL_OPTIONS.find((f) => f.id === id)
  if (!found) throw new Error(`No fuel option ${id}`)
  return found
}

/**
 * THE PHASE 4B RESULT, and it inverts the brief's prior.
 *
 * The brief expects hydrogen to win on architecture and lose on reserve
 * density. It loses on both, and the reason is that energy per unit MASS is the
 * wrong metric for an airship. The scarce resource is LIFT.
 */
describe('the fuel decision is settled by lift cost, not energy density', () => {
  it('hydrogen has by far the best specific energy and by far the worst lift cost', () => {
    const h2 = option('hydrogen-700bar')
    const jetA = option('jet-a')

    // Nearly three times the energy per kilogram.
    expect(h2.specificEnergy / jetA.specificEnergy).toBeGreaterThan(2.7)
    // And nineteen times the lift cost.
    expect(h2.liftCostPerKilogram / jetA.liftCostPerKilogram).toBeGreaterThan(15)
  })

  it('an air-density gas blend wins, by five to eight times and not by a thousand', () => {
    // The margin matters. An earlier version used the TRIM EXCURSION as the
    // lift cost, which made a buoyancy-neutral gas look free to carry and put
    // it a thousand times ahead. It is neutral on CONSUMPTION and costs 0.93 kg
    // of lift per kilogram carried, because the cell it occupies could have
    // held hydrogen.
    const ranked = rankedByLiftCost()

    // AN air-density gas wins, not one specific one. Blaugas and the modern
    // blend are within a third of a percent of each other, and which of them
    // comes first is decided by Blaugas being very slightly LIGHTER than air.
    // Pinning the id made this test assert a tie-break rather than the result,
    // and it flipped when the lift cost was corrected to difference against the
    // FUEL's density rather than against air's.
    const top = ranked[0]?.option.id ?? ''
    expect(['air-density-blend', 'historical-blaugas']).toContain(top)
    expect((ranked[1]?.energyPerLift ?? 0) / (ranked[0]?.energyPerLift ?? 1)).toBeGreaterThan(0.95)

    const best = ranked[0]?.energyPerLift ?? 0
    const worst = ranked[ranked.length - 1]?.energyPerLift ?? 1
    expect(best / worst).toBeGreaterThan(5)
    expect(best / worst).toBeLessThan(12)
  })

  it('holds the five energy-per-lift figures against regression', () => {
    // NOT an independent check, whatever it used to say. These five numbers
    // were produced by this module and pinned, so comparing the module against
    // them tests that it has not changed, not that it is right. Blaugas at 49.6
    // was the value the OLD lift-cost formula gave, differencing against air's
    // density instead of the fuel's, and when that was corrected this test
    // reported the correction as a failure.
    //
    // A genuinely independent check needs published energy-per-lift figures for
    // airship fuels, and none exist: the comparison is the point of this module.
    const expected: Record<string, number> = {
      'air-density-blend': 50.0,
      'historical-blaugas': 51.7,
      'jet-a': 40.6,
      'hydrogen-cell': 9.0,
      'hydrogen-700bar': 6.2,
    }
    for (const { option, energyPerLift } of rankedByLiftCost()) {
      const target = expected[option.id] ?? 0
      expect(Math.abs(energyPerLift / 1e6 / target - 1)).toBeLessThan(0.03)
    }
  })

  it('separates the cost of CARRYING a fuel from the trim excursion on burning it', () => {
    // Two different questions. A buoyancy-neutral gas has zero trim excursion
    // and a lift cost near unity; conflating them is what caused the error.
    const blend = option('air-density-blend')
    expect(blend.trimExcursionPerKilogram).toBeCloseTo(0, 6)
    expect(blend.liftCostPerKilogram).toBeGreaterThan(0.9)
    expect(blend.liftCostPerKilogram).toBeLessThan(1.0)
  })

  it('and hydrogen finishes last on the metric that governs', () => {
    const ranked = rankedByLiftCost()
    const last = ranked[ranked.length - 1]
    expect(last?.option.id).toBe('hydrogen-700bar')
  })

  it('Jet-A beats hydrogen on lift cost despite a third of the specific energy', () => {
    expect(energyPerLiftGivenUp(option('jet-a'))).toBeGreaterThan(
      energyPerLiftGivenUp(option('hydrogen-700bar')) * 5,
    )
  })
})

/**
 * THE ELEGANT ARCHITECTURE THAT DOES NOT WORK.
 */
describe('you cannot burn the lifting gas', () => {
  it('burning cell hydrogen makes the ship heavy far faster than it makes water', () => {
    // Removing 1 kg of hydrogen from a cell loses about 13.4 kg of gross lift,
    // so the ship goes 12.4 kg heavy. Combustion returns only 8.94 kg of water.
    const heaviness = heavinessPerKilogramOfCellHydrogenBurned(1.225, 0.0852)
    expect(heaviness).toBeGreaterThan(13)
    expect(heaviness).toBeLessThan(14)
    expect(WATER_PER_HYDROGEN_BURNED).toBeLessThan(heaviness)
  })

  it('so no water recovery fraction can hold trim, and recovering makes it worse', () => {
    // The counterintuitive part. Condensing the product water ADDS mass to a
    // ship that is already going heavy, so full recovery leaves it 21.3 kg heavy
    // rather than 12.4.
    const heaviness = heavinessPerKilogramOfCellHydrogenBurned(1.225, 0.0852)
    const netWithFullRecovery = heaviness - 1 + WATER_PER_HYDROGEN_BURNED
    const netWithNoRecovery = heaviness - 1
    expect(netWithFullRecovery).toBeGreaterThan(netWithNoRecovery)
    expect(option('hydrogen-cell').waterRecoveryForNeutrality).toBe(Infinity)
  })

  it('whereas stored hydrogen needs only 11 percent recovery, which is easy', () => {
    // The distinction that matters: hydrogen from a TANK costs its own mass
    // only, so ballast compensation is nearly free. Hydrogen from a CELL costs
    // the lift the volume was generating.
    const stored = option('hydrogen-700bar')
    expect(stored.waterRecoveryForNeutrality).toBeLessThan(0.15)
    expect(stored.condenserOutletTemperature).toBeGreaterThan(310)
  })

  it('while Jet-A needs 81 percent recovery at an exhaust temperature few climates allow', () => {
    // And recovery falls exactly when it is needed most: hot, humid and low.
    const jetA = option('jet-a')
    expect(jetA.waterRecoveryForNeutrality).toBeGreaterThan(0.8)
    expect(jetA.condenserOutletTemperature).toBeLessThan(290)
  })
})

/**
 * The historical claim everybody repeats, and it is wrong.
 */
describe('Blaugas was not the same density as air', () => {
  it('it was 3.6 percent lighter, so burning it did change buoyancy', () => {
    const blau = option('historical-blaugas')
    expect(blau.trimExcursionPerKilogram).toBeGreaterThan(0.02)
    expect(blau.trimExcursionPerKilogram).toBeLessThan(0.06)
  })

  it('but 25 times better than a liquid fuel, and in the safe direction', () => {
    // A liquid loses a full kilogram of weight per kilogram burned, making the
    // ship LIGHT. Blaugas makes it slightly HEAVY, which is the safe direction.
    const blau = option('historical-blaugas')
    const jetA = option('jet-a')
    expect(Math.abs(jetA.trimExcursionPerKilogram / blau.trimExcursionPerKilogram)).toBeGreaterThan(20)
    expect(blau.trimExcursionPerKilogram).toBeGreaterThan(0)
    expect(jetA.trimExcursionPerKilogram).toBeLessThan(0)
  })

  it('a modern blend can hit air density exactly, which the original did not', () => {
    const blend = airDensityBlend(BLEND_COMPONENTS.propane, BLEND_COMPONENTS.methane)
    expect(blend.heavyMoleFraction).toBeCloseTo(0.461, 2)
    expect(blend.lightMoleFraction).toBeCloseTo(0.539, 2)
    expect(blend.heavyMoleFraction + blend.lightMoleFraction).toBeCloseTo(1, 9)
  })

  it('and both components are commodity fuels obtainable anywhere', () => {
    expect(BLEND_COMPONENTS.propane).toBeGreaterThan(BLEND_COMPONENTS.methane)
  })

  it('refuses a blend whose components sit on the same side of air density', () => {
    // Two gases both lighter than air cannot average to air density, and
    // returning a fraction outside 0 to 1 would let a caller carry on.
    expect(() => airDensityBlend(BLEND_COMPONENTS.methane, BLEND_COMPONENTS.hydrogen)).toThrow(
      RangeError,
    )
  })
})

/**
 * THE CONSUMABLES TRAP INVERTS.
 */
describe('the engine is a power source, not an energy source', () => {
  it('the fuel runs out an order of magnitude before the engine wears out', () => {
    // 2,000 kg of Jet-A at the Austro AE300's best brake thermal efficiency.
    //
    // The hours depend on the power SETTING, which is exactly the point of a
    // series chain: the engine drives a generator and can sit wherever it likes
    // on its map. At full rated power the fuel lasts 78 hours; at the roughly
    // 60 percent continuous setting a generator would actually use, about 130.
    // Either way it is nowhere near the 1,800 hour overhaul interval.
    const atRated = engineDutyCycleLimit(2000, 42.8e6, 0.406, 123500, 6.48e6)
    const atContinuous = engineDutyCycleLimit(2000, 42.8e6, 0.406, 73000, 6.48e6)

    expect(atRated.fuelLimitedHours).toBeGreaterThan(70)
    expect(atRated.fuelLimitedHours).toBeLessThan(90)
    expect(atContinuous.fuelLimitedHours).toBeGreaterThan(120)
    expect(atContinuous.fuelLimitedHours).toBeLessThan(150)

    expect(atRated.fuelRunsOutFirstBy).toBeGreaterThan(10)
    expect(atContinuous.fuelRunsOutFirstBy).toBeGreaterThan(10)
  })

  it('which puts the achievable duty cycle near one percent, not twenty five', () => {
    // The brief expects the consumables trap to bind at 25 percent duty. The
    // fuel budget cannot reach two.
    const limit = engineDutyCycleLimit(2000, 42.8e6, 0.406, 73000, 6.48e6)
    /** Hours in a year. */
    const yearHours = 8766
    expect(limit.fuelLimitedHours / yearHours).toBeLessThan(0.03)
  })

  it('more fuel buys proportionally more hours, so the trade is linear and obvious', () => {
    const small = engineDutyCycleLimit(1000, 42.8e6, 0.406, 123500, 6.48e6)
    const large = engineDutyCycleLimit(4000, 42.8e6, 0.406, 123500, 6.48e6)
    expect(large.fuelLimitedHours / small.fuelLimitedHours).toBeCloseTo(4, 6)
  })

  it('running at part power stretches the hours, which is what a series chain allows', () => {
    // The engine drives a generator, not a propeller, so it can run at its best
    // point at whatever fraction of rated power the bus needs.
    const full = engineDutyCycleLimit(2000, 42.8e6, 0.406, 123500, 6.48e6)
    const half = engineDutyCycleLimit(2000, 42.8e6, 0.406, 61750, 6.48e6)
    expect(half.fuelLimitedHours).toBeCloseTo(full.fuelLimitedHours * 2, 6)
  })
})
