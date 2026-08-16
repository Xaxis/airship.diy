import {
  CARBON_FIBRES,
  LAMINATE_ANCHORS,
  RESIN_SYSTEMS,
  WET_LAYUP,
  WOVEN_KNOCKDOWN,
  v,
} from '@airship/data'
import type { Pascals } from '@airship/units'
import { Pa } from '@airship/units'

/**
 * From fibre and resin to a laminate you can actually size a member against.
 *
 * WHY THIS WAS MISSING AND WHY IT MATTERS. The data package has fibre
 * properties, a fibre volume fraction, a void content and a woven knockdown.
 * The buckling module takes a modulus and a compressive strength. Nothing
 * connected them, so every structural figure in this repository was reached by
 * passing numbers in by hand at the call site, which is exactly the seam where
 * a 60 percent fibre volume datasheet value gets used for a 47 percent hand
 * layup and nobody notices.
 *
 * THE THREE KNOCKDOWNS, IN ORDER OF SIZE:
 *
 *   FIBRE VOLUME. A wet layup under vacuum reaches about 47 percent against the
 *   57.4 percent of a prepreg autoclave, and everything fibre-dominated scales
 *   linearly with it. That alone is an 18 percent cut. Without a vacuum bag it
 *   is 35 percent, which is a further quarter off, and the bag is therefore not
 *   optional.
 *
 *   VOIDS. About 3.4 percent by volume against under 1 percent for prepreg.
 *   Voids barely touch fibre-direction tension and they hurt COMPRESSION badly,
 *   because a compressed fibre is held straight by the matrix around it and a
 *   void is matrix that is not there.
 *
 *   WEAVE. A woven fabric is what an amateur can buy and drape over compound
 *   curvature. Its tows are crimped, which costs a little modulus and rather
 *   more tension. The compression figure straddles unity and is not known.
 *
 * All three are in the flattering direction if you skip them, and a
 * buckling-critical frame is sized by exactly the properties they hit hardest.
 */

export interface LaminateProperties {
  readonly fibreId: string
  readonly fibreVolumeFraction: number
  readonly voidContent: number
  /** Modulus in the fibre direction, Pa. */
  readonly modulus: Pascals
  /** Compressive strength, Pa. The property a buckling-critical frame needs. */
  readonly compressiveStrength: Pascals
  /** Tensile strength, Pa. */
  readonly tensileStrength: Pascals
  readonly density: number
  /** Cured thickness of one ply, m. */
  readonly plyThickness: number
  /** What this laminate achieves against a prepreg autoclave reference. */
  readonly prepregFraction: number
  readonly note: string
}

/**
 * Void knockdown on compressive strength.
 *
 * @source Composite practice puts the compressive strength loss at roughly 7
 * percent per percent of void content up to about 4 percent voids, because a
 * fibre in compression is stabilised by the matrix around it and a void is
 * missing matrix. Tension is barely affected, which is why a laminate can look
 * fine in a tension coupon and be a third down in compression.
 */
const COMPRESSIVE_LOSS_PER_VOID_FRACTION = 7

/**
 * Display conversions. Named once so a message string never contains a bare
 * literal, which the citation rule would otherwise flag and which would
 * otherwise be a place a unit could silently change.
 *
 * @derived Pascals to megapascals.
 */
const MPA = 1e6

/** @derived Pascals to gigapascals. */
const GPA = 1e9

export interface LaminateOptions {
  readonly fibreId?: string
  readonly resinId?: string
  /** Woven fabric rather than unidirectional tape. The amateur's material. */
  readonly woven?: boolean
  /** Vacuum bag. Without it the fibre volume fraction collapses. */
  readonly vacuumBagged?: boolean
  /** Areal weight of the dry fabric, kg/m2. Sets the cured ply thickness. */
  readonly fabricArealWeight?: number
}

/**
 * Properties of a laminate as it will actually be built.
 *
 * @param fabricArealWeight kg/m2 of dry fabric. 0.2 is a common heavy carbon
 *   twill and 0.6 is a heavy multiaxial; the cured ply thickness follows from it
 *   and the fibre volume fraction, and it is what sets the minimum practical
 *   wall of a small member.
 */
