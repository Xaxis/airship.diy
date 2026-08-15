import { CONSTANTS, ISA, PHOTOVOLTAIC, v } from '@airship/data'
import type { Meters, Radians, SquareMeters, Watts, WattsPerSquareMeter } from '@airship/units'
import { W, WPerM2 } from '@airship/units'
import { atmosphere } from './atmosphere.js'
import type { HullShape } from './geometry/hull.js'
import { CONVENTIONAL_HULL, hullRadiusAt } from './geometry/hull.js'

/**
 * Solar irradiance, and its collection on a curved hull.
 *
 * The second half of that sentence is where naive models go wrong, and the
 * error is large and always in the flattering direction.
 *
 * A cylinder or an airship hull is not a flat panel. Every surface element has
 * its own normal, so every element sees the sun at its own incidence angle, and
 * cosine losses on a doubly curved surface are severe. Taking the projected
 * plan area and multiplying by module efficiency, which is what a flat-plate
 * approximation does, overstates collection substantially. The projected area
 * is the right number for how much sunlight the hull INTERCEPTS; it is the
 * wrong number for how much a conformal array on that hull CONVERTS, because
 * the array is not oriented normal to the sun and cannot be.
 *
 * So this module integrates over the actual surface, element by element, with
 * the real normal. `naiveFlatPlate` and `projectedAreaEstimate` sit alongside it
 * so the size of the error is visible rather than assumed.
 */

export interface SolarPosition {
  /** Angle above the horizon. Negative at night. */
  readonly elevation: Radians
  /** Bearing from true north, clockwise. */
  readonly azimuth: Radians
  /** Optical path length relative to a vertical path at sea level. */
  readonly airMass: number
}

export interface SolarIrradiance extends SolarPosition {
  /** Beam irradiance on a surface normal to the sun. */
  readonly directNormal: WattsPerSquareMeter
  /** Isotropic diffuse irradiance from the sky dome. */
  readonly diffuseHorizontal: WattsPerSquareMeter
  /** Total on a horizontal surface, for comparison with published data. */
  readonly globalHorizontal: WattsPerSquareMeter
}

/**
 * Solar declination.
 *
 * @source Cooper, P. I. (1969), "The absorption of solar radiation in solar
 *   stills", Solar Energy 12(3). Accurate to about 0.5 degrees, which is well
 *   inside the uncertainty of everything downstream of it.
 */
export const declination = (dayOfYear: number): Radians => {
  /** @source Cooper 1969: 23.45 deg amplitude, phase referenced to the equinox. */
  const amplitude = (23.45 * Math.PI) / 180
  /** @source Cooper 1969: day 284 is the ascending equinox crossing in this form. */
  return (amplitude * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365.25)) as Radians
}

/**
 * Position of the sun in the local horizontal frame.
 *
 * @param latitude Positive north.
 * @param dayOfYear 1 to 365.
 * @param solarHour Local apparent solar time, 0 to 24. Solar noon is 12. The
 *   equation of time is not applied: it shifts solar noon by up to 16 minutes,
 *   which moves the daily energy total by well under a percent.
 */
export const solarPosition = (
  latitude: Radians,
  dayOfYear: number,
  solarHour: number,
): SolarPosition => {
  const dec = declination(dayOfYear)
  /** @derived The Earth turns 15 degrees per hour, so the hour angle is 15*(t-12). */
  const hourAngle = ((solarHour - 12) * 15 * Math.PI) / 180

  const sinElevation =
    Math.sin(latitude) * Math.sin(dec) + Math.cos(latitude) * Math.cos(dec) * Math.cos(hourAngle)
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation)))

  // @derived Guard against division by zero when the sun is exactly overhead,
  // where azimuth is undefined and any value is as good as another.
  const cosAzimuth =
    (Math.sin(dec) * Math.cos(latitude) - Math.cos(dec) * Math.sin(latitude) * Math.cos(hourAngle)) /
    Math.max(Math.cos(elevation), 1e-9)
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)))
  // Before solar noon the sun is east of the meridian.
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth

  return {
    elevation: elevation as Radians,
    azimuth: azimuth as Radians,
    airMass: airMass(elevation as Radians),
  }
}

