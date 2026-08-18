import { ISA, CONSTANTS, MOLAR_MASS } from '@airship/data'
import type {
  Meters,
  Kelvin,
  Pascals,
  KilogramsPerCubicMeter,
  MetersPerSecond,
  PascalSeconds,
  Fraction,
} from '@airship/units'
import { K, Pa, kgPerM3, mps, PaS, m } from '@airship/units'

/**
 * The International Standard Atmosphere, plus the corrections that matter to a
 * buoyant vehicle.
 *
 * Governing equations, all from ICAO Doc 7488/3:
 *
 *   Troposphere, 0 to 11 km geopotential:
 *     T = T0 - L*H
 *     p = p0 * (T/T0)^(g0*M/(R*L))
 *
 *   Isothermal layer, 11 to 20 km:
 *     T = 216.65
 *     p = p11 * exp(-g0*M*(H - 11000)/(R*T))
 *
 *   Second lapse layer, 20 to 32 km:
 *     T = 216.65 + 1.0e-3*(H - 20000)
 *     p = p20 * (T/T20)^(g0*M/(R*L2))
 *
 *   Density everywhere: rho = p*M/(R*T)
 *
 * Validity: 0 to 32 km geopotential. This vehicle lives between 0 and 4 km and
 * only sees the tropopause in a runaway ascent, which is a failure case the
 * model still has to be able to integrate through rather than throw on.
 *
 * ALTITUDE IS GEOPOTENTIAL unless you say otherwise. ISA is defined on
 * geopotential altitude, published tables are tabulated against it, and the
 * difference from geometric altitude reaches 63 m at 20 km. That is 0.3 percent
 * in pressure, which is three times the tolerance the validation gate holds to,
 * so getting this wrong would fail the gate for a reason that has nothing to do
 * with the physics.
 */

/**
 * Nominal Earth radius used by ISA for the geopotential conversion. This is not
 * the equatorial or the mean radius; it is the value that makes ISA's own
 * geopotential definition self-consistent.
 * @source ICAO Doc 7488/3
 */
const ISA_EARTH_RADIUS = 6356766

/** @derived H = r*h/(r + h). Exact inverse of geopotentialToGeometric. */
export const geometricToGeopotential = (geometric: Meters): Meters => {
  if (geometric <= -ISA_EARTH_RADIUS) {
    throw new RangeError(
      `Geometric altitude ${geometric} m is at or below the centre of the Earth, where the ` +
        `geopotential conversion has a pole.`,
    )
  }
  return m((ISA_EARTH_RADIUS * geometric) / (ISA_EARTH_RADIUS + geometric))
}

/**
 * @derived h = r*H/(r - H).
 *
 * Guarded because the pole is at H = r and the expression does not announce it:
 * it returns Infinity there and NEGATIVE altitudes above it, which is a wrong
 * answer that looks like an answer. Nothing in this project goes near 6,357 km,
 * which is exactly why an unguarded pole would never be found by testing the
 * cases anyone cares about.
 */
export const geopotentialToGeometric = (geopotential: Meters): Meters => {
  if (geopotential >= ISA_EARTH_RADIUS) {
    throw new RangeError(
      `Geopotential altitude ${geopotential} m is at or above the ISA Earth radius ` +
        `${ISA_EARTH_RADIUS} m, where the conversion to geometric altitude diverges.`,
    )
  }
  return m((ISA_EARTH_RADIUS * geopotential) / (ISA_EARTH_RADIUS - geopotential))
}

export interface AtmosphereState {
  readonly altitude: Meters
  readonly temperature: Kelvin
  readonly pressure: Pascals
  readonly density: KilogramsPerCubicMeter
  readonly speedOfSound: MetersPerSecond
  readonly dynamicViscosity: PascalSeconds
  /** Mean molar mass of the air as modelled, kg/mol. Falls with humidity. */
  readonly molarMass: number
}

