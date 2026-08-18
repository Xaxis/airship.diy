import { BATTERY, barrierFilm, v } from '@airship/data'
import type { DesignPoint } from '@airship/model'
import {
  atmosphere,
  cellFilmArea,
  coveredArea,
  dailyArrayEnergy,
  dailyMakeupMass,
  hullGeometry,
  hullShapeForPrismatic,
  hydrogenRoundTripEfficiency,
  powerRequired,
  makeupPower,
  annualLossFraction,
  specificLift,
} from '@airship/core'
import type { ArrayLayout } from '@airship/core'
import { m, mps, rad, purity as asPurity, SI } from '@airship/units'

/**
 * The annual energy and mass balance, and the verdict on Regime A.
 *
 * Regime A is the project's thesis: solar in, electrolysis to store, fuel cell
 * to convert back, engines cold, endurance bounded by component life rather
 * than by energy. If Regime A closes, the vehicle can in principle stay up
 * indefinitely. If it does not, the honest answer is to say so and show the
 * number that kills it.
 *
 * The balance is run day by day through a year rather than at an annual
 * average, because an annual average hides the thing that actually matters. A
 * ship that generates a comfortable surplus in June and a deficit in December
 * does not have a surplus; it has a countdown, and the countdown starts in
 * autumn. The binding day is the answer, not the mean day.
 *
 * WHAT THIS DOES NOT YET INCLUDE, stated plainly so the result is not read as
 * more than it is:
 *   - Weather. Cloud enters as a single annual-average `clearSkyFraction`, not
 *     as a weather model. Real cloud is correlated in time, so a run of overcast
 *     days is worse than the average implies.
 *   - Compressor energy for altitude control, which lands with phase 4.
 *   - Structural and habitat mass, which decide whether the ship can carry the
 *     array at all. Phase 3.
 *   - Component degradation over the year.
 * Every one of these makes the answer worse, so a result that fails here fails
 * for real, while a result that passes here is a necessary condition and not a
 * sufficient one.
 */

export interface DailyBalance {
  readonly dayOfYear: number
  /** Electrical energy collected by the array, J. */
  readonly generated: number
  /** Total electrical energy the vehicle needs, J, before storage losses. */
  readonly demand: number
  /**
   * Solar energy that must be collected to meet that demand, J, after paying
   * the round trip cost of everything that has to be stored overnight.
   */
  readonly solarRequired: number
  readonly surplus: number
  readonly daylightHours: number
  /** Energy stored overnight in the battery, J. */
  readonly batteryUse: number
  /** Energy stored overnight as hydrogen, J of delivered output. */
  readonly hydrogenUse: number
}

export interface EnergyBalanceResult {
  readonly designPoint: string
  readonly closes: boolean
  /** Fractional margin on the worst day. Negative means it does not close. */
  readonly worstDayMargin: number
  readonly worstDay: number
  readonly annualGenerated: number
  readonly annualDemand: number
  /**
   * Collection the demand actually costs once the storage round trip is paid
   * for, J/year. Larger than `annualDemand` by the storage loss.
   *
   * Exposed because the mission integrator spends the surplus on electrolysis
   * and was computing it against the raw demand, which overstates what is
   * available by the whole round-trip penalty.
   */
  readonly annualRequired: number
  readonly annualMargin: number

  // Component breakdown, annualised, in J.
  readonly habitatEnergy: number
  readonly propulsionEnergy: number
  readonly liftMakeupEnergy: number

  readonly hullVolume: number
  readonly arrayArea: number
  readonly arrayMass: number
  /** Lift the array's own mass consumes, kg. Must be less than what it enables. */
  readonly grossLiftAvailable: number

  readonly stationKeepingPower: number
  readonly dailyHydrogenLeak: number
  readonly annualLeakFraction: number
  readonly hydrogenRoundTrip: number

  readonly days: readonly DailyBalance[]
  /** What binds first. The answer that should surprise us at least once. */
  readonly bindingConstraint: string
}

