import { CONSTANTS, v as valueOf } from '@airship/data'
import {
  COMPLETE_SHIP_DRAG_COEFFICIENT,
  MUNK_REAL_FLUID_FACTOR,
  addedMassMatrix,
  inertiaCoefficients,
} from '@airship/core'
import type { AtmosphereState, HullGeometry } from '@airship/core'

/**
 * Six degree of freedom flight dynamics.
 *
 * WHAT MAKES AN AIRSHIP DIFFERENT FROM AN AEROPLANE, and all three are
 * first-order rather than refinements:
 *
 * ADDED MASS. The displaced air is comparable to the ship's own mass, so the
 * effective mass in sway and heave is nearly double. A simulation without it is
 * wrong by about a factor of two in transverse response and will feel like
 * nothing real.
 *
 * THE MUNK MOMENT. A bare hull at incidence is statically UNSTABLE in both
 * pitch and yaw. Fins are what make the vehicle flyable, and the instability
 * grows as the square of speed while the pendulum that opposes it in pitch does
 * not grow at all.
 *
 * THE PENDULUM. The centre of buoyancy sits well above the centre of gravity,
 * giving a strong restoring couple and a slow characteristic oscillation of
 * tens of seconds. It is the signature behaviour of the vehicle and it is what
 * the crew feels continuously for a year.
 *
 * A DELIBERATE NON-DUPLICATION. The Munk moment IS the added-mass Coriolis
 * coupling: it arises from the body having axial and transverse velocity at
 * once. It is applied here as an explicit external moment, per the brief, and
 * the added mass therefore enters ONLY through the diagonal inertia matrix. A
 * model that both put off-diagonal added-mass terms in the mass matrix AND
 * applied a Munk moment would count the same physics twice.
 *
 * FRAME AND ATTITUDE CONVENTION. Body axes are x forward, y starboard, z down.
 * Earth axes are north, east, down. Attitude is Euler angles in the usual
 * aerospace 3-2-1 order. Euler angles are singular at plus or minus ninety
 * degrees of pitch, which quaternions would avoid; they are used here because
 * this vehicle is pendulum-stable in pitch and does not go near that attitude,
 * and because a readable state vector is worth more than robustness against a
 * manoeuvre the vehicle cannot perform. The integrator throws rather than
 * silently producing nonsense if pitch approaches the singularity.
 */

export interface VehicleState {
  /** Earth frame position: north, east, down. Metres. */
  readonly north: number
  readonly east: number
  readonly down: number
  /** Euler angles: roll, pitch, yaw. Radians. */
  readonly roll: number
  readonly pitch: number
  readonly yaw: number
  /** Body frame velocity: surge, sway, heave. m/s. */
  readonly u: number
  readonly v: number
  readonly w: number
  /** Body frame angular rates: roll, pitch, yaw. rad/s. */
  readonly p: number
  readonly q: number
  readonly r: number
}

export interface VehicleConfig {
  readonly hull: HullGeometry
  /** Total mass, kg. */
  readonly mass: number
  /** Gross lift as a mass, kg. Equal to mass when neutrally buoyant. */
  readonly grossLift: number
  /**
   * Vertical separation of the centre of buoyancy above the centre of gravity,
   * m. The pendulum lever, and the single most important handling parameter.
   */
  readonly buoyancyToGravity: number
  /** Roll, pitch and yaw inertia about the CG, kg m2, EXCLUDING added mass. */
  readonly rollInertia: number
  readonly pitchInertia: number
  readonly yawInertia: number
  /** Combined fin area, m2. Zero models the bare hull. */
  readonly finArea: number
  /** Distance from CG to the fin centre of pressure, m. Positive aft. */
  readonly finArm: number
  /** Fin lift curve slope, per radian. */
  readonly finLiftSlope: number
  /**
   * Outboard wing, if the vehicle has one. Reference area and span, so the
   * induced drag uses the span the vortices actually leave from.
   *
   * A wing changes the handling in a way the fins do not: it makes lift that
   * grows with the square of speed at a fixed incidence, so the vehicle becomes
   * progressively less buoyancy-dominated as it accelerates, and its pitch trim
   * changes with speed for the first time.
   */
  readonly wingArea?: number
  readonly wingSpan?: number
  /** Distance from CG to the wing aerodynamic centre, m. Positive aft. */
  readonly wingArm?: number
}

