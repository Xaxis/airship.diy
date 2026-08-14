/**
 * Branded SI quantities.
 *
 * Everything internal to this repository is SI. Not "mostly SI", not "SI except
 * altitude in feet because aviation". Conversion happens once, at the display
 * boundary, in the website.
 *
 * The reason for branding rather than a bare `number` is that this model mixes
 * quantities whose magnitudes overlap. A hull is 90 m long, a gas cell holds
 * 90 m3, a fuel cell puts out 90 kW, and permeation runs at 90 g/day. Every one
 * of those is `90` to a compiler that only sees numbers, and a transposition
 * between them produces an answer that is wrong by a factor of nothing at all,
 * which is the hardest kind of wrong to notice.
 *
 * Branding is erased at runtime. A `Meters` IS a number; the tag exists only in
 * the type system, so there is no arithmetic cost and no wrapper allocation.
 *
 * The deliberate friction: adding two `Meters` yields a plain `number`, because
 * TypeScript widens on arithmetic. You re-brand at the point you hand the result
 * back out. Inside a single function, work in raw numbers and brand the return.
 * Do not fight the system by branding every intermediate.
 */

declare const DIMENSION: unique symbol

/** A number tagged with a dimension. Erased at runtime. */
export type Quantity<D extends string> = number & { readonly [DIMENSION]: D }

// --- base SI ----------------------------------------------------------------

export type Meters = Quantity<'m'>
export type Kilograms = Quantity<'kg'>
export type Seconds = Quantity<'s'>
export type Kelvin = Quantity<'K'>
export type Amperes = Quantity<'A'>
export type Moles = Quantity<'mol'>

// --- geometry ---------------------------------------------------------------

export type SquareMeters = Quantity<'m^2'>
export type CubicMeters = Quantity<'m^3'>
export type Radians = Quantity<'rad'>

// --- mechanics --------------------------------------------------------------

export type MetersPerSecond = Quantity<'m/s'>
export type MetersPerSecondSquared = Quantity<'m/s^2'>
export type RadiansPerSecond = Quantity<'rad/s'>
export type Newtons = Quantity<'N'>
export type NewtonMeters = Quantity<'N.m'>
export type Pascals = Quantity<'Pa'>
export type KilogramsPerCubicMeter = Quantity<'kg/m^3'>
export type KilogramsPerSquareMeter = Quantity<'kg/m^2'>
export type KilogramsPerSecond = Quantity<'kg/s'>
export type KilogramMeterSquared = Quantity<'kg.m^2'>
export type PascalSeconds = Quantity<'Pa.s'>

// --- energy and power -------------------------------------------------------

export type Joules = Quantity<'J'>
export type Watts = Quantity<'W'>
export type WattsPerSquareMeter = Quantity<'W/m^2'>
export type WattsPerMeterKelvin = Quantity<'W/(m.K)'>
export type WattsPerSquareMeterKelvin = Quantity<'W/(m^2.K)'>
export type JoulesPerKilogramKelvin = Quantity<'J/(kg.K)'>
export type JoulesPerKilogram = Quantity<'J/kg'>
export type Volts = Quantity<'V'>

// --- material and chemistry -------------------------------------------------

export type KilogramsPerMole = Quantity<'kg/mol'>
export type MolesPerSecond = Quantity<'mol/s'>

/**
 * Permeability of a barrier film to a gas, as the model uses it:
 * flux = permeability * area * partial-pressure difference / thickness.
 *
 * Barrier films are quoted in a zoo of units (cc/m2/day/atm, barrer,
 * cc.mm/m2.day.atm) and mixing them is the single likeliest way to be wrong
 * about the leak rate by three orders of magnitude. The conversions in
 * `packages/data` are the only place those units are allowed to appear.
 */
export type PermeabilityCoefficient = Quantity<'mol/(m.s.Pa)'>

// --- dimensionless ----------------------------------------------------------

/**
 * Ratios that are physically dimensionless but must not be interchanged.
 * A fill fraction and a purity are both "0.95" and mean nothing alike.
 */
export type Fraction = Quantity<'1'>
export type Efficiency = Quantity<'eta'>
export type Purity = Quantity<'purity'>
export type FillFraction = Quantity<'fill'>
export type ReynoldsNumber = Quantity<'Re'>
export type MachNumber = Quantity<'Ma'>
export type DragCoefficient = Quantity<'C_D'>

// --- time and geography -----------------------------------------------------

export type Days = Quantity<'d'>
export type Hours = Quantity<'h'>
export type Years = Quantity<'a'>
export type Degrees = Quantity<'deg'>

// --- constructors -----------------------------------------------------------
//
// One per dimension. They are identity functions; their entire job is to make
// the brand explicit at the point a raw number becomes a physical quantity, so
// that `m(x)` in a diff is a visible claim about what x means.

const brand = <D extends string>(value: number): Quantity<D> => value as Quantity<D>

export const m = (v: number): Meters => brand(v)
export const kg = (v: number): Kilograms => brand(v)
export const s = (v: number): Seconds => brand(v)
export const K = (v: number): Kelvin => brand(v)
export const A = (v: number): Amperes => brand(v)
export const mol = (v: number): Moles => brand(v)

export const m2 = (v: number): SquareMeters => brand(v)
export const m3 = (v: number): CubicMeters => brand(v)
export const rad = (v: number): Radians => brand(v)

