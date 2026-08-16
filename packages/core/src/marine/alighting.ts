import type { Kilograms } from '@airship/units'

/**
 * The gear the vehicle comes down on, whether that is water or ground.
 *
 * THE BASIS EVERYONE USES IS WRONG FOR THIS VEHICLE, and it is wrong by a large
 * factor in the expensive direction.
 *
 * Amphibious floats are costed as a fraction of gross weight, because on a
 * floatplane that is exactly right: the floats carry the whole aeroplane.
 * Wipaire publish net installed exchange weights of 12.5 to 13.1 percent of
 * gross for amphibious installations and 7.1 to 8.6 percent for water-only.
 * Applied to this vehicle those give 2,900 to 3,100 kg, which is a seventh of
 * the ship and more than the entire habitat.
 *
 * IT CARRIES 800 KG. A vehicle trimmed 800 kg heavy puts 800 kg on its gear, not
 * 23 tonnes, so the seaplane fraction charges nearly four times the load itself
 * in structure to carry it. THE GEAR IS SIZED BY THE LOAD ON IT, and on a
 * buoyant vehicle that load is the static heaviness rather than the weight.
 *
 * WHAT ACTUALLY SIZES IT is not the nominal trim either. It is the SUPERHEAT
 * EXCURSION: twenty kelvin of solar superheat moves this vehicle's lift by about
 * two tonnes, so a ship that rests at 800 kg heavy in the afternoon presses
 * nearly three tonnes onto its gear before dawn. That excursion, not the trim,
 * is the design load, and it is the same unresolved swing the marine chapter's
 * failing gate is about. The gear and the failing gate are the same problem seen
 * from two directions.
 */

export interface AlightingGear {
  /** Load the gear is sized to carry, kg. */
  readonly designLoad: number
  /** Of that, the part that is the diurnal superheat swing rather than trim. */
  readonly superheatShare: number
  /** Mass of the water-contact gear, kg. */
  readonly waterMass: number
  /** Additional mass to also land on ground, kg. */
  readonly landMass: number
  readonly totalMass: number
  /** Total as a fraction of gross weight, for comparison with the seaplane figures. */
  readonly asFractionOfGross: number
  /** What the seaplane basis would have charged, kg. */
  readonly seaplaneBasisMass: number
  readonly note: string
}

/**
 * @source Landing gear mass as a fraction of the load it carries, for a
 * structure sized by that load rather than by an aircraft's gross weight.
 * Aircraft landing gear runs 3 to 6 percent of maximum landing weight; taken at
 * the top of that because this gear is also a hull, has to be corrosion-proof in
 * seawater, and is not being optimised by anyone with a certification budget.
 */
const GEAR_MASS_PER_UNIT_LOAD = 0.06

/**
 * @source Dynamic factor on a water alighting. The vehicle is far too light to
 * slam, so this is not a seaplane impact factor: it is the wave-following
 * suspension load, and the marine seakeeping model computes it properly. 2.5 is
 * the working figure until a sea state is chosen.
 */
const WATER_DYNAMIC_FACTOR = 2.5

/**
 * @source Dynamic factor on a ground alighting. Higher than water because the
 * ground does not give, and because a vehicle that touches down in a gust is
 * being pushed as well as dropped.
 */
const GROUND_DYNAMIC_FACTOR = 3.5

/**
 * @source Mass of the wheels, legs and brakes as a fraction of the water gear
 * they are added to. Wipaire's own figures put the wheel half of an amphibious
 * float at about 4.5 points of the 12.5, which is roughly half again on top of
 * the water-only structure.
 */
const WHEEL_SHARE_OF_WATER_GEAR = 0.55

/**
 * @source The seaplane fraction, for the comparison this module exists to make.
 * Wipline 8750 amphibious on a Cessna 208 is 518 kg on 3,969 kg gross.
 */
const SEAPLANE_AMPHIBIOUS_FRACTION = 0.125

export const alightingGear = (
  grossWeight: Kilograms,
  /** Static heaviness the vehicle is trimmed to rest at, kg. */
  landingTrim: number,
  /** Lift excursion from a day's superheat, kg. The real design load. */
  superheatExcursion: number,
  landCapable: boolean,
): AlightingGear => {
  // The gear must hold the ship down at its heaviest, which is the trim plus
  // the whole swing, not the trim alone.
  const staticLoad = landingTrim + superheatExcursion
  const dynamicFactor = landCapable ? GROUND_DYNAMIC_FACTOR : WATER_DYNAMIC_FACTOR
  const designLoad = staticLoad * dynamicFactor

  const waterMass = designLoad * GEAR_MASS_PER_UNIT_LOAD
  const landMass = landCapable ? waterMass * WHEEL_SHARE_OF_WATER_GEAR : 0
  const totalMass = waterMass + landMass
  const seaplaneBasisMass = grossWeight * SEAPLANE_AMPHIBIOUS_FRACTION

  return {
    designLoad,
    superheatShare: superheatExcursion / staticLoad,
    waterMass,
    landMass,
    totalMass,
    asFractionOfGross: totalMass / grossWeight,
    seaplaneBasisMass,
    note:
      `${totalMass.toFixed(0)} kg of gear, sized by the ${designLoad.toFixed(0)} kg it actually ` +
      `carries rather than by the ${grossWeight.toFixed(0)} kg the vehicle weighs. The seaplane ` +
      `basis would charge ${seaplaneBasisMass.toFixed(0)} kg, which is ` +
      `${(seaplaneBasisMass / totalMass).toFixed(1)} times as much and more than the entire ` +
      `habitat, because a floatplane's floats carry the whole aeroplane and these carry its ` +
      `static heaviness. ` +
      `${(((superheatExcursion / staticLoad) * 100)).toFixed(0)} PERCENT OF THE DESIGN LOAD IS ` +
      `THE DIURNAL SUPERHEAT SWING rather than the trim: the ship rests at ` +
      `${landingTrim.toFixed(0)} kg in the afternoon and presses ${staticLoad.toFixed(0)} kg down ` +
      `before dawn. The gear and the marine chapter's failing gate are the same problem seen from ` +
      `two directions.` +
      (landCapable
        ? ` Landing on ground as well as water adds ${landMass.toFixed(0)} kg of wheels, legs and ` +
          `brakes and raises the dynamic factor from ${WATER_DYNAMIC_FACTOR} to ` +
          `${GROUND_DYNAMIC_FACTOR}, because the ground does not give.`
        : ` Water only, which is the cheaper gear and the one that never needs a prepared surface.`),
  }
}
