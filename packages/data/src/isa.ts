import { measured, under } from './citation.js'

/**
 * The defining constants of the International Standard Atmosphere.
 *
 * ISA is a definition, not a measurement. Every value here is exact within the
 * standard, so the uncertainties are zero. What is uncertain is whether the real
 * atmosphere resembles it on any given day, which is what the ISA offset and
 * humidity corrections in `packages/core` are for.
 *
 * The one trap: ISA fixes the universal gas constant at 8.31432 J/(mol K),
 * a value that predates the modern determination and is now known to be
 * slightly off. It stays here because the goal is to reproduce the published
 * table, and swapping in the 2019 SI value shifts computed density by about
 * 25 ppm, which is small but is exactly the size of the tolerance the
 * validation gate checks at 0.1 percent across five altitudes.
 */
export const ISA = under('isa', () => ({
  seaLevelTemperature: measured(288.15, { unit: 'K', source: 'icao-doc7488', relativeUncertainty: 0 }),
  seaLevelPressure: measured(101325, { unit: 'Pa', source: 'icao-doc7488', relativeUncertainty: 0 }),
  seaLevelDensity: measured(1.225, {
    unit: 'kg/m^3',
    source: 'icao-doc7488',
    relativeUncertainty: 0,
    note: 'Derived within the standard from the other three defining values, and also stated directly. The model computes it rather than using it, and the atmosphere test asserts the computed value reproduces this to better than 1e-5.',
  }),

  /**
   * The ISA universal gas constant. Deliberately different from CONSTANTS.R.
   * See the note above; this is not a mistake and should not be "fixed".
   */
  gasConstant: measured(8.31432, {
    unit: 'J/(mol.K)',
    source: 'icao-doc7488',
    relativeUncertainty: 0,
    note: 'Superseded as physics, still correct as a definition of ISA. Using the 2019 SI value here breaks agreement with every published atmosphere table.',
  }),

  /** Temperature lapse rate in the troposphere. Positive here, subtracted in use. */
  troposphereLapseRate: measured(6.5e-3, {
    unit: 'K/m',
    source: 'icao-doc7488',
    relativeUncertainty: 0,
  }),

  tropopauseAltitude: measured(11000, { unit: 'm', source: 'icao-doc7488', relativeUncertainty: 0 }),
  tropopauseTemperature: measured(216.65, {
    unit: 'K',
    source: 'icao-doc7488',
    relativeUncertainty: 0,
    note: 'The isothermal layer runs from 11 km to 20 km. This vehicle operates from 0 to 4 km and only reaches the stratosphere in a runaway ascent, which is a failure case the model still has to be able to represent.',
  }),

  /** Start of the second lapse layer, where temperature begins rising again. */
  stratosphereBaseAltitude: measured(20000, {
    unit: 'm',
    source: 'icao-doc7488',
    relativeUncertainty: 0,
  }),
  stratosphereLapseRate: measured(-1.0e-3, {
    unit: 'K/m',
    source: 'icao-doc7488',
    relativeUncertainty: 0,
    note: 'Negative because temperature increases with altitude here. Sign convention matches troposphereLapseRate being stated as a positive number that is subtracted.',
  }),

  /** Ratio of specific heats for dry air, used for the speed of sound. */
  gammaAir: measured(1.4, { unit: '1', source: 'icao-doc7488', relativeUncertainty: 0 }),

  // --- Sutherland's law for dynamic viscosity -------------------------------
  // mu = beta * T^1.5 / (T + S). Valid roughly 100 K to 1900 K, which covers
  // every condition this vehicle will ever see by a wide margin.
  sutherlandBeta: measured(1.458e-6, {
    unit: 'kg/(m.s.K^0.5)',
    source: 'us-std-atm-1976',
    relativeUncertainty: 1e-3,
  }),
  sutherlandConstant: measured(110.4, {
    unit: 'K',
    source: 'us-std-atm-1976',
    relativeUncertainty: 1e-3,
  }),
}))

/**
 * Published ISA values at the altitudes the validation gate checks.
 *
 * These are the table, not the model. The test computes each quantity from the
 * defining constants above and asserts agreement to 0.1 percent. If somebody
 * "improves" the atmosphere implementation and it stops matching the table
 * everyone else in aviation uses, that is a regression regardless of how much
 * more correct the new physics is.
 */
export const ISA_TABLE: ReadonlyArray<{
  altitude: number
  temperature: number
  pressure: number
  density: number
  speedOfSound: number
}> = [
  { altitude: 0, temperature: 288.15, pressure: 101325, density: 1.225, speedOfSound: 340.294 },
  { altitude: 1000, temperature: 281.651, pressure: 89874.6, density: 1.11164, speedOfSound: 336.435 },
  { altitude: 5000, temperature: 255.676, pressure: 54019.9, density: 0.736116, speedOfSound: 320.529 },
  { altitude: 11000, temperature: 216.65, pressure: 22632.1, density: 0.363918, speedOfSound: 295.07 },
  { altitude: 20000, temperature: 216.65, pressure: 5474.89, density: 0.0880349, speedOfSound: 295.07 },
] as const
