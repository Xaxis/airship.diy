import { CONSTANTS, WATER, WINDAGE, v } from '@airship/data'
import type { Kilograms, Meters, MetersPerSecond, Newtons, SquareMeters } from '@airship/units'
import { N, m3, mps } from '@airship/units'
import type { AtmosphereState } from '../atmosphere.js'
import type { HullGeometry } from '../geometry/hull.js'

/**
 * Marine mode: floating on water, and working as a boat.
 *
 * THE CENTRAL IDEA, and it connects straight back to the buoyancy module.
 * The vehicle floating on water is not a boat carrying its own weight. The
 * envelope is still there and still lifting, so the load resting on the water
 * is exactly the STATIC HEAVINESS: total weight minus gross lift. A ship
 * trimmed to 300 kg heavy sits on the water carrying 300 kg, and displaces 0.29
 * cubic metres of seawater to do it.
 *
 * That single observation reframes the whole marine problem.
 *
 * FLOTATION IS TRIVIAL. Displacing a third of a cubic metre is nothing. Even a
 * badly out-of-trim ship two tonnes heavy needs only 2 m3 against an envelope of
 * 15,800. The float does not have to be a boat hull in any serious sense; it has
 * to be watertight and take the landing loads.
 *
 * STABILITY IS FREE, and this is the genuinely surprising part. A boat's
 * righting moment comes from its waterplane, through the metacentric height. It
 * is proportional to the displaced weight, which here is almost nothing, so on
 * that basis the vehicle should be desperately tender. It is not, because the
 * envelope is a pendulum: gross lift acts at the centre of buoyancy far above
 * the centre of gravity, and that couple is proportional to GROSS LIFT rather
 * than to displacement. It is therefore roughly fifty times the hydrostatic
 * term. The vehicle is far more stable on the water than a boat of the same
 * draft, and the usual metacentric criterion does not govern.
 *
 * WINDAGE IS THE PROBLEM. A 90 m hull afloat presents on the order of 1,500 m2
 * of lateral area to the wind, resisted by a wetted hull of a few square metres.
 * The vehicle is an enormous sail with almost no keel, so it does not hold
 * position: it drifts, at a substantial fraction of wind speed, and it will lie
 * beam-on unless something makes it weathervane. Single-point mooring off a bow
 * drogue is not a refinement here, it is what makes water operation possible at
 * all.
 */

const G0 = CONSTANTS.g0.value

export interface FloatingState {
  /** Load resting on the water, kg. Equal to static heaviness. */
  readonly waterborneLoad: Kilograms
  /** Volume of water displaced, m3. */
  readonly displacement: number
  /**
   * Fraction of total weight carried by the water rather than by the envelope.
   * Small by design: a ship that puts much weight on the water has lost lift.
   */
  readonly waterborneFraction: number
  readonly afloat: boolean
}

/**
 * How the vehicle sits when it touches down.
 *
 * @param totalWeight Everything aboard, kg.
 * @param grossLift Gross aerostatic lift at the surface condition, kg.
 * @param salt Seawater rather than fresh.
 */
export const floatingState = (
  totalWeight: Kilograms,
  grossLift: Kilograms,
  salt = true,
): FloatingState => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const waterborneLoad = totalWeight - grossLift

  return {
    waterborneLoad: waterborneLoad as Kilograms,
    displacement: Math.max(waterborneLoad, 0) / density,
    waterborneFraction: totalWeight > 0 ? Math.max(waterborneLoad, 0) / totalWeight : 0,
    // A vehicle that is light does not float, it rises. Touching down at all
    // requires being heavy, which is why arriving on the water is a ballast
    // operation before it is a piloting one.
    afloat: waterborneLoad > 0,
  }
}

export interface RightingMoments {
  /** Restoring moment per radian of heel from the envelope pendulum, N.m/rad. */
  readonly aerostatic: number
  /** Restoring moment per radian from the waterplane, N.m/rad. */
  readonly hydrostatic: number
  readonly total: number
  /** How many times larger the pendulum term is than the boat term. */
  readonly pendulumDominance: number
}

/**
 * Roll stiffness while afloat.
 *
 * @derived For small heel, the aerostatic couple is L*g*(z_CB - z_CG) per
 * radian, where L is gross lift as a mass and the lever is the vertical
 * separation of the centre of buoyancy from the centre of gravity. The
 * hydrostatic couple is W_w*g*GM per radian in the usual naval architecture
 * form, where W_w is only the WATERBORNE load.
 *
 * @param metacentricHeight GM of the float alone, m. Only ever a small
 *   correction here, which is the point.
 */
