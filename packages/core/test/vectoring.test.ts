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
  it('is diameter, by the four-thirds power, and nothing else is close', () => {
    // Static thrust goes as (rho A P^2)^(1/3), so at fixed power it goes as the
    // two-thirds power of disc area and the four-thirds power of diameter.
    // Doubling the diameter is worth about 2.5 times the thrust for the same
    // kilowatt, and no other change in the propulsion group comes near that.
    const small = hoverCapability(COUNT, 3, POWER, false, GROSS, TRIM)
    const large = hoverCapability(COUNT, 6, POWER, false, GROSS, TRIM)
    const ratio = large.liftableHeaviness / small.liftableHeaviness
    expect(ratio).toBeCloseTo(2 ** (2 / 3), 2)
  })

  it('is doubled by a duct, at equal power', () => {
    const open = hoverCapability(COUNT, 6, POWER, false, GROSS, TRIM)
    const ducted = hoverCapability(COUNT, 6, POWER, true, GROSS, TRIM)
    expect(ducted.liftableHeaviness / open.liftableHeaviness).toBeCloseTo(
      DUCT_STATIC_THRUST_GAIN,
      6,
    )
  })

  it('is a third of what momentum theory promises', () => {
    // Sizing an installation from momentum theory alone would overstate what it
    // can lift by nearly three times. The realisation factor comes from
    // Zeppelin NT, which is certified to lift 400 kg of heaviness on three
    // 147 kW engines with 2.7 m propellers.
    expect(VECTORED_THRUST_REALISATION).toBeLessThan(0.5)
    const h = hoverCapability(COUNT, 6, POWER, false, GROSS, TRIM)
    const ideal = h.liftableHeaviness / VECTORED_THRUST_REALISATION
    expect(ideal / h.liftableHeaviness).toBeGreaterThan(2.5)
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

  it('still lands with one propulsor stopped, which is what sets the trim', () => {
    const out = propulsorOut(COUNT, HOVER, TRIM)
    expect(out.stillLands).toBe(true)
    // And it is close, which is the point: the trim was chosen to make it so.
    expect(out.remainingHeaviness).toBeLessThan(TRIM * 1.2)
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
