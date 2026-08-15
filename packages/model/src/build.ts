import {
  atmosphere,
  cellFilmArea,
  frameSchedule,
  laminate,
  coveredArea,
  gasDensity,
  hullGeometry,
  hullRadiusAt,
  hullShapeForPrismatic,
  pure,
} from '@airship/core'
import {
  BUILD_LABOUR,
  BUILD_PRECEDENT,
  FACILITY,
  GROUND_HANDLING,
  MATERIAL_PRICES,
  v,
  bounds,
  WET_LAYUP,
} from '@airship/data'
import { m, Pa, rad, K } from '@airship/units'

import type { Provenanced } from '@airship/data'

import type { Configuration } from './configuration.js'
import type { DesignPoint } from './design-point.js'
import { finPlanform, hullBendingMoment, massStatement } from './arrangement.js'

/**
 * Can two people build it?
 *
 * Every other module in this repository asks whether the vehicle works. This
 * one asks whether it can exist, and it is the module most likely to end the
 * project, so it gets the same treatment as the physics: computed from the
 * model's own masses and areas, cited, and reported without softening.
 *
 * THE STRUCTURE OF THE ANSWER, before the numbers:
 *
 *   The materials are expensive but not impossible. They are a house.
 *
 *   The building you need to assemble them in costs six times the materials,
 *   cannot be rented because roughly six exist worldwide and all are in use,
 *   and is the reason no individual has built a rigid airship since 1930.
 *
 *   The labour is decades at two people, and the comparison that settles it is
 *   Pathfinder 1: 124 m, professionally staffed, in an existing hangar, funded
 *   without limit, seven years from start to first untethered flight.
 *
 *   And once it exists, two people cannot hold it broadside in a wind you would
 *   not notice indoors.
 *
 * WHAT IS ACTIONABLE IN HERE is the tube finding. Bought pultruded carbon tube
 * is $262/kg against $115 to $245/kg for retail fabric you then have to laminate
 * yourself at about a square metre an hour, and the bought tube has nearly
 * double the modulus because it was made at production fibre volume fraction in
 * a heated die. Buying the members instead of making them removes the largest
 * single labour line in the build and improves the structure. It does not save
 * the project, but it is the difference between an impossible build and a build
 * whose remaining problem is a building.
 */

// --------------------------------------------------------------------------
// Bill of materials
// --------------------------------------------------------------------------

export interface BomLine {
  readonly id: string
  readonly name: string
  /** What the model says you need, in the unit below. */
  readonly quantity: number
  readonly unit: string
  readonly unitPrice: number
  readonly unitPriceUnit: string
  readonly cost: number
  /** Low and high, from the price uncertainty rather than from the quantity. */
  readonly costRange: readonly [number, number]
  readonly note: string
}

export interface BillOfMaterials {
  readonly lines: readonly BomLine[]
  /** The named lines only. */
  readonly namedSubtotal: number
  /**
   * Everything not itemised: fasteners, wire, fittings, valves, plumbing,
   * wiring, instruments, avionics, ground support, tooling and the several
   * hundred things a build discovers.
   */
  readonly unnamedAllowance: number
  readonly total: number
  readonly totalRange: readonly [number, number]
  /** Dollars per kilogram of gross weight, for comparison with other vehicles. */
  readonly perKilogram: number
  /** The three largest lines and what share of the named subtotal they are. */
  readonly concentration: {
    readonly lines: readonly string[]
    readonly share: number
  }
}

/**
 * @source A build discovers roughly 40 percent more in small parts than it
 * itemises at the start. This is the standard allowance for an estimate at this
 * level of definition, and on a vehicle with 226,000 joints in the frame alone
 * it is more likely low than high.
 */
const UNNAMED_ALLOWANCE_FRACTION = 0.4

/** @derived Offcuts on compound curvature. A flat panel wastes 10 percent; a hull nose wastes far more. */
const FABRIC_WASTE_FRACTION = 0.25

/** @derived Mixing losses, squeeze-out and the resin left in the pot. */
const RESIN_WASTE_FRACTION = 0.3

/** @derived Seams, laps and the panels you cut twice. */
const COVER_WASTE_FRACTION = 0.2

/** @derived The same, for gas cell film, which is patterned in narrower strips. */
const CELL_WASTE_FRACTION = 0.15

/** @derived Mean laminate thickness over the frame, m. Set by the minimum practical wall, not by load. */
const MEAN_LAMINATE_THICKNESS = 0.0015

/**
 * @source Cured thickness of one ply of 200 g/m2 3K twill at the fibre volume
 * fraction a hand wet layup reaches: areal weight over fibre density times Vf.
 *
 * This matters because LABOUR IS PER PLY PLACED, not per square metre of
 * finished laminate. A 1.5 mm wall is six plies, so the hands-on area is six
 * times the surface area of the part, and estimating on part area understates
 * the frame layup by that factor.
 */
const CURED_PLY_THICKNESS = 0.000247

/**
 * @source Cured density of a hand wet layup at the fibre volume fraction and
 * void content this project can achieve. Rule of mixtures at 1,800 kg/m3 fibre
 * and 1,200 kg/m3 cured epoxy.
 */
const WET_LAYUP_DENSITY = 1434

