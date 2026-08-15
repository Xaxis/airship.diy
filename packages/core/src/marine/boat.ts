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

/** @source ISA sea level air density, 1.225 kg/m3. */
const SEA_LEVEL_AIR_DENSITY = 1.225

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
 * THE DISTINCTION THAT MATTERS, AND THE ONE THIS MODULE FIRST GOT BACKWARDS.
 *
 * A rigid hull is a hydrostatic spring: rho*g*A per metre of immersion, with no
 * ceiling. That much was right.
 *
 * A SEALED pneumatic bag is NOT a force limiter. It is a gas spring, and its
 * stiffness is P_ABSOLUTE * A / t, not P_gauge * A / t, because compressing a
 * bag works against the whole atmosphere inside it and not just the 0.24
 * percent of it that is gauge. For an 80 m2 bag 0.5 m thick at 245 Pa gauge
 * that is 16.3 MN/m, against 281 kN/m for the waterplane it replaced. A sealed
 * bag is FIFTY-EIGHT TIMES STIFFER THAN THE WATER. The force-limiter argument
 * is not merely optimistic there, it is inverted.
 *
 * A VENTED bag is a force limiter, and only because it vents. Air leaves
 * through a relief area when the gauge pressure reaches its setting, so the
 * force cannot climb past p_relief * A no matter how far the wave pushes. The
 * vent has to be big: roughly 0.42 m2 to hold 245 Pa while 2 m3 is swept in 0.4
 * seconds. That is a design requirement, not a detail, and it is the difference
 * between the concept working and inverting.
 *
 * An AIR CUSHION is a vented bag that is continuously fed, and at this
 * vehicle's weight it cannot make a cushion at all. Cushion depression depth is
 * Pc/(rho_w*g), a relation that reproduces the XC-8A's published 0.82 m to
 * within 2 percent. At 1,000 kg of heaviness over 80 m2 the cushion pressure is
 * 123 Pa and the depression is 12 mm, while a sea state 2 wave is a 1,500 Pa
 * head. The wave goes straight through. An ACLS is a HEAVY vehicle's device and
 * a buoyant airship has, by definition, almost no weight to pressurise one
 * with.
 *
 * @source NASA TN D-7295 (Thompson, 1973) for the XC-8A air cushion landing
 * system, and NASA CR-159002 (Bell/de Havilland, 1979) for the design study
 * comparisons. The XC-8A ran 8,200 Pa cushion and 16,400 Pa trunk on a 17,735
 * kg aeroplane.
 */
export type FloatType =
  /** A boat hull. Hydrostatically stiff, and at 35 mm of draft it also slams. */
  | { readonly kind: 'rigid'; readonly waterplaneArea: number }
  /**
   * An inflated bag with no relief path. A gas spring at absolute pressure, and
   * stiffer than the water it replaces. Modelled so the drawing can show why it
   * does not work.
   */
  | {
      readonly kind: 'sealed-pneumatic'
      readonly contactArea: number
      readonly gaugePressure: number
      /** Uncompressed thickness, m. The spring rate goes as 1/t. */
      readonly thickness: number
    }
  /**
   * An inflated bag with a relief valve. The only one of the three that limits
   * force, and it limits it to the relief setting times the area, times a real
   * overshoot.
   */
  | {
      readonly kind: 'vented-pneumatic'
      readonly contactArea: number
      /** Relief valve setting, Pa gauge. */
      readonly reliefPressure: number
    }

/**
 * Peak-to-nominal pressure overshoot of a vented cushion on water impact.
 *
 * @source NASA TN D-7295, XC-8A model tests. Trunk pressure went from a nominal
 * 1.5 kPa to maxima of 3.2, 3.3 and 3.7 kPa on calm-water landings at 0, 3 and
 * 6 degrees of roll, and to 3.9 kPa in 1.5 m waves. Cushion pressure went from
 * 0.82 kPa nominal to 2.7 kPa. That is 2.2 to 3.3 times.
 *
 * So "capped at gauge pressure times contact area" is wrong by a factor of about
 * two and a half, and it is wrong in the flattering direction. The relief valve
 * cannot dump air instantly, and the flow it has to pass grows with the wave.
 */
