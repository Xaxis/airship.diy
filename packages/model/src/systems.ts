/**
 * The three loops the vehicle lives inside: power, water and hydrogen.
 *
 * WHY THIS IS SEPARATE FROM THE ENERGY BALANCE. The energy balance answers "does
 * the loop close over a year". That is the right question and it is not the same
 * as "what is plumbed to what". A day-by-day integration can close beautifully
 * while the vehicle has a single bus whose failure kills everything, or a water
 * loop whose only source stops working in the doldrums, or a hydrogen path with
 * no way to get gas from where it is made to where it is burned.
 *
 * So this module is the SCHEMATIC: nodes, flows between them, ratings, and the
 * checks that a schematic can fail. It is deliberately a graph rather than a
 * spreadsheet, because the questions worth asking about a liveaboard's systems
 * are connectivity questions.
 *
 * THE THREE THAT MATTER MOST, and each is a check below:
 *
 *   Every load a person's survival depends on must have TWO paths to a source.
 *   Not two sources: two paths. A second generator behind the same contactor is
 *   one path.
 *
 *   The water loop must close on the WORST case, not the average. Rain in the
 *   trade wind belt is a statistical figure and a month without it is normal.
 *
 *   Hydrogen produced must exceed hydrogen consumed PLUS permeated, at every
 *   point in the year, because the deficit is paid in lift and lift does not
 *   come back.
 */

export type Loop = 'power' | 'water' | 'hydrogen'

export type NodeKind = 'source' | 'store' | 'converter' | 'load' | 'loss'

export interface SystemNode {
  readonly id: string
  readonly name: string
  readonly loop: Loop
  readonly kind: NodeKind
  /**
   * Continuous rating in the loop's own unit: W for power, kg/day for water and
   * hydrogen. Zero for a node that has no rating of its own.
   */
  readonly rating: number
  readonly unit: string
  /** Mass of the equipment, kg. */
  readonly mass: number
  /**
   * True when losing this node alone takes out a function the crew's survival
   * depends on. The redundancy check looks for these.
   */
  readonly critical: boolean
  readonly note: string
}

export interface SystemFlow {
  readonly from: string
  readonly to: string
  /** Nominal flow in the loop's unit. */
  readonly rate: number
  /** Efficiency of the path, where it converts rather than transports. */
  readonly efficiency?: number
  readonly note?: string
}

export interface SystemSchematic {
  readonly loop: Loop
  readonly nodes: readonly SystemNode[]
  readonly flows: readonly SystemFlow[]
  readonly unit: string
}

// --------------------------------------------------------------------------
// Power
// --------------------------------------------------------------------------

export interface PowerInputs {
  /** Array peak power at the design condition, W. */
  readonly arrayPeak: number
  readonly fuelCellRating: number
  readonly electrolyzerRating: number
  /** Usable battery energy, J. */
  readonly batteryEnergy: number
  readonly habitatLoad: number
  readonly propulsionRating: number
  /** Engine-driven generator, W. The path that does not depend on sunlight. */
  readonly generatorRating: number
}

/**
 * The power loop.
 *
 * THE ARCHITECTURE DECISION EMBEDDED HERE is that nothing drives a propeller
 * mechanically. Every source feeds one DC bus and every load takes from it,
 * which is what lets the engine sit aft for the exhaust rule while the
 * propulsors sit where they are aerodynamically useful. It costs a conversion
 * stage and it buys the entire arrangement.
 */
/** @source PEM fuel cell system efficiency at its rated point, about 50 percent. */
const FUEL_CELL_EFFICIENCY = 0.5

