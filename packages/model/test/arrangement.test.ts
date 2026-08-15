import { describe, expect, it } from 'vitest'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  compartmentVolume,
  massStatement,
  smallestClosingLength,
  validateArrangement,
} from '../src/index.js'
import type { Configuration } from '../src/index.js'

/**
 * The arrangement has to survive the rules the rest of the project derived, and
 * it has to keep surviving them when the hull changes. Half of these tests are
 * about the second thing: a mass budget that only closes at one length is a
 * coincidence, not a design.
 */

const at = (length: number) => ({ ...BASELINE, hull: { ...BASELINE.hull, length } })

describe('compartment volumes', () => {
  it('scales as the cube of hull length, because the box is defined in radii', () => {
    const c = { station: 0.5, extent: 0.1, halfWidth: 0.3, height: 0.3 }
    const small = compartmentVolume(c, 90, 5, 0.69)
    const large = compartmentVolume(c, 180, 5, 0.69)
    expect(large / small).toBeCloseTo(8, 2)
  })

  it('shrinks toward the ends, where the hull tapers', () => {
    const shape = { extent: 0.06, halfWidth: 0.3, height: 0.3 }
    const amidships = compartmentVolume({ ...shape, station: 0.45 }, 115, 5, 0.69)
    const aft = compartmentVolume({ ...shape, station: 0.9 }, 115, 5, 0.69)
    expect(aft).toBeLessThan(amidships * 0.5)
  })

  it('is zero for a compartment with no extent', () => {
    expect(compartmentVolume({ station: 0.5, extent: 0, halfWidth: 0.3, height: 0.3 }, 115, 5, 0.69)).toBe(0)
  })
})

describe('the mass statement', () => {
  const s = massStatement(BASELINE, BASELINE_ARRANGEMENT)

  it('has a centre of gravity below the centre of buoyancy', () => {
    // The whole static stability of the vehicle. Without it there is no
    // restoring moment in pitch or roll at all.
    expect(s.centreOfGravity.z).toBeLessThan(s.centreOfBuoyancy.z)
  })

  it('puts the centre of buoyancy forward of midships', () => {
    // The hull has a blunt nose and a fine tail, so the volume is forward. If
    // this ever comes out aft of 0.5 the shape function has been broken.
    expect(s.centreOfBuoyancy.x / BASELINE.hull.length).toBeGreaterThan(0.38)
    expect(s.centreOfBuoyancy.x / BASELINE.hull.length).toBeLessThan(0.5)
  })

  it('takes the keel corridor out of the gas volume', () => {
    expect(s.gasVolume).toBeLessThan(32000)
    expect(s.keelEnvelope).toBeGreaterThan(0)
  })

  it('does not count the keel bays on top of the corridor that contains them', () => {
    // Summing the bays would count the same cubic metres several times and
    // charge the gas volume for all of them.
    const bays = BASELINE_ARRANGEMENT.compartments
      .filter((c) => c.deck === 'keel' && c.id !== 'keel-structure')
      .reduce((sum, c) => sum + compartmentVolume(c, BASELINE.hull.length, 5, 0.69), 0)
    expect(bays).toBeGreaterThan(0)
    expect(s.keelEnvelope).toBeGreaterThan(bays)
  })

  it('reports empty weight separately from gross', () => {
    expect(s.emptyWeight).toBeLessThan(s.total)
    const disposable = s.byCategory.consumable + s.byCategory.crew
    expect(s.total - s.emptyWeight).toBeCloseTo(disposable, 6)
  })

  it('takes the binding lift condition rather than the flattering one', () => {
    expect(s.grossLift).toBe(Math.min(s.liftAtSeaLevel, s.liftAtAltitude))
  })

  it('does not multiply altitude lift by the sea level fill fraction', () => {
    // The bug this replaced: at pressure height the cells ARE full, so applying
    // the fill fraction there counts the same expansion twice and understates
    // lift by 15 percent.
    const fullVolumeLift = s.liftAtAltitude
    expect(fullVolumeLift).toBeGreaterThan(s.gasVolume * 0.9)
  })

  it('counts machinery spaces as habitable but not as living volume', () => {
    const bay = BASELINE_ARRANGEMENT.compartments.find((c) => c.id === 'systems-bay')
    expect(bay?.habitable).toBe(true)
    expect(bay?.netHabitable).toBe(false)
  })

  it('puts the cover aft of the frame, because skin and volume are different centroids', () => {
    const cover = s.items.find((i) => i.id === 'cover')
    const frame = s.items.find((i) => i.id === 'frame')
    expect(cover!.x).toBeGreaterThan(frame!.x)
  })

  it('puts the array above the hull axis, where it fights the pendulum', () => {
    const array = s.items.find((i) => i.id === 'photovoltaics')
    expect(array!.z).toBeGreaterThan(0)
  })
})

