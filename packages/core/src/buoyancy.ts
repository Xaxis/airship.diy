import { GAS, ISA, CONSTANTS, MOLAR_MASS } from '@airship/data'
import type { GasSpecies } from '@airship/data'
import type {
  CubicMeters,
  Kelvin,
  Kilograms,
  KilogramsPerCubicMeter,
  Newtons,
  Pascals,
  Purity,
} from '@airship/units'
import { kg, kgPerM3, N, Pa, K } from '@airship/units'
import type { AtmosphereState } from './atmosphere.js'

/**
 * Buoyancy.
 *
 *   L = V * (rho_air - rho_gas) * g
 *
 * Three terms, and every one of them moves.
 *
 * `rho_air` moves with altitude, temperature, and humidity. `rho_gas` moves with
 * all of those plus two things unique to a buoyant vehicle: the purity of the
 * gas, which decays continuously as air leaks inward, and its temperature, which
 * is not ambient because the hull sits in the sun.
 *
 * The size of these effects is easy to underrate. A 20 K superheat on a 288 K
 * day changes lift by about 7 percent. On a 10 t ship that is 700 kg of
 * buoyancy nobody asked for, appearing over a couple of hours as the sun comes
 * up. Purity does the same thing more slowly and in one direction only. Neither
 * is a refinement; both are first-order, and a model that treats them as
 * corrections to be added later will be wrong by more than its own design
 * margins.
 */

export type LiftingGasName = 'hydrogen' | 'helium'

/**
 * The contents of a gas cell.
 *
 * Purity is volumetric: the mole fraction of the lifting species. The remainder
 * is modelled as dry air, which is what actually leaks in. Water vapour also
 * gets in and is tracked separately, because it is heavier than hydrogen and
 * lighter than air and therefore has to be signed correctly rather than lumped.
 */
export interface CellContents {
  readonly species: LiftingGasName
  readonly purity: Purity
  /** Mole fraction of water vapour in the cell. Part of the impure remainder. */
  readonly waterVapourFraction?: number
}

const speciesOf = (name: LiftingGasName): GasSpecies =>
  name === 'hydrogen' ? GAS.hydrogen : GAS.helium

/**
 * Mean molar mass of the cell contents, kg/mol.
 *
 * Lift scales with the difference between this and the molar mass of the air
 * outside, so this single number carries the entire purity effect. Hydrogen at
 * 2.016 against air at 28.96 is a factor of 14; contaminate it 5 percent with
 * air and the mean rises to 3.36, which costs 5 percent of net lift. The
 * relationship is close to linear in purity precisely because the lifting gas is
 * so much lighter than the contaminant.
 */
export const meanMolarMass = (contents: CellContents): number => {
  const lifting = speciesOf(contents.species).molarMass
  const water = contents.waterVapourFraction ?? 0
  const air = 1 - contents.purity - water

  // @derived Floating point slack, not a physical tolerance. Mole fractions
  // that sum to 1 by construction still land a few ulp either side.
  if (air < -1e-9) {
    throw new RangeError(
      `Cell composition sums above unity: purity ${contents.purity} plus water ${water}.`,
    )
  }

  return contents.purity * lifting + Math.max(air, 0) * MOLAR_MASS.dryAir.value + water * MOLAR_MASS.water.value
}

/**
 * Density of the gas in a cell.
 *
 * Ideal gas law. That is correct here and it is worth saying why, because the
 * same repository uses a real-gas correction for tank storage: compressibility
 * departs from unity with pressure, and a gas cell sits within a few hundred
 * pascals of ambient. At 1 bar hydrogen has Z = 1.0006, so the ideal law is
 * wrong by 0.06 percent, which is two orders of magnitude below the uncertainty
 * in purity. At 700 bar in a tank it is wrong by 40 percent. Same gas, different
 * question.
 *
 * @param gasTemperature Cell gas temperature, which is NOT ambient. See
 *   `superheat` in the thermal model.
 */
export const gasDensity = (
  contents: CellContents,
  pressure: Pascals,
  gasTemperature: Kelvin,
): KilogramsPerCubicMeter =>
  kgPerM3((pressure * meanMolarMass(contents)) / (ISA.gasConstant.value * gasTemperature))

/**
 * Specific lift: kilograms of lift per cubic metre of gas.
 *
 * The number airship people quote at each other. At ISA sea level with pure
 * gas the model produces 1.140 kg/m3 for hydrogen and 1.056 for helium, which
 * is the 7.9 percent hydrogen advantage usually rounded to 8 percent.
 *
 * Note this is a MASS per volume, not a force. Airship practice quotes lift in
 * kilograms because the whole trade is against the mass of the vehicle, and
 * carrying g through every intermediate obscures that. `grossLiftForce` is
 * available where a force is genuinely wanted, which is the 6-DOF solver and
 * nowhere else.
 */
export const specificLift = (
  contents: CellContents,
  air: AtmosphereState,
  gasTemperature: Kelvin,
  cellOverpressure: Pascals = Pa(0),
): KilogramsPerCubicMeter =>
  kgPerM3(air.density - gasDensity(contents, Pa(air.pressure + cellOverpressure), gasTemperature))

