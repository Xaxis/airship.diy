export type { AtmosphereState, AtmosphereOptions } from './atmosphere.js'
export {
  atmosphere,
  pressureAltitude,
  saturationVapourPressure,
  geometricToGeopotential,
  geopotentialToGeometric,
} from './atmosphere.js'

export type { HullShape, HullGeometry } from './geometry/hull.js'
export {
  hullGeometry,
  hullRadiusAt,
  crossSectionDistribution,
  lengthForVolume,
  hullShapeForPrismatic,
  prismaticCoefficientOf,
  CONVENTIONAL_HULL,
  CONVENTIONAL_PRISMATIC_COEFFICIENT,
} from './geometry/hull.js'

export type { DistributedLoad, PointLoad, BeamStation, BeamResult } from './structure/beam.js'
export {
  solveBeam,
  buoyancyDistribution,
  requiredSectionModulus,
  ringSectionModulus,
} from './structure/beam.js'

export type { FloatingState, RightingMoments } from './marine/hydrostatics.js'
export {
  floatingState,
  rightingMoments,
  ballastToLandOnWater,
  ballastVolume,
} from './marine/hydrostatics.js'

export type { Attitude, WindLoad } from './marine/windage.js'
export {
  windLoad,
  beamToBowForceRatio,
  beamOnForceEqualsLiftSpeed,
  seaAnchorCanopyArea,
  canopyDiameter,
  leeway,
  handlingToSurvivalRatio,
  WIND_LIMITS,
  SIDE_FORCE_COEFFICIENT_BEAM_ON,
  DRAG_COEFFICIENT_BOW_ON,
  YAW_MOMENT_COEFFICIENT_BEAM_ON,
  WEATHERVANING_UNSTABLE_BELOW_YAW,
} from './marine/windage.js'

export type { InertiaCoefficients, AddedMassMatrix } from './dynamics/added-mass.js'
export {
  inertiaCoefficients,
  addedMassMatrix,
  munkMoment,
  pendulumPeriod,
} from './dynamics/added-mass.js'

export type { PermeationRates } from './permeation.js'
export {
  permeationRates,
  annualLossFraction,
  dailyMakeupMass,
  cellFilmArea,
} from './permeation.js'

export {
  drag,
  dynamicPressure,
  powerRequired,
  maximumStationKeepingWind,
  COMPLETE_SHIP_DRAG_COEFFICIENT,
  BARE_HULL_DRAG_COEFFICIENT,
  PROPULSIVE_EFFICIENCY,
} from './aerodynamics/drag.js'

export type { SolarPosition, SolarIrradiance, ArrayLayout, ArrayOutput } from './solar.js'
export {
  declination,
  solarPosition,
  airMass,
  solarIrradiance,
  arrayOutput,
  coveredArea,
  dailyArrayEnergy,
  naiveFlatPlate,
  projectedAreaEstimate,
} from './solar.js'

export type { FuelCellOutput, ElectrolyzerOutput } from './power/electrochemistry.js'
export {
  fuelCell,
  electrolyzer,
  hydrogenRoundTripEfficiency,
  makeupPower,
  fuelCellSystemMass,
  electrolyzerSystemMass,
  WATER_PER_HYDROGEN,
  WATER_PER_HYDROGEN_ELECTROLYSED,
} from './power/electrochemistry.js'

export type { CellContents, LiftingGasName, SuperheatResponse } from './buoyancy.js'
export {
  meanMolarMass,
  gasDensity,
  specificLift,
  grossLift,
  grossLiftForce,
  staticHeaviness,
  superheatResponse,
  updatedPurity,
  pure,
  STANDARD_GAS_TEMPERATURE,
} from './buoyancy.js'
