import {
  cellFilmArea,
  diaphragmArea,
  hullGeometry,
  hullShapeForPrismatic,
  liftingBodyGeometry,
  minimumFlyingSpeed,
} from '@airship/core'
import { EMPTY_WEIGHT_PER_GAS_VOLUME } from '@airship/data'
import { m, m2 } from '@airship/units'

/**
 * The architectures, and what each one actually costs.
 *
 * The point of this module is that the choice between rigid, semi-rigid,
 * non-rigid, hybrid-lift and variable-buoyancy is not a matter of taste. Each is
 * a different set of trades, each is calibrated here against a vehicle that
 * really flew, and each is run through the same gates so the comparison means
 * something.
 *
 * THE CALIBRATION POINTS, all published:
 *
 *   rigid            LZ-129 Hindenburg, 200,000 m3, 118,000 kg empty
 *   semi-rigid       Zeppelin NT, 8,255 m3, a 1,000 kg carbon and aluminium
 *                    truss inside a 5 mbar envelope with 2,000 m3 of ballonets
 *   non-rigid        the same, with the truss deleted
 *   hybrid-lift      Airlander 10, 38,000 m3 in a 98 by 50 by 30 m three-lobe
 *                    envelope, 60 to 80 percent buoyant, pneumatic skids
 *   variable-buoyancy Aeros Aeroscraft COSH, which has no published numbers at
 *                    all, so its figures here are derived from thermodynamics
 *                    and COPV mass fractions and are marked as such
 *
 * THE TWO RESULTS THAT DECIDE THE DESIGN, both of which came out of building
 * this rather than out of reading about it:
 *
 *   A pressure-stabilised hull has a SIZE LIMIT, and it is set by DYNAMIC
 *   PRESSURE rather than by bending. The envelope must hold its shape against
 *   the airstream, which needs about 8 mbar at 30 m/s, four times what the
 *   bending moment demands. Fabric load is p times R, so it grows with hull
 *   radius, and against a 70 kN/m laminate at a safety factor of 4 the limit
 *   lands near 200 m: above the 75 m Zeppelin NT and the 98 m Airlander, and
 *   just below the 245 m Hindenburg, which was rigid because nothing else
 *   works there. Semi-rigid IS available at 115 m.
 *
 *   Variable buoyancy by compression is 45 times heavier than water ballast
 *   for the same authority, and it costs about 1 MJ per kilogram of lift
 *   traded where water costs nothing. Over an ocean, where water is free and
 *   unlimited, it is not a close call.
 */

export type ArchitectureId =
  | 'rigid'
  | 'semi-rigid'
  | 'non-rigid'
  | 'hybrid-lift'
  | 'variable-buoyancy'

export type HullForm = 'body-of-revolution' | 'multi-lobe'

/** How the lifting gas is contained, which is really a damage tolerance choice. */
export type GasContainment =
  /** Independent cells behind an outer cover. A tear loses one cell. */
  | 'independent-cells'
  /** One gas volume with air ballonets inside it. A tear loses everything. */
  | 'single-volume-with-ballonets'

/** How static heaviness is changed in flight. */
export type BuoyancyControl =
  /** Take on or dump water. Free over an ocean, and unlimited. */
  | 'water-ballast'
  /** Pump air in and out of ballonets. Cheap, and limited to the ballonet size. */
  | 'ballonet-air'
  /** Compress lifting gas into tanks. Expensive in mass and energy. */
  | 'gas-compression'

export type LandingGear = 'pneumatic-cushion' | 'boat-hull' | 'skids' | 'wheels'

export interface Architecture {
  readonly id: ArchitectureId
  readonly name: string
  readonly description: string
  readonly hullForm: HullForm
  /** Lobes across the beam. One is a body of revolution. */
  readonly lobes: number
  readonly containment: GasContainment
  /** Ballonet volume as a fraction of envelope volume. Zero for rigid cells. */
  readonly ballonetFraction: number
  /**
   * Envelope gauge pressure, Pa. Zero when the structure carries the loads and
   * the envelope is only a cover.
   */
  readonly envelopeOverpressure: number
  readonly buoyancyControl: BuoyancyControl
  readonly landingGear: LandingGear
  /**
   * Fraction of gross weight intended to be carried aerodynamically at cruise.
   * Zero for a fully buoyant vehicle.
   */
  readonly aerodynamicLiftFraction: number
  readonly calibratedOn: string
}

