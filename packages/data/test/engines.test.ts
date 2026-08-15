import { describe, expect, it } from 'vitest'
import { ENGINES, ENGINE_CONSUMABLES, v } from '../src/index.js'

const engine = (id: string) => {
  const found = ENGINES.find((e) => e.id === id)
  if (!found) throw new Error(`No engine ${id}`)
  return found
}

/** @derived Years to seconds, mean Gregorian year. */
const years = (s: number) => s / (365.2425 * 86400)
const hours = (s: number) => s / 3600

/**
 * Three defects a verification pass caught in an earlier version of this data,
 * pinned so they cannot come back.
 */
describe('the three things engine comparisons usually get wrong', () => {
  it('installed mass is well above the accessory list sum', () => {
    // Manufacturer accessory lists are dry line items: no coolant, no oil and
    // tank, no radiator, no mounts. A mass budget built on the smaller number is
    // about 18 percent optimistic on the heaviest item in the propulsion group.
    for (const e of ENGINES) {
      expect(e.installedMass).toBeGreaterThan(e.dryMassWithAccessories * 1.1)
    }
  })

  it('brake thermal efficiency is recorded at BOTH operating points', () => {
    // Comparing a Rotax at max continuous against a diesel at its best point is
    // an artefact. Both points exist here and the field name says which.
    for (const e of ENGINES) {
      expect(e.bteAtBestPoint).toBeGreaterThan(e.bteAtContinuous)
    }
  })

  it('and the like-for-like diesel advantage is smaller than the naive comparison', () => {
    const rotax = engine('rotax-912-uls')
    const austro = engine('austro-ae300')

    // The artefact: continuous against best point.
    const naive = austro.bteAtBestPoint / rotax.bteAtContinuous
    // The real comparison: best point against best point.
    const honest = austro.bteAtBestPoint / rotax.bteAtBestPoint

    expect(naive).toBeGreaterThan(1.35)
    expect(honest).toBeLessThan(1.25)
  })

  it('TBO has a calendar leg, and at a realistic duty cycle both are decade-scale', () => {
    // The fuel budget permits about one percent duty, which is 88 hours a year.
    // At that rate neither leg is reached anywhere near a one-year mission, and
    // both land in the same decade. The engine is therefore a fixed recurring
    // cost rather than a duty-cycle problem, which is a different design
    // conversation from the one the brief expected.
    const dutyCycle = 0.01
    const annualHours = dutyCycle * 8766

    for (const e of ENGINES) {
      const yearsToHoursLimit = hours(e.tboHours) / annualHours
      expect(yearsToHoursLimit).toBeGreaterThan(10)
      expect(years(e.tboCalendar)).toBeGreaterThan(10)
    }
  })

  it('and for two of the three the CALENDAR is what actually fires first', () => {
    // The 915 is the exception, and only just: its shorter 1,200 hour overhaul
    // interval reaches the hours leg at 14 years against a 15 year calendar.
    // Worth pinning because it is the one case where a blanket "calendar always
    // binds" statement would be wrong.
    const annualHours = 0.01 * 8766
    const bindsOnCalendar = ENGINES.filter(
      (e) => hours(e.tboHours) / annualHours > years(e.tboCalendar),
    )
    expect(bindsOnCalendar).toHaveLength(2)
    expect(bindsOnCalendar.map((e) => e.id)).toContain('rotax-912-uls')
    expect(bindsOnCalendar.map((e) => e.id)).toContain('austro-ae300')
  })
})

describe('the consumables trap is a calendar and skills trap, not a mass one', () => {
  it('oil, coolant and hoses all have calendar legs', () => {
    expect(years(v(ENGINE_CONSUMABLES.oilChangeCalendar))).toBeCloseTo(1, 1)
    expect(years(v(ENGINE_CONSUMABLES.coolantCalendarLife))).toBeCloseTo(5, 1)
    expect(years(v(ENGINE_CONSUMABLES.hoseCalendarLife))).toBeCloseTo(4, 1)
  })

  it('so a rarely-used emergency generator still needs annual attention', () => {
    // An engine that runs 90 hours a year never reaches its 100 hour oil
    // interval, and still needs its oil changed every twelve months.
    const annualHours = 90
    expect(annualHours).toBeLessThan(hours(v(ENGINE_CONSUMABLES.oilChangeHours)))
    expect(years(v(ENGINE_CONSUMABLES.oilChangeCalendar))).toBeLessThanOrEqual(1)
  })

  it('annual consumables mass is a small fraction of useful lift', () => {
    // 1.5 to 3 percent of roughly 9,900 kg. The trap the brief expected was a
    // mass trap and it is not one.
    const usefulLift = 9900
    expect(v(ENGINE_CONSUMABLES.annualConsumablesMass) / usefulLift).toBeLessThan(0.04)
  })

  it('the real constraint is the gearbox teardown, which needs a shop', () => {
    // The maintenance item most likely to be beyond two people in a gondola.
    expect(hours(v(ENGINE_CONSUMABLES.gearboxTeardownHours))).toBe(1000)
  })
})

describe('engine selection', () => {
  it('the diesel is far heavier for its efficiency advantage', () => {
    const rotax = engine('rotax-912-uls')
    const austro = engine('austro-ae300')
    expect(austro.installedMass / rotax.installedMass).toBeGreaterThan(2.2)
  })

  it('and on a vehicle where the fuel runs out first, mass beats efficiency', () => {
    // The phase 4b finding: the fuel runs out fourteen times before the
    // overhaul falls due, so efficiency buys hours nobody can use while mass
    // costs payload every day.
    const rotax = engine('rotax-912-uls')
    const austro = engine('austro-ae300')
    const massPenalty = austro.installedMass - rotax.installedMass
    const efficiencyGain = austro.bteAtBestPoint / rotax.bteAtBestPoint - 1
    expect(massPenalty).toBeGreaterThan(100)
    expect(efficiencyGain).toBeLessThan(0.25)
  })

  it('turbocharging costs overhaul interval', () => {
    expect(engine('rotax-915-is').tboHours).toBeLessThan(engine('rotax-912-uls').tboHours)
  })
})