/**
 * @source Rated output per square metre of the lightest flexible module with a
 * published datasheet, MiaSole FLEX-03N: 130 W over 0.899 m2 of module.
 */
const MODULE_WATTS_PER_SQUARE_METRE = 144.6

/** @derived Small-scale premium on a 40 kW electrolyzer against IEA utility-scale capex. */
const SMALL_SCALE_PREMIUM = 1.35

/** @derived Watts in a kilowatt. */
const WATTS_PER_KW = 1000

/** @derived Newtons in a kilonewton. Same thousand, different quantity. */
const NEWTONS_PER_KN = 1000

/** @derived Scale prefixes, for reporting. */
const MEGA = 1e6
/** @derived Scale prefixes, for reporting. */
const GIGA = 1e9
/** @derived Minutes in an hour. */
const MINUTES_PER_HOUR = 60
/** @source Knots per metre per second, exactly 3600/1852. */
const KNOTS_PER_MS = 1.94384
/**
 * @source Longitudinal modulus of the woven wet layup this project can achieve:
 * Performance Composites' 70 GPa fabric at Vf 0.50, scaled to the 0.45 a hand
 * layup with a bag reaches and knocked down for 3 percent voids.
 */
const WET_LAYUP_MODULUS = 61e9

/** @derived Joules in a kilowatt hour. */
const JOULES_PER_KWH = 3.6e6

/** @source Longitudinal girders around the hull. Akron had 36, Hindenburg 36, R100 16. */
const LONGITUDINAL_COUNT = 24

/**
 * @source Ring spacing for that longitudinal count, m. Chosen in the structure
 * chapter to sit inside the 1.31 to 1.81 panel aspect ratio band that every
 * rigid airship which did not break occupied.
 */
const REFERENCE_RING_SPACING = 5.4

