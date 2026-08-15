import {
  assessConfinement,
  atmosphere,
  cellFilmArea,
  coveredArea,
  criticalDuctDiameter,
  grossLift,
  hullGeometry,
  hullRadiusAt,
  hullShapeForPrismatic,
  inertiaCoefficients,
  MUNK_REAL_FLUID_FACTOR,
  pure,
} from '@airship/core'
import { barrierFilm, EMPTY_WEIGHT_PER_GAS_VOLUME, v } from '@airship/data'
import { m, m3, K, rad } from '@airship/units'

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
 * @source The fleet table records empty weight, not framework weight, and no
 * verifiable published breakdown separates the two for any ship in it. Zeppelin
 * practice puts the girder and wiring structure at roughly half of fixed
 * weight, with cover, cells, cars, engines, keels and systems making up the
 * rest. Taken as 0.47 with the understanding that it is the single softest
 * number in this module.
 */
const FRAMEWORK_SHARE_OF_EMPTY_WEIGHT = 0.47

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
 * @source Conventional practice puts the fin root chord at 12 to 18 percent of
 * length for a cruciform tail on a hull of this fineness. Taken at the BOTTOM of
 * that range: at 0.15 the yaw static margin comes out at 1.78, which is more fin
 * than the Munk moment needs, and every one of those square metres is mass on a
 * 46 m lever that the trim ballast then has to fight.
 */
const FIN_ROOT_CHORD_FRACTION = 0.12

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

/** @derived Simpson's rule needs an even panel count. 24 resolves a compartment. */
const COMPARTMENT_PANELS = 24

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
 * Volume of a compartment, m3.
 *
 * The box is defined in units of the LOCAL hull radius, so a compartment at the
 * tapering ends is automatically smaller than the same fractions amidships.
 * That is what makes the drawn volume and the budgeted volume the same number:
 * both come from this integral.
 *
 * @derived V = integral over the extent of (2 * halfWidth * R) * (height * R)
 * dx, with dx in metres, evaluated by Simpson's rule.
 */
export const compartmentVolume = (
  c: Pick<Compartment, 'station' | 'extent' | 'halfWidth' | 'height'>,
  length: number,
  finenessRatio: number,
  prismaticCoefficient: number,
): number => {
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const from = Math.max(c.station - c.extent / 2, 0)
  const to = Math.min(c.station + c.extent / 2, 1)
  const span = to - from
  if (span <= 0) return 0

  const h = span / COMPARTMENT_PANELS
  let sum = 0
  for (let i = 0; i <= COMPARTMENT_PANELS; i += 1) {
    const station = from + i * h
    const r = hullRadiusAt(m(length), finenessRatio, station, shape)
    const weight = i === 0 || i === COMPARTMENT_PANELS ? 1 : i % 2 === 1 ? 4 : 2
    sum += weight * r * r
  }
  const integral = ((h * length) / 3) * sum

  return 2 * c.halfWidth * c.height * integral
}

/**
 * The keel corridor envelope: the hull volume the structure takes away from the
 * gas cells.
 *
 * Read off the `keel-structure` compartment when one is present, because that
 * IS the corridor, and falls back to the keel extent and width otherwise.
 */
