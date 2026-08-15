import {
  HISTORICAL_SHIPS,
  STRUCTURAL_FLEET,
  STRUCTURAL_SCALING,
  SEA_STATE,
  barrierFilm,
  allUncertain,
  v,
  SOURCES,
} from '@airship/data'
import {
  atmosphere,
  grossLift,
  specificLift,
  pure,
  hullGeometry,
  hullShapeForPrismatic,
  hullRadiusAt,
  massFractionAt,
  benchmark,
  rankedByLiftCost,
  crossSectionDistribution,
  buoyancyDistribution,
  solveBeam,
  powerRequired,
  hullSpeed,
  porpoisingSpeed,
  seakeeping,
  maximumSeaState,
  cushionPressureFor,
  windwardSpeed,
  waterTouchdown,
  STANDARD_GAS_TEMPERATURE,
} from '@airship/core'
import {
  DESIGN_POINTS,
  BASELINE,
  BASELINE_ARRANGEMENT,
  massStatement,
  validateArrangement,
  finPlanform,
  smallestClosingLength,
  hullBendingMoment,
  ARCHITECTURES,
  compareArchitecture,
} from '@airship/model'
import { energyBalance, integrateMission, maximumSustainableWind } from '@airship/solvers'
import { m, m3, kg, N, purity as asPurity } from '@airship/units'

/**
 * The site reads the model. It does not restate it.
 *
 * Everything on airship.diy is computed here, at build time, by calling the
 * same functions the tests call and the report tool calls. There is no number
 * typed into a page. If a figure on the site is wrong, the model is wrong, and
 * the validation gates will have failed before the site ever built.
 *
 * This is the mechanism behind the project's central rule: if a number appears
 * in prose and also in the solver, that is a bug.
 */

const seaLevel = atmosphere(m(0))

export const referenceLift = {
  hydrogen: specificLift(pure('hydrogen'), seaLevel, STANDARD_GAS_TEMPERATURE),
  helium: specificLift(pure('helium'), seaLevel, STANDARD_GAS_TEMPERATURE),
}

export const hydrogenAdvantage = referenceLift.hydrogen / referenceLift.helium - 1

export interface ValidationRow {
  readonly name: string
  readonly year: number
  readonly gas: string
  readonly volume: number
  readonly modelled: number | null
  readonly published: number | null
  readonly error: number | null
  readonly tolerance: number
  readonly passes: boolean | null
  readonly validates: string
  readonly discrepancy: string | null
}

export const validation: readonly ValidationRow[] = HISTORICAL_SHIPS.map((ship) => {
  const modelled = grossLift(
    m3(ship.gasVolume),
    { species: ship.liftingGas, purity: asPurity(ship.purity) },
    seaLevel,
    STANDARD_GAS_TEMPERATURE,
  )
  const published = ship.publishedGrossLift ?? null
  const error = published === null ? null : modelled / published - 1

  return {
    name: ship.name,
    year: ship.year,
    gas: ship.liftingGas,
    volume: ship.gasVolume,
    modelled,
    published,
    error,
    tolerance: ship.grossLiftTolerance,
    passes: error === null ? null : Math.abs(error) < ship.grossLiftTolerance,
    validates: ship.validates,
    discrepancy: ship.discrepancy ?? null,
  }
})

/**
 * The purity demonstration. Modelled with pure helium, USS Macon fails its own
 * validation gate by more than twice the tolerance. This is the evidence that
 * purity is a first-order state variable rather than a refinement.
 */
const macon = HISTORICAL_SHIPS.find((s) => s.id === 'zrs5-macon')

export const purityDemonstration = macon?.publishedGrossLift
  ? {
      published: macon.publishedGrossLift,
      atServicePurity: grossLift(
        m3(macon.gasVolume),
        { species: 'helium', purity: asPurity(macon.purity) },
        seaLevel,
        STANDARD_GAS_TEMPERATURE,
      ),
      asPure: grossLift(m3(macon.gasVolume), pure('helium'), seaLevel, STANDARD_GAS_TEMPERATURE),
      duraluminMassFraction: (macon.publishedDeadweight ?? 0) / macon.publishedGrossLift,
    }
  : null