export const billOfMaterials = (design: DesignPoint, config: Configuration): BillOfMaterials => {
  const mass = massStatement(design, config)
  const { length, finenessRatio, prismaticCoefficient, cellCount } = design.hull
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const geometry = hullGeometry(m(length), finenessRatio, shape)

  const frameMass = mass.items.find((i) => i.id === 'frame')?.mass ?? 0
  const filmArea = cellFilmArea(geometry.wettedArea, mass.gasVolume, length, cellCount)
  const arrayArea = coveredArea({
    length: m(length),
    finenessRatio,
    coverageHalfAngle: rad(design.power.arrayCoverageHalfAngle),
    forwardStation: design.power.arrayForwardStation,
    aftStation: design.power.arrayAftStation,
    shape,
  })

  // The frame as fibre and resin. The frame mass the arrangement carries is the
  // CURED laminate, so splitting it needs the fibre volume fraction, and the
  // purchase quantity needs the waste on top of that.
  const fibreVolumeFraction = v(WET_LAYUP.fibreVolumeFraction)
  /** @derived Fibre mass fraction from volume fraction, at 1,800 and 1,200 kg/m3. */
  const fibreMassFraction =
    (fibreVolumeFraction * 1800) / (fibreVolumeFraction * 1800 + (1 - fibreVolumeFraction) * 1200)
  const fibreMass = frameMass * fibreMassFraction
  const resinMass = frameMass - fibreMass
  const laminateArea = frameMass / WET_LAYUP_DENSITY / MEAN_LAMINATE_THICKNESS

  const arrayPeakWatts = arrayArea * MODULE_WATTS_PER_SQUARE_METRE

  // Hydrogen for the first fill, at the density the cells are actually filled
  // to. The ship is inflated on the ground at the design fill fraction, so this
  // is sea-level density times the sea-level gas volume, not the full volume.
  const seaLevel = atmosphere(m(0))
  const liftGasDensity = gasDensity(
    pure(design.gas.species),
    Pa(seaLevel.pressure),
    K(seaLevel.temperature),
  )
  const fillVolume = mass.gasVolume * design.gas.seaLevelFillFraction
  const liftGasMass = fillVolume * liftGasDensity

  const priceOf = (q: Provenanced<number>): readonly [number, number, number] => [
    v(q),
    ...bounds(q),
  ]

  const line = (
    id: string,
    name: string,
    quantity: number,
    unit: string,
    price: readonly [number, number, number],
    unitPriceUnit: string,
    note: string,
  ): BomLine => ({
    id,
    name,
    quantity,
    unit,
    unitPrice: price[0],
    unitPriceUnit,
    cost: quantity * price[0],
    costRange: [quantity * price[1], quantity * price[2]],
    note,
  })

  const lines: BomLine[] = [
    line(
      'gas-cells',
      'Gas cell barrier laminate',
      filmArea * (1 + CELL_WASTE_FRACTION),
      'm2',
      priceOf(MATERIAL_PRICES.gasCellLaminate),
      'USD/m2',
      'THE LARGEST LINE, AND THE ONE WITH NO PUBLISHED PRICE. Priced off a Dyneema composite sailcloth matched on areal mass, which is a proxy for manufacturing difficulty and not for function. The low and high span a factor of six because that is the honest state of knowledge.',
    ),
    line(
      'carbon-fabric',
      'Carbon fabric for the frame',
      fibreMass * (1 + FABRIC_WASTE_FRACTION),
      'kg',
      priceOf(MATERIAL_PRICES.carbonFabricRetail),
      'USD/kg',
      `Retail. The same fibre as commodity tow is $${v(MATERIAL_PRICES.carbonTowCommodity).toFixed(0)}/kg, a factor of ${(v(MATERIAL_PRICES.carbonFabricRetail) / v(MATERIAL_PRICES.carbonTowCommodity)).toFixed(1)} below, and no individual is offered it. Substituting bought pultruded tube replaces this line, the epoxy line and the consumables line at once.`,
    ),
    line(
      'photovoltaics',
      'Flexible photovoltaic modules',
      arrayPeakWatts,
      'W',
      priceOf(MATERIAL_PRICES.photovoltaic),
      'USD/W',
      `${arrayArea.toFixed(0)} m2 at ${MODULE_WATTS_PER_SQUARE_METRE} W/m2. Cutting the array coverage to what the mission needs took this line down with it, which is the one place in the bill where a physics correction saved money.`,
    ),
    line(
      'cover',
      'Outer cover fabric',
      geometry.wettedArea * (1 + COVER_WASTE_FRACTION),
      'm2',
      priceOf(MATERIAL_PRICES.coverFabric),
      'USD/m2',
      'The only published airship-specific fabric price found anywhere, and it comes from a builder rather than a mill. Also the rain catchment surface, so it is the cheapest square metre on the vehicle in terms of what it returns.',
    ),
    line(
      'epoxy',
      'Laminating epoxy',
      resinMass * (1 + RESIN_WASTE_FRACTION),
      'kg',
      priceOf(MATERIAL_PRICES.epoxy),
      'USD/kg',
      'US retail and EU hobby pricing on the identical resin system differ by more than two to one, and neither is a quotation for three tonnes.',
    ),
    line(
      'fuel-cell',
      'Fuel cell stack and balance of plant',
      design.power.fuelCellRating / WATTS_PER_KW,
      'kW',
      priceOf(MATERIAL_PRICES.fuelCell),
      'USD/kW',
      'Retail small-stack pricing. Automotive stacks at volume are two orders of magnitude cheaper per kilowatt and are not sold to individuals.',
    ),
    line(
      'electrolyzer',
      'PEM electrolyzer',
      design.power.electrolyzerRating / WATTS_PER_KW,
      'kW',
      [
        v(MATERIAL_PRICES.electrolyzer) * SMALL_SCALE_PREMIUM,
        bounds(MATERIAL_PRICES.electrolyzer)[0] * SMALL_SCALE_PREMIUM,
        bounds(MATERIAL_PRICES.electrolyzer)[1] * SMALL_SCALE_PREMIUM,
      ],
      'USD/kW',
      `IEA installed capex with a ${((SMALL_SCALE_PREMIUM - 1) * 100).toFixed(0)} percent small-scale premium added explicitly rather than folded in.`,
    ),
    line(
      'battery',
      'Lithium iron phosphate storage',
      design.power.batteryEnergy / JOULES_PER_KWH,
      'kWh',
      priceOf(MATERIAL_PRICES.battery),
      'USD/kWh',
      'Retail. The global average pack price is less than half this and it is a price no individual is offered.',
    ),
    line(
      'consumables',
      'Vacuum bagging consumables',
      laminateArea * (1 + FABRIC_WASTE_FRACTION),
      'm2',
      priceOf(MATERIAL_PRICES.baggingConsumables),
      'USD/m2',
      'Single use. Every square metre bagged is film, peel ply and breather thrown away, and this line disappears entirely if the frame members are bought rather than laid up.',
    ),
    line(
      'hydrogen',
      'Hydrogen, first fill',
      liftGasMass,
      'kg',
      priceOf(MATERIAL_PRICES.hydrogenDelivered),
      'USD/kg',
      `${liftGasMass.toFixed(0)} kg fills ${fillVolume.toFixed(0)} m3 at the sea level fill fraction. Helium in the same volume would cost ${((fillVolume * v(MATERIAL_PRICES.heliumPerCubicMetre)) / (liftGasMass * v(MATERIAL_PRICES.hydrogenDelivered))).toFixed(0)} times as much for 8 percent less lift, which is the cost half of an argument the safety chapter makes on other grounds entirely.`,
    ),
    line(
      'fins',
      'Fin structure and control surfaces',
      finPlanform(design, config).mass * fibreMassFraction * (1 + FABRIC_WASTE_FRACTION),
      'kg',
      priceOf(MATERIAL_PRICES.carbonFabricRetail),
      'USD/kg',
      'Fibre only, at the same retail price as the frame. The fins are large because the Munk moment is destabilising at every angle of attack.',
    ),
  ]

  lines.sort((a, b) => b.cost - a.cost)

  const namedSubtotal = lines.reduce((s, l) => s + l.cost, 0)
  const unnamedAllowance = namedSubtotal * UNNAMED_ALLOWANCE_FRACTION
  const total = namedSubtotal + unnamedAllowance
  const rangeLow =
    lines.reduce((s, l) => s + l.costRange[0], 0) * (1 + UNNAMED_ALLOWANCE_FRACTION)
  const rangeHigh =
    lines.reduce((s, l) => s + l.costRange[1], 0) * (1 + UNNAMED_ALLOWANCE_FRACTION)

  const topThree = lines.slice(0, 3)

  return {
    lines,
    namedSubtotal,
    unnamedAllowance,
    total,
    totalRange: [rangeLow, rangeHigh],
    perKilogram: total / mass.total,
    concentration: {
      lines: topThree.map((l) => l.name),
      share: topThree.reduce((s, l) => s + l.cost, 0) / namedSubtotal,
    },
  }
}

