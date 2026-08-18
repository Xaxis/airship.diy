import { describe, expect, it } from 'vitest'

import {
  DUCT_STATIC_THRUST_GAIN,
  VECTORED_THRUST_REALISATION,
  hoverCapability,
  propulsorOut,
  vectoredControl,
} from '../src/index.js'
import { W, kg, N } from '@airship/units'

/**
 * Tilting propulsors, calibrated on the certified installations that exist.
 *
 * A buoyant vehicle does not lift its weight, it lifts its residual heaviness,
 * which is a couple of percent of the weight. That is why vectored thrust is
 * plausible here and absurd on a helicopter of the same mass, and it is the one
 * place in this project where the answer came out better than expected.
 */

/** @derived The baseline: four units, 72 kW, gross 25,224 kg. */
const COUNT = 4
const POWER = W(72e3)
const GROSS = kg(25224)
/** @derived The landing trim, set by the propulsor-out case rather than the sea state. */
const TRIM = 600

describe('what sets the thrust', () => {
  it('is diameter and power EQUALLY, both by the two-thirds power', () => {
    // T = (2 rho A P^2)^(1/3). The area is inside the cube root to the first
    // power, so T goes as A^(1/3) = D^(2/3), and power carries the identical
    // exponent. Doubling either is worth 1.59 times, not 2.5.
    //
    // This test's assertion was always 2^(2/3); its title and its comment said
    // "four-thirds power" and "2.5 times". It passed for years against prose
    // that contradicted it, which is how the exponent survived into the module
    // header, the arrangement, and the flight page.
    const small = hoverCapability(COUNT, 3, POWER, false, GROSS, TRIM)
    const large = hoverCapability(COUNT, 6, POWER, false, GROSS, TRIM)
    expect(large.liftableHeaviness / small.liftableHeaviness).toBeCloseTo(2 ** (2 / 3), 2)

    // And the same doubling in POWER buys exactly the same thing.
    const morePower = hoverCapability(COUNT, 3, W(2 * (POWER as number)), false, GROSS, TRIM)
    expect(morePower.liftableHeaviness / small.liftableHeaviness).toBeCloseTo(2 ** (2 / 3), 2)
  })

  it('gains from a duct, but not the factor of two the folklore quotes', () => {
    // The folklore two is the AREA effect: an open rotor's wake contracts to
    // A/2, so holding it at A doubles the thrust at fixed induced velocity.
    // Hold POWER fixed and the same doubling is 2^(1/3) = 1.26, which is the
    // ideal-flow ceiling. A factor of two at equal power is above it, so no
    // measurement can have produced it.
    const open = hoverCapability(COUNT, 6, POWER, false, GROSS, TRIM)
    const ducted = hoverCapability(COUNT, 6, POWER, true, GROSS, TRIM)
    expect(ducted.liftableHeaviness / open.liftableHeaviness).toBeCloseTo(
      DUCT_STATIC_THRUST_GAIN,
      6,
    )
    expect(DUCT_STATIC_THRUST_GAIN).toBeLessThanOrEqual(2 ** (1 / 3) + 1e-9)
  })

  it('falls short of momentum theory by an amount nobody has measured', () => {
    // The realisation factor used to be 0.37, justified by a Zeppelin NT
    // calculation that gives 0.195, from a 400 kg figure that is a certified
    // operating LIMIT rather than a measurement. Read as a measurement it
    // implies a propeller figure of merit of 0.086, which no propeller reaches
    // even stalled. It is uncertain now, bounded by what a real static
    // propeller achieves.
    expect(VECTORED_THRUST_REALISATION).toBeGreaterThan(0.4)
    expect(VECTORED_THRUST_REALISATION).toBeLessThan(0.85)
  })
})