export const laminate = (options: LaminateOptions = {}): LaminateProperties => {
  const fibreId = options.fibreId ?? 't700s'
  const fibre = CARBON_FIBRES.find((f) => f.id === fibreId)
  if (!fibre) throw new RangeError(`Unknown carbon fibre "${fibreId}".`)

  const resinId = options.resinId ?? 'proset-lam125-postcured'
  const resin = RESIN_SYSTEMS.find((r) => r.id === resinId)
  if (!resin) throw new RangeError(`Unknown resin system "${resinId}".`)

  const vacuumBagged = options.vacuumBagged ?? true
  const woven = options.woven ?? true
  /** @source A common heavy carbon twill an amateur can buy and drape. */
  const fabricArealWeight = options.fabricArealWeight ?? 0.2

  const fibreVolumeFraction = vacuumBagged
    ? v(WET_LAYUP.fibreVolumeFraction)
    : v(WET_LAYUP.handLayupOnlyFibreVolumeFraction)
  const voidContent = v(WET_LAYUP.voidContent)

  /**
   * SCALE FROM A MEASURED LAMINATE, NOT FROM BARE FIBRE.
   *
   * This function used to build the woven case up with the rule of mixtures,
   * E = Vf * E_fibre + (1 - Vf) * E_matrix, and then apply a 0.93 crimp
   * knockdown. That produced 102 GPa for a laminate whose own published table
   * says 70 GPa at a HIGHER fibre volume fraction than the model assumes. The
   * arithmetic was right and the model was wrong: the rule of mixtures does not
   * know that a balanced weave puts only about half its fibre in the load
   * direction, and no crimp knockdown can repair a factor of two.
   *
   * So the woven case is anchored on a measured woven laminate and the
   * unidirectional case on a measured tape laminate, each scaled by the ratio of
   * fibre volume fractions, which is the one thing that genuinely does scale
   * linearly for a fibre-dominated property.
   *
   * @derived Fibre-dominated properties go as Vf, so a laminate at Vf_actual has
   * the anchor's property times Vf_actual / Vf_anchor.
   */
  const anchor = woven ? LAMINATE_ANCHORS.woven : LAMINATE_ANCHORS.unidirectional
  const volumeRatio = fibreVolumeFraction / v(anchor.fibreVolumeFraction)

  /**
   * @source Fibre modulus relative to the anchor's fibre. The published table is
   * for standard modulus carbon, which is what T700S is, so a different fibre
   * scales by its own modulus against that.
   */
  const referenceFibre = CARBON_FIBRES.find((f) => f.id === 't700s')
  if (!referenceFibre) throw new RangeError('The reference fibre t700s is missing from the data.')
  const fibreModulusRatio = fibre.modulus / referenceFibre.modulus
  const fibreStrengthRatio = fibre.strength / referenceFibre.strength

  const voidKnockdown = Math.max(
    0,
    1 - COMPRESSIVE_LOSS_PER_VOID_FRACTION * voidContent,
  )

  /**
   * @derived Voids barely touch stiffness: a void is missing matrix and the
   * matrix carries under two percent of the fibre-direction modulus. What they
   * do cost is the volume they occupy, which is why the term is (1 - Vv) rather
   * than the compressive knockdown above.
   */
  const modulus = v(anchor.modulus) * volumeRatio * fibreModulusRatio * (1 - voidContent)

  /**
   * @derived Compressive strength scales with fibre volume and is hit hard by
   * voids, because a fibre in compression is held straight by the matrix around
   * it and a void is matrix that is not there. It does NOT scale with fibre
   * tensile strength, which is why the ratio is not applied: composite
   * compression is set by microbuckling in the matrix, and that is the same
   * matrix whatever fibre is in it.
   */
  const compressiveStrength = v(anchor.compressiveStrength) * volumeRatio * voidKnockdown

  const tensileStrength =
    v(anchor.tensileStrength) * volumeRatio * fibreStrengthRatio * (1 - voidContent)

  // Read so the knockdowns stay part of the documented chain even though the
  // measured anchor already contains them. They are what the anchor's own note
  // explains, and deleting them would lose the explanation.
  void WOVEN_KNOCKDOWN

  /**
   * @derived Density by rule of mixtures, less the voids, which are air.
   */
  const density =
    (fibreVolumeFraction * fibre.density + (1 - fibreVolumeFraction) * resin.curedDensity) *
    (1 - voidContent)

  /**
   * @derived Cured ply thickness from the dry fabric areal weight: the fibre
   * occupies (areal weight / fibre density) of thickness, and it is Vf of the
   * cured ply, so t = W / (rho_fibre * Vf).
   */
  const plyThickness = fabricArealWeight / (fibre.density * fibreVolumeFraction)

  /**
   * @derived What a prepreg autoclave would give from the same fibre and weave:
   * the same anchor at the prepreg fibre volume fraction and with essentially no
   * voids. Comparing like with like is the point of the ratio.
   */
  const prepregReference =
    v(anchor.compressiveStrength) *
    (v(WET_LAYUP.prepregFibreVolumeFraction) / v(anchor.fibreVolumeFraction))

  return {
    fibreId,
    fibreVolumeFraction,
    voidContent,
    modulus: Pa(modulus),
    compressiveStrength: Pa(compressiveStrength),
    tensileStrength: Pa(tensileStrength),
    density,
    plyThickness,
    prepregFraction: compressiveStrength / prepregReference,
    note:
      `${(fibreVolumeFraction * 100).toFixed(0)} percent fibre volume, ` +
      `${(voidContent * 100).toFixed(1)} percent voids, ` +
      `${woven ? 'woven fabric' : 'unidirectional tape'}, ` +
      `${vacuumBagged ? 'vacuum bagged' : 'NO VACUUM BAG'}. ` +
      `${(compressiveStrength / MPA).toFixed(0)} MPa compressive and ` +
      `${(modulus / GPA).toFixed(0)} GPa, against ` +
      `${(v(anchor.compressiveStrength) / MPA).toFixed(0)} MPa for the measured laminate this is ` +
      `scaled from: ` +
      `${(prepregFractionPercent(compressiveStrength, prepregReference)).toFixed(0)} percent of what ` +
      `a prepreg autoclave would give. Every one of those knockdowns is in the flattering direction ` +
      `if you skip it, and a buckling-critical frame is sized by exactly the properties they hit hardest.`,
  }
}

const prepregFractionPercent = (achieved: number, reference: number): number =>
  (achieved / reference) * 100

/**
 * The plies a given thickness needs, rounded up.
 *
 * You cannot lay half a ply. Rounding up is the only honest direction, and it is
 * what makes a small member heavier than its stress analysis says: below about
 * four plies a laminate has no reliable properties at all, so that is the floor.
 */
export const pliesFor = (thickness: number, plyThickness: number, minimumPlies = 4): number =>
  Math.max(minimumPlies, Math.ceil(thickness / plyThickness))