/**
 * Relative optical air mass.
 *
 * @source Kasten, F. and Young, A. T. (1989), "Revised optical air mass tables
 *   and approximation formula", Applied Optics 28(22), 4735-4738.
 *
 * The naive 1/sin(elevation) diverges at the horizon and is already 10 percent
 * wrong at 10 degrees elevation, which matters for a vehicle whose whole
 * argument depends on the daily energy integral including the shoulders.
 */
export const airMass = (elevation: Radians): number => {
  if (elevation <= 0) return Infinity
  const degrees = (elevation * 180) / Math.PI
  /** @source Kasten and Young 1989, eq. 3. */
  return 1 / (Math.sin(elevation) + 0.50572 * (degrees + 6.07995) ** -1.6364)
}

/**
 * Clear-sky irradiance at altitude.
 *
 * The atmospheric transmission model is the classic Meinel form, with the air
 * mass scaled by the pressure ratio so that altitude reduces the optical path.
 * At 4,000 m there is about 40 percent less atmosphere overhead than at sea
 * level, which is a real and useful gain: this vehicle collects better than a
 * ground installation at the same latitude.
 *
 * Clear sky only. Cloud is handled by the mission module as a statistical
 * derate, because a deterministic cloud model would be false precision.
 */
export const solarIrradiance = (
  latitude: Radians,
  dayOfYear: number,
  solarHour: number,
  altitude: Meters,
): SolarIrradiance => {
  const position = solarPosition(latitude, dayOfYear, solarHour)

  if (position.elevation <= 0) {
    return {
      ...position,
      directNormal: WPerM2(0),
      diffuseHorizontal: WPerM2(0),
      globalHorizontal: WPerM2(0),
    }
  }

  // Orbital eccentricity: the Earth is 3.3 percent closer to the sun in January
  // than in July, which is a 6.6 percent swing in irradiance and is larger than
  // most of the effects this model argues about.
  /** @source Duffie and Beckman, Solar Engineering of Thermal Processes, eq. 1.4.1a. */
  const eccentricity = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365.25)
  const extraterrestrial = v(CONSTANTS.solarConstant) * eccentricity

  // Pressure-scaled air mass. Less atmosphere above means a shorter path.
  const pressureRatio = atmosphere(altitude).pressure / ISA.seaLevelPressure.value
  const effectiveAirMass = position.airMass * pressureRatio

  /**
   * @source Meinel, A. B. and Meinel, M. P. (1976), Applied Solar Energy.
   * Clear-sky beam transmission tau = 0.7^(AM^0.678). A single-parameter fit,
   * appropriate for a clear maritime atmosphere and deliberately not tuned.
   */
  const transmission = 0.7 ** effectiveAirMass ** 0.678
  const directNormal = extraterrestrial * transmission

  /**
   * Diffuse, as a fraction of the beam depleted by the atmosphere. Roughly a
   * tenth of the extraterrestrial beam on a clear day, rising as air mass rises.
   * @source Duffie and Beckman, clear-sky diffuse correlation, simplified.
   */
  const diffuseHorizontal = 0.1 * extraterrestrial * Math.sin(position.elevation) * (1 - transmission)

  return {
    ...position,
    directNormal: WPerM2(directNormal),
    diffuseHorizontal: WPerM2(diffuseHorizontal),
    globalHorizontal: WPerM2(directNormal * Math.sin(position.elevation) + diffuseHorizontal),
  }
}

export interface ArrayLayout {
  readonly length: Meters
  readonly finenessRatio: number
  /**
   * Half-angle of the covered band, measured from the top of the hull.
   *
   * PI/2 covers the entire upper hemisphere. Going below that puts modules on
   * surfaces that face downward, which collect almost nothing and cost their
   * full areal mass, so the optimum is well under 90 degrees and the model
   * finds it rather than assuming it.
   */
  readonly coverageHalfAngle: Radians
  /** Fractional stations between which modules are fitted. */
  readonly forwardStation: number
  readonly aftStation: number
  readonly shape?: HullShape
}

