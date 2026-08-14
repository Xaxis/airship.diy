import { measured, uncertain, under } from './citation.js'
import { MOLAR_MASS } from './constants.js'

/**
 * Gas species properties.
 *
 * The lifting gas is hydrogen. Helium is here because every historical
 * validation case that is not a Zeppelin used it, and because the open question
 * of carrying a small non-flammable trim reserve needs it. Nitrogen, oxygen and
 * water vapour are here because they are what leaks IN, and inward leakage is
 * what destroys purity and therefore lift.
 */

export interface GasSpecies {
  readonly name: string
  readonly formula: string
  /** kg/mol */
  readonly molarMass: number
  /** Ratio of specific heats at around 300 K. Sets compression work. */
  readonly gamma: number
  /** J/(kg.K) at around 300 K, constant pressure. */
  readonly specificHeat: number
  readonly criticalTemperature: number
  readonly criticalPressure: number
}

export const GAS = under('gas', () => {
  const hydrogen: GasSpecies = {
    name: 'hydrogen',
    formula: 'H2',
    molarMass: MOLAR_MASS.hydrogen.value,
    gamma: measured(1.405, {
      unit: '1',
      source: 'nist-webbook',
      relativeUncertainty: 2e-3,
      note: 'Normal hydrogen at 300 K and 1 atm. Falls to about 1.38 at 500 K. The compression work model uses this at the compressor inlet condition, not as a global constant.',
    }).value,
    specificHeat: measured(14304, {
      unit: 'J/(kg.K)',
      source: 'nist-webbook',
      relativeUncertainty: 2e-3,
      note: 'Enormous, roughly 14x air, which is why the gas cell thermal time constant is much longer than intuition suggests and why superheat lags solar input by hours rather than minutes.',
    }).value,
    criticalTemperature: measured(33.145, {
      unit: 'K',
      source: 'nist-webbook',
      relativeUncertainty: 1e-4,
    }).value,
    criticalPressure: measured(1.2964e6, {
      unit: 'Pa',
      source: 'nist-webbook',
      relativeUncertainty: 1e-4,
    }).value,
  }

  const helium: GasSpecies = {
    name: 'helium',
    formula: 'He',
    molarMass: MOLAR_MASS.helium.value,
    gamma: measured(1.667, { unit: '1', source: 'nist-webbook', relativeUncertainty: 1e-3 }).value,
    specificHeat: measured(5193, { unit: 'J/(kg.K)', source: 'nist-webbook', relativeUncertainty: 1e-3 }).value,
    criticalTemperature: measured(5.1953, { unit: 'K', source: 'nist-webbook', relativeUncertainty: 1e-4 }).value,
    criticalPressure: measured(0.22746e6, { unit: 'Pa', source: 'nist-webbook', relativeUncertainty: 1e-4 }).value,
  }

  const nitrogen: GasSpecies = {
    name: 'nitrogen',
    formula: 'N2',
    molarMass: MOLAR_MASS.nitrogen.value,
    gamma: measured(1.4, { unit: '1', source: 'nist-webbook', relativeUncertainty: 1e-3 }).value,
    specificHeat: measured(1040, { unit: 'J/(kg.K)', source: 'nist-webbook', relativeUncertainty: 2e-3 }).value,
    criticalTemperature: measured(126.19, { unit: 'K', source: 'nist-webbook', relativeUncertainty: 1e-4 }).value,
    criticalPressure: measured(3.3958e6, { unit: 'Pa', source: 'nist-webbook', relativeUncertainty: 1e-4 }).value,
  }

  const oxygen: GasSpecies = {
    name: 'oxygen',
    formula: 'O2',
    molarMass: MOLAR_MASS.oxygen.value,
    gamma: measured(1.395, { unit: '1', source: 'nist-webbook', relativeUncertainty: 1e-3 }).value,
    specificHeat: measured(918, { unit: 'J/(kg.K)', source: 'nist-webbook', relativeUncertainty: 2e-3 }).value,
    criticalTemperature: measured(154.58, { unit: 'K', source: 'nist-webbook', relativeUncertainty: 1e-4 }).value,
    criticalPressure: measured(5.043e6, { unit: 'Pa', source: 'nist-webbook', relativeUncertainty: 1e-4 }).value,
  }

  const waterVapor: GasSpecies = {
    name: 'water vapour',
    formula: 'H2O',
    molarMass: MOLAR_MASS.water.value,
    gamma: measured(1.33, { unit: '1', source: 'nist-webbook', relativeUncertainty: 5e-3 }).value,
    specificHeat: measured(1996, { unit: 'J/(kg.K)', source: 'nist-webbook', relativeUncertainty: 3e-3 }).value,
    criticalTemperature: measured(647.096, { unit: 'K', source: 'nist-webbook', relativeUncertainty: 1e-5 }).value,
    criticalPressure: measured(22.064e6, { unit: 'Pa', source: 'nist-webbook', relativeUncertainty: 1e-5 }).value,
  }

  /**
   * Dry air, treated as a single species with the ISA molar mass. Its gamma and
   * specific heat are the standard values; it has no meaningful critical point
   * as a mixture and those fields are set to the nitrogen values, which is what
   * every mixture correlation does in practice.
   */
  const dryAir: GasSpecies = {
    name: 'dry air',
    formula: 'air',
    molarMass: MOLAR_MASS.dryAir.value,
    gamma: 1.4,
    specificHeat: measured(1005, { unit: 'J/(kg.K)', source: 'us-std-atm-1976', relativeUncertainty: 2e-3 }).value,
    criticalTemperature: nitrogen.criticalTemperature,
    criticalPressure: nitrogen.criticalPressure,
  }

  return { hydrogen, helium, nitrogen, oxygen, waterVapor, dryAir } as const
})

