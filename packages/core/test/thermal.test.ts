import { describe, expect, it } from 'vitest'
import { K } from '@airship/units'
import type { SquareMeters } from '@airship/units'

import {
  clearSkyIrradiance,
  designThermalCase,
  diurnalThermalCycle,
  envelopeTemperature,
  externalConvection,
  skyTemperature,
  solarDeclination,
  solarZenithCosine,
  surfaceIrradiance,
} from '../src/thermal.js'

/**
 * The hull's energy balance.
 *
 * This module replaced a literal: the design was graded against 20 K of solar
 * superheat, asserted, with no supercooling counterpart at all. So the tests
 * here are mostly about the SHAPE of the answer rather than its value, since
 * there is no published superheat measurement for this vehicle to check against
 * and inventing one would defeat the purpose.
 */

/** @derived A representative hull: 118 m, 13,000 m2 of skin, 2.2 t of hydrogen. */
const HULL_LENGTH = 118
const ENVELOPE_AREA = 13000 as SquareMeters
const GAS_MASS = 2200
const HYDROGEN_SPECIFIC_HEAT = 14304
const AMBIENT = K(275.15)

const conditions = (over: Record<string, unknown> = {}) => ({
  airTemperature: AMBIENT,
  surfaceTemperature: AMBIENT,
  airspeed: 0,
  hullLength: HULL_LENGTH,
  /** @derived Kinematic viscosity of air near 2 km, m2/s. */
  kinematicViscosity: 1.7e-5,
  arrayCoverage: 0.12,
  arrayEfficiency: 0.21,
  surfaceAlbedo: 0.06,
  cloudCover: 0,
  ...over,
})

const cycle = (over: Record<string, unknown> = {}) =>
  diurnalThermalCycle({
    latitude: 15,
    dayOfYear: 172,
    gasMass: GAS_MASS,
    gasSpecificHeat: HYDROGEN_SPECIFIC_HEAT,
    envelopeArea: ENVELOPE_AREA,
    airTemperatureSwing: 6,
    conditions: conditions(over),
  })

describe('solar geometry', () => {
  it('puts the solstices where they belong', () => {
    // Cooper's equation. Day 172 is the June solstice and day 355 December.
    expect((solarDeclination(172) * 180) / Math.PI).toBeGreaterThan(23)
    expect((solarDeclination(355) * 180) / Math.PI).toBeLessThan(-23)
    // And the equinoxes cross zero.
    expect(Math.abs((solarDeclination(80) * 180) / Math.PI)).toBeLessThan(1.5)
  })

  it('puts the sun below the horizon at midnight and overhead near noon', () => {
    expect(solarZenithCosine(15, 172, 0)).toBeLessThan(0)
    expect(solarZenithCosine(15, 172, 12)).toBeGreaterThan(0.95)
  })

  it('gives the arctic a midnight sun in June and none in December', () => {
    expect(solarZenithCosine(80, 172, 0)).toBeGreaterThan(0)
    expect(solarZenithCosine(80, 355, 12)).toBeLessThan(0)
  })
})

describe('irradiance', () => {
  it('lands near the clear-sky value at sea level noon', () => {
    // A clear tropical noon is 900 to 1000 W/m2 of direct normal at the ground,
    // which is the one number in this module with a well known answer.
    const noon = clearSkyIrradiance(15, 172, 12)
    expect(noon.directNormal).toBeGreaterThan(850)
    expect(noon.directNormal).toBeLessThan(1000)
  })

  it('is zero at night and never negative', () => {
    for (const hour of [0, 2, 22, 23.5]) {
      const night = clearSkyIrradiance(15, 172, hour)
      expect(night.globalHorizontal).toBe(0)
    }
  })

  it('DIMS the sun under cloud as well as warming the sky', () => {
    // THE BUG THIS TEST EXISTS FOR. An early version applied cloud only to the
    // sky's radiative temperature, so an overcast day came out with MORE
    // superheat than a clear one, which is not what overcast does.
    const clear = surfaceIrradiance(15, 172, 12, 0)
    const overcast = surfaceIrradiance(15, 172, 12, 1)
    expect(overcast.globalHorizontal).toBeLessThan(clear.globalHorizontal * 0.3)
    // And under full overcast there is no beam left, only a bright dome.
    expect(overcast.directNormal).toBe(0)
    expect(overcast.diffuseHorizontal).toBe(overcast.globalHorizontal)
  })

  it('rejects a cloud fraction that is not a fraction', () => {
    expect(() => surfaceIrradiance(15, 172, 12, 1.4)).toThrow(RangeError)
  })
})

describe('the radiative sky', () => {
  it('is tens of kelvin colder than the air, which is why hulls supercool', () => {
    const sky = skyTemperature(AMBIENT) as number
    expect(sky).toBeLessThan((AMBIENT as number) - 15)
    expect(sky).toBeGreaterThan((AMBIENT as number) - 40)
  })
})

describe('external convection', () => {
  it('collapses to free convection at zero airspeed', () => {
    // AND THIS IS WHY SUPERHEAT MATTERS MORE HERE THAN FOR A NORMAL AIRSHIP.
    // The vehicle's whole purpose is to hold station, and a hull that is not
    // moving sheds heat about four times worse than a cruising one. Four, not
    // the order of magnitude an earlier draft of this module claimed: the
    // turbulent correlation goes as Re^0.8, so eight metres a second over a
    // 118 m hull buys 11 W/(m2 K) against 2.5 in still air.
    const still = externalConvection(0, HULL_LENGTH, 1.7e-5)
    const cruise = externalConvection(8, HULL_LENGTH, 1.7e-5)
    expect(still).toBeLessThan(5)
    expect(cruise / still).toBeGreaterThan(4)
  })

  it('grows with airspeed to the four-fifths power', () => {
    const a = externalConvection(8, HULL_LENGTH, 1.7e-5)
    const b = externalConvection(16, HULL_LENGTH, 1.7e-5)
    expect(b / a).toBeCloseTo(2 ** 0.8, 2)
  })
})

