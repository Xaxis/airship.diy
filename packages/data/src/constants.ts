import { measured, under } from './citation.js'

/**
 * Universal physical constants.
 *
 * Most of these are exact by definition since the 2019 SI redefinition, which
 * is why their `relativeUncertainty` is zero. That is a real statement, not a
 * shortcut: the gas constant no longer has a measurement uncertainty because
 * the mole is now defined in terms of a fixed Avogadro constant.
 */
export const CONSTANTS = under('constants', () => ({
  /** Molar gas constant. Exact since the 2019 SI redefinition. */
  R: measured(8.314462618, {
    unit: 'J/(mol.K)',
    source: 'si-2019',
    relativeUncertainty: 0,
    note: 'Exact by definition. Do NOT use this to reproduce ISA tables: ISA fixes its own value of 8.31432, and the two differ by about 25 ppm in density.',
  }),

  /** Standard acceleration of gravity. Exact by definition (CGPM 1901). */
  g0: measured(9.80665, {
    unit: 'm/s^2',
    source: 'si-2019',
    relativeUncertainty: 0,
    note: 'A defined value, not a local measurement. Real gravity varies about 0.5 percent between the equator and the poles, which is a 0.5 percent lift variation and is below the noise of every other term in the buoyancy budget.',
  }),

  /** Stefan-Boltzmann constant. Exact, derived from fixed h, k and c. */
  sigma: measured(5.670374419e-8, {
    unit: 'W/(m^2.K^4)',
    source: 'si-2019',
    relativeUncertainty: 0,
    note: 'Drives the radiative half of the hull thermal model, which is what sets night-time supercool.',
  }),

  /** Standard atmosphere. Exact by definition. */
  standardPressure: measured(101325, {
    unit: 'Pa',
    source: 'si-2019',
    relativeUncertainty: 0,
  }),

  /** Standard temperature for gas density quotes, 0 degrees C. */
  standardTemperature: measured(273.15, {
    unit: 'K',
    source: 'si-2019',
    relativeUncertainty: 0,
    note: 'The condition at which hydrogen is quoted as 0.08988 kg/m3. Airship lift is normally quoted at ISA sea level, 288.15 K, instead. Confusing the two is a 5 percent error in the same direction as wishful thinking.',
  }),

  /** Solar constant: total solar irradiance at 1 AU, above the atmosphere. */
  solarConstant: measured(1361, {
    unit: 'W/m^2',
    source: 'us-std-atm-1976',
    relativeUncertainty: 0.001,
    note: 'The modern SORCE/TIM value. Older references say 1367, which is about 0.4 percent high and traceable to pre-2003 radiometry. Varies about 0.1 percent over the solar cycle and 3.3 percent over the year from orbital eccentricity, the latter being much the larger effect and modelled explicitly.',
  }),
}))

/**
 * Standard atomic and molecular weights.
 *
 * Hydrogen carries a genuine uncertainty because IUPAC quotes it as an interval
 * rather than a single value: terrestrial hydrogen varies measurably in
 * deuterium content depending on where it came from. The variation is about
 * 0.014 percent, which is negligible for lift, and it is recorded honestly
 * rather than rounded away.
 */
export const MOLAR_MASS = under('molarMass', () => ({
  hydrogen: measured(2.01588e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 1.4e-4,
    note: 'H2. IUPAC quotes atomic hydrogen as the interval [1.00784, 1.00811]; this is the conventional midpoint doubled.',
  }),
  helium: measured(4.002602e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 5e-7,
  }),
  nitrogen: measured(28.0134e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 2e-6,
  }),
  oxygen: measured(31.9988e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 1e-5,
  }),
  argon: measured(39.948e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 2e-5,
  }),
  carbonDioxide: measured(44.0095e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 2e-5,
  }),
  water: measured(18.01528e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 1e-5,
  }),

  /**
   * Dry air. This is the ISA value, and it is the one to use for anything that
   * has to agree with a published atmosphere table.
   *
   * Modern determinations give about 28.9647 g/mol. The 3 ppm difference is
   * irrelevant to lift and very relevant to whether the ISA validation gate
   * passes at 0.1 percent, so the two are kept separate on purpose.
   */
  dryAir: measured(28.9644e-3, {
    unit: 'kg/mol',
    source: 'icao-doc7488',
    relativeUncertainty: 1e-5,
    note: 'The ISA-defined value. Assumes a fixed composition with no CO2 trend, which is now measurably wrong and still what the standard says.',
  }),
}))
