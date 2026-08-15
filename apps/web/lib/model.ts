import {
  HISTORICAL_SHIPS,
  STRUCTURAL_FLEET,
  STRUCTURAL_SCALING,
  allUncertain,
  SOURCES,
} from '@airship/data'
import {
  atmosphere,
  grossLift,
  specificLift,
  pure,
  hullGeometry,
  hullShapeForPrismatic,
  hullRadiusAt,
  massFractionAt,
  benchmark,
  rankedByLiftCost,
  crossSectionDistribution,
  buoyancyDistribution,
  solveBeam,
  powerRequired,
  STANDARD_GAS_TEMPERATURE,
} from '@airship/core'
import { DESIGN_POINTS, BASELINE } from '@airship/model'
import { energyBalance, integrateMission, maximumSustainableWind } from '@airship/solvers'
import { m, m3, purity as asPurity } from '@airship/units'

/**
 * The site reads the model. It does not restate it.
 *
 * Everything on airship.diy is computed here, at build time, by calling the
 * same functions the tests call and the report tool calls. There is no number
 * typed into a page. If a figure on the site is wrong, the model is wrong, and
 * the validation gates will have failed before the site ever built.
 *
 * This is the mechanism behind the project's central rule: if a number appears
 * in prose and also in the solver, that is a bug.
 */

const seaLevel = atmosphere(m(0))

export const referenceLift = {
  hydrogen: specificLift(pure('hydrogen'), seaLevel, STANDARD_GAS_TEMPERATURE),
  helium: specificLift(pure('helium'), seaLevel, STANDARD_GAS_TEMPERATURE),
}

export const hydrogenAdvantage = referenceLift.hydrogen / referenceLift.helium - 1

export interface ValidationRow {
  readonly name: string
  readonly year: number
  readonly gas: string
  readonly volume: number
  readonly modelled: number | null
  readonly published: number | null
  readonly error: number | null
  readonly tolerance: number
  readonly passes: boolean | null
  readonly validates: string
  readonly discrepancy: string | null
}

export const validation: readonly ValidationRow[] = HISTORICAL_SHIPS.map((ship) => {
  const modelled = grossLift(
    m3(ship.gasVolume),
    { species: ship.liftingGas, purity: asPurity(ship.purity) },
    seaLevel,
    STANDARD_GAS_TEMPERATURE,
  )
  const published = ship.publishedGrossLift ?? null
  const error = published === null ? null : modelled / published - 1

  return {
    name: ship.name,
    year: ship.year,
    gas: ship.liftingGas,
    volume: ship.gasVolume,
    modelled,
    published,
    error,
    tolerance: ship.grossLiftTolerance,
    passes: error === null ? null : Math.abs(error) < ship.grossLiftTolerance,
    validates: ship.validates,
    discrepancy: ship.discrepancy ?? null,
  }
})

/**
 * The purity demonstration. Modelled with pure helium, USS Macon fails its own
 * validation gate by more than twice the tolerance. This is the evidence that
 * purity is a first-order state variable rather than a refinement.
 */
const macon = HISTORICAL_SHIPS.find((s) => s.id === 'zrs5-macon')

export const purityDemonstration = macon?.publishedGrossLift
  ? {
      published: macon.publishedGrossLift,
      atServicePurity: grossLift(
        m3(macon.gasVolume),
        { species: 'helium', purity: asPurity(macon.purity) },
        seaLevel,
        STANDARD_GAS_TEMPERATURE,
      ),
      asPure: grossLift(m3(macon.gasVolume), pure('helium'), seaLevel, STANDARD_GAS_TEMPERATURE),
      duraluminMassFraction: (macon.publishedDeadweight ?? 0) / macon.publishedGrossLift,
    }
  : null

export const designs = DESIGN_POINTS.map((design) => {
  const result = energyBalance(design)
  return {
    id: design.id,
    name: design.name,
    description: design.description,
    length: design.hull.length,
    finenessRatio: design.hull.finenessRatio,
    cellCount: design.hull.cellCount,
    wind: design.mission.stationKeepingWind,
    dutyCycle: design.mission.stationKeepingDutyCycle,
    latitude: (design.mission.latitude * 180) / Math.PI,
    altitude: design.mission.altitude,
    clearSkyFraction: design.mission.clearSkyFraction,
    result,
    maximumWind: maximumSustainableWind(design),
  }
})

