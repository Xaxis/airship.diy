import { HABITABILITY, v } from '@airship/data'

import type { Compartment, Configuration } from './configuration.js'
import { FITOUT } from './fitout.js'
import type { Room } from './fitout.js'

/**
 * The inside of the rooms.
 *
 * The arrangement gives each compartment a station, a size and a mass. That is
 * enough to check whether the vehicle flies and not nearly enough to check
 * whether a person can live in it. A galley with 18 cubic metres and 260
 * kilograms is a number; a galley with a two-burner induction hob, a 120 litre
 * fridge, 1.4 metres of worktop and somewhere to put a pan down is a room.
 *
 * WHAT THIS CATCHES THAT VOLUME DOES NOT:
 *
 *   HEADROOM. A compartment 2.1 m high has 1.9 m of standing room once the sole
 *   and the deckhead lining are in, and 1.9 m is the figure below which a tall
 *   person stoops. Volume per person says nothing about it, and a year of
 *   stooping is a different vehicle from a year of standing.
 *
 *   STOWAGE. A year of dry stores for two is about a cubic metre of food and
 *   four of packaging, spares and consumables. If it does not fit in the lockers
 *   it lives on the sole, and then the passage is 300 mm wide.
 *
 *   TWO WAYS OUT. Every space a person sleeps in needs a second exit. On a
 *   vehicle whose failure modes include fire in the machinery bay and hydrogen
 *   in the keel, a single companionway is a single point of failure with a
 *   person behind it.
 */




/**
 * The fitout, room by room.
 *
 * Masses here are the same ones the arrangement carries, broken down. If the two
 * disagree the arrangement is the authority, and `fitoutAgreement` says so.
 */
export interface RoomAssessment {
  readonly compartmentId: string
  readonly name: string
  /** Sole area, m2. */
  readonly floorArea: number
  /** Area the fittings stand on, m2. */
  readonly occupied: number
  /** Area left to move in, m2. */
  readonly free: number
  readonly freeFraction: number
  /** Enclosed stowage, m3. */
  readonly stowage: number
  readonly fitoutMass: number
  /** Headroom after the sole and deckhead lining, m. */
  readonly headroom: number
  readonly exits: number
  /** People this room sleeps. */
  readonly sleeps: number
  readonly findings: readonly string[]
}

/**
 * @source The sole and the deckhead lining take about 200 mm out of the
 * structural height between them: floor structure, insulation, cable runs and
 * the trunking that has to go somewhere.
 */
const LINING_ALLOWANCE = 0.2

/**
 * The accommodation minimum, m.
 *
 * THIS DESIGN CARRIED 1.9 AND THAT IS BELOW THE STANDARD. 1.9 m is what a boat
 * gets away with for a fortnight; the MLC minimum for a vessel somebody lives on
 * is 2.03, and a year is exactly the case the standard was written for. The
 * compartments are 2.3 m structural so the clear height lands above it.
 */
const STANDING_HEADROOM = v(HABITABILITY.minimumHeadroom)
/** @derived Metres to millimetres, for the messages. */
const MM = 1000

/**
 * @source A room whose fittings cover more than about 60 percent of its sole is
 * a room you edge around rather than move in. Boat accommodation practice, and
 * it is the figure that separates a cabin from a locker with a bunk in it.
 */
const MAXIMUM_OCCUPIED_FRACTION = 0.6

export const assessRoom = (compartment: Compartment, room: Room): RoomAssessment => {
  const floorArea = compartment.width * compartment.extent
  const occupied = room.fittings
    .filter((f) => f.kind !== 'passage')
    .reduce((s, f) => s + f.footprint, 0)
  const free = floorArea - occupied
  const stowage = room.fittings
    .filter((f) => f.kind === 'stowage')
    .reduce((s, f) => s + f.volume, 0)
  const fitoutMass = room.fittings.reduce((s, f) => s + f.mass, 0)
  const headroom = compartment.height - LINING_ALLOWANCE
  const exits = room.fittings.filter((f) => f.kind === 'passage').length

  const findings: string[] = []
  if (headroom < STANDING_HEADROOM) {
    findings.push(
      `${(headroom * MM).toFixed(0)} mm of headroom after the sole and deckhead lining, against ${(STANDING_HEADROOM * MM).toFixed(0)} mm to stand up in. A year of stooping is a different vehicle from a year of standing.`,
    )
  }
  if (occupied / floorArea > MAXIMUM_OCCUPIED_FRACTION) {
    findings.push(
      `Fittings cover ${((occupied / floorArea) * 100).toFixed(0)} percent of the sole, against ${(MAXIMUM_OCCUPIED_FRACTION * 100).toFixed(0)} percent above which a room is one you edge around rather than move in.`,
    )
  }
  // The rule is about SLEEPING spaces, not every room. A galley in a linear
  // gondola is a passage with a hob in it, and demanding two exits from it
  // would fire on every room and mean nothing.
  const sleeps = room.fittings.reduce((s, f) => s + (f.sleeps ?? 0), 0)
  if (sleeps > 0 && exits < 2) {
    findings.push(
      `Sleeps ${sleeps} and has one way out. Every space a person sleeps in needs a second exit, and on a vehicle whose failure modes include fire in the machinery bay a single companionway is a single point of failure with a person behind it.`,
    )
  }

  return {
    compartmentId: compartment.id,
    name: compartment.name,
    floorArea,
    occupied,
    free,
    freeFraction: free / floorArea,
    stowage,
    fitoutMass,
    headroom,
    exits,
    sleeps,
    findings,
  }
}

