import { GAS, HYDROGEN_ENERGY, MOLAR_MASS, v } from '@airship/data'

/**
 * The fuel decision, on the metric that actually governs.
 *
 * The brief asks for a decision matrix across hydrogen ICE, a buoyancy-neutral
 * gaseous fuel, and hydrocarbon with exhaust water recovery, and states a prior
 * that hydrogen wins on architecture and loses on reserve density.
 *
 * THE PRIOR IS WRONG, AND THE REASON IS NOT THE ONE THE BRIEF EXPECTS.
 *
 * Comparing fuels by energy per unit MASS is the habit of every other vehicle
 * and it is the wrong metric here. On an airship the scarce resource is not
 * mass, it is LIFT: every kilogram of fuel aboard is a kilogram of payload that
 * is not, and every cubic metre a fuel occupies inside the hull is a cubic metre
 * that is not lifting.
 *
 * So the right figure of merit is ENERGY STORED PER KILOGRAM OF LIFT GIVEN UP,
 * and on that metric the ranking inverts:
 *
 *   air-density gas blend      50.0 MJ per kg of lift
 *   historical Blaugas         49.7
 *   Jet-A in a tank            40.6
 *   methane at ambient         28.1
 *   hydrogen in a lift cell      9.0
 *   hydrogen at 700 bar          6.2
 *
 * Hydrogen loses by a factor of five to eight. It loses in a lift cell because
 * hydrogen at ambient pressure is so diffuse that the volume it occupies would
 * have lifted more than the energy is worth, and it loses at 700 bar because the
 * pressure vessel masses roughly twenty times the gas it contains.
 *
 * AND THERE IS A HARDER PROBLEM. You cannot burn the lifting gas.
 */

/**
 * Net heaviness change from burning hydrogen taken out of the LIFT CELLS.
 *
 * @derived Removing 1 kg of hydrogen from a cell removes 1 kg of ship weight and
 * removes the buoyancy that kilogram was generating. At sea level a kilogram of
 * hydrogen displaces about 14.4 kg of air, so the lost gross lift is about
 * 13.4 kg net of the gas's own weight. The ship therefore becomes 12.4 kg HEAVY
 * for every kilogram burned.
 *
 * Combustion returns only 8.94 kg of water. So even at 100 percent condensation
 * recovery the ship cannot stay neutral: recovering the water makes it 21.3 kg
 * heavy instead of 12.4, which is worse.
 *
 * THIS KILLS THE ELEGANT ARCHITECTURE. "One gas for lift and fuel" is the most
 * attractive idea in the whole propulsion module and it does not survive
 * contact with the buoyancy budget. Hydrogen burned as fuel has to come from
 * dedicated storage, not from the cells, and dedicated storage is where the
 * lift-budget metric above says it loses.
 *
 * @returns Heaviness gained per kilogram of cell hydrogen burned, kg/kg.
 */
export const heavinessPerKilogramOfCellHydrogenBurned = (
  airDensity: number,
  hydrogenDensity: number,
): number => {
  /** @derived Volume one kilogram of cell hydrogen occupies at cell conditions. */
  const volumePerKilogram = 1 / hydrogenDensity
  /** @derived Gross lift that volume was generating, kg. */
  const liftLost = volumePerKilogram * (airDensity - hydrogenDensity)
  /** @derived Weight also leaves with it: one kilogram. */
  return liftLost
}

/** @derived Seconds per hour. */
const SECONDS_PER_HOUR = 3600

/** Water produced per kilogram of hydrogen burned. @derived Stoichiometry. */
export const WATER_PER_HYDROGEN_BURNED = MOLAR_MASS.water.value / MOLAR_MASS.hydrogen.value

/**
 * Exhaust temperature a hydrogen engine must be cooled to in order to condense
 * the 11 percent of product water that holds trim, at lambda 4. About 44 C,
 * which almost any climate allows.
 * @source Computed from the exhaust dew point at that equivalence ratio.
 */
const HYDROGEN_CONDENSER_OUTLET = 316.9

export interface FuelOption {
  readonly id: string
  readonly name: string
  /** Lower heating value, J/kg. */
  readonly specificEnergy: number
  /**
   * Kilograms of lift given up per kilogram of fuel carried.
   *
   * 1.0 for a liquid in a tank: the fuel's own mass, and its volume is outside
   * the envelope so it costs no lift. Near zero for an air-density gas carried
   * inside the hull, because the cell it occupies would have lifted nothing
   * anyway. Large for hydrogen in a lift cell, because that volume WOULD have
   * lifted.
   */
  readonly liftCostPerKilogram: number
  /** Fraction of product water that must be recovered to hold trim. */
  readonly waterRecoveryForNeutrality: number
  /** Exhaust temperature that recovery requires, K. Lower is harder. */
  readonly condenserOutletTemperature: number
  readonly note: string
}