/**
 * Calendar constants, taken from @airship/units rather than written inline.
 *
 * There is exactly one definition of how long a year is in this repository, and
 * it is a mean Gregorian year of 365.2425 days. Writing 365 inline in a solver
 * is how an annualised figure ends up 0.07 percent adrift from the one three
 * modules away, which is small, invisible, and impossible to find later.
 */
const SECONDS_PER_DAY = SI.SECONDS_PER_HOUR * SI.HOURS_PER_DAY
const DAYS_PER_YEAR = SI.DAYS_PER_YEAR

interface SolarDay {
  readonly energy: number
  readonly daylightHours: number
}

/**
 * Days actually sampled through the year. A whole number, unlike the mean
 * Gregorian year, because you cannot integrate over a quarter of a day. Annual
 * totals scale the sampled sum by DAYS_PER_YEAR / DAYS_IN_SAMPLE.
 * @derived Integer day count for the sampling loop.
 */
const DAYS_IN_SAMPLE = 365

const solarYearCache = new Map<string, readonly SolarDay[]>()

/**
 * The array's output for every day of the year.
 *
 * Cached, and cached on purpose rather than as a micro-optimisation. Nothing
 * about the sun depends on how hard the ship is working, so a wind sweep that
 * recomputed this on every bisection step would do the same 52,000 surface
 * integrals twenty-four times over. Hoisting it is the difference between a
 * sweep that runs in a second and one that does not finish.
 */
const solarYear = (design: DesignPoint, layout: ArrayLayout, temperature: number): readonly SolarDay[] => {
  const key = [
    design.hull.length,
    design.hull.finenessRatio,
    design.hull.prismaticCoefficient,
    design.power.arrayCoverageHalfAngle,
    design.power.arrayForwardStation,
    design.power.arrayAftStation,
    design.power.moduleEfficiency,
    design.mission.latitude,
    design.mission.altitude,
  ].join('|')

  const cached = solarYearCache.get(key)
  if (cached) return cached

  const year: SolarDay[] = []
  for (let dayOfYear = 1; dayOfYear <= DAYS_IN_SAMPLE; dayOfYear += 1) {
    const solar = dailyArrayEnergy(
      layout,
      rad(design.mission.latitude),
      dayOfYear,
      m(design.mission.altitude),
      rad(0),
      temperature,
      design.power.moduleEfficiency,
    )
    year.push({ energy: solar.energy, daylightHours: solar.daylightHours })
  }

  solarYearCache.set(key, year)
  return year
}

