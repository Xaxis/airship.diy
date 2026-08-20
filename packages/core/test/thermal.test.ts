import { describe, expect, it } from 'vitest'
import { K } from '@airship/units'
import type { SquareMeters } from '@airship/units'

import {
  designThermalCase,
  diurnalThermalCycle,
  envelopeTemperature,
  externalConvection,
  skyTemperature,
  surfaceIrradiance,
} from '../src/thermal.js'

/**
 * The hull's energy balance.
 *
 * This module replaced a literal: the design was graded against 20 K of solar
 * superheat, asserted, with no supercooling counterpart at all. The tests are
 * mostly about the SHAPE of the answer, since there is no published superheat
 * measurement for this vehicle and inventing one would defeat the purpose.
 *
 * SOLAR GEOMETRY IS NOT TESTED HERE any more. This module used to carry its own
 * declination and air mass, duplicating `solar.ts`, and those tests went with
 * the duplicate.
 */

/** @derived A representative hull: 118 m, 13,000 m2 of skin, 2.1 t of hydrogen. */
const HULL_LENGTH = 118
const ENVELOPE_AREA = 13000 as SquareMeters
const GAS_MASS = 2100
const HYDROGEN_SPECIFIC_HEAT = 14304
const AMBIENT = K(275.15)
/** @derived Station altitude, m. The optical path scales with pressure. */
const ALTITUDE = 2000

