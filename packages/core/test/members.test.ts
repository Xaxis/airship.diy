import { describe, expect, it } from 'vitest'

import { frameSchedule, laminate, pliesFor, scheduleAgreement, sizeCompressionMember } from '../src/index.js'
import { m, Nm } from '@airship/units'
import { AIRSHIP_LOAD_CASES, v } from '@airship/data'

/**
 * Sizing the frame from the loads, rather than scaling it from a regression.
 *
 * The point of these tests is not that the answer is right. It is that the two
 * routes to it can be compared, and that the model says which one is a floor.
 */

const MATERIAL = laminate()

describe('the laminate, as it will actually be built', () => {
  it('reaches about sixty percent of a prepreg autoclave', () => {
    // Fibre volume, voids and weave, in that order of size. All three are in
    // the flattering direction if you skip them.
    expect(MATERIAL.prepregFraction).toBeGreaterThan(0.5)
    expect(MATERIAL.prepregFraction).toBeLessThan(0.7)
  })

  it('loses a quarter of its compressive strength without a vacuum bag', () => {
    // The bag is not optional, and this is the number that says so.
    const bagged = laminate({ vacuumBagged: true })
    const not = laminate({ vacuumBagged: false })
    expect(not.compressiveStrength / bagged.compressiveStrength).toBeLessThan(0.8)
  })

  it('scales compressive strength with the fibre volume actually achieved', () => {
    // The datasheet figure is quoted at 60 percent. Using it directly for a 47
    // percent hand layup is the single easiest structural error to make.
    expect(MATERIAL.compressiveStrength).toBeLessThan(1.45e9 * 0.8)
  })

  it('gives a ply thickness a hand layup can actually hit', () => {
    // A quarter of a millimetre from a 200 g/m2 twill. It is what sets the
    // minimum practical wall, and therefore what makes small members heavy.
    expect(MATERIAL.plyThickness).toBeGreaterThan(0.15e-3)
    expect(MATERIAL.plyThickness).toBeLessThan(0.4e-3)
  })

  it('comes out lighter than the fibre, because of the resin and the voids', () => {
    expect(MATERIAL.density).toBeLessThan(1800)
    expect(MATERIAL.density).toBeGreaterThan(1200)
  })

  it('never lays half a ply', () => {
    expect(pliesFor(0.5e-3, 0.24e-3)).toBe(4)
    expect(pliesFor(2.0e-3, 0.24e-3)).toBe(9)
  })
})

describe('sizing one member', () => {
  it('converges rather than depending on the starting guess', () => {
    // The sizing is implicit: area depends on allowable, allowable depends on
    // section, section depends on area. Guessing once and moving on is how a
    // frame ends up thirty percent wrong.
    const a = sizeCompressionMember(
      50000,
      m(8),
      MATERIAL.modulus,
      MATERIAL.compressiveStrength,
      MATERIAL.plyThickness,
      80,
      4,
    )
    const b = sizeCompressionMember(
      50000,
      m(8),
      MATERIAL.modulus,
      MATERIAL.compressiveStrength,
      MATERIAL.plyThickness,
      80,
      20,
    )
    expect(b.area / a.area).toBeCloseTo(1, 1)
  })

  it('is governed by buckling and not by strength', () => {
    const member = sizeCompressionMember(
      50000,
      m(8),
      MATERIAL.modulus,
      MATERIAL.compressiveStrength,
      MATERIAL.plyThickness,
    )
    expect(member.allowableStress).toBeLessThan(MATERIAL.compressiveStrength * 0.5)
  })

  it('gets weaker as the bay gets longer, which is the R38 lesson', () => {
    const short = sizeCompressionMember(
      50000,
      m(5),
      MATERIAL.modulus,
      MATERIAL.compressiveStrength,
      MATERIAL.plyThickness,
    )
    const long = sizeCompressionMember(
      50000,
      m(15),
      MATERIAL.modulus,
      MATERIAL.compressiveStrength,
      MATERIAL.plyThickness,
    )
    expect(long.allowableStress).toBeLessThan(short.allowableStress)
  })

  it('reports a huge reserve when it lands on minimum gauge', () => {
    const light = sizeCompressionMember(
      100,
      m(8),
      MATERIAL.modulus,
      MATERIAL.compressiveStrength,
      MATERIAL.plyThickness,
    )
    expect(light.minimumGauge).toBe(true)
    expect(light.reserveFactor).toBeGreaterThan(2)
  })
})

