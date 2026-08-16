import { measured, uncertain, under } from './citation.js'

/**
 * Crew, life support, and consumables.
 *
 * ONE THING THIS IS NOT: a spacecraft life support model. The brief is explicit
 * and correct that CO2 is not a problem here. The vehicle is immersed in
 * breathable air and the habitat is ventilated with it, so there is no
 * scrubbing, no partial pressure management, and no oxygen budget. Importing
 * spacecraft closed-loop assumptions would add mass and complexity to solve a
 * problem that does not exist.
 *
 * What DOES bind is water, food, and the fact that nothing can be resupplied.
 */

export const CREW = under('crew', () => ({
  /**
   * Metabolic energy per person per day.
   *
   * The upper end assumes real physical work: rigging, maintenance, handling
   * the drogue. A sedentary figure would understate food mass on a vehicle
   * where the crew are also the maintenance department.
   */
  metabolicEnergy: uncertain({
    low: 2500 * 4184,
    nominal: 3000 * 4184,
    high: 3500 * 4184,
    unit: 'J/day',
    reason:
      'Depends on body mass, ambient temperature and how much physical work the mission actually demands. A crew that spends a week rebuilding an engine is at the top of the band.',
    resolvedBy: 'Not resolvable in advance. Size food against the high end and treat the surplus as margin.',
    source: 'nasa-bvad',
  }),

  /** Drinking water, strictly metabolic. */
  drinkingWater: measured(3.0, {
    unit: 'kg/day',
    source: 'nasa-bvad',
    relativeUncertainty: 0.25,
    note: 'Per person. Rises sharply in a hot cabin, and the tropics are the design station.',
  }),

  /** Total potable demand: drinking, food preparation, and hydration of dry stores. */
  potableWater: measured(6.0, {
    unit: 'kg/day',
    source: 'nasa-bvad',
    relativeUncertainty: 0.3,
  }),

  /**
   * Hygiene water, which dwarfs everything else and is the term that actually
   * decides whether the water loop closes.
   */
  hygieneWater: uncertain({
    low: 12,
    nominal: 25,
    high: 60,
    unit: 'kg/day',
    reason:
      'Entirely a behavioural and equipment choice. A submarine crew manages on 12; a household figure is over 100. The range spans a factor of five and it is the largest single lever on the water budget.',
    resolvedBy:
      'A decision, not a measurement. Choose the washing equipment and the standard of living, then this number follows.',
    source: 'nasa-bvad',
  }),

  /**
   * Dry food mass per person per day.
   *
   * Dry mass, because the water is added from the ship's own supply and would
   * otherwise be double counted. This is the single largest non-renewable
   * consumable aboard, and it is why the endurance question is ultimately a
   * food question rather than an energy one.
   */
  dryFoodMass: measured(0.62, {
    unit: 'kg/day',
    source: 'nasa-bvad',
    relativeUncertainty: 0.15,
    note: 'Dehydrated and shelf-stable. Includes packaging, which is 15 to 25 percent of the total and is often left out of quick estimates.',
  }),

  /**
   * Fraction of consumed water recoverable from greywater and humidity
   * condensate.
   *
   * Greywater recycling is straightforward and high-yield; blackwater is not
   * attempted, which is why this is well short of unity.
   */
  waterRecoveryFraction: uncertain({
    low: 0.7,
    nominal: 0.85,
    high: 0.93,
    unit: '1',
    reason:
      'Depends on the treatment train and on whether blackwater is processed. Spacecraft systems reach into the nineties with equipment nobody maintains in flight without a laboratory.',
    resolvedBy: 'Select the treatment equipment and measure its recovery on a bench.',
    source: 'nasa-bvad',
  }),

  /** Metabolic heat, which is a real term in the cabin thermal budget. */
  metabolicHeat: measured(120, {
    unit: 'W',
    source: 'nasa-bvad',
    relativeUncertainty: 0.3,
    note: 'Per person, averaged over a day including sleep. Two people are a 240 W heater that never switches off.',
  }),
}))

/**
 * Food shelf life, which is what turns a mass budget into a duration limit.
 *
 * THE TERM THAT DECIDES THE STRETCH GOAL. A 365-day mission is a storage
 * problem; a five-year mission is a shelf-life problem, and no amount of tank
 * volume fixes it. Freeze-dried stores nominally keep for decades but lose
 * vitamin content long before they lose calories, so the binding constraint is
 * nutritional rather than caloric.
 */
