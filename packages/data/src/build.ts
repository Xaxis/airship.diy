import { measured, uncertain, under } from './citation.js'

/**
 * What the thing costs, what it takes to build, and where you would build it.
 *
 * Every other module in this repository answers a question about the vehicle.
 * This one answers a question about the person: whether one or two people can
 * put it together, and what stands between them and it.
 *
 * THE UNITS HERE ARE MONEY AND HOURS, which is why the numbers live in the data
 * package alongside the other non-SI values. A price is a measurement with a
 * date on it and it decays faster than any physical constant in this repository.
 * Everything below was quoted in August 2026 and should be re-read, not trusted,
 * a year from now.
 *
 * THE TRAP THIS EXISTS TO AVOID is the bill of materials that sums the parts and
 * calls it the cost of the project. The parts are not the cost of the project.
 * The building you assemble them in is six times the parts, and the labour is
 * larger than either if you value it at anything at all.
 */

/**
 * Materials, per kilogram or per unit, at prices an individual can actually be
 * charged. Wholesale is not available to one person and quoting it would flatter
 * the answer by a factor of about seven on the largest line.
 */
export const MATERIAL_PRICES = under('build.materials', () => ({
  /**
   * Retail woven carbon fabric. This is the number an individual pays, and it
   * is seven times the commodity tow index below, entirely in weaving,
   * converting, warehousing and the fact that nobody sells 4 tonnes of fabric
   * to a person with a garage.
   */
  carbonFabricRetail: measured(115.7, {
    unit: 'USD/kg',
    source: 'fibre-glast-catalogue',
    relativeUncertainty: 0.35,
    note: 'Rock West Composites 12K 2x2 twill, 670 gsm, 50 in wide, $89.99 per linear yard, August 2026. Buying full 100-yard rolls of lighter 3K twill drops it to about $89/kg, and Fibre Glast retail on small cuts runs to $245/kg. The spread is the ordering strategy, not the material.',
  }),
  /** The same fibre as a commodity, which an individual cannot buy. */
  carbonTowCommodity: measured(34.9, {
    unit: 'USD/kg',
    source: 'imarc-carbon-fibre-2025',
    relativeUncertainty: 0.2,
    note: 'December 2025 index. Present only to show the retail multiple. No amateur build gets this price.',
  }),
  /**
   * Bought pultruded or roll-wrapped tube. THE FINDING OF THE WHOLE COST STUDY
   * is that this is barely more per kilogram than the fabric you would use to
   * make it, and it arrives straight, hot-cured, and with none of the bagging
   * consumables, oven, or labour attached.
   */
  pultrudedTube: measured(262, {
    unit: 'USD/kg',
    source: 'dragonplate-pultruded',
    relativeUncertainty: 0.3,
    note: 'DragonPlate FDPT.240x.150x48 at $8.80, August 2026. Small sections carry the worst price per kilogram; larger sections are cheaper. The comparison that matters is against retail fabric at $115 to $245/kg PLUS resin, consumables, tooling and 1 m2 per hour of labour.',
  }),
  /** Modulus of that bought tube, for the trade against laying it up. */
  pultrudedTubeModulus: measured(103e9, {
    unit: 'Pa',
    source: 'gurit-guide-to-composites',
    relativeUncertainty: 0.1,
    note: 'Standard-modulus unidirectional carbon/epoxy at production fibre volume fraction. Compare 61 GPa for the woven wet layup this repository models, which is the other half of the argument for buying tube.',
  }),
  /**
   * Laminating epoxy in bulk. US retail on gallon kits is $90/kg and EU hobby
   * pricing on 2.8 kg kits is $40/kg, so anything in between is a guess about
   * volume discount rather than a quotation.
   */
  epoxy: uncertain({
    low: 40,
    nominal: 60,
    high: 90,
    unit: 'USD/kg',
    reason:
      'US retail (Aircraft Spruce, MGS LR285 with H285 hardener, $89.80/kg mixed) and EU hobby pricing (Hoellein, EPIKOTE LR285, $40.10/kg mixed) differ by more than a factor of two on the same resin system. Neither is a 3 tonne quotation.',
    resolvedBy:
      'A quotation for 3,000 kg of an aerospace laminating epoxy in drums, which is the quantity this build needs and a quantity no listed price covers.',
    source: 'proset-lam125',
  }),
  /** Vacuum bagging film, peel ply, breather, tape and tubing, per square metre bagged. */
  baggingConsumables: measured(16, {
    unit: 'USD/m2',
    source: 'fibre-glast-catalogue',
    relativeUncertainty: 0.3,
    note: 'Film from $0.67/m2, peel ply about $8/m2 and breather about $7/m2, plus sealant tape and tubing, rounded up. Single use: every square metre bagged is a square metre thrown away.',
  }),
  /**
   * Outer cover fabric. The only published airship-specific price found, and it
   * comes from a builder rather than a mill.
   */
  coverFabric: measured(40, {
    unit: 'USD/m2',
    source: 'khoury-airship-technology',
    relativeUncertainty: 0.4,
    note: 'Da Vinci (Costa Rica) design pages: a 60 m airship envelope uses near 2,000 m2 of external fabric at under $40 per m2. A builder\'s figure, not a mill quotation, and the closest thing to a published airship cover price that exists.',
  }),
  /**
   * Gas cell barrier laminate. THERE IS NO PUBLISHED PRICE. The figure used is
   * a Dyneema composite sailcloth of similar areal mass, which is a proxy for
   * the manufacturing difficulty and not for the material.
   */
  gasCellLaminate: uncertain({
    low: 20,
    nominal: 45,
    high: 120,
    unit: 'USD/m2',
    reason:
      'No supplier publishes a price for a 0.21 kg/m2 para-aramid plus metallised-PET airship cell laminate at 15,000 m2. The nominal is Ripstop by the Roll\'s 1.43 oz Dyneema composite fabric at $45.05/m2, matched on areal mass rather than on function.',
    resolvedBy:
      'A quotation from a barrier film converter for 15,000 m2 of the selected laminate. This is the single largest line in the bill of materials and it is the one with no price.',
  }),
  /** Flexible photovoltaic module, per watt of rated output. */
  photovoltaic: measured(0.99, {
    unit: 'USD/W',
    source: 'miasole-flex-03n',
    relativeUncertainty: 0.25,
    note: 'MiaSole thin film at retail, August 2026. Sunman eArc glass-free modules are $1.72/W and 2.89 kg/m2, heavier and dearer, so the light module is also the cheap one here.',
  }),
  /** PEM fuel cell stack and balance of plant, per kilowatt. */
  fuelCell: measured(5300, {
    unit: 'USD/kW',
    source: 'doe-fuel-cell-records',
    relativeUncertainty: 0.2,
    note: 'Fuel Cell Store retail, August 2026: Horizon 2 kW at $5,211/kW and a 5 kW unit at $5,395/kW. Automotive stacks at volume are two orders of magnitude below this and are not for sale to individuals.',
  }),
  /** PEM electrolyzer, installed, per kilowatt. */
  electrolyzer: measured(2225, {
    unit: 'USD/kW',
    source: 'iea-electrolysers-2025',
    relativeUncertainty: 0.25,
    note: 'IEA 2025 installed system cost, USD 2,000 to 2,450/kWe, midpoint. Utility scale. A 40 kW unit will cost more per kilowatt than this and the model adds a small-scale premium explicitly.',
  }),
  /** Lithium iron phosphate storage, retail, per kilowatt hour. */
  battery: measured(230, {
    unit: 'USD/kWh',
    source: 'bnef-battery-survey-2025',
    relativeUncertainty: 0.2,
    note: 'Signature Solar EG4 WallMount 14.3 kWh at $3,290, 2025. The BloombergNEF global average pack price the same year was $108/kWh, less than half, and it is a price no individual is offered.',
  }),
  /** Hydrogen, delivered by tube trailer to a site that is not a filling station. */
  hydrogenDelivered: uncertain({
    low: 4,
    nominal: 13,
    high: 25,
    unit: 'USD/kg',
    reason:
      'Merchant hydrogen is about $1.09/kg at the plant and delivery by gaseous tube trailer adds $9.46/kg in 2016 dollars, which is $13/kg escalated. Retail station prices in California exceed $30/kg. What a one-off 2.4 tonne delivery to a rural site costs is not published.',
    resolvedBy: 'A delivered quotation from an industrial gas supplier for a single 2.4 tonne fill.',
    source: 'doe-h2-delivery-record',
  }),
  /**
   * Helium, for the comparison the project must keep making. Priced per cubic
   * metre because that is how it is sold and because the point is the volume.
   */
  heliumPerCubicMetre: uncertain({
    low: 14,
    nominal: 28,
    high: 35,
    unit: 'USD/m3',
    reason:
      'USGS Grade-A pricing has run near $14/m3, and 2025 bulk quotes from commercial suppliers run $28 to $35/m3 with spot quotes far above that. Helium pricing has been in shortage-driven disorder since 2018.',
    resolvedBy: 'A bulk quotation for 33,000 m3, which is roughly a full ISO container load.',
    source: 'usgs-helium',
  }),
}))

