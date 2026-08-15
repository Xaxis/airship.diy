import { uncertain, v } from '@airship/data'
import type { MetersPerSecond, Newtons, Watts } from '@airship/units'
import { N, W } from '@airship/units'
import type { AtmosphereState } from '../atmosphere.js'
import type { HullGeometry } from '../geometry/hull.js'

/**
 * Drag, on the volumetric convention.
 *
 *   C_DV = D / (q * V^(2/3)),   q = 0.5 * rho * v^2
 *
 * Airships have no wing, so there is no wing area to reference against, and
 * every published airship figure since the 1920s uses volume to the two-thirds
 * power instead. Using it here is what makes comparison with Akron, with
 * Zeppelin NT, and with every NACA report possible.
 *
 * THE CUBE LAW. Since drag goes as the square of speed, power goes as the CUBE:
 *
 *   P = D * v / eta = 0.5 * C_DV * rho * V^(2/3) * v^3 / eta
 *
 * Doubling cruise speed costs eight times the power. On a vehicle whose energy
 * comes from a fixed area of sunlight, that single fact shapes the entire
 * mission concept: this ship is slow because being fast is unaffordable, not
 * because it cannot be made faster.
 */

/**
 * Volumetric drag coefficient of a complete ship: hull, fins, gondola, engine
 * nacelles and every appendage.
 *
 * Sanity bounds from the literature, which the model checks itself against:
 * a well-shaped BARE hull sits at 0.020 to 0.025, and the USS Akron measured
 * 0.0247. A complete ship with everything hanging off it lands at 0.030 to
 * 0.045. A result outside that band means the geometry or the assumptions are
 * wrong, not that a remarkable hull has been discovered.
 */
export const COMPLETE_SHIP_DRAG_COEFFICIENT = uncertain({
  low: 0.03,
  nominal: 0.035,
  high: 0.045,
  unit: '1',
  reason:
    'Depends on fin area, gondola shape, how many nacelles there are and how carefully everything is faired. Cannot be pinned down before the configuration is frozen, and appendage drag on airships is notoriously underestimated at the design stage.',
  resolvedBy:
    'Component build-up once the configuration is frozen, then CFD, then ideally a tow test of a scale model. The Akron figure in NACA TR-432 is the benchmark for the bare hull component.',
  source: 'khoury-airship-technology',
})

/** Bare hull, for comparison against the historical measurements. */
export const BARE_HULL_DRAG_COEFFICIENT = uncertain({
  low: 0.02,
  nominal: 0.0235,
  high: 0.025,
  unit: '1',
  reason: 'Varies with fineness ratio and surface finish. USS Akron measured 0.0247.',
  resolvedBy: 'CFD on the frozen hull shape, checked against NACA TR-432.',
  source: 'naca-tr-432',
})

/** Dynamic pressure. @derived q = 0.5 * rho * v^2. */
export const dynamicPressure = (air: AtmosphereState, speed: MetersPerSecond): number =>
  0.5 * air.density * speed * speed

/** Drag force at a given airspeed. */
export const drag = (
  hull: HullGeometry,
  air: AtmosphereState,
  speed: MetersPerSecond,
  dragCoefficient = v(COMPLETE_SHIP_DRAG_COEFFICIENT),
): Newtons => N(dragCoefficient * dynamicPressure(air, speed) * hull.volume ** (2 / 3))

/**
 * Propulsive chain efficiency, from DC bus to thrust.
 *
 * Large slow-turning propellers at low disc loading do well, and this vehicle
 * has room for very large propellers. The blade element model in phase 4
 * replaces this constant with a map; until then it is a single number with an
 * honest range.
 */
export const PROPULSIVE_EFFICIENCY = uncertain({
  low: 0.68,
  nominal: 0.75,
  high: 0.82,
  unit: '1',
  reason:
    'Product of propeller efficiency (0.75 to 0.85 for a large low-disc-loading propeller), motor efficiency (0.93 to 0.96) and controller efficiency (0.96 to 0.98). The propeller term dominates the uncertainty and depends on a blade design that does not exist yet.',
  resolvedBy:
    'Blade element momentum analysis of a specific propeller geometry, which lands in phase 4.',
})

/**
 * Electrical power required at the DC bus to hold a given airspeed.
 *
 * This is the number that decides whether the ship can hold station against a
 * given wind, and it is cubic in that wind.
 */
export const powerRequired = (
  hull: HullGeometry,
  air: AtmosphereState,
  speed: MetersPerSecond,
  dragCoefficient = v(COMPLETE_SHIP_DRAG_COEFFICIENT),
  propulsiveEfficiency = v(PROPULSIVE_EFFICIENCY),
): Watts => W((drag(hull, air, speed, dragCoefficient) * speed) / propulsiveEfficiency)

/**
 * The maximum wind this ship can hold station against, given a power budget.
 *
 * @derived Inverting P = k*v^3 gives v = (P*eta / (0.5*C_DV*rho*V^(2/3)))^(1/3).
 *
 * One of the most important operational numbers in the project. Above this
 * wind speed the ship cannot hold position and must drift, and the mission
 * module has to decide whether drifting is acceptable there or whether the
 * ship has to leave.
 */
export const maximumStationKeepingWind = (
  hull: HullGeometry,
  air: AtmosphereState,
  availablePower: Watts,
  dragCoefficient = v(COMPLETE_SHIP_DRAG_COEFFICIENT),
  propulsiveEfficiency = v(PROPULSIVE_EFFICIENCY),
): MetersPerSecond => {
  const k = 0.5 * dragCoefficient * air.density * hull.volume ** (2 / 3)
  return ((availablePower * propulsiveEfficiency) / k) ** (1 / 3) as MetersPerSecond
}
