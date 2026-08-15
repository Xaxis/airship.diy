import { describe, expect, it } from 'vitest'

import {
  boatResistance,
  cushionPressureFor,
  froudeNumber,
  frictionCoefficient,
  hullSpeed,
  maximumSeaState,
  porpoisingSpeed,
  seakeeping,
  waterTouchdown,
  windwardSpeed,
} from '../src/index.js'
import type { FloatType } from '../src/index.js'
import { kg, m, N } from '@airship/units'

/**
 * The marine case, which is not a boat case.
 *
 * The load on the water is the static heaviness, so the vehicle is a cork with
 * a 115 m sail on it. Every test here is really checking that the model has not
 * quietly reverted to boat intuition.
 */

/** The baseline gondola: 20 m long, 4.4 m wide, 17 m on the waterline. */
const WATERLINE = m(17)
const WATERPLANE = 56
const ENVELOPE = 31657
const HEAVY = kg(800)
/** Gondola mass times a gust factor: what the suspension is sized by in flight. */
const SUSPENSION_DESIGN = N(2030 * 9.80665 * 2.5)

describe('hull speed and the Froude number', () => {
  it('matches the 1.34 sqrt(L_ft) rule of thumb', () => {
    // The imperial rule in knots, converted, is the same equation.
    const lengthFeet = 100
    const imperial = 1.34 * Math.sqrt(lengthFeet) * 0.514444
    expect(hullSpeed(m(lengthFeet * 0.3048))).toBeCloseTo(imperial, 1)
  })

  it('is Froude 0.4, which is where wave-making starts to bite', () => {
    expect(froudeNumber(hullSpeed(WATERLINE), WATERLINE)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 4)
  })

  it('puts the porpoising limit well above hull speed', () => {
    // Not a contradiction. A hull carrying its own weight cannot pass hull
    // speed; this one carries two percent of it, so it walks through the hump
    // and runs into dynamic instability instead.
    expect(porpoisingSpeed(WATERLINE)).toBeGreaterThan(hullSpeed(WATERLINE))
  })
})

describe('the ITTC 1957 friction line', () => {
  it('gives the published coefficient at Re = 1e6', () => {
    // 0.075 / (6 - 2)^2 = 0.0046875, which is the textbook value.
    expect(frictionCoefficient(1e6)).toBeCloseTo(0.0046875, 6)
  })

  it('falls with Reynolds number', () => {
    expect(frictionCoefficient(1e9)).toBeLessThan(frictionCoefficient(1e6))
  })

  it('is zero rather than infinite at rest', () => {
    expect(frictionCoefficient(0)).toBe(0)
  })
})

describe('resistance is mostly air', () => {
  it('is dominated by aerodynamic drag at every useful speed', () => {
    // THE marine result. The vehicle does not fight the water, it fights the
    // air, because it is displacing 0.8 m3 and presenting 31,657 m3 to the wind.
    for (const speed of [1, 2, 3, 4]) {
      const r = boatResistance(HEAVY, WATERLINE, speed, ENVELOPE)
      expect(`${speed}: ${r.aerodynamicFraction > 0.5}`).toBe(`${speed}: true`)
    }
  })

  it('scales the aerodynamic term with the square of speed plus headwind', () => {
    const still = boatResistance(HEAVY, WATERLINE, 2, ENVELOPE, 0)
    const blowing = boatResistance(HEAVY, WATERLINE, 2, ENVELOPE, 2)
    // Airspeed doubles from 2 to 4, so the aerodynamic term quadruples.
    expect(blowing.aerodynamic / still.aerodynamic).toBeCloseTo(4, 1)
  })

  it('has a wave-making hump between Froude 0.35 and 0.5', () => {
    const before = boatResistance(HEAVY, WATERLINE, 2, ENVELOPE).residuary
    const hump = boatResistance(HEAVY, WATERLINE, 6.2, ENVELOPE).residuary
    expect(hump).toBeGreaterThan(before * 20)
  })

  it('needs no meaningful power to move at all in still air', () => {
    // Under a kilowatt at 3 m/s. The hull is not the problem and never was.
    expect(boatResistance(HEAVY, WATERLINE, 3, 0).effectivePower).toBeLessThan(1000)
  })
})

