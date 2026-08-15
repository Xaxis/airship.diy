import { measured, under } from '../citation.js'

/**
 * Hydrogen safety, quantified.
 *
 * The brief asks for this to be a first-class engineering module with numeric
 * outputs rather than a page of warnings, and every figure here is paired with
 * the methane equivalent so the difference is visible rather than asserted.
 *
 * THE HONEST SAFETY CASE. Hydrogen is worse than methane on ignition energy by
 * a factor of 17, on flame speed by a factor of 7, on flammable range by a
 * factor of 15 in width, and on detonation cell size by a factor of 22, which is
 * the one that matters most. It is better on exactly one thing: it leaves. The
 * diffusion coefficient is three times methane's and the buoyancy ratio is
 * 14.4 against 1.85, so an unconfined leak clears upward in seconds.
 *
 * That single advantage is the entire safety argument, and it only works if
 * there is nothing to confine the gas. Every design rule below follows from
 * that: eliminate confinement, or accept the rest of the list.
 */

export const HYDROGEN_SAFETY = under('hydrogenSafety', () => ({
  // --- flammability --------------------------------------------------------
  lowerFlammabilityLimit: measured(0.04, {
    unit: '1',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.02,
    note: 'Volume fraction in air. Methane is 0.053, so hydrogen starts burning at a quarter less concentration.',
  }),
  upperFlammabilityLimit: measured(0.75, {
    unit: '1',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.01,
    note: 'The flammable range is 4 to 75 percent, a span of 71 points, against methane 5.3 to 15, a span of 9.7. Seven times wider, which is why "too rich to burn" is not a state hydrogen usefully reaches.',
  }),

  // --- detonation ----------------------------------------------------------
  //
  // THE DETONABILITY LIMITS ARE NOT MATERIAL PROPERTIES. The familiar 18.3 to
  // 59 percent was measured in a 1.4 CM TUBE, and detonability widens with
  // confinement scale because the limit is set by whether the detonation cell
  // fits in the passage. In a 43 cm tube the same mixture detonates from 13.6
  // percent to above 70 percent, and an airship bay is metre-scale.
  //
  // Quoting the tube figures for a metre-scale volume is non-conservative by
  // about five percentage points at the lower end, which matters because the
  // metre-scale lower limit of 13.6 percent sits almost on top of the 12
  // percent deflagration-to-detonation threshold. The two hazards are not as
  // separated as the small-tube numbers suggest.
  lowerDetonabilityLimitSmallTube: measured(0.183, {
    unit: '1',
    source: 'nureg-cr-4961',
    relativeUncertainty: 0.02,
    note: 'A 1.4 cm tube result. Valid only at that scale.',
  }),
  upperDetonabilityLimitSmallTube: measured(0.59, {
    unit: '1',
    source: 'nureg-cr-4961',
    relativeUncertainty: 0.02,
    note: 'A 1.4 cm tube result. Valid only at that scale.',
  }),
  /** Use THESE for any volume larger than a pipe. */
  lowerDetonabilityLimitMetreScale: measured(0.136, {
    unit: '1',
    source: 'nureg-cr-4961',
    relativeUncertainty: 0.1,
    note: '43 cm tube. Widens further with bay dimension, so this is still an upper bound on the true limit for a large volume.',
  }),
  upperDetonabilityLimitMetreScale: measured(0.7, {
    unit: '1',
    source: 'nureg-cr-4961',
    relativeUncertainty: 0.1,
  }),

  /**
   * Detonation cell size at stoichiometric concentration.
   *
   * THE MOST IMPORTANT SINGLE NUMBER IN THIS FILE, and the one methane intuition
   * gets most wrong. 15 mm against methane's 330 mm, a factor of 22.
   *
   * It matters because the critical tube diameter for a confined detonation to
   * survive into an unconfined space is about 13 cell widths. For hydrogen that
   * is 0.195 m. For methane it is 4.3 m.
   */
  detonationCellSize: measured(0.015, {
    unit: 'm',
    source: 'knystautas-1984',
    relativeUncertainty: 0.15,
  }),

  /**
   * Ratio of critical passage size to detonation cell size, for a CIRCULAR
   * tube.
   */
  criticalTubeDiameterRatio: measured(13, {
    unit: '1',
    source: 'knystautas-1984',
    relativeUncertainty: 0.15,
  }),

  /**
   * The same ratio for a SQUARE OR RECTANGULAR passage, which is what a cable
   * trunk, a keel walkway and a ventilation duct actually are.
   *
   * Ten, not thirteen. Using the circular figure for a rectangular duct is
   * non-conservative by 30 percent, and almost every confined run on this
   * vehicle is rectangular.
   */
  criticalRectangularPassageRatio: measured(10, {
    unit: '1',
    source: 'nureg-cr-4961',
    relativeUncertainty: 0.15,
    note: 'Mitrofanov and Soloukhin, confirmed in NUREG/CR-4961 section 3.',
  }),

  /**
   * Energy needed to initiate a detonation DIRECTLY, without a deflagration
   * phase.
   *
   * 4.3 kJ. NOT the 4.16 MJ this file first carried, which was wrong by a
   * factor of about a thousand and was the load-bearing number in the whole
   * detonation safety case.
   *
   * THE CORRECTION REVERSES THE CONCLUSION. At 4.16 MJ the argument was that
   * nothing aboard could deliver that energy into a cloud in microseconds
   * except a lightning strike, so direct detonation was not a credible
   * initiating event and only deflagration-to-detonation transition mattered.
   *
   * At 4.3 kJ that argument collapses. Four kilojoules is not exotic: a modest
   * capacitor bank, a high-energy electrical fault, an arcing contactor on a
   * traction bus, or any pyrotechnic device can reach it. Direct detonation IS
   * a credible initiating event on a vehicle carrying hundreds of kilowatts of
   * DC distribution, and the mitigation is no longer only geometric.
   *
   * What this changes in the design: bus fault energy has to be bounded, not
   * merely interrupted. Arc-fault detection and current-limiting on the DC bus
   * become safety items rather than reliability items, and any stored-energy
   * device near a credible leak path has to be sized against this number.
   */
  directDetonationIgnitionEnergy: measured(4270, {
    unit: 'J',
    source: 'nureg-cr-4961',
    relativeUncertainty: 0.3,
    note: 'At stoichiometric 29.6 vol% in NTP air, unconfined spherical initiation. The 4.16 MJ figure that circulates appears to be a unit slip somewhere upstream and it flatters the safety case by three orders of magnitude.',
  }),

  /** Below this concentration, deflagration cannot transition to detonation. */
  ddtConcentrationThreshold: measured(0.12, {
    unit: '1',
    source: 'sandia-2016',
    relativeUncertainty: 0.15,
    note: 'Three times the lower flammability limit. A leak that stays below 12 percent can burn but cannot detonate, which is why the ventilation target is set an order of magnitude below this.',
  }),

  /** Run-up distance a deflagration needs before it can transition. */
  ddtRunUpDistance: measured(10, {
    unit: 'm',
    source: 'sandia-2016',
    relativeUncertainty: 0.4,
    note: 'A design lever: no confined path longer than this, and DDT has nowhere to develop.',
  }),

  // --- ignition ------------------------------------------------------------
  minimumIgnitionEnergy: measured(1.7e-5, {
    unit: 'J',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.1,
    note: '0.017 mJ, against methane 0.29 mJ. A person walking across a floor carries 10 to 30 mJ, roughly a thousand times more than enough. Assume any ungrounded surface can ignite it.',
  }),

  autoignitionTemperature: measured(858, {
    unit: 'K',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.05,
    note: '585 C, and HIGHER than methane at 540 C. One of the few places hydrogen is the safer gas.',
  }),

  /**
   * Maximum experimental safe gap, and THE NUMBER THAT DISQUALIFIES ORDINARY
   * FLAME ARRESTORS.
   *
   * The brief cites quenching distance for this, which is the wrong quantity.
   * MESG is what the equipment groups are defined on: IEC 60079-20-1 sets Group
   * IIA above 0.9 mm, IIB between 0.5 and 0.9, and IIC below 0.5. Hydrogen at
   * 0.30 mm is Group IIC, methane at 1.16 mm is Group IIA.
   *
   * Essentially every off-the-shelf industrial flame arrestor and flameproof
   * enclosure is IIA or IIB. They do not contain a hydrogen flame. Equipment
   * must be explicitly rated IIC, which is a purchasing constraint and a cost,
   * not a design preference.
   */
  maximumExperimentalSafeGap: measured(3.0e-4, {
    unit: 'm',
    source: 'iec-60079-20-1',
    relativeUncertainty: 0.07,
  }),

  /** The IEC threshold below which a gas is Group IIC. */
  groupIICThreshold: measured(5.0e-4, {
    unit: 'm',
    source: 'iec-60079-20-1',
    relativeUncertainty: 0,
  }),

  quenchingGap: measured(6.4e-4, {
    unit: 'm',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.05,
    note: 'Distinct from MESG and not the basis of equipment grouping. Included because the brief cites it.',
  }),

  // --- combustion ----------------------------------------------------------
  laminarBurningVelocity: measured(2.95, {
    unit: 'm/s',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.11,
    note: 'Against methane 0.41 m/s. Seven times faster, which is what makes deflagration-to-detonation transition in a confined volume the real threat rather than a theoretical one.',
  }),

  detonationVelocity: measured(1815, {
    unit: 'm/s',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.18,
  }),

  flameTemperature: measured(2318, {
    unit: 'K',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.02,
  }),

  /**
   * Below this oxygen fraction no hydrogen-air-nitrogen mixture will burn at
   * all. The quantitative basis for nitrogen inerting the interstitial space.
   */
  limitingOxygenIndex: measured(0.05, {
    unit: '1',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.1,
  }),

  // --- dispersion, the one advantage --------------------------------------
  diffusionCoefficientInAir: measured(6.1e-5, {
    unit: 'm^2/s',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.03,
    note: 'Three times methane. Combined with buoyancy this is the entire safety case for hydrogen.',
  }),

  buoyancyRatioInAir: measured(14.37, {
    unit: '1',
    source: 'sandia-2016',
    relativeUncertainty: 0.02,
    note: 'Air density over hydrogen density at NTP. Methane is 1.80 using the correct 0.668 kg/m3 methane density; the 0.65119 figure that appears in some tables is internally impossible at the stated NTP and inflates the comparison slightly.',
  }),

  buoyantRiseVelocity: measured(5, {
    unit: 'm/s',
    source: 'nasa-nss-1740-16',
    relativeUncertainty: 0.8,
    note: 'Published as a range of 1.2 to 9 m/s, hence the large uncertainty. Even the low end clears a leak from an open structure in seconds.',
  }),

  /**
   * Concentration below which a quiescent cloud will not sustain a fire even
   * though it is nominally above the lower flammability limit.
   *
   * The upward-propagation limit is 4 percent; sustained burning in a quiescent
   * volume needs about 8. A useful distinction for hazard assessment and a
   * dangerous one to rely on, because a ventilated space is still quiescent and
   * any fan or draught invalidates it.
   */
  sustainedFireThreshold: measured(0.08, {
    unit: '1',
    source: 'cashdollar-2000',
    relativeUncertainty: 0.15,
  }),
}))

