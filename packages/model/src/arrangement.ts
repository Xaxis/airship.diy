import {
  assessConfinement,
  atmosphere,
  buoyancyDistribution,
  cellFilmArea,
  alightingGear,
  ballastLoop,
  crossSectionDistribution,
  coveredArea,
  criticalDuctDiameter,
  grossLift,
  hullGeometry,
  hullRadiusAt,
  hullShapeForPrismatic,
  inertiaCoefficients,
  MUNK_REAL_FLUID_FACTOR,
  munkMoment,
  pure,
  solveBeam,
  specificLift,
  hoverCapability,
  propulsorOut,
  superheatHeavinessExcursion,
  wingGeometry,
  wingPayloadEnvelope,
  COMPLETE_SHIP_DRAG_COEFFICIENT,
  PROPULSIVE_EFFICIENCY,
} from '@airship/core'
import { AKRON_STRUCTURE, barrierFilm, EMPTY_WEIGHT_PER_GAS_VOLUME, v } from '@airship/data'
import { kg, m, m3, K, rad, kgPerM3, W } from '@airship/units'

import { dumpableInventory } from './configuration.js'
import type { Category, Compartment, Configuration, Deck } from './configuration.js'
import type { DesignPoint } from './design-point.js'

/**
 * Turning the arrangement into numbers, and then checking those numbers against
 * the rules the rest of the project derived.
 *
 * The point of this module is that the drawing cannot lie. Every volume the 3D
 * view renders is computed here from the same station, extent and width fields
 * the mass statement uses, so a compartment cannot look roomy on screen and be
 * a cupboard in the budget.
 *
 * The hull group — frame, cover, cells, array, fins — is COMPUTED from the
 * geometry rather than listed, because a hardcoded structural mass would let
 * the budget stay closed while the hull changed underneath it.
 *
 * WHAT THIS FOUND. Drawing the arrangement is what turned the mass budget from
 * a fraction into a statement, and the statement is that the 90 m baseline does
 * not close at the fill fraction that gives it pressure height. That is the
 * kind of result that only appears once the compartments exist, which is the
 * argument for building the arrangement before building the picture.
 */

// --------------------------------------------------------------------------
// Structural mass model
//
// Everything below is calibrated against the historical rigid fleet in
// packages/data, which is the only real dataset there is, and then corrected
// for material. The corrections are stated rather than folded in, because each
// is a place the estimate can be wrong by a lot.
// --------------------------------------------------------------------------

/**
 * Fraction of a historical rigid's empty weight that was the bare girder
 * framework.
 *
 * @source Burgess's component weight statement for USS Akron, recovered via
 * NASA CR-137691 Volume III Table 9. It is the one real component-level
 * structural breakdown for a rigid airship in the literature, and it puts the
 * bare girder framework at 33.0 percent of empty weight.
 *
 * This module said 0.47 and called it the single softest number here. It was,
 * and it was 42 percent high.
 */
const FRAMEWORK_SHARE_OF_EMPTY_WEIGHT = AKRON_STRUCTURE.frameworkShareOfEmptyWeight

/**
 * Framework mass saving from carbon fibre over duralumin, as a multiplier.
 *
 * @derived NOT the ratio of specific strengths. An airship frame is buckling
 * critical almost everywhere, which the buckling module establishes directly,
 * and buckling is set by modulus rather than by strength. On a specific-modulus
 * basis a practical wet-laid quasi-isotropic carbon laminate beats 2024-T3 by
 * roughly 1.6 to 1.9, not by the 4 to 1 the tensile numbers suggest. A 0.62
 * multiplier is a 38 percent saving, which sits inside that band once joints,
 * fittings and minimum practical laminate thickness are counted, and those
 * three do not scale down at all.
 */
const CARBON_FRAMEWORK_FACTOR = 0.62

/**
 * Areal mass of the outer cover as fitted, kg/m2.
 *
 * @source Modern airship envelope laminates run 0.20 to 0.30 kg/m2 for a
 * polyester or Vectran base cloth with a weather film and a topcoat. Taken at
 * 0.25 including seam tapes, lacing and the local reinforcement at every
 * attachment, which quick estimates leave out.
 */
const COVER_AREAL_MASS = 0.25

/**
 * Areal mass of the cell netting and its lacing, kg/m2 of cell surface.
 *
 * @source Historical practice used a ramie or cotton net over every cell to
 * carry the lift into the frame rather than through the film. A modern
 * high-modulus polyethylene net does the same job at roughly 0.06 kg/m2. The
 * net is not optional: without it the film carries the load and the film is
 * the one component that must not.
 */
const CELL_NETTING_AREAL_MASS = 0.06

/**
 * Areal mass of a fin as built, kg/m2 of planform.
 *
 * @source A carbon-framed, film-covered control surface of this size, including
 * the hinge line, the actuator, its mount and the fin-to-hull attachment
 * fitting. 2.2 kg/m2 is at the heavy end of sailplane practice, which is the
 * right end for a surface that is 70 m2 and cantilevered off a monocoque it is
 * not built into.
 */
/**
 * The static heaviness the vehicle is trimmed to rest on water at, kg.
 *
 * IT USED TO BE 800 AND THAT NUMBER CAME FROM NOWHERE: heavy is the safe
 * direction, and 800 kg is enough to stay put in a chop. Building the hover
 * model gave it a real owner. Four ducted propulsors at the installed power
 * lift about 800 kg, and THREE of them lift 604. A trim the vehicle can only
 * leave with every propulsor running is a trim that turns one failure into a
 * vehicle that cannot take off again.
 *
 * @source Set by the propulsor-out case rather than by the sea state: the
 * heaviness three of four units can still lift, rounded down.
 */
export const LANDING_TRIM = 600

/**
 * @source Solar superheat the design is graded against, K. Twenty kelvin is the
 * standard figure for a dark envelope in still air at midday.
 *
 * ONE OF THESE. The gear sizing and the superheat gate each carried their own
 * copy of the excursion, computed against different lift bases, so the same
 * 20 K produced 2,307 kg in one place and 2,230 kg in the other.
 */
export const DESIGN_SUPERHEAT = 20

/**
 * The consumables the mission integrator has to be given, read off the
 * arrangement rather than passed in.
 *
 * IT USED TO BE TOLD 496 kg OF FOOD AND 3,000 kg OF WATER while the arrangement
 * carried 584 and 2,500. Two numbers for the same thing is the failure this
 * repository exists to prevent, and an endurance figure computed from stores
 * the vehicle does not have is the worst place for it to happen: days aloft is
 * the figure of merit.
 */
export const consumables = (config: Configuration) => {
  const massOf = (id: string): number => config.compartments.find((c) => c.id === id)?.mass ?? 0
  const water = config.compartments
    .filter((c) => c.id.startsWith('water-'))
    .reduce((sum, c) => sum + c.mass, 0)
  return {
    food: massOf('stores-food'),
    spares: massOf('stores-spares'),
    water,
    /** @derived Tanks are filled to about 90 percent, so capacity is above the load. */
    waterCapacity: water / 0.9,
  }
}

/**
 * @source Areal mass of a carbon-framed, film-covered control surface of this
 * size, including its hinges, its actuation and the local reinforcement where
 * it meets the hull.
 */
const FIN_AREAL_MASS = 2.2

/**
 * Fin taper ratio, tip chord over root chord.
 *
 * @source Conventional airship fin practice, which runs 0.4 to 0.6. Taken at
 * 0.5. It sets the planform area for a given span and root chord and therefore
 * both the fin mass and the yaw stability the flight dynamics module checks.
 */
const FIN_TAPER_RATIO = 0.5

/**
 * Root chord of a fin as a fraction of hull length.
 *
 * RAISED FROM 0.12 TO 0.16 when the yaw stability check was corrected. At 0.12
 * the vehicle was directionally divergent, and chord is the half of the fix
 * that costs mass rather than shed height.
 *
 * @source Conventional practice puts the fin root chord at 12 to 18 percent of
 * length for a cruciform tail on a hull of this fineness. Taken at the BOTTOM of
 * that range: at 0.15 the yaw static margin comes out at 1.78, which is more fin
 * than the Munk moment needs, and every one of those square metres is mass on a
 * 46 m lever that the trim ballast then has to fight.
 */
const FIN_ROOT_CHORD_FRACTION = 0.16

/**
 * Vertical centroid of the photovoltaic band, as a fraction of local radius.
 *
 * @derived Mean height of a band running from the top of the hull to a
 * half-angle theta either side is R*sin(theta)/theta. At the baseline 75 degree
 * half-angle that is 0.738. The array is the only large mass that sits ABOVE
 * the hull axis, so it works directly against the pendulum stability the whole
 * arrangement is built to protect, and it has to be in the sum.
 */
