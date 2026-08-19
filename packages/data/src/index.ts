export type { Source, Measured, Uncertain, Provenanced } from './citation.js'
export {
  measured,
  uncertain,
  under,
  v,
  bounds,
  allProvenanced,
  unreadProvenanced,
  sweeping,
  allUncertain,
} from './citation.js'

export { SOURCES, source, sourceExists } from './sources.js'
export { CONSTANTS, MOLAR_MASS } from './constants.js'
export {
  HYDROGEN_ENERGY,
  HYDROCARBON_FUELS,
  FUEL_CELL,
  ELECTROLYZER,
  PHOTOVOLTAIC,
  BATTERY,
} from './power.js'
export { WATER, WINDAGE, GALVANIC, SEA_STATE } from './marine.js'
export { CREW, FOOD_SHELF_LIFE, CATCHMENT, HABITABILITY } from './habitat.js'
export type { Engine } from './engines.js'
export { ENGINES, ENGINE_CONSUMABLES } from './engines.js'
export { HYDROGEN_SAFETY, VENTILATION } from './safety/hydrogen.js'
export {
  SP8007,
  END_FIXITY,
  CRIPPLING,
  AIRSHIP_LOAD_CASES,
  GUST_BENDING_MOMENT_COEFFICIENT,
} from './materials/buckling.js'
export { ISA, ISA_TABLE } from './isa.js'
export type { GasSpecies } from './gases.js'
export {
  GAS,
  HYDROGEN_COMPRESSIBILITY_288K,
  HYDROGEN_STORAGE_DENSITY,
  HYDROGEN_JOULE_THOMSON_INVERSION_TEMPERATURE,
} from './gases.js'

export type { CarbonFibre, ResinSystem } from './materials/composites.js'
export {
  CARBON_FIBRES,
  RESIN_SYSTEMS,
  WET_LAYUP,
  WOVEN_KNOCKDOWN,
  LAMINATE_ANCHORS,
  AERODYNAMIC_SURFACE_AREAL_MASS,
  TEMPERATURE_LIMITS,
  maximumOperatingTemperature,
} from './materials/composites.js'

export type { BarrierFilm } from './materials/films.js'
export {
  BARRIER_FILMS,
  barrierFilm,
  HYDROGEN_HELIUM_SELECTIVITY,
  MOLAR_VOLUME_STP,
} from './materials/films.js'

export type { HistoricalShip } from './validation/historical-ships.js'
export {
  HISTORICAL_SHIPS,
  ZEPPELIN_NT,
  AIRLANDER_DIMENSIONS,
} from './validation/historical-ships.js'

export {
  MATERIAL_PRICES,
  FACILITY,
  GROUND_HANDLING,
  BUILD_LABOUR,
  BUILD_PRECEDENT,
} from './build.js'

export type { FleetEntry, PressureStabilisedEntry } from './validation/structural-fleet.js'
export {
  STRUCTURAL_FLEET,
  PRESSURE_STABILISED_FLEET,
  SEMI_RIGID_ADVANTAGE,
  PANEL_ASPECT_RATIO,
  AKRON_STRUCTURE,
  EMPTY_WEIGHT_PER_GAS_VOLUME,
  STRUCTURAL_SCALING,
} from './validation/structural-fleet.js'
export { SOLAR, ENVELOPE_OPTICS, ENVELOPE_CONVECTION, SKY } from './thermal.js'
export { GOODYEAR_FIN_SIZING, HISTORICAL_YAW_STATIC_MARGIN } from './validation/fin-sizing.js'
export { CENTREBOARD } from './marine.js'
