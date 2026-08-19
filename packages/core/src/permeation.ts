import { v, CONSTANTS, GAS, ISA, MOLAR_VOLUME_STP } from '@airship/data'
import type { BarrierFilm } from '@airship/data'
import type { Kilograms, Pascals, SquareMeters } from '@airship/units'
import { kg } from '@airship/units'
import type { CellContents } from './buoyancy.js'

/**
 * Permeation through gas cell films.
 *
 *   J = P * A * dp / t
 *
 * where P/t is the transmission rate of the film as laminated, which is the
 * form the data package stores because it is the form manufacturers publish.
 *
 * Two things about this module matter more than the arithmetic.
 *
 * FIRST, transport is BIDIRECTIONAL and the two directions do different damage.
 * Hydrogen going out is lost lift, and it is replaceable by running the
 * electrolyzer. Nitrogen and oxygen coming in is lost PURITY, and purity cannot
 * be restored by adding more hydrogen: once a cell is 10 percent air, the only
 * fixes are to vent and refill, or to live with the lift penalty. Inward
 * leakage is the slower process and the more expensive one.
 *
 * SECOND, each gas moves under its OWN partial pressure difference, not the
 * total pressure difference. A gas cell sits within a few hundred pascals of
 * ambient, so the total pressure difference across the film is nearly zero, and
 * a model that used it would predict no leakage at all. What actually drives
 * transport is that the cell is nearly pure hydrogen and the air outside is
 * nearly pure nitrogen and oxygen, so each species sees almost the full ambient
 * pressure as its own driving difference, in opposite directions.
 */

export interface PermeationRates {
  /** Hydrogen leaving the cell, kg/s. Always positive. */
  readonly hydrogenLoss: number
  /** Air entering the cell, kg/s. Always positive. */
  readonly airIngress: number
  /** Moles of lifting gas leaving per second. */
  readonly liftingGasMolesOut: number
  /** Moles of air entering per second. */
  readonly airMolesIn: number
}

/** @source Standard atmosphere composition, dry: 78.08 percent N2, 20.95 percent O2. */
const NITROGEN_FRACTION_OF_AIR = 0.7808

/**
 * One atmosphere, the reference the film transmission rates are quoted against.
 * @source Standard atmosphere, exact by definition. Barrier film datasheets
 *   quote transmission per atmosphere of partial pressure difference.
 */
const REFERENCE_PRESSURE = v(ISA.seaLevelPressure)

/**
 * Seconds per day, for converting the film's per-day transmission rate.
 * @derived SI.SECONDS_PER_HOUR * SI.HOURS_PER_DAY.
 */
const SECONDS_PER_DAY = 86400

/**
 * Instantaneous permeation rates for one cell.
 *
 * @param film The barrier laminate.
 * @param area Cell surface area exposed to the interstitial space.
 * @param ambientPressure Pressure outside the cell.
 * @param contents Current cell composition. Purity enters through the partial
 *   pressures: a cell that has already degraded leaks hydrogen more slowly and
 *   takes in air more slowly, so purity decay self-limits rather than running
 *   away.
 * @param interstitialNitrogenFraction Nitrogen fraction in the space between
 *   the cells and the outer cover. Inerting that space with nitrogen is a
 *   hydrogen safety measure, and it makes inward nitrogen leakage WORSE, which
 *   is a real trade the safety module has to own rather than ignore.
 */
export const permeationRates = (
  film: BarrierFilm,
  area: SquareMeters,
  ambientPressure: Pascals,
  contents: CellContents,
  interstitialNitrogenFraction: number = NITROGEN_FRACTION_OF_AIR,
): PermeationRates => {
  const molarVolume = v(MOLAR_VOLUME_STP)

  // Convert L(STP)/(m2 day atm) into mol/(m2 s Pa).
  const toMolarFlux = (transmission: number): number =>
    (transmission / molarVolume / SECONDS_PER_DAY / REFERENCE_PRESSURE)

  // Partial pressure of the lifting gas inside, against essentially zero
  // outside. Even a nitrogen-inerted interstitial space contains no hydrogen,
  // because any that arrives is ventilated away, which is the entire point of
  // ventilating it.
  const liftingPartialPressureIn = contents.purity * ambientPressure

  // Partial pressure of nitrogen outside, against whatever has already
  // accumulated inside. The impure fraction of the cell is modelled as air.
  const impureFraction = 1 - contents.purity - (contents.waterVapourFraction ?? 0)
  const nitrogenPartialPressureIn = Math.max(impureFraction, 0) * NITROGEN_FRACTION_OF_AIR * ambientPressure
  const nitrogenPartialPressureOut = interstitialNitrogenFraction * ambientPressure

  const liftingGasMolesOut =
    toMolarFlux(v(film.hydrogenTransmission)) * area * Math.max(liftingPartialPressureIn, 0)

  const airMolesIn =
    toMolarFlux(v(film.nitrogenTransmission)) *
    area *
    Math.max(nitrogenPartialPressureOut - nitrogenPartialPressureIn, 0)

  const liftingMolarMass =
    contents.species === 'hydrogen' ? GAS.hydrogen.molarMass : GAS.helium.molarMass

  return {
    hydrogenLoss: liftingGasMolesOut * liftingMolarMass,
    airIngress: airMolesIn * GAS.dryAir.molarMass,
    liftingGasMolesOut,
    airMolesIn,
  }
}

