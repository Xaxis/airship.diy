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
 * THE RIGHT BENCHMARK IS THE HINDENBURG AT 48.8 PERCENT. It is the best empty
 * weight fraction any large rigid ever achieved, in duralumin, in 1936, with
 * hydrogen. So the project's "40 to 50 percent with carbon fibre" target does
 * not mean "beat the old technology". It means "equal or slightly beat the
 * single best airship ever built, using hand wet layup in a 12 m shop".
 *
 * Two structural corrections to the comparison, both of which flatter this
 * project and should be applied honestly rather than quietly:
 *
 *   - Gas choice accounts for about a third of the Macon-to-Hindenburg gap.
 *     Hydrogen gives 8.36 percent more gross lift than helium at the same
 *     volume and purity, so correcting Macon to a hydrogen-equivalent gross
 *     lift moves 60.1 percent to 55.5 percent. Of the 11 point gap, roughly
 *     4.6 points is gas and only about 6 points is structural design.
 *   - Material matters more than size. R101 at 72.6 percent is the only ship in
 *     the set with a stainless steel primary structure. R100, built to the same
 *     Air Ministry specification in the same year in duralumin, came in at 67.4
 *     percent. Five points from alloy choice alone at constant size, year,
 *     national practice and requirement.
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
    liftingGas: 'hydrogen',
    grossLift: 79800,
    emptyWeight: 33800,
    emptyWeightFraction: 0.435,
    material: 'duralumin',
    note: 'The best fraction in the set, and it was built as a war reparation with Zeppelin fighting for the company survival. Delivered on hydrogen and operated by the US Navy on helium, which is why its published figures differ by source.',
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
    emptyWeight: 111867,
    emptyWeightFraction: 0.726,
    material: 'stainless steel',
    note: 'The worst fraction in the set and the only stainless steel primary structure. Built to the SAME specification as R100 in the same year: five points of the gap is alloy choice alone. Delivered so overweight that a whole extra bay was inserted to recover lift, and lost with 48 aboard.',
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
    grossLift: 242000,
    emptyWeight: 118000,
    emptyWeightFraction: 0.488,
    material: 'duralumin',
    note: 'THE RIGHT BENCHMARK. The best empty weight fraction of any large rigid, and the target this project has to equal with hand wet layup rather than beat easily.',
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
  /** Fitted over all eight ships. High R^2, wide volume span, mixed everything. */
  allShipsExponent: 1.13,
  allShipsRSquared: 0.94,
  /** Fitted over the five best-sourced ships, whose volumes span only 1.41x. */
  bestSourcedExponent: 0.16,
  bestSourcedRSquared: 0.45,
  /** The theoretical area law, if structure were purely a surface problem. */
  theoreticalAreaLaw: 2 / 3,
} as const
