import { describe, expect, it } from 'vitest'

import { ballastEndurance, ballastLoop } from '../src/index.js'

/**
 * The seawater ballast loop.
 *
 * The last gate in this project to fail was the diurnal superheat swing against
 * the trim the vehicle rests on water at, and it failed for a long time because
 * every way of changing a vehicle's weight in flight is expensive. This one is
 * not, and the reason is that a vehicle afloat is sitting on unlimited ballast.
 */

/** @derived The baseline's superheat excursion at 20 K, kg, from superheatHeavinessExcursion. It read 2230 while that helper was dropping the rho_air/(rho_air - rho_gas) prefactor. */
const SWING = 2477
/** @derived The landing trim, kg. */
const TRIM = 600
/** @derived The continuous habitat load, W. */
const HABITAT = 900

describe('what the loop costs', () => {
  it('is a bilge pump and a bladder, not a system', () => {
    const loop = ballastLoop(SWING, TRIM, HABITAT)
    expect(loop.pumpPower).toBeLessThan(500)
    expect(loop.tankVolume).toBeLessThan(3)
    expect(loop.systemMass).toBeLessThan(150)
  })

  it('draws a fraction of a percent of what the habitat does', () => {
    // Which is the whole reason this works: moving water costs about a
    // three-thousandth of what compressing lifting gas costs, and the water is
    // already underneath.
    const loop = ballastLoop(SWING, TRIM, HABITAT)
    expect(loop.shareOfHabitatLoad).toBeLessThan(0.01)
  })
})

describe('what sizes the pump', () => {
  it('is a clearing overcast, not the day', () => {
    // The envelope's thermal time constant is tens of minutes, so the superheat
    // arrives with the sunshine rather than lagging it by hours. A pump sized
    // for the six-hour diurnal swing is caught out by the weather.
    const loop = ballastLoop(SWING, TRIM, HABITAT)
    /** @derived The diurnal rate: the swing over six hours, in kg per minute. */
    const diurnalRate = SWING / (6 * 60)
    expect(loop.transferRate).toBeGreaterThan(diurnalRate * 5)
    expect(loop.tracksTheSwing).toBe(true)
  })

  it('scales the rate with the swing and nothing else', () => {
    const small = ballastLoop(1000, TRIM, HABITAT)
    const large = ballastLoop(2000, TRIM, HABITAT)
    expect(large.transferRate / small.transferRate).toBeCloseTo(2, 6)
    expect(large.pumpPower / small.pumpPower).toBeCloseTo(2, 6)
  })
})

describe('what the tank buys beyond one day', () => {
  it('runs out if it is sized for exactly one swing', () => {
    const loop = ballastLoop(SWING, TRIM, HABITAT)
    expect(ballastEndurance(loop.tankVolume, SWING, 30)).toBe(0)
  })

  it('carries a month on half again the capacity', () => {
    // Rain, spray and a second consecutive hot day all drift the trim in the
    // same direction, and a loop with no headroom saturates on the first of
    // them.
    const loop = ballastLoop(SWING, TRIM, HABITAT)
    const days = ballastEndurance(loop.tankVolume * 1.5, SWING, 30)
    expect(days).toBeGreaterThan(30)
  })
})