// --------------------------------------------------------------------------
// Labour
// --------------------------------------------------------------------------

export interface LabourTask {
  readonly id: string
  readonly name: string
  readonly hours: number
  readonly hoursRange: readonly [number, number]
  readonly basis: string
}

export interface LabourEstimate {
  readonly tasks: readonly LabourTask[]
  readonly total: number
  readonly totalRange: readonly [number, number]
  /** Calendar years for two people working full time. */
  readonly yearsForTwo: number
  readonly yearsRange: readonly [number, number]
  /** The same, checked against hours per kilogram of empty weight. */
  readonly crossCheckHours: number
  readonly crossCheckAgrees: boolean
  readonly findings: readonly string[]
}

/**
 * @derived Girder run: the longitudinals over the hull length plus the rings at
 * their mean circumference. Frame count from the panel aspect ratio the sound
 * fleet sat at.
 */
const LATTICE_PITCH = 0.25

/** @derived Roughly two web members per bay of a triangular-section girder, each with two ends. */
const JOINTS_PER_LATTICE_BAY = 4

/** @source Minutes to fit, jig, bond and inspect one lattice joint, once practised. */
const MINUTES_PER_JOINT = 6

/** @derived How much faster the last thousand joints go than the estimate. */
const PRACTISED_RATE = 0.6

/** @derived How much slower the first thousand go, and every awkward one after. */
const UNPRACTISED_RATE = 2

/**
 * @source Seam length per square metre of gas cell film: one over the roll
 * width, plus the bulkhead face perimeters. At a 1.37 m converting width that
 * is 0.84 m of seam for every square metre of cell.
 */
const SEAM_PER_FILM_AREA = 0.84

/** @derived Metres in a kilometre. */
const METRES_PER_KM = 1000

