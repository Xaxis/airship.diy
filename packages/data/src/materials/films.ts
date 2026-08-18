import { measured, uncertain, under } from '../citation.js'
import type { Provenanced } from '../citation.js'

/**
 * Gas cell barrier films.
 *
 * READ THIS BEFORE USING ANY NUMBER IN THIS FILE.
 *
 * There is very little published hydrogen permeability data for airship-grade
 * laminates, because every airship built since 1937 has used helium and every
 * envelope datasheet is written for helium. That is not a gap in our research;
 * it is a gap in the literature, and it is one of the largest single sources of
 * uncertainty in the whole endurance calculation.
 *
 * So almost every hydrogen figure here is an `Uncertain` derived from a measured
 * helium figure via a selectivity ratio, and the ratio itself is uncertain.
 * Hydrogen permeates most polymers faster than helium because its kinetic
 * diameter is smaller (289 pm against 260 pm for helium, but hydrogen's
 * solubility is higher), and the published spread of H2/He selectivity for
 * barrier polymers runs from about 1.5 to 2.5.
 *
 * DO NOT reuse helium airship leak rates directly. A model that does will
 * under-predict hydrogen loss by roughly a factor of two, which is the
 * difference between the loop closing and not.
 *
 * Units: transmission rate in litres of gas at STP per square metre per day per
 * atmosphere of partial pressure difference, for the film as laminated. This is
 * the form manufacturers quote and the form the permeation model consumes.
 * Thickness is baked in: these are not intrinsic permeabilities.
 */

export interface BarrierFilm {
  readonly id: string
  readonly name: string
  /** Hydrogen transmission, L(STP)/(m2 day atm). */
  readonly hydrogenTransmission: Provenanced<number>
  /** Helium transmission where published, for cross-checking. */
  readonly heliumTransmission?: Provenanced<number>
  /** Nitrogen transmission. This is what destroys purity, so it is not optional. */
  readonly nitrogenTransmission: Provenanced<number>
  /** Areal density of the film as laminated, kg/m2. */
  readonly arealDensity: Provenanced<number>
  readonly era: 'historical' | 'modern'
  readonly note: string
}