const arrayCentroidHeight = (halfAngle: number): number =>
  halfAngle === 0 ? 1 : Math.sin(halfAngle) / halfAngle

/**
 * Vertical centroid of the gas cells, as a fraction of local radius.
 *
 * @derived The cells fill the hull cross-section above the keel corridor. The
 * area centroid of a circle with a chord-bounded segment removed from the
 * bottom sits slightly above the axis; at the baseline keel depth that is about
 * 0.05 R. Small, and it is a lifting mass rather than a weight, so it moves the
 * centre of buoyancy rather than the centre of gravity.
 */
const CELL_CENTROID_HEIGHT = 0.05

/**
 * Standoff between the bottom of the hull and the top of the gondola, m.
 *
 * @source Set by the suspension: the gondola hangs from the frame on cables and
 * struts that have to reach past the cover and the lower longitudinals, and the
 * gap is also the boundary layer the gondola would otherwise sit in. Historical
 * rigids ran 1 to 2.5 m for a slung car. Taken at 1.6.
 */
const GONDOLA_STANDOFF = 1.6

/**
 * Height of the keel corridor floor above the hull skin at the bottom, m.
 *
 * @source The floor sits on the lower longitudinals with the cover, the
 * catenary curtains and the walkway structure below it. 0.8 m is the depth of
 * that build-up on a hull of this size.
 */
const KEEL_FLOOR_INSET = 0.8

// --------------------------------------------------------------------------

export interface MassItem {
  readonly id: string
  readonly name: string
  readonly category: Category
  readonly deck: Deck
  readonly mass: number
  /** Longitudinal position of the centroid, m from the nose. */
  readonly x: number
  /** Vertical position of the centroid, m from the hull axis. Negative is below. */
  readonly z: number
  /** Enclosed volume, m3. Zero for structure and distributed items. */
  readonly volume: number
  readonly computed: boolean
  readonly note?: string
}

export interface MassStatement {
  readonly items: readonly MassItem[]
  /** Gross weight: everything aboard, including consumables and crew. */
  readonly total: number
  /** Gross weight less consumables and crew. What the fleet table records. */
  readonly emptyWeight: number
  readonly byCategory: Readonly<Record<Category, number>>
  readonly byDeck: Readonly<Record<Deck, number>>
  /** Centre of gravity, m from the nose and m from the hull axis. */
  readonly centreOfGravity: { readonly x: number; readonly z: number }
  /** Centre of buoyancy, same frame. On the axis by symmetry. */
  readonly centreOfBuoyancy: { readonly x: number; readonly z: number }
  /** Gas volume available after the keel corridor is subtracted, m3. */
  readonly gasVolume: number
  /** The binding one of the two conditions below, kg. */
  readonly grossLift: number
  /**
   * Gross lift at SEA LEVEL, kg. Separate from `grossLift`, which is the
   * binding figure across the operating band, because every ground and water
   * case happens down here: the gear load, the superheat swing the gear and the
   * ballast loop both answer, and the trim the vehicle rests at.
   *
   * They used to be computed independently in two places, so one 20 K
   * excursion came out as 2,307 kg for the gear and 2,230 kg for the gate.
   */
  readonly seaLevelGrossLift: number
  /** Lift at sea level with the cells at the design fill fraction, kg. */
  readonly liftAtSeaLevel: number
  /** Lift at the design altitude with the cells fully expanded, kg. */
  readonly liftAtAltitude: number
  readonly bindingCondition: 'sea level' | 'design altitude'
  /** Gross lift minus gross weight. Negative means it does not fly. */
  readonly liftMargin: number
  /** Empty weight over gas volume, against the 0.505 to 0.79 historical band. */
  readonly emptyWeightPerGasVolume: number
  readonly massPerGasVolume: number
  /** Net habitable volume: the spaces that count as living space, m3. */
  readonly habitableVolume: number
  /** Hull volume the keel corridor takes away from the cells, m3. */
  readonly keelEnvelope: number
}

/**
 * Volume of a compartment, m3. A box in metres, so this is a multiplication.
 *
 * It reads trivially now and it did not before: the first version defined the
 * box in fractions of the local hull radius and integrated it along the hull,
 * which meant every room grew when the hull did. The habitability check then
 * passed by making the ship bigger rather than by arranging it, which is
 * exactly backwards.
 */
export const compartmentVolume = (c: Pick<Compartment, 'width' | 'height' | 'extent'>): number =>
  c.width * c.height * c.extent

/**
 * Vertical centre of a compartment, m from the hull axis. Negative is below.
 *
 * Physical rather than fractional: a gondola hangs a fixed standoff below the
 * hull skin whatever the hull's size, and a keel bay sits on the corridor
 * floor. Both data move with the local radius, so the arrangement stays put
 * relative to the structure as the hull changes.
 */
export const compartmentHeight = (c: Compartment, localRadius: number): number => {
  switch (c.deck) {
    case 'gondola':
      return -(localRadius + GONDOLA_STANDOFF + c.height / 2) + c.rise
    case 'keel':
      return -(localRadius - KEEL_FLOOR_INSET) + c.height / 2 + c.rise
    case 'cells':
      return c.rise
    case 'external':
      return c.rise
  }
}

export interface FinPlanform {
  readonly rootChord: number
  readonly tipChord: number
  readonly span: number
  /** Combined planform area of all four surfaces, m2. */
  readonly area: number
  /** Station of the root chord centre. */
  readonly station: number
  readonly mass: number
}

/**
 * The fin planform, in metres.
 *
 * Exported because the drawing needs the same numbers the mass statement used.
 * A tail that is drawn at one size and weighed at another is exactly the kind of
 * disagreement this module exists to make impossible.
 */
export const finPlanform = (design: DesignPoint, config: Configuration): FinPlanform => {
  const { length, finenessRatio } = design.hull
  const rootChord = FIN_ROOT_CHORD_FRACTION * length
  const tipChord = rootChord * FIN_TAPER_RATIO
  const span = config.finSpanFraction * (length / finenessRatio / 2)
  /** @derived Trapezoid area, four surfaces in a cruciform tail. */
  const area = 4 * 0.5 * (rootChord + tipChord) * span
  return {
    rootChord,
    tipChord,
    span,
    area,
    station: config.finStation,
    mass: area * FIN_AREAL_MASS,
  }
}

/**
 * The keel corridor envelope: the hull volume the structure takes away from the
 * gas cells.
 *
 * Read off the `keel-structure` compartment when one is present, because that
 * IS the corridor, and falls back to the keel extent and width otherwise.
 */
export const keelEnvelopeVolume = (config: Configuration, length: number): number => {
  const corridor = config.compartments.find((c) => c.id === 'keel-structure')
  if (corridor) return compartmentVolume(corridor)

  /** @derived Standing headroom over the walkway when no corridor is defined. */
  const FALLBACK_HEADROOM = 2.6
  return compartmentVolume({
    width: config.keelWidth,
    height: FALLBACK_HEADROOM,
    extent: (config.keelAft - config.keelForward) * length,
  })
}

/**
 * Longitudinal centroid of a distributed hull quantity, as a station fraction.
 *
 * @derived Centroid of `weight(r)` integrated along the hull, by Simpson's rule.
 * Volume weights by r^2 and surface area weights by r*sqrt(1 + (dr/dx)^2). The
 * two are NOT the same station on a hull with a blunt nose and a fine tail, and
 * putting the cover at the volume centroid instead of the area one moves the
 * centre of gravity by enough to change the trim verdict.
 */
const distributedCentroid = (
  weight: (station: number) => number,
  panels = 200,
): { station: number; total: number } => {
  let moment = 0
  let total = 0
  for (let i = 0; i <= panels; i += 1) {
    const station = i / panels
    const w = weight(station)
    const simpson = i === 0 || i === panels ? 1 : i % 2 === 1 ? 4 : 2
    total += simpson * w
    moment += simpson * w * station
  }
  return { station: moment / total, total }
}

/**
 * The mass statement, the centre of gravity, and whether it flies.
 *
 * Everything that scales with the hull is computed here from the geometry.
 * Everything that does not is read from the arrangement. The split is the whole
 * design of this module.
 */
/**
 * The wing, sized and traded, for a given design point and arrangement.
 *
 * EXPORTED SO THERE IS ONE OF IT. The mass statement needs it, the site needs
 * it, and the explorer needs it to stay honest while its sliders move. Three
 * callers deriving the same wing three ways is how a page ends up disagreeing
 * with the vehicle it describes, and this one has a specific trap: the span
 * inside the hull is a spar carry-through rather than a lifting panel, so a
 * caller that forgets the hull width at the wing station understates the mass
 * of everything it then concludes.
 */
