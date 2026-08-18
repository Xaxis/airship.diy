import { describe, expect, it } from 'vitest'
import { BASELINE, DESIGN_POINTS,
  consumables,
  provisionsFor,
  BASELINE_ARRANGEMENT,
} from '@airship/model'
import { integrateMission } from '../src/mission.js'
import type { MissionStores } from '../src/mission.js'

const YEAR_OF_STORES: MissionStores = {
  food: 2 * 0.62 * 400,
  water: 3000,
  waterCapacity: 4000,
}

/**
 * PHASE 5: WHICH RESOURCE RUNS OUT FIRST?
 *
 * The brief hoped the answer would be surprising at least once. It is: the
 * physical limit is food, which is a loading decision rather than a discovery,
 * and the overall limit is a LEGAL interval rather than a physical one.
 */
describe('phase 5: which resource runs out first', () => {
  it('the physical limit is food, and food is a loading decision', () => {
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 2200)
    expect(result.physicalLimit).toBe('food')
    // 400 days of stores lasts 400 days. That is not a discovery, it is
    // arithmetic, and it is the point: nothing ELSE runs out first.
    expect(result.physicalEnduranceDays).toBeCloseTo(400, -1)
  })

  it('and the overall limit is legal rather than physical', () => {
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 2200)
    expect(result.limitingResource).toBe('condition inspection')
    expect(result.enduranceDays).toBeLessThan(result.physicalEnduranceDays)
    expect(result.explanation).toContain('LEGAL')
  })

  it('reports both limits separately, because they are different kinds of answer', () => {
    // Conflating them would hide which one is worth engineering against. The
    // legal one is answered with a letter to the FAA; the physical one with a
    // bigger pantry.
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 2200)
    expect(result.physicalLimit).not.toBe(result.limitingResource)
  })

  it('loading more food moves the physical limit proportionally', () => {
    const double = integrateMission(
      BASELINE,
      { ...YEAR_OF_STORES, food: YEAR_OF_STORES.food * 2 },
      2200,
    )
    expect(double.physicalEnduranceDays).toBeCloseTo(800, -1)
  })
})

/**
 * THE FINDING. Water was expected to be the master ledger and a binding
 * constraint. It is the master ledger and it does not bind at all.
 */
describe('water does not bind, and that reframes the design', () => {
  it('rain catchment exceeds net loss by two orders of magnitude', () => {
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 400)
    expect(result.waterBalance.catchmentMargin).toBeGreaterThan(50)
  })

  it('so the tank fills and stays full', () => {
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 400)
    const late = result.states[365]
    expect(late?.water).toBeCloseTo(YEAR_OF_STORES.waterCapacity, -1)
  })

  it('water never appears as a limiting resource', () => {
    for (const design of DESIGN_POINTS) {
      const result = integrateMission(design, YEAR_OF_STORES, 2200)
      expect(result.resourceExhaustion['water']).toBeUndefined()
    }
  })

  it('and it still does not bind at the pessimistic end of every assumption', () => {
    // Even a fifth of the nominal catchment and a much larger hygiene
    // allowance leaves a surplus, which is why the conclusion is robust rather
    // than a knife edge.
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 400)
    const pessimisticCatchment = result.waterBalance.dailyCatchment / 5
    const pessimisticLoss = (result.waterBalance.dailyConsumption -
      result.waterBalance.dailyRecovered) * 2
    expect(pessimisticCatchment).toBeGreaterThan(pessimisticLoss)
  })

  /**
   * The corollary, and it is a mission-planning constraint rather than an
   * equipment one.
   */
  it('a smaller hull collects proportionally less, so station choice matters more', () => {
    const big = integrateMission(DESIGN_POINTS[2] ?? BASELINE, YEAR_OF_STORES, 400)
    const small = integrateMission(DESIGN_POINTS[1] ?? BASELINE, YEAR_OF_STORES, 400)
    expect(big.waterBalance.dailyCatchment).toBeGreaterThan(small.waterBalance.dailyCatchment)
  })
})

