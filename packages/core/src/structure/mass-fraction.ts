import { EMPTY_WEIGHT_PER_GAS_VOLUME, STRUCTURAL_SCALING, STRUCTURAL_FLEET } from '@airship/data'
import type { CubicMeters, Kilograms } from '@airship/units'
import { K, kg, m } from '@airship/units'
import { atmosphere } from '../atmosphere.js'
import { pure, specificLift } from '../buoyancy.js'

/**
 * Empty weight fraction versus size, and whether a small ship can be built at
 * all.
 *
 * THIS IS THE PHASE 3 GATE, and it is the place the project is most likely to
 * get a "no".
 *
 * The brief assumes the square-cube law works in the design's favour: lift
 * scales as length cubed, structure roughly as length to the 2.6 or 3.0, so
 * bigger ships have better mass fractions and the question is only how big to
 * go. The historical data does not support that, and the direction of the error
 * is the dangerous one.
 *
 * Fitting fixed weight against gas volume over all eight rigids with published
 * figures gives an exponent of 1.13, meaning mass fraction gets slightly WORSE
 * with size. Only the hull girder is a beam problem that benefits from depth;
 * cover, gas cells and netting scale as area, and engines, cars, keels and
 * systems scale with the mission rather than with size at all.
 *
 * The honest caveat is that the fleet cannot resolve the exponent. Restricted
 * to the five best-sourced ships, whose volumes span only 1.41 to 1, the fit
 * collapses to 0.16 with R^2 = 0.45. The scatter from gas choice, material and
 * national design philosophy is about 30 percentage points of mass fraction,
 * which swamps any size trend over that range.
 *
 * The fleet-wide fit is also not robust. It is dominated by two derived clusters
 * over a 3.3 to 1 volume range, so the usable range is 0.67 to 1.15 with a
 * nominal near 1.0 rather than the 1.13 the raw regression returns.
 *
 * SO THE EXPONENT IS THE WHOLE BALLGAME, and this module makes that visible
 * rather than picking a value. Extrapolating the Hindenburg's 0.590 kg per m3
 * down to a 15,800 m3 ship:
 *
 *   exponent 1.00  ->   9,322 kg,  51.8 percent  design closes comfortably
 *   exponent 0.90  ->  12,016 kg,  66.8 percent  little useful load left
 *   exponent 0.80  ->  15,488 kg,  86.0 percent  nothing useful left
 *   exponent 0.67  ->  21,725 kg, 120.7 percent  cannot lift itself
 *
 * A model that quietly assumed the favourable end of that range would report a
 * comfortable design where the truth is a coin flip. The sweep is the output.
 */

export interface MassFractionEstimate {
  readonly volume: CubicMeters
  readonly exponent: number
  readonly emptyWeight: Kilograms
  readonly grossLift: Kilograms
  readonly emptyWeightFraction: number
  readonly usefulLift: Kilograms
  /** True when the ship cannot even lift its own empty weight. */
  readonly infeasible: boolean
}

/** @source Specific lift of pure hydrogen at ISA sea level, computed by the buoyancy module. */
const HYDROGEN_SPECIFIC_LIFT = 1.1397

/** @source LZ-129 Hindenburg: 200,000 m3 of hydrogen, 118,000 kg empty. */
const REFERENCE_VOLUME = 200000

/**
 * Empty weight of a ship of a given volume, scaled from the Hindenburg.
 *
 * @derived m = m_ref * (V / V_ref)^exponent. Exponent 1.0 means mass per unit
 * volume is constant, which is what the fleet-wide fit roughly says. Lower
 * exponents mean small ships are penalised, which is what the square-cube law
 * would predict if structure were purely a surface problem.
 */
export const scaledEmptyWeight = (volume: CubicMeters, exponent: number): Kilograms =>
  kg(
    EMPTY_WEIGHT_PER_GAS_VOLUME.hindenburg *
      REFERENCE_VOLUME *
      (volume / REFERENCE_VOLUME) ** exponent,
  )

export const massFractionAt = (volume: CubicMeters, exponent: number): MassFractionEstimate => {
  const emptyWeight = scaledEmptyWeight(volume, exponent)
  const grossLift = kg(volume * HYDROGEN_SPECIFIC_LIFT)
  const fraction = emptyWeight / grossLift

  return {
    volume,
    exponent,
    emptyWeight,
    grossLift,
    emptyWeightFraction: fraction,
    usefulLift: kg(grossLift - emptyWeight),
    infeasible: fraction >= 1,
  }
}

/**
 * The default exponent ladder: the fleet-wide fit, linear, two intermediate
 * values, and the theoretical area law. Chosen to span the range the historical
 * record cannot distinguish between.
 * @source STRUCTURAL_SCALING in packages/data, plus two interpolated points.
 */
