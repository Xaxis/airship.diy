import { CONSTANTS, SEA_STATE, WATER, WINDAGE, v } from '@airship/data'
import type { Kilograms, Meters, Newtons, Watts } from '@airship/units'

import { DRAG_COEFFICIENT_BOW_ON } from './windage.js'

/**
 * Working as a boat: resistance, making way, seakeeping, and touching down.
 *
 * THE THING THAT MAKES THIS NOT A BOAT PROBLEM. The load resting on the water
 * is the static heaviness, not the weight. A vehicle trimmed 500 kg heavy
 * displaces half a cubic metre. It is a cork with a 115 m sail on it.
 *
 * Every consequence follows from that one ratio, and most of them are the
 * opposite of what boat intuition says:
 *
 *   - RESISTANCE IS NEGLIGIBLE AND IRRELEVANT. Half a tonne of displacement on
 *     a 20 m waterline has almost no wave-making and almost no wetted area. The
 *     hull could be towed at hull speed by a rowing boat.
 *
 *   - AERODYNAMIC DRAG IS EVERYTHING. The same vehicle presents a 33,000 m3
 *     envelope to the wind. Bow-on at 10 m/s that is already several times the
 *     hydrodynamic resistance at hull speed. The boat does not fight the water,
 *     it fights the air, and `windwardSpeed` is the function that says so.
 *
 *   - HULL SPEED IS NOT THE LIMIT. Froude's wave-making wall assumes the hull
 *     is carrying its own weight. This one is not, so it slips past hull speed
 *     without the hump — and then runs straight into an aerodynamic drag wall
 *     that a boat never sees.
 *
 *   - SEAKEEPING IS A SUSPENSION PROBLEM, NOT A SLAMMING ONE. A floatplane is
 *     limited to about 0.3 m of wave because it slams: it is heavy and the
 *     water has to stop it. This vehicle is not heavy, so it does not slam. It
 *     gets picked up. The hull is held at a nearly fixed altitude by 30 tonnes
 *     of buoyancy and enormous added mass; the gondola rides the sea surface;
 *     the suspension between them absorbs the whole wave height. That is the
 *     load case, and it is the one nobody thinks to check.
 */

const G0 = CONSTANTS.g0.value

// --------------------------------------------------------------------------
// Displacement and speed
// --------------------------------------------------------------------------

/**
 * Hull speed: the speed at which the bow and stern wave systems have one
 * wavelength between them, m/s.
 *
 * @derived The deep-water gravity wave dispersion relation, with the wavelength
 * set equal to the waterline length: v = sqrt(g * L / (2 * pi)). The familiar
 * 1.34 * sqrt(L_ft) in knots is the same equation in imperial units.
 *
 * For a normal displacement hull this is close to a hard limit, because
 * wave-making resistance climbs faster than any reasonable powering can follow.
 * For this vehicle it is not a limit at all: wave-making scales with the weight
 * the hull is carrying, and this hull is carrying almost none.
 */
export const hullSpeed = (waterlineLength: Meters): number =>
  Math.sqrt((G0 * waterlineLength) / (2 * Math.PI))

/** @derived v / sqrt(g * L). The length Froude number. */
export const froudeNumber = (speed: number, waterlineLength: Meters): number =>
  speed / Math.sqrt(G0 * waterlineLength)

/**
 * Residuary resistance coefficient against Froude number, for a slender hull.
 *
 * @source The classic wave-making hump: resistance is small below Fn 0.25, rises
 * steeply from 0.30, peaks near 0.50, and falls away beyond it as the hull
 * outruns its own wave system. The published thresholds are Fn 0.35 where
 * wave-making climbs sharply, 0.40 where the divergent system adds to it, and
 * 0.50 at the peak.
 *
 * The magnitudes are for a fine, light hull and are an approximation with a
 * factor of two on them either way. There is no model test data for a hull that
 * carries two percent of its own weight, and inventing precision here would be
 * worse than admitting the band.
 */