describe('gas purity over a long mission', () => {
  it('decays monotonically and never recovers', () => {
    // NOT because adding hydrogen leaves purity alone. Purity is a mole
    // fraction, so putting pure hydrogen back into a fixed contaminant load
    // DOES raise it: n_H2 / (n_H2 + n_air) increases with n_H2. This test used
    // to say otherwise, and it passed because the makeup branch updated the
    // mole inventory and forgot the state variable derived from it.
    //
    // The real reason is that air leaks IN at the same time as hydrogen leaks
    // out, and the air does not leave. totalMoles grows every day whatever the
    // makeup does, so the makeup slows the decay and cannot reverse it.
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 800)
    for (let i = 1; i < result.states.length; i += 1) {
      expect(result.states[i]?.purity).toBeLessThanOrEqual(result.states[i - 1]?.purity ?? 1)
    }
  })

  it('holds above the purity floor for well over a year with a good film', () => {
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 2200)
    expect(result.resourceExhaustion['gas purity']).toBeUndefined()
  })

  it('but a commodity film degrades purity far faster', () => {
    const cheap = integrateMission(
      { ...BASELINE, hull: { ...BASELINE.hull, filmId: 'metallised-bopet-laminate' } },
      YEAR_OF_STORES,
      2200,
    )
    const good = integrateMission(BASELINE, YEAR_OF_STORES, 2200)
    const cheapPurity = cheap.states[cheap.states.length - 1]?.purity ?? 1
    const goodPurity = good.states[good.states.length - 1]?.purity ?? 1
    expect(cheapPurity).toBeLessThan(goodPurity)
  })
})

/**
 * Food shelf life, which binds the stretch mission rather than food MASS.
 */
describe('the five-year mission is a shelf-life problem, not a storage one', () => {
  it('is not reported from beyond the horizon the model integrated to', () => {
    // The shelf life is fifteen years, which is 5,479 days. Ask for 2,200 and
    // the integrator must NOT answer with a number it never reached: it used to
    // write this record unconditionally after the loop, so `enduranceDays`
    // could exceed its own horizon by more than an order of magnitude.
    const short = integrateMission(BASELINE, YEAR_OF_STORES, 2200)
    expect(short.resourceExhaustion['food shelf life']).toBeUndefined()
    expect(short.enduranceDays).toBeLessThanOrEqual(2200)
  })

  it('appears once the horizon is long enough to contain it', () => {
    const long = integrateMission(BASELINE, YEAR_OF_STORES, 6000)
    const shelfLife = long.resourceExhaustion['food shelf life'] ?? 0
    expect(shelfLife).toBeGreaterThan(365 * 4)
    expect(shelfLife).toBeLessThanOrEqual(6000)
  })

  it('and no amount of tank volume fixes it', () => {
    // Loading ten years of food does not extend the mission past the point the
    // food stops being nutritionally adequate.
    const huge = integrateMission(
      BASELINE,
      { ...YEAR_OF_STORES, food: YEAR_OF_STORES.food * 10 },
      6000,
    )
    expect(huge.resourceExhaustion['food shelf life']).toBeDefined()
  })
})

describe('integrator hygiene', () => {
  it('records a state for every day of the horizon', () => {
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 500)
    expect(result.states).toHaveLength(500)
    expect(result.states[0]?.day).toBe(1)
    expect(result.states[499]?.day).toBe(500)
  })

  it('food falls linearly with crew size', () => {
    const result = integrateMission(BASELINE, YEAR_OF_STORES, 100)
    const first = result.states[0]?.food ?? 0
    const hundredth = result.states[99]?.food ?? 0
    expect(first - hundredth).toBeCloseTo(2 * 0.62 * 99, 1)
  })
})

describe('component life, which used to bound nothing', () => {
  /**
   * @airship/data carries a fully sourced maintenance schedule: oil at 100
   * hours or 12 months, coolant at five years, hoses at four, and an annual
   * consumables mass. Every one of those was read by nothing, so the only
   * thing that ever ran out on this vehicle was food.
   */
  it('runs the engine out of consumables before the food, as drawn', () => {
    const drawn = consumables(BASELINE_ARRANGEMENT)
    const result = integrateMission(BASELINE, drawn, 8000)
    const spares = result.resourceExhaustion['engine consumables']
    expect(spares).toBeDefined()
    // 356 kg aboard against 220 kg a year is under two years.
    expect(spares).toBeLessThan(700)
  })

  it('makes both run out on the same day once the spare lift is split properly', () => {
    // Loading the spare lift entirely as food stops at 592 days on consumables
    // with tonnes of uneaten food aboard. Splitting it buys three times as long
    // from exactly the same lift.
    const balanced = provisionsFor(BASELINE, BASELINE_ARRANGEMENT)
    const result = integrateMission(BASELINE, balanced, 8000)
    const food = result.resourceExhaustion['food'] ?? 0
    const spares = result.resourceExhaustion['engine consumables'] ?? 0
    expect(Math.abs(food - spares)).toBeLessThanOrEqual(2)
    expect(result.physicalEnduranceDays).toBeGreaterThan(1500)
  })

  it('does not call an unprovisioned ship immortal', () => {
    // A design carrying no consumables is unprovisioned, not unlimited.
    const none = { ...consumables(BASELINE_ARRANGEMENT), spares: 0 }
    const result = integrateMission(BASELINE, none, 8000)
    expect(result.resourceExhaustion['engine consumables']).toBeUndefined()
  })
})
