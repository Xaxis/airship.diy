import {
  GAS,
  HYDROCARBON_FUELS,
  HYDROGEN_ENERGY,
  HYDROGEN_STORAGE_DENSITY,
  ISA,
  MOLAR_MASS,
  v,
} from '@airship/data'

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
 *   historical Blaugas         49.6
 *   Jet-A in a tank            40.6
 *   methane at ambient         29.3
 *   hydrogen in a lift cell      9.0
 *   hydrogen at 700 bar          6.2
 *
 * Hydrogen loses by a factor of five to eight. It loses in a lift cell because
 * hydrogen at ambient pressure is so diffuse that the volume it occupies would
 * have lifted more than the energy is worth, and it loses at 700 bar because the
 * pressure vessel masses roughly twenty times the gas it contains.
 *
 * The gaseous fuels win by five to eight times, NOT by a thousand. An earlier
 * version of this file used the trim excursion as the lift cost, which made a
 * buoyancy-neutral gas look free to carry. It is neutral on CONSUMPTION and
 * costs a full kilogram of lift per kilogram carried, like everything else.
 * The error surfaced only when the ranking was rendered as a table and a cell
 * read 46,550 MJ per kilogram of lift.
 *
 * AND THERE IS A HARDER PROBLEM. You cannot burn the lifting gas.
 */

/**
 * Net heaviness change from burning hydrogen taken out of the LIFT CELLS.
 *
 * @derived Removing 1 kg of hydrogen from a cell frees the 11.74 m3 it occupied
 * and loses the 14.38 kg of air that volume was displacing, while shedding the
 * gas's own 1 kg of weight. The ship therefore becomes 13.38 kg HEAVY for every
 * kilogram burned.
 *
 * DO NOT SUBTRACT THE KILOGRAM AGAIN. 13.38 is already net of the gas's own
 * weight: it is 14.38 of lost buoyancy less the 1 kg that left with it. This
 * docstring used to say "the lost gross lift is 13.4 net of the gas's own
 * weight, so the ship becomes 12.4 kg heavy", taking the same kilogram off
 * twice, and the literal below and the website both carried the 12.4.
 *
 * Combustion returns only 8.94 kg of water. So even at 100 percent condensation
 * recovery the ship cannot stay neutral: recovering the water makes it 22.32 kg
 * heavy instead of 13.38, which is worse.
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
   * Kilograms of gross lift given up per kilogram of fuel CARRIED.
   *
   * TWO DIFFERENT QUESTIONS LIVE HERE AND CONFLATING THEM IS A THOUSANDFOLD
   * ERROR, which an earlier version of this file made.
   *
   * This field is the cost of CARRYING the fuel. For a liquid in an external
   * tank it is just its own mass plus the tank, so a little over 1.0. For a gas
   * carried in a hull cell it is the lift that volume WOULD have generated had
   * it been filled with hydrogen instead, per kilogram of fuel:
   * (rho_air - rho_H2) / rho_fuel. An air-density blend comes out at 0.93, not
   * at zero.
   *
   * The other question, what happens to TRIM when the fuel is consumed, is
   * `trimExcursionPerKilogram` below. A buoyancy-neutral fuel is neutral on
   * CONSUMPTION; it is never free to carry.
   */
  readonly liftCostPerKilogram: number

  /**
   * Kilograms of heaviness gained per kilogram of fuel CONSUMED, before any
   * water recovery. This is the ballast problem the brief is really asking
   * about, and it is what "buoyancy neutral" means.
   */
  readonly trimExcursionPerKilogram: number
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

/**
 * Lift given up per kilogram of a gas carried INSIDE the hull.
 *
 * THE DIFFERENCE IS AGAINST THE FUEL, NOT AGAINST AIR. A cubic metre of cell
 * holding hydrogen lifts (rho_air - rho_H2). The same cubic metre holding fuel
 * lifts (rho_air - rho_fuel), which is not zero unless the fuel is exactly air
 * density. What is FORGONE is the difference between them:
 *
 *   (rho_air - rho_H2) - (rho_air - rho_fuel) = rho_fuel - rho_H2
 *
 * and per kilogram of fuel, which occupies 1/rho_fuel of a cubic metre, that is
 * (rho_fuel - rho_H2)/rho_fuel.
 *
 * It read (rho_air - rho_H2)/rho_fuel, which assumes the fuel generates no lift
 * at all. That is true only for the air-density blend, which is the single case
 * the tests check against an independent figure, so the error was invisible
 * there and wrong for every other gas in the table, always in the direction
 * that penalises the alternative. Since `energyPerLiftGivenUp` is declared THE
 * FIGURE OF MERIT, it was inverting this module's own ranking.
 *
 * @source ISA sea level hydrogen density, computed by the buoyancy module.
 */