/**
 * Annual fractional loss of lifting gas, the figure barrier films are compared
 * on and the one the validation gate checks.
 *
 * Expressed as a fraction of the gas initially in the cell, at the stated
 * ambient pressure, holding purity fixed. Real loss over a year is slightly
 * lower because purity decays and a less pure cell leaks more slowly, which the
 * mission integrator captures and this closed-form estimate does not.
 */
export const annualLossFraction = (
  film: BarrierFilm,
  area: SquareMeters,
  volume: number,
  ambientPressure: Pascals,
  contents: CellContents,
): number => {
  const rates = permeationRates(film, area, ambientPressure, contents)

  // Moles of lifting gas present, from the ideal gas law at cell conditions.
  /** @source ISA sea level temperature, the reference condition for this comparison. */
  const referenceTemperature = v(ISA.seaLevelTemperature)
  /** @source CODATA gas constant; exact since the 2019 SI redefinition. */
  const R = v(CONSTANTS.R)
  const molesPresent = (contents.purity * ambientPressure * volume) / (R * referenceTemperature)

  /** @derived Seconds in a mean Gregorian year, 365.2425 * 86400. */
  const secondsPerYear = 31556952

  return (rates.liftingGasMolesOut * secondsPerYear) / molesPresent
}

/**
 * Mass of hydrogen that must be manufactured per day to hold lift constant.
 *
 * This is the number that makes onboard electrolysis load-bearing rather than
 * clever. A ship that cannot replace what it leaks is a ship on a countdown, and
 * the countdown is set by a film property nobody has measured for hydrogen.
 */
export const dailyMakeupMass = (
  film: BarrierFilm,
  area: SquareMeters,
  ambientPressure: Pascals,
  contents: CellContents,
): Kilograms => kg(permeationRates(film, area, ambientPressure, contents).hydrogenLoss * SECONDS_PER_DAY)

/**
 * Total cell film area for a hull divided into `cellCount` cells.
 *
 * More cells means better damage tolerance and better trim control. It also
 * means more permeating area, because every internal bulkhead between two cells
 * is film on both sides, and that area is NOT free: it is added directly to the
 * leak rate and to the cover mass.
 *
 * This function is what turns the brief's open question about cell count into an
 * answerable one. The optimum is where the marginal damage tolerance stops
 * paying for the marginal leak.
 *
 * @param hullWettedArea External hull area, which bounds the outermost cells.
 * @param hullVolume Envelope volume.
 * @param length Hull length, for the average cross-section.
 * @param cellCount Number of gas cells.
 */
export const cellFilmArea = (
  hullWettedArea: SquareMeters,
  hullVolume: number,
  length: number,
  cellCount: number,
): SquareMeters => {
  if (cellCount < 1) throw new RangeError('A hull needs at least one gas cell.')

  // Average cross-section, from volume over length. Each internal bulkhead
  // carries film on both faces because it separates two cells.
  const averageCrossSection = hullVolume / length
  const bulkheads = cellCount - 1

  return (hullWettedArea + 2 * bulkheads * averageCrossSection) as SquareMeters
}

/**
 * Seam length in a set of gas cells, in metres.
 *
 * Two sources, and they scale differently, which is why this is computed rather
 * than carried as a length per unit area:
 *
 *   1. Panel seams. Film arrives on a roll of fixed converting width, so
 *      joining strips edge to edge costs one over that width for every square
 *      metre of cell, wherever the square metre is.
 *   2. Bulkhead attachment. Each internal bulkhead is a disc joined to the cell
 *      wall around its perimeter, on both faces, and the perimeter goes as the
 *      square root of the cross-section while the area goes as the whole thing.
 *
 * So the ratio between them moves with cell count and with fineness, and a
 * single per-area figure is only right for the ship it was fitted on. The build
 * module carried 0.84 m per square metre, described as "one over the roll width
 * plus the bulkhead face perimeters"; one over 1.37 is 0.73, so 0.11 of it was
 * a bulkhead term that had been fitted once and then frozen. At the baseline
 * this returns 0.83 per square metre, so the number was very nearly right and
 * would not have stayed right through a change of cell count, which is exactly
 * the change the build chapter proposes as a mitigation.
 *
 * @derived Circular cross-section assumed for the bulkhead perimeter, from the
 * average cross-sectional area: P = 2*sqrt(pi*A).
 */
export const cellSeamLength = (
  filmArea: SquareMeters,
  hullVolume: number,
  length: number,
  cellCount: number,
  convertingWidth: number,
): number => {
  if (cellCount < 1) throw new RangeError('A hull needs at least one gas cell.')
  if (convertingWidth <= 0) throw new RangeError('Film arrives on a roll of positive width.')

  const averageCrossSection = hullVolume / length
  const bulkheads = cellCount - 1
  const bulkheadPerimeter = 2 * Math.sqrt(Math.PI * averageCrossSection)

  return (filmArea as number) / convertingWidth + 2 * bulkheads * bulkheadPerimeter
}