export const designs = DESIGN_POINTS.map((design) => {
  const result = energyBalance(design)
  return {
    id: design.id,
    name: design.name,
    description: design.description,
    length: design.hull.length,
    finenessRatio: design.hull.finenessRatio,
    cellCount: design.hull.cellCount,
    wind: design.mission.stationKeepingWind,
    dutyCycle: design.mission.stationKeepingDutyCycle,
    latitude: (design.mission.latitude * 180) / Math.PI,
    altitude: design.mission.altitude,
    clearSkyFraction: design.mission.clearSkyFraction,
    result,
    maximumWind: maximumSustainableWind(design),
  }
})

export const baseline = designs.find((d) => d.id === 'baseline')

/** The hull the renderer draws, from the same shape function the model sizes with. */
export const hullProfile = (() => {
  const shape = hullShapeForPrismatic(BASELINE.hull.prismaticCoefficient)
  const geometry = hullGeometry(m(BASELINE.hull.length), BASELINE.hull.finenessRatio, shape)
  const stations = 96

  return {
    length: geometry.length,
    maxDiameter: geometry.maxDiameter,
    volume: geometry.volume,
    wettedArea: geometry.wettedArea,
    prismaticCoefficient: geometry.prismaticCoefficient,
    wettedAreaCoefficient: geometry.wettedAreaCoefficient,
    maxDiameterStation: geometry.maxDiameterStation,
    radii: Array.from({ length: stations + 1 }, (_, i) => {
      const station = i / stations
      return hullRadiusAt(m(BASELINE.hull.length), BASELINE.hull.finenessRatio, station, shape)
    }),
  }
})()

/**
 * The research queue: every value the model does not actually know.
 *
 * Sorted by relative range width, which is a proxy for endurance sensitivity
 * and is labelled as one. The real sensitivity ranking needs the phase 5
 * mission integrator.
 */
export const uncertainties = allUncertain()
  .map(({ path, value }) => ({
    path,
    low: value.low,
    nominal: value.nominal,
    high: value.high,
    unit: value.unit,
    reason: value.reason,
    resolvedBy: value.resolvedBy,
    spread: (value.high - value.low) / Math.abs(value.nominal || 1),
  }))
  .sort((a, b) => b.spread - a.spread)

/**
 * THE PHASE 3 RESULT: empty weight fraction against hull size, across the range
 * of scaling exponents the historical record cannot distinguish between.
 *
 * Deliberately a family of curves. One curve would be a claim the evidence does
 * not support, and the two ends of the range disagree about whether bigger ships
 * are better or worse.
 */
export const massFractionExponents = [
  STRUCTURAL_SCALING.allShipsExponent,
  1.0,
  0.9,
  0.8,
  STRUCTURAL_SCALING.theoreticalAreaLaw,
] as const

export const massFractionVolumes = [5953, 15803, 37458, 80000, 200000] as const

export const massFractionTable = massFractionVolumes.map((volume) => ({
  volume,
  cells: massFractionExponents.map((exponent) => massFractionAt(volume as never, exponent)),
}))

export const structuralBenchmark = benchmark()

export const structuralScaling = STRUCTURAL_SCALING

/** The historical fleet, sorted by empty weight fraction. */
export const fleet = [...STRUCTURAL_FLEET].sort(
  (a, b) => a.emptyWeightFraction - b.emptyWeightFraction,
)

/** The fuel decision matrix, ranked by the metric that governs. */
export const fuelRanking = rankedByLiftCost().map(({ option, energyPerLift }) => ({
  id: option.id,
  name: option.name,
  specificEnergy: option.specificEnergy,
  liftCost: option.liftCostPerKilogram,
  energyPerLift,
  waterRecovery: option.waterRecoveryForNeutrality,
  note: option.note,
}))

/**
 * THE PHASE 5 RESULT: which resource runs out first.
 *
 * The physical limit is food, which is a loading decision. The overall limit is
 * a LEGAL interval. Water, which was expected to be the master ledger and a
 * binding constraint, is the master ledger and does not bind at all.
 */
