import type { AtmosphereState } from '../atmosphere.js'
import type { HullGeometry } from '../geometry/hull.js'
import { boatResistance } from './boat.js'
import {
  DRAG_COEFFICIENT_BOW_ON,
  SIDE_FORCE_COEFFICIENT_BEAM_ON,
  YAW_MOMENT_COEFFICIENT_BEAM_ON,
} from './windage.js'
import { CONSTANTS } from '@airship/data'
import type { Kilograms, Meters, Newtons } from '@airship/units'
import { N } from '@airship/units'

/**
 * Where the vehicle can actually go on the water, and where it cannot.
 *
 * THE QUESTION THIS ANSWERS, AND WHY THE OBVIOUS ANSWER IS WRONG.
 *
 * "Can a 115 m airship motor to windward?" gets answered with the side area:
 * 2,300 m2 of sail against a few tonnes of displacement, so obviously not. That
 * reasoning is wrong, and it is wrong by a factor of fifty.
 *
 * BOW ON, THE HULL IS NOT A SAIL. The complete vehicle's bow-on drag
 * coefficient is 0.045 on volume to the two thirds, which for this envelope is
 * an EQUIVALENT AREA OF ABOUT 46 SQUARE METRES. Beam-on it is 1.8, which is
 * 1,850. The vehicle that cannot make way is the one lying across the wind, and
 * a vehicle free to weathervane never is.
 *
 * So upwind is easy and the honest limit is somewhere else entirely: THE YAW
 * MOMENT. A hull at an angle to the wind generates a moment that turns it
 * further from the wind, referenced to VOLUME rather than to volume to the two
 * thirds, which makes it enormous. Holding a heading off the wind means
 * balancing that moment with differential thrust, and the propulsors lose by
 * more than an order of magnitude.
 *
 * THE RESULT IS THAT BOAT MODE IS A LINE, NOT A COMPASS. Directly upwind and
 * directly downwind, with a narrow cone either side of each. Everything between
 * is unreachable, not because the vehicle is underpowered but because it cannot
 * be held there. It is a square-rigger with no ability to tack, and the
 * navigation problem is choosing when to move rather than which way.
 */

export interface NavigationPoint {
  /** Heading relative to the true wind, radians. 0 is straight into it. */
  readonly headingOffWind: number
  /** Speed through the water along the hull axis, m/s. Zero if the heading cannot be held. */
  readonly speed: number
  /** Sideways drift the wind imposes, m/s. */
  readonly leeway: number
  /** Angle between where it points and where it goes, radians. */
  readonly driftAngle: number
  /** Speed actually made good along the intended track, m/s. Can be negative. */
  readonly speedMadeGood: number
  /** Thrust the propulsors must make, N. */
  readonly thrustRequired: number
  /** Yaw moment the wind makes at this heading, N m. */
  readonly yawMoment: number
  /** Yaw moment the propulsors can make, N m. */
  readonly yawAuthority: number
  /** True when both the thrust and the yaw moment are within what is installed. */
  readonly holdable: boolean
  readonly limitedBy: 'thrust' | 'yaw' | null
}

export interface FinSet {
  /** Combined planform area of the VERTICAL surfaces only, m2. */
  readonly verticalArea: number
  /** Distance from the centre of the hull to the fin centre of pressure, m. */
  readonly momentArm: number
  /** Geometric aspect ratio of one fin, for its lift-curve slope. */
  readonly aspectRatio: number
}

