import { WATER, WINDAGE, v } from '@airship/data'
import type { MetersPerSecond, Newtons, SquareMeters } from '@airship/units'
import { N, mps } from '@airship/units'
import type { AtmosphereState } from '../atmosphere.js'
import type { HullGeometry } from '../geometry/hull.js'

/**
 * Windage on a floating airship, and why weathervaning is the whole strategy.
 *
 * THE NUMBER THAT DECIDES EVERYTHING: the ratio of beam-on to bow-on force on
 * an airship hull is about 72 to 1.
 *
 * Bow-on, the hull is one of the most slippery shapes there is, with a
 * volumetric drag coefficient around 0.025. Beam-on, it is a bluff body with a
 * side force coefficient of 1.80 on the same reference area. At 15.9 m/s the
 * beam-on side force equals the ENTIRE GROSS LIFT of the vehicle. At 20 m/s it
 * is 1.6 times gross lift.
 *
 * Everything about marine operation follows from that ratio.
 *
 *   - Held bow-on, the vehicle survives serious weather. The US Navy moored
 *     ZPG-3W, half again the size of this ship, at a bow mast in 34.9 m/s with
 *     the airship free to weathervane.
 *   - Held beam-on, nothing helps. Holding beam-on drift to 0.5 m/s in a 20 m/s
 *     wind would need a 48 m sea anchor canopy, and 74 m at 60 knots. Those are
 *     not objects.
 *
 * So a sea anchor is not primarily a brake. It is the device that guarantees
 * the vehicle points into the wind, and its drag figure matters far less than
 * its reliability at doing that. Weathervaning is not one design feature among
 * several: it is the entire marine survival strategy and everything else exists
 * to serve it.
 *
 * @source NASA-CR-166253, airship mooring and ground handling data, tables 1-1
 *   and 4-2. Cross-flow and yawed-hull force coefficients from the NACA airship
 *   force reports.
 */

/**
 * Side force coefficient at 90 degrees yaw, referenced to volume^(2/3).
 *
 * The volumetric convention, the same one the drag module uses, so the bow-on
 * and beam-on cases are directly comparable rather than referenced to different
 * areas.
 * @source NASA-CR-166253 table 4-2.
 */
export const SIDE_FORCE_COEFFICIENT_BEAM_ON = 1.8

/**
 * Volumetric drag coefficient of the bare hull at zero yaw.
 * @source NACA TR-432, USS Akron bare hull, and NASA-CR-166253.
 */
export const DRAG_COEFFICIENT_BOW_ON = 0.025

/**
 * Yaw moment coefficient at 90 degrees yaw, referenced to VOLUME, not
 * volume^(2/3). Negative because it acts to turn the hull further from the wind.
 * @source NASA-CR-166253 table 4-2.
 */
export const YAW_MOMENT_COEFFICIENT_BEAM_ON = -0.5

export type Attitude = 'bow-on' | 'beam-on'

export interface WindLoad {
  readonly attitude: Attitude
  readonly force: Newtons
  /** Force as a multiple of the vehicle's gross lift. */
  readonly asFractionOfGrossLift: number
}

/**
 * Wind load on the floating hull, in either attitude.
 *
 * @derived F = C * q * V^(2/3), with q = 0.5*rho*U^2. Volumetric convention
 * throughout, so the two attitudes are directly comparable.
 */
export const windLoad = (
  hull: HullGeometry,
  air: AtmosphereState,
  windSpeed: MetersPerSecond,
  attitude: Attitude,
  grossLiftForce: number,
): WindLoad => {
  const q = 0.5 * air.density * windSpeed * windSpeed
  const reference = hull.volume ** (2 / 3)
  const coefficient =
    attitude === 'beam-on' ? SIDE_FORCE_COEFFICIENT_BEAM_ON : DRAG_COEFFICIENT_BOW_ON
  const force = coefficient * q * reference

  return {
    attitude,
    force: N(force),
    asFractionOfGrossLift: grossLiftForce > 0 ? force / grossLiftForce : Infinity,
  }
}

/**
 * The ratio that governs marine operation. About 72 to 1 for a fineness-5 hull.
 * @derived Ratio of the two force coefficients; the reference area cancels.
 */
export const beamToBowForceRatio = (): number =>
  SIDE_FORCE_COEFFICIENT_BEAM_ON / DRAG_COEFFICIENT_BOW_ON

/**
 * Wind speed at which the beam-on side force equals the vehicle's gross lift.
 *
 * @derived Setting C_y * 0.5 * rho * U^2 * V^(2/3) = L gives
 *   U = sqrt( 2L / (C_y * rho * V^(2/3)) )
 *
 * A useful single number for the operations manual: above it, a vehicle caught
 * beam-on is being pushed sideways harder than it is being held up.
 */
export const beamOnForceEqualsLiftSpeed = (
  hull: HullGeometry,
  air: AtmosphereState,
  grossLiftForce: number,
): MetersPerSecond =>
  mps(
    Math.sqrt(
      (2 * grossLiftForce) / (SIDE_FORCE_COEFFICIENT_BEAM_ON * air.density * hull.volume ** (2 / 3)),
    ),
  )

