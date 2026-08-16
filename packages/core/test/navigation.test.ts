import { describe, expect, it } from 'vitest'

import {
  atmosphere,
  hullGeometry,
  hullShapeForPrismatic,
  navigationPolar,
  yawedForceCoefficients,
} from '../src/index.js'
import { m, N, kg } from '@airship/units'

/**
 * Where the vehicle can go on the water.
 *
 * THE QUESTION EVERY OTHER TREATMENT GETS WRONG. "Can a 115 m airship motor to
 * windward?" gets answered with the side area, 2,300 m2 of sail against a few
 * tonnes of displacement, so obviously not. That reasoning is wrong by a factor
 * of fifty: BOW ON the complete vehicle's drag coefficient is 0.045 on volume to
 * the two thirds, an equivalent area of about 46 m2. The vehicle that cannot
 * make way is the one lying across the wind, and a vehicle with enough tail
 * never is.
 */

const HULL = hullGeometry(m(115), 5, hullShapeForPrismatic(0.69))
const AIR = atmosphere(m(0))

/** @source Four 5 m propulsors at 72 kW, by momentum theory at a ducted figure of merit. */
const THRUST = N(7500)
/** @derived The trim the vehicle rests on water at, kg. */
const LANDING_TRIM = kg(800)
/** @derived Waterline length of the gondola hulls, m. */
const WATERLINE = m(12)
const PROPULSORS = 4
/** @derived Lateral offset of a propulsor from the centreline, m. */
const OFFSET = m(13.6)

/** The corrected tail: 825 m2 of cruciform, so 413 m2 of vertical fin. */
const FINS = { verticalArea: 413, momentArm: 52, aspectRatio: 1.08 }

const polar = (windSpeed: number, lateralArea: number) =>
  navigationPolar(
    HULL,
    AIR,
    windSpeed,
    THRUST,
    LANDING_TRIM,
    WATERLINE,
    PROPULSORS,
    OFFSET,
    FINS,
    lateralArea,
  )

/** @derived The centreboard the design turns out to need, m2 immersed. */
const CENTREBOARD = 18

describe('motoring to windward', () => {
  it('makes way against a wind the side area says it could not', () => {
    // The requirement is 3 m/s into 10 m/s of wind. Bow-on it achieves nearly
    // five, because bow-on the hull is not a sail.
    const p = polar(10, CENTREBOARD)
    expect(p.upwindSpeed).toBeGreaterThan(3)
  })

  it('loses speed to the wind roughly as the wind rises, and does not stop', () => {
    const speeds = [5, 8, 10, 12].map((w) => polar(w, CENTREBOARD).upwindSpeed)
    for (let i = 1; i < speeds.length; i += 1) {
      expect(speeds[i]!).toBeLessThan(speeds[i - 1]!)
    }
    expect(speeds.at(-1)!).toBeGreaterThan(1)
  })
})

describe('the fins', () => {
  it('hold it bow-on by themselves, which frees the propulsors to make way', () => {
    // With the tail the yaw stability check demands, the vehicle weathervanes
    // unaided and the propulsors are not spent on heading. With the tail the
    // arrangement carried BEFORE that check was corrected, they were.
    expect(polar(10, CENTREBOARD).weathervanesUnaided).toBe(true)

    const smallTail = navigationPolar(
      HULL,
      AIR,
      10,
      THRUST,
      LANDING_TRIM,
      WATERLINE,
      PROPULSORS,
      OFFSET,
      { verticalArea: 202, momentArm: 48, aspectRatio: 0.94 },
      CENTREBOARD,
    )
    expect(smallTail.weathervanesUnaided).toBe(false)
  })
})

describe('leeway, which is where the honest answer lives', () => {
  it('makes immersed lateral area the parameter that decides whether boat mode exists', () => {
    // THE SINGLE MOST USEFUL RESULT IN THE MARINE MODEL. Holding a heading and
    // travelling along it are different things: at an angle to the wind the
    // envelope makes an enormous side force and a hull sitting centimetres into
    // the water resists almost none of it. With the bare hulls the vehicle
    // points where the fins say and goes where the wind says, and the usable
    // cone is a few degrees. A centreboard opens it to the whole compass.
    const bare = polar(10, 0.5)
    const board = polar(10, CENTREBOARD)

    expect(bare.widestUsefulHeading).toBeLessThan((15 * Math.PI) / 180)
    expect(board.widestUsefulHeading).toBeGreaterThan((90 * Math.PI) / 180)

    // And the speed through the water is unchanged, which is the point: this is
    // not a power problem and no amount of thrust fixes it.
    expect(board.upwindSpeed).toBeCloseTo(bare.upwindSpeed, 1)
  })

  it('is worst at the beam and vanishes at both ends', () => {
    const p = polar(10, CENTREBOARD)
    const upwind = p.points[0]!
    const downwind = p.points.at(-1)!
    expect(upwind.driftAngle).toBeLessThan(p.beamLeeway)
    expect(downwind.driftAngle).toBeLessThan(p.beamLeeway)
  })
})

describe('the crossflow decomposition', () => {
  it('reproduces both measured endpoints exactly', () => {
    const bow = yawedForceCoefficients(0)
    const beam = yawedForceCoefficients(Math.PI / 2)
    expect(bow.axial).toBeCloseTo(0.045, 6)
    expect(bow.lateral).toBeCloseTo(0, 6)
    expect(beam.axial).toBeCloseTo(0, 6)
    expect(beam.lateral).toBeCloseTo(1.8, 6)
  })

  it('shows why beam-on is the attitude that cannot be recovered from', () => {
    // Forty to one on force, which is the whole reason weathervaning is the
    // marine survival strategy rather than one design feature among several.
    const beam = yawedForceCoefficients(Math.PI / 2)
    const bow = yawedForceCoefficients(0)
    expect(beam.lateral / bow.axial).toBeGreaterThan(35)
  })
})