const VENT_OVERSHOOT = 2.5

/**
 * Added mass coefficient in heave for a fineness 5 hull.
 *
 * @source Lamb (1932) Hydrodynamics 6th ed. arts. 111-114, k2 for a prolate
 * spheroid, as implemented in the added-mass module.
 *
 * It belongs here because the vehicle's resistance to being lifted by a wave is
 * NOT its mass: it is its mass plus the air it must accelerate with it. For the
 * baseline that is 24,516 kg plus 0.894 * 1.225 * 32,968 = 36,105 kg of air, or
 * 60,621 kg of effective heave inertia against a 10 kN load. Sixty to one. The
 * vehicle is nearly fixed in heave while the sea moves a metre under it, and
 * that is precisely why the relative motion all lands in the suspension.
 */
const HEAVE_ADDED_MASS_COEFFICIENT = 0.894

export interface SeakeepingVerdict {
  readonly seaState: number
  readonly significantWaveHeight: number
  /** Peak force into the gondola suspension, N. */
  readonly suspensionLoad: Newtons
  /** That load as a fraction of the suspension's flight design load. */
  readonly utilisation: number
  readonly acceptable: boolean
  /** True when the float reached its relief setting and stopped transmitting. */
  readonly forceLimited: boolean
  /** Heave natural period on this float, s. */
  readonly heavePeriod: number
  /** True when the heave period is within a quarter of the wave period. */
  readonly nearResonance: boolean
  readonly reason: string
}

/**
 * What the sea does to a vehicle that is held up by air.
 *
 * NOT A SLAMMING CALCULATION IN THE FLOATPLANE SENSE, but not free of slam
 * either. A floatplane is limited to about 0.3 m of wave because several tonnes
 * have to be stopped in a hull length. This vehicle puts a few hundred
 * kilograms on the water, so at 1,000 kg on a 28 m2 waterplane its draft is
 * 35 mm and it leaves the water in every trough. What it does is get PICKED UP
 * and then dropped, and the envelope above cannot follow at wave frequency
 * because its effective heave inertia is sixty times the load.
 *
 * @param suspensionDesignLoad Flight design load of the gondola suspension, N.
 *   Referenced to the gondola weight and its gust factor, NOT to the static
 *   heaviness: the suspension is sized by flight, and the sea has to fit inside
 *   what flight already bought.
 * @param effectiveHeaveInertia Vehicle mass plus its heave added mass, kg.
 */
