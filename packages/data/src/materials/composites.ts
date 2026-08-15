import { measured, uncertain, under } from '../citation.js'

/**
 * Carbon fibre composite properties for HAND WET LAYUP with vacuum bagging.
 *
 * Not prepreg. Not autoclave. The brief's hard filter is that every structural
 * part must be producible in a 12 m by 6 m shop with hand layup, vacuum bagging,
 * and an oven or heat blanket cure, and quoting prepreg autoclave allowables for
 * a hand-laid part is the single most common way a composite design turns out
 * 20 percent lighter on paper than it can ever be built.
 *
 * READ THE FOUR FINDINGS BELOW BEFORE USING ANY NUMBER HERE. One reverses the
 * conventional wisdom, one was retracted after checking, and one is the binding
 * constraint on the whole structure.
 */

// ---------------------------------------------------------------------------
// Fibre
// ---------------------------------------------------------------------------

export interface CarbonFibre {
  readonly id: string
  readonly name: string
  /** Fibre tensile modulus, Pa. */
  readonly modulus: number
  /** Fibre tensile strength, Pa. */
  readonly strength: number
  readonly strainToFailure: number
  readonly density: number
  /** Composite compressive strength at 60 percent fibre volume, Pa. */
  readonly compositeCompressiveStrength60Vf: number
  readonly note: string
}

export const CARBON_FIBRES: readonly CarbonFibre[] = under('carbonFibre', () => [
  {
    id: 't700s',
    name: 'Toray T700S, standard modulus',
    modulus: measured(230e9, {
      unit: 'Pa',
      source: 'toray-t700s',
      relativeUncertainty: 0.02,
    }).value,
    strength: measured(4.9e9, { unit: 'Pa', source: 'toray-t700s', relativeUncertainty: 0.03 }).value,
    strainToFailure: measured(0.021, { unit: '1', source: 'toray-t700s', relativeUncertainty: 0.05 }).value,
    density: measured(1800, { unit: 'kg/m^3', source: 'toray-t700s', relativeUncertainty: 0.01 }).value,
    compositeCompressiveStrength60Vf: measured(1.45e9, {
      unit: 'Pa',
      source: 'toray-t700s',
      relativeUncertainty: 0.05,
      note: 'SACMA SRM 1R-94, 60 percent fibre volume, 130 C epoxy cure.',
    }).value,
    note: 'The default choice, and the analysis below says it is also the right one. Cheap, forgiving, high strain to failure, and the best composite compressive strength of the three.',
  },
  {
    id: 't800s',
    name: 'Toray T800S, intermediate modulus',
    modulus: measured(294e9, { unit: 'Pa', source: 'toray-technical-manual', relativeUncertainty: 0.02 }).value,
    strength: measured(5.88e9, { unit: 'Pa', source: 'toray-technical-manual', relativeUncertainty: 0.03 }).value,
    strainToFailure: measured(0.02, { unit: '1', source: 'toray-technical-manual', relativeUncertainty: 0.05 }).value,
    density: measured(1800, { unit: 'kg/m^3', source: 'toray-technical-manual', relativeUncertainty: 0.01 }).value,
    compositeCompressiveStrength60Vf: uncertain({
      low: 1.3e9,
      nominal: 1.4e9,
      high: 1.5e9,
      unit: 'Pa',
      reason: 'Not published on the same basis as T700S and M46J in the datasheets consulted.',
      resolvedBy: 'Toray composite properties table for the specific resin system chosen.',
    }).nominal,
    note: 'More expensive for a modest gain. Worth revisiting only if the frame turns out to be stiffness critical rather than buckling critical.',
  },
  {
    id: 'm46j',
    name: 'Toray M46J, high modulus',
    modulus: measured(436e9, { unit: 'Pa', source: 'toray-m46j', relativeUncertainty: 0.02 }).value,
    strength: measured(4.02e9, { unit: 'Pa', source: 'toray-m46j', relativeUncertainty: 0.03 }).value,
    strainToFailure: measured(0.009, { unit: '1', source: 'toray-m46j', relativeUncertainty: 0.05 }).value,
    density: measured(1840, { unit: 'kg/m^3', source: 'toray-m46j', relativeUncertainty: 0.01 }).value,
    compositeCompressiveStrength60Vf: measured(1.09e9, {
      unit: 'Pa',
      source: 'toray-m46j',
      relativeUncertainty: 0.05,
      note: 'SACMA SRM 1R-94, 60 percent Vf. TWENTY FIVE PERCENT LOWER than T700S despite 90 percent more fibre modulus.',
    }).value,
    note: 'A TRAP for this application, and Toray own datasheets say so. See the finding below.',
  },
])