const RESIDUARY_COEFFICIENT: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.0],
  [0.2, 0.3e-3],
  [0.3, 0.7e-3],
  [0.35, 1.4e-3],
  [0.4, 2.6e-3],
  [0.45, 4.5e-3],
  [0.5, 6.0e-3],
  [0.6, 5.0e-3],
  [0.8, 3.4e-3],
  [1.2, 2.2e-3],
]

const residuaryCoefficient = (fn: number): number => {
  const first = RESIDUARY_COEFFICIENT[0]
  const last = RESIDUARY_COEFFICIENT[RESIDUARY_COEFFICIENT.length - 1]
  if (!first || !last) return 0
  if (fn <= first[0]) return first[1]
  if (fn >= last[0]) return last[1]
  for (let i = 0; i < RESIDUARY_COEFFICIENT.length - 1; i += 1) {
    const a = RESIDUARY_COEFFICIENT[i]
    const b = RESIDUARY_COEFFICIENT[i + 1]
    if (!a || !b) break
    if (fn >= a[0] && fn <= b[0]) {
      const t = (fn - a[0]) / (b[0] - a[0])
      return a[1] * (1 - t) + b[1] * t
    }
  }
  return last[1]
}

/**
 * Frictional resistance coefficient.
 *
 * @source ITTC 1957 model-ship correlation line, Cf = 0.075 / (log10(Re) - 2)^2.
 * It is a correlation line rather than a friction law, which is exactly what is
 * wanted here: it is the basis every published ship resistance figure is
 * reduced against, so using anything else makes the comparison meaningless.
 */
export const frictionCoefficient = (reynolds: number): number => {
  /** @source ITTC 1957 correlation line: Cf = 0.075 / (log10(Re) - 2)^2. */
  const ITTC_NUMERATOR = 0.075
  const ITTC_OFFSET = 2
  /** @derived Below this the line is meaningless and the hull is not moving. */
  const LAMINAR_FLOOR = 1e3
  return reynolds < LAMINAR_FLOOR
    ? 0
    : ITTC_NUMERATOR / (Math.log10(reynolds) - ITTC_OFFSET) ** 2
}

/**
 * Form factor on the friction line.
 *
 * @source (1 + k) accounts for the pressure drag of a three-dimensional hull
 * over a flat plate of the same wetted area. It runs 1.10 for a very fine hull
 * to 1.35 for a full one. Taken at 1.20 for a shallow-V planing-form gondola.
 */
const FORM_FACTOR = 1.2

export interface BoatResistance {
  /** Wetted surface of the immersed hull, m2. */
  readonly wettedArea: number
  readonly reynolds: number
  readonly froude: number
  /** Skin friction, N. */
  readonly frictional: Newtons
  /** Wave-making and viscous pressure, N. */
  readonly residuary: Newtons
  /** Aerodynamic drag on everything above the water, N. Usually the big one. */
  readonly aerodynamic: Newtons
  readonly total: Newtons
  /** Effective towing power, W. Shaft power is this over propulsive efficiency. */
  readonly effectivePower: Watts
  /** Fraction of the total that is air rather than water. */
  readonly aerodynamicFraction: number
}

/**
 * What it takes to push the vehicle through the water at a given speed.
 *
 * @param waterborneLoad Static heaviness resting on the water, kg. NOT the
 *   vehicle weight: the envelope is still lifting.
 * @param waterlineLength Immersed length of the gondola hull, m.
 * @param speed Speed through the water, m/s.
 * @param envelopeVolume Hull volume, m3, for the aerodynamic term.
 * @param headwind Wind component opposing motion, m/s. The airspeed over the
 *   envelope is speed + headwind, and it is squared.
 */