export const mps = (v: number): MetersPerSecond => brand(v)
export const mps2 = (v: number): MetersPerSecondSquared => brand(v)
export const radps = (v: number): RadiansPerSecond => brand(v)
export const N = (v: number): Newtons => brand(v)
export const Nm = (v: number): NewtonMeters => brand(v)
export const Pa = (v: number): Pascals => brand(v)
export const kgPerM3 = (v: number): KilogramsPerCubicMeter => brand(v)
export const kgPerM2 = (v: number): KilogramsPerSquareMeter => brand(v)
export const kgPerS = (v: number): KilogramsPerSecond => brand(v)
export const kgM2 = (v: number): KilogramMeterSquared => brand(v)
export const PaS = (v: number): PascalSeconds => brand(v)

export const J = (v: number): Joules => brand(v)
export const W = (v: number): Watts => brand(v)
export const WPerM2 = (v: number): WattsPerSquareMeter => brand(v)
export const WPerMK = (v: number): WattsPerMeterKelvin => brand(v)
export const WPerM2K = (v: number): WattsPerSquareMeterKelvin => brand(v)
export const JPerKgK = (v: number): JoulesPerKilogramKelvin => brand(v)
export const JPerKg = (v: number): JoulesPerKilogram => brand(v)
export const V = (v: number): Volts => brand(v)

export const kgPerMol = (v: number): KilogramsPerMole => brand(v)
export const molPerS = (v: number): MolesPerSecond => brand(v)
export const permeability = (v: number): PermeabilityCoefficient => brand(v)

export const fraction = (v: number): Fraction => brand(v)
export const efficiency = (v: number): Efficiency => brand(v)
export const purity = (v: number): Purity => brand(v)
export const fill = (v: number): FillFraction => brand(v)
export const reynolds = (v: number): ReynoldsNumber => brand(v)
export const mach = (v: number): MachNumber => brand(v)
export const dragCoefficient = (v: number): DragCoefficient => brand(v)

export const days = (v: number): Days => brand(v)
export const hours = (v: number): Hours => brand(v)
export const years = (v: number): Years => brand(v)
export const deg = (v: number): Degrees => brand(v)

/**
 * Strip the brand. Use inside a function body where you are doing arithmetic
 * across dimensions and the intermediate has no meaningful name.
 *
 * This is an escape hatch and it is supposed to look like one. If `raw` appears
 * in a public signature, the signature is wrong.
 */
export const raw = (v: Quantity<string>): number => v

// --- display boundary -------------------------------------------------------
//
// The ONLY place non-SI units are permitted. Every one of these is a conversion
// out, never a conversion in, because a value that enters the model in feet is a
// value somebody will eventually read as metres.

/** Exact by definition (international foot, 1959). */
const METERS_PER_FOOT = 0.3048
/** Exact by definition (international avoirdupois pound, 1959). */
const KILOGRAMS_PER_POUND = 0.45359237
/** Exact by definition (international nautical mile). */
const METERS_PER_NAUTICAL_MILE = 1852
const SECONDS_PER_HOUR = 3600
const HOURS_PER_DAY = 24
/** Mean Gregorian year, the convention used for all annualised rates here. */
const DAYS_PER_YEAR = 365.2425

export const toFeet = (v: Meters): number => v / METERS_PER_FOOT
export const fromFeet = (v: number): Meters => m(v * METERS_PER_FOOT)
export const toPounds = (v: Kilograms): number => v / KILOGRAMS_PER_POUND
export const fromPounds = (v: number): Kilograms => kg(v * KILOGRAMS_PER_POUND)
export const toTonnes = (v: Kilograms): number => v / 1000
export const toCubicFeet = (v: CubicMeters): number => v / METERS_PER_FOOT ** 3
export const fromCubicFeet = (v: number): CubicMeters => m3(v * METERS_PER_FOOT ** 3)
export const toKnots = (v: MetersPerSecond): number => (v * SECONDS_PER_HOUR) / METERS_PER_NAUTICAL_MILE
export const fromKnots = (v: number): MetersPerSecond => mps((v * METERS_PER_NAUTICAL_MILE) / SECONDS_PER_HOUR)
export const toKilometersPerHour = (v: MetersPerSecond): number => (v * SECONDS_PER_HOUR) / 1000
export const toCelsius = (v: Kelvin): number => v - 273.15
export const fromCelsius = (v: number): Kelvin => K(v + 273.15)
export const toKilowattHours = (v: Joules): number => v / (1000 * SECONDS_PER_HOUR)
export const fromKilowattHours = (v: number): Joules => J(v * 1000 * SECONDS_PER_HOUR)
export const toBar = (v: Pascals): number => v / 1e5
export const fromBar = (v: number): Pascals => Pa(v * 1e5)
export const toDegrees = (v: Radians): number => (v * 180) / Math.PI
export const fromDegrees = (v: number): Radians => rad((v * Math.PI) / 180)

export const secondsToDays = (v: Seconds): Days => days(v / (SECONDS_PER_HOUR * HOURS_PER_DAY))
export const daysToSeconds = (v: Days): Seconds => s(v * SECONDS_PER_HOUR * HOURS_PER_DAY)
export const daysToYears = (v: Days): Years => years(v / DAYS_PER_YEAR)
export const yearsToDays = (v: Years): Days => days(v * DAYS_PER_YEAR)

export const SI = {
  SECONDS_PER_HOUR,
  HOURS_PER_DAY,
  DAYS_PER_YEAR,
  METERS_PER_FOOT,
  KILOGRAMS_PER_POUND,
  METERS_PER_NAUTICAL_MILE,
} as const