export const energyBalance = (design: DesignPoint): EnergyBalanceResult => {
  const shape = hullShapeForPrismatic(design.hull.prismaticCoefficient)
  const hull = hullGeometry(m(design.hull.length), design.hull.finenessRatio, shape)
  const air = atmosphere(m(design.mission.altitude))

  const layout: ArrayLayout = {
    length: hull.length,
    finenessRatio: hull.finenessRatio,
    coverageHalfAngle: rad(design.power.arrayCoverageHalfAngle),
    forwardStation: design.power.arrayForwardStation,
    aftStation: design.power.arrayAftStation,
    shape,
  }

  const arrayArea = coveredArea(layout)
  const arrayMass = arrayArea * design.power.moduleArealMass

  // Permeation, and the electrolysis energy needed to replace it. Evaluated at
  // cruise altitude, where partial pressures and therefore leak rates are lower
  // than at sea level.
  const film = barrierFilm(design.hull.filmId)
  const filmArea = cellFilmArea(hull.wettedArea, hull.volume, hull.length, design.hull.cellCount)
  const contents = { species: design.gas.species, purity: asPurity(design.gas.initialPurity) }
  const dailyLeak = dailyMakeupMass(film, filmArea, air.pressure, contents)
  const liftMakeupPower = makeupPower(dailyLeak / SECONDS_PER_DAY)

  // Station keeping. Cubic in wind speed, which is why this term dominates.
  const stationKeepingPower = powerRequired(hull, air, mps(design.mission.stationKeepingWind))

  const roundTrip = hydrogenRoundTripEfficiency()
  const batteryRoundTrip = v(BATTERY.roundTripEfficiency)
  const batteryCapacity = design.power.batteryEnergy

  const year = solarYear(design, layout, air.temperature)
  const days: DailyBalance[] = []

  for (let dayOfYear = 1; dayOfYear <= DAYS_IN_SAMPLE; dayOfYear += 1) {
    const solar = year[dayOfYear - 1]
    if (!solar) continue

    const continuousPower =
      design.loads.habitatPower +
      stationKeepingPower * design.mission.stationKeepingDutyCycle +
      liftMakeupPower

    const demand = continuousPower * SECONDS_PER_DAY
    const nightHours = SI.HOURS_PER_DAY - solar.daylightHours
    const nightDemand = continuousPower * nightHours * SI.SECONDS_PER_HOUR
    const dayDemand = demand - nightDemand

    // The battery covers what it can, because at 94 percent it is three times
    // cheaper than the hydrogen path. Hydrogen covers the rest.
    const batteryUse = Math.min(batteryCapacity, nightDemand)
    const hydrogenUse = Math.max(nightDemand - batteryUse, 0)

    const solarRequired = dayDemand + batteryUse / batteryRoundTrip + hydrogenUse / roundTrip

    // The solar model is clear-sky. The derate is applied here, once, so that
    // there is exactly one place in the codebase where the difference between
    // "what the sun delivers" and "what the ship receives" is expressed.
    const generated = solar.energy * design.mission.clearSkyFraction

    days.push({
      dayOfYear,
      generated,
      demand,
      solarRequired,
      surplus: generated - solarRequired,
      daylightHours: solar.daylightHours,
      batteryUse,
      hydrogenUse,
    })
  }

  const worst = days.reduce((a, b) => (a.surplus / a.solarRequired < b.surplus / b.solarRequired ? a : b))
  /**
   * @derived The sample is DAYS_IN_SAMPLE days long and a year is DAYS_PER_YEAR.
   *
   * THE SCALING THIS FILE'S OWN DOCSTRING PROMISES, and did not apply. The three
   * annual sums were raw totals over 365 sampled days while `habitatEnergy`,
   * `propulsionEnergy` and `liftMakeupEnergy` thirty lines below multiply by
   * 365.2425, so this file carried two annual energy figures for one vehicle
   * that disagreed by exactly that ratio, having opened by warning that
   * "writing 365 inline in a solver is how an annualised figure ends up
   * disagreeing with itself".
   */
  const YEAR_SCALE = DAYS_PER_YEAR / DAYS_IN_SAMPLE
  const annualGenerated = days.reduce((sum, d) => sum + d.generated, 0) * YEAR_SCALE
  const annualRequired = days.reduce((sum, d) => sum + d.solarRequired, 0) * YEAR_SCALE
  const annualDemand = days.reduce((sum, d) => sum + d.demand, 0) * YEAR_SCALE

  const closes = worst.surplus > 0

  const seaLevelAir = atmosphere(m(0))

  // Gross lift available, for the check that the array is not a net loss.
  //
  // COMPUTED, not asserted. This used to be `hull.volume * 1.14` with a
  // citation reading "computed by packages/core", which named the function it
  // then declined to call. Pure hydrogen at full fill is also not the ship: the
  // arrangement fills to a fraction and the gas is not pure, so the literal
  // produced a third gross-lift figure a quarter above the binding one, and the
  // structure page scaled its mass fractions against it.
  const grossLiftAvailable =
    hull.volume *
    design.gas.seaLevelFillFraction *
    specificLift(contents, seaLevelAir, seaLevelAir.temperature)

  const habitatEnergy = design.loads.habitatPower * SECONDS_PER_DAY * DAYS_PER_YEAR
  const propulsionEnergy =
    stationKeepingPower * design.mission.stationKeepingDutyCycle * SECONDS_PER_DAY * DAYS_PER_YEAR
  const liftMakeupEnergy = liftMakeupPower * SECONDS_PER_DAY * DAYS_PER_YEAR

  // FROM packages/core, not hand-rolled here. This divided the annual leak by
  // `hull.volume * 0.0852 * purity`, under a citation reading "computed by
  // packages/core", which named the function it then declined to call. It is
  // the same pattern the comment thirty lines above condemns for
  // `hull.volume * 1.14`. It also evaluated the inventory at SEA LEVEL while
  // `dailyLeak` is evaluated at CRUISE, giving an inventory 22 percent larger
  // than the one the mission integrator uses for the same ship.
  //
  // `annualLossFraction` is pressure-invariant by construction, because the
  // leak and the inventory both scale with pressure, so the mismatch cannot
  // recur.
  const annualLeakFraction = annualLossFraction(film, filmArea, hull.volume, air.pressure, contents)

  return {
    designPoint: design.id,
    closes,
    worstDayMargin: worst.surplus / worst.solarRequired,
    worstDay: worst.dayOfYear,
    annualGenerated,
    annualDemand,
    annualRequired,
    annualMargin: (annualGenerated - annualRequired) / annualRequired,
    habitatEnergy,
    propulsionEnergy,
    liftMakeupEnergy,
    hullVolume: hull.volume,
    arrayArea,
    arrayMass,
    grossLiftAvailable,
    stationKeepingPower,
    dailyHydrogenLeak: dailyLeak,
    annualLeakFraction,
    hydrogenRoundTrip: roundTrip,
    days,
    bindingConstraint: identifyBinding({
      closes,
      habitatEnergy,
      propulsionEnergy,
      liftMakeupEnergy,
      arrayMass,
      grossLiftAvailable,
    }),
  }
}