const DEFAULT_EXPONENTS: readonly number[] = [
  STRUCTURAL_SCALING.allShipsExponent,
  1.0,
  0.9,
  0.8,
  STRUCTURAL_SCALING.theoreticalAreaLaw,
]

/**
 * The sweep the brief asks for: useful load fraction against hull size, across
 * the range of scaling exponents the historical data cannot distinguish.
 *
 * The output is deliberately a family of curves rather than one curve, because
 * one curve would be a claim the evidence does not support.
 */
export const massFractionSweep = (
  volumes: readonly number[],
  exponents: readonly number[] = DEFAULT_EXPONENTS,
): ReadonlyArray<MassFractionEstimate> =>
  volumes.flatMap((volume) =>
    exponents.map((exponent) => massFractionAt(volume as CubicMeters, exponent)),
  )

/**
 * Upper bracket for the size search, m3. Two and a half times the Hindenburg,
 * which is far beyond anything buildable in a shop and therefore a safe bound.
 * @derived Search bracket, not a physical limit.
 */
const MAXIMUM_SEARCH_VOLUME = 500000

/**
 * Smallest hull that leaves a required useful load, at a given scaling
 * exponent.
 *
 * Returns null when the requirement exceeds what any hull inside the search
 * bracket can lift. That is a real answer and the caller must handle it rather
 * than receiving a large number that looks like a design.
 *
 * Note the direction: at an exponent BELOW 1 lift grows faster than structure,
 * so there is always some size that works and the answer is a MINIMUM. Above 1
 * the relationship inverts and large ships are the infeasible ones.
 */
export const minimumViableVolume = (
  requiredUsefulLift: Kilograms,
  exponent: number,
  maximumVolume = MAXIMUM_SEARCH_VOLUME,
): CubicMeters | null => {
  // Useful lift is not monotonic in an obvious closed form once the exponent is
  // above 1, so bisect on a bracket and check the bracket first.
  const atMax = massFractionAt(maximumVolume as CubicMeters, exponent)
  if (atMax.usefulLift < requiredUsefulLift) return null

  /** @derived Lower bracket. No airship is smaller than a hot air balloon. */
  let low = 100
  let high = maximumVolume

  /** @derived 80 bisection steps resolves far past any physical significance. */
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2
    if (massFractionAt(mid as CubicMeters, exponent).usefulLift < requiredUsefulLift) low = mid
    else high = mid
  }

  return high as CubicMeters
}

/**
 * The benchmark, stated correctly.
 *
 * The brief's "beat 60.1 percent" was comparing a carbon fibre frame against
 * the Macon's entire fixed weight, which included eight engines, an aircraft
 * hangar, a trapeze and armament. The real target is the Hindenburg, and on an
 * ISA basis that is 51.8 percent rather than the 48.8 first published here: the
 * lower figure divided by a 242 tonne gross lift that is only reachable with
 * pure hydrogen at 0 degrees C.
 *
 * The correction makes the target HARDER. "40 to 50 percent" no longer means
 * equalling the best airship ever built, it means beating it by two to twelve
 * points with hand wet layup.
 */
export const benchmark = () => {
  const hindenburg = STRUCTURAL_FLEET.find((s) => s.id === 'lz129-hindenburg')
  const macon = STRUCTURAL_FLEET.find((s) => s.id === 'zrs5-macon')
  if (!hindenburg || !macon) throw new Error('Fleet fixture missing')

  /**
   * @derived COMPUTED, not asserted. This was the literal 0.0836 under a
   * @source tag reading "hydrogen gives 8.36 percent more gross lift than
   * helium", which is a number packages/core derives and which packages/core
   * derives differently: the specific lifts at ISA sea level give 7.959
   * percent. A literal in this package restating a quantity this package
   * computes is the one-model rule broken in the smallest possible space.
   */
  const seaLevel = atmosphere(m(0))
  const hydrogenAdvantage =
    specificLift(pure('hydrogen'), seaLevel, K(seaLevel.temperature)) /
      specificLift(pure('helium'), seaLevel, K(seaLevel.temperature)) -
    1

  return {
    /** The figure to beat: best large rigid ever built. */
    target: hindenburg.emptyWeightFraction,
    /** What the brief cited, which measures a different thing. */
    briefCited: macon.emptyWeightFraction,
    /**
     * Macon corrected to a hydrogen-equivalent gross lift, so the two ships are
     * compared on the same gas. About a third of the apparent gap between them
     * is gas choice rather than structural design.
     */
    maconOnHydrogenEquivalent: macon.emptyWeightFraction / (1 + hydrogenAdvantage),
  }
}
