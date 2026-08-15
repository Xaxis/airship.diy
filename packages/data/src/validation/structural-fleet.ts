/**
 * Empty weight fractions of every rigid airship with published figures.
 *
 * This is the dataset the whole "can it be built" question turns on, and the
 * first thing to say about it is that the project brief's benchmark was the
 * wrong one.
 *
 * THE 60.1 PERCENT MACON FIGURE IS NOT A STRUCTURE FIGURE. Its 109,930 kg is
 * the entire fixed weight: duralumin frame, outer cover, twelve gas cells,
 * eight Maybach engines and their shafting, three keels, control car, controls,
 * fuel and ballast systems, the exhaust water recovery apparatus, an aircraft
 * hangar and trapeze, armament, and furnishings. No verifiable published
 * breakdown separates the bare girder framework from the rest. Comparing a
 * carbon fibre FRAME against it is comparing two different quantities.
 *
 * THE RIGHT BENCHMARK IS THE HINDENBURG, AND THE FIGURE IS ABOUT 52 PERCENT,
 * NOT THE 48.8 THIS FILE FIRST CLAIMED.
 *
 * That first figure divided 118,000 kg of empty weight by a 242,000 kg gross
 * lift, and 242,000 kg is only reachable with pure hydrogen at 0 degrees C. At
 * ISA sea level, which is the condition every other number in this repository
 * uses, the same envelope gives 227,944 kg. The model computes exactly that
 * from the shape function and the buoyancy module, independently, which is a
 * useful check on both.
 *
 * So the empty weight fraction is 118,000 / 227,944 = 51.8 percent. The value
 * here is taken from the model's own computed gross lift rather than from a
 * published figure on an unstated basis, because the published figures for this
 * ship span 220 to 242 tonnes depending on temperature and purity assumptions
 * nobody records.
 *
 * The correction makes the project's target HARDER, not easier. "40 to 50
 * percent with carbon fibre" no longer means equalling the best airship ever
 * built; it means beating it by two to twelve points, using hand wet layup in a
 * 12 m shop.
 *
 * Two structural corrections to the comparison, both of which flatter this
 * project and should be applied honestly rather than quietly:
 *
 *   - Gas choice accounts for about a third of the Macon-to-Hindenburg gap.
 *     Hydrogen gives 8.36 percent more gross lift than helium at the same
 *     volume and purity, so correcting Macon to a hydrogen-equivalent gross
 *     lift moves 60.1 percent to 55.5 percent. Of the 11 point gap, roughly
 *     4.6 points is gas and only about 6 points is structural design.
 *   - Material matters more than size. R101 at 76.9 percent is the only ship in
 *     the set with a stainless steel primary structure. R100, built to the same
 *     Air Ministry specification in the same year in duralumin, came in at 67.4
 *     percent. NINE AND A HALF points from alloy choice alone at constant size,
 *     year, national practice and requirement.
 *
 * A WARNING ABOUT THIS TABLE. Every apparent structural achievement in it needs
 * checking for a gas or a basis difference before it is believed. LZ-126 is
 * quoted at 43.5 percent on hydrogen and 59 percent on the helium it actually
 * operated on; R101's famous 72.6 percent is a structure weight over gross
 * lift, which is a different quantity from an empty weight fraction and comes
 * out at 76.9 when computed consistently. Three of the eight entries were wrong
 * in the first version of this file, all in the direction that made the
 * historical fleet look better than it was.
 */

export interface FleetEntry {
  readonly id: string
  readonly name: string
  readonly year: number
  /** Lifting gas volume, m3. */
  readonly gasVolume: number
  readonly liftingGas: 'hydrogen' | 'helium'
  /** Gross lift at standard conditions, kg. */
  readonly grossLift: number
  /** Fixed (empty) weight, kg. Includes everything that is not disposable. */
  readonly emptyWeight: number
  /** Empty weight over gross lift. */
  readonly emptyWeightFraction: number
  /** Primary structural material. The largest single term in the spread. */
  readonly material: 'duralumin' | 'stainless steel' | 'wood and duralumin'
  readonly note?: string
}