export const boatResistance = (
  waterborneLoad: Kilograms,
  waterlineLength: Meters,
  speed: number,
  envelopeVolume: number,
  headwind = 0,
  salt = true,
): BoatResistance => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const displacement = waterborneLoad / density

  /**
   * @derived Wetted surface from displacement and length, by the standard
   * preliminary-design approximation S ~ 2.7 * sqrt(displacement * L). It is
   * accurate to about ten percent across normal hull forms and it needs only
   * the two numbers that are actually known at this stage.
   */
  const wettedArea = displacement <= 0 ? 0 : 2.7 * Math.sqrt(displacement * waterlineLength)

  const reynolds = (speed * waterlineLength) / v(WATER.seawaterKinematicViscosity)
  const froude = froudeNumber(speed, waterlineLength)
  const q = 0.5 * density * speed * speed

  const frictional = q * wettedArea * frictionCoefficient(reynolds) * FORM_FACTOR
  const residuary = q * wettedArea * residuaryCoefficient(froude)

  /**
   * @derived Aerodynamic drag on the envelope, referenced to volume^(2/3) with
   * the bow-on complete-ship drag coefficient the flight model uses. Air
   * density at the surface, and the airspeed is the boat speed plus the
   * headwind because the vehicle is moving through both.
   */
  const airDensity = 1.225
  const airspeed = speed + headwind
  const aerodynamic =
    0.5 *
    airDensity *
    airspeed *
    Math.abs(airspeed) *
    Math.pow(envelopeVolume, 2 / 3) *
    DRAG_COEFFICIENT_BOW_ON

  const total = frictional + residuary + aerodynamic

  return {
    wettedArea,
    reynolds,
    froude,
    frictional: frictional as Newtons,
    residuary: residuary as Newtons,
    aerodynamic: aerodynamic as Newtons,
    total: total as Newtons,
    effectivePower: (total * speed) as Watts,
    aerodynamicFraction: total === 0 ? 0 : aerodynamic / total,
  }
}

/**
 * Froude number past which a hull this lightly loaded is dynamically unstable.
 *
 * @source Above roughly Fn 0.9 a slender hull carrying a small fraction of its
 * own displacement porpoises: the bow lifts, the hull rides on a shrinking
 * wetted length, and the pitch oscillation diverges. Planing craft manage it
 * with a wide flat run aft, trim tabs and a step; a 4.4 m wide gondola under a
 * 115 m envelope has none of those and cannot be trimmed against it.
 *
 * The resistance model above happily reports a speed past this, because
 * resistance is all it knows. Nothing else in this module is valid there.
 */
export const PORPOISING_FROUDE_LIMIT = 0.9

/** Speed at which the hull becomes dynamically unstable, m/s. */
export const porpoisingSpeed = (waterlineLength: Meters): number =>
  PORPOISING_FROUDE_LIMIT * Math.sqrt(G0 * waterlineLength)

export interface WindwardPerformance {
  /** Speed made good against the wind, m/s. Zero means it cannot make way. */
  readonly speed: number
  /** True when thrust cannot overcome drag even at zero speed. */
  readonly overpowered: boolean
  /** Wind at which speed made good falls to zero, m/s. */
  readonly stallWind: number
  /**
   * True when the thrust available would drive the hull past the speed where it
   * porpoises. The answer then is not the speed: it is that the vehicle is
   * thrust-limited by dynamic stability rather than by resistance, and it must
   * throttle back.
   */
  readonly porpoisingLimited: boolean
  readonly resistance: BoatResistance
}

/**
 * How fast the vehicle can motor into a given wind, on the water.
 *
 * THE FUNCTION THAT DECIDES WHETHER MARINE MODE IS USEFUL AT ALL. Landing on
 * water is easy and floating is easy. Getting somewhere afterwards is a
 * completely different question, because the thing that has to be pushed
 * through the air is the entire envelope.
 *
 * Bisection on speed, because total resistance is monotonic in speed once the
 * headwind is fixed and the residuary curve is interpolated from a table that
 * is not analytically invertible.
 */
