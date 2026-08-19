import { CONSTANTS, ENVELOPE_CONVECTION, ENVELOPE_OPTICS, SKY, SOLAR, v } from '@airship/data'
import type { Kelvin, SquareMeters } from '@airship/units'
import { K } from '@airship/units'

/**
 * The hull's energy balance, and therefore superheat and supercooling.
 *
 * WHAT THIS REPLACES. The design was graded against `DESIGN_SUPERHEAT = 20`,
 * a literal described as "the standard figure for a dark envelope in still air
 * at midday". It sized the seawater ballast loop, the alighting gear and the
 * landing trim. Nothing computed it, so nothing could disagree with it, and it
 * had no counterpart: supercooling, which acts the other way and is the case
 * that drops the vehicle onto its float before dawn, had no value at all.
 *
 * THE GOVERNING EQUATIONS. The envelope is thin, with an areal thermal mass of
 * a few hundred J/(m2 K) against coefficients of order 10 W/(m2 K), so its own
 * time constant is under a minute and it is solved as quasi-steady:
 *
 *   alpha*(S_beam + S_diffuse + S_reflected)
 *     + eps*sigma*(F_sky*T_sky^4 + F_ground*T_ground^4)
 *     = eps*sigma*T_s^4 + h_ext*(T_s - T_air) + h_int*(T_s - T_gas)
 *
 * The gas is not thin. It carries the whole heat capacity of the lifting
 * volume and exchanges only across h_int, so it integrates:
 *
 *   m*c_p*dT_gas/dt = h_int*A*(T_s - T_gas)
 *
 * THE LAG IS THE POINT. With hydrogen's specific heat and a natural-convection
 * internal coefficient the gas time constant is tens of minutes, so peak
 * superheat arrives after solar noon and the gas is still warm at sunset. A
 * model that solves the whole thing as steady-state gets the peak roughly right
 * and the SHAPE wrong, and the shape is what the ballast loop has to track.
 *
 * VALIDITY. Clear sky, a hull in free air, no account of the fabric's own
 * conduction along the surface and no separate cell-by-cell temperature. It is
 * a lumped one-node gas model, which is the standard treatment for balloons and
 * is where the internal coefficient above comes from. It will not tell you
 * about a hot spot under the array.
 *
 * WHAT IT DOES NOT MODEL, AND SHOULD SAY SO: wind-driven mixing inside the
 * cells, which would raise h_int; the temperature difference between cells
 * fore and aft; and the ballonet air, which is at a different temperature from
 * the lifting gas and shares a wall with it.
 */

const SIGMA = v(CONSTANTS.sigma)

/** @derived Degrees to radians. */
const DEG = Math.PI / 180

/** @derived Hours in a day, and degrees of hour angle per hour. */
const HOURS_PER_DAY = 24
const DEGREES_PER_HOUR = 360 / HOURS_PER_DAY

/**
 * Solar declination, radians.
 *
 * @source Cooper's equation, as given in Duffie and Beckman. Accurate to about
 * 0.5 degrees, which is well inside everything else here.
 */
export const solarDeclination = (dayOfYear: number): number => {
  /** @derived Earth's axial tilt, degrees. */
  const AXIAL_TILT = 23.45
  /** @derived Cooper's phase: day 284 is the September equinox crossing. */
  const PHASE_DAY = 284
  /** @derived Days in the year Cooper's equation is written on. */
  const DAYS = 365
  return AXIAL_TILT * DEG * Math.sin(2 * Math.PI * ((PHASE_DAY + dayOfYear) / DAYS))
}

/**
 * Cosine of the solar zenith angle. Negative means the sun is below the horizon.
 *
 * @derived cos(z) = sin(lat)sin(dec) + cos(lat)cos(dec)cos(hour angle).
 */
export const solarZenithCosine = (
  latitude: number,
  dayOfYear: number,
  solarHour: number,
): number => {
  const declination = solarDeclination(dayOfYear)
  const hourAngle = (solarHour - HOURS_PER_DAY / 2) * DEGREES_PER_HOUR * DEG
  const lat = latitude * DEG
  return (
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
  )
}

export interface SolarIrradiance {
  /** Direct beam, normal to the sun, W/m2. */
  readonly directNormal: number
  /** Diffuse from the sky dome, on a horizontal surface, W/m2. */
  readonly diffuseHorizontal: number
  /** Total on a horizontal surface, W/m2, which is what the ground reflects. */
  readonly globalHorizontal: number
  /** Cosine of the zenith angle, clamped at zero. */
  readonly zenithCosine: number
}