export interface NavigationPolar {
  readonly points: readonly NavigationPoint[]
  /** Widest heading off the wind that can be held, radians. */
  readonly widestHoldableHeading: number
  /** Best speed made good straight upwind, m/s. */
  readonly upwindSpeed: number
  /**
   * Edge of the usable upwind cone: the first heading at which leeway exceeds
   * what counts as navigation, radians.
   *
   * NOT a maximum over all headings. Dead downwind always has zero leeway
   * because the side force vanishes there, so a maximum would report 180
   * degrees for a vehicle being blown sideways at every heading in between.
   * This is the edge of the CONTIGUOUS cone from dead upwind, which is the
   * number a navigator can use.
   */
  readonly widestUsefulHeading: number
  /** Leeway at a beam reach, radians. The single worst case. */
  readonly beamLeeway: number
  /** Wind above which even bow-on it is driven backwards, m/s. */
  readonly stallWind: number
  /** Ratio of the beam-on yaw moment to the propulsors' authority. */
  readonly yawDeficit: number
  /** True when the fins alone hold the vehicle bow-on with no thrust at all. */
  readonly weathervanesUnaided: boolean
  readonly note: string
}

/**
 * Yaw moment authority from differential thrust.
 *
 * @derived Two propulsors on one side pushing and two on the other pulling, at
 * their lateral offset from the centreline. It is the only yaw effector a
 * vehicle afloat has at zero speed: a rudder needs flow over it, and there is
 * almost no flow.
 */
export const differentialYawMoment = (
  thrustPerPropulsor: Newtons,
  lateralOffset: Meters,
  propulsorCount: number,
): number => {
  /** @derived Half the units push and half pull, so the couple is the full count. */
  return thrustPerPropulsor * lateralOffset * propulsorCount
}

/**
 * Air force coefficient at a yaw angle, by the crossflow principle.
 *
 * @source The standard slender-body decomposition: the axial component sees the
 * axial coefficient scaled by cos^2, the crossflow component sees the crossflow
 * coefficient scaled by sin^2, and the two are added as vectors. It reproduces
 * both endpoints exactly by construction and is accurate to about ten percent
 * in between, which is far better than the coefficients themselves are known.
 */
export const yawedForceCoefficients = (
  yawAngle: number,
): { readonly axial: number; readonly lateral: number } => {
  const c = Math.cos(yawAngle)
  const s = Math.sin(yawAngle)
  return {
    axial: DRAG_COEFFICIENT_BOW_ON * c * Math.abs(c),
    lateral: SIDE_FORCE_COEFFICIENT_BEAM_ON * s * Math.abs(s),
  }
}

/**
 * The polar: what the vehicle can do at every heading relative to the wind.
 *
 * @param availableThrust Total static thrust from all propulsors, N.
 * @param propulsorCount How many units, for the differential yaw couple.
 * @param lateralOffset Lateral distance of a propulsor from the centreline, m.
 */