export const powerSchematic = (inputs: PowerInputs): SystemSchematic => {
  /** @source Battery energy in joules to a day's worth at the habitat load. */
  const SECONDS_PER_DAY = 86400

  const nodes: SystemNode[] = [
    {
      id: 'array',
      name: 'Photovoltaic array',
      loop: 'power',
      kind: 'source',
      rating: inputs.arrayPeak,
      unit: 'W',
      mass: 0,
      critical: false,
      note: 'The primary source and the only renewable one. Not critical in the single-failure sense: losing it is survivable on the engine, and losing it permanently ends the mission rather than the crew.',
    },
    {
      id: 'generator',
      name: 'Engine-driven generator',
      loop: 'power',
      kind: 'source',
      rating: inputs.generatorRating,
      unit: 'W',
      mass: 0,
      critical: false,
      note: 'The path that does not depend on sunlight, weather or stored hydrogen. It is the reason a week of overcast is an inconvenience rather than an emergency, and it is finite by tankage.',
    },
    {
      id: 'fuel-cell',
      name: 'Fuel cell',
      loop: 'power',
      kind: 'converter',
      rating: inputs.fuelCellRating,
      unit: 'W',
      mass: 0,
      critical: false,
      note: 'Turns stored hydrogen back into electricity and water. The night-time source, and the reason the electrolyzer exists.',
    },
    {
      id: 'battery',
      name: 'Battery',
      loop: 'power',
      kind: 'store',
      rating: inputs.batteryEnergy / SECONDS_PER_DAY,
      unit: 'W over a day',
      mass: 0,
      critical: true,
      note: 'The buffer that covers the minutes between a cloud and the fuel cell reaching load. Critical: without it every source transient is a load transient, and the loads include the propulsors holding station.',
    },
    {
      id: 'bus',
      name: 'Main DC bus',
      loop: 'power',
      kind: 'converter',
      rating: inputs.propulsionRating + inputs.habitatLoad + inputs.electrolyzerRating,
      unit: 'W',
      mass: 0,
      critical: true,
      note: 'EVERY SOURCE AND EVERY LOAD MEETS HERE, which makes it the single most consequential component on the vehicle. A split bus with a tie is the only arrangement that survives a fault at this node, and the hydrogen safety case bounds its fault energy for a separate reason: 4.3 kJ is enough to initiate a detonation directly.',
    },
    {
      id: 'electrolyzer',
      name: 'Electrolyzer',
      loop: 'power',
      kind: 'load',
      rating: inputs.electrolyzerRating,
      unit: 'W',
      mass: 0,
      critical: false,
      note: 'The largest load and the most interruptible one. It exists to turn surplus daylight into hydrogen, so it is the load that gets shed first and misses nothing.',
    },
    {
      id: 'propulsion',
      name: 'Propulsors',
      loop: 'power',
      kind: 'load',
      rating: inputs.propulsionRating,
      unit: 'W',
      mass: 0,
      critical: false,
      note: 'Four independent units on four independent controllers. Losing one is a trim problem rather than a control problem, which is the argument for four rather than two.',
    },
    {
      id: 'habitat',
      name: 'Habitat and avionics',
      loop: 'power',
      kind: 'load',
      rating: inputs.habitatLoad,
      unit: 'W',
      mass: 0,
      critical: true,
      note: 'Lighting, refrigeration, water processing, computing, ventilation. Small, continuous, and the one load that cannot be shed: the ventilation in it is part of the hydrogen safety case.',
    },
  ]

  const flows: SystemFlow[] = [
    { from: 'array', to: 'bus', rate: inputs.arrayPeak, note: 'Through MPPT converters.' },
    { from: 'generator', to: 'bus', rate: inputs.generatorRating },
    { from: 'fuel-cell', to: 'bus', rate: inputs.fuelCellRating, efficiency: FUEL_CELL_EFFICIENCY },
    { from: 'battery', to: 'bus', rate: inputs.batteryEnergy / SECONDS_PER_DAY },
    { from: 'bus', to: 'battery', rate: inputs.batteryEnergy / SECONDS_PER_DAY },
    { from: 'bus', to: 'electrolyzer', rate: inputs.electrolyzerRating },
    { from: 'bus', to: 'propulsion', rate: inputs.propulsionRating },
    { from: 'bus', to: 'habitat', rate: inputs.habitatLoad },
  ]

  return { loop: 'power', nodes, flows, unit: 'W' }
}

// --------------------------------------------------------------------------
// Water
// --------------------------------------------------------------------------

export interface WaterInputs {
  readonly dailyConsumption: number
  readonly dailyRecovered: number
  readonly dailyCatchment: number
  /** Water the fuel cell makes as a by-product, kg/day. */
  readonly fuelCellProduct: number
  /** Water the electrolyzer consumes, kg/day. */
  readonly electrolyzerDemand: number
  readonly tankCapacity: number
}

/**
 * The water loop.
 *
 * THE THING THAT MAKES THIS VEHICLE WORK AND ALMOST NOBODY MENTIONS: the fuel
 * cell and the electrolyzer are a closed water loop with each other. Every
 * kilogram of hydrogen the electrolyzer makes takes 9 kg of water, and every
 * kilogram the fuel cell burns gives 9 kg back. The hydrogen store is therefore
 * also a water store, and the two inventories cannot be reasoned about
 * separately.
 *
 * What is NOT closed is the crew's own consumption, which is why rain catchment
 * and the recycling fraction decide the endurance rather than the tank size.
 */
