import { describe, expect, it } from 'vitest'

import { frameSchedule, laminate, pliesFor, scheduleAgreement, sizeCompressionMember } from '../src/index.js'
import { m } from '@airship/units'

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
  /** The baseline: 115 m, 11.5 m radius, and the gust-case moment. */
  const schedule = frameSchedule(1.16e6, m(11.5), m(115), 31657, 16, m(8))

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
    // Because at minimum gauge each member is the same section whatever the
    // load, so doubling the count doubles the mass and buys nothing.
    const few = frameSchedule(1.16e6, m(11.5), m(115), 31657, 16, m(8))
    const many = frameSchedule(1.16e6, m(11.5), m(115), 31657, 32, m(8))
    expect(many.totalMass / few.totalMass).toBeCloseTo(2, 1)
  })

  it('warns when the unsupported panel exceeds what killed R38', () => {
    const stretched = frameSchedule(1.16e6, m(11.5), m(115), 31657, 16, m(18))
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