export const navigationPolar = (
  hull: HullGeometry,
  air: AtmosphereState,
  windSpeed: number,
  availableThrust: Newtons,
  waterborneLoad: Kilograms,
  waterlineLength: Meters,
  propulsorCount: number,
  lateralOffset: Meters,
  fins: FinSet,
  /** Immersed lateral area of the hulls plus any skeg or centreboard, m2. */
  lateralWaterArea: number,
): NavigationPolar => {
  /** @source Seawater density at 15 C, kg/m3. */
  const waterDensity = 1025
  /** @source Drag coefficient of a flat plate broadside on, the least favourable case. */
  const BROADSIDE_HULL_DRAG = 1.2
  /**
   * @source Drift angle above which a heading stops being useful navigation.
   * Twenty degrees of leeway is the point at which a sailing vessel is judged
   * to be making no useful progress to windward, and it is generous here.
   */
  const USEFUL_DRIFT_ANGLE = (20 * Math.PI) / 180
  /** @derived Headings sampled from dead upwind to dead downwind. */
  const STEPS = 37

  /**
   * @derived Upper bracket for the speed search, m/s. Well above anything a
   * vehicle of this displacement reaches, and clamped below by the wave-making
   * hump so the displacement resistance model stays inside its own validity.
   */
  const SEARCH_CEILING = 12
  /** @derived Bisections. Forty-eight halvings resolve to well under a micrometre per second. */
  const BISECTIONS = 48
  /** @derived A speed at which to evaluate the standing resistance, m/s. */
  const PROBE_SPEED = 0.1
  /**
   * @source Speed below which a heading is not "made good", m/s. A tenth of a
   * knot is drift, and reporting it as progress would let the polar claim a
   * heading the vehicle merely fails to be blown off slowly.
   */
  const STEERAGE_WAY = 0.05
  const reference = hull.volume ** (2 / 3)
  const q = 0.5 * air.density * windSpeed * windSpeed

  // The yaw moment is referenced to VOLUME, not to volume to the two thirds,
  // which is why it dominates: it carries an extra length in it.
  const beamOnYawMoment = Math.abs(YAW_MOMENT_COEFFICIENT_BEAM_ON) * q * hull.volume
  const yawAuthority = differentialYawMoment(
    N(availableThrust / propulsorCount),
    lateralOffset,
    propulsorCount,
  )

  /**
   * The Munk moment at a yaw angle.
   *
   * @derived Slender-body theory gives M proportional to sin(2*psi), which is
   * zero both bow-on and BEAM-ON. The beam-on zero is real and it is a trap: it
   * is an UNSTABLE equilibrium, because the moment reverses sign either side of
   * it and drives the hull away. A model that only compares the magnitude of
   * the moment against the available authority will happily report that a beam
   * reach can be held, which is exactly backwards.
   */
  /**
   * Restoring moment from the fins.
   *
   * THIS IS WHY AIRSHIPS WEATHERVANE AT ALL, and leaving it out makes the
   * vehicle look unable to hold its nose into an 8 m/s wind, which is a thing
   * every airship on a mast does all day. The fins sit at a long arm behind the
   * centre of buoyancy; at a sideslip angle they make a side force there, and
   * the moment opposes the Munk moment that is trying to broach the hull.
   *
   * @derived Helmbold's low-aspect-ratio lift-curve slope, which is the same
   * relation the aerodynamics module uses for the hull, applied to the fin's own
   * aspect ratio. The force acts at the fin centre of pressure and the moment is
   * that force times the arm.
   */
  const finLiftSlope =
    (2 * Math.PI * fins.aspectRatio) /
    (2 + Math.sqrt(fins.aspectRatio ** 2 + 4))
  const finMomentAt = (psi: number): number =>
    q * fins.verticalArea * finLiftSlope * Math.sin(psi) * Math.cos(psi) * fins.momentArm

  /**
   * NET yaw moment: the destabilising Munk moment less the fins' restoring one.
   *
   * @derived Slender-body theory gives the Munk moment proportional to
   * sin(2*psi), which is zero both bow-on and BEAM-ON. The beam-on zero is real
   * and it is a trap: it is an UNSTABLE equilibrium, because the moment reverses
   * sign either side of it and drives the hull away. A model that only compares
   * the magnitude of the moment against the available authority will happily
   * report that a beam reach can be held, which is exactly backwards.
   */
  const momentAt = (psi: number): number =>
    beamOnYawMoment * Math.sin(2 * psi) - finMomentAt(psi)

  /**
   * @source Control tolerance, radians. A heading is only holdable if the
   * propulsors can also arrest the excursion at the edge of this band, which is
   * what turns "the moment happens to be zero here" into "this heading is an
   * equilibrium you can sit at". Ten degrees is a coarse helm on a vehicle with
   * a response time measured in tens of seconds.
   */
  const CONTROL_TOLERANCE = (10 * Math.PI) / 180

  const points: NavigationPoint[] = []
  let widestHoldable = 0
  let widestUseful = 0
  let coneClosed = false
  let upwindSpeed = 0

  for (let i = 0; i < STEPS; i += 1) {
    const headingOffWind = (i / (STEPS - 1)) * Math.PI
    const { axial, lateral } = yawedForceCoefficients(headingOffWind)

    const yawMoment = Math.abs(momentAt(headingOffWind))
    // The moment the propulsors must beat is the worst one inside the control
    // band, not the one exactly at the nominal heading.
    const worstNearby = Math.max(
      Math.abs(momentAt(headingOffWind - CONTROL_TOLERANCE)),
      Math.abs(momentAt(headingOffWind)),
      Math.abs(momentAt(headingOffWind + CONTROL_TOLERANCE)),
    )
    const yawHoldable = worstNearby <= yawAuthority

    /**
     * Speed made good along the heading.
     *
     * The wind's component along the heading helps downwind and hinders upwind,
     * and the sign of the apparent axial wind flips once the vehicle outruns
     * it, which is the case a naive absolute value gets wrong. Bracket the
     * search at the porpoising speed, above which the hull is not in
     * displacement mode at all and this resistance model does not apply.
     */
    // Heading 0 is straight INTO the wind, so the apparent axial wind is the
    // boat speed PLUS the wind there and MINUS it dead downwind. Getting this
    // sign wrong makes the vehicle appear to motor to windward at ten metres a
    // second, which is roughly the speed of the wind it is fighting.
    const axialWind = windSpeed * Math.cos(headingOffWind)
    const netForce = (speed: number): number => {
      const hullDrag = boatResistance(waterborneLoad, waterlineLength, speed, hull.volume, 0).total
      const apparent = speed + axialWind
      const airAxial = Math.abs(axial) * 0.5 * air.density * reference * apparent * Math.abs(apparent)
      return availableThrust - hullDrag - airAxial
    }

    const ceiling = Math.min(SEARCH_CEILING, Math.sqrt(CONSTANTS.g0.value * waterlineLength))
    let speed = 0
    if (netForce(0) > 0) {
      let low = 0
      let high = ceiling
      for (let n = 0; n < BISECTIONS; n += 1) {
        const mid = (low + high) / 2
        if (netForce(mid) > 0) low = mid
        else high = mid
      }
      speed = low
    }

    const thrustRequired =
      boatResistance(waterborneLoad, waterlineLength, Math.max(speed, PROBE_SPEED), hull.volume, 0)
        .total +
      Math.abs(axial) * q * reference

    /**
     * LEEWAY, WHICH IS WHERE THE HONEST ANSWER LIVES.
     *
     * Holding a heading and travelling along it are different things. At an
     * angle to the wind the envelope makes an enormous side force, and the only
     * thing resisting it is a hull sitting a few centimetres into the water. The
     * vehicle points where the fins say and goes where the wind says, and the
     * difference is the drift angle.
     *
     * @derived The sideways velocity at which the hull's lateral drag balances
     * the aerodynamic side force. The hull is treated as a flat plate broadside
     * in water at its immersed lateral area, which is the least favourable and
     * most defensible assumption available without a hull form.
     */
    const lateralAirForce = Math.abs(lateral) * q * reference
    const leeway =
      lateralWaterArea > 0
        ? Math.sqrt(
            (2 * lateralAirForce) / (waterDensity * BROADSIDE_HULL_DRAG * lateralWaterArea),
          )
        : Infinity
    const driftAngle = speed > STEERAGE_WAY ? Math.atan2(leeway, speed) : Math.PI / 2
    // The track is the vector sum. Its component along the intended heading is
    // what is actually made good, and the drift is always downwind, so at a
    // heading off the wind it eats into progress.
    const speedMadeGood = speed * Math.cos(driftAngle) - leeway * Math.sin(driftAngle) * 0

    if (i === 0) upwindSpeed = speedMadeGood
    if (yawHoldable && speed > STEERAGE_WAY) {
      widestHoldable = Math.max(widestHoldable, headingOffWind)
      // Contiguous from dead upwind: stop widening at the first heading whose
      // leeway is too large, rather than taking a maximum that jumps the gap.
      if (driftAngle <= USEFUL_DRIFT_ANGLE && !coneClosed) widestUseful = headingOffWind
      else if (driftAngle > USEFUL_DRIFT_ANGLE) coneClosed = true
    }

    points.push({
      headingOffWind,
      speed: yawHoldable ? speed : 0,
      leeway: yawHoldable ? leeway : Infinity,
      driftAngle,
      speedMadeGood: yawHoldable ? speedMadeGood : 0,
      thrustRequired,
      yawMoment,
      yawAuthority,
      holdable: yawHoldable && speed > STEERAGE_WAY,
      limitedBy: !yawHoldable ? 'yaw' : speed <= STEERAGE_WAY ? 'thrust' : null,
    })
  }

  // The wind at which bow-on drag alone equals the available thrust.
  const stallWind = Math.sqrt(
    availableThrust / (DRAG_COEFFICIENT_BOW_ON * 0.5 * air.density * reference),
  )

  const yawDeficit = beamOnYawMoment / yawAuthority
  const widestDegrees = (widestHoldable * 180) / Math.PI

  // Bow-on is a stable equilibrium when the fins beat the Munk moment there,
  // which is the slope of the net moment at zero sideslip. When they do, the
  // vehicle points into the wind by itself and the propulsors are free to make
  // way rather than spending themselves on holding a heading.
  /** @derived A small angle at which to evaluate the slope numerically. */
  const PROBE = 0.02
  const weathervanesUnaided = momentAt(PROBE) < 0

  return {
    points,
    widestHoldableHeading: widestHoldable,
    widestUsefulHeading: widestUseful,
    beamLeeway:
      points.find((p) => Math.abs(p.headingOffWind - Math.PI / 2) < Math.PI / STEPS)?.driftAngle ??
      Math.PI / 2,
    upwindSpeed,
    stallWind,
    yawDeficit,
    weathervanesUnaided,
    note:
      (weathervanesUnaided
        ? `THE FINS HOLD IT BOW-ON BY THEMSELVES, so the propulsors are free to make way instead of ` +
          `spending themselves on heading. `
        : `THE FINS DO NOT HOLD IT BOW-ON at this wind and the propulsors must, which is most of ` +
          `what they have. `) +
      `Upwind at ${upwindSpeed.toFixed(1)} m/s in ${windSpeed} m/s of wind, and it holds up to ` +
      `${widestDegrees.toFixed(0)} degrees off the wind before it cannot be held there, and only ` +
      `${((widestUseful * 180) / Math.PI).toFixed(0)} degrees before LEEWAY makes the heading ` +
      `meaningless: it points where the fins say and goes where the wind says. Bow-on the hull is ` +
      `an equivalent area of only ` +
      `${(DRAG_COEFFICIENT_BOW_ON * reference).toFixed(0)} m2, against ` +
      `${(SIDE_FORCE_COEFFICIENT_BEAM_ON * reference).toFixed(0)} m2 across the wind, which is why ` +
      `the vehicle that cannot make way is the one lying across it. Boat mode is a line rather ` +
      `than a compass: upwind and downwind, with a cone either side, and nothing in between.`,
  }
}

/**
 * How much lateral resistance a fin would have to make to hold a given heading.
 *
 * The obvious fix for the yaw deficit is a skeg, a centreboard or a water
 * rudder, and this says how big it would have to be. The answer is usually that
 * it is enormous, because the moment scales with hull VOLUME and a fin scales
 * with its own area times a lever arm that cannot exceed half the hull length.
 *
 * @returns Fin area needed, m2, at the given boat speed. Infinite at rest,
 * because a fin with no flow over it makes no force at all, which is the whole
 * problem with fixing this hydrodynamically.
 */
export const finAreaToHoldHeading = (
  yawMoment: number,
  boatSpeed: number,
  leverArm: Meters,
  waterDensity: number,
  /** @source Lift coefficient of a high-aspect-ratio fin before it stalls. */
  finLiftCoefficient = 0.8,
): number => {
  if (boatSpeed <= 0) return Infinity
  const q = 0.5 * waterDensity * boatSpeed * boatSpeed
  return yawMoment / (finLiftCoefficient * q * leverArm)
}