export const labourEstimate = (design: DesignPoint, config: Configuration): LabourEstimate => {
  const mass = massStatement(design, config)
  const { length, finenessRatio, prismaticCoefficient, cellCount } = design.hull
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const geometry = hullGeometry(m(length), finenessRatio, shape)

  const frameMass = mass.items.find((i) => i.id === 'frame')?.mass ?? 0
  const filmArea = cellFilmArea(geometry.wettedArea, mass.gasVolume, length, cellCount)
  const laminateArea = frameMass / WET_LAYUP_DENSITY / MEAN_LAMINATE_THICKNESS
  const plyArea = laminateArea * (MEAN_LAMINATE_THICKNESS / CURED_PLY_THICKNESS)

  const laminateRate = v(BUILD_LABOUR.laminateRate)
  const fabricRate = v(BUILD_LABOUR.fabricRate)
  const perKg = v(BUILD_LABOUR.hoursPerKilogram)

  // Girder run and joint count, which together decide whether the frame is
  // buildable by hand at all.
  //
  // THE SCHEDULE COMES FROM THE STRUCTURE MODULE rather than from a rule of
  // thumb here. Ring count follows from the panel aspect ratio the sound fleet
  // sat inside, and reproducing that rule in this file would let the labour
  // estimate describe a frame the structure chapter never sized.
  const girder = hullBendingMoment(design, config)
  const maxRadius = length / finenessRatio / 2
  const schedule = frameSchedule(
    girder.designMoment as never,
    m(maxRadius),
    m(length),
    mass.gasVolume,
    LONGITUDINAL_COUNT,
    m(REFERENCE_RING_SPACING),
    laminate(),
  )
  /** @derived Mean radius of a ring, as a fraction of the maximum. A hull tapers. */
  const MEAN_RADIUS_FRACTION = 0.75
  const meanRingCircumference = 2 * Math.PI * maxRadius * MEAN_RADIUS_FRACTION
  const girderRun = LONGITUDINAL_COUNT * length + schedule.ringCount * meanRingCircumference
  const joints = (girderRun / LATTICE_PITCH) * JOINTS_PER_LATTICE_BAY

  const task = (
    id: string,
    name: string,
    hours: number,
    low: number,
    high: number,
    basis: string,
  ): LabourTask => ({ id, name, hours, hoursRange: [low, high], basis })

  const tasks: LabourTask[] = [
    task(
      'frame-laminate',
      'Laminate the frame members',
      plyArea / laminateRate,
      plyArea / bounds(BUILD_LABOUR.laminateRate)[1],
      plyArea / bounds(BUILD_LABOUR.laminateRate)[0],
      `${plyArea.toFixed(0)} m2 of PLY placement, which is ${(MEAN_LAMINATE_THICKNESS / CURED_PLY_THICKNESS).toFixed(0)} plies over ${laminateArea.toFixed(0)} m2 of part. Estimating this on part area rather than ply area understates it by that factor, which is the commonest way a composite build schedule goes wrong. THIS LINE DISAPPEARS IF THE MEMBERS ARE BOUGHT.`,
    ),
    task(
      'frame-assemble',
      'Assemble and joint the frame',
      (joints * MINUTES_PER_JOINT) / MINUTES_PER_HOUR,
      (joints * MINUTES_PER_JOINT * PRACTISED_RATE) / MINUTES_PER_HOUR,
      (joints * MINUTES_PER_JOINT * UNPRACTISED_RATE) / MINUTES_PER_HOUR,
      `${(joints / METRES_PER_KM).toFixed(0)} thousand lattice joints over ${girderRun.toFixed(0)} m of girder run: ${LONGITUDINAL_COUNT} longitudinals and ${schedule.ringCount} frames, at a ${LATTICE_PITCH * METRES_PER_KM} mm lattice pitch. At six minutes each this is the single largest task in the build and it does not go away by buying anything.`,
    ),
    task(
      'gas-cells',
      'Pattern, weld and test the gas cells',
      filmArea * fabricRate,
      filmArea * bounds(BUILD_LABOUR.fabricRate)[0],
      filmArea * bounds(BUILD_LABOUR.fabricRate)[1],
      `${filmArea.toFixed(0)} m2 of film across ${cellCount} cells, plus about ${((filmArea * SEAM_PER_FILM_AREA) / METRES_PER_KM).toFixed(1)} km of seam that must each hold to a defect spacing of one 300 micron hole per 99 m to make the purity budget.`,
    ),
    task(
      'cover',
      'Pattern, seam and lace the outer cover',
      geometry.wettedArea * fabricRate,
      geometry.wettedArea * bounds(BUILD_LABOUR.fabricRate)[0],
      geometry.wettedArea * bounds(BUILD_LABOUR.fabricRate)[1],
      `${geometry.wettedArea.toFixed(0)} m2, done at height on staging over the whole hull.`,
    ),
    task(
      'systems',
      'Systems, fitout and rigging',
      (mass.emptyWeight - frameMass) * perKg * 0.5,
      (mass.emptyWeight - frameMass) * bounds(BUILD_LABOUR.hoursPerKilogram)[0] * 0.5,
      (mass.emptyWeight - frameMass) * bounds(BUILD_LABOUR.hoursPerKilogram)[1] * 0.5,
      'Everything that is not hull: gondola, keel, machinery, wiring, plumbing, controls and the accommodation. At half the structural rate per kilogram because much of it is bought as assemblies.',
    ),
  ]

  const total = tasks.reduce((s, t) => s + t.hours, 0)
  const low = tasks.reduce((s, t) => s + t.hoursRange[0], 0)
  const high = tasks.reduce((s, t) => s + t.hoursRange[1], 0)

  const perPerson = v(BUILD_LABOUR.hoursPerPersonYear)
  /** @source Two people, which is the crew this vehicle is designed around. */
  const CREW = 2

  const crossCheckHours = mass.emptyWeight * perKg
  /** @source Two independent estimates within a factor of two agree at this level of definition. */
  const AGREEMENT_FACTOR = 2
  const ratio = total / crossCheckHours
  const crossCheckAgrees = ratio > 1 / AGREEMENT_FACTOR && ratio < AGREEMENT_FACTOR

  const findings: string[] = []
  findings.push(
    crossCheckAgrees
      ? `Task by task the build is ${(total / 1000).toFixed(0)} thousand hours; at ${perKg} hours per kilogram of the ${mass.emptyWeight.toFixed(0)} kg empty weight it is ${(crossCheckHours / 1000).toFixed(0)} thousand. A ratio of ${ratio.toFixed(2)}, which is agreement for an estimate of this kind.`
      : `Task by task the build is ${(total / 1000).toFixed(0)} thousand hours and the per-kilogram cross check says ${(crossCheckHours / 1000).toFixed(0)} thousand, a ratio of ${ratio.toFixed(2)}. THE TWO ESTIMATES DISAGREE, so one of them is missing a task or double counting one.`,
  )
  findings.push(
    `${(total / (perPerson * CREW)).toFixed(1)} years for two people working ${perPerson} hours each every year, which nobody building in their own time achieves. At evenings and weekends it is ${(total / (perPerson * 0.5 * CREW)).toFixed(0)} years.`,
  )
  findings.push(
    `Pathfinder 1 is ${(v(BUILD_PRECEDENT.pathfinder1Length) / design.hull.length).toFixed(2)} times this hull's length, was built by a professionally staffed company in an existing hangar with unlimited funding, and took ${v(BUILD_PRECEDENT.pathfinder1Years)} years from start to first untethered flight. That is the calibration for any schedule this model produces.`,
  )

  return {
    tasks: [...tasks].sort((a, b) => b.hours - a.hours),
    total,
    totalRange: [low, high],
    yearsForTwo: total / (perPerson * CREW),
    yearsRange: [low / (perPerson * CREW), high / (perPerson * CREW)],
    crossCheckHours,
    crossCheckAgrees,
    findings,
  }
}

// --------------------------------------------------------------------------
// The building
// --------------------------------------------------------------------------

export interface FacilityRequirement {
  /** Clear internal dimensions, m. */
  readonly clearLength: number
  readonly clearWidth: number
  readonly clearHeight: number
  readonly floorArea: number
  /** Overall vehicle height including fins, m, which sets the clear height. */
  readonly vehicleHeight: number
  /** Rigid steel hangar, escalated to now. */
  readonly rigidHangarCost: number
  /** Hangar plus mast, tractor, mules, ballast and mooring circle. */
  readonly completeBaseCost: number
  /** Air-supported fabric shed plus its foundation pad. */
  readonly airSupportedCost: number
  /** Design lateral wind load on the long wall, N. */
  readonly lateralWindLoad: number
  /** Cleared and levelled ground for the mooring circle, hectares. */
  readonly mooringCircleArea: number
  readonly findings: readonly string[]
}