const conditions = (over: Record<string, unknown> = {}) => ({
  airTemperature: AMBIENT,
  surfaceTemperature: AMBIENT,
  airspeed: 0,
  hullLength: HULL_LENGTH,
  /** @derived Kinematic viscosity of air near 2 km, m2/s. */
  kinematicViscosity: 1.7e-5,
  arrayCoverage: 0.25,
  arrayEfficiency: 0.21,
  surfaceAlbedo: 0.06,
  cloudCover: 0,
  altitude: ALTITUDE,
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

describe('irradiance at the hull', () => {
  it('is taken at ALTITUDE, which the first version of this module ignored', () => {
    // The duplicate solar model this file used to test had no altitude term, so
    // it computed the superheat of a vehicle at 2 km from sea-level irradiance
    // and understated the gain on the surface it was solving for.
    const high = surfaceIrradiance(15, 172, 12, 4000)
    const low = surfaceIrradiance(15, 172, 12, 0)
    expect(high.directNormal).toBeGreaterThan(low.directNormal)
  })

  it('DIMS the sun under cloud as well as warming the sky', () => {
    // THE BUG THIS TEST EXISTS FOR. An early version applied cloud only to the
    // sky's radiative temperature, so an overcast day came out with more solar
    // gain than a clear one, which is not what overcast does.
    const clear = surfaceIrradiance(15, 172, 12, ALTITUDE, 0)
    const overcast = surfaceIrradiance(15, 172, 12, ALTITUDE, 1)
    expect(overcast.globalHorizontal).toBeLessThan((clear.globalHorizontal as number) * 0.4)
    // Under full overcast there is no beam left, only a bright dome.
    expect(overcast.directNormal).toBe(0)
  })

  it('rejects a cloud fraction that is not a fraction', () => {
    expect(() => surfaceIrradiance(15, 172, 12, ALTITUDE, 1.4)).toThrow(RangeError)
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
    // an order of magnitude: the turbulent correlation goes as Re^0.8, so
    // 8 m/s over a 118 m hull buys 11 W/(m2 K) against 2.5 in still air.
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
      surfaceIrradiance(15, 172, 0, ALTITUDE),
      conditions(),
    ) as number
    expect(night).toBeLessThan(AMBIENT as number)
  })

  it('runs above ambient in the sun', () => {
    const day = envelopeTemperature(
      AMBIENT,
      surfaceIrradiance(15, 172, 12, ALTITUDE),
      conditions(),
    ) as number
    expect(day).toBeGreaterThan(AMBIENT as number)
  })

  it('gets hotter as the array covers more of it', () => {
    // The array is nearly black in the solar band by design and the cover is
    // deliberately not, so coverage is a thermal decision as well as a power
    // one. This is the coupling the old 20 K literal hid.
    const at = (arrayCoverage: number) =>
      envelopeTemperature(
        AMBIENT,
        surfaceIrradiance(15, 172, 12, ALTITUDE),
        conditions({ arrayCoverage }),
      ) as number
    expect(at(1)).toBeGreaterThan(at(0) + 5)
  })

  it('rejects a coverage that is not a fraction of the hull', () => {
    expect(() =>
      envelopeTemperature(
        AMBIENT,
        surfaceIrradiance(15, 172, 12, ALTITUDE),
        conditions({ arrayCoverage: 2 }),
      ),
    ).toThrow(RangeError)
  })
})

describe('the diurnal cycle', () => {
  it('peaks after solar noon, because the gas lags the skin', () => {
    // The lag is the point. The envelope is thin and follows the sun within a
    // minute; the gas carries the heat capacity of the whole lifting volume and
    // takes tens of minutes, so the excursion is not symmetric about noon.
    const day = cycle()
    expect(day.peakSuperheatHour).toBeGreaterThan(12)
    expect(day.peakSuperheatHour).toBeLessThan(17)
  })

  it('supercools before dawn under a clear sky', () => {
    const day = cycle()
    expect(day.peakSupercooling).toBeGreaterThan(1)
    expect(day.peakSupercoolingHour).toBeLessThan(9)
  })

  it('halves the swing at cruise speed', () => {
    expect(cycle({ airspeed: 8 }).diurnalSwing).toBeLessThan(cycle().diurnalSwing * 0.6)
  })
})

describe('what cloud does, which is not what it looks like', () => {
  it('RAISES the mean temperature even though it cuts the sun', () => {
    // THE RESULT WORTH ARGUING WITH, and it reversed when this module stopped
    // carrying its own solar code. Cloud blocks the night-time radiative loss
    // for twenty-four hours a day while only cutting the solar gain for twelve,
    // so the daily MEAN envelope temperature rises. A gas node with a
    // twenty-minute time constant tracks that mean.
    //
    // THE LIMITATION THAT GOES WITH IT, stated because it bounds the result:
    // ambient air temperature is an INPUT here and does not respond to cloud.
    // In reality the same blanket that keeps the hull warm keeps the air warm,
    // which is why cloudy nights are mild, so gas-minus-ambient under overcast
    // is overstated by this model. The honest reading is that cloud does not
    // reduce the thermal problem, not that it makes it dramatically worse.
    expect(cycle({ cloudCover: 1 }).peakSuperheat).toBeGreaterThan(cycle().peakSuperheat)
    // And it very nearly abolishes supercooling, which is the same effect seen
    // from the other side.
    expect(cycle({ cloudCover: 1 }).peakSupercooling).toBeLessThan(1)
  })

  it('leaves the SWING, which is what the ballast tracks, nearly unmoved', () => {
    // The robust quantity. Superheat and supercooling trade off against each
    // other as cloud varies, and their sum barely moves, so a ballast loop
    // sized on the swing is not sensitive to the weather assumption.
    const swings = [0, 0.5, 1].map((cloudCover) => cycle({ cloudCover }).diurnalSwing)
    const spread = Math.max(...swings) / Math.min(...swings)
    expect(spread).toBeLessThan(1.1)
  })
})

describe('the design case', () => {
  it('takes the worst of each excursion, which occur under different skies', () => {
    const worst = designThermalCase({
      latitude: 15,
      dayOfYear: 172,
      gasMass: GAS_MASS,
      gasSpecificHeat: HYDROGEN_SPECIFIC_HEAT,
      envelopeArea: ENVELOPE_AREA,
      airTemperatureSwing: 6,
      conditions: conditions(),
    })
    // Superheat is worst under heavy cloud and supercooling under a clear sky,
    // so a system that must survive both is sized on the sum rather than on any
    // single day's swing.
    expect(worst.superheatCloudCover).toBeGreaterThan(0.5)
    expect(worst.supercoolingCloudCover).toBe(0)
    expect(worst.swing).toBeCloseTo(worst.superheat + worst.supercooling, 9)
    expect(worst.swing).toBeGreaterThan(cycle().diurnalSwing)
  })
})