// --------------------------------------------------------------------------
// Structural mass models, one per architecture, each calibrated
// --------------------------------------------------------------------------

/**
 * Rigid framework mass per cubic metre of gas, kg/m3.
 *
 * @derived The Hindenburg empty weight per gas volume of 0.59 kg/m3, times the
 * 0.47 framework share of empty weight, times the 0.62 carbon correction on a
 * specific-MODULUS basis because the frame is buckling critical. 0.172 kg/m3.
 * The same figure `arrangement.ts` uses, and it lives here so the architectures
 * can be compared on one basis.
 */
const RIGID_FRAME_PER_VOLUME =
  EMPTY_WEIGHT_PER_GAS_VOLUME.hindenburg * 0.47 * 0.62

/**
 * Semi-rigid keel mass coefficient, kg per kilogram of gross weight per metre of
 * length.
 *
 * @source Calibrated on the Zeppelin NT: a 1,000 kg carbon-and-aluminium
 * triangular truss in a 75 m vehicle of 10,690 kg gross weight gives
 * 1.247e-6 kg/(kg m).
 *
 * @derived The scaling is mass proportional to gross weight times length. A keel
 * beam carrying distributed load has a bending moment going as W*L, and a beam
 * of depth d needs mass proportional to M*L/(sigma*d). The depth available is
 * the hull diameter, which for a fixed fineness ratio goes as L, so the two
 * lengths cancel and the mass goes as W*L. It is a one-point calibration and
 * that is the honest description of it: there is one flying semi-rigid.
 */
const SEMI_RIGID_KEEL_COEFFICIENT = 1000 / (10690 * 75)

/**
 * Envelope areal mass for a pressure-stabilised hull, kg/m2.
 *
 * @source The Zeppelin NT's three-layer Tedlar, polyester and polyurethane
 * laminate. A pressure-stabilised envelope is structure rather than a cover, so
 * it is several times heavier than the outer cover of a rigid: 0.35 against
 * 0.25 kg/m2, and it also has to be gas-tight, which the cover does not.
 */
const PRESSURISED_ENVELOPE_AREAL_MASS = 0.35

/** @source Outer cover of a rigid, which is weatherproofing rather than structure. */
const COVER_AREAL_MASS = 0.25

/** @source Ballonet fabric is lighter than the envelope: air on both sides. */
const BALLONET_AREAL_MASS = 0.12

/** @source Cell netting and lacing over a gas cell, kg/m2. */
const CELL_NETTING_AREAL_MASS = 0.06

/**
 * A lobed hull at the proportions the flying example uses.
 *
 * @source Airlander 10: 50 m of beam and 30 m of height on a 98 m hull, so beam
 * is 0.51 of length and height is 0.31. Taken at 0.5 and 0.25, the height
 * rounded down because the published figure probably includes the fins and the
 * gondola and guessing which part of it is hull is the kind of silent
 * adjustment this repository exists to prevent.
 */
const LOBED_BEAM_FRACTION = 0.5
/** @source The same Airlander calibration, height over length. */
const LOBED_HEIGHT_FRACTION = 0.25

const lobedHull = (length: number, lobes: number) =>
  liftingBodyGeometry(
    m(length),
    m(length * LOBED_BEAM_FRACTION),
    m(length * LOBED_HEIGHT_FRACTION),
    lobes,
  )

export interface StructuralMass {
  /** Primary structure: frame, truss or nothing. */
  readonly frame: number
  /** Outer cover or pressure envelope. */
  readonly envelope: number
  /** Gas cells and their netting, or the ballonets. */
  readonly containment: number
  readonly total: number
  /** Total over gas volume, for comparison with the historical fleet. */
  readonly perVolume: number
  readonly note: string
}

