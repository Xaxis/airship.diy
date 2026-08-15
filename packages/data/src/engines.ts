import { measured, uncertain, under } from './citation.js'

/**
 * Candidate engines for the series hybridPropulsion powertrain.
 *
 * THREE THINGS THIS FILE GETS RIGHT THAT MOST ENGINE COMPARISONS GET WRONG,
 * because a verification pass caught all three in an earlier version.
 *
 * ONE: INSTALLED MASS IS NOT DRY MASS PLUS ACCESSORIES. Manufacturer accessory
 * lists are dry line items. They omit coolant, engine oil and its tank, the
 * radiator and its plumbing, and the mounting structure. For a Rotax 912 that
 * is the difference between 69 kg and about 84 kg, and a mass budget built on
 * the smaller number is 18 percent optimistic on the heaviest single item in
 * the propulsion group.
 *
 * TWO: BRAKE THERMAL EFFICIENCY IS QUOTED AT DIFFERENT OPERATING POINTS.
 * Comparing a Rotax at MAX CONTINUOUS against a diesel at its BEST POINT is not
 * a comparison, it is an artefact. Both are recorded here at both points where
 * the data exists, and the field name says which.
 *
 * THREE: TIME BETWEEN OVERHAUL HAS A CALENDAR LEG, AND ON THIS VEHICLE IT IS
 * THE LEG THAT BINDS. Rotax publishes TBO as hours OR years, whichever comes
 * first. At the roughly one percent duty cycle the fuel budget actually permits,
 * an engine carried as a rarely-used emergency generator times out on the
 * calendar long before it wears out on hours. That converts the engine from a
 * duty-cycle problem into a fixed recurring cost, which is a different design
 * conversation.
 */

export interface Engine {
  readonly id: string
  readonly name: string
  /** Rated take-off power, W. */
  readonly ratedPower: number
  /** Maximum continuous power, W. The number a generator actually sees. */
  readonly continuousPower: number
  /** Dry mass including manufacturer accessory list, kg. NOT installed. */
  readonly dryMassWithAccessories: number
  /** Firewall-forward installed mass excluding propeller, kg. */
  readonly installedMass: number
  /** Brake thermal efficiency at maximum continuous power. */
  readonly bteAtContinuous: number
  /** Brake thermal efficiency at its best point, which is a lower load. */
  readonly bteAtBestPoint: number
  /** Time between overhaul, hours leg, seconds. */
  readonly tboHours: number
  /** Time between overhaul, CALENDAR leg, seconds. Often the binding one. */
  readonly tboCalendar: number
  readonly fuel: 'gasoline' | 'jet-a' | 'hydrogen'
  readonly note: string
}

/** @derived Hours to seconds. */
const h = (hours: number) => hours * 3600
/** @derived Years to seconds, on the mean Gregorian year. */
const a = (years: number) => years * 365.2425 * 86400