/**
 * Compressibility factor Z for hydrogen at 288.15 K, tabulated against pressure.
 *
 * Hydrogen is markedly non-ideal at storage pressures and it errs in the
 * unhelpful direction: Z above 1 means a tank holds LESS gas than the ideal gas
 * law promises. At 700 bar the ideal law over-predicts stored mass by about
 * 40 percent, which would be a spectacular way to be wrong about endurance.
 *
 * Below about 10 bar, Z is within 0.6 percent of unity and the ideal gas law is
 * used directly, which is the entire operating range of the gas cells.
 */
export const HYDROGEN_COMPRESSIBILITY_288K: ReadonlyArray<readonly [pressurePa: number, z: number]> = [
  [1e5, 1.0006],
  [1e6, 1.0059],
  [5e6, 1.0297],
  [1e7, 1.0601],
  [2e7, 1.1214],
  [3.5e7, 1.2145],
  [5e7, 1.3081],
  [7e7, 1.4331],
  [1e8, 1.6188],
] as const

/**
 * Storage density of hydrogen in a tank, at 288.15 K, including the
 * compressibility correction above. Quoted here as a cross-check on the
 * computed value rather than as an input: the model derives these and the test
 * asserts it lands within 2 percent.
 */
export const HYDROGEN_STORAGE_DENSITY = under('storage', () => ({
  at350bar: measured(23.6, {
    unit: 'kg/m^3',
    source: 'doe-h2-storage-targets',
    relativeUncertainty: 0.02,
    note: 'Gas density inside the tank at 288 K. NOT the system density, which is roughly a third of this once the tank itself is counted.',
  }),
  at700bar: measured(39.3, {
    unit: 'kg/m^3',
    source: 'doe-h2-storage-targets',
    relativeUncertainty: 0.02,
    note: 'Doubling the pressure from 350 bar buys only 67 percent more gas, because Z has risen from 1.21 to 1.43. This is the single clearest illustration of why the real-gas correction is not optional.',
  }),

  /**
   * System gravimetric capacity: mass of usable hydrogen divided by the mass of
   * the complete storage system. The number that actually enters the mass
   * budget, and the one most often quoted wrongly.
   */
  type4SystemGravimetricFraction: measured(0.055, {
    unit: '1',
    source: 'doe-h2-storage-targets',
    relativeUncertainty: 0.15,
    note: 'Type IV carbon-overwrapped pressure vessel at 700 bar, complete system including valves, regulator and mounts. Automotive production tanks sit at 4.5 to 6 wt%. Tank-only figures of 10 wt% or better exist and are not the number the airship carries.',
  }),

  /**
   * Isentropic efficiency of a real multi-stage hydrogen compressor.
   *
   * Genuinely uncertain because it depends on a machine that has not been
   * chosen. It matters: the altitude control energy budget scales directly with
   * it, and the difference between 0.55 and 0.80 is the difference between the
   * compressor being a background load and being the dominant one.
   */
  compressorIsentropicEfficiency: uncertain({
    low: 0.55,
    nominal: 0.68,
    high: 0.8,
    unit: '1',
    reason:
      'No compressor selected. Published figures span diaphragm, ionic-liquid, and reciprocating machines with very different efficiency and very different mass. Small-scale hydrogen compressors also do markedly worse than the large industrial units most datasheets describe.',
    resolvedBy:
      'Select a candidate compressor and use its manufacturer map, or measure a unit on the bench across the 1 to 350 bar range the altitude control loop actually uses.',
  }),
}))

/**
 * The temperature above which hydrogen HEATS on throttling rather than cooling.
 *
 * Almost every gas cools when expanded through a valve. Hydrogen, above about
 * 200 K, does the opposite, because its Joule-Thomson coefficient is negative
 * there. Every condition this vehicle operates in is above that temperature.
 *
 * The consequence is a safety consequence, not an efficiency one: venting or
 * releasing stored hydrogen warms it, and a leak into a confined space is
 * warmer than the surroundings rather than cooler. Any intuition carried over
 * from natural gas or propane handling is backwards here.
 */
export const HYDROGEN_JOULE_THOMSON_INVERSION_TEMPERATURE = measured(202, {
  unit: 'K',
  source: 'nist-webbook',
  relativeUncertainty: 0.01,
  note: 'Upper inversion temperature at low pressure. Below this hydrogen cools on expansion, above it warms. The whole flight envelope is above it.',
})