describe('making way against wind', () => {
  /** Four propulsors, momentum-theory static thrust, roughly 8.9 kN total. */
  const THRUST = N(8900)

  it('is limited by porpoising rather than by power in a calm', () => {
    const p = windwardSpeed(THRUST, 0, HEAVY, WATERLINE, ENVELOPE)
    expect(p.porpoisingLimited).toBe(true)
    expect(p.speed).toBeCloseTo(porpoisingSpeed(WATERLINE), 3)
  })

  it('loses speed made good roughly linearly with wind', () => {
    const calm = windwardSpeed(THRUST, 0, HEAVY, WATERLINE, ENVELOPE).speed
    const blowing = windwardSpeed(THRUST, 12, HEAVY, WATERLINE, ENVELOPE).speed
    expect(blowing).toBeLessThan(calm)
    expect(blowing).toBeGreaterThan(0)
  })

  it('is blown backwards somewhere under 20 m/s', () => {
    // The number that decides whether marine mode is an escape or a trap. A
    // vehicle that cannot motor to windward in a gale is going wherever the
    // gale goes, and the sea anchor is the only remaining plan.
    const p = windwardSpeed(THRUST, 20, HEAVY, WATERLINE, ENVELOPE)
    expect(p.overpowered).toBe(true)
    expect(p.speed).toBe(0)
  })

  it('reports the wind at which it stalls', () => {
    const p = windwardSpeed(THRUST, 5, HEAVY, WATERLINE, ENVELOPE)
    expect(p.stallWind).toBeGreaterThan(10)
    expect(p.stallWind).toBeLessThan(25)
  })

  it('does better with a smaller envelope, which is the whole coupling', () => {
    const big = windwardSpeed(THRUST, 10, HEAVY, WATERLINE, ENVELOPE).speed
    const small = windwardSpeed(THRUST, 10, HEAVY, WATERLINE, ENVELOPE / 4).speed
    expect(small).toBeGreaterThan(big)
  })
})

describe('seakeeping: the vehicle is picked up, not slammed', () => {
  const RIGID: FloatType = { kind: 'rigid', waterplaneArea: WATERPLANE }

  it('overloads a rigid hull in a 0.3 m sea', () => {
    // Sea state 2 is "smooth". A rigid waterplane turns it into 85 kN against a
    // 50 kN flight design load, and this is the finding that changed the
    // landing gear.
    const k = seakeeping(2, RIGID, SUSPENSION_DESIGN)
    expect(k.acceptable).toBe(false)
    expect(k.utilisation).toBeGreaterThan(1.5)
  })

  it('limits a rigid hull to a flat calm', () => {
    expect(maximumSeaState(RIGID, SUSPENSION_DESIGN)).toBe(1)
  })

  it('lets a pneumatic cushion sized to the suspension survive any tabulated sea', () => {
    // A cushion cannot push harder than its gauge pressure times its contact
    // area. Past that it squashes. The sea state stops being a structural
    // question and becomes a regulator setting.
    const pressure = cushionPressureFor(SUSPENSION_DESIGN, WATERPLANE)
    const cushion: FloatType = {
      kind: 'pneumatic',
      contactArea: WATERPLANE,
      gaugePressure: pressure,
    }
    expect(maximumSeaState(cushion, SUSPENSION_DESIGN)).toBe(6)
    expect(seakeeping(6, cushion, SUSPENSION_DESIGN).forceLimited).toBe(true)
  })

  it('needs an absurdly low cushion pressure, which is the point', () => {
    // Under a kilopascal. A fifth of a car tyre would be ten times too stiff.
    const pressure = cushionPressureFor(SUSPENSION_DESIGN, WATERPLANE)
    expect(pressure).toBeLessThan(2000)
    expect(pressure).toBeGreaterThan(100)
  })

  it('is not force limited in a calm, so the cushion is not always saturated', () => {
    const pressure = cushionPressureFor(SUSPENSION_DESIGN, WATERPLANE)
    const cushion: FloatType = {
      kind: 'pneumatic',
      contactArea: WATERPLANE,
      gaugePressure: pressure,
    }
    expect(seakeeping(1, cushion, SUSPENSION_DESIGN).forceLimited).toBe(false)
  })
})

describe('touching down', () => {
  it('is gentle, because almost nothing is resting on the water', () => {
    const t = waterTouchdown(1.0, WATERPLANE, HEAVY, kg(24516), m(1.8))
    expect(t.loadFactor).toBeLessThan(1)
    expect(t.submerged).toBe(false)
  })

  it('immerses further the faster it arrives', () => {
    const slow = waterTouchdown(0.5, WATERPLANE, HEAVY, kg(24516), m(1.8))
    const fast = waterTouchdown(2.0, WATERPLANE, HEAVY, kg(24516), m(1.8))
    expect(fast.immersion).toBeGreaterThan(slow.immersion)
  })

  it('reports submergence rather than pretending the hull is bottomless', () => {
    const t = waterTouchdown(5, WATERPLANE, HEAVY, kg(24516), m(0.4))
    expect(t.submerged).toBe(true)
    expect(t.reason).toContain('goes under')
  })

  it('is harder on a heavier trim, which is the argument for landing light', () => {
    const light = waterTouchdown(1, WATERPLANE, kg(300), kg(24516), m(1.8))
    const heavy = waterTouchdown(1, WATERPLANE, kg(3000), kg(24516), m(1.8))
    expect(heavy.immersion).toBeGreaterThan(light.immersion)
  })
})