export const baseline = designs.find((d) => d.id === 'baseline')

/** The hull the renderer draws, from the same shape function the model sizes with. */
export const hullProfile = (() => {
  const shape = hullShapeForPrismatic(BASELINE.hull.prismaticCoefficient)
  const geometry = hullGeometry(m(BASELINE.hull.length), BASELINE.hull.finenessRatio, shape)
  const stations = 96

  return {
    length: geometry.length,
    maxDiameter: geometry.maxDiameter,
    volume: geometry.volume,
    wettedArea: geometry.wettedArea,
    prismaticCoefficient: geometry.prismaticCoefficient,
    wettedAreaCoefficient: geometry.wettedAreaCoefficient,
    maxDiameterStation: geometry.maxDiameterStation,
    radii: Array.from({ length: stations + 1 }, (_, i) => {
      const station = i / stations
      return hullRadiusAt(m(BASELINE.hull.length), BASELINE.hull.finenessRatio, station, shape)
    }),
  }
})()

/**
 * The research queue: every value the model does not actually know.
 *
 * Sorted by relative range width, which is a proxy for endurance sensitivity
 * and is labelled as one. The real sensitivity ranking needs the phase 5
 * mission integrator.
 */
export const uncertainties = allUncertain()
  .map(({ path, value }) => ({
    path,
    low: value.low,
    nominal: value.nominal,
    high: value.high,
    unit: value.unit,
    reason: value.reason,
    resolvedBy: value.resolvedBy,
    spread: (value.high - value.low) / Math.abs(value.nominal || 1),
  }))
  .sort((a, b) => b.spread - a.spread)

/**
 * THE PHASE 3 RESULT: empty weight fraction against hull size, across the range
 * of scaling exponents the historical record cannot distinguish between.
 *
 * Deliberately a family of curves. One curve would be a claim the evidence does
 * not support, and the two ends of the range disagree about whether bigger ships
 * are better or worse.
 */
export const massFractionExponents = [
  STRUCTURAL_SCALING.allShipsExponent,
  1.0,
  0.9,
  0.8,
  STRUCTURAL_SCALING.theoreticalAreaLaw,
] as const

export const massFractionVolumes = [5953, 15803, 37458, 80000, 200000] as const

export const massFractionTable = massFractionVolumes.map((volume) => ({
  volume,
  cells: massFractionExponents.map((exponent) => massFractionAt(volume as never, exponent)),
}))

export const structuralBenchmark = benchmark()

export const structuralScaling = STRUCTURAL_SCALING

/** The historical fleet, sorted by empty weight fraction. */
export const fleet = [...STRUCTURAL_FLEET].sort(
  (a, b) => a.emptyWeightFraction - b.emptyWeightFraction,
)

/** The fuel decision matrix, ranked by the metric that governs. */
export const fuelRanking = rankedByLiftCost().map(({ option, energyPerLift }) => ({
  id: option.id,
  name: option.name,
  specificEnergy: option.specificEnergy,
  liftCost: option.liftCostPerKilogram,
  energyPerLift,
  waterRecovery: option.waterRecoveryForNeutrality,
  note: option.note,
}))

/**
 * THE PHASE 5 RESULT: which resource runs out first.
 *
 * The physical limit is food, which is a loading decision. The overall limit is
 * a LEGAL interval. Water, which was expected to be the master ledger and a
 * binding constraint, is the master ledger and does not bind at all.
 */
export const mission = (() => {
  const stores = { food: BASELINE.loads.crew * 0.62 * 400, water: 3000, waterCapacity: 4000 }
  const result = integrateMission(BASELINE, stores, 2200)
  return {
    stores,
    physicalEnduranceDays: result.physicalEnduranceDays,
    physicalLimit: result.physicalLimit,
    enduranceDays: result.enduranceDays,
    limitingResource: result.limitingResource,
    explanation: result.explanation,
    water: result.waterBalance,
    exhaustion: Object.entries(result.resourceExhaustion)
      .map(([resource, day]) => ({ resource, day }))
      .sort((a, b) => a.day - b.day),
  }
})()