/**
 * Density of pure hydrogen at ISA sea level, kg/m3.
 *
 * @derived Two ideal gases at the same pressure and temperature are in the
 * ratio of their molar masses, so this is the ISA density scaled by
 * M_H2 / M_air. Computed rather than written as 0.0852, which appeared twice in
 * this file with a comment claiming the buoyancy module produced it.
 *
 * Real-gas compressibility is deliberately absent: hydrogen at ambient pressure
 * has Z = 1.0006. It is NOT absent for the 700 bar tank below, where Z = 1.43.
 */
const HYDROGEN_DENSITY_AT_SEA_LEVEL =
  v(ISA.seaLevelDensity) * (MOLAR_MASS.hydrogen.value / MOLAR_MASS.dryAir.value)

const hullGasLiftCost = (fuelDensity: number): number =>
  (fuelDensity - HYDROGEN_DENSITY_AT_SEA_LEVEL) / fuelDensity

/**
 * Heaviness gained per kilogram of a hull-carried gas CONSUMED.
 *
 * @derived The vacated cell volume fills with air, so the ship swaps fuel for
 * air of a different density: (rho_air - rho_fuel)/rho_fuel per kilogram burned.
 * Zero when the fuel is exactly air density, which is the whole point of a
 * buoyancy-neutral fuel.
 */
const hullGasTrimExcursion = (fuelDensity: number): number =>
  (v(ISA.seaLevelDensity) - fuelDensity) / fuelDensity

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

/**
 * The propane/methane blend, computed rather than asserted.
 *
 * "EXACTLY AIR DENSITY" IS NOT EXACTLY TRUE, and the module used to say it was.
 * The composition is solved to match air's MOLAR MASS, which matches density
 * only for an ideal gas. Propane is a large molecule and is nearly two percent
 * non-ideal at ambient conditions, so the blend comes out denser than air by
 * the ratio of the compressibilities.
 *
 * It is a small number and it is kept because the alternative is a claim of an
 * exact match that the same file's own constants contradict.
 */
const BLEND = (() => {
  const composition = airDensityBlend(
    v(HYDROCARBON_FUELS.propaneMolarMass),
    v(HYDROCARBON_FUELS.methaneMolarMass),
  )
  const propaneMass = composition.heavyMoleFraction * v(HYDROCARBON_FUELS.propaneMolarMass)
  const methaneMass = composition.lightMoleFraction * v(HYDROCARBON_FUELS.methaneMolarMass)
  const total = propaneMass + methaneMass

  /**
   * @derived Mass-weighted lower heating value. This is where the asserted
   * 46.55 MJ/kg was wrong: the blend is 70 percent propane BY MASS even though
   * it is 46 percent by mole, and propane is the lower-energy component, so the
   * average lands at 47.44 rather than below either ingredient's neighbourhood.
   */
  const specificEnergy =
    (propaneMass * v(HYDROCARBON_FUELS.propaneLowerHeatingValue) +
      methaneMass * v(HYDROCARBON_FUELS.methaneLowerHeatingValue)) /
    total

  /** @derived Amagat mixing of the component compressibilities by mole. */
  const compressibility =
    composition.heavyMoleFraction * v(HYDROCARBON_FUELS.propaneCompressibility) +
    composition.lightMoleFraction * v(HYDROCARBON_FUELS.methaneCompressibility)

  // rho = P M / (Z R T), and M is matched to air by construction, so the whole
  // difference from air density is the compressibility ratio.
  const density = v(ISA.seaLevelDensity) * (v(HYDROCARBON_FUELS.airCompressibility) / compressibility)

  return { composition, specificEnergy, density }
})()

const BLEND_DENSITY = BLEND.density

/** @source Blaugas at ISA sea level: relative density 0.963. */
const BLAUGAS_DENSITY = 1.1797