export interface HabitatAssessment {
  readonly rooms: readonly RoomAssessment[]
  readonly totalFloorArea: number
  readonly totalStowage: number
  readonly totalFitoutMass: number
  /** Mass the arrangement carries for the same compartments. */
  readonly arrangementMass: number
  readonly findings: readonly string[]
}

/**
 * The habitat as a whole, and whether a year fits inside it.
 *
 * @param storesVolume Volume a year of dry stores, spares and consumables takes,
 *   m3. It is bigger than the food: packaging is 15 to 25 percent of dry stores
 *   by mass and far more by volume, and the engine consumables and spares are
 *   most of the rest.
 */
export const assessHabitat = (
  config: Configuration,
  storesVolume: number,
): HabitatAssessment => {
  const rooms = FITOUT.map((room) => {
    const compartment = config.compartments.find((c) => c.id === room.compartmentId)
    if (!compartment) throw new Error(`No compartment "${room.compartmentId}" to fit out.`)
    return assessRoom(compartment, room)
  })

  const totalStowage = rooms.reduce((s, r) => s + r.stowage, 0)
  const totalFitoutMass = rooms.reduce((s, r) => s + r.fitoutMass, 0)
  const arrangementMass = FITOUT.reduce((s, room) => {
    const c = config.compartments.find((x) => x.id === room.compartmentId)
    return s + (c?.mass ?? 0)
  }, 0)

  const findings: string[] = []

  // The stores that do not fit in the gondola live in the keel, which is where
  // the arrangement already puts them. The check is whether the ACCOMMODATION
  // has enough for what is used daily.
  /** @source Roughly a fifth of a year's stores are in daily use at any time. */
  const DAILY_USE_FRACTION = 0.2
  const needed = storesVolume * DAILY_USE_FRACTION
  findings.push(
    totalStowage >= needed
      ? `${totalStowage.toFixed(1)} m3 of lockers in the accommodation against ${needed.toFixed(1)} m3 of stores in daily use. The rest lives in the keel, which is a walk rather than a problem.`
      : `${totalStowage.toFixed(1)} m3 of lockers against ${needed.toFixed(1)} m3 of stores in daily use. What does not fit lives on the sole, and then the passage is 300 mm wide for a year.`,
  )

  const massRatio = totalFitoutMass / arrangementMass
  /**
   * @source An itemised fitout within 25 percent of the allowance the
   * arrangement carries is agreement at this stage. Closer than that on a
   * hand-listed inventory would mean it had been fitted to the allowance.
   */
  const FITOUT_AGREEMENT_TOLERANCE = 0.25
  findings.push(
    Math.abs(massRatio - 1) < FITOUT_AGREEMENT_TOLERANCE
      ? `The fitout adds up to ${totalFitoutMass.toFixed(0)} kg against the ${arrangementMass.toFixed(0)} kg the arrangement carries for the same rooms, a ratio of ${massRatio.toFixed(2)}. Two routes to the same number and they agree.`
      : `The fitout adds up to ${totalFitoutMass.toFixed(0)} kg against the ${arrangementMass.toFixed(0)} kg the arrangement carries, a ratio of ${massRatio.toFixed(2)}. THE ITEMISED FITOUT AND THE ARRANGEMENT DISAGREE. The arrangement is the authority because the lift figure is built on it, so the itemisation is missing something or double counting something.`,
  )

  const sleeps = rooms.reduce((s, r) => s + r.sleeps, 0)
  /** @source Two crew, and a design that wants somewhere for a third to sleep. */
  const CREW = 2
  findings.push(
    sleeps > CREW
      ? `Sleeps ${sleeps} for a crew of ${CREW}. The spare is the settee, and a vehicle carrying two people for a year needs somewhere for one of them to sleep when the other is ill, working, or simply awake at the wrong time.`
      : `Sleeps ${sleeps} for a crew of ${CREW}, with no spare. Over a year that is a real constraint rather than a comfort one: there is nowhere to go when one of you is ill or on watch.`,
  )

  // Two ways out of the ACCOMMODATION as a whole, which is the check that
  // matters on a linear gondola where most rooms are pass-throughs.
  const accommodationExits = FITOUT.reduce(
    (s, room) => s + room.fittings.filter((f) => f.id.endsWith('-exit')).length,
    0,
  )
  findings.push(
    accommodationExits >= 2
      ? `${accommodationExits} independent ways out of the accommodation: the passage forward into the keel, and hatches from the saloon and the sleeping cabin.`
      : `${accommodationExits} way out of the accommodation. On a vehicle whose failure modes include fire in the machinery bay, that is a single point of failure with two people behind it.`,
  )

  return {
    rooms,
    totalFloorArea: rooms.reduce((s, r) => s + r.floorArea, 0),
    totalStowage,
    totalFitoutMass,
    arrangementMass,
    findings,
  }
}