export const wingSizing = (design: DesignPoint, config: Configuration) => {
  const { length, finenessRatio, prismaticCoefficient } = design.hull
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const geometry = hullGeometry(m(length), finenessRatio, shape)
  const beamAtWing = 2 * hullRadiusAt(m(length), finenessRatio, config.wingStation, shape)

  const wing = wingGeometry(config.wingSpan, config.wingArea, beamAtWing)
  const payload = wingPayloadEnvelope(
    wing,
    geometry,
    atmosphere(m(design.mission.altitude)).density,
    v(COMPLETE_SHIP_DRAG_COEFFICIENT),
    config.propulsors.reduce((sum, p) => sum + p.ratedPower, 0),
    v(PROPULSIVE_EFFICIENCY),
  )
  return { wing, payload, beamAtWing }
}

export const massStatement = (design: DesignPoint, config: Configuration): MassStatement => {
  const { length, finenessRatio, prismaticCoefficient, cellCount, filmId } = design.hull
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const geometry = hullGeometry(m(length), finenessRatio, shape)
  const maxRadius = length / finenessRatio / 2

  const radiusAt = (station: number): number =>
    hullRadiusAt(m(length), finenessRatio, station, shape)

  const items: MassItem[] = []

  // ---- the fixed arrangement --------------------------------------------
  for (const c of config.compartments) {
    items.push({
      id: c.id,
      name: c.name,
      category: c.category,
      deck: c.deck,
      mass: c.mass,
      x: c.station * length,
      z: compartmentHeight(c, radiusAt(c.station)),
      volume: compartmentVolume(c),
      computed: false,
      ...(c.note === undefined ? {} : { note: c.note }),
    })
  }

  for (const p of config.propulsors) {
    items.push({
      id: p.id,
      name: `Propulsor ${p.id}`,
      category: 'machinery',
      deck: 'external',
      mass: p.mass,
      x: p.station * length,
      z: p.heightFraction * radiusAt(p.station),
      volume: 0,
      computed: false,
      ...(p.note === undefined ? {} : { note: p.note }),
    })
  }

  // ---- the gas volume, after the keel is taken out -----------------------
  // The keel corridor occupies hull volume that cannot hold gas. Ignoring that
  // overstates lift by the volume of the one part of the ship you live in.
  //
  // The corridor ENVELOPE is what displaces gas, not the sum of the bays inside
  // it: they sit within the same structural volume, and adding them up would
  // count the same cubic metres several times over. `keelBaysFitInsideTheKeel`
  // checks that they really do fit.
  const keelEnvelope = keelEnvelopeVolume(config, length)
  const gasVolume = geometry.volume - keelEnvelope

  // ---- the hull group, computed -----------------------------------------
  const filmArea = cellFilmArea(geometry.wettedArea, gasVolume, length, cellCount)
  const film = barrierFilm(filmId)

  const frameMass =
    gasVolume *
    EMPTY_WEIGHT_PER_GAS_VOLUME.hindenburg *
    FRAMEWORK_SHARE_OF_EMPTY_WEIGHT *
    CARBON_FRAMEWORK_FACTOR

  const arrayArea = coveredArea({
    length: m(length),
    finenessRatio,
    coverageHalfAngle: rad(design.power.arrayCoverageHalfAngle),
    forwardStation: design.power.arrayForwardStation,
    aftStation: design.power.arrayAftStation,
    shape,
  })

  const fins = finPlanform(design, config)

  // ---- the wing, the board and the gear ----------------------------------
  // The hull beam at the wing station, because more than half of a modest span
  // on a fat body is fuselage rather than wing, and only the exposed panels
  // have to be built and carried.
  const { wing, payload } = wingSizing(design, config)

  /**
   * @source Areal mass of a retractable board: a carbon foil, its case, the
   * hoist and the seals, at 8 kg per square metre of immersed area. Heavier per
   * unit area than an aerodynamic surface because it works in water, takes
   * grounding loads, and has to come up again.
   */
  const CENTREBOARD_AREAL_MASS = 8
  const centreboardMass = config.centreboardArea * CENTREBOARD_AREAL_MASS

  /** @derived Vertical standoff of the gondola underside below the hull, m. */
  const GONDOLA_STANDOFF = 1.6

  /**
   * @source Solar superheat excursion over a day, K. The cells run hotter than
   * ambient in sunlight and cooler at dawn, and this is the swing the marine
   * chapter's failing gate is about.
   */

  // Gross lift at sea level, needed here only to size the gear. The authoritative
  // figure is computed below at both ends of the operating band; this is the
  // same quantity at the condition the vehicle actually lands in.
  const seaLevelForGear = atmosphere(m(0))
  const liftForGear =
    gasVolume *
    design.gas.seaLevelFillFraction *
    specificLift(pure(design.gas.species), seaLevelForGear, K(seaLevelForGear.temperature))

  const gear = alightingGear(
    kg(liftForGear),
    LANDING_TRIM,
    superheatHeavinessExcursion(
      liftForGear,
      DESIGN_SUPERHEAT,
      pure(design.gas.species),
      seaLevelForGear,
      design.gas.seaLevelFillFraction,
    ),
    config.landCapable,
    // What the vehicle can shed to hold trim. Dumping works on land as well as
    // afloat, and the load case the gear is sized by is the COLD one before
    // dawn, which dumping answers.
    dumpableInventory(config),
  )

  const arrayStation = (design.power.arrayForwardStation + design.power.arrayAftStation) / 2

  // Where the distributed hull masses actually act. The frame follows the
  // cross-section, so it sits at the VOLUME centroid; the cover follows the
  // surface, so it sits at the AREA centroid, which is further aft because a
  // fine tail has little volume and plenty of skin.
  const volumeCentroid = distributedCentroid((s) => radiusAt(s) ** 2)
  const areaCentroid = distributedCentroid((s) => {
    /** @derived Central difference on the radius, clamped at the endpoints. */
    const h = 1 / 400
    const left = Math.max(s - h, 0)
    const right = Math.min(s + h, 1)
    const slope = (radiusAt(right) - radiusAt(left)) / ((right - left) * length)
    return radiusAt(s) * Math.sqrt(1 + slope * slope)
  })

  items.push(
    {
      id: 'frame',
      name: 'Carbon frame: rings, longitudinals and wire bracing',
      category: 'structure',
      deck: 'cells',
      mass: frameMass,
      x: volumeCentroid.station * length,
      z: 0,
      volume: 0,
      computed: true,
      note: 'Scaled from the Hindenburg framework share of empty weight and corrected for carbon on a specific-MODULUS basis, because the frame is buckling critical rather than strength critical.',
    },
    {
      id: 'cover',
      name: 'Outer cover',
      category: 'structure',
      deck: 'external',
      mass: geometry.wettedArea * COVER_AREAL_MASS,
      x: areaCentroid.station * length,
      z: 0,
      volume: 0,
      computed: true,
      note: 'Areal mass times wetted area. Also the rain catchment surface, which is what lets the water loop close.',
    },
    {
      id: 'gas-cells',
      name: `${cellCount} gas cells, film and netting`,
      category: 'gas',
      deck: 'cells',
      mass: filmArea * (v(film.arealDensity) + CELL_NETTING_AREAL_MASS),
      x: volumeCentroid.station * length,
      z: CELL_CENTROID_HEIGHT * maxRadius,
      volume: gasVolume,
      computed: true,
      note: 'Film area counts BOTH faces of every internal bulkhead, so cell count buys damage tolerance and trim control at a real mass price. It is the strongest argument in the model for fewer, larger cells.',
    },
    {
      id: 'photovoltaics',
      name: 'Photovoltaic array',
      category: 'energy',
      deck: 'external',
      mass: arrayArea * design.power.moduleArealMass,
      x: arrayStation * length,
      z: arrayCentroidHeight(design.power.arrayCoverageHalfAngle) * radiusAt(arrayStation),
      volume: 0,
      computed: true,
      note: 'The heaviest non-structural item and the only large mass above the axis, so it costs useful load twice: once in the budget and once in pendulum stability.',
    },
    {
      id: 'wings',
      name: `Outboard wings, ${config.wingSpan} m span`,
      category: 'structure',
      deck: 'external',
      mass: wing.mass,
      x: config.wingStation * length,
      z: 0,
      volume: 0,
      computed: true,
      note: `${config.wingArea} m2 of reference area at an aspect ratio of ${wing.aspectRatio.toFixed(1)}, of which only ${wing.exposedArea.toFixed(0)} m2 is EXPOSED PANEL: the hull is ${(2 * radiusAt(config.wingStation)).toFixed(0)} m across at this station and the rest of the span is carryover. The reference span is what sets the induced drag, because the body does carry lift across its width; the exposed area is what has to be built, and the mass follows that. NOT for efficiency: on a FULLY BUOYANT vehicle there is no speed at which a wing pays for itself, because the trade a wing normally wins is taking weight off something that pays induced drag to carry it, and buoyancy carries the whole weight at zero speed for free. It is for CARRYING, and it holds up ${payload.bestPayload.toFixed(0)} kg of extra weight at ${payload.bestSpeed.toFixed(0)} m/s on the power already installed. It costs its profile drag every hour it is not doing that, which is the argument for folding it.`,
    },
    {
      id: 'centreboard',
      name: 'Retractable centreboard',
      category: 'structure',
      deck: 'gondola',
      mass: centreboardMass,
      x: config.wingStation * length,
      z: -(maxRadius + GONDOLA_STANDOFF),
      volume: 0,
      computed: true,
      note: `${config.centreboardArea} m2 immersed. THE PART THAT DECIDES WHETHER BOAT MODE EXISTS: on bare hulls the usable cone from dead upwind is five degrees because the vehicle points where the fins say and goes where the wind says. At this area it is the whole compass.`,
    },
    {
      id: 'alighting-gear',
      name: config.landCapable ? 'Alighting gear, water and ground' : 'Alighting gear, water only',
      category: 'structure',
      deck: 'gondola',
      mass: gear.totalMass,
      x: config.wingStation * length,
      z: -(maxRadius + GONDOLA_STANDOFF),
      volume: 0,
      computed: true,
      note: gear.note,
    },
    {
      id: 'fins',
      name: 'Cruciform fins and control surfaces',
      category: 'structure',
      deck: 'external',
      mass: fins.mass,
      x: config.finStation * length,
      z: 0,
      volume: 0,
      computed: true,
      note: `${fins.area.toFixed(0)} m2 of planform. Large because the Munk moment is destabilising at every angle of attack and the fins are the only thing opposing it.`,
    },
  )

  const total = items.reduce((s, i) => s + i.mass, 0)

  const byCategory = items.reduce<Record<Category, number>>(
    (acc, i) => ({ ...acc, [i.category]: (acc[i.category] ?? 0) + i.mass }),
    { structure: 0, habitat: 0, machinery: 0, energy: 0, consumable: 0, gas: 0, crew: 0 },
  )
  const byDeck = items.reduce<Record<Deck, number>>(
    (acc, i) => ({ ...acc, [i.deck]: (acc[i.deck] ?? 0) + i.mass }),
    { gondola: 0, keel: 0, cells: 0, external: 0 },
  )

  const centreOfGravity = {
    x: items.reduce((s, i) => s + i.mass * i.x, 0) / total,
    z: items.reduce((s, i) => s + i.mass * i.z, 0) / total,
  }

  // Centre of buoyancy: the centroid of the displaced volume. On the axis by
  // symmetry, and forward of midships because the nose is fuller than the tail.
  const centreOfBuoyancy = { x: volumeCentroid.station * length, z: 0 }

  // Lift, at BOTH ends of the operating band, because which one binds is not
  // obvious and getting it wrong is a 15 percent error in the direction that
  // flatters the design.
  //
  // At sea level the cells are at the fill fraction, on dense air. At the design
  // altitude they have expanded to fill completely — that is what pressure
  // height MEANS — on thin air. Multiplying the altitude lift by the sea level
  // fill fraction, which an earlier version of this did, counts the same
  // expansion twice and understates lift by the fill fraction.
  const seaLevel = atmosphere(m(0))
  const liftAtSeaLevel = grossLift(
    m3(gasVolume * design.gas.seaLevelFillFraction),
    pure(design.gas.species),
    seaLevel,
    K(seaLevel.temperature),
  )
  const cruise = atmosphere(m(design.mission.altitude))
  const liftAtAltitude = grossLift(
    m3(gasVolume),
    pure(design.gas.species),
    cruise,
    K(cruise.temperature),
  )
  const lift = Math.min(liftAtSeaLevel, liftAtAltitude)

  const habitableVolume = items
    .filter((i) => {
      const c = config.compartments.find((x) => x.id === i.id)
      return c?.netHabitable === true
    })
    .reduce((s, i) => s + i.volume, 0)

  // Empty weight is what the historical fleet table records, so it is what the
  // comparison against that table has to use. Consumables and crew are not part
  // of it and folding them in would make this design look worse than the fleet
  // for a reason that has nothing to do with structure.
  const disposable = items
    .filter((i) => i.category === 'consumable' || i.category === 'crew')
    .reduce((s, i) => s + i.mass, 0)

  return {
    items,
    total,
    emptyWeight: total - disposable,
    byCategory,
    byDeck,
    centreOfGravity,
    centreOfBuoyancy,
    gasVolume,
    grossLift: lift,
    seaLevelGrossLift: liftForGear,
    liftAtSeaLevel,
    liftAtAltitude,
    bindingCondition: liftAtSeaLevel <= liftAtAltitude ? 'sea level' : 'design altitude',
    liftMargin: lift - total,
    emptyWeightPerGasVolume: (total - disposable) / gasVolume,
    massPerGasVolume: total / gasVolume,
    habitableVolume,
    keelEnvelope,
  }
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

export type Severity = 'pass' | 'warn' | 'fail'

export interface Finding {
  readonly id: string
  readonly severity: Severity
  readonly rule: string
  readonly detail: string
}

/**
 * Habitable volume per person that a mission of this length needs, m3.
 *
 * @source The Celentano curve, from Celentano, Amorelli and Freeman (1963),
 * which is still the reference NASA-STD-3001 and the Human Integration Design
 * Handbook cite for net habitable volume against mission duration. Beyond about
 * two months all three levels asymptote: 5 m3 per person is tolerable, meaning
 * a person can survive in it; 10 is the performance limit, below which task
 * performance measurably degrades; 19 is optimal, beyond which more volume buys
 * nothing.
 *
 * A 365-day mission is far past the asymptote, so the duration term drops out
 * and these are simply the numbers. Designing to "tolerable" for a year is how
 * you get a crew that stops maintaining the ship.
 */
const HABITABLE_VOLUME_PER_PERSON = { tolerable: 5, performance: 10, optimal: 19 } as const

/**
 * Minimum ratio of the pendulum lever to the hull radius.
 *
 * @derived The centre of gravity has to be far enough below the centre of
 * buoyancy that the restoring moment dominates the disturbing ones. Airship
 * practice puts the metacentric height at 8 to 15 percent of hull diameter; the
 * lower end is a ship that rolls uncomfortably in a gust and the upper end is
 * one that is too stiff to fly hands-off. Expressed here against radius, so 0.2
 * of a radius is 10 percent of diameter.
 */
const MINIMUM_PENDULUM_LEVER_FRACTION = 0.2

/**
 * How far the centre of gravity may sit from the centre of buoyancy
 * longitudinally, as a fraction of length.
 *
 * @source Static trim is corrected by moving ballast water between tanks, and
 * the tankage that can be moved is a small fraction of gross weight. A 1
 * percent of length offset at this size is about 0.9 m, which the water in the
 * keel can trim out. Beyond about 2 percent the ship flies permanently nose-up
 * or nose-down, which costs drag at every hour of every day.
 */
const TRIM_OFFSET_LIMIT = 0.02

/**
 * Lift margin a preliminary design has to carry, as a fraction of gross weight.
 *
 * @source Aerospace preliminary mass estimates grow. The usual figures are 10 to
 * 20 percent between concept and first flight, and every mass in this module is
 * an estimate of exactly that maturity. 0.15 is the middle of the band.
 *
 * An aeroplane that comes out heavy loses range or payload and still flies. An
 * airship has no such trade: buoyancy is fixed by the envelope, so a design that
 * closes exactly is a design that will not close. This one rule is what sets the
 * hull length, and it is the reason the baseline is not 105 m — 105 m closes,
 * and closing is not the same as being buildable.
 */
const MASS_GROWTH_ALLOWANCE = 0.15

/**
 * Every rule the arrangement has to obey, checked.
 *
 * A finding is not an error. A `fail` means the arrangement as drawn does not
 * work and the drawing should say so, which is worth far more than a picture
 * that quietly obeys nothing.
 */
export const validateArrangement = (
  design: DesignPoint,
  config: Configuration,
): readonly Finding[] => {
  const findings: Finding[] = []
  const statement = massStatement(design, config)
  const { length, finenessRatio } = design.hull
  const maxRadius = length / finenessRatio / 2
  const validateShape = hullShapeForPrismatic(design.hull.prismaticCoefficient)
  const radiusAt = (station: number): number =>
    hullRadiusAt(m(length), finenessRatio, station, validateShape)

  // ---- the rule that shapes everything ----------------------------------
  const inCells = config.compartments.filter((c) => c.deck === 'cells' && c.habitable)
  findings.push({
    id: 'no-habitable-volume-in-the-cell-space',
    severity: inCells.length === 0 ? 'pass' : 'fail',
    rule: 'No enclosed or habitable volume above or adjacent to a gas cell.',
    detail:
      inCells.length === 0
        ? 'Every habitable space is in the gondola below the hull or in the keel corridor below every cell. Hydrogen that escapes a cell rises away from all of them.'
        : `${inCells.map((c) => c.name).join(', ')} sits inside the cell volume. A leak collects above a person rather than away from one.`,
  })

  const sealedHabitable = config.compartments.filter((c) => c.habitable && c.enclosed)
  findings.push({
    id: 'habitable-spaces-are-ventilated',
    severity: sealedHabitable.length === 0 ? 'pass' : 'fail',
    rule: 'Habitable spaces are continuously ventilated, never sealed.',
    detail:
      sealedHabitable.length === 0
        ? 'No habitable compartment is sealed. Ventilation is what keeps a slow leak below a quarter of the lower flammability limit.'
        : `${sealedHabitable.map((c) => c.name).join(', ')} is both habitable and sealed.`,
  })

  // ---- the keel corridor is the one confined run a person is inside -----
  const keelLength = (config.keelAft - config.keelForward) * length
  const keel = assessConfinement(
    m(config.keelWidth),
    m(keelLength),
    config.keelOpenToFreeStream,
    'rectangular',
  )
  findings.push({
    id: 'keel-corridor-confinement',
    severity: keel.safe ? 'pass' : 'fail',
    rule: `Confined runs are narrower than the ${(criticalDuctDiameter('rectangular') * 1000).toFixed(0)} mm critical passage width, shorter than the run-up distance, or open at both ends.`,
    detail: `${(config.keelWidth * 1000).toFixed(0)} mm by ${keelLength.toFixed(0)} m keel corridor. ${keel.reason}`,
  })

  // ---- exhaust ----------------------------------------------------------
  const exhaustClear = config.exhaustStation > config.cellBlockAft
  const exhaustBelow = config.exhaustHeightFraction < -1
  findings.push({
    id: 'exhaust-below-and-downstream',
    severity: exhaustClear && exhaustBelow ? 'pass' : 'fail',
    rule: 'Engine exhaust leaves below and downstream of the entire gas envelope.',
    detail:
      exhaustClear && exhaustBelow
        ? `Exhaust exits at station ${config.exhaustStation.toFixed(2)}, aft of the cell block at ${config.cellBlockAft.toFixed(2)}, and ${(-config.exhaustHeightFraction * maxRadius).toFixed(1)} m below the axis. This constraint is what pins the machinery aft, and it costs real trim to obey.`
        : `Exhaust at station ${config.exhaustStation.toFixed(2)}, height fraction ${config.exhaustHeightFraction.toFixed(2)}: it is not clear of the envelope. A hot exhaust near a cell vent is the one arrangement error that has actually destroyed airships.`,
  })

  // ---- pendulum stability ------------------------------------------------
  const lever = statement.centreOfBuoyancy.z - statement.centreOfGravity.z
  const leverFraction = lever / maxRadius
  findings.push({
    id: 'pendulum-stability',
    severity:
      leverFraction >= MINIMUM_PENDULUM_LEVER_FRACTION
        ? 'pass'
        : leverFraction > 0
          ? 'warn'
          : 'fail',
    rule: `Centre of gravity at least ${(MINIMUM_PENDULUM_LEVER_FRACTION * maxRadius).toFixed(1)} m below the centre of buoyancy.`,
    detail: `${lever.toFixed(2)} m of pendulum lever, ${(leverFraction * 100).toFixed(0)} percent of hull radius. This is the entire static stability of the vehicle: there is no other restoring moment in pitch or roll.`,
  })

  // ---- trim --------------------------------------------------------------
  const trimOffset = (statement.centreOfGravity.x - statement.centreOfBuoyancy.x) / length
  findings.push({
    id: 'longitudinal-trim',
    severity: Math.abs(trimOffset) <= TRIM_OFFSET_LIMIT ? 'pass' : 'warn',
    rule: `Centre of gravity within ${(TRIM_OFFSET_LIMIT * 100).toFixed(0)} percent of length of the centre of buoyancy.`,
    detail: `Centre of gravity at ${statement.centreOfGravity.x.toFixed(1)} m, centre of buoyancy at ${statement.centreOfBuoyancy.x.toFixed(1)} m: ${(trimOffset * 100).toFixed(2)} percent of length ${trimOffset > 0 ? 'aft' : 'forward'}. Corrected by moving water between keel tanks, which is why the water is distributed rather than in one drum.`,
  })

  // ---- does it fly -------------------------------------------------------
  findings.push({
    id: 'lift-margin',
    severity: statement.liftMargin > 0 ? 'pass' : 'fail',
    rule: 'Gross lift at the design fill fraction exceeds gross weight.',
    detail:
      statement.liftMargin > 0
        ? `${statement.grossLift.toFixed(0)} kg of lift against ${statement.total.toFixed(0)} kg of ship: ${statement.liftMargin.toFixed(0)} kg spare.`
        : `${statement.grossLift.toFixed(0)} kg of lift against ${statement.total.toFixed(0)} kg of ship. It is ${(-statement.liftMargin).toFixed(0)} kg HEAVY at the ${(design.gas.seaLevelFillFraction * 100).toFixed(0)} percent fill fraction that gives it pressure height. Either the hull grows or the arrangement sheds.`,
  })

  findings.push({
    id: 'mass-growth-margin',
    severity:
      statement.liftMargin >= MASS_GROWTH_ALLOWANCE * statement.total
        ? 'pass'
        : statement.liftMargin > 0
          ? 'warn'
          : 'fail',
    rule: `Lift margin at least ${(MASS_GROWTH_ALLOWANCE * 100).toFixed(0)} percent of gross weight, to absorb preliminary-estimate growth.`,
    detail: `${statement.liftMargin.toFixed(0)} kg of margin on ${statement.total.toFixed(0)} kg, ${((statement.liftMargin / statement.total) * 100).toFixed(1)} percent. Preliminary mass estimates grow 10 to 20 percent between concept and first flight, every time, and an airship has no way to trade payload for the difference: it either lifts or it does not. A design that closes exactly is a design that will not close.`,
  })

  findings.push({
    id: 'mass-against-the-historical-fleet',
    severity:
      statement.emptyWeightPerGasVolume <= EMPTY_WEIGHT_PER_GAS_VOLUME.hindenburg
        ? 'pass'
        : statement.emptyWeightPerGasVolume <= EMPTY_WEIGHT_PER_GAS_VOLUME.high
          ? 'warn'
          : 'fail',
    rule: `Empty weight per cubic metre of gas at or below the Hindenburg's ${EMPTY_WEIGHT_PER_GAS_VOLUME.hindenburg} kg/m3.`,
    detail: `${statement.emptyWeightPerGasVolume.toFixed(3)} kg/m3 empty, against a historical fleet band of ${EMPTY_WEIGHT_PER_GAS_VOLUME.low} to ${EMPTY_WEIGHT_PER_GAS_VOLUME.high}, all of it duralumin. Compared on EMPTY weight because that is what the fleet table records; consumables and crew are excluded from both sides. This ship also carries a photovoltaic array and a habitat that no ship in that table did, so beating the band is a harder claim than it looks.`,
  })

  // ---- the keel has to actually contain what is in it -------------------
  const keelBays = config.compartments.filter((c) => c.deck === 'keel' && c.id !== 'keel-structure')
  const bayVolume = keelBays.reduce((s, c) => s + compartmentVolume(c), 0)
  const overflowing = keelBays.filter(
    (c) =>
      c.station - c.extent / 2 / length < config.keelForward ||
      c.station + c.extent / 2 / length > config.keelAft,
  )
  findings.push({
    id: 'keel-bays-fit-inside-the-keel',
    severity: bayVolume <= statement.keelEnvelope && overflowing.length === 0 ? 'pass' : 'fail',
    rule: 'Every keel bay fits inside the keel corridor envelope, longitudinally and by volume.',
    detail:
      bayVolume <= statement.keelEnvelope && overflowing.length === 0
        ? `${bayVolume.toFixed(0)} m3 of bays inside a ${statement.keelEnvelope.toFixed(0)} m3 corridor running station ${config.keelForward} to ${config.keelAft}. That corridor is subtracted from the gas volume, so the space you live in is paid for in lift rather than assumed free.`
        : `${bayVolume.toFixed(0)} m3 of bays in a ${statement.keelEnvelope.toFixed(0)} m3 corridor${overflowing.length > 0 ? `, and ${overflowing.map((c) => c.name).join(', ')} extends past the corridor ends` : ''}. The lift figure assumes the cells get everything outside the corridor, so an overflowing bay is lift the ship does not have.`,
  })

  // ---- trim authority ----------------------------------------------------
  // Knowing the ship is out of trim is only half a finding. The other half is
  // whether the ballast can actually move far enough to fix it.
  const forward = config.compartments.find((c) => c.id === 'water-forward')
  const aft = config.compartments.find((c) => c.id === 'water-aft')
  if (forward && aft) {
    const arm = (aft.station - forward.station) * length
    const transferable = Math.min(forward.mass, aft.mass)
    const required = Math.abs(trimOffset) * length * statement.total
    const available = transferable * arm
    findings.push({
      id: 'trim-authority',
      severity: available >= required ? 'pass' : 'fail',
      rule: 'Ballast transfer between the two water tanks can correct the standing trim offset.',
      detail:
        available >= required
          ? `${(required / arm).toFixed(0)} kg has to move ${arm.toFixed(0)} m to bring the centre of gravity onto the centre of buoyancy, and ${transferable.toFixed(0)} kg can. The margin is what absorbs stores burning off over the year, which is a nose-up trend of its own.`
          : `${(required / arm).toFixed(0)} kg would have to move ${arm.toFixed(0)} m and only ${transferable.toFixed(0)} kg can. The ship flies permanently out of trim, which costs drag at every hour of every day.`,
    })
  }

  // ---- does the arrangement physically fit inside the hull ---------------
  // A box drawn in metres does not automatically fit a hull that tapers. This
  // is the check the fractional-radius version could not make, because in that
  // version everything fitted by definition and the rooms grew with the ship.
  const clashes: string[] = []
  for (const c of config.compartments) {
    if (c.deck !== 'keel' && c.deck !== 'cells') continue
    for (const end of [c.station - c.extent / 2 / length, c.station + c.extent / 2 / length]) {
      const r = hullRadiusAt(m(length), finenessRatio, Math.min(Math.max(end, 0), 1))
      const z = compartmentHeight(c, r)
      // Worst corner: half the width out, and whichever vertical face is
      // further from the axis.
      const corner = Math.hypot(c.width / 2, Math.abs(z) + c.height / 2)
      if (corner > r) {
        clashes.push(`${c.name} by ${(corner - r).toFixed(1)} m at station ${end.toFixed(2)}`)
        break
      }
    }
  }
  findings.push({
    id: 'compartments-fit-the-hull',
    severity: clashes.length === 0 ? 'pass' : 'fail',
    rule: 'Every keel bay fits inside the hull section at both of its ends.',
    detail:
      clashes.length === 0
        ? 'Every bay clears the hull skin over its full length. The hull tapers and the bays do not, so this is a real constraint rather than a formality: it is what stops the corridor running out past the cover near the tail.'
        : `${clashes.join('; ')}. The hull tapers toward the ends and these boxes do not, so they leave the envelope.`,
  })

  // ---- fins against the Munk moment --------------------------------------
  const fins = finPlanform(design, config)
  const geometry = hullGeometry(
    m(length),
    finenessRatio,
    hullShapeForPrismatic(design.hull.prismaticCoefficient),
  )
  const { k1, k2 } = inertiaCoefficients(finenessRatio)
  const finArm = (config.finStation - statement.centreOfBuoyancy.x / length) * length
  /**
   * Fin lift-curve slope, per radian, computed rather than assumed.
   *
   * THIS WAS A FLAT 2.8 AND ITS JUSTIFICATION HAD THE SIGN BACKWARDS. The
   * comment said the tail sits in a thick hull boundary layer whose local
   * dynamic pressure is below free stream, and then used that to argue for a
   * value TWICE the geometric one. A loss makes a number smaller.
   *
   * The real reason a fin on a body beats its own aspect ratio is the
   * REFLECTION PLANE: the hull acts as an end plate, so the exposed surface
   * behaves like half of a wing of twice the span, and the effective aspect
   * ratio doubles. That is worth roughly the factor the old constant claimed,
   * and the boundary-layer loss then comes off it rather than being folded into
   * it backwards.
   *
   * @source Helmbold's low-aspect-ratio lift-curve slope at the effective
   * aspect ratio, which is the same relation the hull aerodynamics use.
   */
  const exposedAspectRatio = fins.span ** 2 / (fins.area / 4)
  /** @source The hull is an end plate, so the exposed fin behaves as half a wing. */
  const REFLECTION_PLANE_FACTOR = 2
  const effectiveAspectRatio = exposedAspectRatio * REFLECTION_PLANE_FACTOR
  /**
   * @source Local dynamic pressure at the tail, as a fraction of free stream.
   * The fin sits inside a boundary layer that is metres thick on a hull this
   * long, and airship practice puts the loss at 10 to 20 percent.
   */
  const TAIL_DYNAMIC_PRESSURE_RATIO = 0.85
  const finLiftSlope =
    ((2 * Math.PI * effectiveAspectRatio) / (2 + Math.sqrt(effectiveAspectRatio ** 2 + 4))) *
    TAIL_DYNAMIC_PRESSURE_RATIO

  const minimumFinArea =
    (2 * MUNK_REAL_FLUID_FACTOR * geometry.volume * (k2 - k1)) / (finLiftSlope * finArm)

  /**
   * ONLY THE VERTICAL PAIR MAKES A YAW RESTORING MOMENT. This compared all four
   * surfaces of the cruciform against the minimum, which counts the horizontal
   * tailplane as if it stabilised the vehicle in yaw. Between that and the
   * doubled lift slope the reported margin was four times the real one, and the
   * vehicle it described was directionally divergent at every speed.
   */
  const yawFinArea = fins.area / 2
  const staticMargin = yawFinArea / minimumFinArea
  /** @source Airship practice wants 1.3 to 1.8 in yaw. Below 1 the vehicle diverges. */
  const MINIMUM_YAW_STATIC_MARGIN = 1.3
  findings.push({
    id: 'yaw-static-margin',
    severity:
      staticMargin >= MINIMUM_YAW_STATIC_MARGIN ? 'pass' : staticMargin >= 1 ? 'warn' : 'fail',
    rule: `Fin area at least ${MINIMUM_YAW_STATIC_MARGIN} times the minimum that balances the Munk moment.`,
    detail: `${yawFinArea.toFixed(0)} m2 of VERTICAL fin, half of the ${fins.area.toFixed(0)} m2 cruciform, against a ${minimumFinArea.toFixed(0)} m2 minimum on a ${finArm.toFixed(1)} m arm: a static margin of ${staticMargin.toFixed(2)}. The lift slope is ${finLiftSlope.toFixed(2)} per radian, from an exposed aspect ratio of ${exposedAspectRatio.toFixed(2)} doubled by the hull acting as an end plate and then knocked down ${((1 - TAIL_DYNAMIC_PRESSURE_RATIO) * 100).toFixed(0)} percent for the boundary layer the tail sits in. The Munk moment is certain and the fin effectiveness is not, so the margin is the honest part of this number.`,
  })

  // ---- can it put itself down and pick itself up again? -------------------
  const totalPropulsorPower = config.propulsors.reduce((sum, p) => sum + p.ratedPower, 0)
  const totalDiscArea = config.propulsors.reduce(
    (sum, p) => sum + (Math.PI * p.diameter ** 2) / 4,
    0,
  )
  const effectiveDiameter = 2 * Math.sqrt(totalDiscArea / config.propulsors.length / Math.PI)
  const allDucted = config.propulsors.every((p) => p.ducted)
  const hover = hoverCapability(
    config.propulsors.length,
    effectiveDiameter,
    W(totalPropulsorPower),
    allDucted,
    kg(statement.total),
    LANDING_TRIM,
  )
  const outOne = propulsorOut(config.propulsors, LANDING_TRIM)
  findings.push({
    id: 'vertical-landing',
    severity: outOne.stillLands ? 'pass' : hover.liftsItsTrim ? 'warn' : 'fail',
    rule: 'The propulsors lift the landing trim with one of them stopped.',
    detail: `${config.propulsors.length} ${allDucted ? 'ducted ' : ''}propulsors at an effective ${effectiveDiameter.toFixed(1)} m lift ${hover.liftableHeaviness.toFixed(0)} kg on ${(totalPropulsorPower / 1000).toFixed(0)} kW, and ${outOne.remainingHeaviness.toFixed(0)} kg with one stopped, against a ${LANDING_TRIM} kg landing trim. THE TRIM IS SET BY THIS CASE and not by the sea state: a trim the vehicle can only leave with every propulsor running turns one failure into a vehicle that cannot take off again. Diameter is the whole game, because static thrust goes as the four-thirds power of it at fixed power, and the duct is worth a further factor of two.`,
  })

  // ---- habitability ------------------------------------------------------
  const perPerson = statement.habitableVolume / design.loads.crew
  findings.push({
    id: 'habitable-volume',
    severity:
      perPerson >= HABITABLE_VOLUME_PER_PERSON.optimal
        ? 'pass'
        : perPerson >= HABITABLE_VOLUME_PER_PERSON.performance
          ? 'warn'
          : 'fail',
    rule: `At least ${HABITABLE_VOLUME_PER_PERSON.optimal} m3 of habitable volume per person for a mission past the Celentano asymptote.`,
    detail: `${statement.habitableVolume.toFixed(0)} m3 across ${design.loads.crew} crew, ${perPerson.toFixed(0)} m3 each. Tolerable is ${HABITABLE_VOLUME_PER_PERSON.tolerable}, the performance limit is ${HABITABLE_VOLUME_PER_PERSON.performance}, and ${HABITABLE_VOLUME_PER_PERSON.optimal} is where more volume stops helping. For a year, designing to tolerable is how you get a crew that stops maintaining the ship.`,
  })

  // ---- the diurnal swing, against everything that rests on the water -----
  /**
   * @source A dark envelope in tropical sun runs 15 to 25 K above ambient. Taken
   * at 20 K, which is the middle of the band and the figure the superheat module
   * uses for its worked example.
   */
  // From the SEA LEVEL lift, which is where every ground and water case
  // happens, and the same basis the gear is sized on.
  const seaLevelForSuperheat = atmosphere(m(0))
  const excursion = superheatHeavinessExcursion(
    statement.seaLevelGrossLift,
    DESIGN_SUPERHEAT,
    pure(design.gas.species),
    seaLevelForSuperheat,
    design.gas.seaLevelFillFraction,
  )

  /**
   * The active ballast loop, if the arrangement carries one.
   *
   * THE GATE USED TO ASSERT THAT NO PASSIVE DEVICE COULD BE SIZED FOR THIS, and
   * that is still true and still the point. What changed is that it now checks
   * whether the vehicle carries the ACTIVE loop it was asking for, instead of
   * failing permanently and calling itself the largest unresolved item.
   */
  const ballastBay = config.compartments.find((c) => c.id === 'ballast-loop')
  const ballastCapacity = ballastBay ? compartmentVolume(ballastBay) : 0
  const loop = ballastLoop(excursion, LANDING_TRIM, design.loads.habitatPower)
  const covered = ballastCapacity >= loop.tankVolume

  findings.push({
    id: 'superheat-against-landing-trim',
    severity: excursion <= LANDING_TRIM ? 'pass' : covered ? 'pass' : 'fail',
    rule: `The daily superheat lift excursion is answered, by a trim that swallows it or by a ballast loop that tracks it.`,
    detail:
      excursion <= LANDING_TRIM
        ? `${DESIGN_SUPERHEAT} K of superheat moves lift by ${excursion.toFixed(0)} kg against a ${LANDING_TRIM} kg landing trim, so a passive float can be sized for it.`
        : covered
          ? `${DESIGN_SUPERHEAT} K of superheat moves lift by ${excursion.toFixed(0)} kg, which is ${(excursion / LANDING_TRIM).toFixed(1)} times the ${LANDING_TRIM} kg the vehicle rests on water at, so NO PASSIVE WATER-CONTACT DEVICE CAN BE SIZED FOR IT: a relief valve set for the trim is bypassed at the night load and useless at the day load. The arrangement answers it with ${ballastCapacity.toFixed(1)} m3 of seawater bladder against the ${loop.tankVolume.toFixed(1)} m3 the swing needs, pumped at ${loop.transferRate.toFixed(0)} kg a minute on ${loop.pumpPower.toFixed(0)} W. THE OCEAN IS THE BALLAST and moving water costs about a three-thousandth of what compressing lifting gas does. It works only afloat, which is where the problem is.`
          : `${DESIGN_SUPERHEAT} K of superheat moves lift by ${excursion.toFixed(0)} kg, which is ${(excursion / LANDING_TRIM).toFixed(1)} times the ${LANDING_TRIM} kg the vehicle rests on water at. The ship floats off its float in the afternoon and presses ${(excursion / 1000).toFixed(1)} tonnes onto it before dawn, every day. NO PASSIVE WATER-CONTACT DEVICE CAN BE SIZED FOR A LOAD THAT SWINGS BY THAT FACTOR TWICE A DAY. The arrangement carries ${ballastCapacity.toFixed(1)} m3 of ballast capacity against the ${loop.tankVolume.toFixed(1)} m3 the swing needs, so either the bladder grows or the vehicle does not rest on the surface at all.`,
  })

  // ---- propulsion --------------------------------------------------------
  const vectoringPairs = config.propulsors.filter(
    (p) => Math.abs(p.lateralOffset) > 0 && p.vectorAuthority >= Math.PI / 2,
  )
  findings.push({
    id: 'zero-airspeed-control',
    severity: vectoringPairs.length >= 2 ? 'pass' : 'fail',
    rule: 'At least one laterally separated pair with full 90 degree vectoring.',
    detail:
      vectoringPairs.length >= 2
        ? 'Differential thrust across the mid pair gives yaw authority at zero airspeed, which is the entire control system during mooring, during a water landing, and any time the fins have no flow over them.'
        : 'No laterally separated fully vectoring pair. The fins do nothing below about 5 m/s, so without this the ship is uncontrollable exactly when it is closest to something solid.',
  })

  /**
   * THE WORST UNIT, AT ITS OWN STATION, ON ITS INBOARD SIDE.
   *
   * This check had three errors that all ran the same way. It took the maximum
   * over the propulsors, which finds the unit with the most clearance rather
   * than the one with the least; it measured against the hull's MAXIMUM radius
   * rather than the local radius at each propulsor's station, which is smaller
   * everywhere except amidships and so understated the clearance for units near
   * the ends; and it compared the OUTER tip against the hull, when the tip that
   * can strike is the inner one.
   */
  const worstClearance = Math.min(
    ...config.propulsors.map((p) => {
      const localRadius = radiusAt(p.station)
      const centreOffset = Math.abs(p.lateralOffset) * maxRadius
      // The inboard tip is what approaches the hull.
      return centreOffset - p.diameter / 2 - localRadius
    }),
  )
  const clearance = worstClearance
  findings.push({
    id: 'propeller-hull-clearance',
    severity: clearance > 0 ? 'pass' : 'fail',
    rule: 'Propeller discs clear the hull surface.',
    detail:
      clearance > 0
        ? `The tightest unit's INBOARD tip clears the hull at its own station by ${clearance.toFixed(1)} m. The outrigger has to carry that offset, and its bending moment is what sets the mount mass.`
        : `Propeller tips intersect the hull by ${(-clearance).toFixed(1)} m at the tightest unit. The outrigger is too short or the disc is too large.`,
  })

  return findings
}

/**
 * The smallest hull length at which the arrangement closes.
 *
 * Bisection on lift margin. Everything in the arrangement except the hull group
 * is fixed, and the hull group grows more slowly than lift does, so margin is
 * monotonic in length over any range worth searching and bisection is safe.
 *
 * This exists because the baseline does NOT close, and "make it bigger" is a
 * useless answer without a number attached to it.
 */
export const smallestClosingLength = (
  design: DesignPoint,
  config: Configuration,
  /**
   * Margin required as a fraction of gross weight. Defaults to the growth
   * allowance, because "the length at which it closes exactly" is a number that
   * gets a ship built and then grounded.
   */
  marginFraction = MASS_GROWTH_ALLOWANCE,
): number | null => {
  const marginAt = (length: number): number => {
    const s = massStatement({ ...design, hull: { ...design.hull, length } }, config)
    return s.liftMargin - marginFraction * s.total
  }

  /** @derived Search bounds. Below 50 m nothing closes; above 200 m is a different project. */
  let low = 50
  /** @derived The upper search bound, from the same reasoning. */
  let high = 200
  if (marginAt(high) < 0) return null
  if (marginAt(low) > 0) return low

  /** @derived 40 bisections resolve the length to well under a millimetre. */
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2
    if (marginAt(mid) < 0) low = mid
    else high = mid
  }
  return high
}