export const facilityRequirement = (
  design: DesignPoint,
  config: Configuration,
  bom?: BillOfMaterials,
): FacilityRequirement => {
  const { length, finenessRatio, prismaticCoefficient } = design.hull
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const geometry = hullGeometry(m(length), finenessRatio, shape)
  const diameter = geometry.maxDiameter.valueOf()
  const fins = finPlanform(design, config)

  // The tallest thing about the vehicle is the fin tip, and the fins are set
  // well aft where the hull has narrowed, so the tip stands proud of the crown.
  // Sizing the shed on hull diameter would put the doorway 4 m too low.
  const finRootRadius = hullRadiusAt(m(length), finenessRatio, config.finStation, shape)
  const vehicleHeight = 2 * (finRootRadius + fins.span)

  const clearLength = length * v(FACILITY.lengthMargin)
  const clearWidth = diameter * v(FACILITY.widthMargin)
  const clearHeight = Math.max(vehicleHeight, diameter) * v(FACILITY.heightMargin)


  const escalation = v(FACILITY.escalation1981)
  const rigidHangarCost = v(FACILITY.rigidHangarCost1981) * escalation
  const completeBaseCost = v(FACILITY.completeBaseCost1981) * escalation
  const airSupportedCost = v(FACILITY.airSupportedCost1981) * escalation

  const lateralWindLoad = v(FACILITY.lateralWindPressure) * clearLength * clearHeight
  /** @derived Hectares per square metre. */
  const HECTARE = 1e4
  const mooringCircleArea = (Math.PI * v(GROUND_HANDLING.mooringCircleRadius) ** 2) / HECTARE

  const findings: string[] = []
  findings.push(
    `${clearLength.toFixed(0)} by ${clearWidth.toFixed(0)} by ${clearHeight.toFixed(0)} m clear internal, which is ${(clearLength * clearWidth).toFixed(0)} m2 of floor. The height is set by the fin tip at ${vehicleHeight.toFixed(0)} m overall and not by the ${diameter.toFixed(0)} m hull, which is a ${(vehicleHeight - diameter).toFixed(0)} m difference and the sort of thing that gets discovered on the day the doors will not clear.`,
  )
  findings.push(
    `The long wall carries ${(lateralWindLoad / MEGA).toFixed(1)} MN at the 1926 Air Ministry design wind. That load, not the span, is why airship sheds cost like cathedrals.`,
  )
  if (bom) {
    findings.push(
      `The building alone is ${(rigidHangarCost / bom.total).toFixed(1)} times the entire bill of materials, and the complete base is ${(completeBaseCost / bom.total).toFixed(1)} times. THE AIRSHIP IS THE CHEAP PART.`,
    )
  }
  findings.push(
    `An air-supported fabric shed is ${(rigidHangarCost / airSupportedCost).toFixed(1)} times cheaper and depends on a blower running continuously for the length of the build, which makes the building itself a single point of failure over a decade.`,
  )
  findings.push(
    `Outside it, ${mooringCircleArea.toFixed(0)} hectares of cleared and levelled ground for the mooring circle, because the ship weathervanes around the mast and the whole circle must be clear.`,
  )

  return {
    clearLength,
    clearWidth,
    clearHeight,
    floorArea: clearLength * clearWidth,
    vehicleHeight,
    rigidHangarCost,
    completeBaseCost,
    airSupportedCost,
    lateralWindLoad,
    mooringCircleArea,
    findings,
  }
}

// --------------------------------------------------------------------------
// Handling it
// --------------------------------------------------------------------------

export interface HandlingLimits {
  /** Side-projected area of hull plus vertical fins, m2. */
  readonly sideArea: number
  /** Wind above which two people cannot hold it broadside, m/s. */
  readonly twoPersonBroadsideLimit: number
  /** The same, bow on, where the hull is a streamlined body rather than a wall. */
  readonly twoPersonBowOnLimit: number
  /** People needed to hold it broadside at the Navy docking limit. */
  readonly unmechanisedCrew: number
  /** Steady axial drag on the mast at the ride-out wind, N. */
  readonly mastDragLoad: number
  /** What airship practice actually designs the mast to, N. */
  readonly mastDesignLoad: number
  readonly findings: readonly string[]
}

/** @derived Bare hull drag coefficient on volume to the two thirds, NACA TR-432, low speed. */
const BARE_HULL_DRAG_ON_VOLUME = 0.0235

