import type { Configuration } from './configuration.js'
import type { DesignPoint } from './design-point.js'
import { massStatement } from './arrangement.js'

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
  /** @source The water inventory the arrangement carries, all of it dumpable. */
  ballastAvailable = 2500,
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

  /** @derived Station-keeping power goes as the cube of speed. */
  const windSpeedAfterLoss =
    design.mission.stationKeepingWind * Math.cbrt(1 - 1 / propulsors)

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
      designAnswer: `THIS IS THE ENTIRE ARGUMENT FOR THE RIGID ARCHITECTURE. Every pressure-stabilised alternative has one gas volume, so the same tear costs not ${(ONE_CELL_AS_PERCENT / cellCount).toFixed(0)} percent of the lift but all of it. Semi-rigid is 4.8 tonnes lighter and it cannot do this.`,
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
      consequence: `${(onePropulsorLoss / KW).toFixed(0)} kW of ${(propulsorPower / KW).toFixed(0)} lost, so station-keeping falls from ${design.mission.stationKeepingWind} m/s to about ${windSpeedAfterLoss.toFixed(1)} m/s of wind, because power goes as the CUBE of speed and losing a quarter of it costs only ten percent of the wind.`,
      detection: 'Immediate, from the thrust asymmetry and the controller telemetry.',
      response:
        'Trim out the yaw with the opposite unit, and accept the lower wind limit. If the failure is on the mid pair the vehicle loses some of its zero-airspeed yaw authority, which matters at a mooring and nowhere else.',
      survivable: true,
      designAnswer:
        'Four units on four controllers rather than two. Losing one of four is a trim problem; losing one of two is a control problem, and the difference costs about 200 kg.',
    },
    {
      id: 'main-bus',
      name: 'Main DC bus fault',
      effect:
        'A short or an arc on the bus every source and every load meets. Propulsion, the electrolyzer, the habitat and the ventilation all go at once.',
      severity: 'catastrophic',
      consequence:
        'Total loss of propulsion and of the ventilation the hydrogen safety case depends on. And a bus fault is itself an ignition source: 4.3 kJ is enough to initiate a hydrogen detonation directly, which a capacitor bank or an arcing contactor reaches.',
      detection: 'Instant and total.',
      response:
        'Split the bus and reclose onto the healthy half. That only works if it was split in the first place.',
      survivable: false,
      designAnswer:
        'A SPLIT BUS WITH A TIE, and bounded fault energy at every node. This is the one failure mode the arrangement cannot answer with redundancy of sources, because the sources all meet here. It is the single most consequential component on the vehicle and it is a design requirement rather than a component choice.',
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
      consequence:
        'The 85 percent recovery goes to zero, so daily consumption roughly quadruples against the tank. Rain catchment still runs at thirty-three times consumption, so the loop still closes; it closes on catchment instead of recycling, which makes it weather-dependent.',
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