export interface AtmosphereOptions {
  /**
   * Temperature offset from standard, K.
   *
   * Density goes as 1/T at fixed pressure, so an ISA+20 day at sea level is a
   * 6.5 percent density reduction and therefore 6.5 percent of gross lift,
   * which for this vehicle is the difference between holding altitude and not.
   *
   * @derived 1 - 288.15/308.15 = 0.0649. This said "7 percent", the test that
   * guards it says "about 6.6" in its title and 6.49 in its own comment on the
   * next line, and the assertion was a band loose enough to admit all three.
   *
   * DO NOT CONFLATE THIS WITH SUPERHEAT. An ambient offset moves the air and
   * the cell gas together at fixed pressure. Superheat moves only the cell gas
   * and carries a rho_air / (rho_air - rho_gas) prefactor of 1.075, which is
   * why 20 K of superheat is 7.5 percent and 20 K of ambient is 6.5.
   */
  readonly temperatureOffset?: Kelvin
  /**
   * Relative humidity, 0 to 1.
   *
   * Humid air is LESS dense than dry air, because water at 18 g/mol displaces
   * nitrogen and oxygen averaging 29. This is counterintuitive enough that it
   * gets left out of airship models routinely.
   *
   * @derived At 30 degrees C and saturation it costs 1.58 percent of density
   * and therefore 1.58 percent of gross lift, which on a 10 t ship is 158 kg.
   * That is real ballast. It said 1.9 percent and 190 kg, which is the one
   * humidity figure a reader lifts straight into a ballast plan, 20 percent
   * optimistic.
   */
  readonly relativeHumidity?: Fraction
}

/** Layer boundaries, evaluated once. ISA is a definition and does not change. */
const T0 = ISA.seaLevelTemperature.value
const P0 = ISA.seaLevelPressure.value
const R_ISA = ISA.gasConstant.value
const M_AIR = MOLAR_MASS.dryAir.value
const G0 = CONSTANTS.g0.value
const LAPSE = ISA.troposphereLapseRate.value
const H_TROPOPAUSE = ISA.tropopauseAltitude.value
const T_TROPOPAUSE = ISA.tropopauseTemperature.value
const H_STRATOSPHERE = ISA.stratosphereBaseAltitude.value
const LAPSE_2 = ISA.stratosphereLapseRate.value
const GAMMA_AIR = ISA.gammaAir.value
const SUTHERLAND_BETA = ISA.sutherlandBeta.value
const SUTHERLAND_S = ISA.sutherlandConstant.value

/** Pressure at the base of each layer, computed once so the layers chain exactly. */
const P_TROPOPAUSE = P0 * (T_TROPOPAUSE / T0) ** ((G0 * M_AIR) / (R_ISA * LAPSE))
const P_STRATOSPHERE =
  P_TROPOPAUSE * Math.exp((-G0 * M_AIR * (H_STRATOSPHERE - H_TROPOPAUSE)) / (R_ISA * T_TROPOPAUSE))

/**
 * Upper limit of the implemented model. ISA continues to 80 km; we stop at the
 * top of the second lapse layer, which is already eight times higher than this
 * vehicle is designed to go.
 * @source ICAO Doc 7488/3, layer table.
 */
const MAX_ALTITUDE = 32000

/**
 * Saturation vapour pressure of water over liquid, Buck's 1981 equation.
 *
 * @source Buck, A. L. (1981), "New equations for computing vapor pressure and
 *   enhancement factor", J. Appl. Meteorol. 20, 1527-1532.
 * Accurate to better than 0.1 percent over -20 to +50 C, which covers every
 * condition this vehicle operates in. Over ice it is wrong and the vehicle
 * should not be there anyway: see the icing exclusion in the mission module.
 */
export const saturationVapourPressure = (temperature: Kelvin): Pascals => {
  /** @source Buck 1981, coefficients for water. */
  const tC = temperature - 273.15
  /** @source Buck 1981 eq. 8 with the ew coefficients. */
  const p = 611.21 * Math.exp((18.678 - tC / 234.5) * (tC / (257.14 + tC)))
  return Pa(p)
}

/**
 * Standard atmosphere state at a geopotential altitude.
 *
 * Throws below -1000 m or above 32 km rather than extrapolating. An
 * extrapolated atmosphere produces a number, and a number is exactly what a
 * caller will use.
 */