export const ENGINES: readonly Engine[] = under('engines', () => [
  {
    id: 'rotax-912-uls',
    name: 'Rotax 912 ULS',
    ratedPower: measured(73500, { unit: 'W', source: 'rotax-912', relativeUncertainty: 0.01 }).value,
    continuousPower: measured(69000, {
      unit: 'W',
      source: 'rotax-912',
      relativeUncertainty: 0.03,
    }).value,
    dryMassWithAccessories: measured(69.4, {
      unit: 'kg',
      source: 'rotax-912',
      relativeUncertainty: 0.02,
      note: 'Sum of the manufacturer accessory line items. NOT an installed mass: no coolant, no oil, no radiator, no mounts.',
    }).value,
    installedMass: uncertain({
      low: 80,
      nominal: 84,
      high: 88,
      unit: 'kg',
      reason:
        'Firewall-forward, excluding propeller. Adds about 2.7 kg of glycol coolant, 2.6 kg of oil plus its tank, and the radiator, plumbing and mount structure, none of which appear on the accessory list.',
      resolvedBy: 'Weigh the actual installation. Until then the mass budget carries the band.',
      source: 'rotax-912',
    }).nominal,
    bteAtContinuous: measured(0.291, {
      unit: '1',
      source: 'rotax-912',
      relativeUncertainty: 0.03,
      note: 'AT MAX CONTINUOUS. Comparing this against another engine best point is an artefact, not a result.',
    }).value,
    bteAtBestPoint: uncertain({
      low: 0.331,
      nominal: 0.335,
      high: 0.343,
      unit: '1',
      reason: 'Derived from the operator manual volumetric fuel flow rather than published directly.',
      resolvedBy: 'Dynamometer run, or a manufacturer BSFC map if one can be obtained.',
      source: 'rotax-912',
    }).nominal,
    tboHours: measured(h(2000), { unit: 's', source: 'rotax-912', relativeUncertainty: 0 }).value,
    tboCalendar: measured(a(15), {
      unit: 's',
      source: 'rotax-912',
      relativeUncertainty: 0.1,
      note: 'Rotax publishes TBO as hours OR years, whichever comes first. At the roughly one percent duty cycle this vehicle can afford, the calendar leg binds and the hours leg never does.',
    }).value,
    fuel: 'gasoline',
    note: 'The obvious light aircraft choice. Cheapest, most supported, and the worst brake thermal efficiency of the candidates.',
  },
  {
    id: 'rotax-915-is',
    name: 'Rotax 915 iS',
    ratedPower: measured(104000, { unit: 'W', source: 'rotax-915', relativeUncertainty: 0.01 }).value,
    continuousPower: measured(99000, { unit: 'W', source: 'rotax-915', relativeUncertainty: 0.02 }).value,
    dryMassWithAccessories: measured(89.2, {
      unit: 'kg',
      source: 'rotax-915',
      relativeUncertainty: 0.02,
      note: 'Accessory list sum, same caveat as the 912.',
    }).value,
    installedMass: uncertain({
      low: 99,
      nominal: 103,
      high: 108,
      unit: 'kg',
      reason: 'Same omissions as the 912: coolant, oil and tank, radiator, plumbing, mounts.',
      resolvedBy: 'Weigh the actual installation.',
      source: 'rotax-915',
    }).nominal,
    bteAtContinuous: uncertain({
      low: 0.28,
      nominal: 0.3,
      high: 0.32,
      unit: '1',
      reason: 'Turbocharged and intercooled, so the map is flatter than the 912 but not published in detail.',
      resolvedBy: 'Manufacturer BSFC map.',
      source: 'rotax-915',
    }).nominal,
    bteAtBestPoint: uncertain({
      low: 0.33,
      nominal: 0.345,
      high: 0.36,
      unit: '1',
      reason: 'Same.',
      resolvedBy: 'Manufacturer BSFC map.',
      source: 'rotax-915',
    }).nominal,
    tboHours: measured(h(1200), {
      unit: 's',
      source: 'rotax-915',
      relativeUncertainty: 0,
      note: 'Shorter than the 912 despite being newer, which is what turbocharging costs.',
    }).value,
    tboCalendar: measured(a(15), { unit: 's', source: 'rotax-915', relativeUncertainty: 0.1 }).value,
    fuel: 'gasoline',
    note: 'More power for more mass and a shorter overhaul interval. Only worth it if peak power genuinely binds.',
  },
  {
    id: 'austro-ae300',
    name: 'Austro Engine AE300, Jet-A',
    ratedPower: measured(123500, { unit: 'W', source: 'austro-ae300', relativeUncertainty: 0.01 }).value,
    continuousPower: measured(92600, {
      unit: 'W',
      source: 'austro-ae300',
      relativeUncertainty: 0.03,
      note: 'About 75 percent of rated, which is where a generator would sit.',
    }).value,
    dryMassWithAccessories: measured(186, {
      unit: 'kg',
      source: 'austro-ae300',
      relativeUncertainty: 0.02,
    }).value,
    installedMass: uncertain({
      low: 195,
      nominal: 205,
      high: 215,
      unit: 'kg',
      reason: 'Diesel installations carry more cooling and a heavier mount than a gasoline engine of the same power.',
      resolvedBy: 'Weigh the actual installation.',
      source: 'austro-ae300',
    }).nominal,
    bteAtContinuous: uncertain({
      low: 0.36,
      nominal: 0.385,
      high: 0.4,
      unit: '1',
      reason: 'Published best point is at about 60 percent load; continuous is slightly below it.',
      resolvedBy: 'Manufacturer BSFC map.',
      source: 'austro-ae300',
    }).nominal,
    bteAtBestPoint: measured(0.406, {
      unit: '1',
      source: 'austro-ae300',
      relativeUncertainty: 0.06,
      note: 'AT ITS BEST POINT, around 60 percent load. The right comparison against the Rotax best point of 0.335, not against the Rotax continuous figure of 0.291.',
    }).value,
    tboHours: measured(h(1800), {
      unit: 's',
      source: 'austro-ae300',
      relativeUncertainty: 0.15,
    }).value,
    tboCalendar: measured(a(12), {
      unit: 's',
      source: 'austro-ae300',
      relativeUncertainty: 0.1,
      note: 'Published as hours OR 12 years, whichever comes first.',
    }).value,
    fuel: 'jet-a',
    note: 'The best brake thermal efficiency of the candidates and by far the heaviest. On a vehicle where the fuel runs out fourteen times before the overhaul falls due, efficiency matters less than the mass it costs.',
  },
])