/**
 * Irradiance at the hull, with cloud.
 *
 * @source Meinel's air-mass law, I_dn = I0 * tau^(AM^0.678), with AM = 1/cos(z).
 * It is the simplest form that reproduces clear-sky direct normal irradiance to
 * a few percent, and it fails gracefully: at low sun the air mass grows and the
 * beam collapses, which is the correct behaviour rather than an extrapolation.
 *
 * The air mass is capped because 1/cos(z) diverges at the horizon while the
 * real path length does not, the atmosphere being curved.
 *
 * CLOUD DIMS THE SUN AS WELL AS WARMING THE SKY, and leaving out the first half
 * of that inverts the answer: an early version of this module applied cloud
 * only to the sky's radiative temperature, so overcast came out with MORE
 * superheat than clear sky, which is the opposite of what an overcast day does.
 *
 * @source Kasten and Czeplak's relation for global horizontal irradiance under
 * cloud, G = G_clear * (1 - 0.75 * c^3.4). Under full overcast the beam is gone
 * and what remains is diffuse, so the split is shifted with the total.
 */
export const surfaceIrradiance = (
  latitude: number,
  dayOfYear: number,
  solarHour: number,
  cloudCover = 0,
): SolarIrradiance => {
  if (cloudCover < 0 || cloudCover > 1) {
    throw new RangeError(`Cloud cover ${cloudCover} is not a fraction of the sky.`)
  }
  const zenithCosine = Math.max(solarZenithCosine(latitude, dayOfYear, solarHour), 0)
  if (zenithCosine <= 0) {
    return { directNormal: 0, diffuseHorizontal: 0, globalHorizontal: 0, zenithCosine: 0 }
  }

  /** @source Kasten and Young cap the air mass near 38 at the horizon. */
  const MAXIMUM_AIR_MASS = 38
  const airMass = Math.min(1 / zenithCosine, MAXIMUM_AIR_MASS)
  /** @source Meinel's exponent on the air mass. */
  const MEINEL_EXPONENT = 0.678

  const clearDirectNormal =
    v(SOLAR.constant) * v(SOLAR.clearSkyTransmittance) ** airMass ** MEINEL_EXPONENT
  const clearBeamHorizontal = clearDirectNormal * zenithCosine
  const clearGlobal = clearBeamHorizontal * (1 + v(SOLAR.clearSkyDiffuseFraction))

  /** @source Kasten and Czeplak: the coefficient and the exponent both. */
  const CLOUD_ATTENUATION = 0.75
  /** @source Kasten and Czeplak's exponent on the cloud fraction. */
  const CLOUD_EXPONENT = 3.4
  const globalHorizontal = clearGlobal * (1 - CLOUD_ATTENUATION * cloudCover ** CLOUD_EXPONENT)

  // The beam survives in proportion to the clear sky remaining, and everything
  // else in the total is diffuse. At full overcast the beam is zero and the
  // hull sees only a uniformly bright dome.
  const beamHorizontal = clearBeamHorizontal * (1 - cloudCover)
  const directNormal = zenithCosine > 0 ? beamHorizontal / zenithCosine : 0
  const diffuseHorizontal = Math.max(globalHorizontal - beamHorizontal, 0)

  return { directNormal, diffuseHorizontal, globalHorizontal, zenithCosine }
}

/** Clear-sky irradiance, which is `surfaceIrradiance` with no cloud. */
export const clearSkyIrradiance = (
  latitude: number,
  dayOfYear: number,
  solarHour: number,
): SolarIrradiance => surfaceIrradiance(latitude, dayOfYear, solarHour, 0)

/**
 * Effective radiative temperature of a clear sky, K.
 *
 * @source Swinbank. This is the term that makes an envelope go BELOW ambient on
 * a clear night: the sky radiates as though it were 20 to 30 K colder than the
 * air, so a surface with high infrared emissivity loses more than convection
 * brings back.
 */
export const skyTemperature = (airTemperature: Kelvin): Kelvin =>
  /** @source Swinbank's exponent is 1.5, part of the relation and not fitted here. */
  K(v(SKY.swinbankCoefficient) * (airTemperature as number) ** 1.5)

