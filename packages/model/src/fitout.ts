/**
 * What is actually in each room.
 *
 * Separate from `habitat.ts` for the same reason `designs.ts` and
 * `configuration.ts` are separate from the physics that reads them: a settee is
 * a CHOICE, not a measurement. "The saloon has a convertible settee that sleeps
 * one" is a decision about how two people will live for a year. The rules that
 * check it against headroom, floor area and escape paths still have to cite.
 */

export type FittingKind =
  | 'berth'
  | 'seating'
  | 'worktop'
  | 'appliance'
  | 'stowage'
  | 'sanitary'
  | 'instrument'
  | 'passage'

export interface Fitting {
  readonly id: string
  readonly name: string
  readonly kind: FittingKind
  /** People it sleeps. A double berth is two, a settee is one. */
  readonly sleeps?: number
  /** Footprint on the sole, m2. Zero for something mounted overhead. */
  readonly footprint: number
  /** Volume it encloses, m3. Stowage counts; a worktop does not. */
  readonly volume: number
  readonly mass: number
  readonly note?: string
}

export interface Room {
  readonly compartmentId: string
  readonly fittings: readonly Fitting[]
}

export const FITOUT: readonly Room[] = [
  {
    compartmentId: 'nav',
    fittings: [
      {
        id: 'helm-seat',
        name: 'Helm seat, swivelling',
        kind: 'seating',
        footprint: 0.6,
        volume: 0,
        mass: 18,
      },
      {
        id: 'console',
        name: 'Instrument console',
        kind: 'instrument',
        footprint: 1.2,
        volume: 0.3,
        mass: 65,
        note: 'Attitude, airspeed, altitude, gas cell pressures and purities, and the energy display that decides whether today is a station-keeping day or a drifting one.',
      },
      {
        id: 'chart-table',
        name: 'Chart table with stowage under',
        kind: 'worktop',
        footprint: 1.0,
        volume: 0.35,
        mass: 32,
      },
      {
        id: 'nav-window',
        name: 'Forward glazing',
        kind: 'instrument',
        footprint: 0,
        volume: 0,
        mass: 55,
        note: 'The reason the nav station is forward. On a vehicle that moors, lands on water and manoeuvres near things, the view is an instrument.',
      },
      {
        id: 'nav-stowage',
        name: 'Lockers',
        kind: 'stowage',
        footprint: 0.5,
        volume: 0.9,
        mass: 22,
      },
      {
        id: 'nav-passage',
        name: 'Passage aft',
        kind: 'passage',
        footprint: 1.8,
        volume: 0,
        mass: 0,
      },
    ],
  },
  {
    compartmentId: 'saloon',
    fittings: [
      {
        id: 'settee',
        name: 'Settee, convertible to a sea berth',
        kind: 'seating',
        sleeps: 1,
        footprint: 3.2,
        volume: 1.1,
        mass: 74,
        note: 'The third berth. A vehicle carrying two people for a year needs somewhere for one of them to sleep when the other is ill, working or awake.',
      },
      {
        id: 'table',
        name: 'Table, folding',
        kind: 'worktop',
        footprint: 1.4,
        volume: 0,
        mass: 21,
      },
      {
        id: 'saloon-stowage',
        name: 'Lockers and bookshelf',
        kind: 'stowage',
        footprint: 1.1,
        volume: 2.4,
        mass: 48,
      },
      {
        id: 'saloon-glazing',
        name: 'Side glazing',
        kind: 'instrument',
        footprint: 0,
        volume: 0,
        mass: 62,
        note: 'Daylight. Over a year it is a health requirement rather than an amenity, and the same glazing is what makes the saloon the room people are actually in.',
      },
      {
        id: 'saloon-passage',
        name: 'Passage',
        kind: 'passage',
        footprint: 2.4,
        volume: 0,
        mass: 0,
      },
      {
        id: 'saloon-exit',
        name: 'Deck hatch to the keel',
        kind: 'passage',
        footprint: 0.6,
        volume: 0,
        mass: 35,
        note: 'The second way out of the gondola. The first is the passage forward, and a single companionway on a vehicle whose failure modes include fire is a single point of failure with a person behind it.',
      },
    ],
  },
  {
    compartmentId: 'galley',
    fittings: [
      {
        id: 'hob',
        name: 'Induction hob, two zone',
        kind: 'appliance',
        footprint: 0.3,
        volume: 0.05,
        mass: 12,
        note: 'Electric only. No combustion in any habitable space on a hydrogen ship, which also removes the gas bottles a boat this size would carry and the locker they would need.',
      },
      {
        id: 'oven',
        name: 'Combination oven',
        kind: 'appliance',
        footprint: 0.25,
        volume: 0.06,
        mass: 28,
      },
      {
        id: 'fridge',
        name: 'Refrigerator, 120 litre, compressor',
        kind: 'appliance',
        footprint: 0.5,
        volume: 0.12,
        mass: 42,
        note: 'One of the two continuous habitat loads that never switch off. The other is ventilation.',
      },
      {
        id: 'sink',
        name: 'Sink and tap',
        kind: 'sanitary',
        footprint: 0.35,
        volume: 0.04,
        mass: 14,
      },
      {
        id: 'worktop',
        name: 'Worktop, 1.4 m',
        kind: 'worktop',
        footprint: 0.9,
        volume: 0,
        mass: 26,
      },
      {
        id: 'galley-stowage',
        name: 'Dry stores lockers',
        kind: 'stowage',
        footprint: 0.9,
        volume: 1.8,
        mass: 38,
      },
      {
        id: 'galley-passage',
        name: 'Working space',
        kind: 'passage',
        footprint: 2.2,
        volume: 0,
        mass: 0,
      },
    ],
  },
  {
    compartmentId: 'head',
    fittings: [
      {
        id: 'wc',
        name: 'Vacuum WC to the treatment plant',
        kind: 'sanitary',
        footprint: 0.4,
        volume: 0.1,
        mass: 26,
      },
      {
        id: 'shower',
        name: 'Shower with a sump to greywater',
        kind: 'sanitary',
        footprint: 0.9,
        volume: 0,
        mass: 34,
        note: 'Greywater is 85 percent recoverable and it is where most of the recycled water comes from. A shower that drained overboard would cost more water than the crew drink.',
      },
      {
        id: 'basin',
        name: 'Basin',
        kind: 'sanitary',
        footprint: 0.25,
        volume: 0.03,
        mass: 11,
      },
      {
        id: 'head-stowage',
        name: 'Lockers',
        kind: 'stowage',
        footprint: 0.3,
        volume: 0.5,
        mass: 14,
      },
      {
        id: 'head-passage',
        name: 'Standing space',
        kind: 'passage',
        footprint: 1.2,
        volume: 0,
        mass: 0,
      },
    ],
  },
  {
    compartmentId: 'cabin',
    fittings: [
      {
        id: 'double-berth',
        name: 'Double berth, 2.0 by 1.4 m',
        kind: 'berth',
        sleeps: 2,
        footprint: 2.8,
        volume: 1.4,
        mass: 68,
      },
      {
        id: 'hanging',
        name: 'Hanging locker',
        kind: 'stowage',
        footprint: 0.5,
        volume: 1.2,
        mass: 24,
      },
      {
        id: 'cabin-stowage',
        name: 'Drawers under the berth',
        kind: 'stowage',
        footprint: 0,
        volume: 1.6,
        mass: 31,
        note: 'Under-berth volume is the cheapest stowage on the vehicle: it is already enclosed and it is low, which helps the pendulum.',
      },
      {
        id: 'cabin-glazing',
        name: 'Side glazing',
        kind: 'instrument',
        footprint: 0,
        volume: 0,
        mass: 38,
      },
      {
        id: 'cabin-passage',
        name: 'Dressing space',
        kind: 'passage',
        footprint: 1.4,
        volume: 0,
        mass: 0,
      },
      {
        id: 'cabin-exit',
        name: 'Escape hatch',
        kind: 'passage',
        footprint: 0.5,
        volume: 0,
        mass: 28,
        note: 'The second way out of the sleeping cabin, which is the space where a second way out matters most.',
      },
    ],
  },
]

