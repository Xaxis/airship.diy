import {
  cellFilmArea,
  diaphragmArea,
  hullGeometry,
  hullShapeForPrismatic,
  liftingBodyGeometry,
  minimumFlyingSpeed,
} from '@airship/core'
import { v, AKRON_STRUCTURE, CONSTANTS, EMPTY_WEIGHT_PER_GAS_VOLUME, ISA, MOLAR_MASS, SEMI_RIGID_ADVANTAGE } from '@airship/data'
import { m, m2 } from '@airship/units'

/**
 * The architectures, and what each one actually costs.
 *
 * The point of this module is that the choice between rigid, semi-rigid,
 * non-rigid, hybridLift and variable-buoyancy is not a matter of taste. Each is
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
 *   hybridLift      Airlander 10, 38,000 m3 in a 98 by 50 by 30 m three-lobe
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
 * @derived The Hindenburg empty weight per gas volume of 0.59 kg/m3, times
 * Akron's MEASURED 0.33 framework share of empty weight, times the 0.62 carbon
 * correction on a specific-MODULUS basis because the frame is buckling
 * critical. 0.121 kg/m3.
 *
 * The share was 0.47 until the girder research recovered Burgess's actual
 * component weight statement for Akron via NASA CR-137691. The guess was 42
 * percent high, because the items that are NOT girder — cover, cells, cars,
 * engines, keels, controls, fuel and ballast systems — are a larger share of a
 * real airship than intuition allows.
 */
const RIGID_FRAME_PER_VOLUME =
  EMPTY_WEIGHT_PER_GAS_VOLUME.hindenburg *
  AKRON_STRUCTURE.frameworkShareOfEmptyWeight *
  0.62

/**
 * Semi-rigid keel truss mass per cubic metre of envelope, kg/m3.
 *
 * @source Calibrated on the Zeppelin NT: a 1,000 kg carbon-and-aluminium
 * triangular truss in an 8,450 m3 envelope gives 0.1183 kg/m3. The truss mass is
 * the manufacturer's own figure and it is the TRUSS ONLY: not the envelope, not
 * the fins, not the gondola. Comparing it against the historical fleet's 0.505
 * to 0.79 kg/m3, which are whole EMPTY WEIGHTS, is the single easiest way to get
 * this trade wrong, and it is why the two are never mixed in this module.
 *
 * @derived The scaling is mass proportional to VOLUME. A keel beam carrying
 * distributed load has mass ~ M*L/((sigma/rho)*D); at fixed fineness and speed
 * M ~ D^3 and L ~ D, so the mass goes as D^3, which is the volume.
 *
 * ONE FLYING DATA POINT. The Zeppelin NT is the only semi-rigid built in ninety
 * years, and it is four times smaller than this vehicle. See
 * SEMI_RIGID_MASS_UNCERTAINTY for what that is worth.
 */
const SEMI_RIGID_KEEL_PER_VOLUME = 1000 / 8450

/**
 * What is actually known about the semi-rigid mass advantage at this size.
 *
 * A WELL-SUPPORTED NO. The two historical data points at or near 33,000 m3
 * differ by 1.6 to 1 and STRADDLE ZERO ADVANTAGE:
 *
 *   Roma (T-34), 33,810 m3, the only semi-rigid ever built at this volume:
 *   15,400 kg empty, 0.4555 kg/m3. Better than every rigid in the fleet table.
 *
 *   Zeppelin NT, 8,450 m3, the only one built since: 6,150 kg empty, 0.7278
 *   kg/m3. Worse than every rigid except R101, and statistically
 *   indistinguishable from the Goodyear GZ-20A NON-RIGID it replaced at 0.7408.
 *
 * So there is no defensible number for the semi-rigid mass saving at this size.
 * The structural figure this module computes is a bottom-up estimate from the
 * Zeppelin NT truss plus a pressure envelope, and it should be read as one
 * plausible value inside a band that includes "no saving at all".
 *
 * The Zeppelin NT's own published gross weight also needs correcting before use:
 * the English-language figure of 10,690 kg is impossible, because 8,450 m3 of
 * helium at ISA with 26 percent ballonet inflation lifts about 6,600 kg and even
 * a fully deflated envelope gives 8,920. Two German sources agree on 8,045 kg.
 */
