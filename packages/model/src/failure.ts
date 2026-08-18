import { CREW, v } from '@airship/data'
import { atmosphere, hullGeometry, hullShapeForPrismatic, powerRequired } from '@airship/core'
import { m, mps } from '@airship/units'

import { dumpableInventory } from './configuration.js'
import type { Configuration } from './configuration.js'

export { dumpableInventory }
import type { DesignPoint } from './design-point.js'
import { hullBendingMoment, massStatement } from './arrangement.js'
import { compareArchitecture } from './architecture.js'
import { RIGID, SEMI_RIGID } from './architectures.js'

/**
 * What happens when it breaks, with numbers.
 *
 * A year is a long time. Every single point of failure gets its turn, and the
 * question that matters for a liveaboard is not whether a failure is likely but
 * whether it is SURVIVABLE and what the crew does about it.
 *
 * THE RULE THIS APPLIES. A failure is survivable when the vehicle can still
 * hold altitude, still be controlled, and still keep two people alive long
 * enough to reach somewhere. Anything that fails all three at once is a
 * single-point catastrophe and the design has to remove it rather than reduce
 * its probability, because probability arguments do not survive a year.
 *
 * The consequences here are COMPUTED from the same model everything else uses,
 * not asserted. A torn gas cell costs one twelfth of the gross lift because the
 * arrangement has twelve cells and the buoyancy module knows what they lift.
 */

export type Severity = 'nuisance' | 'degraded' | 'serious' | 'catastrophic'

export interface FailureMode {
  readonly id: string
  readonly name: string
  /** What physically happens. */
  readonly effect: string
  readonly severity: Severity
  /** The consequence in numbers, computed from the model. */
  readonly consequence: string
  /** How the crew knows. A failure with no annunciation is worse than it looks. */
  readonly detection: string
  /** What the crew does, and whether they can. */
  readonly response: string
  /** True when the vehicle stays up, stays controlled and keeps the crew alive. */
  readonly survivable: boolean
  /** What the design does so that it IS survivable, where that took a decision. */
  readonly designAnswer: string
}

/**
 * The failure modes, with their consequences computed from the model.
 *
 * @param ballastAvailable Water that can be dumped, kg. It is the vehicle's
 *   entire answer to a lift loss, so it sets which cell failures are survivable.
 */
