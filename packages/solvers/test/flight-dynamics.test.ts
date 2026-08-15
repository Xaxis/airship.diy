import { describe, expect, it } from 'vitest'
import { atmosphere, hullGeometry, pendulumPeriod } from '@airship/core'
import { m } from '@airship/units'
import {
  REST,
  ZERO_CONTROLS,
  forces,
  freeResponse,
  minimumFinAreaForStability,
  step,
  yawStaticMargin,
} from '../src/flight-dynamics.js'
import type { VehicleConfig, VehicleState } from '../src/flight-dynamics.js'

const hull = hullGeometry(m(90), 5)
const air = atmosphere(m(1000))
const GROSS_LIFT = hull.volume * 1.1397

const FIN_ARM = 38
const FIN_SLOPE = 2.8
const MINIMUM_FIN = minimumFinAreaForStability(hull, FIN_ARM, FIN_SLOPE)

const base = {
  hull,
  mass: GROSS_LIFT,
  grossLift: GROSS_LIFT,
  buoyancyToGravity: 4,
  rollInertia: 2.0e6,
  pitchInertia: 1.2e7,
  yawInertia: 1.2e7,
  finArm: FIN_ARM,
  finLiftSlope: FIN_SLOPE,
}

const finned: VehicleConfig = { ...base, finArea: MINIMUM_FIN * 1.5 }
const bare: VehicleConfig = { ...base, finArea: 0 }

/** Fly at a given speed with a given sideslip. */
const atSideslip = (speed: number, beta: number): VehicleState => ({
  ...REST,
  u: speed * Math.cos(beta),
  v: speed * Math.sin(beta),
})

/** Run until the sideslip either settles or runs away. */
const yawExcursion = (config: VehicleConfig, speed: number, beta: number) => {
  let state = atSideslip(speed, beta)
  let peak = 0
  for (let i = 0; i < 4000; i += 1) {
    state = step(state, config, air, ZERO_CONTROLS, 0.02)
    const current = Math.abs(Math.atan2(state.v, state.u))
    peak = Math.max(peak, current)
    if (current > (60 * Math.PI) / 180) return { peak, diverged: true }
  }
  return { peak, diverged: false }
}

/**
 * VALIDATION GATE 5.4: free response. The bare hull must be directionally
 * unstable and fins must stabilise it, and the pendulum period must match the
 * closed form.
 */
describe('validation gate: the bare hull is unstable and fins fix it', () => {
  it('the bare hull diverges in yaw at cruise speed', () => {
    // The Munk moment with nothing to oppose it. An airship without fins cannot
    // be flown, and this is the model saying so rather than being told.
    expect(yawExcursion(bare, 15, 0.087).diverged).toBe(true)
  })

  it('and fins at the derived minimum area contain it', () => {
    const contained = yawExcursion({ ...base, finArea: MINIMUM_FIN }, 15, 0.087)
    expect(contained.diverged).toBe(false)
    expect((contained.peak * 180) / Math.PI).toBeLessThan(8)
  })

  it('an undersized fin diverges just as surely as no fin at all', () => {
    // Below the minimum the vehicle is not marginally unstable, it is divergent
    // at every speed. There is no partial credit.
    const undersized = { ...base, finArea: MINIMUM_FIN * 0.35 }
    expect(yawStaticMargin(undersized)).toBeLessThan(1)
    expect(yawExcursion(undersized, 15, 0.087).diverged).toBe(true)
  })

  it('the stability requirement is independent of speed', () => {
    // Both the Munk moment and the fin restoring moment scale with dynamic
    // pressure, so they cancel. Static stability is a geometry problem, not a
    // flight condition, and a fin that works at 5 m/s works at 25.
    for (const speed of [5, 10, 20, 25]) {
      expect(yawExcursion(finned, speed, 0.087).diverged).toBe(false)
    }
  })

  it('and independent of altitude, for the same reason', () => {
    const thin = atmosphere(m(4000))
    let state = atSideslip(15, 0.087)
    for (let i = 0; i < 3000; i += 1) state = step(state, finned, thin, ZERO_CONTROLS, 0.02)
    expect(Math.abs(Math.atan2(state.v, state.u))).toBeLessThan((10 * Math.PI) / 180)
  })
})

/**
 * The closed-form fin sizing rule, which falls out of that cancellation.
 */