export const windwardSpeed = (
  thrust: Newtons,
  windSpeed: number,
  waterborneLoad: Kilograms,
  waterlineLength: Meters,
  envelopeVolume: number,
): WindwardPerformance => {
  const at = (speed: number) =>
    boatResistance(waterborneLoad, waterlineLength, speed, envelopeVolume, windSpeed)

  // At zero speed the hull makes no resistance but the wind is still blowing on
  // the envelope, so this is the check for whether the vehicle is simply blown
  // backwards.
  const limit = porpoisingSpeed(waterlineLength)

  const atRest = at(0)
  if (atRest.total >= thrust) {
    return {
      speed: 0,
      overpowered: true,
      stallWind: 0,
      porpoisingLimited: false,
      resistance: atRest,
    }
  }

  /** @derived Nothing on the water is going faster than this. */
  const SPEED_SEARCH_CEILING = 30
  let low = 0
  let high = SPEED_SEARCH_CEILING
  if (at(high).total < thrust) {
    return {
      speed: limit,
      overpowered: false,
      stallWind: NaN,
      porpoisingLimited: true,
      resistance: at(limit),
    }
  }
  /** @derived 50 bisections resolve the speed far past any physical meaning. */
  const BISECTIONS = 50
  for (let i = 0; i < BISECTIONS; i += 1) {
    const mid = (low + high) / 2
    if (at(mid).total < thrust) low = mid
    else high = mid
  }

  // The wind at which speed made good reaches zero: solve the same balance the
  // other way round, with the vehicle stationary in the water.
  /** @derived Search bounds on wind. 60 m/s is a category 3 hurricane. */
  const WIND_SEARCH_CEILING = 60
  let windLow = 0
  let windHigh = WIND_SEARCH_CEILING
  for (let i = 0; i < BISECTIONS; i += 1) {
    const mid = (windLow + windHigh) / 2
    const r = boatResistance(waterborneLoad, waterlineLength, 0, envelopeVolume, mid)
    if (r.total < thrust) windLow = mid
    else windHigh = mid
  }

  const speed = Math.min(low, limit)
  return {
    speed,
    overpowered: false,
    stallWind: windLow,
    porpoisingLimited: low > limit,
    resistance: at(speed),
  }
}

// --------------------------------------------------------------------------
// Seakeeping
// --------------------------------------------------------------------------

/**
 * How the vehicle meets the water.
 *
 * The distinction is not cosmetic. A rigid hull is a SPRING: the force it feeds
 * into the suspension is rho * g * A * dz and it grows without limit as the
 * wave lifts it. A pneumatic float is a FORCE LIMITER: it cannot push harder
 * than its gauge pressure times its contact area, because past that it simply
 * squashes. That is the engineering reason the Airlander uses pneumatic skids
 * rather than a boat hull, and it is the single most important thing the marine
 * research changed about this design.
 */
export type FloatType =
  /** A boat hull. Hydrostatically stiff, and the stiffness is the problem. */
  | { readonly kind: 'rigid'; readonly waterplaneArea: number }
  /**
   * An inflated cushion. Compliant, and its force ceiling is a design choice
   * made with a pressure regulator rather than with structure.
   */
  | {
      readonly kind: 'pneumatic'
      readonly contactArea: number
      /** Cushion gauge pressure, Pa. */
      readonly gaugePressure: number
    }

export interface SeakeepingVerdict {
  readonly seaState: number
  readonly significantWaveHeight: number
  /** Peak force into the gondola suspension from wave lift, N. */
  readonly suspensionLoad: Newtons
  /** That load as a fraction of the suspension's flight design load. */
  readonly utilisation: number
  readonly acceptable: boolean
  /** True when the float reached its pressure ceiling and stopped transmitting. */
  readonly forceLimited: boolean
  readonly reason: string
}

/**
 * What the sea does to a vehicle that is held up by air.
 *
 * NOT A SLAMMING CALCULATION, and this is the whole point. A floatplane is
 * limited to about 0.3 m of wave because it is heavy: the water has to stop
 * several tonnes in a hull length, and the deceleration breaks things. This
 * vehicle puts a few hundred kilograms on the water. It does not slam.
 *
 * What happens instead is that a passing crest tries to LIFT the float. The
 * envelope above it is effectively fixed in altitude — it is buoyant, it has an
 * enormous added mass, and it cannot respond at wave frequency — so the whole
 * relative motion is taken by the suspension between them. For a rigid hull the
 * buoyant force from immersing by the wave amplitude is an order of magnitude
 * larger than anything the suspension was designed for, and it has nowhere to
 * go except into the cables and their hull fittings.
 *
 * A pneumatic float cannot do that. Its force ceiling is pressure times contact
 * area, and past that it deflates into the wave instead of pushing back.
 *
 * @param suspensionDesignLoad Flight design load of the gondola suspension, N.
 *   Referenced to the gondola weight and its gust factor, NOT to the static
 *   heaviness: the suspension is sized by flight, and the sea has to fit inside
 *   what flight already bought.
 */