export const STRUCTURAL_FLEET: readonly FleetEntry[] = [
  {
    id: 'lz126',
    name: 'LZ-126 / USS Los Angeles',
    year: 1924,
    gasVolume: 70000,
    // Helium, as operated by the US Navy. The 0.435 figure that circulates for
    // this ship is on a HYDROGEN basis, as delivered, and the two are the same
    // airframe: quoting the hydrogen fraction alongside helium ships makes it
    // look like a structural achievement when most of the difference is gas.
    liftingGas: 'helium',
    grossLift: 73900,
    emptyWeight: 43600,
    emptyWeightFraction: 0.59,
    material: 'duralumin',
    note: 'CONTESTED. Sources give 0.435 on the as-delivered hydrogen basis and about 0.59 on the helium basis the US Navy actually operated it at. The helium figure is used here so the fleet is compared like for like. Anyone citing 0.435 as evidence that 44 percent is achievable is comparing gases, not structures.',
  },
  {
    id: 'r38',
    name: 'R-38 / ZR-2',
    year: 1921,
    gasVolume: 77000,
    liftingGas: 'hydrogen',
    grossLift: 87700,
    emptyWeight: 39505,
    emptyWeightFraction: 0.45,
    material: 'duralumin',
    note: 'BROKE IN HALF ON ACCEPTANCE TRIALS, killing 44. Lightened to reach a high design altitude by replacing radial main-ring bracing with tangential, cutting gas cells from 18 to 14, and stretching unsupported longitudinal panel length from 11 m to 15 m. It reached 44 percent and it is the reason 44 percent is not a target to aim at blindly.',
  },
  {
    id: 'shenandoah',
    name: 'USS Shenandoah / ZR-1',
    year: 1923,
    gasVolume: 59895,
    liftingGas: 'helium',
    grossLift: 59950,
    emptyWeight: 37826,
    emptyWeightFraction: 0.631,
    material: 'duralumin',
    note: 'Broke up in a line squall in 1925. Its valving policy, reduced to save helium, is why it could not vent fast enough during the vertical excursion.',
  },
  {
    id: 'r100',
    name: 'R100',
    year: 1929,
    gasVolume: 156000,
    liftingGas: 'hydrogen',
    grossLift: 159033,
    emptyWeight: 107213,
    emptyWeightFraction: 0.674,
    material: 'duralumin',
  },
  {
    id: 'r101',
    name: 'R101',
    year: 1929,
    gasVolume: 156000,
    liftingGas: 'hydrogen',
    grossLift: 154033,
    // 154,033 gross minus 35,562 disposable. The often-quoted 111,867 kg is a
    // weighed STRUCTURE weight, and dividing it by gross lift gives 0.726,
    // which is not an empty weight fraction and must not be compared with one.
    emptyWeight: 118471,
    emptyWeightFraction: 0.769,
    material: 'stainless steel',
    note: 'The worst fraction in the set and the only stainless steel primary structure. Built to the SAME specification as R100 in the same year, and the gap is 9.5 points from alloy choice alone. Delivered so overweight that a whole extra bay was inserted to recover lift, and lost with 48 aboard. The widely quoted 0.726 is a structure weight over gross lift, a different quantity.',
  },
  {
    id: 'zrs4-akron',
    name: 'USS Akron / ZRS-4',
    year: 1931,
    gasVolume: 184059,
    liftingGas: 'helium',
    grossLift: 182798,
    emptyWeight: 113560,
    emptyWeightFraction: 0.621,
    material: 'duralumin',
  },
  {
    id: 'zrs5-macon',
    name: 'USS Macon / ZRS-5',
    year: 1933,
    gasVolume: 184059,
    liftingGas: 'helium',
    grossLift: 182798,
    emptyWeight: 109930,
    emptyWeightFraction: 0.601,
    material: 'duralumin',
    note: 'The figure the brief used as its benchmark. It is the whole fixed weight, including eight engines, an aircraft hangar, a trapeze and armament, NOT the bare structure. Corrected to hydrogen-equivalent lift it is 55.5 percent.',
  },
  {
    id: 'lz129-hindenburg',
    name: 'LZ-129 Hindenburg',
    year: 1936,
    gasVolume: 200000,
    liftingGas: 'hydrogen',
    // ISA sea level, computed by the buoyancy module from the 200,000 m3
    // envelope. NOT the 242,000 kg figure that circulates, which is pure
    // hydrogen at 0 degrees C and is not the condition anything else here uses.
    grossLift: 227944,
    emptyWeight: 118000,
    emptyWeightFraction: 0.518,
    material: 'duralumin',
    note: 'THE BENCHMARK, on an ISA basis. Published gross lift for this ship spans 220 to 242 tonnes depending on unstated temperature and purity assumptions, which moves the fraction from 0.49 to 0.54. The ISA figure is used because every other number in this repository is on that basis.',
  },
] as const