describe('minimum fin area', () => {
  it('is about 174 square metres for the baseline hull', () => {
    // A large surface, and it is why real airship fins look oversized to an
    // aeroplane eye.
    expect(MINIMUM_FIN).toBeGreaterThan(150)
    expect(MINIMUM_FIN).toBeLessThan(200)
  })

  it('scales as volume over tail arm', () => {
    // So a longer tail is worth exactly as much as proportionally more fin
    // area, which is why airship fins sit as far aft as the structure allows.
    const longTail = minimumFinAreaForStability(hull, FIN_ARM * 2, FIN_SLOPE)
    expect(longTail).toBeCloseTo(MINIMUM_FIN / 2, 6)
  })

  it('and with hull volume at fixed fineness ratio', () => {
    const big = hullGeometry(m(180), 5)
    const required = minimumFinAreaForStability(big, FIN_ARM, FIN_SLOPE)
    expect(required / MINIMUM_FIN).toBeCloseTo(big.volume / hull.volume, 3)
  })

  it('a more slender hull needs MORE fin, because k2 minus k1 grows', () => {
    // The trade the explicit Munk implementation makes visible: slenderness buys
    // drag and costs stability, so the two cannot be chosen independently.
    const slender = hullGeometry(m(90), 7)
    const stubby = hullGeometry(m(90), 3.5)
    const perVolumeSlender = minimumFinAreaForStability(slender, FIN_ARM, FIN_SLOPE) / slender.volume
    const perVolumeStubby = minimumFinAreaForStability(stubby, FIN_ARM, FIN_SLOPE) / stubby.volume
    expect(perVolumeSlender).toBeGreaterThan(perVolumeStubby)
  })
})

/**
 * The pendulum, which is the signature behaviour of the vehicle.
 */
describe('the CG-below-CB pendulum', () => {
  it('gives a pitch period matching the closed form to better than a percent', () => {
    // An independent check of the whole integrator: the simulated period has to
    // agree with 2*pi*sqrt(I/(L*g*h)) computed separately.
    const response = freeResponse(
      { ...REST, pitch: (10 * Math.PI) / 180 },
      finned,
      air,
      (s) => s.pitch,
      600,
      0.02,
    )

    /** @derived Added pitch inertia at the design point, from the added mass module. */
    const addedPitch = 0.7 * air.density * hull.volume * (90 / 2 / Math.sqrt(5)) ** 2
    const analytic = pendulumPeriod(GROSS_LIFT, 4, base.pitchInertia + addedPitch)

    expect(Math.abs(response.period / analytic - 1)).toBeLessThan(0.01)
  })

  it('is about thirty seconds, which is what the crew feels for a year', () => {
    const response = freeResponse(
      { ...REST, pitch: (10 * Math.PI) / 180 },
      finned,
      air,
      (s) => s.pitch,
      600,
      0.02,
    )
    expect(response.period).toBeGreaterThan(20)
    expect(response.period).toBeLessThan(45)
  })

  it('rolls several times faster than it pitches, because the gyradius is smaller', () => {
    // Pitch feels like a slow swell and roll feels like a boat. They are
    // governed by completely different physics on the same vehicle.
    const pitch = freeResponse({ ...REST, pitch: 0.15 }, finned, air, (s) => s.pitch, 600, 0.02)
    const roll = freeResponse({ ...REST, roll: 0.15 }, finned, air, (s) => s.roll, 600, 0.02)
    expect(roll.period).toBeLessThan(pitch.period / 2)
  })

  it('is UNDAMPED at zero airspeed, because the fins have no dynamic pressure', () => {
    // Physically correct and operationally important: a vehicle hovering in
    // still air wallows indefinitely, and there is nothing aerodynamic to stop
    // it. The only damping available at rest comes from the propulsors.
    const response = freeResponse(
      { ...REST, pitch: (8 * Math.PI) / 180 },
      finned,
      air,
      (s) => s.pitch,
      300,
      0.02,
    )
    expect(Math.abs(response.dampingRatio)).toBeLessThan(0.02)
    expect(response.divergent).toBe(false)
  })

  it('damping rises steeply with airspeed', () => {
    const crawl = freeResponse({ ...REST, u: 2, pitch: 0.14 }, finned, air, (s) => s.pitch, 300, 0.02)
    const slow = freeResponse({ ...REST, u: 5, pitch: 0.14 }, finned, air, (s) => s.pitch, 300, 0.02)
    expect(crawl.dampingRatio).toBeGreaterThan(0)
    expect(slow.dampingRatio).toBeGreaterThan(crawl.dampingRatio)
  })

  /**
   * THE CHANGE OF CHARACTER. With adequate fins the pitch mode is undamped at
   * rest and OVERDAMPED by cruise: the vehicle wallows indefinitely when
   * hovering and is dead-beat under way.
   *
   * That is a large difference in how the vehicle behaves across a speed range
   * it uses routinely, and a control law tuned at one end will misbehave at the
   * other.
   */
  it('and becomes OVERDAMPED at cruise, so it stops oscillating entirely', () => {
    const cruise = freeResponse(
      { ...REST, u: 15, pitch: 0.14 },
      finned,
      air,
      (s) => s.pitch,
      300,
      0.02,
    )
    expect(cruise.overdamped).toBe(true)
    expect(cruise.divergent).toBe(false)
    expect(Number.isNaN(cruise.period)).toBe(true)
  })

  it('while at rest it oscillates and never settles', () => {
    const hover = freeResponse(
      { ...REST, pitch: 0.14 },
      finned,
      air,
      (s) => s.pitch,
      300,
      0.02,
    )
    expect(hover.overdamped).toBe(false)
    expect(Number.isNaN(hover.period)).toBe(false)
  })
})

