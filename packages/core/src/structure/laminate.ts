import { CARBON_FIBRES, RESIN_SYSTEMS, WET_LAYUP, WOVEN_KNOCKDOWN, v } from '@airship/data'
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
   * @derived Rule of mixtures in the fibre direction:
   * E = Vf * E_fibre + (1 - Vf) * E_matrix. The matrix modulus is small enough
   * against carbon that the second term is under two percent, but it is carried
   * because leaving it out is the kind of silent simplification this repository
   * is built to avoid.
   *
   * @source Cured epoxy tensile modulus, 3.2 GPa, which is common to all three
   * resin systems in the data package within their own scatter.
   */
  const MATRIX_MODULUS = 3.2e9
  const grossModulus =
    fibreVolumeFraction * fibre.modulus + (1 - fibreVolumeFraction) * MATRIX_MODULUS

  /**
   * @derived The datasheet compressive strength is quoted at 60 percent fibre
   * volume, and compressive strength is fibre-dominated, so it scales with the
   * fibre volume actually achieved.
   */
  const DATASHEET_FIBRE_VOLUME = 0.6
  const volumeScaled =
    fibre.compositeCompressiveStrength60Vf * (fibreVolumeFraction / DATASHEET_FIBRE_VOLUME)

  const voidKnockdown = Math.max(
    0,
    1 - COMPRESSIVE_LOSS_PER_VOID_FRACTION * voidContent,
  )

  const weaveModulus = woven ? v(WOVEN_KNOCKDOWN.modulus) : 1
  const weaveCompression = woven ? v(WOVEN_KNOCKDOWN.compression) : 1
  const weaveTension = woven ? v(WOVEN_KNOCKDOWN.tension) : 1

  const modulus = grossModulus * weaveModulus
  const compressiveStrength = volumeScaled * voidKnockdown * weaveCompression
  const tensileStrength =
    fibre.strength * fibreVolumeFraction * weaveTension * (1 - voidContent)

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

  const prepregReference =
    fibre.compositeCompressiveStrength60Vf *
    (v(WET_LAYUP.prepregFibreVolumeFraction) / DATASHEET_FIBRE_VOLUME)

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
      `${(compressiveStrength / MPA).toFixed(0)} MPa compressive against ` +
      `${(fibre.compositeCompressiveStrength60Vf / MPA).toFixed(0)} MPa on the datasheet: ` +
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