export const handlingLimits = (design: DesignPoint, config: Configuration): HandlingLimits => {
  const { length, finenessRatio, prismaticCoefficient } = design.hull
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const geometry = hullGeometry(m(length), finenessRatio, shape)
  const fins = finPlanform(design, config)

  const seaLevel = atmosphere(m(0))
  const airDensity = seaLevel.density

  // Side-projected area: numerically integrate the hull profile, plus the two
  // vertical fins. The horizontal fins do not project on the side.
  /** @derived Steps along the hull for the profile integration. */
  const STEPS = 400
  let profileArea = 0
  for (let i = 0; i < STEPS; i += 1) {
    const s = (i + 0.5) / STEPS
    const r = hullRadiusAt(m(length), finenessRatio, s, shape)
    profileArea += 2 * r * (length / STEPS)
  }
  /** @derived Half the fin planform is the vertical pair on a cruciform tail. */
  const sideArea = profileArea + fins.area / 2

  const pull = v(GROUND_HANDLING.personLinePull)
  const cd = v(GROUND_HANDLING.broadsideDragCoefficient)
  /** @source Two people, which is the crew this vehicle is designed around. */
  const CREW = 2

  const broadsideCoefficient = 0.5 * airDensity * cd * sideArea
  const twoPersonBroadsideLimit = Math.sqrt((CREW * pull) / broadsideCoefficient)

  const volumeToTwoThirds = geometry.volume ** (2 / 3)
  const bowOnCoefficient = 0.5 * airDensity * BARE_HULL_DRAG_ON_VOLUME * volumeToTwoThirds
  const twoPersonBowOnLimit = Math.sqrt((CREW * pull) / bowOnCoefficient)

  const dockingLimit = v(GROUND_HANDLING.navyDockingLimit)
  const unmechanisedCrew = Math.ceil((broadsideCoefficient * dockingLimit ** 2) / pull)

  const mastWind = v(GROUND_HANDLING.navyMastDoggedLimit)
  const mastDragLoad = bowOnCoefficient * mastWind ** 2

  // The steady drag is not the mast load. A moored airship hunts: it yaws off
  // the wind, sails back across it, and arrives at the end of each swing with
  // the whole added mass of the displaced air behind it. The 1926 Air Ministry
  // standard was 30 long tons in ANY direction for an R101-class mast, and
  // scaling that on volume to the two thirds gives a figure several times the
  // steady drag. Design a mast to the drag and it fails on the first squall.
  /** @source 1926 Air Ministry mooring mast standard: 30 long tons, any direction. */
  const AIR_MINISTRY_MAST_LOAD = 299e3
  /** @source R101 gas volume, m3, the ship that standard was written for. */
  const R101_VOLUME = 140000
  const mastDesignLoad =
    AIR_MINISTRY_MAST_LOAD * (geometry.volume / R101_VOLUME) ** (2 / 3)

  const findings: string[] = []
  findings.push(
    `TWO PEOPLE CAN HOLD THIS SHIP BROADSIDE IN ${twoPersonBroadsideLimit.toFixed(2)} m/s OF WIND, which is ${(twoPersonBroadsideLimit * KNOTS_PER_MS).toFixed(1)} knots and is not a wind, it is a draught. The ${sideArea.toFixed(0)} m2 of side area is the whole problem.`,
  )
  findings.push(
    `Bow on it is ${twoPersonBowOnLimit.toFixed(1)} m/s, a factor of ${(twoPersonBowOnLimit / twoPersonBroadsideLimit).toFixed(0)} better, which is the entire argument for single-point mooring: the ship must be free to weathervane at all times and must never be held across the wind.`,
  )
  findings.push(
    `At the ${dockingLimit} m/s the US Navy would still dock in, holding it broadside by hand needs ${unmechanisedCrew} people. The Navy did it with ${v(GROUND_HANDLING.zpg3wLandingCrew)} because they had a mobile mast and two mechanical mules; before that machinery existed, LZ-8 took ${v(GROUND_HANDLING.lz8GroundCrew)} and was destroyed against the shed doors anyway.`,
  )
  findings.push(
    `Dogged on to a mast the same ship rides out ${mastWind.toFixed(0)} m/s. THE SHIP IS SAFE IN A GALE AND HELPLESS IN A BREEZE, and every ground operation must be designed around that inversion.`,
  )
  findings.push(
    `Steady axial drag at that wind is only ${(mastDragLoad / NEWTONS_PER_KN).toFixed(0)} kN, and the mast must be designed to ${(mastDesignLoad / NEWTONS_PER_KN).toFixed(0)} kN in any direction, a factor of ${(mastDesignLoad / mastDragLoad).toFixed(1)}. A moored airship hunts: it yaws off the wind, sails back across it, and arrives at the end of each swing with the added mass of the displaced air behind it. Design the mast to the drag figure and it fails in the first squall.`,
  )

  return {
    sideArea,
    twoPersonBroadsideLimit,
    twoPersonBowOnLimit,
    unmechanisedCrew,
    mastDragLoad,
    mastDesignLoad,
    findings,
  }
}

// --------------------------------------------------------------------------
// The answer
// --------------------------------------------------------------------------

export interface BuildVerdict {
  readonly bom: BillOfMaterials
  readonly labour: LabourEstimate
  readonly facility: FacilityRequirement
  readonly handling: HandlingLimits
  /** Materials plus the building, which is the number that matters. */
  readonly capitalRequired: number
  readonly buildable: boolean
  readonly blockers: readonly string[]
  readonly mitigations: readonly string[]
  readonly verdict: string
}

/**
 * @source The most a project funded by one or two people can plausibly raise,
 * as a working threshold. A house.
 */
const INDIVIDUAL_CAPITAL_CEILING = 1e6