export const seakeeping = (
  seaStateCode: number,
  float: FloatType,
  suspensionDesignLoad: Newtons,
  effectiveHeaveInertia: Kilograms,
  salt = true,
): SeakeepingVerdict => {
  const state = SEA_STATE.find((s) => s.code === seaStateCode) ?? SEA_STATE[0]
  if (!state) throw new RangeError(`No sea state ${seaStateCode}.`)

  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  /** @derived Newtons per metre to meganewtons per metre, for the message. */
  const MEGA = 1e6

  /**
   * @derived A crest passing under the float immerses it by up to half the
   * significant wave height before the vehicle can respond. Half rather than
   * the full height because the float does partially follow the sea. This is
   * the optimistic end and it is stated as such.
   */
  const immersion = state.significantWaveHeight / 2

  let suspensionLoad: number
  let stiffness: number
  let forceLimited = false
  let mechanism: string

  switch (float.kind) {
    case 'rigid': {
      stiffness = density * G0 * float.waterplaneArea
      suspensionLoad = stiffness * immersion
      mechanism = `${float.waterplaneArea.toFixed(0)} m² of rigid waterplane immersed ${immersion.toFixed(2)} m against a ${(stiffness / 1000).toFixed(0)} kN/m hydrostatic spring`
      break
    }
    case 'sealed-pneumatic': {
      /**
       * @derived Isothermal gas spring: k = P_absolute * A / t. The absolute
       * pressure, not the gauge, because compressing the bag works against
       * every molecule in it.
       */
      const ATMOSPHERIC = 101325
      stiffness = ((ATMOSPHERIC + float.gaugePressure) * float.contactArea) / float.thickness
      suspensionLoad = stiffness * immersion
      mechanism =
        `${float.contactArea.toFixed(0)} m² of SEALED bag ${(float.thickness * 1000).toFixed(0)} mm thick, ` +
        `which is a ${(stiffness / MEGA).toFixed(1)} MN/m gas spring because the stiffness goes with ABSOLUTE ` +
        `pressure and the gauge is only ${((float.gaugePressure / ATMOSPHERIC) * 100).toFixed(2)} percent of it`
      break
    }
    case 'vented-pneumatic': {
      const ceiling = float.reliefPressure * float.contactArea * VENT_OVERSHOOT
      const hydrostatic = density * G0 * float.contactArea * immersion
      stiffness = density * G0 * float.contactArea
      forceLimited = hydrostatic > ceiling
      suspensionLoad = Math.min(hydrostatic, ceiling)
      mechanism = forceLimited
        ? `${float.contactArea.toFixed(0)} m² venting at ${(float.reliefPressure / 1000).toFixed(2)} kPa, which caps at ${(ceiling / 1000).toFixed(0)} kN once the measured ${VENT_OVERSHOOT} times overshoot is allowed for`
        : `${float.contactArea.toFixed(0)} m² immersed ${immersion.toFixed(2)} m, still below the ${(ceiling / 1000).toFixed(0)} kN its relief valve would cap at`
      break
    }
  }

  /**
   * @derived Heave natural period, 2*pi*sqrt(m_effective/k), and the dynamic
   * amplification a wave at that period produces:
   *
   *   Q = 1 / sqrt((1 - r^2)^2 + (2 * zeta * r)^2),  r = T_natural / T_wave
   *
   * It matters because the quasi-static load above assumes the wave lifts the
   * float slowly. It does not: a lightly loaded float on a stiff spring has a
   * heave period of a couple of seconds, which is inside the band of ordinary
   * sea states, and near resonance the load is several times the static figure.
   *
   * @source Damping ratio 0.15. A float this lightly loaded has almost no
   * viscous damping and radiates very little wave energy, because radiated wave
   * amplitude scales with the waterplane it drives. It is the softest number
   * here, and it only ever makes the answer worse than the static one.
   */
  const DAMPING_RATIO = 0.15
  const heavePeriod = 2 * Math.PI * Math.sqrt(effectiveHeaveInertia / stiffness)
  const r = heavePeriod / state.meanPeriod
  const amplification = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * DAMPING_RATIO * r) ** 2)
  /** @derived Within 25 percent of the wave period is close enough to call it. */
  const RESONANCE_BAND = 0.25
  const nearResonance = Math.abs(r - 1) < RESONANCE_BAND
  /** @derived Below 20 percent of amplification it is not worth a sentence. */
  const AMPLIFICATION_WORTH_MENTIONING = 1.2

  // The amplification acts on the DISPLACEMENT, so it acts on the hydrostatic
  // force. It does not defeat a relief valve: a force ceiling is a force
  // ceiling however fast the wave arrives, which is the whole argument for one.
  suspensionLoad *= amplification
  if (float.kind === 'vented-pneumatic') {
    const ceiling = float.reliefPressure * float.contactArea * VENT_OVERSHOOT
    forceLimited = suspensionLoad > ceiling
    suspensionLoad = Math.min(suspensionLoad, ceiling)
  }

  const utilisation = suspensionDesignLoad === 0 ? Infinity : suspensionLoad / suspensionDesignLoad
  const acceptable = utilisation <= 1

  const resonanceNote = nearResonance
    ? ` The heave period on this float is ${heavePeriod.toFixed(1)} s against a ${state.meanPeriod} s wave, so it is at resonance and the load is amplified ${amplification.toFixed(1)} times. A lightly loaded float has almost no damping, and this is the sea state that hurts it rather than the biggest one.`
    : amplification > AMPLIFICATION_WORTH_MENTIONING
      ? ` Amplified ${amplification.toFixed(1)} times by the ${heavePeriod.toFixed(1)} s heave period against a ${state.meanPeriod} s wave.`
      : ''

  return {
    seaState: state.code,
    significantWaveHeight: state.significantWaveHeight,
    suspensionLoad: suspensionLoad as Newtons,
    utilisation,
    acceptable,
    forceLimited,
    heavePeriod,
    nearResonance,
    reason:
      utilisation <= 1 && !nearResonance
        ? `Sea state ${state.code}, ${state.description}, ${state.significantWaveHeight} m significant: ${mechanism} puts ${(suspensionLoad / 1000).toFixed(0)} kN into the suspension, ${(utilisation * 100).toFixed(0)} percent of its ${(suspensionDesignLoad / 1000).toFixed(0)} kN flight design load.${resonanceNote}`
        : `Sea state ${state.code}, ${state.description}, ${state.significantWaveHeight} m significant: ${mechanism} puts ${(suspensionLoad / 1000).toFixed(0)} kN into the suspension against a ${(suspensionDesignLoad / 1000).toFixed(0)} kN flight design load, ${(utilisation * 100).toFixed(0)} percent. The vehicle does not slam like a floatplane, because it is not heavy enough to slam. It gets PICKED UP, and the suspension is what breaks.${resonanceNote}`,
  }
}

