import { CONSTANTS, WATER, v } from '@airship/data'

/**
 * The seawater ballast loop, which is the answer to the last failing gate.
 *
 * THE PROBLEM, STATED AS THE GATE STATES IT. Twenty kelvin of solar superheat
 * moves this envelope's lift by more than two tonnes, against a landing trim of
 * six hundred kilograms. So a vehicle that sits on the water at dawn is
 * a tonne and a half LIGHT by mid-afternoon and takes itself off, and one that
 * is trimmed for the afternoon presses two tonnes onto its gear before dawn. No
 * passive device can be sized for a load that swings by that factor twice a day:
 * a relief valve set for the trim is bypassed at one end and useless at the
 * other.
 *
 * THE ANSWER IS THE OCEAN. A vehicle afloat is sitting on unlimited ballast,
 * and moving water is the cheapest way there is to change static heaviness.
 * `ballastLoop` returns the energy per tonne it costs and `shareOfHabitatLoad`
 * puts it against what the vehicle draws to keep two people alive; both are
 * fractions of a percent. The comparison against compressing lifting gas lives
 * in `rankedByLiftCost` in the fuel-decision module, which is where the
 * compression energies are cited, rather than as a pair of numbers restated
 * here without one. The loop takes seawater aboard as the sun
 * rises and puts it back as the sun sets, and it tracks the superheat rather
 * than fighting it.
 *
 * WHAT IS SURPRISING IS HOW SMALL IT IS. Two tonnes over the six hours between
 * dawn and the afternoon peak is a few kilograms a minute, lifted five metres.
 * That is a bilge pump. The largest unresolved item in the marine case is
 * answered by a couple of cubic metres of bladder and a pump drawing barely
 * more than a cabin light, and the reason it looked hard is that every other
 * way of changing a vehicle's weight in flight is ruinously expensive.
 *
 * DO NOT PUT A WATTAGE HERE. The header used to say ten watts, which is the
 * six-hour DIURNAL rate, while the function deliberately sizes for the
 * half-hour clearing-overcast transient and returns twelve times that. One
 * quantity, two numbers, in one file, and the header's own next paragraph
 * argued against the case its number came from.
 *
 * IT ONLY WORKS AFLOAT, which is the honest limitation. In the air there is
 * nothing to pump from: ballast can be dumped and not recovered, so the
 * buoyancy ratio is a per-sortie setting there and a continuous control here.
 */

const G0 = CONSTANTS.g0.value

export interface BallastLoop {
  /** Water the loop must move over a day, kg. */
  readonly dailySwing: number
  /** Tank volume that has to hold it, m3. */
  readonly tankVolume: number
  /** Rate the pump must sustain, kg/min. */
  readonly transferRate: number
  /**
   * Electrical input power at that rate, W. NOT hydraulic power: the efficiency
   * is already divided out, so a reader sizing a pump against a manufacturer's
   * hydraulic curve with this number would buy twice the machine.
   */
  readonly pumpPower: number
  /** Energy over a full day of cycling, J. */
  readonly dailyEnergy: number
  /** That energy as a fraction of the habitat's daily draw. */
  readonly shareOfHabitatLoad: number
  /** Mass of tank, pump, valves and plumbing, kg. */
  readonly systemMass: number
  /** True when the loop can follow the swing with the rate it has. */
  readonly tracksTheSwing: boolean
  readonly note: string
}

/**
 * @source Hours between dawn and the afternoon superheat peak. This is the
 * DIURNAL case, and it is not the one that sizes the pump.
 */
const DIURNAL_HOURS = 6

/**
 * @source Hours for the gas to respond to a cloud clearing, which is the case
 * that DOES size the pump.
 *
 * The envelope's thermal time constant is its gas heat capacity over the
 * combined convective and radiative conductance to ambient, which for a hull of
 * this size comes to tens of minutes rather than hours. So the gas does not
 * lag the sun by much: when a broken overcast opens, the superheat arrives at
 * something close to its equilibrium value within a few time constants, and a
 * pump sized for the six-hour swing is caught out by the weather rather than by
 * the day.
 */
const TRANSIENT_HOURS = 0.5

/**
 * @source Height the water is lifted from the surface to the ballast tank, m.
 * The tank sits in the keel, above the gondola sole and therefore above the
 * waterline by roughly the gondola's own depth.
 */
const LIFT_HEIGHT = 5

/** @source Overall efficiency of a small self-priming pump and its motor. */
const PUMP_EFFICIENCY = 0.5

/**
 * @source Mass of tank, pump, valves, strainer and plumbing per cubic metre of
 * capacity. A flexible bladder in a keel bay is far lighter than a structural
 * tank because the keel already carries the load.
 */
const SYSTEM_MASS_PER_CUBIC_METRE = 45