export const rightingMoments = (
  grossLift: Kilograms,
  centreOfBuoyancyHeight: Meters,
  centreOfGravityHeight: Meters,
  waterborneLoad: Kilograms,
  metacentricHeight: Meters,
): RightingMoments => {
  const lever = centreOfBuoyancyHeight - centreOfGravityHeight
  if (lever <= 0) {
    throw new RangeError(
      'Centre of buoyancy is at or below the centre of gravity. The pendulum that ' +
        'stabilises an airship in pitch and roll has been inverted, which is not a trim ' +
        'condition, it is a capsize.',
    )
  }

  const aerostatic = grossLift * G0 * lever
  const hydrostatic = Math.max(waterborneLoad, 0) * G0 * metacentricHeight

  return {
    aerostatic,
    hydrostatic,
    total: aerostatic + hydrostatic,
    pendulumDominance: hydrostatic > 0 ? aerostatic / hydrostatic : Infinity,
  }
}

export interface WindageState {
  /** Lateral aerodynamic force on the hull, N. */
  readonly sideForce: Newtons
  /** Projected lateral area presented to the wind, m2. */
  readonly lateralArea: SquareMeters
  /**
   * Steady drift speed with nothing deployed, m/s. Equilibrium between wind
   * force on the hull and water drag on the wetted portion.
   */
  readonly driftSpeed: MetersPerSecond
  /** Drift as a fraction of wind speed. */
  readonly leewayRatio: number
}

/**
 * Windage and drift.
 *
 * @derived Drift settles where wind force equals water drag:
 *   0.5*rho_air*V_w^2*A_air*C_air = 0.5*rho_water*V_d^2*A_water*C_water
 * so
 *   V_d / V_w = sqrt( (rho_air*A_air*C_air) / (rho_water*A_water*C_water) )
 *
 * Air is about 840 times less dense than seawater, which sounds like it should
 * settle the matter. It does not, because the area ratio runs the other way by
 * two orders of magnitude: an airship afloat has a vast sail and a tiny wetted
 * hull. The two effects nearly cancel and the leeway ratio comes out
 * uncomfortably large.
 *
 * @param wettedArea Underwater area resisting drift, m2. Small unless a drogue
 *   is streamed, which is exactly why one is streamed.
 */
export const windage = (
  hull: HullGeometry,
  air: AtmosphereState,
  windSpeed: MetersPerSecond,
  wettedArea: SquareMeters,
  waterDragCoefficient = 1.0,
  salt = true,
): WindageState => {
  // Projected lateral area of a body of revolution: the integral of diameter
  // along the length. For this hull family that is closely 0.72*L*D, which is
  // the ratio the shape function produces and the tests pin.
  /** @derived Lateral area of a body of revolution, from its own profile. */
  const lateralArea = 0.72 * hull.length * hull.maxDiameter

  const crossFlow = v(WINDAGE.crossFlowDragCoefficient)
  const sideForce = 0.5 * air.density * windSpeed * windSpeed * lateralArea * crossFlow

  const waterDensity = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const resistance = 0.5 * waterDensity * wettedArea * waterDragCoefficient

  const driftSpeed = resistance > 0 ? Math.sqrt(sideForce / resistance) : Infinity

  return {
    sideForce: N(sideForce),
    lateralArea: lateralArea as SquareMeters,
    driftSpeed: mps(driftSpeed),
    leewayRatio: windSpeed > 0 ? driftSpeed / windSpeed : 0,
  }
}

/**
 * Mouth area of the sea anchor needed to hold drift below a target speed.
 *
 * @derived Setting the anchor's water drag equal to the hull's wind force:
 *   A_anchor = rho_air*V_w^2*A_air*C_air / (rho_water*V_target^2*C_anchor)
 *
 * The result decides whether riding out weather on the water is practical or
 * whether the vehicle has to fly to avoid it, which is one of the real
 * operational questions the marine requirement raises.
 */
export const seaAnchorArea = (
  sideForce: Newtons,
  targetDriftSpeed: MetersPerSecond,
  salt = true,
): number => {
  if (targetDriftSpeed <= 0) {
    throw new RangeError('A sea anchor slows drift, it does not stop it. Target must be positive.')
  }
  const waterDensity = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const anchorDrag = v(WINDAGE.seaAnchorDragCoefficient)
  return sideForce / (0.5 * waterDensity * targetDriftSpeed * targetDriftSpeed * anchorDrag)
}

/**
 * Ballast that must be taken aboard to sit on the water at a chosen heaviness.
 *
 * The operational point that makes marine mode more than a party trick: the
 * ocean is unlimited ballast and unlimited electrolyzer feedstock. A vehicle
 * whose entire premise is never landing can touch down on water, take on
 * exactly the mass it wants, and leave. "Never land" becomes "never touch
 * land", which is a different and much easier problem.
 */
export const ballastToLandOnWater = (
  currentHeaviness: Kilograms,
  targetHeaviness: Kilograms,
): Kilograms => (targetHeaviness - currentHeaviness) as Kilograms

/** Volume of water for a given ballast mass, for tank sizing. */
export const ballastVolume = (mass: Kilograms, salt = true) =>
  m3(mass / (salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)))