export interface Controls {
  /** Net thrust along the body x axis, N. */
  readonly thrust: number
  /** Thrust vector angle in pitch, radians. Positive tilts thrust upward. */
  readonly thrustVector: number
  /** Elevator deflection, radians. */
  readonly elevator: number
  /** Rudder deflection, radians. */
  readonly rudder: number
}

export const ZERO_CONTROLS: Controls = { thrust: 0, thrustVector: 0, elevator: 0, rudder: 0 }

const G0 = CONSTANTS.g0.value

/**
 * The generalised mass matrix, diagonal for a body of revolution.
 *
 * Roll carries NO added inertia: an axisymmetric body spinning about its own
 * axis moves no ideal fluid. Real roll damping comes from the fins and from
 * viscosity, both of which appear in the force model instead.
 */
const generalisedMass = (config: VehicleConfig, air: AtmosphereState) => {
  /** @derived Radius of gyration of the displaced air about a transverse axis. */
  const gyradius = config.hull.length / 2 / Math.sqrt(5)
  const added = addedMassMatrix(config.hull.volume, config.hull.finenessRatio, air.density, gyradius)

  return {
    surge: config.mass + added.surge,
    sway: config.mass + added.sway,
    heave: config.mass + added.heave,
    roll: config.rollInertia + added.roll,
    pitch: config.pitchInertia + added.pitch,
    yaw: config.yawInertia + added.yaw,
  }
}

export interface Forces {
  readonly X: number
  readonly Y: number
  readonly Z: number
  readonly L: number
  readonly M: number
  readonly N: number
}

/**
 * All external forces and moments in body axes.
 *
 * Exported so a test can interrogate the force model directly rather than
 * inferring it from a trajectory, which is how the Munk moment sign convention
 * gets verified.
 */