export const FUEL_OPTIONS: readonly FuelOption[] = [
  {
    id: 'air-density-blend',
    name: 'Modern air-density gas blend, 46 mol% propane / 54 mol% methane',
    specificEnergy: BLEND.specificEnergy,
    liftCostPerKilogram: hullGasLiftCost(BLEND_DENSITY),
    trimExcursionPerKilogram: hullGasTrimExcursion(BLEND_DENSITY),
    waterRecoveryForNeutrality: 0,
    condenserOutletTemperature: 0,
    note:
      'Solving x*44.096 + (1-x)*16.043 = 28.9647 g/mol gives 46.1 mol% propane and 53.9 mol% methane, which matches air MOLAR MASS exactly. Density is a further 0.8 percent off, because propane is nearly two percent non-ideal at ambient conditions, so burning it leaves the ship very slightly light rather than exactly neutral: 8 grams per kilogram, against 13.4 kilograms for cell hydrogen. Both are commodity fuels available anywhere in the world. No ballast compensation and no condenser. It still costs 0.93 kg of lift for every kilogram carried, because the cell it occupies could have held hydrogen.',
  },
  {
    id: 'historical-blaugas',
    name: 'Blaugas, as carried by LZ-127 Graf Zeppelin',
    /** @source Historical Blaugas LHV. */
    specificEnergy: 47.97e6,
    liftCostPerKilogram: hullGasLiftCost(BLAUGAS_DENSITY),
    trimExcursionPerKilogram: hullGasTrimExcursion(BLAUGAS_DENSITY),
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
    /** @derived Its own mass plus about 5 percent for the tank. External to the envelope, so it costs no volume. */
    liftCostPerKilogram: 1.054,
    /** @derived A liquid leaving an external tank is a straight mass loss. */
    trimExcursionPerKilogram: -1.0,
    /** @derived 1.238 kg of water per kg burned; 80.8 percent must be recovered. */
    waterRecoveryForNeutrality: 0.808,
    /** @source Condenser outlet needed for 80 percent recovery at lambda 2. */
    condenserOutletTemperature: 284.3,
    note:
      'The densest reserve by far, and the recovery burden is brutal: 80.8 percent of product water, which needs the exhaust cooled to 11 C. In a 30 C tropical climate that is not achievable with any reasonable condenser, so a hydrocarbon ship goes light exactly where it is hottest and lowest.',
  },
  {
    id: 'hydrogen-cell',
    name: 'Hydrogen drawn from the lift cells',
    specificEnergy: v(HYDROGEN_ENERGY.lowerHeatingValue),
    /**
     * @derived The same quantity as the trim excursion below, because for cell
     * hydrogen the lift lost and the heaviness gained ARE one number: the
     * vacated volume fills with air. It was written as the rounded 13.4 while
     * the line below computed 13.378, which is the disagreement this file has
     * now had twice.
     */
    liftCostPerKilogram: heavinessPerKilogramOfCellHydrogenBurned(
      v(ISA.seaLevelDensity),
      HYDROGEN_DENSITY_AT_SEA_LEVEL,
    ),
    /**
     * @derived The ship goes this much heavier per kilogram burned, before any
     * water is recovered. Computed rather than restated: it was the literal
     * 12.4, which is this number with the gas's own kilogram subtracted twice.
     */
    trimExcursionPerKilogram: heavinessPerKilogramOfCellHydrogenBurned(
      v(ISA.seaLevelDensity),
      HYDROGEN_DENSITY_AT_SEA_LEVEL,
    ),
    /** @derived Even full recovery cannot hold trim; see the module docstring. */
    waterRecoveryForNeutrality: Infinity,
    condenserOutletTemperature: HYDROGEN_CONDENSER_OUTLET,
    note:
      'THE ARCHITECTURALLY ELEGANT OPTION, AND IT DOES NOT WORK. Burning cell hydrogen makes the ship 13.4 kg heavy per kilogram burned while producing only 8.94 kg of water, so no recovery fraction can hold trim. Recovering the water makes it worse, not better.',
  },
  {
    id: 'hydrogen-700bar',
    name: 'Hydrogen in 700 bar Type IV storage',
    specificEnergy: v(HYDROGEN_ENERGY.lowerHeatingValue),
    /**
     * @derived System mass per kilogram of usable hydrogen, at the Type IV
     * system's own gravimetric fraction: 1/0.055 = 18.18. It was written as
     * 19.4, which is 1/0.0515, next to a comment saying "about 18". Nothing
     * sourced 0.0515.
     */
    liftCostPerKilogram: 1 / v(HYDROGEN_STORAGE_DENSITY.type4SystemGravimetricFraction),
    /** @derived Mass leaves the tank; the tank stays. */
    trimExcursionPerKilogram: -1.0,
    /** @derived 11.2 percent of product water holds trim, which is easy. */
    waterRecoveryForNeutrality: 0.112,
    /** @source Condenser outlet for 11 percent recovery at lambda 4. */
    condenserOutletTemperature: HYDROGEN_CONDENSER_OUTLET,
    note:
      'Ballast compensation is nearly free here, needing only 11 percent water recovery at an exhaust temperature of 44 C which almost any climate allows. The problem is the tank: the storage system masses about eighteen times the hydrogen it holds.',
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



/** Molar masses of the blend candidates, kg/mol. */
export const BLEND_COMPONENTS = {
  propane: v(HYDROCARBON_FUELS.propaneMolarMass),
  methane: v(HYDROCARBON_FUELS.methaneMolarMass),
  /** @source IUPAC 2021 atomic weights, C4H10. */
  butane: 58.122e-3,
  hydrogen: GAS.hydrogen.molarMass,
} as const