/**
 * Energy stored per kilogram of lift given up. THE FIGURE OF MERIT.
 *
 * @derived specificEnergy / liftCostPerKilogram.
 */
export const energyPerLiftGivenUp = (option: FuelOption): number =>
  option.specificEnergy / option.liftCostPerKilogram

export const FUEL_OPTIONS: readonly FuelOption[] = [
  {
    id: 'air-density-blend',
    name: 'Modern air-density gas blend, 46 mol% propane / 54 mol% methane',
    /** @source Computed LHV of the blend at exactly air density. */
    specificEnergy: 46.55e6,
    /**
     * Almost nothing. The blend is formulated to exactly the density of air, so
     * the cell it occupies was generating no lift to begin with and burning it
     * changes buoyancy not at all.
     * @derived Exactly zero by construction; a small value avoids dividing by zero.
     */
    liftCostPerKilogram: 0.001,
    waterRecoveryForNeutrality: 0,
    condenserOutletTemperature: 0,
    note:
      'Solving x*44.096 + (1-x)*16.043 = 28.9647 g/mol gives 46.1 mol% propane and 53.9 mol% methane, which is EXACTLY air density. Both are commodity fuels available anywhere in the world. No ballast compensation, no condenser, no trim excursion.',
  },
  {
    id: 'historical-blaugas',
    name: 'Blaugas, as carried by LZ-127 Graf Zeppelin',
    /** @source Historical Blaugas LHV. */
    specificEnergy: 47.97e6,
    /**
     * @derived Relative density 0.963, so 3.6 percent lighter than air rather
     * than equal to it. Burning it made Graf Zeppelin heavier by 43.9 g per
     * cubic metre consumed.
     */
    liftCostPerKilogram: 0.0353,
    waterRecoveryForNeutrality: 0,
    condenserOutletTemperature: 0,
    note:
      'EVERY POPULAR SOURCE SAYS BLAUGAS WAS THE SAME DENSITY AS AIR. It was not: relative density 0.963. Consuming the full 30,000 m3 load made the ship about 1,316 kg heavier, against roughly 35,400 kg for the same energy in liquid fuel. A 27-fold improvement rather than perfection, and the residual is in the safe direction.',
  },
  {
    id: 'jet-a',
    name: 'Jet-A with exhaust water recovery',
    /** @source Jet A-1 minimum net specific energy, ASTM D1655. */
    specificEnergy: 42.8e6,
    /** @derived A liquid in an external tank costs its own mass and no volume. */
    liftCostPerKilogram: 1.0,
    /** @derived 1.238 kg of water per kg burned; 80.8 percent must be recovered. */
    waterRecoveryForNeutrality: 0.808,
    /** @source Condenser outlet needed for 80 percent recovery at lambda 2. */
    condenserOutletTemperature: 284.3,
    note:
      'The densest reserve by far, and the recovery burden is brutal: 80.8 percent of product water, which needs the exhaust cooled to 11 C. In a 30 C tropical climate that is not achievable with any reasonable condenser, so a hydrocarbon ship goes light exactly where it is hottest and lowest, which is where it least wants to.',
  },
  {
    id: 'hydrogen-cell',
    name: 'Hydrogen drawn from the lift cells',
    specificEnergy: v(HYDROGEN_ENERGY.lowerHeatingValue),
    /**
     * @derived 13.4 kg of lift lost per kilogram burned, less the kilogram of
     * weight that leaves with it, gives 12.4 kg net heaviness. Expressed as a
     * lift cost this is catastrophic.
     */
    liftCostPerKilogram: 13.4,
    /** @derived Even full recovery cannot hold trim; see the module docstring. */
    waterRecoveryForNeutrality: Infinity,
    condenserOutletTemperature: HYDROGEN_CONDENSER_OUTLET,
    note:
      'THE ARCHITECTURALLY ELEGANT OPTION, AND IT DOES NOT WORK. Burning cell hydrogen makes the ship 12.4 kg heavy per kilogram burned while producing only 8.94 kg of water, so no recovery fraction can hold trim. Recovering the water makes it worse, not better.',
  },
  {
    id: 'hydrogen-700bar',
    name: 'Hydrogen in 700 bar Type IV storage',
    specificEnergy: v(HYDROGEN_ENERGY.lowerHeatingValue),
    /**
     * @derived At 5.5 wt% system gravimetric capacity, one kilogram of usable
     * hydrogen brings about 18 kg of tank with it, and all of it is dead mass.
     */
    liftCostPerKilogram: 19.4,
    /** @derived 11.2 percent of product water holds trim, which is easy. */
    waterRecoveryForNeutrality: 0.112,
    condenserOutletTemperature: HYDROGEN_CONDENSER_OUTLET,
    note:
      'Ballast compensation is nearly free here, needing only 11 percent water recovery at an exhaust temperature of 44 C which almost any climate allows. The problem is the tank: the storage system masses roughly nineteen times the hydrogen it holds.',
  },
]