// --------------------------------------------------------------------------
// The hull girder, loaded by the arrangement rather than by a guess
// --------------------------------------------------------------------------

/**
 * Peak bending moment in the hull, from the arrangement's own masses.
 *
 * The distributed loads are the hull group, spread along the hull in proportion
 * to the local cross-section, because that is how frame, cover and cells are
 * actually distributed. Everything else is a POINT LOAD at its own station: the
 * gondola, the tanks, the machinery, the propulsors and the fins.
 *
 * WHY THIS MATTERS BEYOND THE FRAME. Buoyancy is distributed like AREA and
 * weight is distributed like the arrangement, and the two do not match. The
 * mismatch is the whole bending moment. A version of this that put the gondola
 * at a nominal station and the engines at another nominal station, which is
 * what the site did before, gets the shape of the diagram roughly right and the
 * magnitude wrong, and the magnitude is what the pressure-stabilised
 * architectures live or die on: the envelope pressure they need is the bending
 * moment divided by pi R^3.
 */
export interface HullGirderLoads {
  /** The static case: weight against buoyancy on a trimmed ship, N m. */
  readonly staticMoment: number
  readonly staticStation: number
  readonly hogging: boolean
  readonly maximumShear: number
  /** Station the shear peaks at, m. */
  readonly maximumShearStation: number
  /** The gust case, which is what actually sizes the girder, N m. */
  readonly gustMoment: number
  /** Incidence the gust puts on the hull, radians. */
  readonly gustIncidence: number
  /** The larger of the two, for anything that needs a design moment. */
  readonly designMoment: number
  /**
   * Shear and moment along the hull, so a diagram of them can be drawn from
   * the same solve that produced the scalars above rather than from a second
   * one with its own point loads.
   */
  readonly distribution: readonly {
    readonly x: number
    readonly shear: number
    readonly moment: number
    readonly buoyancy: number
    readonly weight: number
  }[]
  /** The discrete masses hung on the girder, for labelling the diagram. */
  readonly pointLoads: readonly {
    readonly name: string
    readonly x: number
    readonly mass: number
  }[]
  readonly note: string
}