/**
 * The building.
 *
 * A rigid airship is assembled indoors and cannot be assembled anywhere else.
 * The frame is a lattice with no skin on it for most of the build and it will
 * not survive weather, and the finished hull is a 2,300 m2 sail that two people
 * cannot hold in a breeze. The shed is not a convenience.
 */
export const FACILITY = under('build.facility', () => ({
  /**
   * Clear internal length as a multiple of hull length. Cardington Shed No.1 at
   * 247.5 m housed R101 at 222.8 m, and the Goodyear hangar specified for NASA
   * was 425 ft for a 380 ft ship.
   */
  lengthMargin: measured(1.13, {
    unit: '1',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.05,
    note: 'Two independent anchors agree: Cardington No.1 over R101 is 1.111, and the Goodyear specification is 425 ft clear for a 380 ft ship, 1.118. Rounded up slightly because both of those were tight and both had doors that opened outward.',
  }),
  /** Clear internal width as a multiple of hull diameter. */
  widthMargin: measured(2.0, {
    unit: '1',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.1,
    note: 'Goodyear specified 150 ft clear for a ship of about 75 ft diameter. Cardington No.1 is 54.9 m for R101\'s 40 m. The margin is not generosity: it is the room to walk both sides with staging up and to swing a ship that is being warped in on lines.',
  }),
  /** Clear internal height as a multiple of overall vehicle height. */
  heightMargin: measured(1.2, {
    unit: '1',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.1,
    note: 'Goodyear specified 128 ft clear. The constraint is the fin span plus the gondola plus the handling gear above the hull, not the hull diameter.',
  }),
  /**
   * A rigid steel-framed hangar, escalated from the only costed airship hangar
   * in the open literature.
   */
  rigidHangarCost1981: measured(6.1e6, {
    unit: 'USD1981',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.15,
    note: 'Table 7-8, quoted to NASA by ASF Building Systems of Houston, who built the Goodyear hangar there. For a 425 by 150 by 128 ft building.',
  }),
  /** The same table's figure for the complete base, which is the honest number. */
  completeBaseCost1981: measured(8.053e6, {
    unit: 'USD1981',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.15,
    note: 'Hangar plus mooring mast, tractor, two mules, ballast and fuel systems, and the mooring circle. A hangar without these does not let you operate; it lets you build and then be stuck indoors.',
  }),
  /** An air-supported fabric shed, the cheap alternative, same table. */
  airSupportedCost1981: measured(1.6e6, {
    unit: 'USD1981',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.2,
    note: 'An ESI quotation at $6/ft2 for 255,000 ft2, plus $325,000 for the foundation pad. A quarter the price of steel and it depends on a blower running continuously, which makes the building itself a single point of failure over a multi-year build.',
  }),
  /** Bringing 1981 dollars to now. */
  escalation1981: measured(3.6735, {
    unit: '1',
    source: 'bls-cpi-u',
    relativeUncertainty: 0.02,
    note: 'CPI-U 90.9 in 1981 against 333.918 in July 2026. Construction cost inflation has outrun CPI over this period, so treat every escalated figure here as a floor.',
  }),
  /** Design lateral wind pressure on the shed walls. */
  lateralWindPressure: measured(1436, {
    unit: 'Pa',
    source: 'nasa-n76-15042',
    relativeUncertainty: 0.1,
    note: '30 lb/ft2 on the sides, the 1926 Air Ministry airship base standard. On a 130 by 39 m wall that is over 7 MN, which is why airship sheds are the size of cathedrals and cost like them.',
  }),
}))

