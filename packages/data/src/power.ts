import { measured, uncertain, under } from './citation.js'

/**
 * Energy conversion: hydrogen chemistry, fuel cells, electrolyzers,
 * photovoltaics and batteries.
 *
 * The single most important thing encoded here is that the hydrogen round trip
 * is BAD. Electrolysis costs about 52 kWh per kg and a fuel cell returns about
 * 16, so storing energy as hydrogen returns roughly a third of what went in.
 * Hydrogen is not a good battery. It is a good lift makeup medium, because
 * that is the one job no battery can do, and a good long-duration reserve
 * because it does not self-discharge. Diurnal cycling belongs in lithium.
 *
 * A model that treats hydrogen as a generic energy store will close the loop
 * far too easily and be wrong by a factor of three.
 */

export const HYDROGEN_ENERGY = under('hydrogenEnergy', () => ({
  /**
   * Lower heating value: the energy released when the product water stays a
   * vapour. This is the number to use for an engine or a fuel cell whose
   * exhaust leaves warm, which is all of them.
   */
  lowerHeatingValue: measured(119.96e6, {
    unit: 'J/kg',
    source: 'nist-webbook',
    relativeUncertainty: 1e-3,
    note: '33.32 kWh/kg. State LHV or HHV at every call site. The 18 percent gap between them is larger than most of the efficiency differences this model argues about.',
  }),

  /**
   * Higher heating value: includes the latent heat of condensing the product
   * water. Reachable only if you actually condense it, which this vehicle does,
   * because it wants the water.
   */
  higherHeatingValue: measured(141.8e6, {
    unit: 'J/kg',
    source: 'nist-webbook',
    relativeUncertainty: 1e-3,
    note: '39.39 kWh/kg. Relevant here in a way it is not on most vehicles: the condenser that recovers ballast water also recovers this heat.',
  }),
}))

export const FUEL_CELL = under('fuelCell', () => ({
  /**
   * SYSTEM efficiency on LHV, under a real duty cycle.
   *
   * System, not stack. A stack at its best point does better, and then the
   * air compressor, the humidifier, the coolant pump and the DC-DC converter
   * take their share. Quoting stack efficiency in a vehicle model overstates
   * output by a quarter.
   */
  systemEfficiency: uncertain({
    low: 0.45,
    nominal: 0.5,
    high: 0.55,
    unit: '1',
    reason:
      'Depends on the operating point, the duty cycle and how hard the balance of plant is worked. Owner-built stacks will land at the low end of this band, and the brief specifies owner-built stacks.',
    resolvedBy:
      'Build a stack and measure it, or select a commercial system and use its published polarisation curve with balance-of-plant loads subtracted.',
    source: 'doe-fuel-cell-records',
  }),

  /**
   * Complete system specific power, including humidification, cooling, air
   * supply and power conditioning. NOT stack specific power, which is 1 to
   * 2 kW/kg and roughly triple this.
   */
  systemSpecificPower: uncertain({
    low: 400,
    nominal: 550,
    high: 700,
    unit: 'W/kg',
    reason:
      'Automotive systems reach the top of this band with heavy engineering investment. A shop-built system will be heavier.',
    resolvedBy: 'Select or build the system and weigh it.',
    source: 'doe-fuel-cell-records',
  }),

  /**
   * Time from cold to full rated output.
   *
   * This matters more than it looks. A fuel cell that takes four minutes to
   * reach full output is a different vehicle from one that responds instantly,
   * and gust response depends on which you have. The battery buffer exists to
   * cover exactly this interval.
   */
  coldStartTime: uncertain({
    low: 30,
    nominal: 120,
    high: 300,
    unit: 's',
    reason: 'Strongly dependent on ambient temperature, humidification state, and whether the stack is kept warm.',
    resolvedBy: 'Measure on the selected system at the coldest expected condition.',
  }),
}))