/**
 * FINDING 1: high modulus fibre is a trap for a buckling-critical frame.
 *
 * M46J has 90 percent more fibre modulus than T700S (436 against 230 GPa) and
 * would look like the obvious choice for a structure whose members buckle. But
 * its 60 percent Vf composite COMPRESSIVE strength is 25 percent LOWER
 * (1.09 against 1.45 GPa), its strain to failure is 0.9 percent against
 * 2.1 percent, and it is denser.
 *
 * Buckling of a slender member scales with E*I, so modulus helps. Crippling and
 * local shell buckling scale with compressive strength, and material failure
 * scales with strain to failure. Historical rigid airship girders failed by
 * local buckling and crippling, not by Euler instability of the whole member, so
 * the compressive strength term is the one that governs and high modulus fibre
 * loses on it.
 *
 * A brittle 0.9 percent strain-to-failure material is also a poor choice for a
 * structure built by hand, where the real failure mode is a stress concentration
 * at a joint somebody made on a Tuesday.
 */

// ---------------------------------------------------------------------------
// Process: what hand layup actually achieves
// ---------------------------------------------------------------------------

export const WET_LAYUP = under('wetLayup', () => ({
  /**
   * Fibre volume fraction achieved by wet layup under vacuum bag.
   *
   * The single largest uncertainty in the whole structural model. Everything
   * fibre-dominated scales linearly with it.
   */
  fibreVolumeFraction: uncertain({
    low: 0.42,
    nominal: 0.47,
    high: 0.55,
    unit: '1',
    reason:
      'Bracketed by published laboratory measurements on small panels made by researchers. Nobody has published what a non-specialist achieves at production scale on a large part with compound curvature, which is the actual case here.',
    resolvedBy:
      'Make a representative panel, burn off or acid digest it, and measure. This is a weekend of work and it is the highest-leverage measurement in the structures module.',
    source: 'sussmann-2018',
  }),

  /** Fibre volume fraction with no vacuum bag at all, for comparison. */
  handLayupOnlyFibreVolumeFraction: measured(0.35, {
    unit: '1',
    source: 'gurit-guide-to-composites',
    relativeUncertainty: 0.15,
    note: 'The penalty for skipping the vacuum bag: about a quarter of all fibre-dominated strength. The bag is not optional.',
  }),

  /** Prepreg autoclave, the reference the folklore knockdowns are quoted against. */
  prepregFibreVolumeFraction: measured(0.574, {
    unit: '1',
    source: 'hexcel-8552',
    relativeUncertainty: 0.02,
  }),

  voidContent: uncertain({
    low: 0.03,
    nominal: 0.034,
    high: 0.05,
    unit: '1',
    reason:
      'Conventional wet layup under vacuum bag measures around 3.4 percent against below 1 percent for prepreg autoclave. Strongly dependent on technique and on how patient the person doing it is.',
    resolvedBy: 'Section and count on a representative coupon.',
    source: 'sussmann-2018',
  }),

  /**
   * Interlaminar shear strength lost per unit void fraction.
   *
   * FINDING 2: the void penalty lands on the JOINTS, not the members. Voids
   * barely touch fibre-dominated properties, and they hit ILSS at about 7
   * percent per 1 percent of voids. Wet layup runs about 3.4 percent voids
   * against under 1 percent for prepreg, so the real cost of building by hand is
   * roughly 17 percent off interlaminar shear.
   *
   * That is actionable rather than merely bad news: it says spend the effort on
   * joint area and bondline quality, not on trying to make the members thinner.
   */
  ilssLossPerVoidFraction: measured(7.0, {
    unit: '1',
    source: 'judd-wright-1978',
    relativeUncertainty: 0.2,
    note: 'Holds up to about 4 percent voids. Above that the relation is no longer linear and the laminate is scrap anyway.',
  }),

  curedLaminateDensity: uncertain({
    low: 1380,
    nominal: 1426,
    high: 1490,
    unit: 'kg/m^3',
    reason:
      'Computed from constituent densities at the nominal fibre volume fraction, so it inherits that uncertainty directly.',
    resolvedBy: 'Weigh and measure a cured panel. Same coupon as the fibre volume fraction test.',
    source: 'toray-t700s',
  }),
}))