/**
 * The gust that sizes the hull girder.
 *
 * @source Airship and aeroplane certification both use a sharp-edged vertical
 * gust as the design case. 7.5 m/s is the standard rough-air gust at low
 * altitude; airship practice historically used similar figures and the Akron
 * and Macon losses were both gust-related.
 *
 * The incidence a gust puts on the hull is atan(w/V), and it is LARGER at LOW
 * SPEED, which is the opposite of the aeroplane case where gust load factor
 * grows with speed. An airship holding station at 8 m/s in a 7.5 m/s vertical
 * gust sees 43 degrees of incidence. That is why the Munk moment, which peaks
 * at 45 degrees, is an airship's design load and not a footnote.
 */
const DESIGN_GUST = 7.5

export const hullBendingMoment = (design: DesignPoint, config: Configuration): HullGirderLoads => {
  const { length, finenessRatio, prismaticCoefficient } = design.hull
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const statement = massStatement(design, config)

  /** @derived 201 stations resolves the moment peak to well under a percent. */
  const STATIONS = 201
  const sections = crossSectionDistribution(m(length), finenessRatio, STATIONS, shape)

  const air = atmosphere(m(design.mission.altitude))
  const lift = specificLift(pure(design.gas.species), air, K(air.temperature))
  const buoyancy = buoyancyDistribution(
    sections.map((s) => ({ x: s.x, area: s.area as number })),
    lift,
  )

  // The hull group is distributed like the cross-section. Everything with a
  // station of its own is a point load.
  const distributedIds = new Set(['frame', 'cover', 'gas-cells', 'photovoltaics'])
  const distributedMass = statement.items
    .filter((i) => distributedIds.has(i.id))
    .reduce((sum, i) => sum + i.mass, 0)
  const areaIntegral = sections.reduce((sum, s) => sum + (s.area as number), 0)

  /** @source Standard gravity, turning the masses into forces. */
  const g = 9.80665

  const loads = sections.map((section, i) => ({
    x: section.x,
    buoyancy: buoyancy[i]?.buoyancy ?? 0,
    weight: (((section.area as number) / areaIntegral) * distributedMass * g * STATIONS) / length,
  }))

  const pointLoads = statement.items
    .filter((i) => !distributedIds.has(i.id))
    .map((i) => ({ name: i.name, x: m(i.x), mass: i.mass }))

  // TRIM THE SHIP BEFORE LOADING IT. The arrangement's lift margin is not spare
  // capacity in flight, it is water: the tanks are topped up until the vehicle
  // is neutrally buoyant, and that is the condition the girder actually sees.
  //
  // Solving the beam untrimmed instead leaves a residual force that the
  // inertial relief spreads over the whole hull as an upward acceleration. The
  // diagram then describes a vehicle climbing away at a quarter of a g, which
  // is not a load case and understates the moment by a factor of several.
  const forwardTank = statement.items.find((i) => i.id === 'water-forward')
  const aftTank = statement.items.find((i) => i.id === 'water-aft')
  if (statement.liftMargin > 0 && forwardTank && aftTank) {
    const perTank = statement.liftMargin / 2
    pointLoads.push(
      { name: 'trim ballast forward', x: m(forwardTank.x), mass: perTank },
      { name: 'trim ballast aft', x: m(aftTank.x), mass: perTank },
    )
  }

  const beam = solveBeam(loads, pointLoads)

  // THE GUST CASE, which is what actually sizes the girder.
  //
  // The static diagram above comes out at half a meganewton metre on a 115 m
  // hull, which needs a section modulus of about a cubic decimetre: every
  // longitudinal would be minimum gauge. That agrees with the buckling module,
  // which found the frame buckling-limited almost everywhere, and it means the
  // static case is not the design case.
  //
  // The design case is a gust, and for an airship the gust load is the MUNK
  // MOMENT rather than a wing load factor. It peaks at 45 degrees of incidence,
  // and incidence from a vertical gust is atan(w/V), so it is worst at LOW
  // speed: exactly the station-keeping condition this vehicle spends its life
  // in.
  const gustIncidence = Math.atan(DESIGN_GUST / Math.max(design.mission.stationKeepingWind, 1))
  const geometry = hullGeometry(m(length), finenessRatio, shape)
  const gustMoment =
    Math.abs(
      munkMoment(
        geometry.volume,
        finenessRatio,
        kgPerM3(air.density),
        Math.hypot(design.mission.stationKeepingWind, DESIGN_GUST),
        gustIncidence,
      ),
    ) * MUNK_REAL_FLUID_FACTOR

  const designMoment = Math.max(Math.abs(beam.maximumMoment), gustMoment)

  /** @derived Newton metres to meganewton metres, for the human-readable note. */
  const MN = 1e6

  return {
    staticMoment: Math.abs(beam.maximumMoment),
    staticStation: beam.maximumMomentStation,
    hogging: beam.hogging,
    maximumShear: Math.abs(beam.maximumShear),
    maximumShearStation: beam.maximumShearStation as number,
    gustMoment,
    gustIncidence,
    designMoment,
    distribution: beam.stations.map((station, i) => ({
      x: station.x as number,
      shear: station.shear as number,
      moment: station.moment as number,
      buoyancy: loads[i]?.buoyancy ?? 0,
      weight: loads[i]?.weight ?? 0,
    })),
    pointLoads: pointLoads.map((p) => ({ name: p.name, x: p.x as number, mass: p.mass })),
    note:
      gustMoment > Math.abs(beam.maximumMoment)
        ? `The static case is ${(Math.abs(beam.maximumMoment) / MN).toFixed(2)} MN m and the gust case is ${(gustMoment / MN).toFixed(2)} MN m, so the gust sizes the girder. A ${DESIGN_GUST} m/s vertical gust at ${design.mission.stationKeepingWind} m/s of forward speed is ${((gustIncidence * 180) / Math.PI).toFixed(0)} degrees of incidence, and the Munk moment peaks at 45. An airship's gust case gets WORSE as it slows down, which is the reverse of an aeroplane's and is why station-keeping is the structural design condition.`
        : `The static case is ${(Math.abs(beam.maximumMoment) / MN).toFixed(2)} MN m and governs, which is unusual and worth checking: for most airships the gust case is larger.`,
  }
}