export const FOOD_SHELF_LIFE = under('food', () => ({
  freezeDried: uncertain({
    low: 5,
    nominal: 15,
    high: 25,
    unit: 'a',
    reason:
      'Calorie stability and nutritional stability diverge. Manufacturers quote the former. Vitamin C and thiamine degrade in a few years at room temperature and faster in a hot hull.',
    resolvedBy:
      'Assay a stored sample at intervals, or design around supplementation rather than around whole-food storage.',
  }),

  retortPouch: uncertain({
    low: 2,
    nominal: 4,
    high: 7,
    unit: 'a',
    reason: 'Wet stores are heavier and shorter-lived but need no water to prepare.',
    resolvedBy: 'Manufacturer data for the specific products chosen.',
  }),

  /**
   * Hydroponics, evaluated honestly rather than assumed.
   *
   * For two people under about two years it is a MASS LOSS: the grow lights,
   * pumps, media, nutrients and structure outweigh the food produced, and the
   * power draw competes directly with propulsion. It becomes interesting only
   * on the five-year mission, and even then mostly for the nutritional terms
   * that storage cannot hold rather than for calories.
   */
  hydroponicsBreakEvenDuration: uncertain({
    low: 2,
    nominal: 3.5,
    high: 6,
    unit: 'a',
    reason:
      'Depends heavily on lighting efficiency and on whether the system produces staples or only fresh greens. Published closed-system figures assume spacecraft-grade equipment and continuous specialist attention.',
    resolvedBy:
      'Size a specific system against the actual power budget. The answer is probably "grow greens for the vitamins, store the calories".',
  }),
}))

/**
 * Rain catchment, the term that makes the water loop close in the tropics.
 *
 * A 90 m hull presents an enormous catchment area, and the design station is
 * the trade wind belt where showers are frequent. This is the largest and least
 * appreciated water source on the vehicle.
 */
export const CATCHMENT = under('catchment', () => ({
  /**
   * Fraction of rain falling on the hull that reaches a tank.
   *
   * Well short of unity: the hull is curved and mostly not pointed at the sky,
   * runoff has to be channelled somewhere, and the first flush is discarded
   * because it carries whatever was on the cover.
   */
  collectionEfficiency: uncertain({
    low: 0.2,
    nominal: 0.4,
    high: 0.6,
    unit: '1',
    reason:
      'Nobody has built a rain catchment system on an airship. The efficiency depends entirely on how the cover is channelled and how much of the upper surface drains to a gutter rather than off the side.',
    resolvedBy:
      'A design decision followed by a test on a section of cover. Cheap to establish and it swings the water balance by a factor of three.',
  }),

  /**
   * Annual rainfall in the trade wind belt at the design station.
   *
   * Deliberately taken low. The ITCZ is far wetter and the subtropical highs
   * far drier, and a vehicle that stations itself for solar is not stationing
   * itself for rain.
   */
  tradeWindBeltAnnualRainfall: uncertain({
    low: 0.5,
    nominal: 1.0,
    high: 2.0,
    unit: 'm/a',
    reason:
      'Varies enormously across the band and with season. The low end is the eastern subtropical ocean, the high end approaches the ITCZ.',
    resolvedBy:
      'Reanalysis precipitation data for the specific station, which the mission module will ingest in phase 5.',
  }),
}))


/**
 * What a space somebody lives in for a year has to provide.
 *
 * THE FIGURES COME FROM TWO WORLDS AND BOTH ARE NEEDED. NASA's HIDH answers
 * volume, because spacecraft are where volume is the scarcest thing there is and
 * where the consequences of getting it wrong have been measured. IMO answers
 * headroom, cabin area and noise, because those are written for a vessel
 * somebody lives on and they are enforced.
 *
 * The two disagree about what is scarce, and that is useful: an airship has
 * volume and lacks LIFT, which is the opposite of a spacecraft and the opposite
 * of a ship. So the volume figures are a floor rather than a target, and the
 * ones that bind here are the ones about mass and about the quality of the space
 * rather than its size.
 */