/**
 * FINDING 3, RETRACTED. Woven fabric does NOT beat unidirectional in
 * compression, and the claim that it did was an artifact of my own arithmetic.
 *
 * The original reasoning: normalising Hexcel's HexPly 8552 unidirectional and
 * woven rows to aligned fibre volume, same fibre and same resin in adjacent
 * tables, appeared to show woven losing 22 percent in tension, matching in
 * modulus, and gaining 20 percent in COMPRESSION. That would have meant hand
 * layup's forced use of woven fabric was an advantage for a buckling-critical
 * frame rather than a penalty.
 *
 * It does not survive checking. The normalisation divided the woven row by half
 * its total fibre volume to get the aligned fraction, which is right, but did
 * not account for the fill tows contributing to the measured compressive
 * response while being excluded from the denominator. The apparent bonus is that
 * omission, not a physical crimp effect.
 *
 * Corrected: treat woven compression as at-best PARITY per unit aligned fibre,
 * 0.95 with a band of 0.85 to 1.05. Do not size compression members on a bonus.
 *
 * This finding was flagged at the time for priority verification precisely
 * because it flattered the design. That was the right instinct and it is why the
 * error lasted an hour rather than reaching a laminate schedule.
 */
export const WOVEN_KNOCKDOWN = under('wovenKnockdown', () => ({
  tension: uncertain({
    low: 0.72,
    nominal: 0.78,
    high: 0.84,
    unit: '1',
    reason: 'Derived by normalising two rows of one datasheet to aligned fibre volume, not measured directly.',
    resolvedBy: 'Coupon tests of the actual fabric and resin.',
    source: 'hexcel-8552',
  }),
  modulus: uncertain({
    low: 0.9,
    nominal: 0.93,
    high: 0.97,
    unit: '1',
    reason:
      'Crimp costs a little aligned modulus because the tows are not straight. The earlier figure of 1.00 came from the same flawed normalisation as the compression term.',
    resolvedBy: 'Coupon tests.',
    source: 'hexcel-8552',
  }),
  compression: uncertain({
    low: 0.85,
    nominal: 0.95,
    high: 1.05,
    unit: '1',
    reason:
      'At-best parity. An earlier derivation from the same datasheet appeared to show a 20 percent BONUS; that was a normalisation artifact, not a crimp effect, and it is retracted. The true value straddles unity and nobody has measured it for a wet-laid woven laminate.',
    resolvedBy:
      'Compression coupon tests of the actual fabric and resin. Still a priority, but now to confirm parity rather than to bank a bonus.',
    source: 'hexcel-8552',
  }),
}))

// ---------------------------------------------------------------------------
// Resin, and the finding that may kill the design
// ---------------------------------------------------------------------------

export interface ResinSystem {
  readonly id: string
  readonly name: string
  /** Dry glass transition temperature as cured, K. */
  readonly dryGlassTransition: number
  readonly curedDensity: number
  readonly cureSchedule: string
  readonly note: string
}