/**
 * Sea anchor canopy area needed to hold drift below a target speed.
 *
 * @derived A_anchor = F_wind / (0.5 * rho_water * V_target^2 * C_anchor)
 *
 * THE CORRECTION THAT MATTERS. An earlier version of this model sized the anchor
 * against the BEAM-ON force and concluded that no practical canopy could hold
 * the vehicle. That was wrong, and wrong in an instructive way: the anchor's
 * job is to hold the vehicle BOW-ON, where the force is 72 times smaller. Sized
 * correctly, a 5.7 m canopy holds bow-on drift below 0.5 m/s in a 20 m/s wind,
 * and rode tension at 60 knots is only about 9 kN, which a 12 mm Dyneema line
 * carries with margin.
 *
 * Both standard sizing rules are useless here and they fail in opposite
 * directions. The 0.35-times-length-overall rule demands a 31.5 m canopy, five
 * times too big, because it assumes length correlates with displacement. The
 * displacement-based tables say a vehicle displacing a few hundred kilograms
 * needs essentially nothing, which ignores that the sail area is that of a
 * building. Neither rule anticipated a vessel that is almost entirely above the
 * waterline.
 */
export const seaAnchorCanopyArea = (
  windForce: Newtons,
  targetDriftSpeed: MetersPerSecond,
  salt = true,
): number => {
  if (targetDriftSpeed <= 0) {
    throw new RangeError('A sea anchor slows drift, it does not stop it. Target must be positive.')
  }
  const waterDensity = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  return windForce / (0.5 * waterDensity * targetDriftSpeed ** 2 * v(WINDAGE.seaAnchorDragCoefficient))
}

/** Canopy diameter for a given area, which is the number a person can picture. */
export const canopyDiameter = (area: number): number => Math.sqrt((4 * area) / Math.PI)

/**
 * Operating wind limits, from measured US Navy airship experience.
 *
 * THE MOST DECISION-RELEVANT NUMBERS IN MARINE OPERATION, and the ratio between
 * them is 5.6 to 1.
 *
 * The binding constraint is HANDLING, not survival. A moored airship free to
 * weathervane rides out 34.9 m/s. Any evolution that holds it at a FIXED
 * heading, which is what docking, undocking, and deploying or recovering
 * equipment over the side all are, tops out around 6.3 m/s.
 *
 * So the question for this vehicle is never "can it survive the blow". It is
 * "can the crew get the drogue deployed before the wind gets up", and the
 * answer has to be yes at a wind speed five times lower than the survival
 * limit.
 *
 * @source NASA-CR-166253 table 1-1, US Navy airship operating limits.
 */
export const WIND_LIMITS = {
  /** Moored at a bow mast, free to weathervane. */
  mooredWeathervaning: 34.9,
  /** Any operation at a fixed heading: docking, undocking, working over the side. */
  fixedHeadingHandling: 6.26,
  /** Towing at a mast. */
  mastTowing: 25.9,
  /** The gust that tore Shenandoah from her mast. */
  shenandoahBreakaway: 34.87,
} as const

/** @derived The ratio the operations manual is built around. */
export const handlingToSurvivalRatio = (): number =>
  WIND_LIMITS.mooredWeathervaning / WIND_LIMITS.fixedHeadingHandling

/**
 * Leeway: drift speed as a fraction of wind speed.
 *
 * The vehicle drifts faster than any object the US Coast Guard has measured.
 * The highest downwind leeway slope in the Allen and Plourde database, covering
 * 63 object classes and 95 target types, is 6.66 percent for a bare-masted
 * sailboat. This vehicle runs 24 to 31 percent bow-on and 60 to 100 percent
 * beam-on.
 *
 * The reason is that it barely touches the water. Being fully buoyant, only its
 * static heaviness is immersed: at 5 percent heaviness it floats at about 2 cm
 * of draft, presenting on the order of one square metre of underwater lateral
 * area against more than a thousand above it.
 *
 * @param immersedLateralArea Underwater lateral area, m2. Tiny by construction.
 */
export const leeway = (
  windForce: Newtons,
  immersedLateralArea: SquareMeters,
  windSpeed: MetersPerSecond,
  waterDragCoefficient = 1.0,
  salt = true,
): { driftSpeed: MetersPerSecond; leewayRatio: number } => {
  const waterDensity = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const resistance = 0.5 * waterDensity * immersedLateralArea * waterDragCoefficient
  const driftSpeed = resistance > 0 ? Math.sqrt(windForce / resistance) : Infinity

  return {
    driftSpeed: mps(driftSpeed),
    leewayRatio: windSpeed > 0 ? driftSpeed / windSpeed : 0,
  }
}

/**
 * WEATHERVANING IS INTRINSICALLY UNSTABLE AT SMALL YAW, and this is a property
 * of the shape rather than a defect to be designed out.
 *
 * As yaw falls below about 10 degrees the centre of pressure runs rapidly
 * forward, so a hull that is nearly bow-on is pushed further off rather than
 * being restored. The vehicle therefore hunts: it oscillates about the wind
 * direction rather than settling on it. Historic moored airships did this
 * constantly and it is visible in period film.
 *
 * The practical consequences, which belong in the design rather than in a
 * warning:
 *   - The mooring point must tolerate cyclic yaw, not a steady heading.
 *   - Fins help, because they move the centre of pressure aft.
 *   - The rode and its attachment see fatigue cycles, not a static pull.
 *   - Hunting amplitude has to stay small enough that the vehicle never reaches
 *     an attitude where the beam-on force can build.
 *
 * @source NACA TR-215, Zahm, Smith and Louden (1926), "Air forces, moments and
 *   damping on model of fleet airship Shenandoah", figure 29 and p.12.
 */
export const WEATHERVANING_UNSTABLE_BELOW_YAW = (10 * Math.PI) / 180