export const ballastLoop = (
  /** Lift excursion over a day's superheat, kg. */
  superheatExcursion: number,
  /** Static heaviness the vehicle is trimmed to rest at, kg. */
  landingTrim: number,
  /** Continuous habitat and systems load, W, for the comparison. */
  habitatLoad: number,
  salt = true,
): BallastLoop => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)

  /**
   * @derived The loop has to cover the whole excursion, because the vehicle
   * must be neither light enough to take off at the peak nor heavy enough to
   * overload its gear at the trough. The trim is where the cycle starts and it
   * is not part of the swing.
   */
  const dailySwing = superheatExcursion
  const tankVolume = dailySwing / density

  /** @derived Seconds in an hour. */
  const SECONDS_PER_HOUR = 3600
  /** @derived Seconds in a minute, for a rate a person can picture. */
  const SECONDS_PER_MINUTE = 60

  // SIZE THE PUMP FOR THE TRANSIENT, not for the day. A pump that follows the
  // six-hour swing and not a clearing overcast is a pump that is caught out by
  // the weather, and the weather is the case that matters on a vehicle sitting
  // on the sea.
  const transientSeconds = TRANSIENT_HOURS * SECONDS_PER_HOUR
  const transferRate = (dailySwing / transientSeconds) * SECONDS_PER_MINUTE
  const pumpPower = ((dailySwing / transientSeconds) * G0 * LIFT_HEIGHT) / PUMP_EFFICIENCY

  // The ENERGY is a day's worth and it does not depend on how fast the pump is:
  // the same water is lifted the same height however long it takes. Taking it
  // aboard costs work and putting it back is free, so a full cycle is one lift.
  const diurnalSeconds = DIURNAL_HOURS * SECONDS_PER_HOUR
  const dailyEnergy = (dailySwing / diurnalSeconds) * G0 * LIFT_HEIGHT * diurnalSeconds / PUMP_EFFICIENCY

  /** @derived Seconds in a day, for the comparison against a continuous load. */
  const SECONDS_PER_DAY = 86400
  const habitatDaily = habitatLoad * SECONDS_PER_DAY

  const systemMass = tankVolume * SYSTEM_MASS_PER_CUBIC_METRE

  // Sized on the transient by construction, so it follows the day with an
  // enormous margin. Stated as a check rather than assumed, because the sizing
  // case is the sort of thing that gets edited later.
  const diurnalRate = (dailySwing / diurnalSeconds) * SECONDS_PER_MINUTE
  const tracksTheSwing = transferRate >= diurnalRate

  return {
    dailySwing,
    tankVolume,
    transferRate,
    pumpPower,
    dailyEnergy,
    shareOfHabitatLoad: dailyEnergy / habitatDaily,
    systemMass,
    tracksTheSwing,
    note:
      `${dailySwing.toFixed(0)} kg of swing. Over the ${DIURNAL_HOURS} hours from dawn to the ` +
      `afternoon peak that is ${diurnalRate.toFixed(1)} kg a minute, but the pump is sized for a ` +
      `CLEARING OVERCAST instead: the envelope's thermal time constant is tens of minutes, not ` +
      `hours, so the superheat arrives with the sunshine. At ${TRANSIENT_HOURS} hours that is ` +
      `${transferRate.toFixed(0)} kg a minute, lifted ${LIFT_HEIGHT} m, for ` +
      `${pumpPower.toFixed(0)} W at the pump's input, which is ` +
      `${(dailyEnergy / habitatDaily * 100).toFixed(2)} percent of what the habitat draws in a ` +
      `day. THE LARGEST UNRESOLVED ITEM IN THE MARINE CASE IS ANSWERED BY A BILGE PUMP: ` +
      `${tankVolume.toFixed(1)} m3 of bladder and ${systemMass.toFixed(0)} kg of tank, pump and ` +
      `plumbing. It looked hard because every other way of changing a vehicle's weight in flight ` +
      `is ruinously expensive, and this one is sitting in unlimited supply directly underneath. ` +
      `It works ONLY AFLOAT: in the air there is nothing to pump from, so ballast can be dumped ` +
      `and not recovered and the trim is a per-sortie setting there rather than a control.`,
  }
}

/**
 * How long the vehicle can hold its trim on the tank it carries.
 *
 * A loop sized exactly for one day's swing has no reserve for a second
 * consecutive hot day, a cloud that clears at the wrong moment, or rain adding
 * weight on top. This is what a given tank buys in days before it saturates.
 */
export const ballastEndurance = (
  tankVolume: number,
  dailySwing: number,
  /** Net drift per day the loop cannot recover, kg. Rain, spray, permeation. */
  dailyDrift: number,
  salt = true,
): number => {
  const density = salt ? v(WATER.seawaterDensity) : v(WATER.freshwaterDensity)
  const capacity = tankVolume * density
  const headroom = capacity - dailySwing
  if (dailyDrift <= 0) return Infinity
  return Math.max(headroom / dailyDrift, 0)
}
