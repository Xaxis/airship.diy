import { PHOTOVOLTAIC, v } from '@airship/data'

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
    'The working design: a fully buoyant rigid hull at fineness ratio 5, stationed in the trade wind belt at 2,000 m, holding station against 8 m/s for two thirds of the day and drifting the rest. It carries four things a conventional airship does not: outboard wings that carry weight rather than buy efficiency, a retractable centreboard that is what makes boat mode exist at all, a seawater ballast loop that tracks the diurnal superheat swing, and four ducted propulsors large enough to lift the vehicle off the water on its own thrust. The length is not a styling choice, it is where the mass statement closes with a reserve, and it has moved twice: once when the compartments acquired real positions and once when the stores bay was sized for a year of food rather than five months.',
  hull: {
    /**
     * 118 m, and each of the three metres since 115 was bought by something
     * specific.
     *
     * The hull is not a styling choice: it is the length at which the mass
     * statement closes with a reserve. It was 90 m while the mass budget was a
     * fraction, 115 once the compartments had positions, and 118 once the food
     * was a year rather than five months. Two people eat 584 kg of dry staples
     * in a year, or 1,530 kg of the same nutrition packaged, and the bay that
     * was drawn held 560.
     */
    length: 118,
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
    /**
     * 32 degrees either side of the crown, not the 75 this design point carried
     * until the array acquired its real mass.
     *
     * THE ARRAY WAS CARRYING 574 PERCENT OF THE ENERGY IT NEEDED. Coverage had
     * never been optimised: 75 degrees was chosen as "most of the upper hull"
     * and left there, and while the module was assumed to weigh 1.2 kg/m2 it
     * cost little enough that nobody looked. At the real 2.6 it costs 6,682 kg,
     * it is the only large mass ABOVE the hull axis, and it dragged the pendulum
     * lever from 2.84 m down to 1.33, which is below anything airship practice
     * would fly.
     *
     * Cutting to 32 degrees restores the lever, raises the lift margin, and
     * still leaves surplus on the worst day of the year: the energy the wider
     * band buys is energy the mission never needed. The figures move with every
     * other change to the vehicle, so ask `massStatement` and
     * `validateArrangement` for them rather than reading them here. This
     * paragraph carried three of them and all three had gone stale.
     *
     * It also makes the array easier to build: a strip along the crown rather
     * than a wrap reaching almost to the equator, where the modules are most
     * oblique to the sun and contribute least per unit of mass.
     */
    arrayCoverageHalfAngle: deg(32),
    // The band was 0.10 to 0.85 until the arrangement was drawn. Sliding it
    // forward to sit over the centre of buoyancy costs 56 m2, about 2.4 percent
    // of array area, and takes the standing trim offset from 0.84 percent of
    // length to 0.21 at the baseline — and from a failure to a pass at 125 m and
    // beyond, where the array is heavy enough to drag the centre of gravity aft
    // on its own. The array turns out to be a trim decision as much as an energy
    // one, which is not visible until the masses have positions.
    arrayForwardStation: 0.04,
    arrayAftStation: 0.7,
    /**
     * THE EFFICIENCY OF THE MODULE THAT IS ACTUALLY BEING BOUGHT, not a band
     * nominal. It was 0.17 while the areal mass and the price were both taken
     * from the MiaSole FLEX-03N datasheet, so the energy model rated an array at
     * 17 percent that the bill of materials was buying at 14.46. The site then
     * reported a peak output above the nameplate of the hardware, which is not
     * possible. Reading it from the data means the three specifications cannot
     * drift apart again.
     */
    moduleEfficiency: v(PHOTOVOLTAIC.cigsEfficiency),
    /**
     * 2.6 kg/m2, not the 1.2 this design point carried until the bill of
     * materials was priced.
     *
     * THE ARRAY AT 1.2 kg/m2 DOES NOT EXIST AS A PRODUCT. The lightest flexible
     * module with a published datasheet is the MiaSole FLEX-03N at 1.9 kg/m2
     * bare and 2.6 kg/m2 with the adhesive that actually attaches it (part
     * 302-191943-00_B). Sunman eArc is 2.89. Everything below 1.9 is a
     * laboratory tandem cell rather than something anyone can buy.
     *
     * The bonded figure is the one used, because a module that is not attached
     * to the hull is not on the vehicle. On 2,321 m2 of array that is 6,036 kg
     * against 2,786, and it took the lift margin from 20.9 percent to 6.8 at
     * 115 m. It is a MASS failure before it is a cost one, and it is the second
     * time this project has grown the hull because a number got honest.
     */
    moduleArealMass: 2.6,
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
    /**
     * The stretch mission needs the array the baseline gave up, and then some.
     *
     * Holding station against 12 m/s for 90 percent of the day rather than 8
     * m/s for 65 is roughly four times the propulsive energy, because power goes
     * as the cube of speed. At the baseline's 32 degrees of coverage this design
     * misses its annual energy by 47 percent; it needs 70 degrees to reach
     * break-even and 75 to have any margin at all.
     *
     * AND THAT IS WHAT LIMITS THE STRETCH GOAL, not the energy. At 75 degrees
     * the array is the only large mass above the hull axis, and widening the
     * band drives the pendulum lever down towards the fraction of hull radius
     * that airship practice treats as a floor. Compare the two design points'
     * `pendulum-lever` findings for the current numbers; the ratio is what
     * matters and it moves whenever the array or the keel masses do.
     *
     * The five-year ship is not energy-limited. It is PENDULUM-limited, and
     * that is a constraint no amount of array area or battery capacity
     * relieves.
     */
    arrayCoverageHalfAngle: deg(75),
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