export const forces = (
  state: VehicleState,
  config: VehicleConfig,
  air: AtmosphereState,
  controls: Controls,
): Forces => {
  const { u, v, w, p, q, r } = state
  const speed = Math.hypot(u, v, w)


  // --- weight and buoyancy ------------------------------------------------
  // Both act vertically in the earth frame and are rotated into body axes.
  // Their difference is the static heaviness; their separation is the pendulum.
  const netVertical = (config.mass - config.grossLift) * G0
  const cosT = Math.cos(state.pitch)
  const sinT = Math.sin(state.pitch)
  const cosP = Math.cos(state.roll)
  const sinP = Math.sin(state.roll)

  let X = -netVertical * sinT
  let Y = netVertical * cosT * sinP
  let Z = netVertical * cosT * cosP

  // The pendulum couple. Buoyancy acts at the CB, a distance above the CG, so
  // any tilt produces a restoring moment proportional to GROSS LIFT rather than
  // to the small net weight.
  const buoyantForce = config.grossLift * G0
  let L = -buoyantForce * config.buoyancyToGravity * sinP * cosT
  let M = -buoyantForce * config.buoyancyToGravity * sinT
  let N = 0

  // @derived Below this the aerodynamic terms are meaningless and dividing by
  // speed would blow up. Not a physical threshold.
  const AERODYNAMIC_FLOOR = 1e-6
  if (speed > AERODYNAMIC_FLOOR) {
    const q_dyn = 0.5 * air.density * speed * speed
    const reference = config.hull.volume ** (2 / 3)

    // --- drag, opposing the velocity vector -------------------------------
    const drag = valueOf(COMPLETE_SHIP_DRAG_COEFFICIENT) * q_dyn * reference
    X -= (drag * u) / speed
    Y -= (drag * v) / speed
    Z -= (drag * w) / speed

    // --- the Munk moment, destabilising -----------------------------------
    // Applied about both transverse axes. The real-flow factor accounts for
    // the flow separating near the tail before the aft suction completes the
    // couple.
    const { k1, k2 } = inertiaCoefficients(config.hull.finenessRatio)
    const munkCoefficient =
      MUNK_REAL_FLUID_FACTOR * 0.5 * air.density * config.hull.volume * (k2 - k1)

    /** @derived sin(2a) with a the incidence, expanded as 2*sin*cos from the velocity components. */
    const alpha = Math.atan2(w, u)
    const beta = Math.atan2(v, u)
    M += munkCoefficient * speed * speed * Math.sin(2 * alpha)
    N -= munkCoefficient * speed * speed * Math.sin(2 * beta)

    // --- fins, stabilising and damping ------------------------------------
    // The local incidence at the fin includes the rate-induced component,
    // which is where pitch and yaw damping come from. Without it the vehicle
    // is statically stable and dynamically undamped, which looks plausible on
    // a trim plot and oscillates forever in a simulation.
    /**
     * The wing.
     *
     * Placed at the centre of buoyancy so it makes lift without making a trim
     * change, which is the Aereon result the arrangement is built around, and
     * its arm is therefore near zero on this vehicle. It is carried anyway
     * because it is not zero on every configuration and a pitching moment that
     * silently vanishes is a pitching moment nobody checks.
     */
    const wingArea = config.wingArea ?? 0
    const wingSpan = config.wingSpan ?? 0
    const wingArm = config.wingArm ?? 0
    if (wingArea > 0 && wingSpan > 0) {
      const wingAspect = (wingSpan * wingSpan) / wingArea
      /** @source Helmbold's finite-span lift-curve slope. */
      const wingSlope = (2 * Math.PI * wingAspect) / (2 + Math.sqrt(wingAspect * wingAspect + 4))
      /** @source Span efficiency of a tapered planform without twist optimisation. */
      const WING_SPAN_EFFICIENCY = 0.85
      /** @source Profile drag coefficient of a clean section, on wing area. */
      const WING_PROFILE_DRAG = 0.01

      const wingCl = wingSlope * alpha
      const wingLift = wingCl * q_dyn * wingArea
      const wingInduced =
        ((wingCl * wingCl) / (Math.PI * wingAspect * WING_SPAN_EFFICIENCY)) *
        q_dyn *
        wingArea
      const wingProfile = WING_PROFILE_DRAG * q_dyn * wingArea

      Z -= wingLift
      X -= wingInduced + wingProfile
      // SAME SIGN AS THE FIN, because it is the same geometry. An upward force
      // at a positive (aft) arm is a nose-DOWN moment. This read `M +=` while
      // the fin fifteen lines below reads `M -=` for the identical situation,
      // so the two surfaces disagreed about which way lift pitches the ship.
      M -= wingLift * wingArm
    }

    if (config.finArea > 0) {
      const finQ = q_dyn * config.finArea * config.finLiftSlope

      const alphaFin = alpha + (q * config.finArm) / speed + controls.elevator
      const betaFin = beta - (r * config.finArm) / speed + controls.rudder

      const finLiftZ = finQ * alphaFin
      const finLiftY = finQ * betaFin

      // Pitch: positive incidence gives an upward fin force and a nose-down
      // moment, which is restoring.
      Z -= finLiftZ
      M -= finLiftZ * config.finArm

      // Yaw: positive sideslip gives a fin force to PORT and a nose-to-starboard
      // moment, which turns the nose toward the velocity vector. The side force
      // sign matters as much as the moment: an earlier version had the moment
      // right and the force backwards, which produced a plausible-looking yaw
      // response with the sideslip damping working against itself.
      Y -= finLiftY
      N += finLiftY * config.finArm

      // Roll damping from the fins. Small, and the only roll damping there is,
      // because the hull contributes none.
      /** @derived Fin roll damping, with the fin span taken as the hull radius. */
      const finSpan = config.hull.maxDiameter / 2
      L -= q_dyn * config.finArea * config.finLiftSlope * ((p * finSpan) / speed) * finSpan
    }
  }

  // --- thrust -------------------------------------------------------------
  X += controls.thrust * Math.cos(controls.thrustVector)
  Z -= controls.thrust * Math.sin(controls.thrustVector)

  return { X, Y, Z, L, M, N }
}

