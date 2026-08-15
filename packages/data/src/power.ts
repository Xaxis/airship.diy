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
  cigsEfficiency: uncertain({
    low: 0.15,
    nominal: 0.17,
    high: 0.19,
    unit: '1',
    reason: 'Commercial flexible CIGS spans this band. Record cells do better and are not purchasable in area.',
    resolvedBy: 'Select a specific product and use its datasheet.',
  }),

  /**
   * Areal mass of the laminated module as installed on the cover.
   *
   * This is the term that decides whether solar is worth carrying at all. A
   * panel that masses more than the lift it enables is a net loss, and on a
   * buoyant vehicle that trade is real in a way it never is on a roof.
   */
  cigsArealMass: uncertain({
    low: 0.5,
    nominal: 1.2,
    high: 2.5,
    unit: 'kg/m^2',
    reason:
      'Depends entirely on encapsulation. A bare cell on a thin polymer backing is at the low end; anything with a glass or thick fluoropolymer front sheet is at the high end and probably not viable here.',
    resolvedBy:
      'Select a specific flexible module and weigh it, including adhesive and wiring. This is a purchasing decision, not a research problem.',
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