export const SEMI_RIGID_MASS_UNCERTAINTY = {
  romaPerVolume: SEMI_RIGID_ADVANTAGE.best,
  zeppelinNtPerVolume: SEMI_RIGID_ADVANTAGE.worst,
  goodyearGZ20aNonRigidPerVolume: SEMI_RIGID_ADVANTAGE.nonRigidComparator,
  spread: SEMI_RIGID_ADVANTAGE.spread,
  note: SEMI_RIGID_ADVANTAGE.note,
} as const

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
 * THESE CAME FROM THE SAME BAD TRIPLE AS THE VOLUME COEFFICIENT. "98 m by 50 m
 * by 30 m" mixes the English Wikipedia length with a WINGSPAN row and a height
 * that includes the fins and the gondola. The hull itself is about 92 m by 42 m,
 * and its height follows from the published 38,000 m3 at the corrected volume
 * coefficient: roughly 17 m, not 30.
 *
 * The consequence is not cosmetic. At the old numbers a lobed hull came out with
 * a 63 percent wetted-area penalty against a body of revolution, and that
 * penalty was this chapter's central argument against hybridLift.
 *
 * IT HAS NOW BEEN CORRECTED TWICE, and this file was left carrying the
 * intermediate answer. Fixing the volume coefficient alone swung it to "a few
 * percent", which was no better founded than the 63, because the wetted-area
 * calculation had its own error pushing the other way: it treated each lobe as
 * spanning beam/lobes rather than standing as tall as the hull. With both
 * corrected the Airlander comes out at 7.24 on the wetted-area coefficient
 * against 6.55 for an equal-volume body of revolution at fineness 5, so the
 * penalty is 11 percent, rising to 18 at fineness 4 and falling to nothing by
 * fineness 7. See `liftingBodyGeometry`.
 *
 * A real cost, an order below the one this chapter turned on, and not a
 * disqualification. HybridLift still loses here, and it loses on the lift split
 * and on the power at low speed rather than on skin friction.
 *
 * @source Airlander 10 hull: 42 m of beam on a 92 m hull is 0.457, and 17 m of
 * height is 0.185.
 */
const LOBED_BEAM_FRACTION = 0.457
/** @source The same Airlander calibration, hull height over length. */
const LOBED_HEIGHT_FRACTION = 0.185

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
  const AIR_DENSITY = v(ISA.seaLevelDensity)
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
      const frame = SEMI_RIGID_KEEL_PER_VOLUME * gasVolume
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
        note: `Keel truss scaled from the Zeppelin NT's 1,000 kg in 8,450 m3, a pressure-stabilised envelope that is structure rather than a cover, and ${(architecture.ballonetFraction * 100).toFixed(0)} percent ballonets. One gas volume: a tear does not lose a cell, it loses the ship. THE SAVING IS NOT DEMONSTRABLE at this size: Roma at 33,810 m3 came in at 0.456 kg/m3 and the Zeppelin NT at 0.728, a factor of 1.6 that straddles zero advantage.`,
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
  /** How fast heaviness can be changed, kg per minute per kW of input. */
  readonly ratePerKilowatt: number
  /** How much mass this costs per kilogram of authority. */
  readonly massRatio: number
  readonly renewable: boolean
  readonly note: string
}

/**
 * Tank mass per kilogram of heaviness authority, for gas compression.
 *
 * @source Derived from a PRODUCTION vessel rather than a hoped-for one: the
 * first-generation Toyota Mirai carries 122 litres at 70 MPa in 87.5 kg of Type
 * IV COPV, which is a structural coefficient of 1.0246e-5 kg per joule of
 * stored pressure-volume energy.
 *
 * THE COUNTERINTUITIVE PART, and the reason the first version of this got it
 * wrong in the pessimistic direction: LOWER STORAGE PRESSURE IS BETTER. Tank
 * mass per unit of heaviness goes as C * P0 * (Z_tank / Z_cell), and hydrogen's
 * compressibility factor rises with pressure: 1.0 at ambient, 1.23 at 350 bar,
 * 1.47 at 700. So 17 bar costs 0.856 kg/kg, 350 bar costs 1.04 and 700 bar
 * costs 1.242. Storing at 250 bar with a hopeful gravimetric efficiency, which
 * is what this module did first, produced 1.42 kg/kg and made compression look
 * three times worse than it is.
 */
const COPV_MASS_PER_KILOGRAM_AT_17_BAR = 0.856