describe('the baseline installation', () => {
  const HOVER = hoverCapability(COUNT, 5.5, POWER, true, GROSS, TRIM)

  it('lifts its own landing trim, and could not before the propulsors grew', () => {
    expect(HOVER.liftsItsTrim).toBe(true)
    // At the 4.6 m open propulsors the arrangement used to carry, it does not.
    const before = hoverCapability(COUNT, 4.6, POWER, false, GROSS, TRIM)
    expect(before.liftsItsTrim).toBe(false)
  })

  it('lifts a few percent of the vehicle, which is all a buoyant one needs', () => {
    // Zeppelin NT is certified to 5.0 percent static heaviness at take-off.
    // Anything in that neighbourhood is a real airship number; anything near
    // 100 percent would mean the model had forgotten the vehicle floats.
    expect(HOVER.heavinessFraction).toBeGreaterThan(0.01)
    expect(HOVER.heavinessFraction).toBeLessThan(0.08)
  })

  it('still lands with the WORST propulsor stopped, which is what sets the trim', () => {
    const identical = Array.from({ length: COUNT }, () => ({
      diameter: 6,
      ratedPower: (POWER as number) / COUNT,
      ducted: true,
    }))
    const out = propulsorOut(identical, TRIM)
    expect(out.stillLands).toBe(true)
    // And it is close, which is the point: the trim was chosen to make it so.
    expect(out.remainingHeaviness).toBeLessThan(TRIM * 1.2)
  })

  it('costs more than an equal share when the units are not identical', () => {
    // The (N-1)/N law is only right for N IDENTICAL units. With two large and
    // two small, losing a large one removes 30 percent of the thrust rather
    // than 25, and the landing trim was set by exactly this case with a margin
    // of four kilograms. That is why the four units on this vehicle are the
    // same size.
    const mixed = [
      { diameter: 6, ratedPower: 22000, ducted: true },
      { diameter: 6, ratedPower: 22000, ducted: true },
      { diameter: 5, ratedPower: 14000, ducted: true },
      { diameter: 5, ratedPower: 14000, ducted: true },
    ]
    const even = [
      { diameter: 5.52, ratedPower: 18000, ducted: true },
      { diameter: 5.52, ratedPower: 18000, ducted: true },
      { diameter: 5.52, ratedPower: 18000, ducted: true },
      { diameter: 5.52, ratedPower: 18000, ducted: true },
    ]
    const a = propulsorOut(mixed, TRIM)
    const b = propulsorOut(even, TRIM)
    expect(a.remainingHeaviness).toBeLessThan(b.remainingHeaviness)
    expect(a.loadShare).toBeGreaterThan(4 / 3)
    expect(b.loadShare).toBeCloseTo(4 / 3, 3)
  })
})

describe('holding position on vectored thrust alone', () => {
  const HOVER = hoverCapability(COUNT, 5.5, POWER, true, GROSS, TRIM)
  /** @derived Gas volume, m3. */
  const VOLUME = 31657
  /** @source Beam-on and bow-on volumetric coefficients from the marine module. */
  const BEAM_ON = 1.8
  const BOW_ON = 0.045

  it('holds bow-on in a serious wind and broadside in almost none', () => {
    const c = vectoredControl(N(HOVER.staticThrust), VOLUME, BEAM_ON, BOW_ON)
    expect(c.headwindHold).toBeGreaterThan(12)
    expect(c.crosswindHold).toBeLessThan(4)
  })

  it('removes the ground crew without removing the need to weathervane', () => {
    // THE HONEST SHAPE OF THIS RESULT. It does not solve the broadside case and
    // no plausible installation does, because the broadside force is more than
    // an order of magnitude larger and thrust scales with power. What it solves
    // is the requirement for eighteen people and two mechanical mules, which is
    // one of the four blockers in the build chapter.
    const c = vectoredControl(N(HOVER.staticThrust), VOLUME, BEAM_ON, BOW_ON)
    expect(c.attitudeRatio).toBeGreaterThan(5)
    expect(c.note).toContain('DOES NOT SOLVE THE BROADSIDE CASE')
  })
})