/**
 * Empty weight per cubic metre of gas volume.
 *
 * THE STABLE METRIC, and the one to size against. Across eight ships, fifteen
 * years, two lifting gases, two structural materials and three countries, it
 * stays inside 0.505 to 0.790 kg/m3, a spread of only 1.56 to 1. Mass FRACTION
 * varies far more, because it also carries the gas choice.
 *
 * Use this as the sizing prior and let the mass fraction fall out as an output.
 * Doing it the other way round assumes the answer.
 */
export const EMPTY_WEIGHT_PER_GAS_VOLUME = {
  low: 0.505,
  nominal: 0.6,
  high: 0.79,
  /** Hindenburg specifically, the best of the fleet. */
  hindenburg: 0.59,
  unit: 'kg/m^3',
} as const

/**
 * How structural mass scales with size, and why the historical fleet cannot
 * settle it.
 *
 * THE SQUARE-CUBE LAW DOES NOT SHOW UP IN THE DATA. Fitting fixed weight
 * against gas volume across all eight ships gives an exponent of 1.13 with
 * R^2 = 0.94. The theoretical area law would be 0.67. An exponent above 1.0
 * means the mass fraction gets slightly WORSE with size, not better.
 *
 * That is not as surprising as it sounds. Only the hull girder is a beam
 * problem that benefits from depth. The outer cover, the gas cells and the
 * cell netting all scale as AREA, which is the 0.67 law, while engines, cars,
 * keels and systems scale with mission rather than with size at all.
 *
 * BUT THE FLEET CANNOT ACTUALLY RESOLVE THE EXPONENT, and any model claiming
 * otherwise is overfitting. Restricting to the five best-sourced ships, whose
 * volumes span only 1.41 to 1, gives an exponent of 0.16 with R^2 = 0.45. The
 * scatter driven by gas choice, material, national design philosophy and
 * mission is about 30 percentage points of mass fraction, which swamps any size
 * trend over that range.
 */
export const STRUCTURAL_SCALING = {
  /**
   * Fitted over all eight ships. High R^2, wide volume span, mixed everything,
   * AND NOT ROBUST. The fit is dominated by two derived clusters over a 3.3 to 1
   * volume range, and the mass-fraction scatter from gas, alloy and national
   * practice is larger than the size trend it is trying to measure. Treat the
   * usable range as 0.67 to 1.15 with a nominal near 1.0, which is what the
   * sweep does.
   */
  allShipsExponent: 1.13,
  allShipsRSquared: 0.94,
  /** The honest nominal, and the value the sizing prior should use. */
  robustNominalExponent: 1.0,
  robustExponentLow: 0.67,
  robustExponentHigh: 1.15,
  /** Fitted over the five best-sourced ships, whose volumes span only 1.41x. */
  bestSourcedExponent: 0.16,
  bestSourcedRSquared: 0.45,
  /** The theoretical area law, if structure were purely a surface problem. */
  theoreticalAreaLaw: 2 / 3,
} as const