/**
 * Consumables per operating hour, and the calendar items that accrue whether
 * the engine runs or not.
 *
 * THE CALENDAR ITEMS ARE THE POINT. Coolant is lifed at 5 years and rubber
 * parts at 5 years regardless of hours; hoses at 500 hours or 48 months
 * whichever comes first; oil at 100 hours or 12 months. An engine carried as a
 * rarely-used emergency generator still needs its oil changed annually and its
 * hoses replaced every four years.
 */
export const ENGINE_CONSUMABLES = under('engineConsumables', () => ({
  oilChangeHours: measured(h(100), { unit: 's', source: 'rotax-912', relativeUncertainty: 0 }),
  oilChangeCalendar: measured(a(1), {
    unit: 's',
    source: 'rotax-912',
    relativeUncertainty: 0,
    note: '100 hours OR 12 months, whichever comes first. At one percent duty the calendar leg is the only one that ever fires.',
  }),
  oilVolumePerChange: measured(3.0e-3, {
    unit: 'm^3',
    source: 'rotax-912',
    relativeUncertainty: 0.05,
  }),

  coolantCalendarLife: measured(a(5), {
    unit: 's',
    source: 'rotax-912',
    relativeUncertainty: 0,
    note: 'Five years regardless of hours.',
  }),
  rubberPartsCalendarLife: measured(a(5), {
    unit: 's',
    source: 'rotax-912',
    relativeUncertainty: 0,
  }),
  hoseCalendarLife: measured(a(4), {
    unit: 's',
    source: 'rotax-912',
    relativeUncertainty: 0,
    note: '500 hours OR 48 months.',
  }),

  sparkPlugHours: measured(h(200), { unit: 's', source: 'rotax-912', relativeUncertainty: 0.2 }),
  gearboxTeardownHours: measured(h(1000), {
    unit: 's',
    source: 'rotax-912',
    relativeUncertainty: 0,
    note: 'The slipper clutch. This is the maintenance item most likely to be beyond two people in a gondola, and it is the real binding constraint on carrying an engine rather than the mass of the spares.',
  }),

  /**
   * Annual consumables mass at a realistic duty cycle.
   *
   * Survivable as MASS: 1.5 to 3 percent of a roughly 9,900 kg useful lift
   * budget. The trap the brief expected was a mass trap and it is not one. It
   * is a skills and shop trap.
   */
  annualConsumablesMass: uncertain({
    low: 140,
    nominal: 220,
    high: 310,
    unit: 'kg/a',
    reason:
      'Depends on duty cycle and on whether a spare engine is carried. Includes oil, filters, plugs, coolant, hoses and belts, and a share of an overhaul kit.',
    resolvedBy: 'Fix the duty cycle and the spares policy, then this is an inventory rather than an estimate.',
    source: 'rotax-912',
  }),
}))