export const ELECTROLYZER = under('electrolyzer', () => ({
  /**
   * System energy per kilogram of hydrogen produced, including drying,
   * purification and compression to cell pressure.
   *
   * The thermodynamic minimum is 39.4 kWh/kg (the HHV). Real PEM systems land
   * at 50 to 55, so system efficiency is about 72 to 79 percent on HHV. This is
   * the good half of the round trip; the fuel cell is the bad half.
   */
  systemEnergyPerKilogram: uncertain({
    low: 50 * 3.6e6,
    nominal: 52 * 3.6e6,
    high: 58 * 3.6e6,
    unit: 'J/kg',
    reason:
      'Spans commercial PEM stacks at the low end and shop-built systems with less optimised balance of plant at the high end. Includes the drying and purification stage, which is a genuine parasitic load and is often quoted separately or not at all.',
    resolvedBy: 'Select or build the electrolyzer and measure kWh per kg at the operating current density.',
    source: 'doe-fuel-cell-records',
  }),

  systemSpecificPower: uncertain({
    low: 300,
    nominal: 450,
    high: 700,
    unit: 'W/kg',
    reason: 'Same reasoning as the fuel cell: system rather than stack, and shop-built rather than automotive.',
    resolvedBy: 'Weigh the selected system.',
  }),
}))

export const PHOTOVOLTAIC = under('photovoltaic', () => ({
  /**
   * Thin-film CIGS module efficiency. Flexible, tolerant of the hull's compound
   * curvature, and available in laminates that can be bonded to a cover.
   */
  cigsEfficiency: measured(0.1446, {
    unit: '1',
    source: 'miasole-flex-03n',
    relativeUncertainty: 0.05,
    note: 'THIS WAS AN UNCERTAIN SPANNING 0.15 TO 0.19 AND ITS OWN resolvedBy SAID "select a specific product and use its datasheet". The product was selected, for its areal mass and for its price, and the efficiency was left at the generic band nominal of 0.17. The result was an array rated at 17 percent in the energy model and bought at 14.46 percent in the bill of materials, and the site reported a peak output of 108 percent of the nameplate of the hardware it was buying, after cosine losses over a doubly curved hull and after the temperature derate. 130 W over 0.899 m2 of module is 144.6 W/m2, which is 14.46 percent at the 1,000 W/m2 rating condition. Correcting it took the worst-day energy margin from 1.62 to 1.23. The loop still closes; it closes by a third less than this project used to claim.',
  }),

  /**
   * The irradiance a module's nameplate rating is quoted at.
   *
   * @source Standard Test Conditions, IEC 61215: 1,000 W/m2, AM1.5G spectrum,
   * 25 C cell temperature. Every W/m2 figure quoted for a module is this
   * irradiance times its efficiency, and mixing a nameplate watt with a real
   * watt is how a solar budget quietly gains a third.
   */
  standardTestIrradiance: measured(1000, {
    unit: 'W/m^2',
    source: 'miasole-flex-03n',
    relativeUncertainty: 0,
    note: 'Exact by definition of the rating condition, not a measurement.',
  }),

  /**
   * Areal mass of the laminated module as installed on the cover.
   *
   * This is the term that decides whether solar is worth carrying at all. A
   * panel that masses more than the lift it enables is a net loss, and on a
   * buoyant vehicle that trade is real in a way it never is on a roof.
   */
  /**
   * RESOLVED, and it was resolved a while ago without this being told.
   *
   * This was uncertain(0.5 / 1.2 / 2.5) with a resolvedBy reading "select a
   * specific flexible module and weigh it". That was done: the design point
   * selected the MiaSole FLEX-03N and recorded 1.9 kg/m2 bare, 2.6 bonded, with
   * the adhesive part number. But the answer was written into designs.ts as a
   * bare literal of 2.6 and this value was left declared, unresolved, and read
   * by NOTHING, so the research queue kept asking for a measurement that
   * existed and the model used a number 4 percent above the top of the range
   * this file documented for the same quantity.
   *
   * The bonded figure is the one to use, because a module that is not attached
   * to the hull is not on the vehicle.
   */
  cigsArealMass: measured(2.6, {
    unit: 'kg/m^2',
    source: 'miasole-flex-03n',
    relativeUncertainty: 0.08,
    note: 'FLEX-03N at 1.9 kg/m2 bare plus the 302-191943-00_B adhesive that attaches it. Sunman eArc is 2.89 for comparison, and everything below 1.9 is a laboratory tandem cell rather than a product. The tolerance covers adhesive coverage and wiring, which are installation choices rather than datasheet figures.',
  }),

  /** Power temperature coefficient. A dark hull in the tropics runs hot. */
  temperatureCoefficient: measured(-0.0035, {
    unit: '1/K',
    source: 'doe-fuel-cell-records',
    relativeUncertainty: 0.2,
    note: 'Fractional power loss per kelvin above the 25 C rating condition. CIGS is better than crystalline silicon here, which matters on a hull that has no way to shed heat from its back face.',
  }),

  annualDegradation: measured(0.006, {
    unit: '1/a',
    source: 'doe-fuel-cell-records',
    relativeUncertainty: 0.3,
    note: 'Compounds over a multi-year mission: 0.6 percent a year is 3 percent over five years, which is small against the other uncertainties but is a one-way loss.',
  }),
}))

