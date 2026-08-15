import { HISTORICAL_SHIPS, STRUCTURAL_SCALING, allUncertain, SOURCES } from '@airship/data'
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
  STANDARD_GAS_TEMPERATURE,
} from '@airship/core'
import { DESIGN_POINTS, BASELINE } from '@airship/model'
import { energyBalance, maximumSustainableWind } from '@airship/solvers'
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

export const sources = SOURCES