export const RESIN_SYSTEMS: readonly ResinSystem[] = under('resin', () => [
  {
    id: 'west-105-206',
    name: 'West System 105/206, ambient cure',
    dryGlassTransition: measured(332.6, {
      unit: 'K',
      source: 'gougeon-105',
      relativeUncertainty: 0.01,
      note: '59.5 C. Ultimate Tg after full ambient cure.',
    }).value,
    curedDensity: measured(1180, { unit: 'kg/m^3', source: 'gougeon-105', relativeUncertainty: 0.01 }).value,
    cureSchedule: 'Ambient, no post-cure required.',
    note: 'The default marine epoxy, and the temperature analysis below says it CANNOT be used for primary structure on this vehicle.',
  },
  {
    id: 'proset-lam125-ambient',
    name: 'Pro-Set LAM-125/226, ambient cure',
    dryGlassTransition: measured(337.15, {
      unit: 'K',
      source: 'proset-lam125',
      relativeUncertainty: 0.01,
      note: '64 C. DMA onset, after 22 C for 4 weeks.',
    }).value,
    curedDensity: measured(1160, { unit: 'kg/m^3', source: 'proset-lam125', relativeUncertainty: 0.01 }).value,
    cureSchedule: 'Ambient, 4 weeks to full property development.',
    note: 'Also inadequate on the temperature analysis.',
  },
  {
    id: 'proset-lam125-postcured',
    name: 'Pro-Set LAM-125/226, 82 C post-cure',
    dryGlassTransition: measured(369.15, {
      unit: 'K',
      source: 'proset-lam125',
      relativeUncertainty: 0.01,
      note: '96 C. The post-cure buys 32 K of Tg, which is the difference between a usable structure and an unusable one.',
    }).value,
    curedDensity: measured(1160, { unit: 'kg/m^3', source: 'proset-lam125', relativeUncertainty: 0.01 }).value,
    cureSchedule: 'Room temperature gelation, then 82 C post-cure. Achievable with a heat blanket or an oven, which the brief permits.',
    note: 'MARGINAL even so. See the temperature finding.',
  },
])

/**
 * FINDING 4: TEMPERATURE, NOT STRENGTH, IS THE BINDING MATERIALS CONSTRAINT.
 * How binding depends on one unresolved question, and the range is a factor of
 * five in permissible operating temperature.
 *
 * Chain three published rules:
 *   - FAA PS-ACE-100-2-18-1999 requires maximum operating temperature at least
 *     28 K BELOW the WET glass transition temperature.
 *   - Wright (Composites, 1981) gives wet Tg as roughly dry Tg minus 20 K for
 *     each percent of absorbed moisture.
 *   - Colin and Verdu put epoxy saturation moisture below about 3 percent OF
 *     THE RESIN.
 *
 * THE PIVOT IS THAT LAST WORD. Only the resin absorbs water, so 3 percent of
 * resin mass is about 1.4 percent of LAMINATE mass at 47 percent fibre volume.
 * Wright's paper does not state which basis its moisture axis uses, and the two
 * give very different answers:
 *
 *   resin basis, 3.0 percent      West System   -28 C    Pro-Set post-cured   8 C
 *   laminate basis, 1.4 percent   West System     4 C    Pro-Set post-cured  40 C
 *
 * On the resin basis every ambient-cure epoxy is unusable and even the
 * post-cured system permits only 8 C, which a sun-loaded tropical hull would
 * exceed constantly. On the laminate basis the post-cured system permits 40 C,
 * which is workable with attention to hull colour and ventilation.
 *
 * WHAT SURVIVES EITHER WAY:
 *   - Ambient-cure epoxy is ruled out for primary structure. Even on the
 *     generous basis it permits only about 4 C.
 *   - Post-cure is mandatory. It buys 32 K of dry Tg, which is the difference
 *     between a usable structure and an unusable one, and the brief already
 *     permits an oven or heat blanket.
 *   - The hull optical property question acquires a third axis. A dark hull
 *     maximises solar power, superheat, AND structural temperature.
 *
 * WHAT IS UNRESOLVED, and it is now the highest-value materials measurement in
 * the project: condition a laminate coupon to constant mass and measure wet Tg
 * directly by DMA. That skips Wright's rule entirely and settles the question in
 * a fortnight of elapsed time and a few hours of work.
 *
 * The frame also sits INSIDE the envelope, shaded from the sun and separated
 * from rain by the cover, so its real moisture uptake and temperature are both
 * lower than the skin's. Nobody has published the skin temperature of a
 * sun-exposed photovoltaic-covered airship hull at sea level; every thermal
 * study found is stratospheric, where the convective environment is entirely
 * different.
 */