/**
 * Handling it once it exists.
 *
 * This is the section that decides whether two people can operate the vehicle
 * they have built, and the answer is arithmetic rather than opinion.
 */
export const GROUND_HANDLING = under('build.groundHandling', () => ({
  /** What one person can hold on a line, sustained, without a winch. */
  personLinePull: uncertain({
    low: 250,
    nominal: 400,
    high: 600,
    unit: 'N',
    reason:
      'A working figure. A fit adult can pull perhaps 600 N briefly and hold 250 to 400 N for minutes. Ground handling lines are held for as long as the manoeuvre takes, which can be half an hour.',
    resolvedBy:
      'A ground handling trial with the actual ship, which is also the only way to calibrate the drag coefficient it multiplies.',
  }),
  /** Broadside drag coefficient of a hull on the ground, on side-projected area. */
  broadsideDragCoefficient: measured(0.6, {
    unit: '1',
    source: 'naca-tr-432',
    relativeUncertainty: 0.2,
    note: 'Supercritical crossflow over a circular cylinder, which is what a hull is when the wind is on the beam. At 23 m diameter and 20 m/s the Reynolds number is 3e7, well past the drag crisis.',
  }),
  /** The wind above which the US Navy would not dock or undock a ZPG-3W. */
  navyDockingLimit: measured(6.3, {
    unit: 'm/s',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.05,
    note: '14 mph, condition 3, US Navy Airship Ground Handling Instructions, 1 November 1958 revised 15 January 1961. With a mobile mast, mules, and eighteen trained people.',
  }),
  /** The wind that ship could ride out once dogged to a mast. */
  navyMastDoggedLimit: measured(34.9, {
    unit: 'm/s',
    source: 'nasa-cr-166258',
    relativeUncertainty: 0.05,
    note: '78 mph, condition 1A, ZPG-3W on a Type V mast. THE SPREAD BETWEEN THIS AND THE DOCKING LIMIT IS A FACTOR OF 5.5, and it is the entire argument for a mast: the ship is safe in a gale and helpless in a breeze.',
  }),
  /** Landing party for the last US Navy patrol airship. */
  zpg3wLandingCrew: measured(18, {
    unit: 'people',
    source: 'nasa-n76-15042',
    relativeUncertainty: 0,
    note: 'With a mobile mooring mast and two mechanical mules. Without the machinery the same ship needed several hundred.',
  }),
  /** What handling a rigid took before the machinery existed. */
  lz8GroundCrew: measured(300, {
    unit: 'people',
    source: 'nasa-n76-15042',
    relativeUncertainty: 0,
    note: 'LZ-8 Deutschland II, undocking at Dusseldorf on 16 May 1911 in a cross-hangar wind. It was destroyed against the shed doors anyway.',
  }),
  /** Mooring mast riding-out circle radius for Akron and Macon at Lakehurst. */
  mooringCircleRadius: measured(196, {
    unit: 'm',
    source: 'nasa-n76-15042',
    relativeUncertainty: 0.02,
    note: '643 ft. The ship weathervanes around the mast, so the whole circle must be clear and level. That is 12 hectares of prepared ground for the mast alone, before the shed.',
  }),
}))