/**
 * Diagnostics computed at build time and handed to the chart components.
 *
 * The physics stays on this side of the boundary; the charts only draw. That
 * keeps the client bundle from shipping a solver it does not need, and it means
 * a chart cannot quietly disagree with the model by recomputing something
 * slightly differently.
 */
export const diagnostics = (() => {
  const design = BASELINE
  const shape = hullShapeForPrismatic(design.hull.prismaticCoefficient)
  const hull = hullGeometry(m(design.hull.length), design.hull.finenessRatio, shape)
  const air = atmosphere(m(design.mission.altitude))
  const energy = energyBalance(design)

  // --- power required against airspeed, the cube law ---------------------
  const powerCurve = Array.from({ length: 41 }, (_, i) => {
    const speed = (i / 40) * 20
    return { speed, power: speed === 0 ? 0 : powerRequired(hull, air, speed as never) }
  })

  // --- hours of station keeping per day, against wind --------------------
  // The brief calls this one of the most important operational numbers: above
  // some wind the ship cannot hold position at all and must drift.
  const dailyEnergy = energy.annualGenerated / 365.2425
  const otherLoads = (energy.habitatEnergy + energy.liftMakeupEnergy) / 365.2425
  const available = Math.max(dailyEnergy - otherLoads, 0)

  const holdingCurve = Array.from({ length: 41 }, (_, i) => {
    const wind = (i / 40) * 20
    const power = wind === 0 ? 0 : powerRequired(hull, air, wind as never)
    const hours = power <= 0 ? 24 : Math.min(available / power / 3600, 24)
    return { wind, hours }
  })

  const cutoffWind =
    holdingCurve.find((p) => p.hours < 24)?.wind ??
    holdingCurve[holdingCurve.length - 1]?.wind ??
    0

  // --- shear and bending moment along the hull ---------------------------
  // Buoyancy follows cross-sectional AREA; weight follows where the heavy
  // things are. The mismatch is what bends the ship.
  const stations = crossSectionDistribution(m(design.hull.length), design.hull.finenessRatio, 201, shape)
  const buoyancy = buoyancyDistribution(stations, 1.1397)

  const width = (i: number) => {
    const previous = stations[i - 1]
    const next = stations[i + 1]
    const here = stations[i]
    if (!here) return 0
    return (previous ? (here.x - previous.x) / 2 : 0) + (next ? (next.x - here.x) / 2 : 0)
  }

  // Cover and frame mass follows surface area, so weight per unit length goes
  // as radius rather than as area. That is the mismatch.
  const radii = stations.map((s) => Math.sqrt(s.area / Math.PI))
  const radiusIntegral = radii.reduce((a, r, i) => a + r * width(i), 0)
  const distributedWeightForce = energy.grossLiftAvailable * 9.80665 * 0.45

  const loads = stations.map((station, i) => ({
    x: station.x,
    buoyancy: buoyancy[i]?.buoyancy ?? 0,
    weight: ((radii[i] ?? 0) / radiusIntegral) * distributedWeightForce,
  }))

  const beam = solveBeam(loads, [
    { name: 'gondola', x: m(design.hull.length * 0.3), mass: 3200 },
    { name: 'engines', x: m(design.hull.length * 0.62), mass: 900 },
    { name: 'fins', x: m(design.hull.length * 0.88), mass: 700 },
  ])

  return {
    powerCurve,
    holdingCurve,
    cutoffWind,
    designWind: design.mission.stationKeepingWind,
    hullLength: design.hull.length,
    beam: {
      stations: beam.stations.map((s) => ({ x: s.x, shear: s.shear, moment: s.moment })),
      maximumMoment: beam.maximumMoment,
      maximumMomentStation: beam.maximumMomentStation,
      maximumShear: beam.maximumShear,
      maximumShearStation: beam.maximumShearStation,
      hogging: beam.hogging,
    },
  }
})()

export const sources = SOURCES