/**
 * Which term is actually in charge.
 *
 * The brief asks the model to identify what runs out first and hopes it will be
 * surprising at least once. Naming the dominant energy consumer is the first
 * half of that; the mission integrator in phase 5 answers the consumables half.
 */
const identifyBinding = (input: {
  closes: boolean
  habitatEnergy: number
  propulsionEnergy: number
  liftMakeupEnergy: number
  arrayMass: number
  grossLiftAvailable: number
}): string => {
  // @derived A quarter of gross lift is the threshold at which the array stops
  // being a subsystem and starts being the payload.
  if (input.arrayMass > input.grossLiftAvailable * 0.25) {
    return 'array mass: the photovoltaics consume more than a quarter of gross lift, which is a mass problem before it is an energy one'
  }

  const terms: ReadonlyArray<readonly [string, number]> = [
    ['station keeping, which is cubic in wind speed', input.propulsionEnergy],
    ['habitat and systems load', input.habitatEnergy],
    ['lift makeup through the barrier film', input.liftMakeupEnergy],
  ]
  const dominant = terms.reduce((a, b) => (a[1] > b[1] ? a : b))
  const total = terms.reduce((sum, t) => sum + t[1], 0)

  return `${dominant[0]} (${((dominant[1] / total) * 100).toFixed(0)} percent of demand)${
    input.closes ? '' : '; the loop does NOT close at this design point'
  }`
}

/**
 * Sweep station-keeping wind to find the speed above which the loop stops
 * closing.
 *
 * This is the single most useful operational number the energy balance
 * produces: it converts the whole energy argument into "what weather can this
 * ship live in", which is the question the mission planner actually asks.
 */
export const maximumSustainableWind = (design: DesignPoint): number => {
  // @derived Bisection bracket. 40 m/s is 78 knots, well past any wind this
  // vehicle would choose to meet rather than leave.
  const BRACKET_HIGH = 40
  let low = 0
  let high = BRACKET_HIGH

  if (!energyBalance({ ...design, mission: { ...design.mission, stationKeepingWind: low } }).closes) {
    return 0
  }

  // @derived 24 bisection steps on a 40 m/s bracket resolves to under a
  // micrometre per second, far past the precision of anything feeding it.
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2
    const result = energyBalance({
      ...design,
      mission: { ...design.mission, stationKeepingWind: mid },
    })
    if (result.closes) low = mid
    else high = mid
  }

  return low
}
