import { describe, expect, it } from 'vitest'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  billOfMaterials,
  buildVerdict,
  facilityRequirement,
  handlingLimits,
  labourEstimate,
  massStatement,
  MINIMUM_VIABLE,
  STRETCH,
} from '../src/index.js'

/**
 * Can two people build it?
 *
 * These tests guard the shape of the answer rather than its digits, because the
 * prices in it are quotations with a date on them and will move. What must not
 * move is which line dominates, which constraint binds, and the fact that the
 * building costs more than the airship.
 */

const BOM = billOfMaterials(BASELINE, BASELINE_ARRANGEMENT)
const LABOUR = labourEstimate(BASELINE, BASELINE_ARRANGEMENT)
const FACILITY = facilityRequirement(BASELINE, BASELINE_ARRANGEMENT, BOM)
const HANDLING = handlingLimits(BASELINE, BASELINE_ARRANGEMENT)
const VERDICT = buildVerdict(BASELINE, BASELINE_ARRANGEMENT)

describe('the bill of materials', () => {
  it('is dominated by fabric and film rather than by machinery', () => {
    // The intuition is that the powertrain is the expensive part. It is not:
    // the gas cells, the cover and the frame fabric are three quarters of the
    // named subtotal, and the fuel cell, electrolyzer and battery together are
    // a fifth. The vehicle is mostly surface, and surface is sold by the metre.
    const top = BOM.lines.slice(0, 3).map((l) => l.id)
    expect(top).toEqual(['gas-cells', 'cover', 'carbon-fabric'])
    expect(BOM.concentration.share).toBeGreaterThan(0.55)
  })

  it('puts the largest line on the one material with no published price', () => {
    // A 0.21 kg/m2 para-aramid plus metallised-PET cell laminate at 15,000 m2
    // is not a thing anyone lists a price for. It is priced off a Dyneema
    // sailcloth of similar areal mass, which is a proxy for how hard it is to
    // make and not for what it does, and the range spans a factor of six.
    const cells = BOM.lines.find((l) => l.id === 'gas-cells')!
    expect(cells.id).toBe(BOM.lines[0]?.id)
    expect(cells.costRange[1] / cells.costRange[0]).toBeGreaterThan(5)
  })

  it('lands within a factor of two of a million dollars a tonne of ship', () => {
    // A sanity band rather than a prediction. Business jets run about $1,500/kg
    // and a cruising yacht about $50/kg, and this sits between them, which is
    // where an aerospace structure built from retail materials should sit.
    expect(BOM.perKilogram).toBeGreaterThan(50)
    expect(BOM.perKilogram).toBeLessThan(400)
  })

  it('grows with the ship, and slower than the ship does', () => {
    // Surface area goes as length squared while volume goes as length cubed,
    // so the bill per cubic metre of gas falls as the ship grows. That is the
    // cost half of the same square-cube argument the structure chapter makes,
    // and it is why nobody ever built a small rigid airship that worked.
    const small = billOfMaterials(MINIMUM_VIABLE, BASELINE_ARRANGEMENT)
    const large = billOfMaterials(STRETCH, BASELINE_ARRANGEMENT)
    expect(small.total).toBeLessThan(BOM.total)
    expect(large.total).toBeGreaterThan(BOM.total)

    const perVolume = (b: typeof BOM, design: typeof BASELINE): number =>
      b.total / massStatement(design, BASELINE_ARRANGEMENT).gasVolume
    expect(perVolume(large, STRETCH)).toBeLessThan(perVolume(small, MINIMUM_VIABLE))
  })
})