/**
 * External convection coefficient, W/(m2 K).
 *
 * @source Turbulent flat-plate correlation Nu = 0.037 Re^0.8 Pr^(1/3), with the
 * hull length as the characteristic length. A hull at flight speed is firmly
 * turbulent, Re being of order 10^7 to 10^8.
 *
 * IT FLOORS AT THE FREE-CONVECTION VALUE, and this is the whole reason
 * superheat matters more for THIS vehicle than for a conventional airship. The
 * forced term collapses as airspeed goes to zero, and station-keeping is what
 * this design does. At eight metres a second over a 118 m hull this returns
 * about 11 W/(m2 K); in still air the free-convection floor is 2.5. A factor of
 * four, not the order of magnitude it is tempting to assume, because the
 * turbulent correlation only goes as the four-fifths power of speed.
 */
export const externalConvection = (
  airspeed: number,
  hullLength: number,
  kinematicViscosity: number,
): number => {
  const free = v(ENVELOPE_CONVECTION.freeConvectionCoefficient)
  if (airspeed <= 0 || hullLength <= 0) return free

  const reynolds = (airspeed * hullLength) / kinematicViscosity
  /** @source Turbulent flat plate, average Nusselt number. */
  /** @source Nu = 0.037 Re^0.8 Pr^(1/3). All three numbers are the correlation. */
  const nusselt = 0.037 * reynolds ** 0.8 * v(ENVELOPE_CONVECTION.airPrandtlNumber) ** (1 / 3)
  const forced = (nusselt * v(ENVELOPE_CONVECTION.airThermalConductivity)) / hullLength

  // Not added: the two mechanisms do not superpose, and taking the larger is
  // the standard treatment in the mixed-convection regime.
  return Math.max(free, forced)
}

export interface EnvelopeConditions {
  /** Ambient air temperature, K. */
  readonly airTemperature: Kelvin
  /** Ground or sea surface temperature, K. */
  readonly surfaceTemperature: Kelvin
  /** Airspeed over the hull, m/s. */
  readonly airspeed: number
  /** Hull length, m, for the convection correlation. */
  readonly hullLength: number
  /** Kinematic viscosity of the air, m2/s. */
  readonly kinematicViscosity: number
  /** Fraction of the hull's upper surface covered by photovoltaic module. */
  readonly arrayCoverage: number
  /** Electrical efficiency of that module: energy that leaves as power, not heat. */
  readonly arrayEfficiency: number
  /** Reflectance of the surface below, 0.06 for sea and 0.2 for land. */
  readonly surfaceAlbedo: number
  /** Fraction of the sky obscured by cloud, 0 for clear. */
  readonly cloudCover: number
}

/**
 * Steady envelope temperature for a given gas temperature, K.
 *
 * Solved by bisection rather than in closed form, because the T^4 term makes it
 * a quartic and the bracket is trivially known: the surface cannot be colder
 * than the sky nor hotter than the stagnation temperature of full sun with no
 * losses at all.
 */