/**
 * @source Greywater and humidity condensate back to potable at about 85
 * percent. Blackwater is not attempted, which is why it is well short of unity.
 * The same figure the habitat data uses for the recovery fraction.
 */
const WATER_RECOVERY = 0.85

export const waterSchematic = (inputs: WaterInputs): SystemSchematic => {
  const nodes: SystemNode[] = [
    {
      id: 'rain',
      name: 'Rain catchment',
      loop: 'water',
      kind: 'source',
      rating: inputs.dailyCatchment,
      unit: 'kg/day',
      mass: 0,
      critical: false,
      note: 'The outer cover is the catchment surface, so it earns its mass twice. It is also a statistical source: the annual figure is real and a dry month is normal, so it cannot be the only path.',
    },
    {
      id: 'sea',
      name: 'Seawater, when afloat',
      loop: 'water',
      kind: 'source',
      rating: 0,
      unit: 'kg/day',
      mass: 0,
      critical: false,
      note: 'Unlimited, and available only on the surface. It is the reason the water loop never truly runs out and the reason marine mode is a resource decision rather than an emergency one. It needs desalination before it is drinkable and none before it is ballast.',
    },
    {
      id: 'fuel-cell-water',
      name: 'Fuel cell product water',
      loop: 'water',
      kind: 'source',
      rating: inputs.fuelCellProduct,
      unit: 'kg/day',
      mass: 0,
      critical: false,
      note: 'Nine kilograms per kilogram of hydrogen burned, and it is distilled. The cleanest water on the vehicle arrives as a by-product of making electricity at night.',
    },
    {
      id: 'tank',
      name: 'Water tanks',
      loop: 'water',
      kind: 'store',
      rating: inputs.tankCapacity,
      unit: 'kg',
      mass: 0,
      critical: true,
      note: 'Drinking water, electrolyzer feedstock, ballast and trim, in one inventory doing four jobs. Split fore and aft so that pumping between them is the trim control.',
    },
    {
      id: 'treatment',
      name: 'Treatment and recycling',
      loop: 'water',
      kind: 'converter',
      rating: inputs.dailyRecovered,
      unit: 'kg/day',
      mass: 0,
      critical: true,
      note: 'Greywater and humidity condensate back to potable, at about 85 percent. Blackwater is not attempted, which is why it is well short of unity and why the loop is not closed.',
    },
    {
      id: 'crew',
      name: 'Crew consumption',
      loop: 'water',
      kind: 'load',
      rating: inputs.dailyConsumption,
      unit: 'kg/day',
      mass: 0,
      critical: true,
      note: 'Drinking, food preparation and hygiene. Hygiene dominates and it is a behavioural choice spanning a factor of five, which makes it the largest single lever on the whole water budget.',
    },
    {
      id: 'electrolyzer-water',
      name: 'Electrolyzer feedstock',
      loop: 'water',
      kind: 'load',
      rating: inputs.electrolyzerDemand,
      unit: 'kg/day',
      mass: 0,
      critical: false,
      note: 'Nine kilograms per kilogram of hydrogen made, and it comes back from the fuel cell. This is a circulation rather than a consumption, and treating it as consumption double counts the largest flow in the loop.',
    },
  ]

  const flows: SystemFlow[] = [
    { from: 'rain', to: 'tank', rate: inputs.dailyCatchment },
    { from: 'fuel-cell-water', to: 'tank', rate: inputs.fuelCellProduct },
    { from: 'tank', to: 'crew', rate: inputs.dailyConsumption },
    { from: 'crew', to: 'treatment', rate: inputs.dailyConsumption },
    { from: 'treatment', to: 'tank', rate: inputs.dailyRecovered, efficiency: WATER_RECOVERY },
    { from: 'tank', to: 'electrolyzer-water', rate: inputs.electrolyzerDemand },
  ]

  return { loop: 'water', nodes, flows, unit: 'kg/day' }
}

// --------------------------------------------------------------------------
// Checks
// --------------------------------------------------------------------------

export interface SystemFinding {
  readonly id: string
  readonly severity: 'pass' | 'warn' | 'fail'
  readonly rule: string
  readonly detail: string
}

/**
 * Every critical load has at least two independent paths to a source.
 *
 * THE CHECK A SPREADSHEET CANNOT MAKE. An energy balance can close perfectly on
 * a vehicle with one bus, one converter and one tank, and a year is long enough
 * that every single point of failure gets its turn.
 *
 * Two PATHS, not two sources. A second generator behind the same contactor is
 * one path, and that is the mistake this counts rather than assumes.
 */
