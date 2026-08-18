import { CATCHMENT, CREW, FOOD_SHELF_LIFE, barrierFilm, v } from '@airship/data'
import type { DesignPoint } from '@airship/model'
import {
  atmosphere,
  cellFilmArea,
  electrolyzer,
  hullGeometry,
  hullShapeForPrismatic,
  permeationRates,
  updatedPurity,
  WATER_PER_HYDROGEN_ELECTROLYSED,
} from '@airship/core'
import { J, m, purity as asPurity, SI } from '@airship/units'
import { energyBalance } from './energy-balance.js'

/**
 * The mission integrator, in slow time.
 *
 * Steps a day at a time through a multi-year mission, tracking every state that
 * changes slowly: gas mass and purity, water inventory, food, energy, and the
 * consumables that cannot be replaced. It answers the question the brief cares
 * about most, and the one the energy balance cannot:
 *
 *   WHICH RESOURCE RUNS OUT FIRST?
 *
 * The energy balance already said energy does not. What is left is a race
 * between food, water, gas purity, and component life, and the brief hopes the
 * answer will be surprising at least once.
 *
 * WHY WATER IS THE MASTER LEDGER. It is the only resource that appears on every
 * side of the vehicle at once. It is drinking supply, it is ballast, it is
 * electrolyzer feedstock for lift makeup, and it is the product of every
 * conversion path. Tracking it separately from energy would let the model spend
 * the same kilogram twice, which is exactly the error that makes closed-loop
 * schemes look feasible on paper.
 *
 * AND HAVING BUILT THE LEDGER, THE ANSWER IS THAT WATER DOES NOT BIND. The
 * hull's plan area is the catchment, and it is enormous because the hull is:
 * plan area goes as length squared over the fineness ratio while the crew's
 * demand does not scale at all. In a trade wind belt at a metre of annual
 * rainfall, even a poor collection efficiency gathers well over a tonne a day
 * against a net loss of single-figure kilograms for two people at 85 percent
 * recycling. Catchment exceeds net loss by more than a hundred times, and at
 * the most pessimistic end of every assumption it still exceeds it by more than
 * fifteen.
 *
 * The vehicle is water-RICH, not water-poor. Ballast is free, electrolyzer
 * feedstock is free, and the hygiene allowance that looked like the largest
 * lever in the life support budget turns out not to be a lever at all. The one
 * place it becomes a lever is a dry station: parked under a subtropical high
 * rather than in the trade winds, the catchment term collapses and the whole
 * analysis changes. Water is therefore a STATION-CHOICE question rather than an
 * equipment question.
 */

export interface MissionState {
  readonly day: number
  /** Lifting gas mass remaining, kg. */
  readonly gasMass: number
  /** Cell purity, which only ever falls. */
  readonly purity: number
  /** Water inventory, kg. */
  readonly water: number
  /** Dry food remaining, kg. */
  readonly food: number
  /** Gross lift at the current gas state, kg. */
  readonly grossLift: number
  /** Cumulative electrolysis energy spent on lift makeup, J. */
  readonly makeupEnergy: number
}

export type LimitingResource =
  | 'food'
  | 'water'
  | 'gas purity'
  | 'lifting gas'
  | 'food shelf life'
  | 'condition inspection'
  | 'none within horizon'

export interface MissionResult {
  readonly designPoint: string
  /** Days until the first resource is exhausted, legal limits included. */
  readonly enduranceDays: number
  readonly limitingResource: LimitingResource
  /**
   * Days until the first PHYSICAL resource is exhausted, ignoring legal
   * intervals. Reported separately because the two are different kinds of
   * answer and conflating them hides which one is worth engineering against.
   */
  readonly physicalEnduranceDays: number
  readonly physicalLimit: LimitingResource
  /** Why that resource bound first, in a sentence a person can act on. */
  readonly explanation: string
  readonly states: readonly MissionState[]
  /** Day each resource would run out on its own, for the comparison table. */
  readonly resourceExhaustion: Readonly<Record<string, number>>
  /** Water balance summary, because it turns out not to bind at all. */
  readonly waterBalance: {
    readonly dailyConsumption: number
    readonly dailyRecovered: number
    /** Plan area the hull presents to the rain, m2. */
    readonly planArea: number
    readonly dailyCatchment: number
    readonly dailyNet: number
    /** How many times over catchment covers the net loss. */
    readonly catchmentMargin: number
  }
}