export interface ArrayOutput {
  /** Electrical power from the array. */
  readonly power: Watts
  /** Surface area actually covered by modules. */
  readonly coveredArea: SquareMeters
  /**
   * Mean conversion of covered area, W/m2. Compare against the direct normal
   * irradiance to see the cosine penalty the curvature imposes.
   */
  readonly meanFlux: WattsPerSquareMeter
  /** Fraction of covered area that is illuminated at all. */
  readonly illuminatedFraction: number
}

/**
 * Panel counts for the surface integral.
 *
 * The integrand is smooth over the covered band, so this converges quickly.
 * 48 by 48 agrees with 120 by 120 to better than 0.2 percent on daily energy,
 * and the annual balance evaluates this integral about fifty thousand times per
 * design point, so the difference between the two is the difference between a
 * model you can sweep and one you can only run overnight.
 * @derived Quadrature resolution, checked for convergence in the tests.
 */
const AXIAL_PANELS = 48
/** @derived Same convergence argument as AXIAL_PANELS. */
const AZIMUTHAL_PANELS = 48

/** @source Photovoltaic modules are rated at 25 C cell temperature (STC). */
const RATING_TEMPERATURE = 298.15

/**
 * Clamp keeping the slope difference away from the nose and tail, where the
 * profile is zero and its derivative is unbounded.
 * @derived Numerical guard, not a physical quantity.
 */
const EDGE = 1e-6

/** @derived Hours in a day, for the daily energy integral. */
const HOURS_PER_DAY = 24

/**
 * Precomputed surface discretisation for one array layout.
 *
 * The hull geometry does not change between one hour of the day and the next,
 * but the naive structure recomputes every radius, slope and area every time
 * the sun moves. Hoisting it out turns the inner loop into three multiplies and
 * an add, which is what makes a 365-day balance tractable.
 */
interface Panel {
  readonly nx: number
  readonly ny: number
  readonly nz: number
  readonly area: number
}

const panelCache = new Map<string, readonly Panel[]>()

const panelsFor = (layout: ArrayLayout): readonly Panel[] => {
  const shape = layout.shape ?? CONVENTIONAL_HULL
  const key = [
    layout.length,
    layout.finenessRatio,
    layout.coverageHalfAngle,
    layout.forwardStation,
    layout.aftStation,
    shape.noseExponent,
    shape.tailExponent,
    shape.coefficients.join(','),
  ].join('|')

  const cached = panelCache.get(key)
  if (cached) return cached

  const panels: Panel[] = []
  const dStation = (layout.aftStation - layout.forwardStation) / AXIAL_PANELS
  const dTheta = (2 * layout.coverageHalfAngle) / AZIMUTHAL_PANELS

  for (let i = 0; i < AXIAL_PANELS; i += 1) {
    const station = layout.forwardStation + (i + 0.5) * dStation
    const radius = hullRadiusAt(layout.length, layout.finenessRatio, station, shape)
    if (radius <= 0) continue

    // @derived Central difference for the axial slope, clamped away from the
    // endpoints by 1e-6 where the profile is zero and the slope is unbounded.
    const h = 0.5 / AXIAL_PANELS
    const rForward = hullRadiusAt(layout.length, layout.finenessRatio, Math.max(station - h, EDGE), shape)
    const rAft = hullRadiusAt(layout.length, layout.finenessRatio, Math.min(station + h, 1 - EDGE), shape)
    const slope = (rAft - rForward) / (2 * h * layout.length)
    const stretch = Math.sqrt(1 + slope * slope)
    const normalScale = 1 / stretch
    const area = radius * stretch * dStation * layout.length * dTheta

    for (let jj = 0; jj < AZIMUTHAL_PANELS; jj += 1) {
      const theta = -layout.coverageHalfAngle + (jj + 0.5) * dTheta
      panels.push({
        nx: -slope * normalScale,
        ny: Math.sin(theta) * normalScale,
        nz: Math.cos(theta) * normalScale,
        area,
      })
    }
  }

  panelCache.set(key, panels)
  return panels
}