export const envelopeTemperature = (
  gasTemperature: Kelvin,
  irradiance: SolarIrradiance,
  conditions: EnvelopeConditions,
): Kelvin => {
  const {
    airTemperature,
    surfaceTemperature,
    airspeed,
    hullLength,
    kinematicViscosity,
    arrayCoverage,
    arrayEfficiency,
    surfaceAlbedo,
    cloudCover,
  } = conditions

  if (arrayCoverage < 0 || arrayCoverage > 1) {
    throw new RangeError(`Array coverage ${arrayCoverage} is not a fraction of the hull.`)
  }
  if (cloudCover < 0 || cloudCover > 1) {
    throw new RangeError(`Cloud cover ${cloudCover} is not a fraction of the sky.`)
  }

  // Area-weighted optics. The array is nearly black in the solar band and the
  // cover is deliberately not, so the mix matters more than either alone.
  const absorptivity =
    arrayCoverage * v(ENVELOPE_OPTICS.arraySolarAbsorptivity) +
    (1 - arrayCoverage) * v(ENVELOPE_OPTICS.coverSolarAbsorptivity)
  const emissivity =
    arrayCoverage * v(ENVELOPE_OPTICS.arrayInfraredEmissivity) +
    (1 - arrayCoverage) * v(ENVELOPE_OPTICS.coverInfraredEmissivity)

  /**
   * @derived Mean projected area of a convex body is a quarter of its surface
   * area, by Cauchy's formula, so the beam lands on A/4 whatever the sun angle
   * and the hull's attitude. That is exactly the property that makes a
   * lumped model defensible for a body of revolution.
   */
  const BEAM_PROJECTION = 1 / 4
  /** @derived Sky and ground each fill half the view from a convex surface. */
  const HEMISPHERE = 1 / 2

  /**
   * Solar flux per unit of HULL area before anything absorbs it, W/m2.
   *
   * The three terms have different geometry and that is not a detail. A beam
   * couples through the mean projected area, A/4; isotropic diffuse from the
   * sky dome couples through A/2, because a convex body presents the same
   * projected area to every direction and the dome fills half the sphere.
   *
   * SO DIFFUSE IS TWICE AS EFFECTIVE AS BEAM PER UNIT OF HORIZONTAL IRRADIANCE,
   * and that is why this model's worst superheat case is BROKEN CLOUD rather
   * than clear sky: moderate cloud converts beam into diffuse while
   * Kasten-Czeplak says it barely touches the total, so the hull collects more
   * of a slightly smaller number. It is a real effect and it is worth stating
   * because it is counterintuitive, and because it turns on exactly these two
   * geometric factors: if you convince yourself both should be A/4, clear sky
   * becomes the design case again.
   */
  const geometricFlux =
    irradiance.directNormal * irradiance.zenithCosine * BEAM_PROJECTION +
    irradiance.diffuseHorizontal * HEMISPHERE +
    surfaceAlbedo * irradiance.globalHorizontal * HEMISPHERE

  // Electrical conversion is defined on the light INCIDENT on the module, not
  // on what the module absorbs, so it is taken off the flux over the covered
  // fraction rather than off the area-weighted absorption. Charging it against
  // the mixed absorptivity understated it by nearly three times, because the
  // cover the array is averaged with is deliberately reflective.
  const electrical = arrayCoverage * arrayEfficiency * geometricFlux
  const absorbed = absorptivity * geometricFlux - electrical

  // Cloud raises the sky's radiative temperature towards ambient, which is why
  // an overcast night does not supercool.
  const clear = skyTemperature(airTemperature) as number
  const effectiveSky = clear + cloudCover * ((airTemperature as number) - clear)

  const incomingInfrared =
    emissivity *
    SIGMA *
    (HEMISPHERE * effectiveSky ** 4 + HEMISPHERE * (surfaceTemperature as number) ** 4)

  const hExternal = externalConvection(airspeed, hullLength, kinematicViscosity)
  const hInternal = v(ENVELOPE_CONVECTION.internalCoefficient)

  const residual = (surface: number): number =>
    absorbed +
    incomingInfrared -
    emissivity * SIGMA * surface ** 4 -
    hExternal * (surface - (airTemperature as number)) -
    hInternal * (surface - (gasTemperature as number))

  /**
   * Newton, not bisection.
   *
   * The residual is strictly decreasing in the surface temperature: every loss
   * term grows with it and no gain term does. So the derivative never vanishes,
   * there is exactly one root, and Newton converges quadratically from any
   * start on the physical side. Bisection got the same answer in sixty
   * iterations instead of four, which was fine until the hull-sizing search
   * started calling this a few million times.
   *
   * @derived d/dT of the residual: -4*eps*sigma*T^3 - h_ext - h_int.
   */
  const slope = (surface: number): number =>
    -4 * emissivity * SIGMA * surface ** 3 - hExternal - hInternal

  /** @derived Converged when the step is below a millikelvin. */
  const TOLERANCE = 1e-3
  /** @derived Newton needs four; this is the guard, not the expectation. */
  const MAXIMUM_ITERATIONS = 40
  /** @derived Bracket, K. The root cannot lie outside this on any real day. */
  const LOWEST = 150
  /** @derived Upper bracket, K. */
  const HIGHEST = 500

  let surface = airTemperature as number
  for (let i = 0; i < MAXIMUM_ITERATIONS; i += 1) {
    const step = residual(surface) / slope(surface)
    surface = Math.min(Math.max(surface - step, LOWEST), HIGHEST)
    if (Math.abs(step) < TOLERANCE) break
  }
  return K(surface)
}

export interface DiurnalSample {
  /** Hours since local midnight. */
  readonly hour: number
  readonly gasTemperature: Kelvin
  readonly envelopeTemperature: Kelvin
  /** Gas minus ambient, K. Positive is superheat, negative is supercooling. */
  readonly superheat: number
}