export const mission = (() => {
  const stores = { food: BASELINE.loads.crew * 0.62 * 400, water: 3000, waterCapacity: 4000 }
  const result = integrateMission(BASELINE, stores, 2200)
  return {
    stores,
    physicalEnduranceDays: result.physicalEnduranceDays,
    physicalLimit: result.physicalLimit,
    enduranceDays: result.enduranceDays,
    limitingResource: result.limitingResource,
    explanation: result.explanation,
    water: result.waterBalance,
    exhaustion: Object.entries(result.resourceExhaustion)
      .map(([resource, day]) => ({ resource, day }))
      .sort((a, b) => a.day - b.day),
  }
})()

/**
 * Diagnostics computed at build time and handed to the chart components.
 *
 * The physics stays on this side of the boundary; the charts only draw. That
 * keeps the client bundle from shipping a solver it does not need, and it means
 * a chart cannot quietly disagree with the model by recomputing something
 * slightly differently.
 */
export const diagnostics = (() => {
  const design = BASELINE
  const shape = hullShapeForPrismatic(design.hull.prismaticCoefficient)
  const hull = hullGeometry(m(design.hull.length), design.hull.finenessRatio, shape)
  const air = atmosphere(m(design.mission.altitude))
  const energy = energyBalance(design)

  // --- power required against airspeed, the cube law ---------------------
  const powerCurve = Array.from({ length: 41 }, (_, i) => {
    const speed = (i / 40) * 20
    return { speed, power: speed === 0 ? 0 : powerRequired(hull, air, speed as never) }
  })

  // --- hours of station keeping per day, against wind --------------------
  // The brief calls this one of the most important operational numbers: above
  // some wind the ship cannot hold position at all and must drift.
  const dailyEnergy = energy.annualGenerated / 365.2425
  const otherLoads = (energy.habitatEnergy + energy.liftMakeupEnergy) / 365.2425
  const available = Math.max(dailyEnergy - otherLoads, 0)

  const holdingCurve = Array.from({ length: 41 }, (_, i) => {
    const wind = (i / 40) * 20
    const power = wind === 0 ? 0 : powerRequired(hull, air, wind as never)
    const hours = power <= 0 ? 24 : Math.min(available / power / 3600, 24)
    return { wind, hours }
  })

  const cutoffWind =
    holdingCurve.find((p) => p.hours < 24)?.wind ??
    holdingCurve[holdingCurve.length - 1]?.wind ??
    0

  // --- shear and bending moment along the hull ---------------------------
  // Buoyancy follows cross-sectional AREA; weight follows where the heavy
  // things are. The mismatch is what bends the ship.
  const stations = crossSectionDistribution(m(design.hull.length), design.hull.finenessRatio, 201, shape)
  const buoyancy = buoyancyDistribution(stations, 1.1397)

  const width = (i: number) => {
    const previous = stations[i - 1]
    const next = stations[i + 1]
    const here = stations[i]
    if (!here) return 0
    return (previous ? (here.x - previous.x) / 2 : 0) + (next ? (next.x - here.x) / 2 : 0)
  }

  // Cover and frame mass follows surface area, so weight per unit length goes
  // as radius rather than as area. That is the mismatch.
  const radii = stations.map((s) => Math.sqrt(s.area / Math.PI))
  const radiusIntegral = radii.reduce((a, r, i) => a + r * width(i), 0)
  const distributedWeightForce = energy.grossLiftAvailable * 9.80665 * 0.45

  const loads = stations.map((station, i) => ({
    x: station.x,
    buoyancy: buoyancy[i]?.buoyancy ?? 0,
    weight: ((radii[i] ?? 0) / radiusIntegral) * distributedWeightForce,
  }))

  const beam = solveBeam(loads, [
    { name: 'gondola', x: m(design.hull.length * 0.3), mass: 3200 },
    { name: 'engines', x: m(design.hull.length * 0.62), mass: 900 },
    { name: 'fins', x: m(design.hull.length * 0.88), mass: 700 },
  ])

  return {
    powerCurve,
    holdingCurve,
    cutoffWind,
    designWind: design.mission.stationKeepingWind,
    hullLength: design.hull.length,
    beam: {
      stations: beam.stations.map((s) => ({ x: s.x, shear: s.shear, moment: s.moment })),
      maximumMoment: beam.maximumMoment,
      maximumMomentStation: beam.maximumMomentStation,
      maximumShear: beam.maximumShear,
      maximumShearStation: beam.maximumShearStation,
      hogging: beam.hogging,
    },
  }
})()

