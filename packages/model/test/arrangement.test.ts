import { describe, expect, it } from 'vitest'

import { hullGeometry } from '@airship/core'
import { m } from '@airship/units'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  DESIGN_POINTS,
  MASS_GROWTH_ALLOWANCE,
  compartmentVolume,
  consumables,
  finPlanform,
  massStatement,
  provisionsFor,
  smallestClosingLength,
  validateArrangement,
} from '../src/index.js'
import type { Configuration, DesignPoint } from '../src/index.js'

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


  it('answers the superheat excursion with a loop rather than with a bigger float', () => {
    // No passive water-contact device can be sized for a load that swings by
    // this factor twice a day, and the gate still says so. What it checks is
    // whether the arrangement carries the active loop instead.
    const f = find('superheat-against-landing-trim')
    expect(f?.severity).toBe('pass')
    expect(f?.detail).toContain('NO PASSIVE WATER-CONTACT DEVICE')
    expect(f?.detail).toContain('seawater bladder')
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
    // The wording moved when the tail gained a roll offset: "the vertical pair"
    // is only the right answer for a cruciform, and the model now sums cos^2
    // over the four surfaces at their actual angles. The DEFECT this test
    // guards against is unchanged: crediting the whole tail with yaw authority.
    expect(finding?.detail).toContain('YAW-EFFECTIVE fin')
    expect(finding?.detail).toContain('cos-squared')

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

  it(
    'closes near 104 m and needs about 112 m to be buildable',
    () => {
      const exact = smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT, 0)
      const withGrowth = smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT)
      expect(exact).toBeGreaterThan(98)
      expect(exact).toBeLessThan(110)
      expect(withGrowth).toBeGreaterThan(106)
      expect(withGrowth).toBeLessThan(118)
      expect(withGrowth!).toBeGreaterThan(exact!)
    },
    // Two bisections on hull length, each of which integrates the diurnal
    // thermal cycle for every candidate, because gas mass goes as the cube of
    // length and exchange area as the square, so the superheat swing that sizes
    // the ballast really does move with the ship. This is the slowest honest
    // test in the repository; the alternative is caching a thermal answer
    // across lengths it does not apply to.
    15000,
  )

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
    //
    // IT MOVED, AND THE MOVE IS THE POINT. The boundary was between 120 and
    // 125 m. Shrinking the tail from a 1.3 span fraction to 1.05 took roughly
    // 170 m2 of fin off station 0.9, which is the longest lever on the ship, so
    // the same arrangement now balances out to 135 m. A test that pins where a
    // limit sits will fail when the design gets better, and that is the correct
    // behaviour: the number is worth knowing and worth re-reading.
    for (const length of [95, 105, 115, 120, 125, 135]) {
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


describe('the last gate, which is a check rather than an assertion', () => {
  it('passes only because the arrangement carries the bladder', () => {
    // THE ONE GATE THAT FAILED FOR MONTHS. Twenty kelvin of superheat moves
    // lift by more than two tonnes against a 600 kg landing trim, so no passive
    // water-contact device can be sized for it. That statement is still true
    // and it is still the point; what changed is that the vehicle now carries
    // the active loop the gate was asking for.
    //
    // Delete the bay and it fails again, which is the difference between a
    // check and a check that agrees with itself.
    const withLoop = validateArrangement(BASELINE, BASELINE_ARRANGEMENT).find(
      (f) => f.id === 'superheat-against-landing-trim',
    )
    expect(withLoop?.severity).toBe('pass')

    const without: Configuration = {
      ...BASELINE_ARRANGEMENT,
      compartments: BASELINE_ARRANGEMENT.compartments.filter((c) => c.id !== 'ballast-loop'),
    }
    const withoutLoop = validateArrangement(BASELINE, without).find(
      (f) => f.id === 'superheat-against-landing-trim',
    )
    expect(withoutLoop?.severity).toBe('fail')
  })

  it('leaves nothing failing in the whole arrangement', () => {
    // This was briefly pinned to ['lower-fin-clears-the-water'], which is worth
    // recording. The three-dimensional views, rebuilt at the model's real
    // dimensions, showed the lower fin hanging 5.6 m below the gondola keel and
    // therefore immersed on every water landing. Nothing in the mass statement
    // or the stability gates could have caught it: the fin area, its mass, its
    // arm and the flotation were each individually correct. The defect was a
    // RELATIONSHIP between two parts that no single calculation owned.
    //
    // It is fixed rather than tolerated, by rotating the tail 45 degrees.
    const failing = validateArrangement(BASELINE, BASELINE_ARRANGEMENT).filter(
      (f) => f.severity === 'fail',
    )
    expect(failing.map((f) => f.id)).toEqual([])
  })

  it('rotates the tail for free, which is why the fix was cheap', () => {
    // THE RESULT THAT MADE IT A NON-DECISION. Yaw effectiveness sums cos^2 over
    // the four surfaces, and for any set at phi, phi+90, phi+180, phi+270 that
    // total is exactly 2, whatever phi is. So an X tail has identical yaw
    // authority to a cruciform at identical area and identical mass. The only
    // thing that changes is how deep the lowest surface reaches: cos(45) of the
    // tip radius instead of all of it.
    const cruciform: Configuration = { ...BASELINE_ARRANGEMENT, tailRollOffset: 0 }
    const margin = (config: Configuration) => {
      const detail =
        validateArrangement(BASELINE, config).find((f) => f.id === 'yaw-static-margin')?.detail ?? ''
      // Not [0-9.]+, which swallows the sentence's full stop and yields NaN.
      return Number(/margin of (\d+(?:\.\d+)?)/.exec(detail)?.[1])
    }
    expect(margin(cruciform)).toBeCloseTo(margin(BASELINE_ARRANGEMENT), 6)

    // And it is the invariant, not a coincidence of 45 degrees.
    for (const offset of [0, 0.31, Math.PI / 6, Math.PI / 4, 1.02]) {
      const at = margin({ ...BASELINE_ARRANGEMENT, tailRollOffset: offset })
      expect(`${offset}: ${Math.abs(at - margin(cruciform)) < 1e-6}`).toBe(`${offset}: true`)
    }
  })

  it('only the X tail actually clears the keel', () => {
    const clears = (offset: number) =>
      validateArrangement(BASELINE, { ...BASELINE_ARRANGEMENT, tailRollOffset: offset }).find(
        (f) => f.id === 'lower-fin-clears-the-water',
      )?.severity
    // A cruciform cannot, at any span or chord, because the lower fin grows
    // with the upper one.
    expect(clears(0)).toBe('fail')
    expect(clears(Math.PI / 4)).toBe('pass')
  })
})

describe('what each design can actually carry', () => {
  /**
   * DAYS ALOFT IS THE FIGURE OF MERIT AND IT WAS NOT A FUNCTION OF THE DESIGN.
   * The reporting tool handed every design point the baseline's stores and
   * returned 471 days for all three, so a 65 m hull scored exactly what a 125 m
   * hull scored and no physics anywhere could move the number.
   */
  it('refuses to provision a design that cannot lift the arrangement', () => {
    const minimum = DESIGN_POINTS.find((d) => d.id === 'minimum-viable')
    expect(minimum).toBeDefined()
    const p = provisionsFor(minimum as DesignPoint, BASELINE_ARRANGEMENT)
    expect(p.closes).toBe(false)
    expect(p.extraFood).toBe(0)
  })

  it('splits the spare lift so nothing binds early', () => {
    // Loading it all as food was the obvious thing and the wrong thing: the
    // engine consumables run out at 592 days and the rest of the food is
    // ballast. Split so both run out together and the same lift buys 1,843.
    const p = provisionsFor(BASELINE, BASELINE_ARRANGEMENT)
    const base = consumables(BASELINE_ARRANGEMENT)
    expect(p.closes).toBe(true)
    expect(p.extraFood).toBeGreaterThan(0)
    expect(p.food).toBeGreaterThan(base.food)
    expect(p.spares).toBeGreaterThan(base.spares)
    // Everything aboard plus the spare lift, and nothing more.
    expect(p.food + p.spares).toBeCloseTo(base.food + base.spares + p.extraFood, 6)
  })

  it('keeps the growth reserve back rather than loading it', () => {
    // Loading the reserve would buy more days and leave nothing for superheat,
    // rain or a torn cell. That is a trade a crew makes on the day.
    const statement = massStatement(BASELINE, BASELINE_ARRANGEMENT)
    const p = provisionsFor(BASELINE, BASELINE_ARRANGEMENT)
    const remaining = statement.liftMargin - p.extraFood
    expect(remaining).toBeCloseTo(MASS_GROWTH_ALLOWANCE * statement.total, 6)
  })

  it('separates two designs that used to score identically', () => {
    // Both returned 471 days, because the reporting tool handed each of them
    // the baseline's stores and ignored the design it was given.
    const stretch = DESIGN_POINTS.find((d) => d.id === 'stretch')
    expect(stretch).toBeDefined()
    const a = provisionsFor(BASELINE, BASELINE_ARRANGEMENT)
    const b = provisionsFor(stretch as DesignPoint, BASELINE_ARRANGEMENT)
    expect(a.balancedDays).toBeGreaterThan(b.balancedDays + 100)
  })
})