export interface CushionFeasibility {
  /** Cushion pressure the vehicle's own weight can generate, Pa gauge. */
  readonly cushionPressure: number
  /** Depth the cushion can push the water down, m. */
  readonly depressionDepth: number
  /** Pressure head of the design wave, Pa. */
  readonly waveHead: number
  readonly viable: boolean
  /** Continuous fan power to hold the cushion, W. */
  readonly fanPower: number
  readonly reason: string
}

/**
 * Whether an air cushion landing system can make a cushion at all here.
 *
 * @derived Cushion depression depth is Pc/(rho_w * g): the cushion pushes the
 * water down until the hydrostatic head balances it. The relation reproduces
 * the XC-8A's published 0.82 m displacement to within 2 percent from its 8,140
 * Pa cushion pressure, and the notional Large Multi-Mission Amphibian's 1.19 m
 * from its 11,731 Pa, so it is validated on both ends of the published range.
 *
 * The trouble is that Pc = W/A, and a buoyant airship's W on the water is its
 * static heaviness, which is a few hundred kilograms. Every benefit an ACLS
 * offers (air lubrication, wave smoothing, obstacle clearance) needs a cushion
 * pressure comparable to the disturbance it is supposed to overcome, and this
 * one has two orders of magnitude less.
 *
 * @source NASA TN D-7295 and NASA CR-159002 for the XC-8A and the design study
 * amphibians. Fan power scales as perimeter times Pc^(3/2), also from CR-159002.
 */
export const cushionFeasibility = (
  heaviness: Kilograms,
  footprintArea: number,
  perimeter: number,
  significantWaveHeight: number,
  salt = true,
): CushionFeasibility => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const cushionPressure = (heaviness * G0) / footprintArea
  const depressionDepth = cushionPressure / (density * G0)
  const waveHead = density * G0 * significantWaveHeight
  const viable = depressionDepth >= significantWaveHeight / 2

  /**
   * @derived Q = perimeter * gap * sqrt(2 Pc / rho_air) at the 18 mm effective
   * gap the XC-8A design study implies, delivered by a fan at twice cushion
   * pressure and 70 percent efficiency.
   */
  const EFFECTIVE_GAP = 0.018
  /** @source ISA sea level air density. */
  const AIR_DENSITY = 1.225
  /** @source A well-matched centrifugal fan at its design point. */
  const FAN_EFFICIENCY = 0.7
  /** @source NASA CR-159002: the XC-8A ran 16,375 Pa trunk on 8,140 Pa cushion. */
  const TRUNK_TO_CUSHION = 2
  const flow = perimeter * EFFECTIVE_GAP * Math.sqrt((2 * cushionPressure) / AIR_DENSITY)
  const fanPower = (flow * cushionPressure * TRUNK_TO_CUSHION) / FAN_EFFICIENCY

  return {
    cushionPressure,
    depressionDepth,
    waveHead,
    viable,
    fanPower,
    reason: viable
      ? `${heaviness.toFixed(0)} kg over ${footprintArea.toFixed(0)} m² is ${cushionPressure.toFixed(0)} Pa of cushion, which pushes the water down ${(depressionDepth * 1000).toFixed(0)} mm against a ${significantWaveHeight} m wave. It holds, and it costs ${(fanPower / 1000).toFixed(1)} kW continuously.`
      : `${heaviness.toFixed(0)} kg over ${footprintArea.toFixed(0)} m² is only ${cushionPressure.toFixed(0)} Pa of cushion, which pushes the water down ${(depressionDepth * 1000).toFixed(0)} mm. A ${significantWaveHeight} m wave is a ${(waveHead / 1000).toFixed(1)} kPa head, ${(waveHead / cushionPressure).toFixed(0)} times the cushion. The wave passes straight through and what is left is a wet flapping bag. An air cushion is a HEAVY vehicle's device: the XC-8A ran 8.2 kPa under 17.7 tonnes, and a buoyant airship has by definition almost no weight to pressurise one with. It would still cost ${(fanPower / 1000).toFixed(1)} kW to run.`,
  }
}