export const atmosphere = (
  geopotentialAltitude: Meters,
  options: AtmosphereOptions = {},
): AtmosphereState => {
  const h = geopotentialAltitude

  /** @derived Dead Sea shore is about -430 m; -1000 m is generous. */
  if (h < -1000 || h > MAX_ALTITUDE) {
    throw new RangeError(
      `Altitude ${h} m is outside the implemented ISA range of -1000 to ${MAX_ALTITUDE} m geopotential. ` +
        `Extrapolating the standard atmosphere produces a plausible number that is not the atmosphere.`,
    )
  }

  let standardTemperature: number
  let pressure: number

  if (h <= H_TROPOPAUSE) {
    standardTemperature = T0 - LAPSE * h
    pressure = P0 * (standardTemperature / T0) ** ((G0 * M_AIR) / (R_ISA * LAPSE))
  } else if (h <= H_STRATOSPHERE) {
    standardTemperature = T_TROPOPAUSE
    pressure = P_TROPOPAUSE * Math.exp((-G0 * M_AIR * (h - H_TROPOPAUSE)) / (R_ISA * T_TROPOPAUSE))
  } else {
    standardTemperature = T_TROPOPAUSE - LAPSE_2 * (h - H_STRATOSPHERE)
    pressure = P_STRATOSPHERE * (standardTemperature / T_TROPOPAUSE) ** ((G0 * M_AIR) / (R_ISA * LAPSE_2))
  }

  // The offset shifts temperature without shifting the pressure profile. That
  // is the standard convention for an "ISA+15 day" and it is an approximation:
  // a genuinely warmer column is also slightly taller, so pressure aloft would
  // rise a little. The error is second order against a first-order density
  // change, and treating it properly would require a sounding rather than an
  // offset.
  const temperature = standardTemperature + (options.temperatureOffset ?? 0)

  // Humidity. Partial pressures add, so the moist mixture's mean molar mass is
  // the mole-weighted average, and because water is lighter than air the
  // mixture is lighter than dry air at the same pressure and temperature.
  const rh = options.relativeHumidity ?? 0
  const vapourPressure = rh > 0 ? rh * saturationVapourPressure(K(temperature)) : 0
  const vapourFraction = vapourPressure / pressure
  const molarMass = M_AIR * (1 - vapourFraction) + MOLAR_MASS.water.value * vapourFraction

  const density = (pressure * molarMass) / (R_ISA * temperature)
  const speedOfSound = Math.sqrt((GAMMA_AIR * R_ISA * temperature) / molarMass)

  // Sutherland's law, mu = beta * T^1.5 / (T + S). Uses the mixture temperature
  // but dry-air coefficients: the humidity correction to viscosity is well under
  // 0.5 percent and no published coefficients for moist air exist at this
  // precision.
  // @source U.S. Standard Atmosphere 1976, eq. 51. The 1.5 exponent is part of
  // the law itself, not a fitted parameter.
  const dynamicViscosity = (SUTHERLAND_BETA * temperature ** 1.5) / (temperature + SUTHERLAND_S)

  return {
    altitude: h,
    temperature: K(temperature),
    pressure: Pa(pressure),
    density: kgPerM3(density),
    speedOfSound: mps(speedOfSound),
    dynamicViscosity: PaS(dynamicViscosity),
    molarMass,
  }
}

/**
 * Pressure altitude: the geopotential altitude at which ISA has a given
 * pressure. The exact inverse of `atmosphere`'s pressure profile, over the same
 * 0 to 32 km the forward function is valid on.
 *
 * This is what the gas cells actually respond to. A cell does not know its
 * altitude; it knows the pressure outside it, and fill fraction follows that.
 *
 * IT WAS NOT THE INVERSE ABOVE 20 KM. The docstring said "restricted to the
 * troposphere" while the body already handled the tropopause, and it handled
 * everything above the tropopause with the isothermal law, including the second
 * lapse layer where `atmosphere` uses a different one. Round-tripping a
 * pressure through the pair came back 57 m low at 25 km and 320 m low at 32 km,
 * silently, in the one direction the gas cells are actually driven from.
 */
export const pressureAltitude = (pressure: Pascals): Meters => {
  if (pressure > P0) {
    /** @derived Below sea level the troposphere formula still inverts cleanly. */
    return m((T0 / LAPSE) * (1 - (pressure / P0) ** ((R_ISA * LAPSE) / (G0 * M_AIR))))
  }
  if (pressure < P_STRATOSPHERE) {
    /**
     * @derived Inverting p = p20 * (T/T20)^(g0 M / (R L2)) for T, then the
     * layer's own T = T20 - L2*(H - H20) for H.
     *
     * LAPSE_2 IS NEGATIVE, matching the data package's convention that a lapse
     * rate is a positive number which gets SUBTRACTED, so a layer that warms
     * with altitude carries a negative one. Both signs here follow from that
     * and neither is free to be chosen.
     */
    const temperature =
      T_TROPOPAUSE * (pressure / P_STRATOSPHERE) ** ((R_ISA * LAPSE_2) / (G0 * M_AIR))
    return m(H_STRATOSPHERE + (T_TROPOPAUSE - temperature) / LAPSE_2)
  }
  if (pressure < P_TROPOPAUSE) {
    return m(
      H_TROPOPAUSE - ((R_ISA * T_TROPOPAUSE) / (G0 * M_AIR)) * Math.log(pressure / P_TROPOPAUSE),
    )
  }
  return m((T0 / LAPSE) * (1 - (pressure / P0) ** ((R_ISA * LAPSE) / (G0 * M_AIR))))
}
