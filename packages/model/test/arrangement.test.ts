import { describe, expect, it } from 'vitest'

import { hullGeometry } from '@airship/core'
import { m } from '@airship/units'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  compartmentVolume,
  finPlanform,
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
  it('does not change when the hull does', () => {
    // The bug this replaced: sizes were fractions of the local hull radius, so
    // every room grew with the ship and the habitability check could be passed
    // by making the hull bigger rather than by arranging it.
    const galley = BASELINE_ARRANGEMENT.compartments.find((c) => c.id === 'galley')!
    const small = massStatement(at(90), BASELINE_ARRANGEMENT).items.find((i) => i.id === 'galley')
    const large = massStatement(at(160), BASELINE_ARRANGEMENT).items.find((i) => i.id === 'galley')
    expect(small!.volume).toBeCloseTo(large!.volume, 6)
    expect(small!.volume).toBeCloseTo(galley.width * galley.height * galley.extent, 6)
  })

  it('is a box in metres', () => {
    expect(compartmentVolume({ width: 3, height: 2, extent: 4 })).toBe(24)
  })

  it('gives the five gondola rooms about fifty square metres of floor', () => {
    // A small flat rather than a capsule. For a year aboard that is the right
    // comparison, and it is the number the habitability check is really about.
    const floor = BASELINE_ARRANGEMENT.compartments
      .filter((c) => c.deck === 'gondola' && c.netHabitable)
      .reduce((sum, c) => sum + c.width * c.extent, 0)
    expect(floor).toBeGreaterThan(40)
    expect(floor).toBeLessThan(65)
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
    expect(s.keelEnvelope).toBeGreaterThan(0)
    expect(s.gasVolume).toBeLessThan(
      hullGeometry(m(BASELINE.hull.length), BASELINE.hull.finenessRatio).volume,
    )
  })

  it('hangs the gondola below the hull and stands the keel bays on its floor', () => {
    const saloon = s.items.find((i) => i.id === 'saloon')!
    const water = s.items.find((i) => i.id === 'water-forward')!
    const radius = BASELINE.hull.length / BASELINE.hull.finenessRatio / 2
    expect(saloon.z).toBeLessThan(-radius)
    expect(water.z).toBeGreaterThan(-radius)
    expect(water.z).toBeLessThan(0)
  })

  it('does not count the keel bays on top of the corridor that contains them', () => {
    // Summing the bays would count the same cubic metres several times and
    // charge the gas volume for all of them.
    const bays = BASELINE_ARRANGEMENT.compartments
      .filter((c) => c.deck === 'keel' && c.id !== 'keel-structure')
      .reduce((sum, c) => sum + compartmentVolume(c), 0)
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

  it('has exactly one failure at the baseline, and it is the known open item', () => {
    // NOT a green suite by construction. The daily superheat swing is 2.6 times
    // the trim the vehicle rests on water at, which no passive float can be
    // sized for, and the honest thing is to let the gate stay red until the
    // active ballast loop that answers it exists. Everything else passes.
    const failures = findings.filter((f) => f.severity === 'fail')
    expect(failures.map((f) => f.id)).toEqual(['superheat-against-landing-trim'])
  })

  it('states the superheat excursion against the landing trim in tonnes', () => {
    const f = find('superheat-against-landing-trim')
    expect(f?.severity).toBe('fail')
    expect(f?.detail).toContain('active ballast loop')
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
        c.id === 'water-aft' ? { ...c, station: 0.235 } : c,
      ),
    }
    expect(
      validateArrangement(BASELINE, bad).find((x) => x.id === 'trim-authority')?.severity,
    ).toBe('fail')
  })

  it('counts only the VERTICAL fins against the yaw requirement', () => {
    // THIS IS THE DEFECT THAT SURVIVED EVERY OTHER CHECK. The rule compared the
    // whole cruciform against a requirement only the vertical pair can meet,
    // and it took the fin lift slope at twice its geometric value on an
    // argument that should have reduced it. Between them the reported margin
    // was four times the real one, and the vehicle it described was
    // directionally divergent at every speed. The flight simulator did not
    // catch it either, because it SETS its fin area to 1.4 times the minimum
    // rather than reading the design's.
    const finding = validateArrangement(BASELINE, BASELINE_ARRANGEMENT).find(
      (x) => x.id === 'yaw-static-margin',
    )
    expect(finding?.detail).toContain('VERTICAL fin')
    expect(finding?.detail).toContain('half of the')

    // And the margin the design now achieves is inside airship practice rather
    // than below the divergence boundary.
    const fins = finPlanform(BASELINE, BASELINE_ARRANGEMENT)
    expect(fins.area / 2).toBeGreaterThan(300)
    expect(finding?.severity).toBe('pass')
  })

  it('fails a tail too small for the Munk moment', () => {
    const bad: Configuration = { ...BASELINE_ARRANGEMENT, finSpanFraction: 0.3 }
    expect(
      validateArrangement(BASELINE, bad).find((x) => x.id === 'yaw-static-margin')?.severity,
    ).toBe('fail')
  })

  it('fails a keel bay too wide for the hull it is inside', () => {
    const bad: Configuration = {
      ...BASELINE_ARRANGEMENT,
      compartments: BASELINE_ARRANGEMENT.compartments.map((c) =>
        c.id === 'workshop' ? { ...c, width: 26 } : c,
      ),
    }
    const f = validateArrangement(BASELINE, bad).find((x) => x.id === 'compartments-fit-the-hull')
    expect(f?.severity).toBe('fail')
    expect(f?.detail).toContain('Workshop')
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

  it('closes near 104 m and needs about 112 m to be buildable', () => {
    const exact = smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT, 0)
    const withGrowth = smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT)
    expect(exact).toBeGreaterThan(98)
    expect(exact).toBeLessThan(110)
    expect(withGrowth).toBeGreaterThan(106)
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

  it('keeps the trim inside the ballast authority over the range it was arranged for', () => {
    // The arrangement is FIXED and the hull is not, so there is a length past
    // which the fins, the array and the machinery outrun what the water can
    // trim out. Where that happens is a property of the arrangement rather
    // than a bug in it, and it is worth pinning because it moves whenever
    // anything heavy changes station.
    for (const length of [95, 105, 115, 120, 125]) {
      const findings = validateArrangement(at(length), BASELINE_ARRANGEMENT)
      const trim = findings.find((f) => f.id === 'trim-authority')
      expect(`${length}: ${trim?.severity}`).toBe(`${length}: pass`)
    }
    for (const length of [140, 150]) {
      const findings = validateArrangement(at(length), BASELINE_ARRANGEMENT)
      const trim = findings.find((f) => f.id === 'trim-authority')
      expect(`${length}: ${trim?.severity}`).toBe(`${length}: fail`)
    }
  })

  it('runs out of trim authority eventually, and says so', () => {
    // Not a bug. The arrangement is FIXED and the hull is not: the fins, the
    // cover and the array all scale as area and all sit aft of the centre of
    // buoyancy, while the gondola and the stores that balance them do not grow
    // at all. Past about 155 m the same layout needs rebalancing rather than
    // more ballast, and this check is what says so instead of letting a
    // stretched ship quietly fly nose-down for the rest of its life.
    const trim = validateArrangement(at(175), BASELINE_ARRANGEMENT).find(
      (f) => f.id === 'trim-authority',
    )
    expect(trim?.severity).toBe('fail')
  })
})
