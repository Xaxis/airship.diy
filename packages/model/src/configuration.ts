/**
 * The arrangement: where everything actually goes.
 *
 * This is a MODEL, not a drawing. Every compartment carries a station, an
 * extent, a volume and a mass, and `arrangement.ts` checks the layout against
 * the rules the rest of the project derived. The 3D view renders THIS, so if
 * the picture and the mass budget ever disagree, the picture is wrong by
 * construction.
 *
 * WHAT IS HERE AND WHAT IS COMPUTED. The compartments below are the things that
 * do not scale with the hull: the galley is the same galley on a 90 m ship and
 * a 120 m one. Everything that DOES scale — cover, gas cells, frame, array,
 * fins — is computed from the geometry in `arrangement.ts` instead, because
 * hardcoding it would let the mass budget stay closed while the hull changed
 * underneath it, which is the exact failure this repository exists to catch.
 *
 * THE RULE THAT SHAPES THE WHOLE LAYOUT, from the hydrogen safety module: no
 * enclosed or poorly ventilated volume anywhere above or adjacent to a gas
 * cell. The habitable envelope must be below the cells, or positively separated
 * and continuously ventilated. That single constraint is why every habitable
 * space here is in a gondola slung under the hull or in the keel corridor along
 * its bottom, and why nothing a person occupies sits inside the cell volume.
 *
 * THE SECOND RULE, from the same module: a hot exhaust near the interstitial
 * space or a cell vent is a design-killing error. The exhaust must leave BELOW
 * and DOWNSTREAM of the entire gas envelope, which constrains engine placement
 * more than anything else and is why the machinery sits aft and low rather than
 * amidships where it would balance better.
 *
 * THE THIRD, from the flight dynamics module: the centre of gravity must sit
 * well below the centre of buoyancy, because that is the whole of the vehicle's
 * static stability. It is why the water — the heaviest item aboard — is in the
 * keel rather than anywhere convenient.
 */

/** Where a compartment sits vertically relative to the gas cells. */
export type Deck =
  /** Slung below the hull, outside the envelope entirely. */
  | 'gondola'
  /** The corridor along the bottom of the hull, below every gas cell. */
  | 'keel'
  /** Inside the hull within the cell volume. Only gas cells may live here. */
  | 'cells'
  /** On or outside the hull surface. */
  | 'external'

/** What the item is for. Groups the mass statement and colours the drawing. */
export type Category =
  | 'structure'
  | 'habitat'
  | 'machinery'
  | 'energy'
  | 'consumable'
  | 'gas'
  | 'crew'

export interface Compartment {
  readonly id: string
  readonly name: string
  readonly deck: Deck
  readonly category: Category
  /** Centre position as a fraction of hull length from the nose. */
  readonly station: number
  /** Longitudinal extent as a fraction of hull length. */
  readonly extent: number
  /**
   * Half-width as a fraction of the local hull radius. Sets how much of the
   * cross-section the compartment occupies, which is what makes the volumes in
   * the drawing and the volumes in the model the same numbers.
   */
  readonly halfWidth: number
  /** Height as a fraction of the local hull radius. */
  readonly height: number
  /**
   * Vertical centre as a fraction of the local hull radius. Negative is below
   * the hull axis. This is the number the pendulum stability check integrates.
   */
  readonly heightFraction: number
  /** Mass, kg, as installed. Fixed items only; scaling items are computed. */
  readonly mass: number
  /**
   * True when a person can be inside it. These are the volumes the hydrogen
   * rule governs, and it includes machinery spaces you can walk into: the gas
   * does not care whether you were there to sleep or to change a filter.
   */
  readonly habitable: boolean
  /**
   * True when the space counts as LIVING volume against the Celentano
   * habitability curve. A systems bay is `habitable` and not `netHabitable`:
   * you can be in it, and no amount of time spent in it makes a year aboard
   * more bearable. Conflating the two is how a mass-and-volume budget claims a
   * generous ship and delivers a corridor.
   */
  readonly netHabitable: boolean
  /** True when the space is sealed rather than continuously ventilated. */
  readonly enclosed: boolean
  readonly note?: string
}

export interface Propulsor {
  readonly id: string
  readonly station: number
  /** Lateral offset as a fraction of hull max radius. Zero is on the centreline. */
  readonly lateralOffset: number
  /** Vertical centre as a fraction of local hull radius. Negative is below. */
  readonly heightFraction: number
  /** Propeller diameter as a fraction of hull max radius. */
  readonly diameterFraction: number
  /** Shaft power, W. */
  readonly ratedPower: number
  /** Vectoring authority, radians either side of horizontal. */
  readonly vectorAuthority: number
  /** Mass of the unit: motor, gearbox, propeller, nacelle and mount. */
  readonly mass: number
  readonly note?: string
}

