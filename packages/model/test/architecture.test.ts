import { describe, expect, it } from 'vitest'

import {
  ARCHITECTURES,
  BASELINE,
  BASELINE_ARRANGEMENT,
  buoyancyControlCost,
  compareArchitecture,
  hullBendingMoment,
  massStatement,
  pressureStabilisedLimit,
  architecture,
} from '../src/index.js'

/**
 * Five architectures on one basis.
 *
 * Each is calibrated on a vehicle that flew, and the tests check the
 * calibration rather than the conclusion: a model that reproduces the Zeppelin
 * NT and the Airlander can be argued with, and one that does not cannot.
 */

const GROSS = massStatement(BASELINE, BASELINE_ARRANGEMENT).total
const GIRDER = hullBendingMoment(BASELINE, BASELINE_ARRANGEMENT)
const at = (id: Parameters<typeof architecture>[0]) =>
  compareArchitecture(architecture(id), 115, 5, 0.69, GROSS, 12, 0.221, GIRDER.designMoment)

describe('the hull girder', () => {
  it('is sized by the gust rather than by the static case', () => {
    // And the gust case for an airship gets WORSE as it slows down, because
    // incidence is atan(gust/speed) and the Munk moment peaks at 45 degrees.
    // Station-keeping is therefore the structural design condition, which is
    // the reverse of an aeroplane.
    expect(GIRDER.gustMoment).toBeGreaterThan(GIRDER.staticMoment)
    expect(GIRDER.designMoment).toBe(GIRDER.gustMoment)
    expect(GIRDER.note).toContain('gust sizes the girder')
  })

  it('sees a very large incidence at station-keeping speed', () => {
    expect((GIRDER.gustIncidence * 180) / Math.PI).toBeGreaterThan(30)
  })

  it('has a static moment small enough to confirm the frame is buckling limited', () => {
    // Half a meganewton metre on a 115 m hull needs about a cubic decimetre of
    // section modulus, which is minimum gauge everywhere. That agrees with the
    // buckling module and it is why the static case is not the design case.
    expect(GIRDER.staticMoment).toBeLessThan(1e6)
  })
})

describe('pressure stabilisation', () => {
  it('is governed by dynamic pressure, not by bending', () => {
    // The correction that mattered. Bending needs 2 mbar on this hull and
    // holding shape at 30 m/s needs 8, which is why the Zeppelin NT runs 5 and
    // not 1.
    const limit = pressureStabilisedLimit(GIRDER.designMoment, 11.5)
    expect(limit.governedBy).toBe('dynamic pressure')
    expect(limit.aerodynamicPressure).toBeGreaterThan(limit.wrinklingPressure * 3)
  })

  it('is comfortably available at this hull size', () => {
    expect(pressureStabilisedLimit(GIRDER.designMoment, 11.5).withinLimit).toBe(true)
  })

  it('runs out somewhere near two hundred metres of hull', () => {
    // Above the 75 m Zeppelin NT and the 98 m Airlander, and below the 245 m
    // Hindenburg, which was rigid because nothing else works there. A model
    // that put this limit anywhere else would be contradicting the fleet.
    const at150 = pressureStabilisedLimit(3e6, 150 / 5 / 2)
    const at250 = pressureStabilisedLimit(1e7, 250 / 5 / 2)
    expect(at150.withinLimit).toBe(true)
    expect(at250.withinLimit).toBe(false)
  })

  it('grows the fabric load linearly with radius', () => {
    // Because the governing pressure does not fall with size and the load is
    // p times R. This is the whole reason a size limit exists.
    const small = pressureStabilisedLimit(1e6, 10)
    const large = pressureStabilisedLimit(1e6, 20)
    expect(large.fabricLoad / small.fabricLoad).toBeCloseTo(2, 1)
  })
})

