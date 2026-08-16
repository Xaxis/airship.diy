import { describe, expect, it } from 'vitest'

import {
  atmosphere,
  hullGeometry,
  hullShapeForPrismatic,
  wingGeometry,
  wingPayloadEnvelope,
  wingSolarAdvantage,
  wingTrade,
} from '../src/index.js'
import { m, rad } from '@airship/units'

/**
 * Real wings on a fully buoyant hull.
 *
 * THE WHOLE POINT OF THIS MODULE IS THAT THE OBVIOUS QUESTION IS THE WRONG ONE.
 * Everyone asks when a wing makes an airship more efficient, and the answer is
 * always "faster than you can fly", because the hull drag a wing saves grows as
 * the cube of speed while its own induced drag falls as the inverse square. Ask
 * instead what it lets you CARRY on the power you already have, and the answer
 * is several tonnes at a speed the vehicle can actually reach.
 */

const HULL = hullGeometry(m(115), 5, hullShapeForPrismatic(0.69))
const AIR = atmosphere(m(2000))
/** @source Complete-ship volumetric drag coefficient. */
const HULL_DRAG = 0.025
/** @source Propulsive efficiency of a large slow propulsor. */
const ETA = 0.8
/** @derived Gross weight of the baseline, N. */
const GROSS_WEIGHT = 23416 * 9.80665
/** @derived Installed shaft power, W: four units. */
const INSTALLED = 72e3
/** @derived The speed the vehicle spends its life at, m/s. */
const STATION_SPEED = 8

const WING = wingGeometry(60, 450)

describe('the crossover, which answers the wrong question', () => {
  it('is far faster than the vehicle can be powered to', () => {
    const t = wingTrade(WING, HULL, GROSS_WEIGHT, 0.7, STATION_SPEED, AIR.density, HULL_DRAG, ETA)
    expect(t.crossoverExists).toBe(true)
    expect(t.crossoverSpeed).toBeGreaterThan(30)
    // And the power there is an order of magnitude past what is installed.
    expect(t.crossoverPower).toBeGreaterThan(INSTALLED * 5)
  })

  it('disappears entirely once the wing gets big enough to be worth flying', () => {
    // A larger wing carries its own profile drag everywhere, and past a certain
    // size that cost never gets repaid at any speed. The wing that would make
    // the vehicle efficient is smaller than the wing that would make it useful,
    // which is the clearest statement of why efficiency is not the criterion.
    const big = wingGeometry(80, 800)
    const t = wingTrade(big, HULL, GROSS_WEIGHT, 0.7, STATION_SPEED, AIR.density, HULL_DRAG, ETA)
    expect(t.crossoverExists).toBe(false)
  })

  it('charges its profile drag every hour the vehicle is on station', () => {
    const t = wingTrade(WING, HULL, GROSS_WEIGHT, 0.7, STATION_SPEED, AIR.density, HULL_DRAG, ETA)
    expect(t.stationKeepingPowerPenalty).toBeGreaterThan(0.1)
    // Which is the argument for folding wings, and unlike the folding ENVELOPE
    // this one is buildable: a wing is a rigid structure with a hinge, and no
    // lifting gas has to go anywhere.
  })
})

describe('what the wing actually buys', () => {
  it('carries tonnes of extra weight on the power already installed', () => {
    const env = wingPayloadEnvelope(WING, HULL, AIR.density, HULL_DRAG, INSTALLED, ETA)
    expect(env.bestPayload).toBeGreaterThan(3000)
    // And it nets out well positive against its own structure.
    expect(env.bestPayload - WING.mass).toBeGreaterThan(2000)
  })

  it('does it SLOWLY, which is the opposite of what the crossover suggests', () => {
    // Flying slower makes the hull cheap and the wing dear; flying faster does
    // the reverse. The best carrying speed sits between them and well below the
    // speed at which a wing would start to save power.
    const env = wingPayloadEnvelope(WING, HULL, AIR.density, HULL_DRAG, INSTALLED, ETA)
    const t = wingTrade(WING, HULL, GROSS_WEIGHT, 0.7, STATION_SPEED, AIR.density, HULL_DRAG, ETA)
    expect(env.bestSpeed).toBeLessThan(20)
    expect(env.bestSpeed).toBeLessThan(t.crossoverSpeed / 2)
  })

  it('never asks the section for more lift coefficient than it has', () => {
    const env = wingPayloadEnvelope(WING, HULL, AIR.density, HULL_DRAG, INSTALLED, ETA)
    for (const p of env.points) {
      expect(p.liftCoefficient).toBeLessThanOrEqual(1.2)
    }
  })

  it('scales its payload with area but its cost with area too', () => {
    const small = wingGeometry(30, 120)
    const large = wingGeometry(60, 450)
    const a = wingPayloadEnvelope(small, HULL, AIR.density, HULL_DRAG, INSTALLED, ETA)
    const b = wingPayloadEnvelope(large, HULL, AIR.density, HULL_DRAG, INSTALLED, ETA)
    expect(b.bestPayload).toBeGreaterThan(a.bestPayload)
    // The net gain still grows, so bigger is better until the lift margin or the
    // shed runs out. It is the arrangement that limits the wing, not the physics.
    expect(b.bestPayload - large.mass).toBeGreaterThan(a.bestPayload - small.mass)
  })
})

describe('the wing as a solar platform', () => {
  it('is worth almost nothing, because the hull band is already narrow', () => {
    // A HYPOTHESIS THAT DIED ON CONTACT. A wing is flat and a hull is doubly
    // curved, so a square metre of wing should collect more. It does, by five
    // percent, because this project already cut its array band from 75 degrees
    // to 32 and at 32 the mean cosine is 0.949. The earlier correction ate the
    // benefit of this one.
    /** @source The baseline's array coverage half-angle, radians. */
    const band = rad((32 * Math.PI) / 180)
    const s = wingSolarAdvantage(450, band, 2.6)
    expect(s.advantage).toBeLessThan(1.1)
  })

  it('would have been worth having at the band this project used to carry', () => {
    const wide = wingSolarAdvantage(450, rad((75 * Math.PI) / 180), 2.6)
    const narrow = wingSolarAdvantage(450, rad((32 * Math.PI) / 180), 2.6)
    expect(wide.advantage).toBeGreaterThan(narrow.advantage)
    expect(wide.advantage).toBeGreaterThan(1.3)
  })
})
