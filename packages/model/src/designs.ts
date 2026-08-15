import type { DesignPoint } from './design-point.js'

/**
 * The named design points.
 *
 * `baseline` is the working design. `minimum-viable` is the smallest ship that
 * might close the 365-day loop, and it is deliberately optimistic about the
 * things that are cheap to be optimistic about so that the sizing loop has
 * something to fail at. `stretch` is the five-year ship.
 *
 * None of these is a recommendation yet. They are starting points for the
 * sizing loop, which converges each of them from a partial spec and reports
 * divergence explicitly, because a diverging sizing loop means the mission is
 * infeasible with those assumptions and that is useful information rather than
 * an error.
 */

/** @source Degrees to radians, for the latitude fields below. */
const deg = (d: number): number => (d * Math.PI) / 180

export const BASELINE: DesignPoint = {
  id: 'baseline',
  name: 'Baseline',
  description:
    'The working design. 115 m at fineness ratio 5, stationed in the trade wind belt at 2,000 m, holding station against 8 m/s for two thirds of the day and drifting the rest. It was 90 m until the arrangement was drawn: once the compartments, the machinery and the array had real masses and real positions, 90 m came out 4.5 tonnes heavy and the smallest hull that closes with room for the mass growth every preliminary estimate suffers is 114 m.',
  hull: {
    length: 115,
    finenessRatio: 5,
    prismaticCoefficient: 0.69,
    cellCount: 12,
    filmId: 'para-aramid-mylar-laminate',
  },
  gas: {
    species: 'hydrogen',
    initialPurity: 0.99,
    purityFloor: 0.92,
    seaLevelFillFraction: 0.85,
  },
  power: {
    arrayCoverageHalfAngle: deg(75),
    // The band was 0.10 to 0.85 until the arrangement was drawn. Sliding it
    // forward to sit over the centre of buoyancy costs 56 m2, about 2.4 percent
    // of array area, and takes the standing trim offset from 0.84 percent of
    // length to 0.21 at the baseline — and from a failure to a pass at 125 m and
    // beyond, where the array is heavy enough to drag the centre of gravity aft
    // on its own. The array turns out to be a trim decision as much as an energy
    // one, which is not visible until the masses have positions.
    arrayForwardStation: 0.06,
    arrayAftStation: 0.78,
    moduleEfficiency: 0.17,
    moduleArealMass: 1.2,
    fuelCellRating: 30000,
    electrolyzerRating: 40000,
    batteryEnergy: 150e3 * 3600,
  },
  loads: {
    habitatPower: 900,
    crew: 2,
  },
  mission: {
    latitude: deg(15),
    altitude: 2000,
    stationKeepingWind: 8,
    stationKeepingDutyCycle: 0.65,
    clearSkyFraction: 0.68,
  },
}

export const MINIMUM_VIABLE: DesignPoint = {
  ...BASELINE,
  id: 'minimum-viable',
  name: 'Minimum viable',
  description:
    'The smallest ship that might close the 365-day loop. Smaller hull, fewer cells to cut permeating area, a leaner habitat load, and a willingness to drift for half the day. If this does not close, the answer for the baseline is about hull size rather than about technology.',
  hull: { ...BASELINE.hull, length: 65, cellCount: 8 },
  loads: { habitatPower: 600, crew: 2 },
  mission: {
    ...BASELINE.mission,
    stationKeepingWind: 6,
    stationKeepingDutyCycle: 0.5,
  },
}

export const STRETCH: DesignPoint = {
  ...BASELINE,
  id: 'stretch',
  name: 'Stretch',
  description:
    'The five-year ship. Larger hull for a better mass fraction, more array, a bigger battery buffer, and enough margin to hold station against 12 m/s continuously rather than drifting.',
  hull: { ...BASELINE.hull, length: 125, cellCount: 14 },
  power: {
    ...BASELINE.power,
    fuelCellRating: 60000,
    electrolyzerRating: 80000,
    batteryEnergy: 300e3 * 3600,
  },
  loads: { habitatPower: 1400, crew: 2 },
  mission: {
    ...BASELINE.mission,
    stationKeepingWind: 12,
    stationKeepingDutyCycle: 0.9,
  },
}

export const DESIGN_POINTS: readonly DesignPoint[] = [BASELINE, MINIMUM_VIABLE, STRETCH]

export const designPoint = (id: string): DesignPoint => {
  const found = DESIGN_POINTS.find((d) => d.id === id)
  if (!found) throw new Error(`Unknown design point "${id}".`)
  return found
}