export const BARRIER_FILMS: readonly BarrierFilm[] = under('films', () => [
  {
    id: 'para-aramid-mylar-laminate',
    name: 'Para-aramid fabric with metallised PET barrier ply',
    era: 'modern' as const,
    hydrogenTransmission: uncertain({
      low: 0.06,
      nominal: 0.09,
      high: 0.16,
      unit: 'L/(m^2.day.atm)',
      reason:
        'Derived from a published helium figure of 0.04 L/(m2 day) for a K5 para-aramid laminate, scaled by an H2/He selectivity. The bounds here imply selectivities of 1.5, 2.25 and 4.0, and the reason the top is beyond the 1.5 to 2.5 that bulk solubility gives is the same reason the nitrogen figure carries a wide band: transport through a metallised barrier is DEFECT DOMINATED rather than solubility dominated, and a pinhole does not discriminate between gases the way a polymer does. So the high end is a pinholed coupon and not a physically selective one. This reason used to state a 1.5 to 2.5 range that its own numbers did not reproduce: 0.04 x 2.5 is 0.10, not the 0.16 declared. No hydrogen measurement on this class of laminate has been published.',
      resolvedBy:
        'Measure H2 transmission on a sample coupon with a mass-spectrometer leak detector at 1 atm partial pressure difference and 20 C. This is a bench test costing days, and it is the single highest-value measurement in the project.',
      source: 'aiaa-envelope-permeation',
    }),
    heliumTransmission: measured(0.04, {
      unit: 'L/(m^2.day.atm)',
      source: 'aiaa-envelope-permeation',
      relativeUncertainty: 0.3,
      note: 'Best published figure for an aerospace barrier laminate. Represents what is achievable rather than what is typical.',
    }),
    nitrogenTransmission: uncertain({
      low: 0.001,
      nominal: 0.004,
      high: 0.015,
      unit: 'L/(m^2.day.atm)',
      reason:
        'Nitrogen is a much larger molecule and permeates far more slowly, but the ratio across a metallised barrier is dominated by pinhole defects rather than by bulk solubility, and defect density is a manufacturing variable nobody publishes.',
      resolvedBy:
        'Measure on the same coupon as the hydrogen test. Inward nitrogen flux is what sets the purity decay rate and therefore the electrolyzer duty cycle.',
    }),
    arealDensity: measured(0.21, {
      unit: 'kg/m^2',
      source: 'aiaa-envelope-permeation',
      relativeUncertainty: 0.2,
      note: 'Complete laminate including structural fabric. A bare barrier film is far lighter and cannot be used unsupported.',
    }),
    note:
      'The best modern option and the only one in this table that gets the annual loss rate into the 1 to 5 percent band. Film selection is therefore a first-order design driver, not a detail to settle later.',
  },

  {
    id: 'metallised-bopet-laminate',
    name: 'Metallised BOPET with polyester scrim',
    era: 'modern' as const,
    hydrogenTransmission: uncertain({
      low: 0.3,
      nominal: 0.6,
      high: 1.2,
      unit: 'L/(m^2.day.atm)',
      reason:
        'Typical rather than best-in-class. Derived from the sub-1 L/(m2 day) helium figure quoted for multi-ply polyester and Tedlar airship envelopes, scaled for hydrogen.',
      resolvedBy: 'Bench measurement on a candidate coupon.',
      source: 'aiaa-envelope-permeation',
    }),
    heliumTransmission: uncertain({
      low: 0.2,
      nominal: 0.3,
      high: 0.6,
      unit: 'L/(m^2.day.atm)',
      reason: 'Quoted only as "below 1 L/(m2 day)" for this class, which is a bound rather than a value.',
      resolvedBy: 'Manufacturer datasheet for the specific laminate selected.',
      source: 'aiaa-envelope-permeation',
    }),
    nitrogenTransmission: uncertain({
      low: 0.005,
      nominal: 0.02,
      high: 0.08,
      unit: 'L/(m^2.day.atm)',
      reason: 'Defect-dominated, as above.',
      resolvedBy: 'Bench measurement.',
    }),
    arealDensity: measured(0.18, {
      unit: 'kg/m^2',
      source: 'aiaa-envelope-permeation',
      relativeUncertainty: 0.25,
    }),
    note:
      'The obvious commodity choice, and the model says it does not close the loss budget: it lands around 10 percent per year rather than 1 to 5. Included precisely so the comparison is visible.',
  },

  {
    id: 'goldbeaters-skin',
    name: "Goldbeater's skin on cotton",
    era: 'historical' as const,
    hydrogenTransmission: uncertain({
      low: 4,
      nominal: 8,
      high: 15,
      unit: 'L/(m^2.day.atm)',
      reason:
        'Back-computed from the "several percent per month" loss rate reported for Zeppelin-era cells rather than from any direct measurement. The material was cattle intestine laminated to cotton and its performance varied with humidity, age and how well it had been maintained.',
      resolvedBy:
        'Not worth resolving. This entry exists to bracket the model at the bad end and to check that the permeation physics spans three orders of magnitude.',
    }),
    nitrogenTransmission: uncertain({
      low: 0.5,
      nominal: 1.5,
      high: 4,
      unit: 'L/(m^2.day.atm)',
      reason: 'Same back-computation, same lack of primary data.',
      resolvedBy: 'Not worth resolving.',
    }),
    arealDensity: measured(0.23, {
      unit: 'kg/m^2',
      source: 'khoury-airship-technology',
      relativeUncertainty: 0.3,
    }),
    note:
      'The historical benchmark. Zeppelin crews topped up cells continuously from the ship gas plant, which is the same architecture this project uses, arrived at for the same reason a century later.',
  },
])

const byId = new Map(BARRIER_FILMS.map((f) => [f.id, f]))

export const barrierFilm = (id: string): BarrierFilm => {
  const found = byId.get(id)
  if (!found) throw new Error(`Unknown barrier film "${id}".`)
  return found
}

/**
 * Ratio of hydrogen to helium permeability through a barrier polymer.
 *
 * Hydrogen is the smaller molecule by kinetic diameter and the more soluble one
 * in most polymers, so it wins on both terms of the solution-diffusion product.
 * The published spread is wide because it depends strongly on the polymer, and
 * this is the term that makes every helium-derived hydrogen figure in this file
 * uncertain.
 */
export const HYDROGEN_HELIUM_SELECTIVITY = under('films', () =>
  uncertain({
    low: 1.5,
    nominal: 2.0,
    high: 2.5,
    unit: '1',
    reason:
      'Polymer-dependent. The brief states 1.5 to 2.5 and the literature agrees, but the value for a specific metallised laminate is dominated by defect transport rather than by bulk polymer properties, and defects do not discriminate between gases the way the polymer does.',
    resolvedBy:
      'Measure H2 and He on the SAME coupon of the SAME laminate. The ratio is more useful than either absolute value, because it transfers the large body of helium airship data onto hydrogen.',
  }),
)

/** Molar volume of an ideal gas at STP, 0 C and 1 atm. Converts L(STP) to moles. */
export const MOLAR_VOLUME_STP = under('films', () =>
  measured(22.413969545, {
    unit: 'L/mol',
    source: 'si-2019',
    relativeUncertainty: 0,
    note: 'Exact, since R and the STP condition are both exact by definition. Note STP here is 0 C and 101.325 kPa, the convention barrier film datasheets use. IUPAC since 1982 defines STP at 100 kPa instead, giving 22.711 L/mol, and mixing the two is a 1.3 percent error.',
  }),
)