export const sources = SOURCES

/**
 * The arrangement, flattened for the drawing.
 *
 * The 3D view renders THIS. Every box it draws is placed and sized from the
 * same station, extent, width and height the mass statement integrated, so a
 * compartment cannot look roomy on screen and be a cupboard in the budget. The
 * gas cells are the volume the lift figure used, minus the keel corridor. The
 * fins are the planform the yaw static margin was computed from.
 *
 * Serialised to plain numbers because it crosses into a client component.
 */
export const arrangement = (() => {
  const statement = massStatement(BASELINE, BASELINE_ARRANGEMENT)
  const findings = validateArrangement(BASELINE, BASELINE_ARRANGEMENT)
  const fins = finPlanform(BASELINE, BASELINE_ARRANGEMENT)
  const { length, finenessRatio, cellCount } = BASELINE.hull
  const maxRadius = length / finenessRatio / 2

  const volumeOf = (id: string) => statement.items.find((i) => i.id === id)?.volume ?? 0
  const heightOf = (id: string) => statement.items.find((i) => i.id === id)?.z ?? 0

  return {
    length,
    maxRadius,
    cellCount,
    radii: hullProfile.radii,
    exhaustStation: BASELINE_ARRANGEMENT.exhaustStation,
    exhaustHeightFraction: BASELINE_ARRANGEMENT.exhaustHeightFraction,
    cellBlockForward: BASELINE_ARRANGEMENT.cellBlockForward,
    cellBlockAft: BASELINE_ARRANGEMENT.cellBlockAft,
    keelForward: BASELINE_ARRANGEMENT.keelForward,
    keelAft: BASELINE_ARRANGEMENT.keelAft,
    keelWidth: BASELINE_ARRANGEMENT.keelWidth,
    arrayHalfAngle: BASELINE.power.arrayCoverageHalfAngle,
    arrayForwardStation: BASELINE.power.arrayForwardStation,
    arrayAftStation: BASELINE.power.arrayAftStation,
    fins,

    compartments: BASELINE_ARRANGEMENT.compartments.map((c) => ({
      id: c.id,
      name: c.name,
      deck: c.deck,
      category: c.category,
      station: c.station,
      extent: c.extent,
      width: c.width,
      height: c.height,
      mass: c.mass,
      volume: volumeOf(c.id),
      z: heightOf(c.id),
      habitable: c.habitable,
      netHabitable: c.netHabitable,
      shell: c.shell,
      enclosed: c.enclosed,
      note: c.note ?? null,
    })),

    propulsors: BASELINE_ARRANGEMENT.propulsors.map((p) => ({
      id: p.id,
      station: p.station,
      lateralOffset: p.lateralOffset,
      heightFraction: p.heightFraction,
      diameter: p.diameter,
      ratedPower: p.ratedPower,
      vectorAuthority: p.vectorAuthority,
      mass: p.mass,
      note: p.note ?? null,
    })),

    mass: {
      total: statement.total,
      emptyWeight: statement.emptyWeight,
      grossLift: statement.grossLift,
      liftAtSeaLevel: statement.liftAtSeaLevel,
      liftAtAltitude: statement.liftAtAltitude,
      bindingCondition: statement.bindingCondition,
      liftMargin: statement.liftMargin,
      marginFraction: statement.liftMargin / statement.total,
      gasVolume: statement.gasVolume,
      keelEnvelope: statement.keelEnvelope,
      emptyWeightPerGasVolume: statement.emptyWeightPerGasVolume,
      habitableVolume: statement.habitableVolume,
      centreOfGravity: statement.centreOfGravity,
      centreOfBuoyancy: statement.centreOfBuoyancy,
      byCategory: statement.byCategory,
      byDeck: statement.byDeck,
      items: statement.items.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        deck: i.deck,
        mass: i.mass,
        x: i.x,
        z: i.z,
        volume: i.volume,
        computed: i.computed,
        note: i.note ?? null,
      })),
    },

    findings: findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      rule: f.rule,
      detail: f.detail,
    })),

    /** What the hull length had to be, and what it would have been without the margin. */
    sizing: {
      closesExactly: smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT, 0),
      withGrowthAllowance: smallestClosingLength(BASELINE, BASELINE_ARRANGEMENT),
      marginAt90: massStatement(
        { ...BASELINE, hull: { ...BASELINE.hull, length: 90 } },
        BASELINE_ARRANGEMENT,
      ).liftMargin,
    },
  }
})()

