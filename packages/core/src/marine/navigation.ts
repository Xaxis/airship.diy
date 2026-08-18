import type { AtmosphereState } from '../atmosphere.js'
import type { HullGeometry } from '../geometry/hull.js'
import { boatResistance, porpoisingSpeed } from './boat.js'
import {
  BROADSIDE_WATER_DRAG_COEFFICIENT,
  DRAG_COEFFICIENT_BOW_ON,
  SIDE_FORCE_COEFFICIENT_BEAM_ON,
  YAW_MOMENT_COEFFICIENT_BEAM_ON,
} from './windage.js'
import { WATER, v } from '@airship/data'
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
  /**
   * True when the net yaw moment grows with sideslip here, so an excursion runs
   * away and the propulsors have to catch it. False means the heading is a
   * stable equilibrium the vehicle sits at on its own.
   */
  readonly divergent: boolean
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
  /**
   * Chord fraction of the movable trailing-edge surface, if there is one.
   *
   * THE RUDDER HAS TO BE IN THE YAW BALANCE. Leaving it out understates the
   * vehicle's ability to hold a heading exactly as badly as leaving the fins
   * out understated its tendency to weathervane, and for the same reason: it is
   * a large surface at a long arm. Differential thrust alone loses to the tail
   * by a factor of five, which would say a vehicle with rudders can only ever
   * point into the wind.
   *
   * Zero for a fixed fin.
   */
  readonly rudderChordFraction?: number
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
/**
 * Lift-curve slope of a fin on a hull, per radian, from its EXPOSED aspect
 * ratio.
 *
 * ONE OF THESE, because the same physical surface had two. This module ran
 * Helmbold on the exposed aspect ratio directly; the arrangement doubled the
 * aspect ratio for the hull reflection plane and knocked 15 percent off for the
 * tail's boundary layer. On the baseline fin that is 1.59 per radian against
 * 2.34, on the identical surface, and the polar and the yaw gate each believed
 * their own.
 *
 * @source Helmbold's low-aspect-ratio relation, on the effective aspect ratio.
 * A fin against a body sees its own reflection in the hull, so its effective
 * aspect ratio is twice its geometric one.
 */
export const finLiftCurveSlope = (exposedAspectRatio: number): number => {
  /** @derived The hull acts as a reflection plane, doubling the effective aspect ratio. */
  const effective = exposedAspectRatio * 2
  const helmbold = (2 * Math.PI * effective) / (2 + Math.sqrt(effective * effective + 4))
  return helmbold * TAIL_DYNAMIC_PRESSURE_RATIO
}

/**
 * @source Ratio of the dynamic pressure at the tail to the free-stream value.
 * The tail sits in the hull's boundary layer and wake, and 0.85 is the standard
 * allowance for it.
 */