export interface MissionStores {
  /** Dry food loaded, kg. */
  readonly food: number
  /** Water loaded, kg. */
  readonly water: number
  /** Water tank capacity, kg. Catchment above this is lost. */
  readonly waterCapacity: number
}

/**
 * Integrate a mission and report what ends it.
 *
 * @param horizonDays How far to look. Beyond about five years the component
 *   life terms dominate and the model has nothing useful to say.
 */
/**
 * Default horizon, days. About five and a half years, which is past the stretch
 * goal and past the point where unmodelled component life dominates.
 * @derived Search horizon, not a physical quantity.
 */
const DEFAULT_HORIZON_DAYS = 2000

export const integrateMission = (
  design: DesignPoint,
  stores: MissionStores,
  horizonDays = DEFAULT_HORIZON_DAYS,
): MissionResult => {
  const shape = hullShapeForPrismatic(design.hull.prismaticCoefficient)
  const hull = hullGeometry(m(design.hull.length), design.hull.finenessRatio, shape)
  const air = atmosphere(m(design.mission.altitude))

  const film = barrierFilm(design.hull.filmId)
  const filmArea = cellFilmArea(hull.wettedArea, hull.volume, hull.length, design.hull.cellCount)

  const energy = energyBalance(design)

  /**
   * Daily surplus electrical energy available for lift makeup, J.
   *
   * AGAINST `annualRequired`, NOT `annualDemand`. Demand is the raw load;
   * required is the collection that load actually costs once the storage
   * round trip is paid for, and on the hydrogen path that round trip is about
   * a third efficient. Spending the un-penalised figure on electrolysis
   * overstates the surplus by the whole storage loss, in the direction that
   * flatters the design, and then spends the overstatement on making lifting
   * gas: the one place an energy error turns directly into buoyancy.
   */
  const dailySurplus = Math.max(
    (energy.annualGenerated - energy.annualRequired) / SI.DAYS_PER_YEAR,
    0,
  )

  // --- water flows, all in kg/day -------------------------------------------
  const crew = design.loads.crew
  const dailyConsumption =
    crew * (v(CREW.potableWater) + v(CREW.hygieneWater))
  const recovered = dailyConsumption * v(CREW.waterRecoveryFraction)

  /**
   * Rain catchment. The hull's plan area is the catchment, and this is the
   * largest and least appreciated water source on the vehicle.
   * @derived plan area times annual rainfall times collection efficiency,
   * spread over the year.
   */
  const planArea = 0.72 * hull.length * hull.maxDiameter
  const dailyCatchment =
    (planArea * v(CATCHMENT.tradeWindBeltAnnualRainfall) * v(CATCHMENT.collectionEfficiency) * 1000) /
    SI.DAYS_PER_YEAR

  const dailyFood = crew * v(CREW.dryFoodMass)

  // --- initial gas state ----------------------------------------------------
  /** @source Ideal gas law at cruise altitude; hydrogen is ideal at cell pressure. */
  const R = 8.314462618
  /** @source Molar mass of hydrogen, kg/mol. */
  const molarMassH2 = 2.01588e-3
  const initialMoles =
    (design.gas.initialPurity * air.pressure * hull.volume) / (R * air.temperature)

  const states: MissionState[] = []
  let purity = design.gas.initialPurity
  let totalMoles = (air.pressure * hull.volume) / (R * air.temperature)
  let liftingMoles = initialMoles
  let water = stores.water
  let food = stores.food
  let makeupEnergy = 0

  const exhaustion: Record<string, number> = {}
  const record = (key: string, day: number) => {
    if (exhaustion[key] === undefined) exhaustion[key] = day
  }

  for (let day = 1; day <= horizonDays; day += 1) {
    // --- permeation, both directions --------------------------------------
    const rates = permeationRates(film, filmArea, air.pressure, {
      species: design.gas.species,
      purity: asPurity(purity),
    })
    const secondsPerDay = SI.SECONDS_PER_HOUR * SI.HOURS_PER_DAY
    const lostMoles = rates.liftingGasMolesOut * secondsPerDay
    const gainedAirMoles = rates.airMolesIn * secondsPerDay

    purity = updatedPurity(
      { species: design.gas.species, purity: asPurity(purity) },
      lostMoles,
      gainedAirMoles,
      totalMoles,
    )
    liftingMoles -= lostMoles
    totalMoles = totalMoles - lostMoles + gainedAirMoles

    // --- lift makeup, paid for in water and energy -------------------------
    // Replace what leaked, if there is surplus energy and water to do it with.
    const makeupMass = lostMoles * molarMassH2
    const makeupWater = makeupMass * WATER_PER_HYDROGEN_ELECTROLYSED
    const produced = electrolyzer(J(dailySurplus))

    if (water > makeupWater && produced.hydrogenProduced >= makeupMass) {
      liftingMoles += lostMoles
      totalMoles += lostMoles
      // RE-DERIVE THE STATE VARIABLE FROM THE INVENTORY IT IS DEFINED ON.
      //
      // Purity is a mole fraction, so adding PURE hydrogen to a fixed
      // contaminant load raises it: n_H2 / (n_H2 + n_air) increases with n_H2,
      // whether or not the contaminant leaves. This branch updated the mole
      // inventory and left `purity` stale, so the model carried two disagreeing
      // values for one quantity, which is the failure CLAUDE.md names, on the
      // variable it singles out as a state variable rather than a refinement.
      //
      // It cannot return to its previous value: the air that leaked in does not
      // leave, so totalMoles is permanently larger and purity is permanently
      // lower than it started. Makeup slows the decay, it does not reverse it.
      purity = asPurity(liftingMoles / totalMoles)
      water -= makeupWater
      // @derived Floating point guard against dividing by a zero production
      // rate on a day with no surplus. Not a physical tolerance.
      const guard = 1e-12
      makeupEnergy += makeupMass * (dailySurplus / Math.max(produced.hydrogenProduced, guard))
    }

    // --- water and food ----------------------------------------------------
    water = Math.min(water - dailyConsumption + recovered + dailyCatchment, stores.waterCapacity)
    food -= dailyFood

    const gasMass = liftingMoles * molarMassH2
    const grossLift = hull.volume * (air.density - (totalMoles * molarMassH2) / hull.volume)

    states.push({ day, gasMass, purity, water, food, grossLift, makeupEnergy })

    if (water <= 0) record('water', day)
    if (food <= 0) record('food', day)
    if (purity <= design.gas.purityFloor) record('gas purity', day)
    // @derived Twenty percent of the lifting gas lost is taken as the point at
    // which the ship can no longer carry its design load, pending the phase 3
    // mass budget which will replace this with a real heaviness limit.
    const LIFTING_GAS_FLOOR = 0.8
    if (liftingMoles <= initialMoles * LIFTING_GAS_FLOOR) record('lifting gas', day)
  }

  // --- the two limits that are not consumables -----------------------------
  /**
   * The condition inspection, which is a legal interval rather than a physical
   * one. See docs/REGULATORY.md: it is 12 calendar months, and whether it
   * forces a landing is unresolved.
   */
  // GUARDED AGAINST THE HORIZON, like every entry the loop records.
  //
  // These two were written unconditionally after the loop, so the integrator
  // reported exhaustion days it never integrated to, and the endurance it
  // returned could exceed its own horizon by more than an order of magnitude.
  // The horizon is documented as "how far to look", past which "the model has
  // nothing useful to say", and the function was answering from beyond it.
  //
  // Omitted rather than clamped. Clamping to the horizon would invent a number.
  const inspectionDay = Math.round(SI.DAYS_PER_YEAR)
  if (inspectionDay <= horizonDays) record('condition inspection', inspectionDay)

  /** Food nutritional shelf life, which binds the stretch mission rather than food MASS. */
  const shelfLifeDay = Math.round(v(FOOD_SHELF_LIFE.freezeDried) * SI.DAYS_PER_YEAR)
  if (shelfLifeDay <= horizonDays) record('food shelf life', shelfLifeDay)

  const ranked = Object.entries(exhaustion).sort((a, b) => a[1] - b[1])
  const first = ranked[0]

  /** Legal intervals, which are a different kind of limit from a consumable. */
  const LEGAL = new Set(['condition inspection'])
  const physical = ranked.find(([k]) => !LEGAL.has(k))

  const netLoss = dailyConsumption - recovered
  const waterBalance = {
    dailyConsumption,
    dailyRecovered: recovered,
    planArea,
    dailyCatchment,
    dailyNet: dailyCatchment - netLoss,
    catchmentMargin: netLoss > 0 ? dailyCatchment / netLoss : Infinity,
  }

  if (!first) {
    return {
      designPoint: design.id,
      enduranceDays: horizonDays,
      limitingResource: 'none within horizon',
      physicalEnduranceDays: horizonDays,
      physicalLimit: 'none within horizon',
      explanation: `Nothing ran out within ${horizonDays} days.`,
      states,
      resourceExhaustion: exhaustion,
      waterBalance,
    }
  }

  return {
    designPoint: design.id,
    enduranceDays: first[1],
    limitingResource: first[0] as LimitingResource,
    physicalEnduranceDays: physical?.[1] ?? horizonDays,
    physicalLimit: (physical?.[0] as LimitingResource) ?? 'none within horizon',
    explanation: explain(first[0] as LimitingResource, first[1], exhaustion),
    states,
    resourceExhaustion: exhaustion,
    waterBalance,
  }
}