/**
 * Marine mode, from the same solver the tests exercise.
 *
 * The simulator on the site integrates these numbers in the browser; this is
 * the vehicle description it integrates, plus the standing answers that do not
 * depend on what the visitor does with the sliders.
 */
export const marine = (() => {
  const statement = massStatement(BASELINE, BASELINE_ARRANGEMENT)
  const gondola = BASELINE_ARRANGEMENT.compartments.find((c) => c.id === 'gondola-structure')
  if (!gondola) throw new Error('The arrangement has no gondola to float on.')

  /** @derived Waterline is shorter than the hull: the ends are fined off. */
  const waterlineLength = gondola.extent * 0.85
  /** @derived Waterplane is not the full rectangle: the sides taper in. */
  const waterplaneArea = gondola.width * waterlineLength * 0.75
  const gondolaMass = statement.byDeck.gondola
  /** @source Gondola weight times a gust factor: what the suspension is sized by. */
  const suspensionDesignLoad = gondolaMass * 9.80665 * 2.5
  const cushionPressure = cushionPressureFor(N(suspensionDesignLoad), waterplaneArea)

  /**
   * Static thrust of the four propulsors by momentum theory.
   *
   * @derived T = (2 * rho * A)^(1/3) * P^(2/3), the ideal actuator disc result.
   * A real propeller reaches about 80 percent of it, and that factor is applied.
   */
  const staticThrust = BASELINE_ARRANGEMENT.propulsors.reduce((sum, p) => {
    const area = Math.PI * (p.diameter / 2) ** 2
    const ideal = Math.cbrt(2 * 1.225 * area) * Math.pow(p.ratedPower, 2 / 3)
    return sum + ideal * 0.8
  }, 0)

  /** The trim the ship lands at: deliberately heavy, so it stays put. */
  const landingHeaviness = 800

  const rigid = { kind: 'rigid' as const, waterplaneArea }
  const cushion = {
    kind: 'pneumatic' as const,
    contactArea: waterplaneArea,
    gaugePressure: cushionPressure,
  }

  return {
    waterlineLength,
    waterplaneArea,
    gondolaWidth: gondola.width,
    gondolaLength: gondola.extent,
    gondolaMass,
    suspensionDesignLoad,
    cushionPressure,
    staticThrust,
    landingHeaviness,
    totalMass: statement.total,
    envelopeVolume: statement.gasVolume,
    hullSpeed: hullSpeed(m(waterlineLength)),
    porpoisingSpeed: porpoisingSpeed(m(waterlineLength)),

    /** The comparison that decided the landing gear. */
    seakeepingComparison: SEA_STATE.map((state) => ({
      code: state.code,
      description: state.description,
      significantWaveHeight: state.significantWaveHeight,
      rigid: (() => {
        const k = seakeeping(state.code, rigid, N(suspensionDesignLoad))
        return { load: k.suspensionLoad as number, utilisation: k.utilisation, ok: k.acceptable }
      })(),
      cushion: (() => {
        const k = seakeeping(state.code, cushion, N(suspensionDesignLoad))
        return {
          load: k.suspensionLoad as number,
          utilisation: k.utilisation,
          ok: k.acceptable,
          forceLimited: k.forceLimited,
        }
      })(),
    })),
    maximumSeaStateRigid: maximumSeaState(rigid, N(suspensionDesignLoad)),
    maximumSeaStateCushion: maximumSeaState(cushion, N(suspensionDesignLoad)),

    /** Speed made good against wind, which decides whether marine mode is an escape. */
    windward: [0, 3, 5, 8, 10, 12, 15, 18, 20].map((wind) => {
      const p = windwardSpeed(
        N(staticThrust),
        wind,
        kg(landingHeaviness),
        m(waterlineLength),
        statement.gasVolume,
      )
      return {
        wind,
        speed: p.speed,
        overpowered: p.overpowered,
        porpoisingLimited: p.porpoisingLimited,
        aerodynamicFraction: p.resistance.aerodynamicFraction,
      }
    }),
    stallWind: windwardSpeed(
      N(staticThrust),
      5,
      kg(landingHeaviness),
      m(waterlineLength),
      statement.gasVolume,
    ).stallWind,

    /** Touchdown at a range of arrival rates. */
    touchdown: [0.5, 1.0, 1.5, 2.0, 3.0].map((rate) => {
      const t = waterTouchdown(
        rate,
        waterplaneArea,
        kg(landingHeaviness),
        kg(statement.total),
        m(1.8),
      )
      return {
        rate,
        immersion: t.immersion,
        loadFactor: t.loadFactor,
        submerged: t.submerged,
      }
    }),
  }
})()