export interface PressureLimit {
  /** Overpressure needed to stop the envelope wrinkling under bending, Pa. */
  readonly wrinklingPressure: number
  /** Overpressure needed to hold shape against the airstream, Pa. */
  readonly aerodynamicPressure: number
  /** The larger of the two: what the envelope must actually hold, Pa. */
  readonly requiredPressure: number
  /** Which of the two governs. */
  readonly governedBy: 'bending' | 'dynamic pressure'
  /** Hoop load that pressure puts into the fabric, N/m. */
  readonly fabricLoad: number
  /** Allowable fabric load with a safety factor, N/m. */
  readonly allowable: number
  readonly withinLimit: boolean
  readonly reason: string
}

/**
 * The size limit of a pressure-stabilised hull.
 *
 * TWO CRITERIA, AND THE OBVIOUS ONE IS NOT THE BINDING ONE. This is worth
 * spelling out because the first version of this module got it wrong and nearly
 * shipped a headline claim that was false.
 *
 * THE BENDING CRITERION. A pressurised membrane cylinder goes slack on the
 * compression side when the bending moment exceeds the wrinkling moment
 * M_w = pi * p * R^3, so p >= M / (pi R^3). It is the criterion everyone reaches
 * for, and at airship scale it is tiny: the real gust-case moment on this
 * vehicle is 1.16 MN m, which needs 2 mbar. The Zeppelin NT runs 5 mbar, so
 * bending is not what its pressure is for.
 *
 * THE AERODYNAMIC CRITERION, which is what actually sets the number. The
 * envelope must not dent under the airstream. Local suction over the forebody
 * reaches well past the free-stream dynamic pressure, so the internal pressure
 * has to exceed q by a margin. At 30 m/s that is 8 mbar, four times the bending
 * requirement, and it explains the 5 mbar the Zeppelin NT actually holds.
 *
 * WHERE THE LIMIT REALLY IS. The fabric load is p*R, and the governing pressure
 * does not fall with size while R grows linearly, so the load grows linearly
 * with hull radius. Against a 70 kN/m laminate at a safety factor of 4 that puts
 * the limit around 200 m of hull, which is a satisfying answer: it is well above
 * the 75 m Zeppelin NT and the 98 m Airlander, and just below the 245 m
 * Hindenburg, which was rigid precisely because nothing else works there.
 *
 * So semi-rigid IS available at 115 m. It was the first version of this
 * function, using a bending moment guessed at 8 MN m instead of the 1.16 the
 * beam model actually gives, that said otherwise.
 *
 * @param bendingMoment Peak hull bending moment, N m, from the beam model.
 * @param radius Maximum hull radius, m.
 * @param designSpeed Speed the envelope must hold its shape at, m/s.
 */
export const pressureStabilisedLimit = (
  bendingMoment: number,
  radius: number,
  /** @source Maximum speed a vehicle of this class is designed to fly at. */
  designSpeed = 30,
  /** @source Modern airship envelope laminates run 50 to 100 kN/m. */
  fabricStrength = 70000,
  /** @source Airship envelope practice uses a safety factor of 4 on burst. */
  safetyFactor = 4,
): PressureLimit => {
  const wrinklingPressure = bendingMoment / (Math.PI * radius ** 3)

  /**
   * @source Local suction over an airship forebody reaches roughly 1.5 times
   * free-stream dynamic pressure, so the envelope must hold at least that or it
   * dents. Air density at the surface, which is the worst case.
   */
  const SUCTION_PEAK_FACTOR = 1.5
  /** @source ISA sea level density, the worst case for envelope pressure. */
  const AIR_DENSITY = 1.225
  const aerodynamicPressure =
    SUCTION_PEAK_FACTOR * 0.5 * AIR_DENSITY * designSpeed * designSpeed

  const requiredPressure = Math.max(wrinklingPressure, aerodynamicPressure)
  const governedBy: 'bending' | 'dynamic pressure' =
    wrinklingPressure >= aerodynamicPressure ? 'bending' : 'dynamic pressure'

  const fabricLoad = requiredPressure * radius
  const allowable = fabricStrength / safetyFactor
  const withinLimit = fabricLoad <= allowable

  return {
    wrinklingPressure,
    aerodynamicPressure,
    requiredPressure,
    governedBy,
    fabricLoad,
    allowable,
    withinLimit,
    reason: withinLimit
      ? `${(requiredPressure / 100).toFixed(0)} mbar, set by ${governedBy}: bending needs ${(wrinklingPressure / 100).toFixed(1)} mbar and holding shape at ${designSpeed} m/s needs ${(aerodynamicPressure / 100).toFixed(0)}. That is ${(fabricLoad / 1000).toFixed(1)} kN/m in the fabric against ${(allowable / 1000).toFixed(0)} allowable, so pressure stabilisation still works at this size. The Zeppelin NT holds 5 mbar, which is the same criterion at a quarter the radius.`
      : `${(requiredPressure / 100).toFixed(0)} mbar, set by ${governedBy}, puts ${(fabricLoad / 1000).toFixed(1)} kN/m into the fabric against a ${(allowable / 1000).toFixed(0)} kN/m allowable. The hull is past the size where pressure stabilisation works: the load is p times R and R is still growing, so the fabric now has to get heavier faster than the frame it was meant to replace. This is why the largest airships ever built were rigid.`,
  }
}