describe('structural mass, calibrated', () => {
  it('makes semi-rigid substantially lighter than rigid', () => {
    // The reason semi-rigid is worth considering at all: a keel truss scaled
    // from the Zeppelin NT against a full carbon frame.
    expect(at('semi-rigid').structure.total).toBeLessThan(at('rigid').structure.total * 0.7)
  })

  it('makes non-rigid the lightest of all, and unusable for other reasons', () => {
    const nonRigid = at('non-rigid')
    expect(nonRigid.structure.frame).toBe(0)
    expect(nonRigid.structure.total).toBeLessThan(at('semi-rigid').structure.total)
    expect(nonRigid.damageTolerance).toContain('loses the ship')
  })

  it('charges hybrid-lift for its diaphragms', () => {
    expect(at('hybrid-lift').structure.containment).toBeGreaterThan(
      at('non-rigid').structure.containment,
    )
  })

  it('gives only rigid architectures independent cells', () => {
    for (const a of ARCHITECTURES) {
      const independent = a.containment === 'independent-cells'
      expect(`${a.id}: ${independent}`).toBe(
        `${a.id}: ${a.id === 'rigid' || a.id === 'variable-buoyancy'}`,
      )
    }
  })

  it('makes a torn cell survivable only on a rigid', () => {
    expect(at('rigid').damageTolerance).toContain('incident rather than an ending')
    expect(at('semi-rigid').damageTolerance).toContain('loses the ship')
  })
})

describe('buoyancy control, which settles the variable-buoyancy question', () => {
  const AUTHORITY = 2000

  it('makes gas compression forty times heavier than water for the same authority', () => {
    const water = buoyancyControlCost('water-ballast', AUTHORITY, 'hydrogen')
    const compression = buoyancyControlCost('gas-compression', AUTHORITY, 'hydrogen')
    expect(compression.systemMass / water.systemMass).toBeGreaterThan(30)
  })

  it('costs about a megajoule per kilogram of lift traded, against ten joules for water', () => {
    const water = buoyancyControlCost('water-ballast', AUTHORITY, 'hydrogen')
    const compression = buoyancyControlCost('gas-compression', AUTHORITY, 'hydrogen')
    expect(compression.energyPerKilogram).toBeGreaterThan(5e5)
    expect(compression.energyPerKilogram).toBeLessThan(2e6)
    expect(compression.energyPerKilogram / water.energyPerKilogram).toBeGreaterThan(1e4)
  })

  it('is the only non-renewable option, which is the argument FOR it', () => {
    // Over a desert the water runs out and the gas does not. Over an ocean it
    // is the other way round, and this vehicle lives over an ocean.
    expect(buoyancyControlCost('gas-compression', AUTHORITY, 'hydrogen').renewable).toBe(false)
    expect(buoyancyControlCost('water-ballast', AUTHORITY, 'hydrogen').renewable).toBe(true)
  })

  it('costs more for helium than hydrogen, because helium releases less lift per kg', () => {
    const h2 = buoyancyControlCost('gas-compression', AUTHORITY, 'hydrogen')
    const he = buoyancyControlCost('gas-compression', AUTHORITY, 'helium')
    expect(he.systemMass).toBeGreaterThan(h2.systemMass)
  })
})

describe('hybrid-lift against a station-keeping mission', () => {
  it('cannot hover, and every other architecture can', () => {
    for (const a of ARCHITECTURES) {
      const canHover = at(a.id).canHover
      expect(`${a.id}: ${canHover}`).toBe(`${a.id}: ${a.id !== 'hybrid-lift'}`)
    }
  })

  it('names the speed it must hold forever', () => {
    const vehicle = at('hybrid-lift')
    expect(vehicle.minimumFlyingSpeed).toBeGreaterThan(5)
    expect(vehicle.verdict).toContain('or descend')
  })
})

describe('the comparison as a whole', () => {
  it('leaves only rigid without a disqualifying finding', () => {
    const clean = ARCHITECTURES.filter((a) => at(a.id).verdict.includes('Nothing disqualifies'))
    expect(clean.map((a) => a.id)).toEqual(['rigid'])
  })

  it('states what every architecture is calibrated on', () => {
    for (const a of ARCHITECTURES) {
      expect(`${a.id}: ${a.calibratedOn.length > 20}`).toBe(`${a.id}: true`)
    }
  })
})