/**
 * Integrate array output over the hull surface, element by element.
 *
 * Body frame: X forward, Y starboard, Z up. For a body of revolution of radius
 * r(X), a surface point at azimuth theta from the top is
 *
 *   P = (X, r sin(theta), r cos(theta))
 *
 * and the outward normal, from the cross product of the parametric tangents, is
 *
 *   n proportional to (-dr/dX, sin(theta), cos(theta))
 *
 * with area element dA = r * sqrt(1 + (dr/dX)^2) dX dtheta.
 *
 * @param heading Ship heading, radians clockwise from north. It matters: a hull
 *   beam-on to the sun collects noticeably more than one pointed at it, because
 *   the flanks are what face the sun rather than the fine ends.
 */
export const arrayOutput = (
  layout: ArrayLayout,
  irradiance: SolarIrradiance,
  heading: Radians,
  ambientTemperature: number,
  moduleEfficiency = v(PHOTOVOLTAIC.cigsEfficiency),
): ArrayOutput => {
  const panels = panelsFor(layout)
  const totalArea = panels.reduce((sum, p) => sum + p.area, 0)

  if (irradiance.elevation <= 0) {
    return {
      power: W(0),
      coveredArea: totalArea as SquareMeters,
      meanFlux: WPerM2(0),
      illuminatedFraction: 0,
    }
  }

  // Sun unit vector in the body frame.
  const relativeAzimuth = irradiance.azimuth - heading
  const sunX = Math.cos(irradiance.elevation) * Math.cos(relativeAzimuth)
  const sunY = Math.cos(irradiance.elevation) * Math.sin(relativeAzimuth)
  const sunZ = Math.sin(irradiance.elevation)

  const temperatureCoefficient = v(PHOTOVOLTAIC.temperatureCoefficient)

  let power = 0
  let illuminated = 0

  for (const panel of panels) {
    const cosIncidence = panel.nx * sunX + panel.ny * sunY + panel.nz * sunZ

    // Isotropic sky view factor for a tilted element: (1 + cos(tilt))/2, where
    // cos(tilt) is the vertical component of the normal.
    const diffuse = irradiance.diffuseHorizontal * ((1 + panel.nz) / 2)

    const beam = cosIncidence > 0 ? irradiance.directNormal * cosIncidence : 0
    if (beam > 0) illuminated += panel.area

    const flux = beam + diffuse

    // Cell temperature rises with absorbed flux. A dark hull in the tropics runs
    // hot, and the module loses about 0.35 percent per kelvin.
    /** @source NOCT convention: 800 W/m2 of incident flux raises the cell 25 K above ambient. */
    // @source NOCT convention: 800 W/m2 of incident flux raises the cell 25 K
    // above ambient, and modules are rated at 298.15 K (25 C) cell temperature.
    const cellTemperature = ambientTemperature + (flux / 800) * 25
    const derate = 1 + temperatureCoefficient * (cellTemperature - RATING_TEMPERATURE)

    power += flux * moduleEfficiency * Math.max(derate, 0) * panel.area
  }

  return {
    power: W(power),
    coveredArea: totalArea as SquareMeters,
    meanFlux: WPerM2(totalArea > 0 ? power / totalArea : 0),
    illuminatedFraction: totalArea > 0 ? illuminated / totalArea : 0,
  }
}

/** Covered surface area alone, without running the irradiance integral. */
export const coveredArea = (layout: ArrayLayout): SquareMeters =>
  panelsFor(layout).reduce((sum, p) => sum + p.area, 0) as SquareMeters

/**
 * Energy collected over one day, by integrating the array output through the
 * daylight hours.
 *
 * Sampled every ten minutes with the midpoint rule. Finer sampling changes the
 * daily total by well under a tenth of a percent, because the integrand is
 * smooth away from sunrise and sunset and both endpoints contribute almost
 * nothing.
 *
 * Heading is held fixed through the day, which is the pessimistic assumption. A
 * ship that deliberately turned beam-on to the sun would do better, and that is
 * a real control input this model can later be asked to exploit.
 */