/**
 * Structural mass for an architecture at a given size.
 *
 * Every branch is calibrated on a real vehicle and every branch says which one.
 */
export const structuralMass = (
  architecture: Architecture,
  gasVolume: number,
  length: number,
  wettedArea: number,
  grossWeight: number,
  cellCount: number,
  filmArealMass: number,
): StructuralMass => {
  const cellArea = cellFilmArea(m2(wettedArea), gasVolume, length, cellCount)

  switch (architecture.id) {
    case 'rigid':
    case 'variable-buoyancy': {
      // Variable buoyancy is a rigid with a gas plant bolted into it. The
      // structure is identical; the difference is in the systems mass, which
      // `variableBuoyancyPenalty` charges separately.
      const frame = gasVolume * RIGID_FRAME_PER_VOLUME
      const envelope = wettedArea * COVER_AREAL_MASS
      const containment = cellArea * (filmArealMass + CELL_NETTING_AREAL_MASS)
      const total = frame + envelope + containment
      return {
        frame,
        envelope,
        containment,
        total,
        perVolume: total / gasVolume,
        note: `Rigid frame from the Hindenburg framework share corrected for carbon on a specific-modulus basis, an outer cover that is weatherproofing rather than structure, and ${cellCount} independent gas cells with netting.`,
      }
    }

    case 'semi-rigid': {
      // A keel truss carrying the point loads into a pressure-stabilised
      // envelope. The truss is far lighter than a full frame; the envelope is
      // far heavier than a cover, and there are no independent cells.
      const frame = SEMI_RIGID_KEEL_COEFFICIENT * grossWeight * length
      const envelope = wettedArea * PRESSURISED_ENVELOPE_AREAL_MASS
      /** @derived Ballonet fabric area scales with its share of the volume. */
      const ballonetArea = wettedArea * Math.pow(architecture.ballonetFraction, 2 / 3)
      const containment = ballonetArea * BALLONET_AREAL_MASS
      const total = frame + envelope + containment
      return {
        frame,
        envelope,
        containment,
        total,
        perVolume: total / gasVolume,
        note: `Keel truss scaled from the Zeppelin NT's 1,000 kg at 75 m and 10,690 kg gross, a pressure-stabilised envelope that is structure rather than a cover, and ${(architecture.ballonetFraction * 100).toFixed(0)} percent ballonets. One gas volume: a tear does not lose a cell, it loses the ship.`,
      }
    }

    case 'non-rigid': {
      // The truss deleted. Everything goes through the envelope, so the
      // envelope has to be heavier still, and there is nothing to hang an
      // engine or a gondola from except a load curtain.
      const frame = 0
      /**
       * @derived A non-rigid envelope also carries the suspension curtains that
       * a keel truss would otherwise carry, so it is a quarter heavier again.
       */
      const CURTAIN_PENALTY = 1.25
      const envelope = wettedArea * PRESSURISED_ENVELOPE_AREAL_MASS * CURTAIN_PENALTY
      const ballonetArea = wettedArea * Math.pow(architecture.ballonetFraction, 2 / 3)
      const containment = ballonetArea * BALLONET_AREAL_MASS
      const total = frame + envelope + containment
      return {
        frame,
        envelope,
        containment,
        total,
        perVolume: total / gasVolume,
        note: 'No primary structure at all. The envelope carries every load through catenary curtains, which is why it is a quarter heavier again than a semi-rigid envelope, and why the whole vehicle depends on a blower never stopping.',
      }
    }

    case 'hybrid-lift': {
      // A multi-lobe non-rigid, plus the diaphragms between the lobes, plus the
      // extra skin the shape costs.
      const frame = 0
      /** @derived Same curtain penalty as a non-rigid: there is no frame here either. */
      const CURTAIN_PENALTY = 1.25
      const envelope = wettedArea * PRESSURISED_ENVELOPE_AREAL_MASS * CURTAIN_PENALTY
      const lobeGeometry = lobedHull(length, architecture.lobes)
      const diaphragms = diaphragmArea(lobeGeometry, architecture.lobes) * filmArealMass
      const ballonetArea = wettedArea * Math.pow(architecture.ballonetFraction, 2 / 3)
      const containment = ballonetArea * BALLONET_AREAL_MASS + diaphragms
      const total = frame + envelope + containment
      return {
        frame,
        envelope,
        containment,
        total,
        perVolume: total / gasVolume,
        note: `Multi-lobe non-rigid: no frame, a load-carrying envelope, ballonets, and ${(diaphragms / 1000).toFixed(1)} tonnes of diaphragm between the ${architecture.lobes} lobes. The diaphragms are the term that quick comparisons leave out, and they permeate in both directions.`,
      }
    }
  }
}