describe('the frame schedule', () => {
  /**
   * The baseline as it actually is: 118 m, 11.8 m radius, 24 longitudinals at
   * 5.4 m, and the gust-case moment.
   *
   * It used to be 115 m with 16 longitudinals at 8 m, which is a sparser frame
   * than the vehicle has and a hull length it outgrew. That mattered once the
   * factor of safety was applied: at 16 members and 8 m bays the factored load
   * takes the members OFF minimum gauge, so the fixture was asserting a result
   * about a frame nobody is building.
   */
  const schedule = frameSchedule(1.26e6, m(11.8), m(118), 34_000, 24, m(5.4))

  it('lands on minimum gauge, so its mass is a floor', () => {
    // THE RESULT THAT MATTERS. The hull girder moment on a vehicle this light
    // does not size the members: what you can lay up does. So the bottom-up
    // mass is a lower bound and the model says so rather than reporting it as
    // an estimate.
    expect(schedule.minimumGauge).toBe(true)
    expect(schedule.warnings.some((w) => w.includes('NOT SIZED BY THE BENDING MOMENT'))).toBe(true)
  })

  it('charges for joints, which are a third of the members', () => {
    expect(schedule.jointMass / (schedule.longitudinalMass + schedule.ringMass)).toBeCloseTo(
      0.3,
      2,
    )
  })

  it('grows with longitudinal count once the members are at minimum gauge', () => {
    // At minimum gauge each member is the same section whatever the load, so
    // doubling the count doubles the mass and buys nothing. BOTH ends must be
    // at minimum gauge for that to hold: with the factor of safety applied, a
    // sparse frame is load-sized and adding members makes each one smaller, so
    // the ratio is well under two. That is a real effect and not a broken
    // expectation, so the test now checks the premise it depends on.
    const few = frameSchedule(1.26e6, m(11.8), m(118), 34_000, 24, m(5.4))
    const many = frameSchedule(1.26e6, m(11.8), m(118), 34_000, 48, m(5.4))
    expect(few.minimumGauge).toBe(true)
    expect(many.minimumGauge).toBe(true)
    expect(many.totalMass / few.totalMass).toBeCloseTo(2, 1)
  })

  it('is load-sized rather than gauge-sized once the frame is sparse', () => {
    // The counterpart, and the reason the fixture above had to change. Sixteen
    // longitudinals at 8 m bays under the factored gust load are no longer at
    // minimum gauge, which is what a factor of safety is supposed to reveal.
    const sparse = frameSchedule(1.26e6, m(11.8), m(118), 34_000, 16, m(8))
    expect(sparse.minimumGauge).toBe(false)
  })

  it('warns when the unsupported panel exceeds what killed R38', () => {
    const stretched = frameSchedule(1.26e6, m(11.8), m(118), 34_000, 16, m(18))
    expect(stretched.warnings.some((w) => w.includes('R38'))).toBe(true)
  })
})

describe('the cross-check between the two routes', () => {
  it('reports agreement inside the tolerance', () => {
    expect(scheduleAgreement(5000, 5400).agrees).toBe(true)
  })

  it('explains a lighter bottom-up figure rather than calling it a contradiction', () => {
    // An idealised tube sizing SHOULD be lighter than a historical regression:
    // it has no local loads, no wire terminations, no handling cases, and it
    // models a lattice girder as one tube.
    const a = scheduleAgreement(2560, 5443)
    expect(a.agrees).toBe(false)
    expect(a.verdict).toContain('expected direction')
    expect(a.verdict).toContain('LATTICE')
  })

  it('calls a heavier bottom-up figure what it is: unresolved', () => {
    const a = scheduleAgreement(9000, 5443)
    expect(a.agrees).toBe(false)
    expect(a.verdict).toContain('wrong direction')
  })
})

describe('the factor of safety, which was defined and applied nowhere', () => {
  /**
   * `AIRSHIP_LOAD_CASES.factorOfSafety` has been measured(1.5) in @airship/data
   * since it was written, cited, and read by nothing: a grep across packages,
   * apps and tools returned its definition and no call site. Meanwhile the
   * limit-load gust moment was checked against ULTIMATE buckling allowables
   * with nothing between them.
   */
  it('sizes members against the factored load, not the limit load', () => {
    const schedule = frameSchedule(Nm(1.26e6), m(11.8), m(118), 34_000, 24, m(5.4))
    const factored = (2 * 1.26e6 * v(AIRSHIP_LOAD_CASES.factorOfSafety)) / (11.8 * 24)
    // The reserve is capacity over the load actually applied, so a reserve of R
    // against the factored load means capacity = R * FoS * limit load.
    expect(schedule.longitudinal.reserveFactor * factored).toBeGreaterThan(0)
    expect(v(AIRSHIP_LOAD_CASES.factorOfSafety)).toBeCloseTo(1.5, 6)
  })

  it('did not change the frame mass, because the frame is minimum gauge', () => {
    // Which is the honest outcome and worth pinning: the members came out at
    // the minimum practical laminate either way, so the missing factor never
    // touched the mass. It overstated the REPORTED reserve by 1.5, and had the
    // frame ever come off minimum gauge it would have been undersized.
    const schedule = frameSchedule(Nm(1.26e6), m(11.8), m(118), 34_000, 24, m(5.4))
    expect(schedule.longitudinal.minimumGauge).toBe(true)
  })
})

describe('what the ring count does and does not drive', () => {
  it('does not change the ring mass, which is a limitation and is documented', () => {
    // The 2.17 ratio is Akron's TOTAL transverse against TOTAL longitudinal
    // mass and the spacing it was measured at is not recorded, so scaling by
    // count would mean inventing one. The site published this as though rings
    // were a mass driver.
    const close = frameSchedule(Nm(1.26e6), m(11.8), m(118), 34_000, 24, m(4))
    const wide = frameSchedule(Nm(1.26e6), m(11.8), m(118), 34_000, 24, m(8))
    expect(close.ringCount).toBeGreaterThan(wide.ringCount)
    expect(close.ringMass).toBeCloseTo(wide.ringMass, 6)
  })

  it('does change the buckling mode, which is what spacing is for', () => {
    const close = frameSchedule(Nm(1.26e6), m(11.8), m(118), 34_000, 24, m(2))
    const wide = frameSchedule(Nm(1.26e6), m(11.8), m(118), 34_000, 24, m(12))
    expect(close.longitudinal.area).not.toBeCloseTo(wide.longitudinal.area, 9)
  })
})