/** State derivative. Exported for the RK4 stages and for testing. */
export const derivative = (
  state: VehicleState,
  config: VehicleConfig,
  air: AtmosphereState,
  controls: Controls,
): VehicleState => {
  const mass = generalisedMass(config, air)
  const f = forces(state, config, air, controls)
  const { u, v, w, p, q, r } = state

  // Rigid-body Coriolis and centripetal terms. The added-mass coupling is NOT
  // here: it is applied as the explicit Munk moment in the force model, and
  // including both would double count it.
  const du = (f.X + mass.sway * v * r - mass.heave * w * q) / mass.surge
  const dv = (f.Y + mass.heave * w * p - mass.surge * u * r) / mass.sway
  const dw = (f.Z + mass.surge * u * q - mass.sway * v * p) / mass.heave

  const dp = (f.L + (mass.pitch - mass.yaw) * q * r) / mass.roll
  const dq = (f.M + (mass.yaw - mass.roll) * r * p) / mass.pitch
  const dr = (f.N + (mass.roll - mass.pitch) * p * q) / mass.yaw

  // Kinematics.
  const cosP = Math.cos(state.roll)
  const sinP = Math.sin(state.roll)
  const cosT = Math.cos(state.pitch)
  const sinT = Math.sin(state.pitch)
  const tanT = Math.tan(state.pitch)
  const cosY = Math.cos(state.yaw)
  const sinY = Math.sin(state.yaw)

  const dRoll = p + (q * sinP + r * cosP) * tanT
  const dPitch = q * cosP - r * sinP
  const dYaw = (q * sinP + r * cosP) / cosT

  const dNorth =
    u * cosT * cosY + v * (sinP * sinT * cosY - cosP * sinY) + w * (cosP * sinT * cosY + sinP * sinY)
  const dEast =
    u * cosT * sinY + v * (sinP * sinT * sinY + cosP * cosY) + w * (cosP * sinT * sinY - sinP * cosY)
  const dDown = -u * sinT + v * sinP * cosT + w * cosP * cosT

  return {
    north: dNorth,
    east: dEast,
    down: dDown,
    roll: dRoll,
    pitch: dPitch,
    yaw: dYaw,
    u: du,
    v: dv,
    w: dw,
    p: dp,
    q: dq,
    r: dr,
  }
}

const scaleAdd = (a: VehicleState, b: VehicleState, factor: number): VehicleState => ({
  north: a.north + b.north * factor,
  east: a.east + b.east * factor,
  down: a.down + b.down * factor,
  roll: a.roll + b.roll * factor,
  pitch: a.pitch + b.pitch * factor,
  yaw: a.yaw + b.yaw * factor,
  u: a.u + b.u * factor,
  v: a.v + b.v * factor,
  w: a.w + b.w * factor,
  p: a.p + b.p * factor,
  q: a.q + b.q * factor,
  r: a.r + b.r * factor,
})

/** @derived Pitch angle beyond which the Euler kinematics are near-singular. */
const PITCH_LIMIT = (85 * Math.PI) / 180

/**
 * One RK4 step.
 *
 * Fourth order because the pendulum mode is lightly damped and a first-order
 * integrator adds numerical damping that looks exactly like physical damping.
 * A model that got the damping from its own truncation error would agree with
 * reality for the wrong reason and stop agreeing the moment the timestep
 * changed.
 */