describe('the labour', () => {
  it('agrees with an independent per-kilogram estimate', () => {
    // Two routes to the same number: task by task, and hours per kilogram of
    // empty weight from composite homebuilt aircraft. Within a factor of two is
    // agreement at this level of definition, and if they ever diverge one of
    // them has lost a task.
    expect(LABOUR.crossCheckAgrees).toBe(true)
  })

  it('counts plies placed rather than parts made', () => {
    // A 1.5 mm wall is six plies. Estimating the frame layup on the surface
    // area of the finished part understates it by that factor, which is the
    // commonest way a composite schedule goes wrong.
    const laminate = LABOUR.tasks.find((t) => t.id === 'frame-laminate')!
    expect(laminate.basis).toContain('PLY placement')
    expect(laminate.hours).toBeGreaterThan(5000)
  })

  it('is more than a decade for two people, at hours nobody actually works', () => {
    expect(LABOUR.yearsForTwo).toBeGreaterThan(10)
  })

  it('is longer than the professionally staffed programme it is calibrated on', () => {
    // Pathfinder 1 is within 8 percent of this hull's length, was built in an
    // existing hangar by a company, and took 7 years. Any two-person schedule
    // that comes out shorter than that is wrong.
    expect(LABOUR.yearsForTwo).toBeGreaterThan(7)
  })
})

describe('the building', () => {
  it('is sized by the fin tip and not by the hull diameter', () => {
    // The fins are set well aft where the hull has narrowed, so the tip stands
    // proud of the crown. Sizing the doorway on hull diameter puts it 10 m too
    // low, which is the sort of thing discovered on the day the doors will not
    // clear.
    const diameter = BASELINE.hull.length / BASELINE.hull.finenessRatio
    expect(FACILITY.vehicleHeight).toBeGreaterThan(diameter)
    expect(FACILITY.clearHeight).toBeGreaterThan(FACILITY.vehicleHeight)
  })

  it('costs several times the entire bill of materials', () => {
    // THE AIRSHIP IS THE CHEAP PART. This is the finding of the whole module
    // and it is why no individual has built a rigid airship since 1930.
    expect(FACILITY.rigidHangarCost).toBeGreaterThan(5 * BOM.total)
  })

  it('carries a wind load measured in meganewtons on one wall', () => {
    expect(FACILITY.lateralWindLoad).toBeGreaterThan(5e6)
  })
})

describe('handling it on the ground', () => {
  it('cannot be held broadside by two people in anything worth calling a wind', () => {
    // Under a metre a second. This is arithmetic, not opinion: 2,300 m2 of
    // side area against 800 N of two people pulling.
    expect(HANDLING.twoPersonBroadsideLimit).toBeLessThan(1.5)
  })

  it('is an order of magnitude better bow on, which is the whole case for a mast', () => {
    expect(HANDLING.twoPersonBowOnLimit / HANDLING.twoPersonBroadsideLimit).toBeGreaterThan(5)
  })

  it('needs a mast designed well above the steady drag it sees', () => {
    // A moored airship hunts. It yaws off the wind, sails back across it, and
    // arrives at the end of each swing with the added mass of the displaced air
    // behind it. Design the mast to the drag and it fails in the first squall.
    expect(HANDLING.mastDesignLoad).toBeGreaterThan(3 * HANDLING.mastDragLoad)
  })
})

describe('the verdict', () => {
  it('is no, and it fails on the building rather than on the airship', () => {
    expect(VERDICT.buildable).toBe(false)
    expect(VERDICT.verdict).toContain('NOT BUILDABLE')
    expect(VERDICT.blockers.some((b) => b.startsWith('THE BUILDING'))).toBe(true)
  })

  it('says what would change the answer, including one that already has', () => {
    // GROUND HANDLING WAS A BLOCKER AND IS NOW A MITIGATION, because the
    // propulsors grew. The vehicle holds itself bow-on in more wind than the US
    // Navy would dock a ZPG-3W in with eighteen people and two mechanical
    // mules, so the crew requirement is gone even though the broadside case is
    // exactly as bad as it ever was.
    expect(VERDICT.mitigations.some((m) => m.includes('GROUND HANDLING IS NO LONGER'))).toBe(true)
    expect(VERDICT.blockers.some((b) => b.startsWith('GROUND HANDLING'))).toBe(false)

    // And the tube finding survives: it is the only change that improves cost,
    // schedule and structure at once.
    expect(VERDICT.mitigations.some((m) => m.includes('BUY THE MEMBERS'))).toBe(true)
    expect(VERDICT.mitigations.length).toBeGreaterThanOrEqual(4)
  })
})
