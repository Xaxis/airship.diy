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
  /** Total as a fraction of the displacement, for comparison with the seaplane figures. */
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
 * @source Limit ground load factor that certified aircraft gear reacts at
 * maximum landing weight, and therefore the factor already contained in the 3
 * to 6 percent statistic. Transport gear is designed to about 2 to 3; 2.5 is
 * the middle of it.
 */
const LOAD_FACTOR_INSIDE_THE_STATISTIC = 2.5

/**
 * THE DYNAMIC FACTOR IS ALREADY INSIDE THE STATISTIC.
 *
 * The 3 to 6 percent figure is normalised on STATIC maximum landing weight, and
 * certified gear already reacts a limit ground load factor of two to three at
 * that weight. So multiplying the static load by a dynamic factor and then
 * applying the fraction counts the same allowance twice. The check is decisive:
 * run this module's old method on the aircraft the constant came from and it
 * returns 0.06 * 3.5 = 21 percent of landing weight, three to four times the
 * statistic it was derived from.
 *
 * The fraction is therefore applied to the STATIC load, and the dynamic factor
 * is reported separately as what the structure has to react rather than used to
 * scale its mass.
 */

/**
 * @source Dynamic factor on a water alighting: the ratio of the peak load the
 * structure reacts to the static load it rests at. The vehicle is far too light
 * to slam in the seaplane sense, so this is the wave load, and `heaveResponse`
 * is where it is computed properly rather than assumed. Against a landing trim
 * of a few hundred kilograms the wave bracket there runs from tens to hundreds
 * of kilonewtons, so 2.5 is a working lower figure and not a conservative one.
 *
 * Validity: this is a placeholder until a design sea state is chosen. Choose one
 * and take the number from the seakeeping model.
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
 * A Wipline 8750 amphibious installation is about 518 kg, against a Cessna 208B
 * amphibious certified gross near 3,790 kg, which is 13.7 percent.
 *
 * The previous denominator of 3,969 kg is 8,750 lb, which is the FLOAT MODEL
 * DESIGNATION rather than any aircraft weight, read as though it were one. And
 * the constant was 0.125 while the arithmetic offered for it gave 0.1305: the
 * citation supported a different number from the one attached to it.
 *
 * It is a comparison figure only. Nothing is sized from it.
 */
const SEAPLANE_AMPHIBIOUS_FRACTION = 0.137

export const alightingGear = (
  grossWeight: Kilograms,
  /** Static heaviness the vehicle is trimmed to rest at, kg. */
  landingTrim: number,
  /** Lift excursion from a day's superheat, kg. */
  superheatExcursion: number,
  landCapable: boolean,
  /**
   * Fraction of the superheat swing the ballast loop cannot take out, 0 to 1.
   *
   * THE SWING WAS BEING PAID FOR TWICE. The arrangement carries a seawater
   * ballast bladder sized for the whole excursion and the superheat gate passes
   * on it, and then this function charged the gear for the same excursion as
   * though the loop did not exist. Both gates went green on one 2.3 tonnes.
   *
   * They cannot both be true. If the loop works the heaviness stays near the
   * trim and the gear carries the trim; if it does not, the vehicle is more
   * than two tonnes heavy by dawn and cannot leave the water at all, with or
   * without a propulsor failure, so the vertical landing gate fails too.
   *
   * What the gear must actually carry is the trim plus whatever the ballast
   * system cannot shed. Note that this makes the GEAR depend on the BALLAST
   * SYSTEM, which is a coupling that did not exist before and belongs in the
   * failure analysis: a ballast system that fails overnight leaves the full
   * swing on a structure not sized for it.
   *
   * @param ballastAvailable Mass the vehicle can shed or take on to hold trim,
   *   kg. Dumping works anywhere; taking on only works afloat, and the load
   *   case that matters here is the cold-gas one before dawn, which dumping
   *   answers.
   */
  ballastAvailable = 0,
): AlightingGear => {
  // The gear holds the ship down at its heaviest: the trim, plus the part of
  // the superheat swing the ballast system cannot shed.
  const uncoveredSwing = Math.max(superheatExcursion - ballastAvailable, 0)
  const staticLoad = landingTrim + uncoveredSwing
  const dynamicFactor = landCapable ? GROUND_DYNAMIC_FACTOR : WATER_DYNAMIC_FACTOR
  const designLoad = staticLoad * dynamicFactor

  // Mass from the STATIC load, uplifted only by the excess of this vehicle's
  // design factor over the one the aircraft statistic already contains.
  const factorExcess = Math.max(dynamicFactor / LOAD_FACTOR_INSIDE_THE_STATISTIC, 1)
  const waterMass = staticLoad * GEAR_MASS_PER_UNIT_LOAD * factorExcess
  const landMass = landCapable ? waterMass * WHEEL_SHARE_OF_WATER_GEAR : 0
  const totalMass = waterMass + landMass
  const seaplaneBasisMass = grossWeight * SEAPLANE_AMPHIBIOUS_FRACTION

  return {
    designLoad,
    superheatShare: staticLoad > 0 ? uncoveredSwing / staticLoad : 0,
    waterMass,
    landMass,
    totalMass,
    asFractionOfGross: totalMass / grossWeight,
    seaplaneBasisMass,
    note:
      `${totalMass.toFixed(0)} kg of gear, sized by the ${designLoad.toFixed(0)} kg it actually ` +
      `reacts rather than by the ${grossWeight.toFixed(0)} kg the vehicle displaces. The seaplane ` +
      `basis would charge ${seaplaneBasisMass.toFixed(0)} kg, ` +
      `${(seaplaneBasisMass / totalMass).toFixed(0)} times as much and more than the entire ` +
      `habitat, because a floatplane's floats carry the whole aeroplane and these carry only its ` +
      `static heaviness. THAT COMPARISON IS THE POINT OF THIS MODULE and it is also why the number ` +
      `looks too small: on a buoyant vehicle the gear is not a fraction of the weight, and any ` +
      `estimate that makes it one is out by the buoyancy ratio. ` +
      (uncoveredSwing > 0
        ? `${((uncoveredSwing / staticLoad) * 100).toFixed(0)} PERCENT OF THE STATIC LOAD IS ` +
          `SUPERHEAT THE BALLAST SYSTEM CANNOT SHED: the ship rests at ` +
          `${landingTrim.toFixed(0)} kg in the afternoon and presses ` +
          `${staticLoad.toFixed(0)} kg down before dawn.`
        : `The ${superheatExcursion.toFixed(0)} kg diurnal superheat swing is covered by the ` +
          `${ballastAvailable.toFixed(0)} kg of ballast the vehicle can shed, so the gear carries ` +
          `the trim and not the swing. THAT MAKES THE GEAR DEPEND ON THE BALLAST SYSTEM, which is ` +
          `a real coupling: sizing it for the trim and then losing the ballast leaves more than ` +
          `two tonnes on a structure built for six hundred kilograms.`) +
      (landCapable
        ? ` Landing on ground as well as water adds ${landMass.toFixed(0)} kg of wheels, legs and ` +
          `brakes and raises the dynamic factor from ${WATER_DYNAMIC_FACTOR} to ` +
          `${GROUND_DYNAMIC_FACTOR}, because the ground does not give.`
        : ` Water only, which is the cheaper gear and the one that never needs a prepared surface.`),
  }
}