export interface DiurnalCycle {
  readonly samples: readonly DiurnalSample[]
  /** Largest positive gas-minus-ambient over the day, K. */
  readonly peakSuperheat: number
  /** Hour at which it occurs. */
  readonly peakSuperheatHour: number
  /**
   * Largest NEGATIVE excursion, reported as a positive number of kelvin.
   *
   * THE HALF THE PROJECT DID NOT HAVE. Superheat lifts the ship and is answered
   * by valving or by ballast; supercooling drops it, and it drops it onto
   * whatever the ship is resting on.
   */
  readonly peakSupercooling: number
  readonly peakSupercoolingHour: number
  /** Peak-to-peak swing, K, which is what the ballast loop has to track. */
  readonly diurnalSwing: number
}

export interface DiurnalInput {
  readonly latitude: number
  readonly dayOfYear: number
  /** Lifting gas mass, kg. */
  readonly gasMass: number
  /** Specific heat of the lifting gas at constant volume, J/(kg K). */
  readonly gasSpecificHeat: number
  /** Envelope area exchanging heat with the gas, m2. */
  readonly envelopeArea: SquareMeters
  readonly conditions: EnvelopeConditions
  /** Diurnal air temperature swing, K, peak to peak. */
  readonly airTemperatureSwing?: number
}

/**
 * Integrate one day and report what the gas does.
 *
 * Explicit Euler on a system whose time constant is tens of minutes, stepped at
 * one minute, so the integration error is far below the uncertainty on the
 * internal convection coefficient. Two days are run and the second is reported,
 * because the first carries the arbitrary initial condition.
 */
export const diurnalThermalCycle = (input: DiurnalInput): DiurnalCycle => {
  const {
    latitude,
    dayOfYear,
    gasMass,
    gasSpecificHeat,
    envelopeArea,
    conditions,
    airTemperatureSwing = 0,
  } = input

  if (gasMass <= 0) throw new RangeError('A gas cell with no gas has no temperature to track.')
  /** @derived Degrees of latitude at the pole. */
  const POLE = 90
  if (Math.abs(latitude) > POLE) throw new RangeError(`Latitude ${latitude} is not on Earth.`)

  /** @derived One minute, in hours, and the seconds in it. */
  const STEP_HOURS = 1 / 60
  /** @derived Seconds in an hour. */
  const SECONDS_PER_HOUR = 3600
  const stepSeconds = STEP_HOURS * SECONDS_PER_HOUR
  const hInternal = v(ENVELOPE_CONVECTION.internalCoefficient)
  const capacity = gasMass * gasSpecificHeat
  /**
   * @derived tau = m*c_p / (h*A). THE REASON SUPERHEAT PEAKS AFTER NOON: on the
   * baseline it is about twenty minutes, so the gas is still climbing when the
   * sun has started down.
   */
  const timeConstant = capacity / (hInternal * (envelopeArea as number))

  const baseAir = conditions.airTemperature as number
  /**
   * @derived Air temperature is modelled as a sinusoid with its minimum at
   * dawn and its maximum in mid-afternoon, which is the observed shape and
   * matters because superheat is measured AGAINST it.
   */
  const PEAK_AIR_HOUR = 15
  /** @derived Quarter of a day, to put the sinusoid's peak at PEAK_AIR_HOUR. */
  const QUARTER_DAY = HOURS_PER_DAY / 4
  const airAt = (hour: number): number =>
    baseAir +
    (airTemperatureSwing / 2) *
      Math.sin(((hour - PEAK_AIR_HOUR + QUARTER_DAY) / HOURS_PER_DAY) * 2 * Math.PI)

  let gas = baseAir
  const samples: DiurnalSample[] = []

  /**
   * Spin-up, derived from the time constant rather than a whole discarded day.
   *
   * The gas starts at ambient, which is an arbitrary initial condition, so the
   * integration has to run long enough for it to be forgotten before anything
   * is recorded. That was a full extra day: 65 time constants, when 10 leaves
   * 5e-5 of the initial error. On a hull-sizing bisection, which re-runs this
   * for every candidate length, the wasted 20 hours were most of the cost.
   *
   * @derived exp(-10) = 4.5e-5 of the initial offset survives.
   */
  const SPIN_UP_TIME_CONSTANTS = 10
  const spinUpHours = Math.min(
    (SPIN_UP_TIME_CONSTANTS * timeConstant) / SECONDS_PER_HOUR,
    HOURS_PER_DAY,
  )

  for (let hour = -spinUpHours; hour < HOURS_PER_DAY; hour += STEP_HOURS) {
    // The spin-up runs through the previous day's clock, so the gas arrives at
    // local midnight having already seen a night.
    const clockHour = ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY
    const air = airAt(clockHour)
    const stepConditions: EnvelopeConditions = {
      ...conditions,
      airTemperature: K(air),
      surfaceTemperature: K((conditions.surfaceTemperature as number) + (air - baseAir)),
    }
    const irradiance = surfaceIrradiance(latitude, dayOfYear, clockHour, conditions.cloudCover)
    const surface = envelopeTemperature(K(gas), irradiance, stepConditions)

    if (hour >= 0) {
      samples.push({
        hour: clockHour,
        gasTemperature: K(gas),
        envelopeTemperature: surface,
        superheat: gas - air,
      })
    }

    // EXACT for the gas node, not forward Euler.
    //
    // The node is linear: dT/dt = (T_surface - T)/tau, so over a step with the
    // surface held at its current value the solution is closed form. Euler
    // approximates that exponential by its tangent, which is why it needed a
    // one-minute step against a twenty-minute time constant to stay accurate.
    //
    // The scheme is still first order in the coupling, because the surface is
    // recomputed from the gas at the start of each step, but it is exact in the
    // stiff part and unconditionally stable, so the step is set by how fast the
    // SUN moves rather than by numerical stability.
    gas = (surface as number) + (gas - (surface as number)) * Math.exp(-stepSeconds / timeConstant)
  }

  let peakSuperheat = -Infinity
  let peakSuperheatHour = 0
  let peakSupercooling = -Infinity
  let peakSupercoolingHour = 0
  for (const sample of samples) {
    if (sample.superheat > peakSuperheat) {
      peakSuperheat = sample.superheat
      peakSuperheatHour = sample.hour
    }
    if (-sample.superheat > peakSupercooling) {
      peakSupercooling = -sample.superheat
      peakSupercoolingHour = sample.hour
    }
  }

  return {
    samples,
    peakSuperheat,
    peakSuperheatHour,
    peakSupercooling,
    peakSupercoolingHour,
    diurnalSwing: peakSuperheat + peakSupercooling,
  }
}