export const step = (
  state: VehicleState,
  config: VehicleConfig,
  air: AtmosphereState,
  controls: Controls,
  dt: number,
): VehicleState => {
  if (Math.abs(state.pitch) > PITCH_LIMIT) {
    throw new RangeError(
      `Pitch of ${((state.pitch * 180) / Math.PI).toFixed(1)} degrees is approaching the Euler ` +
        `angle singularity at 90 degrees. This vehicle is pendulum-stable and should never reach ` +
        `that attitude, so this indicates a divergence rather than a manoeuvre. Switch to ` +
        `quaternions if the flight envelope genuinely needs it.`,
    )
  }

  const k1 = derivative(state, config, air, controls)
  const k2 = derivative(scaleAdd(state, k1, dt / 2), config, air, controls)
  const k3 = derivative(scaleAdd(state, k2, dt / 2), config, air, controls)
  const k4 = derivative(scaleAdd(state, k3, dt), config, air, controls)

  const combined: VehicleState = {
    north: (k1.north + 2 * k2.north + 2 * k3.north + k4.north) / 6,
    east: (k1.east + 2 * k2.east + 2 * k3.east + k4.east) / 6,
    down: (k1.down + 2 * k2.down + 2 * k3.down + k4.down) / 6,
    roll: (k1.roll + 2 * k2.roll + 2 * k3.roll + k4.roll) / 6,
    pitch: (k1.pitch + 2 * k2.pitch + 2 * k3.pitch + k4.pitch) / 6,
    yaw: (k1.yaw + 2 * k2.yaw + 2 * k3.yaw + k4.yaw) / 6,
    u: (k1.u + 2 * k2.u + 2 * k3.u + k4.u) / 6,
    v: (k1.v + 2 * k2.v + 2 * k3.v + k4.v) / 6,
    w: (k1.w + 2 * k2.w + 2 * k3.w + k4.w) / 6,
    p: (k1.p + 2 * k2.p + 2 * k3.p + k4.p) / 6,
    q: (k1.q + 2 * k2.q + 2 * k3.q + k4.q) / 6,
    r: (k1.r + 2 * k2.r + 2 * k3.r + k4.r) / 6,
  }

  return scaleAdd(state, combined, dt)
}

/**
 * Minimum total fin area for neutral static stability in yaw.
 *
 * @derived Setting the fin restoring moment equal to the Munk moment at small
 * incidence, where sin(2b) approaches 2b:
 *
 *   0.5*rho*U^2*S*a*b*arm  =  f*0.5*rho*U^2*V*(k2-k1)*2b
 *
 * Both the dynamic pressure and the incidence cancel, leaving
 *
 *   S_min = 2*f*V*(k2 - k1) / (a * arm)
 *
 * TWO THINGS FALL OUT OF THAT CANCELLATION, and both are useful.
 *
 * The requirement is INDEPENDENT OF SPEED AND ALTITUDE. A fin that stabilises
 * the hull at 5 m/s stabilises it at 25 m/s and at any density, because the
 * destabilising and restoring moments scale identically. Static stability is a
 * geometry problem, not a flight condition.
 *
 * And it scales with VOLUME OVER ARM. A longer tail is worth exactly as much as
 * proportionally more fin area, which is why airship fins sit as far aft as the
 * structure allows.
 *
 * For the baseline hull this returns about 174 m2, which is a large surface and
 * is why real airship fins look oversized to an aeroplane eye. A design with
 * less than this is not marginally unstable, it is divergent at every speed.
 */
export const minimumFinAreaForStability = (
  hull: HullGeometry,
  finArm: number,
  finLiftSlope: number,
): number => {
  const { k1, k2 } = inertiaCoefficients(hull.finenessRatio)
  return (2 * MUNK_REAL_FLUID_FACTOR * hull.volume * (k2 - k1)) / (finLiftSlope * finArm)
}

/**
 * Static margin in yaw: fin restoring moment over Munk destabilising moment.
 *
 * Below 1 the vehicle diverges. Airship practice wants a comfortable margin
 * above it, because the Munk moment is certain and the fin effectiveness is not:
 * the tail sits in a thick hull boundary layer where the local dynamic pressure
 * is well below free stream.
 */
export const yawStaticMargin = (config: VehicleConfig): number =>
  config.finArea /
  minimumFinAreaForStability(config.hull, config.finArm, config.finLiftSlope)

export const REST: VehicleState = {
  north: 0,
  east: 0,
  down: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  u: 0,
  v: 0,
  w: 0,
  p: 0,
  q: 0,
  r: 0,
}