export interface Configuration {
  readonly id: string
  readonly compartments: readonly Compartment[]
  readonly propulsors: readonly Propulsor[]
  /** Station at which engine exhaust leaves the vehicle. */
  readonly exhaustStation: number
  /** Vertical position of the exhaust, as a fraction of local hull radius. */
  readonly exhaustHeightFraction: number
  /** Forward and aft limits of the gas cell block, as station fractions. */
  readonly cellBlockForward: number
  readonly cellBlockAft: number
  /** Fin root station and the fin span as a fraction of max radius. */
  readonly finStation: number
  readonly finSpanFraction: number
  /** Keel corridor extent as station fractions, and its clear width in metres. */
  readonly keelForward: number
  readonly keelAft: number
  readonly keelWidth: number
  /** True when the keel corridor is open to the free stream at both ends. */
  readonly keelOpenToFreeStream: boolean
}

/**
 * The baseline arrangement.
 *
 * Fixed masses only. Every one is a place the design can go wrong, which is why
 * `validateArrangement` reports the total against available lift rather than
 * assuming it fits.
 */
export const BASELINE_ARRANGEMENT: Configuration = {
  id: 'baseline',

  compartments: [
    // ------------------------------------------------------------- gondola
    // Every habitable space is here or in the keel: below the cells, outside
    // the envelope, and continuously ventilated with outside air.
    {
      id: 'nav',
      name: 'Nav station and helm',
      deck: 'gondola',
      category: 'habitat',
      station: 0.225,
      extent: 0.04,
      halfWidth: 0.2,
      height: 0.24,
      heightFraction: -1.26,
      mass: 210,
      habitable: true,
      netHabitable: true,
      enclosed: false,
      note: 'Forward, with the view. Instruments, controls, and the energy display that decides whether today is a station-keeping day or a drifting one.',
    },
    {
      id: 'saloon',
      name: 'Saloon',
      deck: 'gondola',
      category: 'habitat',
      station: 0.275,
      extent: 0.055,
      halfWidth: 0.22,
      height: 0.24,
      heightFraction: -1.26,
      mass: 240,
      habitable: true,
      netHabitable: true,
      enclosed: false,
      note: 'The one space where two people can be without being in each other\u2019s way. Over a year that is a structural requirement, not a comfort.',
    },
    {
      id: 'galley',
      name: 'Galley',
      deck: 'gondola',
      category: 'habitat',
      station: 0.318,
      extent: 0.03,
      halfWidth: 0.2,
      height: 0.24,
      heightFraction: -1.26,
      mass: 260,
      habitable: true,
      netHabitable: true,
      enclosed: false,
      note: 'Electric only. No combustion in any habitable space on a hydrogen ship, which also removes the cooking-gas tankage a boat this size would carry.',
    },
    {
      id: 'head',
      name: 'Head and washroom',
      deck: 'gondola',
      category: 'habitat',
      station: 0.343,
      extent: 0.02,
      halfWidth: 0.16,
      height: 0.24,
      heightFraction: -1.26,
      mass: 180,
      habitable: true,
      netHabitable: true,
      enclosed: false,
      note: 'Greywater to the recycling loop, which is where most of the recovered water comes from.',
    },
    {
      id: 'cabin',
      name: 'Sleeping cabin',
      deck: 'gondola',
      category: 'habitat',
      station: 0.378,
      extent: 0.045,
      halfWidth: 0.2,
      height: 0.24,
      heightFraction: -1.26,
      mass: 220,
      habitable: true,
      netHabitable: true,
      enclosed: false,
      note: 'Aft of the head and as far from the machinery as the gondola allows, for the noise and vibration reason.',
    },
    {
      id: 'gondola-structure',
      name: 'Gondola structure, glazing and hull attachment',
      deck: 'gondola',
      category: 'structure',
      station: 0.3,
      extent: 0.2,
      halfWidth: 0.24,
      height: 0.3,
      heightFraction: -1.26,
      mass: 700,
      habitable: false,
      netHabitable: false,
      enclosed: false,
      note: 'Also the water-landing hull. Its underside is the planing surface, which is why it is a shallow-V section rather than a fairing.',
    },
    {
      id: 'crew',
      name: 'Crew and personal effects',
      deck: 'gondola',
      category: 'crew',
      station: 0.3,
      extent: 0.02,
      halfWidth: 0.1,
      height: 0.1,
      heightFraction: -1.26,
      mass: 220,
      habitable: false,
      netHabitable: false,
      enclosed: false,
    },

    // ---------------------------------------------------------------- keel
    // The corridor along the bottom of the hull. Below every cell, and the only
    // place inside the envelope a person may be.
    //
    // The ORDER of these bays is a trim decision, not a convenience one. The
    // fins, the aft propulsors and the machinery are all irreducibly aft, and
    // the centre of buoyancy sits forward of midships because the nose is
    // fuller than the tail. Everything heavy that has a choice therefore goes
    // forward, and the two water tanks straddle the centre of buoyancy so that
    // pumping between them is the trim control.
    {
      id: 'nose-gear',
      name: 'Mooring cone, anchor winch, drogue and sea anchor',
      deck: 'keel',
      category: 'machinery',
      station: 0.05,
      extent: 0.07,
      halfWidth: 0.4,
      height: 0.5,
      heightFraction: -0.3,
      mass: 320,
      habitable: false,
      netHabitable: false,
      enclosed: false,
      note: 'At the bow because that is where a moored airship is held and where the sea anchor rode has to lead from. It is also the only large mass forward of the gondola, and the trim budget needs it there.',
    },
    {
      id: 'stores',
      name: 'Food and consumable stores',
      deck: 'keel',
      category: 'consumable',
      station: 0.22,
      extent: 0.06,
      halfWidth: 0.28,
      height: 0.3,
      heightFraction: -0.72,
      mass: 560,
      habitable: false,
      netHabitable: false,
      enclosed: false,
      note: 'A year of dry stores for two, plus engine consumables and the spares the maintenance interval demands. Forward, and it lightens as the mission runs, which trims the ship nose-up over the year.',
    },
    {
      id: 'water-forward',
      name: 'Forward water tank',
      deck: 'keel',
      category: 'consumable',
      station: 0.3,
      extent: 0.09,
      halfWidth: 0.34,
      height: 0.18,
      heightFraction: -0.86,
      mass: 1500,
      habitable: false,
      netHabitable: false,
      enclosed: true,
      note: 'Drinking water, electrolyzer feedstock, ballast and trim, in one tank doing four jobs. As low as the structure allows, because this is most of the pendulum lever.',
    },
    {
      id: 'systems-bay',
      name: 'Systems bay: fuel cell, electrolyzer, battery',
      deck: 'keel',
      category: 'energy',
      station: 0.46,
      extent: 0.09,
      halfWidth: 0.3,
      height: 0.34,
      heightFraction: -0.7,
      mass: 1150,
      habitable: true,
      netHabitable: false,
      enclosed: false,
      note: 'Continuously ventilated and Group IIC throughout, because it handles hydrogen. The battery is most of this mass and most of the argument for a smaller one. Amidships: nothing about it wants to be aft, and the trim budget wants it here.',
    },
    {
      id: 'water-aft',
      name: 'Aft water tank',
      deck: 'keel',
      category: 'consumable',
      station: 0.56,
      extent: 0.07,
      halfWidth: 0.32,
      height: 0.18,
      heightFraction: -0.86,
      mass: 1000,
      habitable: false,
      netHabitable: false,
      enclosed: true,
      note: 'The other half of the trim system. Pumping between the two tanks is how the ship is trimmed in flight, and the mass that can be moved is what sets the trim authority.',
    },
    {
      id: 'reserve-fuel',
      name: 'Hydrocarbon reserve',
      deck: 'keel',
      category: 'consumable',
      station: 0.385,
      extent: 0.05,
      halfWidth: 0.22,
      height: 0.2,
      heightFraction: -0.82,
      mass: 1200,
      habitable: false,
      netHabitable: false,
      enclosed: true,
      note: 'The weather-escape and get-home capability. It deliberately opens the closed loop, and it is finite by tankage rather than by policy.',
    },
    {
      id: 'hydrogen-storage',
      name: 'Hydrogen COPV storage',
      deck: 'keel',
      category: 'energy',
      station: 0.535,
      extent: 0.055,
      halfWidth: 0.26,
      height: 0.28,
      heightFraction: -0.72,
      mass: 400,
      habitable: false,
      netHabitable: false,
      enclosed: false,
      note: 'Altitude control by compressing gas out of the cells rather than valving it away. Ventilated, never in a sealed bay, and next to the systems bay it feeds.',
    },
    {
      id: 'workshop',
      name: 'Workshop',
      deck: 'keel',
      category: 'habitat',
      station: 0.72,
      extent: 0.07,
      halfWidth: 0.3,
      height: 0.34,
      heightFraction: -0.7,
      mass: 300,
      habitable: true,
      netHabitable: true,
      enclosed: false,
      note: 'Next to the machinery, because the gearbox teardown at 1,000 hours is the job it exists for and there is nowhere to take the ship instead.',
    },
    {
      id: 'machinery',
      name: 'Engine and generator bay',
      deck: 'keel',
      category: 'machinery',
      station: 0.82,
      extent: 0.06,
      halfWidth: 0.3,
      height: 0.32,
      heightFraction: -0.7,
      mass: 270,
      habitable: true,
      netHabitable: false,
      enclosed: false,
      note: 'AFT and LOW so the exhaust can leave below and downstream of the whole envelope. It would balance better amidships and it may not go there.',
    },
    {
      id: 'keel-structure',
      name: 'Keel corridor structure and walkway',
      deck: 'keel',
      category: 'structure',
      station: 0.46,
      extent: 0.88,
      halfWidth: 0.34,
      height: 0.36,
      heightFraction: -0.72,
      mass: 600,
      habitable: false,
      netHabitable: false,
      enclosed: false,
      note: 'Also the main lower longitudinal load path, so it earns part of its mass twice. This envelope is what the gas cells give up, and the model subtracts it from the lift rather than pretending the corridor is free.',
    },
    {
      id: 'systems',
      name: 'Wiring, plumbing, ducting and avionics',
      deck: 'keel',
      category: 'machinery',
      station: 0.5,
      extent: 0.8,
      halfWidth: 0.3,
      height: 0.06,
      heightFraction: -0.55,
      mass: 430,
      habitable: false,
      netHabitable: false,
      enclosed: false,
    },
  ],

  // Four vectoring electric propulsors. Nothing drives a propeller
  // mechanically, so they go where they are aerodynamically useful rather than
  // where the engine is. That is the one real freedom the electric powertrain
  // buys, and it is what lets the engine be banished aft for the exhaust rule.
  propulsors: [
    {
      id: 'port-mid',
      station: 0.45,
      lateralOffset: -1.18,
      heightFraction: -0.42,
      diameterFraction: 0.46,
      ratedPower: 22000,
      vectorAuthority: Math.PI / 2,
      mass: 145,
      note: 'On an outrigger at the widest station, near the centre of mass, so vectored thrust translates the ship instead of pitching it.',
    },
    {
      id: 'starboard-mid',
      station: 0.45,
      lateralOffset: 1.18,
      heightFraction: -0.42,
      diameterFraction: 0.46,
      ratedPower: 22000,
      vectorAuthority: Math.PI / 2,
      mass: 145,
      note: 'Full 90 degree vectoring. Differential thrust across this pair is the only yaw authority that works at zero airspeed, which is every mooring and every water landing.',
    },
    {
      id: 'port-aft',
      station: 0.8,
      lateralOffset: -0.78,
      heightFraction: -0.34,
      diameterFraction: 0.36,
      ratedPower: 14000,
      vectorAuthority: Math.PI / 3,
      mass: 105,
      note: 'Aft pair, ahead of the fins and clear of their wake.',
    },
    {
      id: 'starboard-aft',
      station: 0.8,
      lateralOffset: 0.78,
      heightFraction: -0.34,
      diameterFraction: 0.36,
      ratedPower: 14000,
      vectorAuthority: Math.PI / 3,
      mass: 105,
    },
  ],

  // Aft of the cell block and below the hull. This is the constraint that pins
  // the machinery aft, and it is worth more than the trim it costs.
  exhaustStation: 0.94,
  exhaustHeightFraction: -1.1,

  cellBlockForward: 0.06,
  cellBlockAft: 0.92,

  finStation: 0.86,
  finSpanFraction: 0.85,

  keelForward: 0.015,
  keelAft: 0.9,
  /**
   * Clear width of the keel walkway. At the 150 mm critical passage width this
   * would be a crawlspace no one could work in, so the corridor is instead made
   * safe by being open at both ends to the free stream — the third of the three
   * escapes in `assessConfinement`, and the only one available at human scale.
   */
  keelWidth: 1.1,
  keelOpenToFreeStream: true,
}