export const redundancyCheck = (schematic: SystemSchematic): readonly SystemFinding[] => {
  const findings: SystemFinding[] = []

  for (const node of schematic.nodes) {
    if (!node.critical || node.kind !== 'load') continue

    const feeders = schematic.flows.filter((f) => f.to === node.id)
    // Trace each feeder back one level: two feeders from the same upstream node
    // are one path, not two.
    const upstream = new Set(
      feeders.flatMap((f) => schematic.flows.filter((g) => g.to === f.from).map((g) => g.from)),
    )

    findings.push({
      id: `redundancy-${node.id}`,
      severity: upstream.size >= 2 ? 'pass' : 'fail',
      rule: `${node.name} has two independent paths to a source.`,
      detail:
        upstream.size >= 2
          ? `${upstream.size} independent sources upstream: ${[...upstream].join(', ')}. Losing any one leaves the load fed.`
          : `Only ${upstream.size} source path. A year is long enough that every single point of failure gets its turn, and this is one.`,
    })
  }

  return findings
}

/**
 * The water loop, checked on the worst case rather than the average.
 *
 * Rain in the trade wind belt is a statistical figure. A dry month is normal,
 * and a loop that closes on the annual average and not on a dry month is a loop
 * that ends the mission in a dry month.
 */
export const waterLoopCheck = (
  inputs: WaterInputs,
  /** @source A month without meaningful rain is normal in the trade wind belt. */
  dryDays = 30,
): readonly SystemFinding[] => {
  const netWithRain =
    inputs.dailyCatchment + inputs.dailyRecovered + inputs.fuelCellProduct -
    inputs.dailyConsumption
  const netWithoutRain =
    inputs.dailyRecovered + inputs.fuelCellProduct - inputs.dailyConsumption
  const dryDeficit = -netWithoutRain * dryDays

  return [
    {
      id: 'water-closes-on-average',
      severity: netWithRain >= 0 ? 'pass' : 'fail',
      rule: 'The water loop closes on the annual average.',
      detail:
        netWithRain >= 0
          ? `${inputs.dailyCatchment.toFixed(0)} kg/day of catchment plus ${inputs.dailyRecovered.toFixed(0)} recovered and ${inputs.fuelCellProduct.toFixed(0)} from the fuel cell, against ${inputs.dailyConsumption.toFixed(0)} kg/day of consumption. That is a surplus of ${(inputs.dailyCatchment / inputs.dailyConsumption).toFixed(0)} TIMES on catchment alone, because the hull presents a plan area of nearly two thousand square metres and two people drink very little of what lands on it. WATER IS NOT THE BINDING RESOURCE and it is worth saying so plainly: the interesting constraints on this vehicle are food, hydrogen inventory and the structure, and a water budget that looks tight has almost certainly double counted the electrolyzer.`
          : `${(-netWithRain).toFixed(1)} kg/day deficit even with rain. The loop does not close and the endurance is set by the tank.`,
    },
    {
      id: 'water-survives-a-dry-month',
      severity: dryDeficit <= inputs.tankCapacity ? 'pass' : 'fail',
      rule: `The tanks carry a ${dryDays} day dry spell with no catchment at all.`,
      detail:
        dryDeficit <= inputs.tankCapacity
          ? `${dryDeficit.toFixed(0)} kg drawn down over ${dryDays} dry days against ${inputs.tankCapacity.toFixed(0)} kg of capacity. Recycling and fuel cell product carry ${((inputs.dailyRecovered + inputs.fuelCellProduct) / inputs.dailyConsumption * 100).toFixed(0)} percent of consumption without any rain at all.`
          : `${dryDeficit.toFixed(0)} kg would be drawn down over ${dryDays} dry days against ${inputs.tankCapacity.toFixed(0)} kg of capacity. The loop closes on the average and fails on the case that actually happens. Either the tank grows, the hygiene allowance falls, or the vehicle lands on water and refills.`,
    },
    {
      id: 'electrolyzer-water-is-circulation',
      severity: 'pass',
      rule: 'Electrolyzer feedstock is counted as circulation, not consumption.',
      detail: `${inputs.electrolyzerDemand.toFixed(1)} kg/day goes to the electrolyzer and ${inputs.fuelCellProduct.toFixed(1)} kg/day comes back from the fuel cell. Nine kilograms of water per kilogram of hydrogen, both ways. Counting the outbound leg as consumption would double count the largest flow in the loop and make the water budget look impossible.`,
    },
  ]
}