export const seakeeping = (
  seaStateCode: number,
  float: FloatType,
  suspensionDesignLoad: Newtons,
  salt = true,
): SeakeepingVerdict => {
  const state = SEA_STATE.find((s) => s.code === seaStateCode) ?? SEA_STATE[0]
  if (!state) throw new RangeError(`No sea state ${seaStateCode}.`)

  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)

  /**
   * @derived A crest passing under the float immerses it by up to half the
   * significant wave height before the vehicle can respond. Half rather than
   * the full height because the float does partially follow the sea: it is
   * light enough to be lifted rather than punched through. This is the
   * optimistic end and it is stated as such.
   */
  const immersion = state.significantWaveHeight / 2

  let suspensionLoad: number
  let forceLimited = false
  let mechanism: string

  if (float.kind === 'rigid') {
    suspensionLoad = density * G0 * float.waterplaneArea * immersion
    mechanism = `${float.waterplaneArea.toFixed(0)} m² of rigid waterplane immersed ${immersion.toFixed(2)} m`
  } else {
    const hydrostatic = density * G0 * float.contactArea * immersion
    const ceiling = float.gaugePressure * float.contactArea
    forceLimited = hydrostatic > ceiling
    suspensionLoad = Math.min(hydrostatic, ceiling)
    mechanism = forceLimited
      ? `${float.contactArea.toFixed(0)} m² of cushion at ${(float.gaugePressure / 1000).toFixed(1)} kPa, which squashes at ${(ceiling / 1000).toFixed(0)} kN rather than pushing harder`
      : `${float.contactArea.toFixed(0)} m² of cushion immersed ${immersion.toFixed(2)} m, still below its ${(ceiling / 1000).toFixed(0)} kN pressure ceiling`
  }

  const utilisation = suspensionDesignLoad === 0 ? Infinity : suspensionLoad / suspensionDesignLoad
  const acceptable = utilisation <= 1

  return {
    seaState: state.code,
    significantWaveHeight: state.significantWaveHeight,
    suspensionLoad: suspensionLoad as Newtons,
    utilisation,
    acceptable,
    forceLimited,
    reason: acceptable
      ? `Sea state ${state.code}, ${state.description}, ${state.significantWaveHeight} m significant: ${mechanism} puts ${(suspensionLoad / 1000).toFixed(0)} kN into the suspension, ${(utilisation * 100).toFixed(0)} percent of its ${(suspensionDesignLoad / 1000).toFixed(0)} kN flight design load.`
      : `Sea state ${state.code}, ${state.description}, ${state.significantWaveHeight} m significant: ${mechanism} puts ${(suspensionLoad / 1000).toFixed(0)} kN into the suspension against a ${(suspensionDesignLoad / 1000).toFixed(0)} kN flight design load, ${(utilisation * 100).toFixed(0)} percent. The vehicle does not slam like a floatplane, because it is not heavy enough to slam. It gets PICKED UP, and the suspension is what breaks.`,
  }
}

/**
 * Cushion pressure that keeps the sea inside the suspension's flight design
 * load, Pa gauge.
 *
 * The design rule that falls out of all of this: choose the pressure, and the
 * sea state stops being a structural question. It is set by a regulator rather
 * than by a laminate, which is the cheapest safety margin in the whole vehicle.
 */
export const cushionPressureFor = (
  suspensionDesignLoad: Newtons,
  contactArea: number,
): number => suspensionDesignLoad / contactArea

/**
 * The largest sea the vehicle can sit in, as a sea state code.
 *
 * Returns null when even the calmest tabulated state exceeds the design load,
 * which is a real answer and not an error.
 */
export const maximumSeaState = (
  float: FloatType,
  suspensionDesignLoad: Newtons,
  salt = true,
): number | null => {
  let best: number | null = null
  for (const state of SEA_STATE) {
    if (seakeeping(state.code, float, suspensionDesignLoad, salt).acceptable) best = state.code
  }
  return best
}

