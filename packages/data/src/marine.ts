import { measured, uncertain, under } from './citation.js'

/**
 * Water, and the constants marine operation needs.
 *
 * The requirement is that the craft lands on water and works as a boat. The
 * surprise, once the numbers are run, is which part of that is hard. Flotation
 * is trivial: a 15 t vehicle displaces 15 m3 of seawater, against an envelope
 * of 15,800 m3. The hard parts are windage, corrosion, and slamming.
 */

export const WATER = under('water', () => ({
  /** Standard seawater, 35 practical salinity units at 15 C. */
  seawaterDensity: measured(1025, {
    unit: 'kg/m^3',
    source: 'nist-webbook',
    relativeUncertainty: 0.002,
    note: 'Varies about 1020 to 1029 across the open ocean with temperature and salinity. The variation is small against the uncertainty in what the vehicle actually weighs.',
  }),

  freshwaterDensity: measured(998.2, {
    unit: 'kg/m^3',
    source: 'nist-webbook',
    relativeUncertainty: 1e-4,
    note: 'At 20 C. A vehicle trimmed for seawater sits about 2.6 percent deeper in fresh water, which matters for a lake landing and not much else.',
  }),

  seawaterKinematicViscosity: measured(1.19e-6, {
    unit: 'm^2/s',
    source: 'nist-webbook',
    relativeUncertainty: 0.05,
    note: 'At 15 C. Sets the Reynolds number for hull friction when hull-borne.',
  }),
}))

/**
 * Cross-flow drag of the hull, which is what makes windage the dominant marine
 * problem.
 *
 * A 90 m hull lying on the water presents its whole flank to the wind. The
 * relevant coefficient is not the streamwise volumetric drag coefficient of
 * 0.035 that the flight case uses; it is the cross-flow drag of a bluff
 * cylinder, referenced to the projected lateral AREA, and it is more than an
 * order of magnitude larger.
 */
export const WINDAGE = under('windage', () => ({
  crossFlowDragCoefficient: uncertain({
    low: 0.4,
    nominal: 0.6,
    high: 0.9,
    unit: '1',
    reason:
      'A circular cylinder in cross-flow sits near 1.2 below the drag crisis and drops to 0.3 to 0.4 above it, and a 18 m diameter hull in a 10 m/s wind is at Reynolds around 1.2e7, well into the supercritical range where the coefficient is sensitive to surface roughness. A finite body of revolution with fins also has strong end effects that a two-dimensional cylinder figure does not capture.',
    resolvedBy:
      'The NACA and NASA airship reports contain measured cross-flow force on airship hulls at large sideslip. Failing that, CFD on the frozen hull, or a tow test.',
    source: 'khoury-airship-technology',
  }),

  /**
   * Drag coefficient of a parachute-type sea anchor, referenced to its mouth
   * area. This is the number that decides whether the vehicle can be held
   * bow-on to the weather rather than driven sideways.
   */
  seaAnchorDragCoefficient: uncertain({
    low: 1.2,
    nominal: 1.4,
    high: 1.6,
    unit: '1',
    reason:
      'Parachute-type sea anchors are quoted between about 1.2 and 1.6 depending on canopy porosity and whether the rode is snubbed. Manufacturer figures are marketing rather than measurement.',
    resolvedBy: 'Tow test of the selected anchor, or a published naval architecture measurement.',
  }),
}))

/**
 * Galvanic corrosion of carbon fibre against metals in seawater.
 *
 * CFRP is strongly CATHODIC. It sits near graphite on the galvanic series, which
 * is the noble end, so any less noble metal fastened to it in seawater becomes
 * the anode of a very effective cell and corrodes fast. Aluminium against carbon
 * is the worst common pairing and it fails in weeks, not years.
 *
 * This is a design rule rather than a number to optimise: no aluminium touches
 * carbon anywhere that can get wet, and every metal fitting gets an insulating
 * barrier ply.
 */
export const GALVANIC = under('galvanic', () => ({
  /**
   * Potential difference driving the couple, volts, against a silver/silver
   * chloride reference in seawater. Carbon sits at roughly +0.25 V and aluminium
   * alloys at roughly -0.75 to -1.0 V.
   */
  carbonAluminiumPotential: uncertain({
    low: 0.9,
    nominal: 1.05,
    high: 1.25,
    unit: 'V',
    reason:
      'Depends on the aluminium alloy, its temper, and the oxygen concentration at the surface. The galvanic series in seawater is tabulated as ranges rather than points for exactly this reason.',
    resolvedBy:
      'ASTM G82 galvanic series for seawater, plus a coupled-specimen test with the specific alloy and laminate chosen.',
  }),

  /**
   * Minimum thickness of insulating glass ply between a carbon laminate and any
   * metal fitting.
   */
  glassBarrierThickness: uncertain({
    low: 0.25e-3,
    nominal: 0.5e-3,
    high: 1.0e-3,
    unit: 'm',
    reason:
      'Marine and aerospace practice both specify a glass barrier but quote thickness as a number of plies rather than in millimetres, and ply thickness varies with the cloth. Two plies of 200 gsm glass is the common recommendation.',
    resolvedBy:
      'Fix the cloth areal weight and the layup, then measure a cured coupon. A conservative build simply uses more plies: the mass penalty is negligible and the failure mode is not.',
  }),
}))

/**
 * Sea states, for the design envelope.
 *
 * The question the marine module has to answer is which of these the vehicle
 * can sit in, and above which it has to fly instead.
 */
export const SEA_STATE: ReadonlyArray<{
  code: number
  description: string
  significantWaveHeight: number
  meanPeriod: number
}> = [
  { code: 1, description: 'calm rippled', significantWaveHeight: 0.05, meanPeriod: 2.0 },
  { code: 2, description: 'smooth', significantWaveHeight: 0.3, meanPeriod: 3.5 },
  { code: 3, description: 'slight', significantWaveHeight: 0.875, meanPeriod: 4.5 },
  { code: 4, description: 'moderate', significantWaveHeight: 1.875, meanPeriod: 6.5 },
  { code: 5, description: 'rough', significantWaveHeight: 3.25, meanPeriod: 8.5 },
  { code: 6, description: 'very rough', significantWaveHeight: 5.0, meanPeriod: 10.0 },
] as const