export const HABITABILITY = under('habitability', () => ({
  /**
   * Net habitable volume per crew member for a long mission, m3.
   *
   * NOT pressurised volume: NHV is what is left after equipment, stowage and
   * passageways, which on a real vehicle is roughly half.
   */
  netHabitableVolumePerCrew: measured(43, {
    unit: 'm^3',
    source: 'nasa-hidh',
    relativeUncertainty: 0.2,
    note: 'Scaled to a crew of two from the handbook curve, which gives 115.83 m3 total for four. Per-head volume rises as the crew shrinks, because the fixed spaces do not divide. ISS runs 64.7 m3 per crew and Celentano\'s asymptote is 19, so this sits between a tolerable minimum and a comfortable one.',
  }),

  /** Clear headroom below which a tall person stoops, m. */
  minimumHeadroom: measured(2.03, {
    unit: 'm',
    source: 'imo-a1047',
    relativeUncertainty: 0,
    note: 'The MLC minimum for accommodation spaces, and it is a floor rather than a recommendation: 1.9 m is what a boat gets away with for a fortnight and what a year will not forgive.',
  }),

  /** Headroom this design targets, m. */
  targetHeadroom: measured(2.1, {
    unit: 'm',
    source: 'imo-a1047',
    relativeUncertainty: 0,
    note: 'Above the minimum by enough that a deckhead fitting does not put a space back under it.',
  }),

  /** Floor area of a single-berth cabin, m2. */
  singleBerthArea: measured(4.5, {
    unit: 'm^2',
    source: 'imo-a1047',
    relativeUncertainty: 0.1,
  }),

  /** Mess room floor area per seat, m2. */
  messAreaPerSeat: measured(1.5, {
    unit: 'm^2',
    source: 'imo-a1047',
    relativeUncertainty: 0.1,
  }),

  /** Noise limit in a sleeping space, dB(A). */
  sleepNoiseLimit: measured(49, {
    unit: 'dB(A)',
    source: 'nasa-stw-lighting',
    relativeUncertainty: 0,
    note: 'IMO allows 60 in a cabin, which is a limit written for a watch system rather than for a year. 49 is the figure that does not cost sleep, and sleep is the thing a long mission loses first.',
  }),

  /** Vibration limit in a sleeping space, m/s2 RMS. */
  sleepVibrationLimit: measured(0.1, {
    unit: 'm/s^2',
    source: 'imo-a1047',
    relativeUncertainty: 0,
    note: 'Which is what puts the propulsor mounts on isolators with a natural frequency near 8 Hz, well below the blade passing frequency.',
  }),

  /** General ambient illuminance, lux. */
  ambientIlluminance: measured(350, {
    unit: 'lx',
    source: 'nasa-stw-lighting',
    relativeUncertainty: 0.15,
  }),

  /** Melanopic equivalent daylight illuminance needed to hold the circadian phase, lux. */
  wakeMelanopicEdi: measured(250, {
    unit: 'lx',
    source: 'nasa-stw-lighting',
    relativeUncertainty: 0.2,
    note: 'THE FIGURE A YEAR TURNS ON. Ordinary interior lighting delivers a fraction of this at the eye, and a crew that drifts out of phase loses sleep, then performance, then judgement. Below 8 melanopic lux before sleep, and effectively dark in the berth.',
  }),

  /** Functional volume an exercise device needs, m3. */
  exerciseVolume: measured(13.42, {
    unit: 'm^3',
    source: 'nasa-hidh',
    relativeUncertainty: 0.15,
    note: 'The swept space, not the machine. On a vehicle where the crew are also the maintenance department the activity level is higher than a spacecraft\'s, but a year of low activity still costs bone and muscle and the equipment is the cheapest insurance aboard.',
  }),

  /** Mass of a resistive exercise device suitable for a small vehicle, kg. */
  exerciseDeviceMass: measured(54, {
    unit: 'kg',
    source: 'nasa-hidh',
    relativeUncertainty: 0.3,
    note: 'The Mars transit target, against 544 kg for the ISS ARED. The heavy one is not carryable here and the light one is what the design assumes.',
  }),

  /** Food as shipped, packaged, per person per day, kg. */
  foodMassPerPersonDay: measured(2.1, {
    unit: 'kg',
    source: 'nasa-bvad',
    relativeUncertainty: 0.15,
    note: 'Midpoint of 1.83 to 2.39 for packaged provisions. Bulk staples are 0.8 kg of dry mass and less than half the shipped mass, at the cost of three more hours of galley time a day, which is a real trade on a two-person vehicle.',
  }),

  /** Specific volume of bulk dry staples, m3/kg. */
  bulkStapleSpecificVolume: measured(0.00133, {
    unit: 'm^3/kg',
    source: 'nasa-bvad',
    relativeUncertainty: 0.15,
  }),

  /** Total water per person per day at a mature recycling standard, kg. */
  waterPerPersonDay: measured(9.12, {
    unit: 'kg',
    source: 'nasa-bvad',
    relativeUncertainty: 0.15,
    note: 'Drinking 2.5, hygiene and shower 7.7, dishes 3.54, laundry 1.1, before recycling. Hygiene dominates and it is the term that is a behavioural choice rather than a physical need.',
  }),

  /** Crop area for a full diet, m2 per person. */
  fullDietCropArea: measured(65.29, {
    unit: 'm^2',
    source: 'nasa-bvad',
    relativeUncertainty: 0.2,
    note: 'AT 2.6 kW PER SQUARE METRE OF GROWING AREA. Two people would need 170 kW of lighting against 31 kW of annual-average solar, so growing the diet is not a close call. Salad alone is 1.35 m2 per person and 375 W, which is affordable and is a morale item rather than a food one.',
  }),

  /** Crop area for salad greens only, m2 per person. */
  saladCropArea: measured(1.35, {
    unit: 'm^2',
    source: 'nasa-bvad',
    relativeUncertainty: 0.2,
  }),

  /** Electrical power a growing area needs, W/m2. */
  cropLightingPower: measured(2600, {
    unit: 'W/m^2',
    source: 'nasa-bvad',
    relativeUncertainty: 0.2,
  }),
}))
