import { describe, expect, it } from 'vitest'
import { ISA, ISA_TABLE } from '@airship/data'
import { fromCelsius, fraction, K, m, Pa } from '@airship/units'
import { atmosphere, pressureAltitude, saturationVapourPressure } from '../src/atmosphere.js'

/**
 * VALIDATION GATE 4.1: reproduce published ISA values to within 0.1 percent at
 * 0, 1000, 5000, 11000 and 20000 m.
 *
 * Nothing downstream is trustworthy until this passes, because every lift
 * number in the project is a difference between two densities and both of them
 * come from here.
 */
describe('validation gate: ISA standard atmosphere', () => {
  const TOLERANCE = 0.001

  for (const row of ISA_TABLE) {
    describe(`at ${row.altitude} m geopotential`, () => {
      const state = atmosphere(m(row.altitude))

      it('reproduces published temperature', () => {
        expect(Math.abs(state.temperature / row.temperature - 1)).toBeLessThan(TOLERANCE)
      })

      it('reproduces published pressure', () => {
        expect(Math.abs(state.pressure / row.pressure - 1)).toBeLessThan(TOLERANCE)
      })

      it('reproduces published density', () => {
        expect(Math.abs(state.density / row.density - 1)).toBeLessThan(TOLERANCE)
      })

      it('reproduces published speed of sound', () => {
        expect(Math.abs(state.speedOfSound / row.speedOfSound - 1)).toBeLessThan(TOLERANCE)
      })
    })
  }

  it('computes sea level density from the other defining constants', () => {
    // ISA states 1.225 kg/m3 directly AND defines it implicitly through T0, p0,
    // R and M. The two must agree, or one of the four constants is wrong.
    const state = atmosphere(m(0))
    expect(Math.abs(state.density / ISA.seaLevelDensity.value - 1)).toBeLessThan(1e-5)
  })

  it('chains the layers continuously at the tropopause', () => {
    const below = atmosphere(m(10999))
    const above = atmosphere(m(11001))
    expect(Math.abs(above.pressure / below.pressure - 1)).toBeLessThan(1e-3)
    expect(Math.abs(above.temperature - below.temperature)).toBeLessThan(0.02)
  })

  it('refuses to extrapolate outside its stated validity range', () => {
    expect(() => atmosphere(m(40000))).toThrow(RangeError)
    expect(() => atmosphere(m(-2000))).toThrow(RangeError)
  })
})

describe('geopotential and geometric altitude', () => {
  it('differ by about 63 m at 20 km, which is 0.3 percent in pressure', () => {
    // Three times the validation tolerance. This is why the atmosphere function
    // takes geopotential altitude and says so.
    const geopotential = 20000
    const geometric = 20063.2
    const state = atmosphere(m(geopotential))
    const wrong = atmosphere(m(geometric))
    expect(Math.abs(wrong.pressure / state.pressure - 1)).toBeGreaterThan(0.002)
  })

  it('round-trips', () => {
    const geometric = m(15000)
    const back = atmosphere(m(0))
    expect(back.altitude).toBe(0)
    expect(Math.abs(geometric - 15000)).toBeLessThan(1e-9)
  })
})

describe('non-standard days', () => {
  it('an ISA+20 day at sea level costs 6.49 percent of density', () => {
    const standard = atmosphere(m(0))
    const hot = atmosphere(m(0), { temperatureOffset: K(20) })
    const loss = 1 - hot.density / standard.density
    // Density scales as 1/T at fixed pressure: 1 - 288.15/308.15 = 6.49 percent.
    // ASSERT THE VALUE, not a band. The band 0.06 to 0.07 passed for 6.49, for
    // the 6.6 in the old title, and for the 7 percent the source docstring
    // claimed, so it could not tell the three apart and none of them was ever
    // checked against the model.
    expect(loss).toBeCloseTo(1 - 288.15 / 308.15, 6)
  })

  it('humid air is LESS dense than dry air, not more', () => {
    // The correction people leave out, and they leave it out in the direction
    // that flatters the design.
    const dry = atmosphere(m(0), { temperatureOffset: K(15) })
    const humid = atmosphere(m(0), { temperatureOffset: K(15), relativeHumidity: fraction(1) })
    expect(humid.density).toBeLessThan(dry.density)
  })

  it('saturated air at 30 C costs roughly 2 percent of density', () => {
    const offset = K(15)
    const dry = atmosphere(m(0), { temperatureOffset: offset })
    const humid = atmosphere(m(0), { temperatureOffset: offset, relativeHumidity: fraction(1) })
    const loss = 1 - humid.density / dry.density
    // Same reason: this band admitted both 1.58 and the 1.9 the docstring
    // claimed.
    expect(loss).toBeCloseTo(0.01584, 4)
  })

  it('reproduces the saturation vapour pressure of water at 100 C', () => {
    // Buck's equation is fitted below 50 C, so agreement to about 1 percent at
    // the boiling point is the expected behaviour rather than a failure.
    const p = saturationVapourPressure(fromCelsius(100))
    expect(Math.abs(p / 101325 - 1)).toBeLessThan(0.02)
  })

  it('reproduces the saturation vapour pressure of water at 20 C', () => {
    // Published value 2338.8 Pa.
    const p = saturationVapourPressure(fromCelsius(20))
    expect(Math.abs(p / 2338.8 - 1)).toBeLessThan(0.005)
  })
})

describe('pressure altitude', () => {
  it('inverts the pressure profile through the troposphere', () => {
    for (const h of [0, 500, 2000, 4000, 8000, 10000]) {
      const state = atmosphere(m(h))
      expect(Math.abs(pressureAltitude(state.pressure) - h)).toBeLessThan(0.5)
    }
  })

  it('inverts above the tropopause too', () => {
    const state = atmosphere(m(15000))
    expect(Math.abs(pressureAltitude(state.pressure) - 15000)).toBeLessThan(1)
  })

  it('returns sea level for standard pressure', () => {
    expect(Math.abs(pressureAltitude(Pa(101325)))).toBeLessThan(1e-6)
  })
})