export interface ThermalDesignCase {
  /** Worst positive excursion over the swept conditions, K. */
  readonly superheat: number
  /** Cloud cover at which it occurs. */
  readonly superheatCloudCover: number
  /** Worst negative excursion, reported positive, K. */
  readonly supercooling: number
  readonly supercoolingCloudCover: number
  /**
   * Peak to peak, K. THIS IS THE NUMBER THE BALLAST LOOP HAS TO TRACK, and it
   * is not the superheat: the loop has to take the ship from its hottest state
   * to its coldest, and those happen under different skies twelve hours apart.
   */
  readonly swing: number
}

/**
 * The worst thermal case, swept rather than asserted.
 *
 * Cloud cover is swept because the answer is NOT MONOTONIC in it and the design
 * case is interior. Clear sky gives the worst supercooling, because the sky is
 * coldest; broken cloud around 0.6 gives the worst superheat, because it turns
 * beam into diffuse and diffuse couples to a convex hull twice as well. Taking
 * either endpoint alone understates the vehicle's ballast requirement.
 */
/** @derived Cloud fractions swept. Twenty steps resolves the interior peak. */
const DEFAULT_CLOUD_STEPS = 20

export const designThermalCase = (
  input: DiurnalInput,
  steps = DEFAULT_CLOUD_STEPS,
): ThermalDesignCase => {
  if (steps < 1) throw new RangeError('A sweep needs at least one step.')

  let superheat = -Infinity
  let superheatCloudCover = 0
  let supercooling = -Infinity
  let supercoolingCloudCover = 0

  for (let i = 0; i <= steps; i += 1) {
    const cloudCover = i / steps
    const cycle = diurnalThermalCycle({
      ...input,
      conditions: { ...input.conditions, cloudCover },
    })
    if (cycle.peakSuperheat > superheat) {
      superheat = cycle.peakSuperheat
      superheatCloudCover = cloudCover
    }
    if (cycle.peakSupercooling > supercooling) {
      supercooling = cycle.peakSupercooling
      supercoolingCloudCover = cloudCover
    }
  }

  return {
    superheat,
    superheatCloudCover,
    supercooling,
    supercoolingCloudCover,
    swing: superheat + supercooling,
  }
}