/**
 * Ventilation design, per IEC 60079-10-1:2020 Edition 3.
 *
 * STATE THE EDITION. Edition 3 replaced Edition 2's formula with a
 * background-concentration method, and many engineers still quote the withdrawn
 * Edition 2 expression. The two do not agree.
 */
export const VENTILATION = under('ventilation', () => ({
  /** Target background concentration: a quarter of the lower flammability limit. */
  dilutionCriterion: measured(0.25, {
    unit: '1',
    source: 'iec-60079-10-1',
    relativeUncertainty: 0,
    note: 'A quarter of LFL, so 1 percent by volume for hydrogen. Note this sits an order of magnitude below the 12 percent DDT threshold, which is deliberate: the ventilation target protects against ignition, and the margin to detonation is the second line.',
  }),

  /**
   * Ventilation inefficiency factor f. Multiplies the required flow.
   *
   * SANDIA'S WARNING APPLIES DIRECTLY: ventilation does not produce mixing.
   * Even at 30 air changes per hour the average air speed in a large space is
   * about 0.02 m/s, which is nowhere near turbulent. A ventilated space is
   * still a quiescent space, and the factor exists because the air the fan
   * moves is not the air near the leak.
   */
  inefficiencyFactor: measured(3, {
    unit: '1',
    source: 'iec-60079-10-1',
    relativeUncertainty: 0.67,
    note: 'f = 1 for essentially uniform mixing, rising to 5 for poor air distribution. A 90 m interstitial space with a slow leak somewhere in it is not uniformly mixed.',
  }),
}))