/** @source Years beyond which a two-person project is a life rather than a build. */
const INDIVIDUAL_SCHEDULE_CEILING = 10

export const buildVerdict = (design: DesignPoint, config: Configuration): BuildVerdict => {
  const bom = billOfMaterials(design, config)
  const labour = labourEstimate(design, config)
  const facility = facilityRequirement(design, config, bom)
  const handling = handlingLimits(design, config)

  const capitalRequired = bom.total + facility.rigidHangarCost

  const blockers: string[] = []
  if (capitalRequired > INDIVIDUAL_CAPITAL_CEILING) {
    blockers.push(
      `CAPITAL. $${(bom.total / MEGA).toFixed(1)}M of materials and $${(facility.rigidHangarCost / MEGA).toFixed(1)}M for the building is $${(capitalRequired / MEGA).toFixed(1)}M before any labour is paid for, against about $${(INDIVIDUAL_CAPITAL_CEILING / MEGA).toFixed(0)}M an individual can plausibly raise. The building is the larger half.`,
    )
  }
  if (labour.yearsForTwo > INDIVIDUAL_SCHEDULE_CEILING) {
    blockers.push(
      `SCHEDULE. ${(labour.total / 1000).toFixed(0)} thousand hours is ${labour.yearsForTwo.toFixed(0)} years for two people full time, and full time is not what two people building in their own lives do. At the ceiling of ${INDIVIDUAL_SCHEDULE_CEILING} years this needs ${Math.ceil(labour.total / (v(BUILD_LABOUR.hoursPerPersonYear) * INDIVIDUAL_SCHEDULE_CEILING))} people, which is no longer a two-person project.`,
    )
  }
  blockers.push(
    `THE BUILDING. ${facility.clearLength.toFixed(0)} by ${facility.clearWidth.toFixed(0)} by ${facility.clearHeight.toFixed(0)} m clear, and you cannot rent one. The airship sheds that remain are museums, film studios or in use, and the last purpose-built one cost EUR 78M. This, not the physics, is what has stopped every individual since 1930.`,
  )
  blockers.push(
    `GROUND HANDLING. Two people hold it broadside in ${handling.twoPersonBroadsideLimit.toFixed(2)} m/s. Even finished and flying, the vehicle needs either a crew of ${handling.unmechanisedCrew} or a mast, a mule and ${facility.mooringCircleArea.toFixed(0)} hectares every single time it touches the ground.`,
  )

  const mitigations: string[] = []
  const tube = v(MATERIAL_PRICES.pultrudedTube)
  const fabric = v(MATERIAL_PRICES.carbonFabricRetail)
  const laminateTask = labour.tasks.find((t) => t.id === 'frame-laminate')
  mitigations.push(
    `BUY THE MEMBERS, DO NOT LAY THEM UP. Pultruded tube is $${tube.toFixed(0)}/kg against $${fabric.toFixed(0)}/kg for retail fabric you then have to laminate, and it arrives at ${(v(MATERIAL_PRICES.pultrudedTubeModulus) / GIGA).toFixed(0)} GPa rather than the ${(WET_LAYUP_MODULUS / GIGA).toFixed(0)} GPa a hand wet layup reaches. It removes ${((laminateTask?.hours ?? 0) / 1000).toFixed(0)} thousand hours of laminating, the whole bagging consumables line, and the oven. It is the only change in this module that improves cost, schedule and structure at once.`,
  )
  mitigations.push(
    `MOOR IT ON WATER. A ship that never comes ashore never needs the mooring circle, the mules or the ground crew, and it weathervanes off a bow drogue by itself. The water landing requirement is not a feature bolted on to this design, it is what replaces $${((facility.completeBaseCost - facility.rigidHangarCost) / MEGA).toFixed(1)}M of ground equipment.`,
  )
  mitigations.push(
    `ASSEMBLE OUTDOORS AND INFLATE ONCE. The shed exists because a bare frame will not survive weather and a finished hull cannot be held in a breeze. A build sequenced so that the hull is never both complete and uninflated, in a place with a reliable calm season, is the only route that does not need the building. It is a serious plan with a serious weather risk, and it is the one worth studying.`,
  )
  mitigations.push(
    `BUILD IT SMALLER. Everything here scales: the shed with the cube, the labour with the surface, the handling crew with the side area. The endurance figure is what a smaller ship gives up, and the trade is in the design explorer rather than asserted here.`,
  )

  const buildable = blockers.length === 0

  const verdict = buildable
    ? 'Buildable by two people as drawn.'
    : `NOT BUILDABLE BY ONE OR TWO PEOPLE AS DRAWN. The physics closes: ${(bom.total / MEGA).toFixed(1)} million dollars of materials makes a vehicle that flies for a year and floats. The build does not close, and it fails on the building rather than on the airship. A ${facility.clearLength.toFixed(0)} m shed costs ${(facility.rigidHangarCost / bom.total).toFixed(1)} times what goes inside it, cannot be rented, and is required because a rigid airship cannot be assembled in weather. That is a well-supported no, and it points at exactly two things worth studying: a build sequence that never leaves a bare hull outdoors, and a vehicle small enough to fit a building that already exists.`

  return {
    bom,
    labour,
    facility,
    handling,
    capitalRequired,
    buildable,
    blockers,
    mitigations,
    verdict,
  }
}
