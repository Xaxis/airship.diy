export type {
  DesignPoint,
  HullParameters,
  GasParameters,
  PowerParameters,
  LoadParameters,
  MissionParameters,
} from './design-point.js'
export { BASELINE, MINIMUM_VIABLE, STRETCH, DESIGN_POINTS, designPoint } from './designs.js'

export type { Deck, Category, Compartment, Propulsor, Configuration } from './configuration.js'
export { BASELINE_ARRANGEMENT } from './configuration.js'

export type {
  MassItem,
  MassStatement,
  Severity,
  Finding,
  FinPlanform,
  Provisions,
  HullGirderLoads,
} from './arrangement.js'
export {
  compartmentVolume,
  consumables,
  provisionsFor,
  MASS_GROWTH_ALLOWANCE,
  wingSizing,
  keelEnvelopeVolume,
  LANDING_TRIM,
  finPlanform,
  massStatement,
  thermalDesignCase,
  validateArrangement,
  smallestClosingLength,
  hullBendingMoment,
} from './arrangement.js'

export type {
  ArchitectureId,
  HullForm,
  GasContainment,
  BuoyancyControl,
  LandingGear,
  Architecture,
  StructuralMass,
  PressureLimit,
  BuoyancyControlCost,
  ArchitectureComparison,
} from './architecture.js'
export {
  RIGID,
  SEMI_RIGID,
  NON_RIGID,
  HYBRID_LIFT,
  VARIABLE_BUOYANCY,
  ARCHITECTURES,
  architecture,
} from './architectures.js'
export {
  structuralMass,
  SEMI_RIGID_MASS_UNCERTAINTY,
  pressureStabilisedLimit,
  buoyancyControlCost,
  fillFractionForSuperheat,
  compareArchitecture,
} from './architecture.js'

export type {
  Loop,
  NodeKind,
  SystemNode,
  SystemFlow,
  SystemSchematic,
  PowerInputs,
  WaterInputs,
  SystemFinding,
} from './systems.js'
export {
  powerSchematic,
  waterSchematic,
  redundancyCheck,
  waterLoopCheck,
} from './systems.js'

export type { FittingKind, Fitting, Room } from './fitout.js'
export { FITOUT } from './fitout.js'
export type { RoomAssessment, HabitatAssessment } from './habitat.js'
export { assessRoom, assessHabitat } from './habitat.js'

export type { Severity as FailureSeverity, FailureMode, FailureSummary } from './failure.js'
export { dumpableInventory, failureModes, failureSummary } from './failure.js'

export type {
  BomLine,
  BillOfMaterials,
  LabourTask,
  LabourEstimate,
  FacilityRequirement,
  HandlingLimits,
  BuildVerdict,
} from './build.js'
export {
  billOfMaterials,
  labourEstimate,
  facilityRequirement,
  handlingLimits,
  buildVerdict,
} from './build.js'

export type { Refusal } from './refused.js'
export {
  collapsibleEnvelope,
  pressurisedLobeWing,
  refusedRequirements,
} from './refused.js'