export const TAIL_DYNAMIC_PRESSURE_RATIO = 0.85

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
  // From the data layer and from windage.ts, not restated. This module used to
  // carry its own 1025 (dropping seawaterDensity's uncertainty and its note)
  // and its own 1.2 broadside coefficient beside windage.ts's leeway(), which
  // used 1.0 for the same physical quantity.
  const waterDensity = v(WATER.seawaterDensity)
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
  const thrustYawAuthority = differentialYawMoment(
    N(availableThrust / propulsorCount),
    lateralOffset,
    propulsorCount,
  )

  /**
   * Yaw moment from the rudders at full deflection.
   *
   * @source A trailing-edge flap of chord fraction tau changes the surface's
   * effective incidence by a fraction of its own deflection. The classical
   * thin-aerofoil result is 1 - (theta - sin theta)/pi with
   * theta = acos(2 tau - 1), which gives 0.66 at the 0.3 chord fraction typical
   * of an aircraft control surface. Applied to the same lift-curve slope the
   * fixed fin uses, at the same arm.
   *
   * NOTE THAT THIS IS WIND-INDEPENDENT AGAINST THE MUNK MOMENT, because both
   * carry the same dynamic pressure and it cancels. Whether a heading can be
   * held is a geometry question, not a question of how hard the wind blows.
   */
  /** @source Maximum useful rudder deflection, radians. Beyond about 25 degrees a plain flap stalls and gives back less than it costs. */
  const MAXIMUM_RUDDER_DEFLECTION = (25 * Math.PI) / 180
  const rudderChord = fins.rudderChordFraction ?? 0
  const flapEffectiveness =
    rudderChord > 0
      ? 1 - (Math.acos(2 * rudderChord - 1) - Math.sin(Math.acos(2 * rudderChord - 1))) / Math.PI
      : 0

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
  const finLiftSlope = finLiftCurveSlope(fins.aspectRatio)

  const rudderYawAuthority =
    q * fins.verticalArea * finLiftSlope * flapEffectiveness * MAXIMUM_RUDDER_DEFLECTION *
    fins.momentArm
  const yawAuthority = thrustYawAuthority + rudderYawAuthority
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

  /**
   * @derived A small angle for the numerical slope of the net moment, radians.
   * The moment is smooth and sinusoidal in sideslip, so anything well below the
   * control tolerance gives the same sign.
   */
  const STABILITY_PROBE = 0.01

  /** @derived Angular tolerance for "the cone reaches all the way round", radians. */
  const ANGLE_EPSILON = 1e-9

  const points: NavigationPoint[] = []
  let widestHoldable = 0
  let widestUseful = 0
  let coneClosed = false
  let upwindSpeed = 0

  for (let i = 0; i < STEPS; i += 1) {
    const headingOffWind = (i / (STEPS - 1)) * Math.PI
    const { axial } = yawedForceCoefficients(headingOffWind)

    const yawMoment = Math.abs(momentAt(headingOffWind))

    /**
     * IS THIS HEADING A STABLE EQUILIBRIUM, OR ONE THE CONTROLLER HAS TO HOLD?
     *
     * The net moment is beamOnYawMoment * sin(2 psi) - finMoment(psi), and the
     * fin term carries the SAME sin(2 psi) shape, so the whole thing collapses
     * to K * sin(2 psi) for a single constant K. Its slope decides everything:
     * negative means an excursion is self-arresting and the propulsors need do
     * nothing, positive means it runs away and they must catch it.
     *
     * The previous check took the largest ABSOLUTE moment in a band either side
     * of the heading. Because |sin(2 psi)| is symmetric about 45 degrees that
     * gave bit-identical answers at the stable bow-on equilibrium and the
     * unstable beam-on one, so it never rejected lying across the wind, which is
     * the single failure mode the whole marine strategy exists to avoid. It also
     * charged the propulsors for restoring moments they never have to make, so
     * MORE fin made the vehicle look less able to hold a heading.
     */
    const slope =
      (momentAt(headingOffWind + STABILITY_PROBE) - momentAt(headingOffWind - STABILITY_PROBE)) /
      (2 * STABILITY_PROBE)
    const divergent = slope > 0

    // Sitting at the heading always costs the steady moment. Only a DIVERGENT
    // heading also costs the excursion, because only there does the excursion
    // grow on its own.
    const worstNearby = divergent
      ? Math.max(
          Math.abs(momentAt(headingOffWind - CONTROL_TOLERANCE)),
          Math.abs(momentAt(headingOffWind)),
          Math.abs(momentAt(headingOffWind + CONTROL_TOLERANCE)),
        )
      : yawMoment
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

    /**
     * ONE FORCE MODEL, and the water and air terms taken from where they belong.
     *
     * This used to call boatResistance with headwind = 0 and then add its own
     * axial air term, which charged the still-air drag TWICE: boatResistance
     * already computes it, and the headwind parameter exists precisely so a
     * caller does not have to. It also applied cos^2 twice, because
     * yawedForceCoefficients returns a coefficient referenced to the FULL
     * apparent dynamic pressure and the code then multiplied it by a dynamic
     * pressure built from the axial component alone.
     *
     * The water terms come from boatResistance. The air term is built here,
     * because at a yaw angle the axial coefficient is not the bow-on one that
     * boatResistance assumes.
     */
    const netForce = (speed: number): number => {
      const water = boatResistance(waterborneLoad, waterlineLength, speed, hull.volume, 0)
      const hullDrag = (water.frictional as number) + (water.residuary as number)
      const apparent = speed + axialWind
      // Referenced to the FULL apparent dynamic pressure, which is the
      // convention yawedForceCoefficients is defined in.
      const airAxial =
        Math.abs(axial) * 0.5 * air.density * reference * apparent * Math.abs(apparent)
      return availableThrust - hullDrag - airAxial
    }

    // Bracketed at the PORPOISING speed, which is Froude 0.9. The previous
    // ceiling was sqrt(g * L), Froude 1.0, which is 11 percent past the limit
    // this module's own sibling declares and outside the validity of the
    // resistance model being solved.
    const ceiling = Math.min(SEARCH_CEILING, porpoisingSpeed(waterlineLength))
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

    // From the SAME model the speed came out of, evaluated at the speed the
    // vehicle actually reaches. It used to be a third force model with the
    // true-wind dynamic pressure and an absolute value that charged a tailwind
    // as a resistance.
    const probeSpeed = Math.max(speed, PROBE_SPEED)
    const thrustRequired = (availableThrust as number) - netForce(probeSpeed)

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
    /**
     * THE DRIFT HAS TO SEE ITSELF.
     *
     * This balanced the water's lateral drag against the side force at the TRUE
     * wind, so the aerodynamic term never noticed the drift velocity it was
     * producing. That balance is unbounded: it returned drift speeds faster than
     * the wind driving them, which no pure drag balance can do. Once the
     * vehicle moves sideways at u, the apparent lateral wind is (W sin psi - u)
     * and the force falls with it.
     *
     * @derived Setting rho_air * C_lat * ref * (Ws - u)^2 = rho_water * Cd * A * u^2
     * and taking the root with u < Ws gives u = Ws * sqrt(a) / (sqrt(a) + sqrt(b)),
     * which is bounded by the wind by construction and has the right limits: no
     * lateral area drifts at the wind speed, infinite lateral area does not
     * drift at all.
     */
    const lateralWind = windSpeed * Math.sin(headingOffWind)
    const airSide = air.density * SIDE_FORCE_COEFFICIENT_BEAM_ON * reference
    const waterSide = waterDensity * BROADSIDE_WATER_DRAG_COEFFICIENT * lateralWaterArea
    const leeway =
      lateralWaterArea > 0
        ? (lateralWind * Math.sqrt(airSide)) / (Math.sqrt(airSide) + Math.sqrt(waterSide))
        : lateralWind
    const driftAngle = speed > STEERAGE_WAY ? Math.atan2(leeway, speed) : Math.PI / 2

    /**
     * SPEED MADE GOOD TO WINDWARD, which is the quantity that decides whether a
     * heading is worth steering.
     *
     * The forward velocity contributes speed * cos(psi) upwind, and the leeway
     * is perpendicular to the hull and directed downwind, so it takes away
     * leeway * sin(psi). The old expression used the DRIFT angle where the
     * HEADING belongs and then multiplied the leeway term by zero, which turned
     * a real correction into dead code that read as live physics. What it
     * actually computed, speed * cos(driftAngle), is neither the projection on
     * the heading (that is just `speed`) nor the track magnitude.
     */
    const speedMadeGood =
      speed * Math.cos(headingOffWind) - leeway * Math.sin(headingOffWind)

    if (i === 0) upwindSpeed = speedMadeGood
    const holdable = yawHoldable && speed > STEERAGE_WAY

    // THE CONE IS CONTIGUOUS FROM DEAD UPWIND, and it closes at the first
    // heading that fails for ANY reason. Closing it only on leeway let an
    // unholdable band in the middle be jumped over: with a big tail the
    // vehicle cannot hold anything much off the wind, and the old logic then
    // reported a 180 degree cone on the strength of dead downwind being fine.
    if (!coneClosed) {
      if (holdable && driftAngle <= USEFUL_DRIFT_ANGLE) {
        widestUseful = headingOffWind
        widestHoldable = headingOffWind
      } else if (holdable) {
        widestHoldable = headingOffWind
        coneClosed = true
      } else {
        coneClosed = true
      }
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
      divergent,
      holdable,
      limitedBy: !yawHoldable ? 'yaw' : speed <= STEERAGE_WAY ? 'thrust' : null,
    })
  }

  // The wind at which bow-on drag alone equals the available thrust.
  const stallWind = Math.sqrt(
    availableThrust / (DRAG_COEFFICIENT_BOW_ON * 0.5 * air.density * reference),
  )

  /**
   * How far short the propulsors are of the WORST net moment they might have to
   * beat, which is the same net-of-fins moment every `holdable` flag uses.
   *
   * It used to report the bare Munk moment against the authority while the
   * flags used the net, so the object said the propulsors lose ten to one and
   * that every heading is holdable, in the same breath.
   */
  const worstNetMoment = Math.max(
    ...Array.from({ length: STEPS }, (_, i) => Math.abs(momentAt((i / (STEPS - 1)) * Math.PI))),
  )
  const yawDeficit = worstNetMoment / yawAuthority
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
          `spending themselves on heading. That is a GEOMETRY result and not a wind-strength one: ` +
          `the Munk moment and the fin moment carry the same dynamic pressure and it cancels, so ` +
          `a vehicle that weathervanes at all weathervanes at every wind speed. `
        : `THE FINS DO NOT HOLD IT BOW-ON, at any wind: the Munk moment and the fin moment carry ` +
          `the same dynamic pressure and it cancels, so this is a tail-area verdict rather than a ` +
          `weather one. The rudders and the propulsors must hold the heading. `) +
      `Upwind at ${upwindSpeed.toFixed(1)} m/s in ${windSpeed} m/s of wind, and it holds up to ` +
      `${widestDegrees.toFixed(0)} degrees off the wind before it cannot be held there, and ` +
      `${((widestUseful * 180) / Math.PI).toFixed(0)} degrees before either LEEWAY or the yaw ` +
      `balance ends it. Where leeway is what ends it, the vehicle points where the fins say and ` +
      `goes where the wind says. Bow-on the hull is ` +
      `an equivalent area of only ` +
      `${(DRAG_COEFFICIENT_BOW_ON * reference).toFixed(0)} m2, against ` +
      `${(SIDE_FORCE_COEFFICIENT_BEAM_ON * reference).toFixed(0)} m2 across the wind, which is why ` +
      `the vehicle that cannot make way is the one lying across it. ` +
      (widestUseful >= Math.PI - ANGLE_EPSILON
        ? `The whole compass is available here, which is the centreboard's doing rather than the ` +
          `propulsion's: without immersed lateral area the same thrust reaches the same speed ` +
          `through the water and goes somewhere else.`
        : `Boat mode is a cone rather than a compass: upwind, downwind, and a limited arc either ` +
          `side, with nothing usable across the wind.`),
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