export interface FreeResponse {
  /** Oscillation period, seconds. NaN when the mode does not oscillate. */
  readonly period: number
  /** Logarithmic decrement per cycle. Positive means damped. NaN if overdamped. */
  readonly dampingRatio: number
  /** True when the amplitude grew rather than decayed. */
  readonly divergent: boolean
  /**
   * True when the disturbance decayed without completing an oscillation.
   *
   * A REAL AND USEFUL STATE, not a measurement failure. With adequate fins the
   * airship pitch mode is undamped at rest and becomes OVERDAMPED somewhere
   * around 10 m/s: the vehicle wallows indefinitely when hovering and is
   * dead-beat at cruise. Reporting that as a NaN period would look like a
   * broken measurement rather than a change of character.
   */
  readonly overdamped: boolean
  readonly samples: readonly { time: number; value: number }[]
}

/**
 * Release the vehicle from a disturbed attitude and measure what it does.
 *
 * The validation gate for the whole solver. A vehicle whose free response has
 * the wrong period or the wrong sign of damping is not modelling the physics
 * even if every individual force is right.
 */
/**
 * @derived Default observation window, seconds. Long enough for about ten
 * cycles of the roughly 30 second pendulum mode.
 */
const DEFAULT_RESPONSE_DURATION = 300

/**
 * @derived Default timestep, seconds. Well inside the range where RK4 is
 * timestep-insensitive for this system, which the tests assert.
 */
const DEFAULT_RESPONSE_TIMESTEP = 0.02

/**
 * @derived Amplitude ratio above which growth counts as divergence rather than
 * measurement noise.
 */
const DIVERGENCE_THRESHOLD = 1.05

export const freeResponse = (
  initial: VehicleState,
  config: VehicleConfig,
  air: AtmosphereState,
  observe: (s: VehicleState) => number,
  duration = DEFAULT_RESPONSE_DURATION,
  dt = DEFAULT_RESPONSE_TIMESTEP,
): FreeResponse => {
  let state = initial
  const samples: { time: number; value: number }[] = []
  const peaks: { time: number; value: number }[] = []

  let previous = observe(state)
  let previousSlope = 0

  for (let i = 0; i * dt <= duration; i += 1) {
    const time = i * dt
    const value = observe(state)
    samples.push({ time, value })

    const slope = value - previous
    // A sign change in the slope is a turning point.
    if (i > 1 && slope * previousSlope < 0) peaks.push({ time, value: Math.abs(previous) })

    previous = value
    previousSlope = slope
    state = step(state, config, air, ZERO_CONTROLS, dt)
  }

  if (peaks.length < 3) {
    // Fewer than three turning points means the disturbance either decayed
    // without oscillating, or has not had time to. Distinguish the two by
    // whether it actually got smaller.
    const startMagnitude = Math.abs(samples[0]?.value ?? 0)
    const endMagnitude = Math.abs(samples[samples.length - 1]?.value ?? 0)
    /** @derived Halved counts as decayed for the overdamped test. */
    const decayed = startMagnitude > 0 && endMagnitude < startMagnitude * 0.5

    return {
      period: Number.NaN,
      dampingRatio: Number.NaN,
      divergent: endMagnitude > startMagnitude * DIVERGENCE_THRESHOLD,
      overdamped: decayed,
      samples,
    }
  }

  // Successive turning points are half a period apart.
  const halfPeriods: number[] = []
  for (let i = 1; i < peaks.length; i += 1) {
    halfPeriods.push((peaks[i]?.time ?? 0) - (peaks[i - 1]?.time ?? 0))
  }
  const period = 2 * (halfPeriods.reduce((a, b) => a + b, 0) / halfPeriods.length)

  const first = peaks[0]?.value ?? 0
  const last = peaks[peaks.length - 1]?.value ?? 0
  const cycles = (peaks.length - 1) / 2

  return {
    period,
    dampingRatio: cycles > 0 && last > 0 && first > 0 ? Math.log(first / last) / cycles : 0,
    divergent: last > first * DIVERGENCE_THRESHOLD,
    overdamped: false,
    samples,
  }
}