/**
 * The pressure-stabilised ships, kept separate from the rigid fleet above
 * because they are a different architecture and mixing them is how the
 * semi-rigid mass advantage gets asserted without evidence.
 *
 * THE POINT OF THIS TABLE IS THAT IT DOES NOT SETTLE THE QUESTION. Two
 * semi-rigids exist with published empty weights, they differ by 1.6 to 1 on the
 * stable metric, and they straddle zero advantage against the rigid fleet:
 *
 *   Roma is the only semi-rigid ever built at the volume this project is
 *   designing for, and at 0.456 kg/m3 it beats every rigid in the table above.
 *
 *   The Zeppelin NT is the only one built in the last ninety years, and at 0.728
 *   it is worse than every rigid except R101, and statistically
 *   indistinguishable from the Goodyear GZ-20A NON-RIGID it replaced.
 *
 * So the honest answer to "is semi-rigid lighter" at 33,000 m3 is that nobody
 * knows, and any model that produces a confident saving is producing it from
 * assumptions rather than from data.
 */
export interface PressureStabilisedEntry {
  readonly id: string
  readonly name: string
  readonly year: number
  readonly architecture: 'semi-rigid' | 'non-rigid'
  readonly gasVolume: number
  readonly emptyWeight: number
  readonly emptyWeightPerGasVolume: number
  readonly note: string
}

export const PRESSURE_STABILISED_FLEET: readonly PressureStabilisedEntry[] = [
  {
    id: 'roma',
    name: 'Roma (T-34)',
    year: 1921,
    architecture: 'semi-rigid',
    gasVolume: 33810,
    emptyWeight: 15400,
    emptyWeightPerGasVolume: 0.4555,
    note: 'THE ONLY SEMI-RIGID EVER BUILT AT THIS PROJECT’S VOLUME, within 3 percent of the 32,968 m3 baseline. 125 m long, 25 m diameter, 34,500 kg gross. At 0.456 kg/m3 it beats every rigid in the fleet table. It also crashed in 1922 killing 34, after its gas cells shifted and it lost control, which is a damage-tolerance failure rather than a structural one.',
  },
  {
    id: 'zeppelin-nt',
    name: 'Zeppelin NT LZ N07-100',
    year: 1997,
    architecture: 'semi-rigid',
    gasVolume: 8450,
    emptyWeight: 6150,
    emptyWeightPerGasVolume: 0.7278,
    note: 'The only semi-rigid built in ninety years, and four times smaller than the baseline. Its 1,000 kg carbon and aluminium truss is the one published semi-rigid primary structure mass there is. CORRECTION TO A PUBLISHED FIGURE: the widely quoted 10,690 kg gross weight is impossible, because 8,450 m3 of helium at ISA with 26 percent ballonet inflation lifts about 6,600 kg and even a fully deflated envelope gives 8,920. Two German-language sources give 8,045 to 8,050 kg, and the empty weight here is derived from that.',
  },
  {
    id: 'gz-20a',
    name: 'Goodyear GZ-20A',
    year: 1969,
    architecture: 'non-rigid',
    gasVolume: 5740,
    emptyWeight: 4252,
    emptyWeightPerGasVolume: 0.7408,
    note: 'The blimp the Zeppelin NT replaced, and the reason the NT figure is not evidence of a semi-rigid advantage: the two are within 2 percent of each other on the stable metric. Whatever the truss buys, it does not show up here.',
  },
] as const

/**
 * What the pressure-stabilised fleet actually supports.
 *
 * A well-supported no. Use this rather than a point estimate anywhere the
 * semi-rigid mass advantage is claimed.
 */
export const SEMI_RIGID_ADVANTAGE = {
  /** Roma, at the baseline's own volume. */
  best: 0.4555,
  /** Zeppelin NT, the only modern one. */
  worst: 0.7278,
  /** The non-rigid the modern one replaced, for scale. */
  nonRigidComparator: 0.7408,
  spread: 0.7278 / 0.4555,
  note: 'Two data points 1.6 to 1 apart, straddling zero advantage against the rigid fleet. There is no defensible number for the semi-rigid mass saving at 33,000 m3.',
} as const