export const dailyArrayEnergy = (
  layout: ArrayLayout,
  latitude: Radians,
  dayOfYear: number,
  altitude: Meters,
  heading: Radians,
  ambientTemperature: number,
  moduleEfficiency = v(PHOTOVOLTAIC.cigsEfficiency),
): { energy: number; peakPower: Watts; daylightHours: number } => {
  /** @derived Ten-minute sampling: 144 steps over a 24 hour day. */
  const steps = 144
  const dt = HOURS_PER_DAY / steps

  let energy = 0
  let peakPower = 0
  let daylightHours = 0

  for (let i = 0; i < steps; i += 1) {
    const hour = (i + 0.5) * dt
    const irradiance = solarIrradiance(latitude, dayOfYear, hour, altitude)
    if (irradiance.elevation <= 0) continue

    daylightHours += dt
    const output = arrayOutput(layout, irradiance, heading, ambientTemperature, moduleEfficiency)
    // @derived Hours to seconds.
    energy += output.power * dt * 3600
    peakPower = Math.max(peakPower, output.power)
  }

  return { energy, peakPower: W(peakPower), daylightHours }
}

/**
 * The naive estimate, kept so the size of the error is visible.
 *
 *   power = covered surface area * global horizontal irradiance * efficiency
 *
 * This is the mistake people actually make: "the hull has 2,000 square metres
 * of upper surface, at 1,000 W/m2 and 17 percent that is 340 kW". It treats a
 * doubly curved surface as though every square metre of it faced the sun, and
 * it overstates output by roughly a factor of two.
 *
 * A NOTE ON WHAT IS AND IS NOT THE PROBLEM, because it is easy to draw the
 * wrong lesson here. Projecting the covered band onto the plane normal to the
 * sun and multiplying by the direct normal irradiance is not an approximation
 * at all: it is exactly right for the beam component, since the surface
 * integral of the incidence cosine IS the projected area. When the sun is
 * overhead, projecting onto the horizontal and using global horizontal
 * irradiance therefore agrees with the full integral to within the diffuse and
 * temperature terms.
 *
 * The real subtleties are the ones that survive that observation: the
 * projection must be onto the plane normal to the SUN rather than the
 * horizontal, self-shaded elements must be excluded rather than allowed to
 * contribute negatively, each element sees its own slice of the sky dome for
 * the diffuse term, and cell temperature varies across the hull because
 * absorbed flux does. That is why this module integrates.
 */
export const naiveFlatPlate = (
  layout: ArrayLayout,
  irradiance: SolarIrradiance,
  moduleEfficiency = v(PHOTOVOLTAIC.cigsEfficiency),
): Watts => W(coveredArea(layout) * irradiance.globalHorizontal * moduleEfficiency)

/**
 * Projected-area estimate: the covered band projected onto the plane normal to
 * the sun, times direct normal irradiance.
 *
 * Nearly exact for the beam component, and included so the tests can assert
 * that the full integral agrees with it once diffuse and temperature are
 * accounted for. A disagreement here would mean the surface normals are wrong,
 * which is the failure mode most likely to go unnoticed.
 */
export const projectedAreaEstimate = (
  layout: ArrayLayout,
  irradiance: SolarIrradiance,
  heading: Radians,
  moduleEfficiency = v(PHOTOVOLTAIC.cigsEfficiency),
): Watts => {
  if (irradiance.elevation <= 0) return W(0)

  const relativeAzimuth = irradiance.azimuth - heading
  const sunX = Math.cos(irradiance.elevation) * Math.cos(relativeAzimuth)
  const sunY = Math.cos(irradiance.elevation) * Math.sin(relativeAzimuth)
  const sunZ = Math.sin(irradiance.elevation)

  let projected = 0
  for (const panel of panelsFor(layout)) {
    const cosIncidence = panel.nx * sunX + panel.ny * sunY + panel.nz * sunZ
    if (cosIncidence > 0) projected += cosIncidence * panel.area
  }

  return W(projected * irradiance.directNormal * moduleEfficiency)
}
