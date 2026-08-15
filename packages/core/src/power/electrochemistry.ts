import { ELECTROLYZER, FUEL_CELL, HYDROGEN_ENERGY, MOLAR_MASS, v } from '@airship/data'
import type { Joules, Kilograms, Watts } from '@airship/units'
import { J, kg } from '@airship/units'

/**
 * The hydrogen loop: fuel cell out, electrolyzer back in, and the water that
 * ties them together.
 *
 *   Fuel cell:    H2 + 1/2 O2 -> H2O + electricity + heat
 *   Electrolyzer: H2O + electricity -> H2 + 1/2 O2
 *
 * Both directions move water, and water on this vehicle is simultaneously
 * drinking supply, ballast, and electrolyzer feedstock. That is why the water
 * balance is the master ledger of the whole design rather than a life support
 * detail: propulsion, altitude control and life support all draw on one tank.
 */

/**
 * Kilograms of water produced per kilogram of hydrogen consumed.
 *
 * @derived Stoichiometry of H2 + 1/2 O2 -> H2O. One mole of H2 at 2.01588 g
 * yields one mole of water at 18.01528 g, so the ratio is 8.938.
 *
 * The brief and most of the literature round this to 9.0, which is a 0.7
 * percent overstatement of the water return. Small, but it is free to be right,
 * and this number multiplies the entire ballast and life support budget.
 */
export const WATER_PER_HYDROGEN = MOLAR_MASS.water.value / MOLAR_MASS.hydrogen.value

/** Kilograms of water consumed per kilogram of hydrogen produced. The same ratio. */
export const WATER_PER_HYDROGEN_ELECTROLYSED = WATER_PER_HYDROGEN

export interface FuelCellOutput {
  readonly electricalEnergy: Joules
  readonly waterProduced: Kilograms
  /** Heat rejected. On this vehicle it is a resource, not a loss. */
  readonly heatRejected: Joules
}

/**
 * Run the fuel cell on a mass of hydrogen.
 *
 * Uses LHV for the electrical output, because the product water leaves as
 * vapour and the latent heat is not available to the stack. The condenser
 * downstream recovers that heat separately, and the difference between LHV and
 * HHV is exactly what it recovers.
 */
export const fuelCell = (hydrogenMass: Kilograms, efficiency = v(FUEL_CELL.systemEfficiency)): FuelCellOutput => {
  if (efficiency <= 0 || efficiency >= 1) {
    throw new RangeError(`Fuel cell efficiency ${efficiency} is not a fraction between 0 and 1.`)
  }

  const chemicalEnergy = hydrogenMass * v(HYDROGEN_ENERGY.lowerHeatingValue)

  return {
    electricalEnergy: J(chemicalEnergy * efficiency),
    waterProduced: kg(hydrogenMass * WATER_PER_HYDROGEN),
    heatRejected: J(chemicalEnergy * (1 - efficiency)),
  }
}

export interface ElectrolyzerOutput {
  readonly hydrogenProduced: Kilograms
  readonly waterConsumed: Kilograms
  readonly oxygenProduced: Kilograms
}

/**
 * Run the electrolyzer on a quantity of electrical energy.
 *
 * The energy figure includes drying and purification, which is not a rounding
 * detail: gas going into a cell has to be pure enough that it does not degrade
 * lift, and gas going into a PEM fuel cell has to be very pure indeed, because
 * PEM catalysts are poisoned by carbon monoxide at parts-per-billion.
 */
export const electrolyzer = (
  electricalEnergy: Joules,
  energyPerKilogram = v(ELECTROLYZER.systemEnergyPerKilogram),
): ElectrolyzerOutput => {
  const hydrogenProduced = electricalEnergy / energyPerKilogram

  return {
    hydrogenProduced: kg(hydrogenProduced),
    waterConsumed: kg(hydrogenProduced * WATER_PER_HYDROGEN_ELECTROLYSED),
    // @derived Stoichiometry: half a mole of O2 per mole of H2.
    oxygenProduced: kg(
      hydrogenProduced * ((0.5 * MOLAR_MASS.oxygen.value) / MOLAR_MASS.hydrogen.value),
    ),
  }
}

/**
 * Round trip efficiency of storing electricity as hydrogen and getting it back.
 *
 * THE most important single number in the power architecture. About 32 percent,
 * against 94 percent for a lithium battery. Hydrogen is not a battery.
 *
 * What hydrogen IS good for, and what nothing else can do:
 *   - Lift makeup. No battery replaces gas that has permeated away.
 *   - Long duration reserve. It does not self-discharge, so a tank filled in
 *     June is still full in December.
 *   - Energy density by mass, for the reserve that has to last months.
 */
export const hydrogenRoundTripEfficiency = (
  fuelCellEfficiency = v(FUEL_CELL.systemEfficiency),
  electrolyzerEnergyPerKilogram = v(ELECTROLYZER.systemEnergyPerKilogram),
): number =>
  (v(HYDROGEN_ENERGY.lowerHeatingValue) * fuelCellEfficiency) / electrolyzerEnergyPerKilogram

/**
 * Electrical power needed to replace a given hydrogen leak rate.
 *
 * The direct energy cost of permeation, and the reason a barrier film's
 * transmission rate appears in the power budget at all.
 */
export const makeupPower = (
  hydrogenLossRate: number,
  energyPerKilogram = v(ELECTROLYZER.systemEnergyPerKilogram),
): Watts => (hydrogenLossRate * energyPerKilogram) as Watts

/** Mass of a fuel cell system rated for a given continuous power. */
export const fuelCellSystemMass = (ratedPower: Watts): Kilograms =>
  kg(ratedPower / v(FUEL_CELL.systemSpecificPower))

/** Mass of an electrolyzer system rated for a given continuous input power. */
export const electrolyzerSystemMass = (ratedPower: Watts): Kilograms =>
  kg(ratedPower / v(ELECTROLYZER.systemSpecificPower))