export const TEMPERATURE_LIMITS = under('temperatureLimits', () => ({
  /** FAA-required margin between maximum operating temperature and wet Tg. */
  requiredMarginBelowWetTg: measured(28, {
    unit: 'K',
    source: 'faa-ps-ace-100-2-18',
    relativeUncertainty: 0,
    note: 'A regulatory requirement, not an engineering estimate. It is 50 F expressed in kelvin.',
  }),

  /** Drop in Tg per unit mass fraction of absorbed moisture. */
  glassTransitionDropPerMoistureFraction: measured(2000, {
    unit: 'K',
    source: 'wright-1981',
    relativeUncertainty: 0.25,
    note: 'That is 20 K per PERCENT, expressed per unit fraction. Described by its own author as a rule of thumb drawn across several studies, so the uncertainty is real.',
  }),

  /**
   * Saturation moisture on a RESIN MASS basis. The published figure.
   */
  resinSaturationMoistureFraction: uncertain({
    low: 0.015,
    nominal: 0.03,
    high: 0.038,
    unit: '1',
    reason:
      'Depends on the resin, the temperature, and how long the part has been wet. A structure that never lands has a very long time to reach equilibrium.',
    resolvedBy:
      'Immersion or humidity-chamber conditioning of a coupon to constant mass, then a wet DMA.',
    source: 'colin-verdu',
  }),

  /**
   * The same saturation expressed on a LAMINATE MASS basis, which at 47 percent
   * fibre volume is roughly 47 percent of the resin figure because only the
   * resin absorbs water.
   *
   * WHICH BASIS APPLIES IS THE PIVOT OF THE WHOLE TEMPERATURE FINDING, and it
   * changes the answer by a factor of about 2.5. Wright's rule of 20 K of Tg per
   * percent moisture does not state its basis. On the resin basis the post-cured
   * system permits 8 C and the design is in serious trouble; on the laminate
   * basis it permits about 40 C and the design is merely constrained.
   */
  laminateSaturationMoistureFraction: uncertain({
    low: 0.007,
    nominal: 0.014,
    high: 0.018,
    unit: '1',
    reason:
      'Derived from the resin figure by fibre volume fraction. The real question is not this number but which basis Wright intended, and his paper does not say.',
    resolvedBy:
      'Read Wright 1981 and establish the basis of its moisture axis. Failing that, condition a laminate coupon to constant mass, measure wet Tg directly by DMA, and skip the rule entirely. This is now the highest-value materials measurement in the project.',
    source: 'wright-1981',
  }),
}))

/**
 * Maximum permissible operating temperature for a resin system, K.
 *
 * @derived MOT = dryTg - (drop per unit moisture * moisture) - required margin.
 * Chains FAA PS-ACE-100-2-18-1999 with Wright's wet-Tg rule.
 *
 * The caller must pass the moisture fraction on the basis Wright intended, and
 * that basis is unknown. Pass `resinSaturationMoistureFraction` for the harsh
 * reading and `laminateSaturationMoistureFraction` for the generous one; they
 * differ by a factor of about 2.5 and the answer differs by 32 K.
 */
export const maximumOperatingTemperature = (
  dryGlassTransition: number,
  moistureFraction: number,
): number =>
  dryGlassTransition -
  TEMPERATURE_LIMITS.glassTransitionDropPerMoistureFraction.value * moistureFraction -
  TEMPERATURE_LIMITS.requiredMarginBelowWetTg.value