/**
 * Labour and schedule.
 *
 * These are the softest numbers in this module and they are also the ones that
 * decide the answer, so they are declared uncertain rather than asserted.
 */
export const BUILD_LABOUR = under('build.labour', () => ({
  /**
   * Hours per kilogram of empty weight, for a composite airframe built by
   * hand. Anchored on amateur-built composite aircraft, which is the only body
   * of experience that exists for one or two people building an aircraft
   * structure out of carbon in a shed.
   */
  hoursPerKilogram: uncertain({
    low: 2.5,
    nominal: 3.75,
    high: 5,
    unit: 'h/kg',
    reason:
      'Composite homebuilt aircraft run roughly 2,000 to 4,000 hours for a 400 to 800 kg empty weight. An airship is far less dense in structure per unit of size, which helps, and has vastly more surface area per kilogram, which does not.',
    resolvedBy:
      'Building one bay of the frame and one gas cell and timing them. That is also the correct first physical task of the project.',
  }),
  /** Laminating rate for hand layup with a bag, all in. */
  laminateRate: uncertain({
    low: 0.5,
    nominal: 1.0,
    high: 2.0,
    unit: 'm2/h',
    reason:
      'Cutting, wetting out, placing, bagging, debulking, curing and demoulding, divided by the ply area placed. Published rates are for production shops with cutting tables and trained laminators.',
    resolvedBy: 'Timing a bay.',
  }),
  /** Fabrication rate for gas cells and cover, per square metre of finished fabric. */
  fabricRate: uncertain({
    low: 0.2,
    nominal: 0.35,
    high: 0.6,
    unit: 'h/m2',
    reason:
      'By analogy with hot air balloon envelope manufacture and large-panel industrial fabric work: patterning, cutting, layup, welding, fittings and inspection. Balloon envelopes are made in shops set up for exactly this and are an order of magnitude smaller.',
    resolvedBy: 'Building one cell.',
  }),
  /** Hours one person works on the project in a year, sustained. */
  hoursPerPersonYear: measured(2000, {
    unit: 'h/year',
    source: 'faa-experimental-operating-limitations',
    relativeUncertainty: 0.25,
    note: 'Full time. Nobody building an aircraft in their own time achieves this, and the sensitivity is linear: at 1,000 h/year every schedule below doubles.',
  }),
}))