/**
 * Panel aspect ratio, and the invariant that R38 violated.
 *
 * THE DESIGN RULE IS NOT PANEL LENGTH IN METRES. Across every rigid airship
 * that did not break, the ratio of ring spacing to longitudinal spacing sits
 * between 1.31 and 1.81, a spread of only 1.38 to 1. Bay length over hull
 * diameter, which is the ratio usually quoted, varies by 2.9 to 1 across the
 * same ships and therefore cannot be the thing that matters.
 *
 * R38 was at 4.59, and it broke in half on acceptance trials in 1921, killing
 * 44.
 *
 * The ratio is physically motivated. Ebner (NACA TM 872) says the intermediate
 * rings exist both to shorten the longitudinal column AND to give the shear
 * wires a favourable angle of inclination. An aspect ratio of 1.5 puts the panel
 * diagonal at 34 degrees, which is in the efficient band; at 4.59 the diagonal
 * is at 12 degrees and the wire is nearly parallel to the load it is meant to
 * carry.
 *
 * R38 compounded it. Its main-ring bracing was changed from RADIAL to
 * TANGENTIAL as part of the same weight reduction, and a tangential net gives
 * no real radial restraint unless it is very highly pretensioned. The
 * intermediate rings stopped being effective supports, so the longitudinal's
 * effective column length jumped from the intermediate spacing to the 15 m
 * main-ring spacing. That is general instability rather than local column
 * buckling, which is why Herrera's contemporary account (NACA TM 105) records
 * the free length going from 11 m to 15 m even though secondary rings were
 * fitted.
 */
export const PANEL_ASPECT_RATIO = {
  /** Ships that did not break. */
  sound: [
    { id: 'lz127', name: 'LZ-127 Graf Zeppelin', ratio: 1.46 },
    { id: 'lz129', name: 'LZ-129 Hindenburg', ratio: 1.46, range: [1.39, 1.53] },
    { id: 'zrs4-akron', name: 'USS Akron', ratio: 1.52, range: [1.43, 1.61] },
    { id: 'r101', name: 'R101', ratio: 1.43, range: [1.31, 1.55] },
    { id: 'r100', name: 'R100', ratio: 1.81 },
  ],
  low: 1.31,
  high: 1.81,
  /** R38, which broke in half on acceptance trials killing 44. */
  r38: 4.59,
  note: 'Ring spacing over longitudinal spacing. Varies by only 1.38 to 1 across sound ships, against 2.9 to 1 for bay over diameter, which is why this is the invariant and that is not.',
} as const

/**
 * Component weight breakdown of USS Akron.
 *
 * THE ONE REAL COMPONENT-LEVEL STRUCTURAL WEIGHT STATEMENT for a rigid airship,
 * recovered from Burgess via NASA CR-137691 Volume III Table 9. Everywhere else
 * in the literature the published figure is an empty weight with no breakdown,
 * which is why so much airship structural reasoning is done on guessed shares.
 *
 * Two of its numbers correct guesses this project had made:
 *
 *   The bare girder framework is 33.0 percent of empty weight, not the 47 this
 *   repository assumed. The items that are NOT girder are a larger share of a
 *   real airship than intuition allows.
 *
 *   THE TRANSVERSE FRAMES OUTWEIGH THE LONGITUDINALS BY 2.17 TO 1, where this
 *   repository had assumed the rings were 0.35 of the longitudinals. The guess
 *   was not merely wrong, it was inverted. A main ring is a deep braced girder
 *   carrying the radial lift of two gas cells and reacting the suspension of
 *   everything hung below it, and there are many intermediate frames besides.
 */
export const AKRON_STRUCTURE = {
  frameworkShareOfEmptyWeight: 0.33,
  transverseToLongitudinalMass: 2.17,
  source: 'Burgess, via NASA CR-137691 Volume III Table 9',
} as const
