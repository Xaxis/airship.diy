import { v, CONSTANTS, GAS, HYDROGEN_SAFETY, ISA, VENTILATION } from '@airship/data'
import type { CubicMeters, Meters } from '@airship/units'

/**
 * Hydrogen hazard control: ventilation, confinement, and what the geometry has
 * to obey.
 *
 * The design rules here are quantitative and they fall out of two numbers.
 *
 * FIRST, THE VENTILATION RATE. IEC 60079-10-1:2020 Edition 3 works from a
 * background concentration rather than Edition 2's direct formula, and the two
 * do not agree, so the edition is stated at every call site. The target is a
 * quarter of the lower flammability limit, which for hydrogen is 1 percent by
 * volume.
 *
 * SECOND, THE DUCT SIZE. A confined detonation survives into an unconfined
 * space only if the passage is wider than about 13 detonation cell widths for a
 * CIRCULAR tube, or 10 for a SQUARE OR RECTANGULAR one. For hydrogen that is
 * 195 mm circular and 150 mm rectangular. For methane the same rule gives 4.3 m.
 * Almost every confined run on an airship is rectangular, so 150 mm is the
 * number that actually applies and using the circular figure is
 * non-conservative by 30 percent.
 *
 * That gives a geometric design rule that costs nothing at the drawing stage
 * and is close to impossible to retrofit: keep every confined run either under
 * 150 mm across, or under the 10 m deflagration run-up length, or open at both
 * ends to the free stream.
 *
 * WHAT GEOMETRY NO LONGER BUYS YOU. An earlier version of this module argued
 * that direct detonation was not a credible initiating event, because it needs
 * 4.16 MJ and nothing aboard can deliver that. The figure was wrong by three
 * orders of magnitude: it is 4.3 kJ. A capacitor bank, a high-energy DC bus
 * fault or an arcing contactor reaches that, so direct initiation IS credible
 * and the geometric rules above are necessary rather than sufficient. Bounding
 * bus fault energy is now a safety item, not a reliability one.
 */

/** @source ISA sea level temperature and pressure, the default interstitial condition. */
const DEFAULT_TEMPERATURE = v(ISA.seaLevelTemperature)
/** @source Standard atmosphere, exact by definition. */
const DEFAULT_PRESSURE = v(ISA.seaLevelPressure)

/**
 * Ventilation flow needed to hold the background concentration at the dilution
 * criterion, m3/s.
 *
 * @derived IEC 60079-10-1:2020 eq. C.1: Xb = f * Qg / (Qg + Q2), solved for the
 * ventilation flow Q2 given a target background Xb and a release rate Qg:
 *
 *   Q2 = Qg * (f / Xb - 1)
 *
 * @param leakRate Hydrogen mass release rate, kg/s. Use the modelled permeation
 *   flux PLUS a design leak, not permeation alone: permeation is the rate you
 *   know about and a chafed cell is the one that matters.
 * @param gasTemperature Interstitial temperature, K, for the volumetric rate.
 */
export const requiredVentilationFlow = (
  leakRate: number,
  gasTemperature = DEFAULT_TEMPERATURE,
  ambientPressure = DEFAULT_PRESSURE,
): number => {
  /** @source Ideal gas law at the interstitial condition; hydrogen is ideal here. */
  const R = v(CONSTANTS.R)
  const hydrogenDensity = (ambientPressure * GAS.hydrogen.molarMass) / (R * gasTemperature)

  const volumetricRelease = leakRate / hydrogenDensity
  const target = v(VENTILATION.dilutionCriterion) * v(HYDROGEN_SAFETY.lowerFlammabilityLimit)
  const f = v(VENTILATION.inefficiencyFactor)

  return volumetricRelease * (f / target - 1)
}

/** @derived Seconds per hour. */
const SECONDS_PER_HOUR = 3600

/** Air changes per hour equivalent, for a space of a given volume. */
export const airChangesPerHour = (ventilationFlow: number, volume: CubicMeters): number =>
  /** @derived Volumetric flow over volume, converted from per-second to per-hour. */
  (ventilationFlow / volume) * SECONDS_PER_HOUR

export type CrossSection = 'circular' | 'rectangular'

/**
 * Largest confined passage that cannot launch an unconfined detonation.
 *
 * @derived critical size = ratio * detonation cell size, where the ratio is 13
 * for a circular tube and 10 for a square or rectangular passage. Below it, a
 * detonation running down the passage decays on exit instead of transitioning
 * to a spherical unconfined one.
 *
 * 195 mm circular, 150 mm rectangular. Rectangular is the default because
 * cable trunks, keel walkways and ventilation ducts are rectangular, and taking
 * the circular figure for them is non-conservative by 30 percent.
 */