// --------------------------------------------------------------------------
// Variable buoyancy: the arithmetic that settles it
// --------------------------------------------------------------------------

export interface BuoyancyControlCost {
  /** Mass of the system needed for a given lift authority, kg. */
  readonly systemMass: number
  /** Energy to trade one kilogram of lift, J. */
  readonly energyPerKilogram: number
  /** How much mass this costs per kilogram of authority. */
  readonly massRatio: number
  readonly renewable: boolean
  readonly note: string
}

/**
 * What it costs to be able to change static heaviness by a given amount.
 *
 * THE COMPARISON THAT KILLS COMPRESSION FOR THIS MISSION. Aeroscraft's COSH is
 * the right answer for a cargo airship over land that must unload without
 * taking on ballast. It is the wrong answer for a vehicle that lives over an
 * ocean, and the margin is not close.
 *
 * @param authority Lift change required, kg.
 */
export const buoyancyControlCost = (
  control: BuoyancyControl,
  authority: number,
  species: 'hydrogen' | 'helium',
): BuoyancyControlCost => {
  switch (control) {
    case 'water-ballast': {
      /** @source Water at 1000 kg/m3, in a tank of about 30 kg per m3 of capacity. */
      const TANK_MASS_PER_CUBIC_METRE = 30
      /** @source Fresh water at 1000 kg/m3. Seawater is 2.5 percent denser. */
      const WATER_DENSITY = 1000
      const tankVolume = authority / WATER_DENSITY
      const systemMass = tankVolume * TANK_MASS_PER_CUBIC_METRE
      /**
       * @derived Pumping water aboard from a metre below the surface costs
       * rho*g*h per cubic metre, which is 10 kJ per tonne, or 10 J per kg. It
       * rounds to nothing against everything else in this comparison.
       */
      const energyPerKilogram = 10
      return {
        systemMass,
        energyPerKilogram,
        massRatio: systemMass / authority,
        renewable: true,
        note: `${tankVolume.toFixed(1)} m3 of tankage at ${systemMass.toFixed(0)} kg. Over an ocean the ballast is free, unlimited, and the same water the electrolyzer and the crew are already using. Rain refills it.`,
      }
    }

    case 'ballonet-air': {
      /**
       * @derived Air ballast changes lift by displacing lifting gas rather than
       * by adding mass, so the authority is limited to the ballonet volume
       * times the specific lift. The fan work is the pressure rise times the
       * volume, which at 500 Pa and 1.14 kg of lift per m3 is 440 J per kg.
       */
      const energyPerKilogram = 440
      /** @source A ballonet fan and its ducting, per kg/s of air moved. */
      const systemMass = 60
      return {
        systemMass,
        energyPerKilogram,
        massRatio: systemMass / authority,
        renewable: true,
        note: 'A fan and a valve. Almost free, and hard-limited to the ballonet volume, so it trims rather than lifts. It cannot make the vehicle heavy enough to sit on the ground.',
      }
    }

    case 'gas-compression': {
      /**
       * @derived Isothermal compression work is n*R*T*ln(p2/p1). For hydrogen
       * at 293 K from 1 bar to 250 bar that is 6.67 MJ per kg of gas. Removing
       * 1 kg of hydrogen from a cell at ambient shrinks it by 11.74 m3, which
       * is 13.4 kg of lift, so the work is 0.50 MJ per kg of lift. A real
       * multi-stage compressor manages about half of isothermal, so 1.0 MJ.
       */
      /** @source Molar masses: hydrogen 2.016 g/mol, helium 4.003 g/mol. */
      const molarMass = species === 'hydrogen' ? 0.002016 : 0.004003
      /** @source Densities at ISA sea level: hydrogen 0.0852, helium 0.1691 kg/m3. */
      const gasDensity = species === 'hydrogen' ? 0.0852 : 0.1691
      /** @source The SI molar gas constant. */
      const R = 8.314462618
      /** @source 20 C, the temperature a compressor intercooler returns the gas to. */
      const T = 293.15
      /** @source Storage at 250 bar, which is where COPV mass fraction is still tolerable. */
      const pressureRatio = 250
      const workPerKilogramOfGas = (R * T * Math.log(pressureRatio)) / molarMass
      /** @source Multi-stage intercooled compressors reach about half of isothermal. */
      const compressorEfficiency = 0.5
      /** @derived Lift released per kg of gas removed at ambient. */
      /** @source ISA sea level air density, against which the gas lifts. */
      const AIR_DENSITY = 1.225
      const liftPerKilogramOfGas = (1 / gasDensity) * (AIR_DENSITY - gasDensity)
      const energyPerKilogram =
        workPerKilogramOfGas / compressorEfficiency / liftPerKilogramOfGas

      /**
       * @source COPV gravimetric efficiency at 250 bar is about 5.5 percent of
       * stored gas mass to tank mass for hydrogen, which is the figure the
       * automotive sector reaches at 700 bar and is optimistic at 250.
       */
      const COPV_GRAVIMETRIC_EFFICIENCY = 0.055
      const gasStored = authority / liftPerKilogramOfGas
      const tankMass = gasStored / COPV_GRAVIMETRIC_EFFICIENCY
      /** @source A compressor and its drive, per kW. Sized at 5 kW here. */
      const COMPRESSOR_MASS = 120
      const systemMass = tankMass + COMPRESSOR_MASS

      return {
        systemMass,
        energyPerKilogram,
        massRatio: systemMass / authority,
        renewable: false,
        note: `${gasStored.toFixed(0)} kg of ${species} in ${tankMass.toFixed(0)} kg of composite pressure vessel, plus a compressor. It never runs out, which is the argument for it, and it weighs ${(systemMass / buoyancyControlCost('water-ballast', authority, species).systemMass).toFixed(0)} times what the same authority in water tankage does.`,
      }
    }
  }
}