/**
 * What it costs to be able to change static heaviness by a given amount.
 *
 * THE COMPARISON THAT SETTLES COMPRESSION FOR THIS MISSION, and it is not the
 * one the first version of this module made. Compression is NOT forty times
 * heavier than water: at 0.856 kg per kg of authority it is slightly LIGHTER
 * than carrying the water would be, at 1.02.
 *
 * It loses on three other things instead, and each is decisive on its own:
 *
 *   RATE. A compressor moves 0.175 kg of heaviness per minute per kilowatt. A
 *   seawater pump at 20 m of head moves 214. That is 1,224 to one, and it is
 *   the difference between four and a half hours to shift a tonne and twenty
 *   seconds.
 *
 *   THE DISTURBANCE IS DIURNAL, NOT SECULAR. The permeation drift compression
 *   is imagined to correct is 1.1 kg of heaviness per day, which needs FOUR
 *   AND A HALF WATTS. The real disturbance is the diurnal thermal swing, which
 *   the thermal model computes at 18.4 K and about 2,280 kg (it was written
 *   here as a flat 20 K and 2,383 kg, back when the superheat was asserted
 *   rather than solved), and the cheapest answer to that is not a compressor:
 *   it
 *   is a lower fill fraction, which costs gross lift and no energy, no mass and
 *   no failure mode.
 *
 *   THE VEHICLE LANDS ON WATER. The moment it touches down it has unlimited
 *   free ballast, which is precisely the case COSH exists to solve on a cargo
 *   airship that has no such option.
 *
 * @param authority Lift change required, kg.
 * @param carried True when the ballast must be carried rather than taken on in
 *   flight. Over an ocean it is not; over a desert it is, and that is the whole
 *   argument for compression.
 */