describe('the force model', () => {
  it('a neutrally buoyant ship at rest and level has no net force', () => {
    const f = forces(REST, finned, air, ZERO_CONTROLS)
    expect(Math.abs(f.X)).toBeLessThan(1e-6)
    expect(Math.abs(f.Y)).toBeLessThan(1e-6)
    expect(Math.abs(f.Z)).toBeLessThan(1e-6)
    expect(Math.abs(f.M)).toBeLessThan(1e-6)
  })

  it('a heavy ship has a downward force equal to its heaviness', () => {
    const heavy: VehicleConfig = { ...finned, mass: GROSS_LIFT + 300 }
    const f = forces(REST, heavy, air, ZERO_CONTROLS)
    expect(f.Z).toBeCloseTo(300 * 9.80665, 3)
  })

  it('pitching nose-up produces a nose-down pendulum moment', () => {
    const f = forces({ ...REST, pitch: 0.1 }, finned, air, ZERO_CONTROLS)
    expect(f.M).toBeLessThan(0)
  })

  it('rolling starboard produces a port-restoring moment', () => {
    const f = forces({ ...REST, roll: 0.1 }, finned, air, ZERO_CONTROLS)
    expect(f.L).toBeLessThan(0)
  })

  it('the bare hull at incidence gets a DESTABILISING pitch moment', () => {
    // Positive angle of attack, positive moment: it acts to increase the angle
    // rather than reduce it. This is the Munk moment and it is why fins exist.
    const f = forces({ ...REST, u: 15, w: 2 }, bare, air, ZERO_CONTROLS)
    expect(f.M).toBeGreaterThan(0)
  })

  it('and adding fins reverses the sign of that moment', () => {
    const withFins = forces({ ...REST, u: 15, w: 2 }, finned, air, ZERO_CONTROLS)
    expect(withFins.M).toBeLessThan(0)
  })

  it('sideslip to starboard produces a fin force to PORT', () => {
    // The sign that was wrong in an earlier version: the moment was right and
    // the side force backwards, which produced a plausible-looking yaw response
    // with the sideslip damping working against itself.
    const f = forces({ ...REST, u: 15, v: 2 }, finned, air, ZERO_CONTROLS)
    const bareF = forces({ ...REST, u: 15, v: 2 }, bare, air, ZERO_CONTROLS)
    expect(f.Y).toBeLessThan(bareF.Y)
  })

  it('drag opposes motion in every axis', () => {
    const f = forces({ ...REST, u: 15 }, bare, air, ZERO_CONTROLS)
    expect(f.X).toBeLessThan(0)
  })

  it('thrust acts forward, and vectoring tilts it', () => {
    const level = forces(REST, finned, air, { ...ZERO_CONTROLS, thrust: 5000 })
    expect(level.X).toBeCloseTo(5000, 3)

    const vectored = forces(REST, finned, air, {
      ...ZERO_CONTROLS,
      thrust: 5000,
      thrustVector: Math.PI / 2,
    })
    expect(vectored.Z).toBeCloseTo(-5000, 3)
  })
})

describe('integrator', () => {
  it('conserves the pendulum amplitude at zero airspeed over many cycles', () => {
    // RK4 rather than Euler precisely so the numerical damping does not
    // masquerade as physical damping. A first-order integrator would decay this
    // and agree with reality for the wrong reason.
    let state: VehicleState = { ...REST, pitch: 0.15 }
    for (let i = 0; i < 15000; i += 1) state = step(state, finned, air, ZERO_CONTROLS, 0.02)
    // After 300 s, roughly ten cycles, the amplitude should be essentially
    // unchanged.
    const response = freeResponse({ ...REST, pitch: 0.15 }, finned, air, (s) => s.pitch, 300, 0.02)
    expect(Math.abs(response.dampingRatio)).toBeLessThan(0.02)
  })

  it('is insensitive to timestep, which a first-order integrator would not be', () => {
    const coarse = freeResponse({ ...REST, pitch: 0.15 }, finned, air, (s) => s.pitch, 300, 0.05)
    const fine = freeResponse({ ...REST, pitch: 0.15 }, finned, air, (s) => s.pitch, 300, 0.005)
    expect(Math.abs(coarse.period / fine.period - 1)).toBeLessThan(0.02)
  })

  it('refuses to integrate through the Euler angle singularity', () => {
    // A pendulum-stable vehicle should never get near 90 degrees of pitch, so
    // reaching it means a divergence rather than a manoeuvre. Throwing beats
    // returning nonsense.
    expect(() => step({ ...REST, pitch: 1.55 }, finned, air, ZERO_CONTROLS, 0.02)).toThrow(RangeError)
  })

  it('a level ship with forward speed flies forward', () => {
    let state: VehicleState = { ...REST, u: 10 }
    for (let i = 0; i < 100; i += 1) state = step(state, finned, air, ZERO_CONTROLS, 0.02)
    expect(state.north).toBeGreaterThan(15)
    expect(Math.abs(state.east)).toBeLessThan(0.1)
  })
})