/**
 * Relief vent area a pneumatic float needs to actually limit force.
 *
 * @derived The vent must pass the volume the wave sweeps, in the time it sweeps
 * it, without the gauge pressure rising: A = Q / (Cd * sqrt(2 p / rho_air)).
 * Roughly 0.42 m2 for 2 m3 in 0.4 s at 245 Pa. Undersize it and the bag reverts
 * to the sealed case, which is stiffer than the water.
 */
export const reliefVentArea = (
  sweptVolume: number,
  sweepTime: number,
  reliefPressure: number,
  /** @source Sharp-edged orifice discharge coefficient. */
  dischargeCoefficient = 0.6,
): number => {
  /** @source Air density at sea level. */
  const AIR_DENSITY = 1.225
  const jetVelocity = Math.sqrt((2 * reliefPressure) / AIR_DENSITY)
  return sweptVolume / sweepTime / (dischargeCoefficient * jetVelocity)
}

/**
 * The largest sea the vehicle can sit in, as a sea state code.
 *
 * Returns null when even the calmest tabulated state exceeds the design load,
 * which is a real answer and not an error.
 */
/**
 * Relief setting that keeps the sea inside the suspension's flight design load,
 * Pa gauge.
 *
 * The design rule, with the correction that took two attempts to get right: the
 * setting is the design load divided by the area AND by the measured overshoot,
 * because a relief valve does not dump air instantly and the XC-8A pulled 2.2
 * to 3.3 times its nominal pressure on every water landing it made.
 */
export const reliefPressureFor = (
  suspensionDesignLoad: Newtons,
  contactArea: number,
): number => suspensionDesignLoad / contactArea / VENT_OVERSHOOT

export const maximumSeaState = (
  float: FloatType,
  suspensionDesignLoad: Newtons,
  effectiveHeaveInertia: Kilograms,
  salt = true,
): number | null => {
  let best: number | null = null
  for (const state of SEA_STATE) {
    if (seakeeping(state.code, float, suspensionDesignLoad, effectiveHeaveInertia, salt).acceptable) {
      best = state.code
    }
  }
  return best
}

/**
 * Effective heave inertia: what the wave actually has to accelerate.
 *
 * @derived Vehicle mass plus the added mass of the air the hull drags with it,
 * k2 * rho_air * V. For the baseline that is 24,516 kg of ship plus 36,105 kg of
 * air. The air is more than half of it, and leaving it out makes the vehicle
 * look responsive in heave when it is the opposite.
 */
export const effectiveHeaveInertia = (
  vehicleMass: Kilograms,
  hullVolume: number,
  /** @source ISA sea level air density, the condition a water landing happens at. */
  airDensity = SEA_LEVEL_AIR_DENSITY,
): Kilograms =>
  (vehicleMass + HEAVE_ADDED_MASS_COEFFICIENT * airDensity * hullVolume) as Kilograms

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