export const keelEnvelopeVolume = (
  config: Configuration,
  length: number,
  finenessRatio: number,
  prismaticCoefficient: number,
): number => {
  const corridor = config.compartments.find((c) => c.id === 'keel-structure')
  if (corridor) return compartmentVolume(corridor, length, finenessRatio, prismaticCoefficient)

  const maxRadius = length / finenessRatio / 2
  return compartmentVolume(
    {
      station: (config.keelForward + config.keelAft) / 2,
      extent: config.keelAft - config.keelForward,
      halfWidth: config.keelWidth / 2 / maxRadius,
      /** @derived Standing headroom over the walkway, as a fraction of radius. */
      height: 0.36,
    },
    length,
    finenessRatio,
    prismaticCoefficient,
  )
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
      z: c.heightFraction * radiusAt(c.station),
      volume: compartmentVolume(c, length, finenessRatio, prismaticCoefficient),
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
  const keelEnvelope = keelEnvelopeVolume(config, length, finenessRatio, prismaticCoefficient)
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

  const finRootChord = FIN_ROOT_CHORD_FRACTION * length
  const finSpan = config.finSpanFraction * maxRadius
  /** @derived Trapezoid area, four surfaces in a cruciform tail. */
  const finArea = 4 * 0.5 * (finRootChord + finRootChord * FIN_TAPER_RATIO) * finSpan

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
      id: 'fins',
      name: 'Cruciform fins and control surfaces',
      category: 'structure',
      deck: 'external',
      mass: finArea * FIN_AREAL_MASS,
      x: config.finStation * length,
      z: 0,
      volume: 0,
      computed: true,
      note: `${finArea.toFixed(0)} m2 of planform. Large because the Munk moment is destabilising at every angle of attack and the fins are the only thing opposing it.`,
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
  const keelBays = config.compartments.filter(
    (c) => c.deck === 'keel' && c.id !== 'keel-structure',
  )
  const bayVolume = keelBays.reduce(
    (s, c) => s + compartmentVolume(c, length, finenessRatio, design.hull.prismaticCoefficient),
    0,
  )
  const overflowing = keelBays.filter(
    (c) =>
      c.station - c.extent / 2 < config.keelForward ||
      c.station + c.extent / 2 > config.keelAft,
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

  // ---- fins against the Munk moment --------------------------------------
  const finRootChord = FIN_ROOT_CHORD_FRACTION * length
  const finSpan = config.finSpanFraction * maxRadius
  const finArea = 4 * 0.5 * (finRootChord + finRootChord * FIN_TAPER_RATIO) * finSpan
  const geometry = hullGeometry(
    m(length),
    finenessRatio,
    hullShapeForPrismatic(design.hull.prismaticCoefficient),
  )
  const { k1, k2 } = inertiaCoefficients(finenessRatio)
  const finArm = (config.finStation - statement.centreOfBuoyancy.x / length) * length
  /**
   * @source Slender-body lift-curve slope for a low-aspect-ratio surface,
   * 2*pi*AR/(AR + 2) at the fin aspect ratio, which for a cruciform tail of this
   * planform is close to 2.8 per radian. Taken flat rather than computed from
   * span because the tail sits in a thick hull boundary layer whose local
   * dynamic pressure is well below free stream, and that loss is larger than the
   * aspect-ratio correction.
   */
  const finLiftSlope = 2.8
  const minimumFinArea =
    (2 * MUNK_REAL_FLUID_FACTOR * geometry.volume * (k2 - k1)) / (finLiftSlope * finArm)
  const staticMargin = finArea / minimumFinArea
  /** @source Airship practice wants 1.3 to 1.8 in yaw. Below 1 the vehicle diverges. */
  const MINIMUM_YAW_STATIC_MARGIN = 1.3
  findings.push({
    id: 'yaw-static-margin',
    severity:
      staticMargin >= MINIMUM_YAW_STATIC_MARGIN ? 'pass' : staticMargin >= 1 ? 'warn' : 'fail',
    rule: `Fin area at least ${MINIMUM_YAW_STATIC_MARGIN} times the minimum that balances the Munk moment.`,
    detail: `${finArea.toFixed(0)} m2 of fin against a ${minimumFinArea.toFixed(0)} m2 minimum on a ${finArm.toFixed(1)} m arm: a static margin of ${staticMargin.toFixed(2)}. The Munk moment is certain and the fin effectiveness is not, because the tail sits in a thick hull boundary layer, so the margin is the honest part of this number.`,
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

  const propellerTipRadius = Math.max(
    ...config.propulsors.map(
      (p) => Math.abs(p.lateralOffset) * maxRadius + (p.diameterFraction * maxRadius) / 2,
    ),
  )
  const clearance = propellerTipRadius - maxRadius
  findings.push({
    id: 'propeller-hull-clearance',
    severity: clearance > 0 ? 'pass' : 'fail',
    rule: 'Propeller discs clear the hull surface.',
    detail:
      clearance > 0
        ? `Outermost tip is ${clearance.toFixed(1)} m outboard of the hull at maximum radius. The outrigger has to carry that, and its bending moment is what sets the mount mass.`
        : `Propeller tips intersect the hull by ${(-clearance).toFixed(1)} m. The outrigger is too short or the disc is too large.`,
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