const explain = (
  resource: LimitingResource,
  day: number,
  all: Readonly<Record<string, number>>,
): string => {
  const others = Object.entries(all)
    .filter(([k]) => k !== resource)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([k, d]) => `${k} at ${d}`)
    .join(', ')

  const detail: Record<string, string> = {
    food:
      'Food is the largest non-renewable consumable aboard and nothing makes more of it. ' +
      'Endurance is a stores problem, and the only levers are loading more or eating less.',
    water:
      'The water loop did not close. Check the hygiene allowance first: it spans a factor of ' +
      'five and is the largest single term, and it is a behavioural choice rather than a physical limit.',
    'gas purity':
      'Air leaked inward faster than the cells could be vented and refilled. Adding hydrogen ' +
      'does not fix this: once a cell is contaminated the only remedies are to vent it or to ' +
      'accept the lift penalty.',
    'lifting gas':
      'Hydrogen leaked out faster than the electrolyzer could replace it, which means either ' +
      'the barrier film or the surplus energy budget is inadequate.',
    'food shelf life':
      'Not a mass limit. The stores are still aboard and are no longer nutritionally adequate. ' +
      'This is what binds a five-year mission, and no amount of tank volume fixes it.',
    'condition inspection':
      'A LEGAL limit, not a physical one, and it may not force a landing at all. See ' +
      'docs/REGULATORY.md: the requirement specifies scope and who signs, not location.',
  }

  return `${detail[resource] ?? ''} Next after this: ${others || 'nothing else within the horizon'}.`
}
