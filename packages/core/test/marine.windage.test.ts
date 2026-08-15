import { describe, expect, it } from 'vitest'
import { m, m2, mps } from '@airship/units'
import { atmosphere } from '../src/atmosphere.js'
import { hullGeometry } from '../src/geometry/hull.js'
import {
  WIND_LIMITS,
  beamOnForceEqualsLiftSpeed,
  beamToBowForceRatio,
  canopyDiameter,
  handlingToSurvivalRatio,
  leeway,
  seaAnchorCanopyArea,
  windLoad,
} from '../src/marine/windage.js'

const hull = hullGeometry(m(90), 5)
const seaLevel = atmosphere(m(0))

/** Gross lift as a force: 18,015 kg at standard gravity. */
const GROSS_LIFT_FORCE = 18015 * 9.80665

/**
 * THE NUMBER THAT DECIDES MARINE OPERATION.
 */
describe('beam-on versus bow-on is a factor of forty', () => {
  it('the force ratio between the two attitudes is about 40 to 1', () => {
    // Not the 72 first published here. That used a BARE HULL bow-on drag
    // coefficient of 0.025 for a complete vehicle afloat, which has fins, a
    // gondola, mooring gear and a partly immersed hull, and runs nearer 0.045.
    // The error understated the load on the drogue rode.
    expect(beamToBowForceRatio()).toBeCloseTo(40, 0)
  })

  it('bow-on the hull is still a slippery shape, just not a bare-hull one', () => {
    const bow = windLoad(hull, seaLevel, mps(10), 'bow-on', GROSS_LIFT_FORCE)
    expect(bow.force).toBeLessThan(3000)
    expect(bow.asFractionOfGrossLift).toBeLessThan(0.02)
  })

  it('beam-on the side force reaches gross lift at about 16 m/s', () => {
    // A single number for the operations manual: above this, a vehicle caught
    // beam-on is pushed sideways harder than it is held up.
    const speed = beamOnForceEqualsLiftSpeed(hull, seaLevel, GROSS_LIFT_FORCE)
    expect(speed).toBeGreaterThan(14)
    expect(speed).toBeLessThan(18)
  })

  it('and exceeds gross lift substantially at 20 m/s', () => {
    const beam = windLoad(hull, seaLevel, mps(20), 'beam-on', GROSS_LIFT_FORCE)
    expect(beam.asFractionOfGrossLift).toBeGreaterThan(1.4)
  })
})

/**
 * THE CORRECTION. An earlier version of this model sized the sea anchor against
 * the BEAM-ON force and concluded no practical canopy could hold the vehicle.
 * The anchor's job is to hold it BOW-ON, where the force is about 40 times
 * smaller.
 */
describe('the sea anchor works, once it is sized against the right force', () => {
  it('a canopy of about six metres holds bow-on drift at 20 m/s of wind', () => {
    const bow = windLoad(hull, seaLevel, mps(20), 'bow-on', GROSS_LIFT_FORCE)
    const area = seaAnchorCanopyArea(bow.force, mps(0.5))
    const diameter = canopyDiameter(area)

    expect(diameter).toBeGreaterThan(3)
    expect(diameter).toBeLessThan(12)
  })

  it('and no canopy of any size does it beam-on', () => {
    // Tens of metres across. These are not objects.
    const beam = windLoad(hull, seaLevel, mps(20), 'beam-on', GROSS_LIFT_FORCE)
    const diameter = canopyDiameter(seaAnchorCanopyArea(beam.force, mps(0.5)))
    expect(diameter).toBeGreaterThan(35)
  })

  it('so the anchor is a weathervaning device first and a brake second', () => {
    // The design conclusion, stated as a ratio: the same target drift costs
    // forty times the canopy area if the vehicle is allowed to lie beam-on.
    // Reliability at holding the bow into the wind matters far more than the
    // drag coefficient of the canopy.
    const bow = windLoad(hull, seaLevel, mps(20), 'bow-on', GROSS_LIFT_FORCE)
    const beam = windLoad(hull, seaLevel, mps(20), 'beam-on', GROSS_LIFT_FORCE)
    const ratio =
      seaAnchorCanopyArea(beam.force, mps(0.5)) / seaAnchorCanopyArea(bow.force, mps(0.5))
    expect(ratio).toBeCloseTo(40, 0)
  })

  it('refuses a zero drift target', () => {
    const bow = windLoad(hull, seaLevel, mps(20), 'bow-on', GROSS_LIFT_FORCE)
    expect(() => seaAnchorCanopyArea(bow.force, mps(0))).toThrow(RangeError)
  })
})

/**
 * The binding constraint is handling, not survival.
 */
describe('handling limits bind five times tighter than survival limits', () => {
  it('a moored airship free to weathervane rides out serious weather', () => {
    // The US Navy moored ZPG-3W, half again this size, at 34.9 m/s.
    expect(WIND_LIMITS.mooredWeathervaning).toBeGreaterThan(30)
  })

  it('but any operation at a fixed heading tops out near 6 m/s', () => {
    expect(WIND_LIMITS.fixedHeadingHandling).toBeLessThan(7)
  })

  it('the ratio is about 5.6, and it is what the operations manual is built around', () => {
    // The question is never "can it survive the blow". It is "can the crew get
    // the drogue deployed before the wind gets up", and that has to be yes at a
    // wind five times below the survival limit.
    expect(handlingToSurvivalRatio()).toBeGreaterThan(5)
    expect(handlingToSurvivalRatio()).toBeLessThan(6.5)
  })

  it('Shenandoah broke away at almost exactly the modern moored limit', () => {
    // Which suggests the limit is a real physical boundary rather than a
    // conservative administrative one.
    expect(Math.abs(WIND_LIMITS.shenandoahBreakaway / WIND_LIMITS.mooredWeathervaning - 1)).toBeLessThan(0.05)
  })
})

describe('leeway: it drifts faster than anything the Coast Guard has measured', () => {
  it('bow-on drift is a quarter to a third of wind speed', () => {
    // Against a maximum of 6.66 percent for a bare-masted sailboat across 63
    // object classes in the Allen and Plourde database.
    const bow = windLoad(hull, seaLevel, mps(10), 'bow-on', GROSS_LIFT_FORCE)
    const drift = leeway(bow.force, m2(1), mps(10))
    expect(drift.leewayRatio).toBeGreaterThan(0.1)
    expect(drift.leewayRatio).toBeLessThan(0.5)
  })

  it('because being fully buoyant means it barely touches the water', () => {
    // One square metre of underwater lateral area against more than a thousand
    // above it. Only the static heaviness is immersed.
    const bow = windLoad(hull, seaLevel, mps(10), 'bow-on', GROSS_LIFT_FORCE)
    const shallow = leeway(bow.force, m2(1), mps(10))
    const deeper = leeway(bow.force, m2(9), mps(10))
    expect(deeper.driftSpeed).toBeCloseTo(shallow.driftSpeed / 3, 3)
  })

  it('leeway ratio is independent of wind speed, so drift scales linearly', () => {
    const slow = windLoad(hull, seaLevel, mps(5), 'bow-on', GROSS_LIFT_FORCE)
    const fast = windLoad(hull, seaLevel, mps(20), 'bow-on', GROSS_LIFT_FORCE)
    const a = leeway(slow.force, m2(1), mps(5))
    const b = leeway(fast.force, m2(1), mps(20))
    expect(b.leewayRatio).toBeCloseTo(a.leewayRatio, 6)
  })
})