/** Every architecture, run through the same gates. */
export const architectures = (() => {
  const statement = massStatement(BASELINE, BASELINE_ARRANGEMENT)
  const girder = hullBendingMoment(BASELINE, BASELINE_ARRANGEMENT)

  return {
    girder: {
      staticMoment: girder.staticMoment,
      staticStation: girder.staticStation,
      hogging: girder.hogging,
      gustMoment: girder.gustMoment,
      gustIncidence: girder.gustIncidence,
      designMoment: girder.designMoment,
      note: girder.note,
    },
    comparison: ARCHITECTURES.map((a) => {
      const c = compareArchitecture(
        a,
        BASELINE.hull.length,
        BASELINE.hull.finenessRatio,
        BASELINE.hull.prismaticCoefficient,
        statement.total,
        BASELINE.hull.cellCount,
        v(barrierFilm(BASELINE.hull.filmId).arealDensity),
        girder.designMoment,
      )
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        calibratedOn: a.calibratedOn,
        containment: a.containment,
        buoyancyControl: a.buoyancyControl,
        aerodynamicLiftFraction: a.aerodynamicLiftFraction,
        gasVolume: c.gasVolume,
        structure: {
          frame: c.structure.frame,
          envelope: c.structure.envelope,
          containment: c.structure.containment,
          total: c.structure.total,
          perVolume: c.structure.perVolume,
          note: c.structure.note,
        },
        ballastMass: c.buoyancyControl.systemMass,
        ballastEnergy: c.buoyancyControl.energyPerKilogram,
        ballastRenewable: c.buoyancyControl.renewable,
        ballastNote: c.buoyancyControl.note,
        pressure: c.pressureLimit
          ? {
              required: c.pressureLimit.requiredPressure,
              wrinkling: c.pressureLimit.wrinklingPressure,
              aerodynamic: c.pressureLimit.aerodynamicPressure,
              governedBy: c.pressureLimit.governedBy,
              fabricLoad: c.pressureLimit.fabricLoad,
              allowable: c.pressureLimit.allowable,
              withinLimit: c.pressureLimit.withinLimit,
              reason: c.pressureLimit.reason,
            }
          : null,
        minimumFlyingSpeed: c.minimumFlyingSpeed,
        canHover: c.canHover,
        damageTolerance: c.damageTolerance,
        verdict: c.verdict,
      }
    }),
  }
})()