export const buoyancyControlCost = (
  control: BuoyancyControl,
  authority: number,
  species: 'hydrogen' | 'helium',
  carried = false,
): BuoyancyControlCost => {
  switch (control) {
    case 'water-ballast': {
      /** @source Water at 1000 kg/m3, in a tank of about 30 kg per m3 of capacity. */
      const TANK_MASS_PER_CUBIC_METRE = 30
      const WATER_DENSITY = 1000
      const tankVolume = authority / WATER_DENSITY
      const systemMass = tankVolume * TANK_MASS_PER_CUBIC_METRE + (carried ? authority : 0)
      /**
       * @derived Pumping seawater aboard from 20 m of head costs rho*g*h per
       * cubic metre at pump efficiency, which is 287 J per kg. It rounds to
       * nothing against a compressor's 343 kJ.
       */
      const energyPerKilogram = 287
      /** @source 214 kg per minute per kW at 20 m head and 70 percent pump efficiency. */
      const ratePerKilowatt = 214
      return {
        systemMass,
        energyPerKilogram,
        ratePerKilowatt,
        massRatio: systemMass / authority,
        renewable: true,
        note: carried
          ? `${authority.toFixed(0)} kg of water in ${tankVolume.toFixed(1)} m3 of tankage, carried. Over land the ballast has to come along, and then it is the water itself that costs, not the tank.`
          : `${tankVolume.toFixed(1)} m3 of tankage at ${systemMass.toFixed(0)} kg, and the water is taken on from the sea. Unlimited, free, and the same water the electrolyzer and the crew already use. ${ratePerKilowatt} kg per minute per kilowatt of pump.`,
      }
    }

    case 'ballonet-air': {
      /**
       * @derived Air ballast changes lift by displacing lifting gas rather than
       * by adding mass, so the authority is hard-limited to the ballonet volume
       * times the specific lift. Fan work is the pressure rise times the volume:
       * at 500 Pa and 1.14 kg of lift per m3 that is 440 J per kg.
       */
      const energyPerKilogram = 440
      /** @source A ballonet fan and its ducting. */
      const systemMass = 60
      /** @derived A fan moving 1 m3/s at 500 Pa shifts 1.14 kg of lift per second. */
      const ratePerKilowatt = 137
      return {
        systemMass,
        energyPerKilogram,
        ratePerKilowatt,
        massRatio: systemMass / authority,
        renewable: true,
        note: 'A fan and a valve. Almost free, fast, and hard-limited to the ballonet volume, so it trims rather than lifts. It cannot make the vehicle heavy enough to sit on the ground.',
      }
    }

    case 'gas-compression': {
      // FROM THE DATA PACKAGE, NOT FROM LITERALS HERE. These were four numbers
      // written into the model tier: two molar masses, two densities and the
      // gas constant. The densities in particular were the same 0.0852 and
      // 0.1691 that appeared in the fuel module, so the same physical quantity
      // was stated in two files and could drift between them.
      const molarMass = MOLAR_MASS[species].value
      /** @derived Ideal gas at ISA sea level: rho = rho_air * M_gas / M_air. */
      const gasDensity =
        v(ISA.seaLevelDensity) * (molarMass / MOLAR_MASS.dryAir.value)
      const R = v(CONSTANTS.R)
      /** @source 20 C, the temperature an intercooler returns the gas to. */
      const T = 293.15
      /**
       * @source 17 bar rather than 250. A rotary screw compressor reaches 250
       * psig in one stage, and hydrogen's compressibility makes higher pressure
       * WORSE per kilogram of authority, so there is no reason to go higher.
       */
      const pressureRatio = 17
      const workPerKilogramOfGas = (R * T * Math.log(pressureRatio)) / molarMass
      /** @source Multi-stage intercooled compressors reach about 68 percent of isentropic. */
      const compressorEfficiency = 0.68
      /** @source ISA sea level air density, against which the gas lifts. */
      const AIR_DENSITY = v(ISA.seaLevelDensity)
      const liftPerKilogramOfGas = (1 / gasDensity) * (AIR_DENSITY - gasDensity)
      const energyPerKilogram =
        workPerKilogramOfGas / compressorEfficiency / liftPerKilogramOfGas

      /**
       * @derived The COPV coefficient is calibrated on hydrogen. Helium stores
       * more mass per unit of pressure-volume energy because it is denser, so
       * the tank is heavier per kilogram of lift released by the same factor.
       */
      // The SECOND copy of this literal in the same file, which is how these
      // survive: one gets found and fixed and its twin forty lines down does
      // not. Derived from the same expression as `gasDensity` above.
      const hydrogenDensity =
        v(ISA.seaLevelDensity) * (MOLAR_MASS.hydrogen.value / MOLAR_MASS.dryAir.value)
      const scale = species === 'hydrogen' ? 1 : gasDensity / hydrogenDensity
      const tankMass = authority * COPV_MASS_PER_KILOGRAM_AT_17_BAR * scale
      /**
       * @source Aeros publishes no COSH machinery mass at all: not in the
       * patent, not on the site, nowhere. This is a placeholder for a compressor
       * and its drive and it is the largest unquantified hole in this branch.
       */
      const COMPRESSOR_MASS = 120
      const systemMass = tankMass + COMPRESSOR_MASS

      /** @derived 60 seconds over the specific work, per kilowatt. */
      const ratePerKilowatt = 60000 / energyPerKilogram

      return {
        systemMass,
        energyPerKilogram,
        ratePerKilowatt,
        massRatio: systemMass / authority,
        renewable: false,
        note: `${tankMass.toFixed(0)} kg of Type IV composite vessel at 17 bar, plus a compressor whose mass nobody has published. It never runs out, which is the argument for it. It moves ${ratePerKilowatt.toFixed(2)} kg per minute per kilowatt against a seawater pump's 214, so shifting a tonne takes hours rather than seconds.`,
      }
    }
  }
}

/**
 * Fill fraction that absorbs a superheat swing without any machinery at all.
 *
 * THE ANSWER THAT BEATS EVERY BUOYANCY CONTROL SYSTEM FOR THE DIURNAL CASE, and
 * it has no moving parts, no energy cost and no failure mode.
 *
 * A partially full cell expands freely, so superheat costs volume rather than
 * pressure. Leave enough room at fill and the day's expansion simply fills it,
 * with no valving and no compression. The price is gross lift: the cells are
 * smaller all the time to be safe some of the time.
 *
 * For the baseline that is 0.85 down to about 0.77, which costs a few percent of
 * gross lift and answers the roughly 2,280 kg swing that a compressor would need two
 * tonnes of tankage and 28 kW to fight.
 *
 * @param designSuperheat K.
 * @param currentFillFraction The fill fraction before the allowance.
 */
export const fillFractionForSuperheat = (
  designSuperheat: number,
  currentFillFraction: number,
  /** @source ISA sea level temperature. */
  ambientTemperature = v(ISA.seaLevelTemperature),
): { fillFraction: number; liftGivenUp: number } => {
  const expansion = designSuperheat / ambientTemperature
  const fillFraction = currentFillFraction / (1 + expansion)
  return { fillFraction, liftGivenUp: currentFillFraction - fillFraction }
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