describe('the envelope balance', () => {
  it('runs below ambient on a clear night, which is the supercooling case', () => {
    const night = envelopeTemperature(
      AMBIENT,
      clearSkyIrradiance(15, 172, 0),
      conditions(),
    ) as number
    expect(night).toBeLessThan(AMBIENT as number)
  })

  it('runs above ambient in the sun', () => {
    const day = envelopeTemperature(
      AMBIENT,
      clearSkyIrradiance(15, 172, 12),
      conditions(),
    ) as number
    expect(day).toBeGreaterThan(AMBIENT as number)
  })

  it('gets hotter as the array covers more of it', () => {
    // The array is nearly black in the solar band by design and the cover is
    // deliberately not, so coverage is a thermal decision as well as a power
    // one. This is the coupling the old 20 K literal hid.
    const bare = envelopeTemperature(
      AMBIENT,
      clearSkyIrradiance(15, 172, 12),
      conditions({ arrayCoverage: 0 }),
    ) as number
    const covered = envelopeTemperature(
      AMBIENT,
      clearSkyIrradiance(15, 172, 12),
      conditions({ arrayCoverage: 1 }),
    ) as number
    expect(covered).toBeGreaterThan(bare + 5)
  })

  it('rejects a coverage that is not a fraction of the hull', () => {
    expect(() =>
      envelopeTemperature(AMBIENT, clearSkyIrradiance(15, 172, 12), conditions({ arrayCoverage: 2 })),
    ).toThrow(RangeError)
  })
})

describe('the diurnal cycle', () => {
  it('peaks after solar noon, because the gas lags the skin', () => {
    // The lag is the point. The envelope is thin and follows the sun within a
    // minute; the gas carries the heat capacity of the whole lifting volume and
    // takes tens of minutes, so the lift excursion is not symmetric about noon.
    const day = cycle()
    expect(day.peakSuperheatHour).toBeGreaterThan(12)
    expect(day.peakSuperheatHour).toBeLessThan(16)
  })

  it('supercools before dawn', () => {
    const day = cycle()
    expect(day.peakSupercooling).toBeGreaterThan(1)
    expect(day.peakSupercoolingHour).toBeGreaterThan(3)
    expect(day.peakSupercoolingHour).toBeLessThan(8)
  })

  it('halves the swing at cruise speed', () => {
    const still = cycle()
    const moving = cycle({ airspeed: 8 })
    expect(moving.diurnalSwing).toBeLessThan(still.diurnalSwing * 0.6)
  })

  it('reproduces the folklore 20 K for the DARK envelope it describes', () => {
    // The literal this module replaced was "the standard figure for a dark
    // envelope in still air at midday". Ask this model for a dark envelope in
    // still air and it agrees, which is the closest thing to a validation case
    // available: the old number was not wrong about the ship it described, it
    // was wrong about THIS ship, whose cover is white and whose array is a
    // minority of the surface.
    const dark = cycle({ arrayCoverage: 1 })
    expect(dark.peakSuperheat).toBeGreaterThan(15)
    expect(dark.peakSuperheat).toBeLessThan(30)
  })

  it('is far gentler on the light cover this vehicle actually has', () => {
    expect(cycle().peakSuperheat).toBeLessThan(cycle({ arrayCoverage: 1 }).peakSuperheat / 1.5)
  })

  it('refuses a cell with no gas in it', () => {
    expect(() => cycle.call(null) && diurnalThermalCycle({
      latitude: 15,
      dayOfYear: 172,
      gasMass: 0,
      gasSpecificHeat: HYDROGEN_SPECIFIC_HEAT,
      envelopeArea: ENVELOPE_AREA,
      conditions: conditions(),
    })).toThrow(RangeError)
  })
})

describe('the design case', () => {
  it('finds an INTERIOR worst case in cloud cover, not an endpoint', () => {
    // THE RESULT WORTH ARGUING WITH. Broken cloud is worse than clear sky for
    // superheat, because cloud converts beam into diffuse and diffuse couples
    // to a convex body through A/2 where a beam couples through A/4, while
    // Kasten-Czeplak says the total barely moves until the sky is mostly
    // covered. Sweeping only the endpoints understates the ballast requirement.
    const worst = designThermalCase({
      latitude: 15,
      dayOfYear: 172,
      gasMass: GAS_MASS,
      gasSpecificHeat: HYDROGEN_SPECIFIC_HEAT,
      envelopeArea: ENVELOPE_AREA,
      airTemperatureSwing: 6,
      conditions: conditions(),
    })
    expect(worst.superheatCloudCover).toBeGreaterThan(0)
    expect(worst.superheatCloudCover).toBeLessThan(1)
    expect(worst.superheat).toBeGreaterThan(cycle().peakSuperheat)

    // Supercooling, by contrast, IS an endpoint: the coldest sky is the clear one.
    expect(worst.supercoolingCloudCover).toBe(0)

    // And the swing is what the ballast loop tracks, not the superheat alone.
    expect(worst.swing).toBeCloseTo(worst.superheat + worst.supercooling, 9)
  })
})