/**
 * What comparable programmes actually took, for calibrating any schedule this
 * model produces. Every one of these had more people and more money.
 */
export const BUILD_PRECEDENT = under('build.precedent', () => ({
  /** Length of that ship, for the comparison to mean anything. */
  pathfinder1Length: measured(124, {
    unit: 'm',
    source: 'wikipedia-pathfinder-1',
    relativeUncertainty: 0.02,
    note: 'Within 8 percent of this design, which is what makes the seven year schedule below a calibration rather than an anecdote.',
  }),
  /** LTA Research's Pathfinder 1, the most directly comparable modern build. */
  pathfinder1Years: measured(7, {
    unit: 'year',
    source: 'wikipedia-pathfinder-1',
    relativeUncertainty: 0.1,
    note: 'Work began at Moffett Field in 2017 and the first untethered flight was 24 October 2024. In an existing hangar, professionally staffed, funded by a Google founder. 124 m long, which is within 8 percent of this design.',
  }),
  /** The smallest workforce that ever built a rigid airship. */
  smallestRigidWorkforce: measured(40, {
    unit: 'people',
    source: 'nasa-n76-15042',
    relativeUncertainty: 0.1,
    note: 'ZMC-2, the metalclad, was built with fewer than 40 people, and the Slate Airship company employed about the same. Both were far smaller ships and both firms failed.',
  }),
  /** Flight hours a modern airship needed to reach a type certificate. */
  zeppelinNtHoursToCertificate: measured(800, {
    unit: 'h',
    source: 'khoury-airship-technology',
    relativeUncertainty: 0.1,
    note: 'Zeppelin NT: maiden flight 18 September 1997, in excess of 800 flight hours over about 220 flights by December 2000, type certificate April 2001. Three and a half years of flying after the ship existed.',
  }),
  /** Minimum flight test hours before an amateur-built aircraft may carry anyone. */
  faaPhaseOneHours: measured(40, {
    unit: 'h',
    source: 'faa-experimental-operating-limitations',
    relativeUncertainty: 0,
    note: 'FAA Order 8130.2: 25 hours with a type-certificated engine and propeller, 40 hours otherwise, flown solo within an assigned test area. 14 CFR 91.319(b). This is the floor, not the plan.',
  }),
}))