export const BATTERY = under('battery', () => ({
  /**
   * Pack-level specific energy, not cell-level. The difference is the case, the
   * bus bars, the management system and the cooling, and it is about 30 percent.
   */
  packSpecificEnergy: uncertain({
    low: 160 * 3600,
    nominal: 200 * 3600,
    high: 250 * 3600,
    unit: 'J/kg',
    reason: 'Chemistry not selected. LFP is at the low end and much safer; NMC is at the high end.',
    resolvedBy:
      'Select a chemistry. For a vehicle nobody can walk away from, the safety case probably outweighs the 25 percent energy penalty, which would put this at the low end.',
  }),

  roundTripEfficiency: measured(0.94, {
    unit: '1',
    source: 'doe-fuel-cell-records',
    relativeUncertainty: 0.03,
    note: 'The contrast that decides the architecture: 94 percent for lithium against about 33 percent for the hydrogen round trip. Diurnal cycling belongs in the battery and nowhere else.',
  }),
}))

/**
 * The two commodity hydrocarbons the air-density blend is made of.
 *
 * They are here rather than in the core module because the blend's specific
 * energy was ASSERTED there as 46.55 MJ/kg, and the mass-weighted average of
 * these two values at the blend's own composition is 47.44. A number that
 * disagrees with the numbers it is supposedly computed from is the failure mode
 * this package exists to prevent, so the ingredients live where they can be
 * cited and the blend is computed from them.
 */
export const HYDROCARBON_FUELS = under('hydrocarbonFuels', () => ({
  propaneLowerHeatingValue: measured(46.35e6, {
    unit: 'J/kg',
    source: 'nist-webbook',
    relativeUncertainty: 5e-3,
    note: 'Net calorific value of C3H8. Quoted between 46.3 and 46.4 depending on reference temperature.',
  }),

  methaneLowerHeatingValue: measured(50.0e6, {
    unit: 'J/kg',
    source: 'nist-webbook',
    relativeUncertainty: 5e-3,
    note: 'Net calorific value of CH4. Pipeline natural gas is lower, around 47 to 48, because it is not pure methane. The blend here is specified as pure components.',
  }),

  propaneMolarMass: measured(44.0956e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 1e-5,
  }),

  methaneMolarMass: measured(16.0425e-3, {
    unit: 'kg/mol',
    source: 'iupac-atomic-weights-2021',
    relativeUncertainty: 1e-5,
  }),

  /**
   * Real-gas compressibility at ISA sea level, which is why "exactly air
   * density" is not exactly true.
   *
   * Propane is a much larger molecule than anything else in this model and it
   * departs from ideal behaviour at ambient conditions by nearly two percent,
   * in the direction that makes the blend DENSER than the ideal-gas
   * calculation says. Matching molar mass to air therefore does not match
   * density to air, and the residual is a real, if small, trim excursion.
   */
  propaneCompressibility: measured(0.9834, {
    unit: '1',
    source: 'nist-webbook',
    relativeUncertainty: 2e-3,
    note: 'Z for C3H8 at 288.15 K and 101.325 kPa. Air is 0.9995 and methane 0.9980 at the same condition, so propane is the term that matters.',
  }),

  methaneCompressibility: measured(0.998, {
    unit: '1',
    source: 'nist-webbook',
    relativeUncertainty: 1e-3,
  }),

  /** Z for dry air at the same condition, so the comparison is like for like. */
  airCompressibility: measured(0.9995, {
    unit: '1',
    source: 'nist-webbook',
    relativeUncertainty: 5e-4,
  }),
}))