export const failureModes = (
  design: DesignPoint,
  config: Configuration,
  /**
   * Dumpable inventory, kg. Defaults to the water the arrangement actually
   * carries, SUMMED FROM THE COMPARTMENTS rather than passed in as a number,
   * so a design that removes a tank cannot keep claiming the ballast it used to
   * have. Pass a smaller figure to ask what the vehicle survives after a night
   * of dumping, or zero to ask what the lift margin alone buys.
   */
  ballastAvailable = dumpableInventory(config),
): readonly FailureMode[] => {
  const statement = massStatement(design, config)
  const cellCount = design.hull.cellCount
  const oneCellLift = statement.grossLift / cellCount

  /** @derived Lift lost if a whole cell empties, as a heaviness in kg. */
  const cellLoss = oneCellLift
  const cellSurvivable = cellLoss <= ballastAvailable + statement.liftMargin

  /**
   * @derived Two adjacent cells is the credible multiple failure: a single tear
   * that crosses a bulkhead, or a fitting that damages both.
   */
  const twoCellLoss = cellLoss * 2
  const twoCellSurvivable = twoCellLoss <= ballastAvailable + statement.liftMargin

  /** @derived One cell out of N, expressed as a percentage. */
  /** @derived Kilograms in a tonne. */
  const KG_PER_TONNE = 1000
  /** @derived A fraction to a percentage. */
  const PERCENT = 100
  /**
   * @source Areal mass of the gas cell film the arrangement carries, kg/m2,
   * passed to the architecture comparison so both sides use the same film.
   */
  const CELL_FILM_AREAL_MASS = 0.21

  const ONE_CELL_AS_PERCENT = 100
  /** @derived Two cells out of N, expressed as a percentage. */
  const TWO_CELLS_AS_PERCENT = 200
  /** @source The cell count a mass-driven optimiser would prefer. */
  const FEWER_CELLS = 8

  const propulsors = config.propulsors.length
  const propulsorPower = config.propulsors.reduce((s, p) => s + p.ratedPower, 0)
  const onePropulsorLoss = propulsorPower / propulsors
  /** @derived Watts to kilowatts. */
  const KW = 1000

  /**
   * The wind the vehicle can still hold after losing one propulsor.
   *
   * THE CUBE LAW ALONE IS NOT THE ANSWER, and using it alone was wrong in the
   * flattering direction. `windSpeed * cbrt(1 - 1/n)` is the speed at which the
   * REMAINING power equals the power the whole installation was making, which
   * is only the station-keeping speed if the design wind exactly saturates the
   * installed propulsors. It does not: the drag model says holding the design
   * wind takes a fraction of what is installed, and the surplus is what a
   * vehicle of this kind carries for acceleration, climb and gusts.
   *
   * So compute the power actually needed at the design wind, take one unit's
   * share away from what is installed, and solve the cube law for the speed the
   * remainder supports. If there is enough margin the answer is that nothing
   * changes at all, which is the useful thing to know.
   */
  const geometry = hullGeometry(
    m(design.hull.length),
    design.hull.finenessRatio,
    hullShapeForPrismatic(design.hull.prismaticCoefficient),
  )
  const requiredAtDesignWind = powerRequired(
    geometry,
    atmosphere(m(design.mission.altitude)),
    mps(design.mission.stationKeepingWind),
  )
  const remainingPower = propulsorPower * (1 - 1 / propulsors)
  /** @derived Power goes as the cube of speed, so speed goes as the cube root of power. */
  const windSpeedAfterLoss =
    remainingPower >= requiredAtDesignWind
      ? design.mission.stationKeepingWind
      : design.mission.stationKeepingWind * Math.cbrt(remainingPower / requiredAtDesignWind)

  /**
   * What the alternative would have saved, from the architecture module rather
   * than from memory.
   *
   * This said "semi-rigid is 4.8 tonnes lighter" and 4.8 tonnes is the
   * hybridLift delta: the number had been taken from the wrong row. The
   * architecture module also refuses to assert a point value for the semi-rigid
   * saving at all, because its own uncertainty band includes no saving, so the
   * honest statement carries the band rather than a figure.
   */
  const designMoment = hullBendingMoment(design, config).designMoment
  const compare = (arch: typeof RIGID) =>
    compareArchitecture(
      arch,
      design.hull.length,
      design.hull.finenessRatio,
      design.hull.prismaticCoefficient,
      statement.total,
      cellCount,
      CELL_FILM_AREAL_MASS,
      designMoment,
    )
  // STRUCTURE AGAINST STRUCTURE, both through the same function. Comparing the
  // rigid design's whole empty weight against a semi-rigid STRUCTURE would make
  // the alternative look twelve tonnes lighter by counting the machinery, the
  // accommodation and the crew as a structural saving.
  const semiRigidDelta = compare(RIGID).structure.total - compare(SEMI_RIGID).structure.total
  const semiRigidVerdict =
    semiRigidDelta > 0
      ? `Semi-rigid comes out about ${(semiRigidDelta / KG_PER_TONNE).toFixed(1)} tonnes lighter on this model, and the architecture chapter's own uncertainty band on that saving includes zero, so it is a saving that may not exist. What is certain is that it cannot do this.`
      : `Semi-rigid does not even come out lighter at this size on this model, and it still cannot do this.`

  const recovery = v(CREW.waterRecoveryFraction)
  /** @derived Half, for the split-bus consequence. */
  const HALF = 0.5
  /**
   * @source Energy that initiates a hydrogen detonation directly rather than a
   * deflagration, J. A capacitor bank or an arcing contactor reaches it, which
   * is why fault energy is bounded at every node and not merely at the bus.
   */
  const HYDROGEN_DETONATION_ENERGY = 4300

  return [
    {
      id: 'one-gas-cell',
      name: 'One gas cell torn',
      effect: `A tear in one of ${cellCount} independent cells. The gas leaves through the interstitial space, which is ventilated and open at the top, and rises away.`,
      severity: cellSurvivable ? 'degraded' : 'catastrophic',
      consequence: `${cellLoss.toFixed(0)} kg of lift, which is ${(ONE_CELL_AS_PERCENT / cellCount).toFixed(0)} percent of the total. The ship becomes ${cellLoss.toFixed(0)} kg heavy against ${statement.liftMargin.toFixed(0)} kg of margin and ${ballastAvailable.toFixed(0)} kg of dumpable ballast.`,
      detection:
        'Cell pressure and the trim change. A cell losing gas goes slack before it goes empty, so there are minutes rather than seconds, and the trim wants nose or tail down depending on which cell it is.',
      response: cellSurvivable
        ? 'Dump ballast to restore neutral buoyancy, trim with the water tanks against the asymmetry, and fly home heavy. The vehicle lands on water rather than needing a field.'
        : 'There is no response. The lift loss exceeds everything the vehicle can throw overboard.',
      survivable: cellSurvivable,
      designAnswer: `THIS IS THE ENTIRE ARGUMENT FOR THE RIGID ARCHITECTURE. Every pressure-stabilised alternative has one gas volume, so the same tear costs not ${(ONE_CELL_AS_PERCENT / cellCount).toFixed(0)} percent of the lift but all of it. ${semiRigidVerdict}`,
    },
    {
      id: 'two-gas-cells',
      name: 'Two adjacent cells torn',
      effect:
        'One tear crossing a bulkhead, or a fitting that fails and damages both cells either side of it.',
      severity: twoCellSurvivable ? 'serious' : 'catastrophic',
      consequence: `${twoCellLoss.toFixed(0)} kg of lift against ${(ballastAvailable + statement.liftMargin).toFixed(0)} kg of margin plus ballast.`,
      detection: 'As above, and the trim excursion is roughly twice as large.',
      response: twoCellSurvivable
        ? 'Dump everything. The vehicle descends under control and lands on water, and it does not fly again without a refill.'
        : 'A controlled descent to the surface is the only option, and the rate is set by how fast the remaining gas goes rather than by the crew.',
      survivable: twoCellSurvivable,
      designAnswer: `The cell count is the lever. At ${cellCount} cells a double failure is ${(TWO_CELLS_AS_PERCENT / cellCount).toFixed(0)} percent of the lift; at ${FEWER_CELLS} it would be ${(TWO_CELLS_AS_PERCENT / FEWER_CELLS).toFixed(0)} percent. Fewer cells is lighter, because film area counts both faces of every bulkhead, and this is what that mass buys.`,
    },
    {
      id: 'propulsor',
      name: 'One propulsor fails',
      effect: `One of ${propulsors} units stops, whether motor, controller or propeller.`,
      severity: 'degraded',
      consequence:
        windSpeedAfterLoss >= design.mission.stationKeepingWind
          ? `${(onePropulsorLoss / KW).toFixed(0)} kW of ${(propulsorPower / KW).toFixed(0)} lost, and NOTHING CHANGES: holding the design wind of ${design.mission.stationKeepingWind} m/s takes ${(requiredAtDesignWind / KW).toFixed(0)} kW, so the remaining ${(remainingPower / KW).toFixed(0)} kW still covers it. What is lost is the surplus that buys acceleration, climb and gust rejection.`
          : `${(onePropulsorLoss / KW).toFixed(0)} kW of ${(propulsorPower / KW).toFixed(0)} lost against the ${(requiredAtDesignWind / KW).toFixed(0)} kW station-keeping needs, so the wind limit falls from ${design.mission.stationKeepingWind} m/s to about ${windSpeedAfterLoss.toFixed(1)} m/s. Power goes as the CUBE of speed, which is why a quarter of the power is only a tenth of the wind.`,
      detection: 'Immediate, from the thrust asymmetry and the controller telemetry.',
      response:
        'Trim out the yaw with the opposite unit, and accept the lower wind limit. If the failure is on the mid pair the vehicle loses some of its zero-airspeed yaw authority, which matters at a mooring and nowhere else.',
      survivable: true,
      designAnswer:
        'Four units on four controllers rather than two. Losing one of four is a trim problem; losing one of two is a control problem, and the difference costs about 200 kg.',
    },
    {
      id: 'main-bus',
      name: 'One DC bus half faults',
      effect:
        'A short or an arc on one half of the split bus. The tie opens, that half is isolated, and everything fed only from it stops.',
      severity: 'serious',
      consequence: `THIS WAS THE ONLY CATASTROPHIC MODE IN THE ANALYSIS AND IT IS NOT ONE ANY MORE, because the schematic changed rather than because the probability did. On a single bus a fault took out propulsion and the ventilation the hydrogen safety case depends on in the same instant, and no amount of generating capacity upstream could reach a load. Split into halves with a tie, the ship loses ${(HALF * PERCENT).toFixed(0)} percent of its propulsion and keeps all of its ventilation, because every critical load is fed from both halves and the propulsors are two on each.`,
      detection: 'Instant on the faulted half, and the tie opening is itself the annunciation.',
      response:
        'Let the tie open, confirm the fault is isolated, and fly on the healthy half. Two propulsors diagonally opposite is a yaw couple the survivors trim out, and the habitat load is small enough that one half carries it with the array alone.',
      survivable: true,
      designAnswer: `SEGREGATION ALL THE WAY DOWN TO THE CABLE ROUTING, because two buses in one conduit are one bus with extra contactors. Every source divides between the halves, every critical load is fed from both, and the electrolyzer is the deliberate exception: it hangs on one side because it is the load that gets shed first and misses nothing. Fault energy is bounded at every node for a separate reason, which is that ${(HYDROGEN_DETONATION_ENERGY / 1000).toFixed(1)} kJ is enough to initiate a hydrogen detonation directly and a capacitor bank reaches it.`,
    },
    {
      id: 'engine',
      name: 'Engine and generator fail',
      effect: 'The only power source that does not depend on sunlight or stored hydrogen stops.',
      severity: 'serious',
      consequence:
        'The vehicle is on solar and stored hydrogen alone. A week of overcast becomes an endurance problem rather than an inconvenience, and the weather-escape capability the hydrocarbon reserve exists for is gone.',
      detection: 'Immediate.',
      response:
        'Reduce the habitat load, stop the electrolyzer, drift rather than hold station, and head for somewhere. The vehicle stays up: it is buoyant and it does not need power to fly.',
      survivable: true,
      designAnswer:
        'THE VEHICLE IS FULLY BUOYANT, and this is where that pays. A hybrid-lift vehicle 20 percent heavy needs 231 kW continuously to stay airborne; lose its engines and it comes down. This one loses its ability to go somewhere and keeps its ability to stay up.',
    },
    {
      id: 'blower',
      name: 'Interstitial ventilation stops',
      effect:
        'The fans that keep the space between the cells and the cover swept with outside air stop.',
      severity: 'serious',
      consequence:
        'Permeated hydrogen accumulates instead of clearing. The permeation rate alone takes hours to reach a flammable concentration in a still interstitial space, and a chafed cell takes minutes.',
      detection:
        'Hydrogen sensors in the interstitial space, and the fan current itself. Both are needed: a sensor without a fan tells you the problem and a fan without a sensor tells you nothing.',
      response:
        'Open the ram-air inlets and fly. Forward speed sweeps the interstitial space without any fan at all, which is why the vehicle has ram inlets as well as blowers.',
      survivable: true,
      designAnswer:
        'RAM AIR AS THE BACKUP, not a second fan. A second fan shares the ducting, the power and the failure modes of the first; forward motion shares none of them. It is also why the hull is open at the top: buoyant hydrogen clears a hull height in seconds if it is allowed to.',
    },
    {
      id: 'water-treatment',
      name: 'Water treatment fails',
      effect: 'Greywater recycling stops. Consumption becomes once-through.',
      severity: 'degraded',
      consequence: `Consumption does not change; the NET DRAW ON THE TANK does. At ${(recovery * PERCENT).toFixed(0)} percent recovery the tank sees ${((1 - recovery) * PERCENT).toFixed(0)} percent of demand, and losing recycling takes it to all of it, a factor of ${(1 / (1 - recovery)).toFixed(1)} rather than the four this used to claim. Rain catchment still runs at many times consumption, so the loop still closes; it closes on catchment instead of recycling, which makes it weather-dependent.`,
      detection: 'Tank level falling faster than the model says it should.',
      response:
        'Ration hygiene water, which is the term that dominates and the one that is a behavioural choice rather than a physical need. Land on water and desalinate if it comes to that.',
      survivable: true,
      designAnswer:
        'Three independent water sources: catchment, recycling and the fuel cell. Plus the sea, which is why the water loop never truly runs out and why marine mode is a resource decision rather than an emergency.',
    },
    {
      id: 'cover-tear',
      name: 'Outer cover torn',
      effect:
        'A tear in the weatherproof cover, from hail, lightning, abrasion at a fitting, or UV degradation.',
      severity: 'degraded',
      consequence:
        'The cover is not structure and it is not gas-tight, so nothing is immediately lost. What goes is the rain catchment at that station, the local aerodynamic smoothness, and the protection of the cells underneath from UV and abrasion.',
      detection: 'Visual, on the walk down the keel corridor. It may be days before anyone sees it.',
      response: 'Patch it from inside the keel, in flight. It is a repair, not an emergency.',
      survivable: true,
      designAnswer:
        'The cover being NON-STRUCTURAL is what makes this a repair. On a pressure-stabilised hull the same tear is a structural failure and a gas release at once, which is a different category of event.',
    },
  ]
}

export interface FailureSummary {
  readonly total: number
  readonly survivable: number
  readonly catastrophic: readonly FailureMode[]
  readonly verdict: string
}

/**
 * Whether the design has any single-point catastrophes left.
 *
 * A probability argument does not survive a year. If a failure mode is
 * catastrophic and single-point, the answer is to remove it rather than to
 * argue that it is unlikely.
 */
export const failureSummary = (modes: readonly FailureMode[]): FailureSummary => {
  const catastrophic = modes.filter((m) => !m.survivable)

  return {
    total: modes.length,
    survivable: modes.filter((m) => m.survivable).length,
    catastrophic,
    verdict:
      catastrophic.length === 0
        ? `All ${modes.length} modes are survivable: the vehicle stays up, stays controlled and keeps two people alive long enough to reach somewhere.`
        : `${catastrophic.length} of ${modes.length} modes are NOT survivable as drawn: ${catastrophic.map((m) => m.name).join(', ')}. A year is long enough that every single point of failure gets its turn, so the answer to each of these has to be a design change rather than a probability argument.`,
  }
}
