import { describe, expect, it } from 'vitest'

import {
  boatResistance,
  cushionFeasibility,
  effectiveHeaveInertia,
  reliefPressureFor,
  reliefVentArea,
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
  const INERTIA = effectiveHeaveInertia(kg(24516), 31657)

  it('counts the air the hull drags with it, which is more than half the inertia', () => {
    // The wave does not have to accelerate the ship, it has to accelerate the
    // ship AND 35 tonnes of air. Leaving the added mass out makes the vehicle
    // look responsive in heave when it is the opposite.
    expect(INERTIA).toBeGreaterThan(24516 * 2)
    expect(INERTIA - 24516).toBeCloseTo(0.894 * 1.225 * 31657, -2)
  })

  it('overloads a rigid hull in a 0.3 m sea', () => {
    // Sea state 2 is "smooth". A rigid waterplane turns it into 124 kN against
    // a 50 kN flight design load, and this is the finding that changed the
    // landing gear.
    const k = seakeeping(2, RIGID, SUSPENSION_DESIGN, INERTIA)
    expect(k.acceptable).toBe(false)
    expect(k.utilisation).toBeGreaterThan(2)
  })

  it('limits a rigid hull to a flat calm', () => {
    expect(maximumSeaState(RIGID, SUSPENSION_DESIGN, INERTIA)).toBe(1)
  })

  it('finds the rigid hull resonant in the shortest sea, not the biggest', () => {
    // A two second heave period on a two second chop. The load is amplified
    // rather than quasi-static, and it is the calmest tabulated state that does
    // it, which is not where anyone looks.
    expect(seakeeping(1, RIGID, SUSPENSION_DESIGN, INERTIA).nearResonance).toBe(true)
    expect(seakeeping(4, RIGID, SUSPENSION_DESIGN, INERTIA).nearResonance).toBe(false)
  })

  it('makes a SEALED pneumatic bag far WORSE than the hull it replaces', () => {
    // THE CORRECTION THAT MATTERED. A sealed bag is a gas spring at ABSOLUTE
    // pressure, so its stiffness is P_abs*A/t and not P_gauge*A/t. At 0.35 kPa
    // gauge on 101 kPa absolute it is nearly sixty times stiffer than the
    // waterplane. The force-limiter argument is not optimistic there, it is
    // inverted, and the first version of this module had it inverted.
    const sealed: FloatType = {
      kind: 'sealed-pneumatic',
      contactArea: WATERPLANE,
      gaugePressure: reliefPressureFor(SUSPENSION_DESIGN, WATERPLANE),
      thickness: 0.5,
    }
    const rigidLoad = seakeeping(2, RIGID, SUSPENSION_DESIGN, INERTIA).suspensionLoad
    const sealedLoad = seakeeping(2, sealed, SUSPENSION_DESIGN, INERTIA).suspensionLoad
    expect(sealedLoad).toBeGreaterThan(rigidLoad * 5)
    expect(maximumSeaState(sealed, SUSPENSION_DESIGN, INERTIA)).toBeNull()
  })

  it('makes a VENTED bag work, and only because it vents', () => {
    const vented: FloatType = {
      kind: 'vented-pneumatic',
      contactArea: WATERPLANE,
      reliefPressure: reliefPressureFor(SUSPENSION_DESIGN, WATERPLANE),
    }
    expect(maximumSeaState(vented, SUSPENSION_DESIGN, INERTIA)).toBe(6)
    expect(seakeeping(4, vented, SUSPENSION_DESIGN, INERTIA).forceLimited).toBe(true)
  })

  it('sizes the relief setting for the measured overshoot, not the nominal', () => {
    // The XC-8A pulled 2.2 to 3.3 times its nominal pressure on every water
    // landing it made. A relief valve does not dump air instantly.
    const naive = SUSPENSION_DESIGN / WATERPLANE
    expect(reliefPressureFor(SUSPENSION_DESIGN, WATERPLANE)).toBeLessThan(naive / 2)
  })

  it('demands a relief vent big enough to be a design feature', () => {
    // A third of a square metre. Undersize it and the bag reverts to the sealed
    // case, which is worse than no bag at all.
    const area = reliefVentArea(2, 0.4, reliefPressureFor(SUSPENSION_DESIGN, WATERPLANE))
    expect(area).toBeGreaterThan(0.1)
  })
})

describe('an air cushion cannot make a cushion here', () => {
  it('reproduces the XC-8A depression depth from its published cushion pressure', () => {
    // 8,140 Pa over seawater is 0.81 m, and NASA CR-159002 publishes 0.82.
    // The relation is validated before it is used to kill anything.
    const xc8a = cushionFeasibility(kg(17735), 21.4, 19.8, 1.5)
    expect(xc8a.depressionDepth).toBeCloseTo(0.82, 1)
  })

  it('gives a buoyant airship a twelve millimetre cushion', () => {
    // Cushion pressure is weight over area, and a buoyant vehicle has almost no
    // weight. An ACLS is a HEAVY vehicle's device.
    const airship = cushionFeasibility(kg(800), 80, 48, 0.3)
    expect(airship.depressionDepth).toBeLessThan(0.02)
    expect(airship.viable).toBe(false)
    expect(airship.waveHead / airship.cushionPressure).toBeGreaterThan(20)
  })

  it('still charges kilowatts for the privilege', () => {
    expect(cushionFeasibility(kg(800), 80, 48, 0.3).fanPower).toBeGreaterThan(1000)
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
