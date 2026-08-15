import { CONSTANTS, WATER, v } from '@airship/data'
import type { Kilograms, Meters } from '@airship/units'
import { m3 } from '@airship/units'

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
 * WINDAGE IS THE PROBLEM, and it lives in ./windage.ts. The short version: the
 * ratio of beam-on to bow-on force on this hull is about 72 to 1, so held
 * bow-on the vehicle rides out serious weather and held beam-on nothing helps.
 * Weathervaning is the entire marine survival strategy.
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

// Windage, drift and sea anchor sizing moved to ./windage.ts.
//
// The version that lived here sized the sea anchor against the BEAM-ON side
// force and concluded that no practical canopy could hold the vehicle. That was
// wrong: the anchor's job is to hold the vehicle BOW-ON, where the force is
// about 72 times smaller. Sized correctly a 5.7 m canopy is sufficient. The
// replacement keeps both attitudes explicit so the mistake cannot recur.

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
