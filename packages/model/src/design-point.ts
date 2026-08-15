/**
 * The parameter tree.
 *
 * One source of truth. The website reads this, the solvers integrate it, the
 * documentation renders from it. If a number appears in prose and also here,
 * the prose is wrong by construction.
 *
 * Everything is SI and everything is a plain number at this layer: branding
 * lives at the function boundaries in `packages/core`, and a deeply branded
 * configuration object is miserable to write by hand and to serialise.
 *
 * The tree is deliberately flat-ish and named after the physical subsystems in
 * the brief, so that a person reading the brief can find the parameter they are
 * looking for without a map.
 */

export interface HullParameters {
  /** Overall length, m. The single most important number in the design. */
  readonly length: number
  /** Length over maximum diameter. Drag optimum is around 4.5 to 6. */
  readonly finenessRatio: number
  /** Fullness. Real airship hulls sit near 0.69. */
  readonly prismaticCoefficient: number
  /**
   * Number of gas cells. More cells means better damage tolerance and better
   * trim control, and more permeating area, more mass and more chafing risk.
   * The optimum is an output of the model, not an input to it, and this is the
   * value the sweep varies.
   */
  readonly cellCount: number
  /** Barrier film id, from packages/data. */
  readonly filmId: string
}

export interface GasParameters {
  readonly species: 'hydrogen' | 'helium'
  /** Purity at fill. */
  readonly initialPurity: number
  /**
   * Purity below which the cell must be vented and refilled rather than topped
   * up. Topping up a contaminated cell adds lift but never restores purity,
   * because the contaminant does not leave.
   */
  readonly purityFloor: number
  /** Fill fraction at sea level. Sets pressure height. */
  readonly seaLevelFillFraction: number
}

export interface PowerParameters {
  /** Half-angle of the photovoltaic band, measured from the top of the hull. */
  readonly arrayCoverageHalfAngle: number
  readonly arrayForwardStation: number
  readonly arrayAftStation: number
  /** Module conversion efficiency at the rating condition. */
  readonly moduleEfficiency: number
  /** Areal mass of the module as installed, kg/m2. */
  readonly moduleArealMass: number
  /** Fuel cell continuous rating, W. */
  readonly fuelCellRating: number
  /** Electrolyzer continuous input rating, W. */
  readonly electrolyzerRating: number
  /** Battery buffer usable energy, J. */
  readonly batteryEnergy: number
}

export interface LoadParameters {
  /**
   * Continuous habitat and systems load, W. Lighting, refrigeration, water
   * processing, computing, avionics, and the parasitic loads of everything
   * else. Not propulsion.
   */
  readonly habitatPower: number
  /** Crew aboard. Drives food, water and metabolic heat. */
  readonly crew: number
}

export interface MissionParameters {
  /** Latitude the ship is stationed at, radians. Positive north. */
  readonly latitude: number
  /** Nominal cruise altitude, m geopotential. */
  readonly altitude: number
  /**
   * Wind the ship must hold station against, m/s. Power goes as the CUBE of
   * this, so it is the most leveraged single number in the energy budget.
   */
  readonly stationKeepingWind: number
  /**
   * Fraction of the day spent actively holding station. A ship that is willing
   * to drift with the wind for part of the day spends nothing on propulsion for
   * that part, which is how Loon operated and is the cheapest energy saving
   * available.
   */
  readonly stationKeepingDutyCycle: number
  /**
   * Fraction of clear-sky irradiance actually received, averaged over the year.
   *
   * The solar model is clear-sky. Publishing a clear-sky energy margin as if it
   * were the real one would be exactly the kind of overclaim this repository
   * exists to prevent, so the derate is an explicit parameter rather than a
   * footnote.
   *
   * Roughly 0.60 to 0.75 in the trade wind belts, worse in the ITCZ where deep
   * convection is persistent, better over the subtropical highs. It is a
   * statistical figure, not a weather model: a deterministic cloud model at this
   * stage would be false precision.
   */
  readonly clearSkyFraction: number
}

export interface DesignPoint {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly hull: HullParameters
  readonly gas: GasParameters
  readonly power: PowerParameters
  readonly loads: LoadParameters
  readonly mission: MissionParameters
}