/** Gross lift as a mass, kg. Volume times specific lift. */
export const grossLift = (
  volume: CubicMeters,
  contents: CellContents,
  air: AtmosphereState,
  gasTemperature: Kelvin,
  cellOverpressure: Pascals = Pa(0),
): Kilograms => kg(volume * specificLift(contents, air, gasTemperature, cellOverpressure))

/** Gross lift as a force, N. For the flight dynamics solver. */
export const grossLiftForce = (
  volume: CubicMeters,
  contents: CellContents,
  air: AtmosphereState,
  gasTemperature: Kelvin,
  cellOverpressure: Pascals = Pa(0),
): Newtons => N(grossLift(volume, contents, air, gasTemperature, cellOverpressure) * CONSTANTS.g0.value)

/**
 * Static heaviness: total weight minus gross lift, as a signed mass.
 *
 * Positive means heavy, which is the safe direction and the normal operating
 * state. Negative means light, which means the ship is climbing whether or not
 * anybody asked it to, and at pressure height a light ship valves gas it cannot
 * get back.
 *
 * This is the single most important state variable on the vehicle and the
 * instrument panel shows it in kilograms, signed, at all times.
 */
export const staticHeaviness = (totalWeight: Kilograms, lift: Kilograms): Kilograms =>
  kg(totalWeight - lift)

export interface SuperheatResponse {
  /** Fractional change in gross lift. Positive for superheat. */
  readonly liftFraction: number
  /**
   * True when the cell is already full and cannot expand, so the excursion
   * shows up as pressure rather than as lift.
   */
  readonly pressureLimited: boolean
  /** Overpressure the cell would reach if it cannot expand, Pa. */
  readonly overpressure: Pascals
}

/**
 * Lift response to a gas temperature excursion.
 *
 * Which answer you get depends entirely on whether the cell has room to expand,
 * and the two regimes differ by everything rather than by a little.
 *
 * PARTIALLY FULL CELL, free to expand at ambient pressure. Gas mass is fixed and
 * volume scales with temperature, so the displaced air volume rises:
 *
 *   L = V*rho_air - m_gas,  V proportional to T
 *   dL/L = [rho_air / (rho_air - rho_gas)] * dT/T
 *
 * For hydrogen at sea level the prefactor is 1.225/1.140 = 1.075, so a 20 K
 * superheat on a 288 K day is a 7.5 percent lift increase. That is the widely
 * quoted "7 percent", and this is where it comes from.
 *
 * FULL CELL, constant volume. Mass and volume are both fixed, so rho_gas does
 * not change and lift does not change at all. The excursion appears as
 * overpressure instead, dp = p * dT/T, roughly 7 kPa for the same 20 K, which
 * is far above any sane cell relief setting. The cell valves, and THAT is where
 * the lift goes: not gradually, but as an irreversible loss of gas.
 *
 * The operational consequence is the whole argument for the compressor
 * architecture. A ship that reaches pressure height on a sunny afternoon does
 * not gently gain lift; it dumps hydrogen and is permanently poorer for it.
 */
export const superheatResponse = (
  superheat: Kelvin,
  ambientTemperature: Kelvin,
  contents: CellContents,
  air: AtmosphereState,
  fillFraction: number,
): SuperheatResponse => {
  const relativeTemperatureChange = superheat / ambientTemperature

  /** @derived The cell needs (1 + dT/T) times its current volume to stay at ambient pressure. */
  const requiredFill = fillFraction * (1 + relativeTemperatureChange)

  if (requiredFill <= 1) {
    const rhoGas = gasDensity(contents, air.pressure, ambientTemperature)
    return {
      liftFraction: (air.density / (air.density - rhoGas)) * relativeTemperatureChange,
      pressureLimited: false,
      overpressure: Pa(0),
    }
  }

  // Full. Whatever expansion the cell could still absorb has been used up; the
  // remainder becomes pressure.
  const absorbed = (1 - fillFraction) / fillFraction
  const asPressure = relativeTemperatureChange - absorbed
  const rhoGas = gasDensity(contents, air.pressure, ambientTemperature)

  return {
    liftFraction: (air.density / (air.density - rhoGas)) * absorbed,
    pressureLimited: true,
    overpressure: Pa(air.pressure * asPressure),
  }
}

/**
 * Purity after a period of bidirectional leakage.
 *
 * Kept here rather than in the permeation module because it is the definition
 * of the state variable, not the transport physics: purity is moles of lifting
 * gas over total moles, and both change.
 */
export const updatedPurity = (
  contents: CellContents,
  liftingGasMolesLost: number,
  airMolesGained: number,
  totalMolesBefore: number,
): Purity => {
  const liftingBefore = contents.purity * totalMolesBefore
  const liftingAfter = liftingBefore - liftingGasMolesLost
  const totalAfter = totalMolesBefore - liftingGasMolesLost + airMolesGained

  if (totalAfter <= 0) throw new RangeError('Cell emptied entirely; purity is undefined.')

  return Math.max(0, liftingAfter / totalAfter) as Purity
}

/** Pure lifting gas, the reference condition published lift figures are quoted at. */
export const pure = (species: LiftingGasName): CellContents =>
  ({ species, purity: 1 as Purity })

/** Sea level standard temperature, for quoting reference lift figures. */
export const STANDARD_GAS_TEMPERATURE: Kelvin = K(ISA.seaLevelTemperature.value)