export const criticalDuctDiameter = (crossSection: CrossSection = 'rectangular'): number =>
  (crossSection === 'circular'
    ? v(HYDROGEN_SAFETY.criticalTubeDiameterRatio)
    : v(HYDROGEN_SAFETY.criticalRectangularPassageRatio)) * v(HYDROGEN_SAFETY.detonationCellSize)

export interface ConfinementVerdict {
  readonly safe: boolean
  readonly reason: string
}

/**
 * Whether a confined run can support a detonation.
 *
 * Three independent ways to be safe, and any one is sufficient:
 *   - narrower than the critical tube diameter, so a detonation cannot exit;
 *   - shorter than the deflagration run-up distance, so one cannot develop;
 *   - open at both ends to the free stream, so the gas never accumulates.
 *
 * The function returns which one applies, because "safe" without a reason
 * cannot be reviewed and cannot survive a design change.
 */
export const assessConfinement = (
  diameter: Meters,
  length: Meters,
  openToFreeStream: boolean,
  crossSection: CrossSection = 'rectangular',
): ConfinementVerdict => {
  if (openToFreeStream) {
    return {
      safe: true,
      reason:
        'Open at both ends to the free stream, so hydrogen cannot accumulate to a flammable concentration.',
    }
  }

  const critical = criticalDuctDiameter(crossSection)
  if (diameter < critical) {
    return {
      safe: true,
      reason: `Diameter ${(diameter * 1000).toFixed(0)} mm is below the ${(critical * 1000).toFixed(0)} mm critical tube diameter, so a detonation decays on exit rather than transitioning to an unconfined one.`,
    }
  }

  const runUp = v(HYDROGEN_SAFETY.ddtRunUpDistance)
  if (length < runUp) {
    return {
      safe: true,
      reason: `Length ${length.toFixed(1)} m is below the ${runUp} m deflagration run-up distance, so a deflagration cannot accelerate to transition.`,
    }
  }

  return {
    safe: false,
    reason:
      `A ${(diameter * 1000).toFixed(0)} mm by ${length.toFixed(1)} m closed run is wider than the ` +
      `${(critical * 1000).toFixed(0)} mm critical tube diameter AND longer than the ${runUp} m run-up ` +
      `distance. This geometry can accelerate a deflagration to detonation and then launch it into the ` +
      `surrounding volume. Narrow it, shorten it, or open it.`,
  }
}

/**
 * Oxygen fraction below which no hydrogen-air-nitrogen mixture will burn.
 *
 * The quantitative target for nitrogen inerting the interstitial space, and the
 * alternative to ventilating it.
 *
 * THE TRADE THE SAFETY CASE MUST OWN: inerting suppresses ignition and makes
 * PURITY WORSE, because it raises the nitrogen partial pressure outside the
 * cells and therefore the inward leakage that destroys lift. The permeation
 * module models that explicitly rather than letting the safety case be free.
 */
export const inertingOxygenTarget = (): number => v(HYDROGEN_SAFETY.limitingOxygenIndex)

/** @source IEC 60079-20-1 section 4.2: IIA above 0.9 mm, IIB 0.5 to 0.9, IIC below 0.5. */
const GROUP_IIB_UPPER_MESG = 0.9e-3

/**
 * Equipment group required for electrical apparatus in a hydrogen atmosphere.
 *
 * Returns IIC for hydrogen, which is the strictest, because its maximum
 * experimental safe gap of 0.30 mm falls below the 0.5 mm group threshold.
 *
 * The practical consequence is a purchasing constraint rather than a design
 * one: almost every off-the-shelf flameproof enclosure and flame arrestor is
 * rated IIA or IIB and will NOT contain a hydrogen flame. Ordinary flame
 * arrestors do not work, and the number that says so is MESG rather than the
 * quenching distance usually cited.
 */
export const equipmentGroup = (): 'IIA' | 'IIB' | 'IIC' => {
  const mesg = v(HYDROGEN_SAFETY.maximumExperimentalSafeGap)
  if (mesg < v(HYDROGEN_SAFETY.groupIICThreshold)) return 'IIC'
  if (mesg < GROUP_IIB_UPPER_MESG) return 'IIB'
  return 'IIA'
}

/**
 * How long an unconfined leak takes to clear a given height by buoyancy alone.
 *
 * The number the whole safety argument rests on. At the published rise velocity
 * a leak clears the height of the hull in a few seconds, which is why an open
 * structure is survivable and a closed compartment is not.
 */
export const buoyantClearanceTime = (height: Meters): number =>
  height / v(HYDROGEN_SAFETY.buoyantRiseVelocity)