describe('the rules the arrangement has to obey', () => {
  const findings = validateArrangement(BASELINE, BASELINE_ARRANGEMENT)
  const find = (id: string) => findings.find((f) => f.id === id)

  it('has no failures at the baseline', () => {
    const failures = findings.filter((f) => f.severity === 'fail')
    expect(failures.map((f) => `${f.id}: ${f.detail}`)).toEqual([])
  })

  it('keeps every habitable space out of the cell volume', () => {
    expect(find('no-habitable-volume-in-the-cell-space')?.severity).toBe('pass')
  })

  it('keeps the exhaust below and downstream of the envelope', () => {
    expect(find('exhaust-below-and-downstream')?.severity).toBe('pass')
  })

  it('fails an arrangement that puts a bunk inside the hull', () => {
    const bad: Configuration = {
      ...BASELINE_ARRANGEMENT,
      compartments: BASELINE_ARRANGEMENT.compartments.map((c) =>
        c.id === 'cabin' ? { ...c, deck: 'cells' as const } : c,
      ),
    }
    const f = validateArrangement(BASELINE, bad).find(
      (x) => x.id === 'no-habitable-volume-in-the-cell-space',
    )
    expect(f?.severity).toBe('fail')
    expect(f?.detail).toContain('Sleeping cabin')
  })

  it('fails an exhaust routed forward of the tail', () => {
    const bad: Configuration = { ...BASELINE_ARRANGEMENT, exhaustStation: 0.6 }
    expect(
      validateArrangement(BASELINE, bad).find((x) => x.id === 'exhaust-below-and-downstream')
        ?.severity,
    ).toBe('fail')
  })

  it('fails a keel corridor that is sealed at both ends', () => {
    // 1.1 m is seven times the critical passage width and 100 m is ten times
    // the run-up distance, so closing the ends removes the only escape it has.
    const bad: Configuration = { ...BASELINE_ARRANGEMENT, keelOpenToFreeStream: false }
    const f = validateArrangement(BASELINE, bad).find(
      (x) => x.id === 'keel-corridor-confinement',
    )
    expect(f?.severity).toBe('fail')
  })

  it('fails when the ballast cannot reach the trim it needs', () => {
    // Both tanks in the same place. The water is still aboard and it still
    // gives the pendulum lever; it just has nowhere to move to, which is the
    // distinction between having ballast and having trim authority.
    const bad: Configuration = {
      ...BASELINE_ARRANGEMENT,
      compartments: BASELINE_ARRANGEMENT.compartments.map((c) =>
        c.id === 'water-aft' ? { ...c, station: 0.315 } : c,
      ),
    }
    expect(
      validateArrangement(BASELINE, bad).find((x) => x.id === 'trim-authority')?.severity,
    ).toBe('fail')
  })

  it('fails a tail too small for the Munk moment', () => {
    const bad: Configuration = { ...BASELINE_ARRANGEMENT, finSpanFraction: 0.3 }
    expect(
      validateArrangement(BASELINE, bad).find((x) => x.id === 'yaw-static-margin')?.severity,
    ).toBe('fail')
  })

  it('fails a propeller disc that intersects the hull', () => {
    const bad: Configuration = {
      ...BASELINE_ARRANGEMENT,
      propulsors: BASELINE_ARRANGEMENT.propulsors.map((p) => ({ ...p, lateralOffset: 0.4 })),
    }
    expect(
      validateArrangement(BASELINE, bad).find((x) => x.id === 'propeller-hull-clearance')
        ?.severity,
    ).toBe('fail')
  })
})

describe('what the arrangement did to the hull size', () => {
  it('does not close at the original 90 m baseline', () => {
    // The finding that moved the design. Before the compartments existed, 90 m
    // looked fine against a mass FRACTION; once they had positions and masses it
    // came out several tonnes heavy.
    expect(massStatement(at(90), BASELINE_ARRANGEMENT).liftMargin).toBeLessThan(0)
  })

  it('closes exactly somewhere near 105 m and needs about 114 m to be buildable', () => {
    const exact = smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT, 0)
    const withGrowth = smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT)
    expect(exact).toBeGreaterThan(100)
    expect(exact).toBeLessThan(110)
    expect(withGrowth).toBeGreaterThan(110)
    expect(withGrowth).toBeLessThan(118)
    expect(withGrowth!).toBeGreaterThan(exact!)
  })

  it('carries the growth margin the baseline was chosen for', () => {
    const s = massStatement(BASELINE, BASELINE_ARRANGEMENT)
    expect(s.liftMargin / s.total).toBeGreaterThan(0.15)
  })

  it('gets a better mass fraction as it grows, because the arrangement is fixed', () => {
    // The square-cube law running the useful way round: the galley is the same
    // galley on every hull, so a bigger ship carries it more cheaply.
    const small = massStatement(at(100), BASELINE_ARRANGEMENT)
    const large = massStatement(at(140), BASELINE_ARRANGEMENT)
    expect(large.emptyWeightPerGasVolume).toBeLessThan(small.emptyWeightPerGasVolume)
  })

  it('stays inside the historical fleet band it is calibrated against', () => {
    const s = massStatement(BASELINE, BASELINE_ARRANGEMENT)
    expect(s.emptyWeightPerGasVolume).toBeGreaterThan(0.4)
    expect(s.emptyWeightPerGasVolume).toBeLessThan(0.79)
  })

  it('keeps the trim inside the ballast authority across the useful length range', () => {
    for (const length of [105, 115, 125, 140]) {
      const findings = validateArrangement(at(length), BASELINE_ARRANGEMENT)
      const trim = findings.find((f) => f.id === 'trim-authority')
      expect(`${length}: ${trim?.severity}`).toBe(`${length}: pass`)
    }
  })
})