// --------------------------------------------------------------------------
// Touching down
// --------------------------------------------------------------------------

export interface TouchdownVerdict {
  /** Depth the gondola immerses to before the water stops it, m. */
  readonly immersion: number
  /** Peak deceleration, m/s2. */
  readonly deceleration: number
  /** Peak deceleration in g. */
  readonly loadFactor: number
  /** True when the gondola goes under before the water stops it. */
  readonly submerged: boolean
  readonly reason: string
}

/**
 * The water landing itself.
 *
 * Energy balance rather than an impact model: the descending mass is stopped by
 * the buoyancy it develops as it immerses, and the stopping distance is what
 * sets the deceleration. Hydrodynamic added mass and spray drag both help and
 * both are ignored, so this is the conservative end.
 *
 * The mass being stopped is the WHOLE vehicle, because the suspension is stiff
 * in this direction and the envelope's added mass is coming down with it. The
 * force resisting it is buoyancy on the gondola alone, minus the static
 * heaviness that was never supported in the first place.
 *
 * @param descentRate Vertical speed at contact, m/s.
 * @param waterplaneArea Plan area of the gondola at the waterline, m2.
 * @param staticHeaviness Load the water has to carry once at rest, kg.
 * @param totalMass Everything coming down, kg, including the envelope's air.
 * @param hullDepth Depth of the gondola hull below the waterline before it
 *   floods, m.
 */
export const waterTouchdown = (
  descentRate: number,
  waterplaneArea: number,
  staticHeaviness: Kilograms,
  totalMass: Kilograms,
  hullDepth: Meters,
  salt = true,
): TouchdownVerdict => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)

  /**
   * @derived Kinetic energy of the descent is absorbed by the work done against
   * net buoyancy over the immersion depth. Buoyancy grows linearly with depth
   * for a wall-sided hull, so the work is the triangle under it:
   *
   *   0.5 * m * vd^2 = 0.5 * rho * g * A_wp * d^2 - heaviness * g * d
   *
   * Solve the quadratic for d, taking the positive root.
   */
  /** @derived Quadratic coefficient on d^2: the buoyancy that grows with depth. */
  const a = 0.5 * density * G0 * waterplaneArea
  /** @derived Linear term: the heaviness the water was always going to carry. */
  const b = -staticHeaviness * G0
  /** @derived Constant term: the kinetic energy that has to be absorbed. */
  const c = -0.5 * totalMass * descentRate * descentRate
  const discriminant = b * b - 4 * a * c
  const immersion = (-b + Math.sqrt(discriminant)) / (2 * a)

  // Peak deceleration is at maximum immersion, where the net upward force is
  // largest.
  const peakForce = density * G0 * waterplaneArea * immersion - staticHeaviness * G0
  const deceleration = peakForce / totalMass
  const submerged = immersion > hullDepth

  return {
    immersion,
    deceleration,
    loadFactor: deceleration / G0,
    submerged,
    reason: submerged
      ? `A ${descentRate.toFixed(1)} m/s touchdown immerses the gondola ${immersion.toFixed(2)} m against a ${hullDepth.toFixed(2)} m hull depth. It goes under before the water stops it. Either arrive slower, trim lighter, or give the hull more depth or more waterplane.`
      : `A ${descentRate.toFixed(1)} m/s touchdown immerses the gondola ${immersion.toFixed(2)} m of its ${hullDepth.toFixed(2)} m depth and peaks at ${(deceleration / G0).toFixed(2)} g. Gentle, because almost nothing is resting on the water: the envelope is still carrying the vehicle and the sea is only catching it.`,
  }
}

/**
 * Cross-flow drag on the immersed hull when the vehicle is blown sideways.
 *
 * The water's contribution to resisting leeway. It is small, which is the
 * point: the sea anchor exists because the hull cannot do this job.
 */
export const lateralWaterResistance = (
  leewaySpeed: number,
  immersedLateralArea: number,
  salt = true,
): Newtons => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  return (0.5 *
    density *
    leewaySpeed *
    Math.abs(leewaySpeed) *
    immersedLateralArea *
    v(WINDAGE.crossFlowDragCoefficient)) as Newtons
}