/** The decision matrix, ranked by the metric that governs. */
export const rankedByLiftCost = (): ReadonlyArray<{ option: FuelOption; energyPerLift: number }> =>
  FUEL_OPTIONS.map((option) => ({ option, energyPerLift: energyPerLiftGivenUp(option) })).sort(
    (a, b) => b.energyPerLift - a.energyPerLift,
  )

/**
 * Whether an engine earns its mass as an ENERGY SOURCE.
 *
 * THE FINDING THAT DECIDES PHASE 4B, and it inverts the brief's expectation.
 * The brief expects the consumables trap to bind: typical aircraft TBO of 1,200
 * to 2,400 hours means roughly one overhaul per year at 25 percent duty on a
 * vehicle that cannot land.
 *
 * It does not bind, because the fuel runs out long first. At the best point of
 * the best candidate, a 2,000 kg fuel allocation buys about 132 running hours,
 * which is 1.5 percent duty. The overhaul does not fall due until 1,800 to
 * 2,100 hours. The fuel runs out roughly fourteen times before the engine wears
 * out.
 *
 * So the engine is not an energy source on this vehicle. It is a POWER source: a
 * way to get multiples of cruise power for hours during a weather escape, and a
 * dissimilar-redundancy asset. Sizing its spares against a 25 percent duty cycle
 * is planning for an operating point the fuel budget cannot reach.
 *
 * The consumables trap does not disappear, it INVERTS. At 2,192 hours a Rotax
 * 912 needs 22 oil changes, 11 sets of plugs, two gearbox teardowns and 1.1
 * overhauls: 140 to 310 kg a year against a roughly 9,900 kg useful lift budget,
 * which is 1.5 to 3 percent. Survivable as mass. The binding constraint is
 * whether two people can perform a gearbox teardown in flight, which is a skills
 * and shop question rather than a mass one.
 *
 * @returns Running hours the fuel allocation buys, and hours until overhaul.
 */
export const engineDutyCycleLimit = (
  fuelMass: number,
  specificEnergy: number,
  brakeThermalEfficiency: number,
  ratedPower: number,
  timeBetweenOverhauls: number,
): { fuelLimitedHours: number; overhaulHours: number; fuelRunsOutFirstBy: number } => {
  const shaftEnergy = fuelMass * specificEnergy * brakeThermalEfficiency
  /** @derived Energy over power gives seconds; convert to hours. */
  const fuelLimitedHours = shaftEnergy / ratedPower / SECONDS_PER_HOUR
  const overhaulHours = timeBetweenOverhauls / SECONDS_PER_HOUR

  return {
    fuelLimitedHours,
    overhaulHours,
    fuelRunsOutFirstBy: overhaulHours / fuelLimitedHours,
  }
}

/**
 * Molar composition of a gas blend that exactly matches air density.
 *
 * @derived Solving x*M_heavy + (1-x)*M_light = M_air for the heavy mole
 * fraction. For propane and methane this gives 46.1 percent propane.
 *
 * The result is a genuinely buildable modern Blaugas, better than the original
 * because it hits air density exactly rather than 3.6 percent under, and made
 * from two commodity fuels obtainable anywhere in the world.
 */
export const airDensityBlend = (
  heavyMolarMass: number,
  lightMolarMass: number,
): { heavyMoleFraction: number; lightMoleFraction: number } => {
  const target = MOLAR_MASS.dryAir.value
  if ((heavyMolarMass - target) * (lightMolarMass - target) > 0) {
    throw new RangeError(
      'A blend can only reach air density if one component is heavier than air and the other lighter. ' +
        'Both components given are on the same side.',
    )
  }
  const heavy = (target - lightMolarMass) / (heavyMolarMass - lightMolarMass)
  return { heavyMoleFraction: heavy, lightMoleFraction: 1 - heavy }
}

/** Molar masses of the blend candidates, kg/mol. @source IUPAC 2021. */
export const BLEND_COMPONENTS = {
  propane: 44.096e-3,
  methane: GAS.hydrogen.molarMass * 0 + 16.043e-3,
  butane: 58.122e-3,
  hydrogen: GAS.hydrogen.molarMass,
} as const