// --------------------------------------------------------------------------
// The architectures themselves
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Comparing them
// --------------------------------------------------------------------------

export interface ArchitectureComparison {
  readonly architecture: Architecture
  readonly gasVolume: number
  readonly structure: StructuralMass
  readonly buoyancyControl: BuoyancyControlCost
  /** Structure plus buoyancy control system, kg. */
  readonly systemsMass: number
  readonly pressureLimit: PressureLimit | null
  /** Speed below which it cannot hold altitude, m/s. Zero if it can hover. */
  readonly minimumFlyingSpeed: number
  readonly canHover: boolean
  readonly damageTolerance: string
  readonly verdict: string
}

/**
 * Run one architecture through the same gates as all the others.
 *
 * @param bendingMoment Peak hull bending moment, N m, from the beam model. The
 *   pressure-stabilised architectures need it and the rigid ones do not.
 */
/** @source ISA density at the 2,000 m design altitude. */
const DESIGN_ALTITUDE_DENSITY = 1.0065

export const compareArchitecture = (
  arch: Architecture,
  length: number,
  finenessRatio: number,
  prismaticCoefficient: number,
  grossWeight: number,
  cellCount: number,
  filmArealMass: number,
  bendingMoment: number,
  /** @source Water ballast authority a liveaboard wants: enough to land heavy. */
  ballastAuthority = 2000,
): ArchitectureComparison => {
  const shape = hullShapeForPrismatic(prismaticCoefficient)
  const conventional = hullGeometry(m(length), finenessRatio, shape)
  const radius = length / finenessRatio / 2

  const geometry =
    arch.hullForm === 'multi-lobe'
      ? (() => {
          const lb = lobedHull(length, arch.lobes)
          return { volume: lb.volume, wettedArea: lb.wettedArea as number }
        })()
      : { volume: conventional.volume as number, wettedArea: conventional.wettedArea as number }

  // A pressure-stabilised hull gives up its ballonet volume to air.
  const gasVolume = geometry.volume * (1 - arch.ballonetFraction)

  const structure = structuralMass(
    arch,
    gasVolume,
    length,
    geometry.wettedArea,
    grossWeight,
    cellCount,
    filmArealMass,
  )

  const control = buoyancyControlCost(arch.buoyancyControl, ballastAuthority, 'hydrogen')

  const pressureLimit =
    arch.envelopeOverpressure > 0 ? pressureStabilisedLimit(bendingMoment, radius) : null

  const heaviness = arch.aerodynamicLiftFraction * grossWeight
  const speed =
    arch.hullForm === 'multi-lobe' && heaviness > 0
      ? minimumFlyingSpeed(
          lobedHull(length, arch.lobes),
          heaviness,
          DESIGN_ALTITUDE_DENSITY,
        )
      : 0

  const damageTolerance =
    arch.containment === 'independent-cells'
      ? `A tear loses one cell of ${cellCount}, so ${(100 / cellCount).toFixed(0)} percent of the lift, and the ship flies home heavy. This is the only architecture where a puncture is an incident rather than an ending.`
      : 'One gas volume. A tear does not lose a cell, it loses the ship. Ballonets hold pressure, not gas, so they do not help.'

  const problems: string[] = []
  if (pressureLimit && !pressureLimit.withinLimit) {
    problems.push('the envelope cannot hold the pressure its own bending moment demands')
  }
  if (speed > 0) problems.push(`it must hold ${speed.toFixed(1)} m/s forever or descend`)
  if (arch.containment === 'single-volume-with-ballonets') {
    problems.push('a single gas volume has no damage tolerance')
  }
  if (!control.renewable) {
    problems.push(`its ballast system weighs ${control.systemMass.toFixed(0)} kg`)
  }

  return {
    architecture: arch,
    gasVolume,
    structure,
    buoyancyControl: control,
    systemsMass: structure.total + control.systemMass,
    pressureLimit,
    minimumFlyingSpeed: speed,
    canHover: speed === 0,
    damageTolerance,
    verdict:
      problems.length === 0
        ? `${structure.total.toFixed(0)} kg of structure on ${gasVolume.toFixed(0)} m3 of gas, ${structure.perVolume.toFixed(3)} kg/m3. Nothing disqualifies it.`
        : `${structure.total.toFixed(0)} kg of structure on ${gasVolume.toFixed(0)} m3 of gas, ${structure.perVolume.toFixed(3)} kg/m3, but ${problems.join('; ')}.`,
  }
}
