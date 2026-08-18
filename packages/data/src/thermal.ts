import { measured, under } from './citation.js'

/**
 * Optical and thermal properties the hull's energy balance needs.
 *
 * WHY THIS FILE EXISTS. The design was graded against 20 K of solar superheat,
 * written down as "the standard figure for a dark envelope in still air at
 * midday" and used to size the ballast loop, the alighting gear and the landing
 * trim. Nothing computed it, nothing could disagree with it, and supercooling,
 * which acts in the opposite direction and is the case that puts the ship on
 * the water hard, had no value at all.
 *
 * These are the inputs to a balance that produces both.
 */
export const SOLAR = under('solar', () => ({
  constant: measured(1361, {
    unit: 'W/m2',
    source: 'nasa-solar-constant',
    relativeUncertainty: 4e-4,
    note: 'Total solar irradiance at 1 AU. The older 1367 is still widely quoted; the difference is 0.4 percent and is below everything else here.',
  }),

  /**
   * Clear-sky atmospheric transmittance at the zenith, for the Meinel
   * air-mass law I = I0 * tau^(AM^0.678).
   */
  clearSkyTransmittance: measured(0.7, {
    unit: '1',
    source: 'meinel-applied-solar-energy',
    relativeUncertainty: 0.06,
    note: 'A clean, dry atmosphere. Haze, humidity and aerosol push it down, and a hazier sky is a COOLER hull, so this is the conservative direction for superheat.',
  }),

  /**
   * Diffuse sky irradiance as a fraction of the direct beam on a clear day.
   *
   * It matters more than it looks: the diffuse component lands on the whole
   * upper hemisphere of a very large body rather than on its projected area,
   * so on a hull it is not a small correction.
   */
  clearSkyDiffuseFraction: measured(0.1, {
    unit: '1',
    source: 'duffie-beckman',
    relativeUncertainty: 0.3,
  }),

  oceanAlbedo: measured(0.06, {
    unit: '1',
    source: 'payne-albedo-sea-surface',
    relativeUncertainty: 0.25,
    note: 'For sun angles above about 25 degrees. It rises steeply at low sun, but so does the air mass, so the product stays small.',
  }),

  landAlbedo: measured(0.2, {
    unit: '1',
    source: 'duffie-beckman',
    relativeUncertainty: 0.4,
    note: 'Generic vegetated ground. Snow reaches 0.8 and would roughly double the reflected term.',
  }),
}))

/**
 * What the hull's outer surface does with radiation.
 *
 * THE TWO NUMBERS THAT DECIDE SUPERHEAT, and they pull in opposite directions.
 * A surface with high solar absorptivity and low infrared emissivity runs hot;
 * one with the reverse runs cool, and can run BELOW ambient at night, which is
 * the supercooling case.
 *
 * This vehicle is a hard case because a large part of its upper surface is
 * photovoltaic module, which is close to a blackbody in the solar band by
 * design. You cannot make an array reflective and have it work.
 */
export const ENVELOPE_OPTICS = under('envelopeOptics', () => ({
  coverSolarAbsorptivity: measured(0.2, {
    unit: '1',
    source: 'khoury-airship-technology',
    relativeUncertainty: 0.25,
    note: 'Titanium-dioxide-loaded white or aluminised outer cover, which is what every large airship has used, for exactly this reason. A dark cover is 0.9 and is the origin of the 20 K figure this project used to assert.',
  }),

  coverInfraredEmissivity: measured(0.9, {
    unit: '1',
    source: 'khoury-airship-technology',
    relativeUncertainty: 0.08,
    note: 'A painted or pigmented polymer film is nearly black in the thermal infrared whatever its colour in the visible. Aluminised film is the exception at about 0.2, and it traps heat for the same reason it keeps it out.',
  }),

  arraySolarAbsorptivity: measured(0.9, {
    unit: '1',
    source: 'nrel-module-thermal',
    relativeUncertainty: 0.05,
    note: 'A photovoltaic module absorbs nearly all the light that reaches it. The fraction converted to electricity leaves as power rather than heat, which is the only reason the array is not simply worse than the cover.',
  }),

  arrayInfraredEmissivity: measured(0.85, {
    unit: '1',
    source: 'nrel-module-thermal',
    relativeUncertainty: 0.08,
  }),
}))

/**
 * Heat transfer coefficients on the two sides of the envelope.
 *
 * The internal one is the reason superheat persists. Gas inside a cell moves
 * only by natural convection, so the envelope can be hot while the gas takes
 * an hour to follow, and the lag is what turns a symmetric solar day into an
 * asymmetric lift excursion.
 */
export const ENVELOPE_CONVECTION = under('envelopeConvection', () => ({
  internalCoefficient: measured(1.8, {
    unit: 'W/(m2.K)',
    source: 'kreider-airship-thermal',
    relativeUncertainty: 0.4,
    note: 'Natural convection of a light gas against the inside of a large cell. The uncertainty is wide and it sets the time constant rather than the peak, so it moves WHEN the excursion happens more than how big it is.',
  }),

  freeConvectionCoefficient: measured(2.5, {
    unit: 'W/(m2.K)',
    source: 'kreider-airship-thermal',
    relativeUncertainty: 0.4,
    note: 'External natural convection in still air, which is the station-keeping case and therefore the one this vehicle lives in. Forced convection at flight speed is an order larger and is computed rather than tabulated.',
  }),

  airThermalConductivity: measured(0.0253, {
    unit: 'W/(m.K)',
    source: 'nist-webbook',
    relativeUncertainty: 0.01,
    note: 'Dry air at 288 K. It varies about 0.3 percent per kelvin, which is inside the uncertainty on everything it multiplies.',
  }),

  airPrandtlNumber: measured(0.71, {
    unit: '1',
    source: 'nist-webbook',
    relativeUncertainty: 0.01,
  }),
}))

/**
 * Effective radiative sky temperature, as a fraction of ambient.
 *
 * @source Swinbank's relation, T_sky = 0.0552 * T_air^1.5, is the usual clear
 * sky form and is what this model uses. The constant is here so the CLOUDY case
 * can be stated too: an overcast sky radiates at close to air temperature, so
 * it removes the night-time supercooling almost entirely.
 */
export const SKY = under('sky', () => ({
  swinbankCoefficient: measured(0.0552, {
    unit: 'K^-0.5',
    source: 'swinbank-longwave',
    relativeUncertainty: 0.05,
    note: 'Clear sky. A clear night is the supercooling case and an overcast one is not, so the weather that makes solar power bad is the weather that makes trim easy.',
  }),
}))
