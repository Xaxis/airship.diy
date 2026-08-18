import { describe, expect, it } from 'vitest'

import {
  diaphragmArea,
  stationKeepingPower,
  hullLift,
  hybridLiftPenalty,
  liftCurveSlope,
  liftingBodyGeometry,
  minimumFlyingSpeed,
  MINIMUM_LOBED_SECTION_FULLNESS,
  CONVENTIONAL_PRISMATIC_COEFFICIENT,
  hullGeometry,
  hullShapeForPrismatic,
} from '../src/index.js'
import { AIRLANDER_DIMENSIONS } from '@airship/data'
import { m, rad } from '@airship/units'

/**
 * The hybridLift case, calibrated on the one hybridLift vehicle that has flown.
 *
 * THE DIMENSIONS USED TO BE 98 BY 50 BY 30 AND THAT VEHICLE DOES NOT EXIST.
 * 98 m is the English Wikipedia length against 91 m in the HAV 304 spec table
 * and 92 m in the German article; 50 m is a "wingspan" row, almost certainly fin
 * tip to fin tip, against hull beams quoted at 34, 42 and 43.5; and 30 m is a
 * height that evidently includes the fins and the gondola. Mixing rows from two
 * configurations produced a volume coefficient of 0.2585, which is GEOMETRICALLY
 * IMPOSSIBLE: no union of equal circles has a section fullness below pi/4, so a
 * trilobe at a prismatic coefficient of 0.69 cannot go below 0.542.
 *
 * The hull is taken here as 92 by 42, with the height following from the
 * published 38,000 m3 rather than being asserted. AIRLANDER_DIMENSION_DISCREPANCY
 * records the spread instead of hiding it.
 */

/** @derived Hull height from the published volume at the corrected coefficient. */
const AIRLANDER_HEIGHT = 38000 / (0.587 * 92 * 42)
const AIRLANDER = liftingBodyGeometry(m(92), m(42), m(AIRLANDER_HEIGHT), 3)

describe('the Airlander as the calibration case', () => {
  it('reproduces the published 38,000 m3 envelope', () => {
    expect(AIRLANDER.volume).toBeCloseTo(38000, -2)
  })

  it('has the aspect ratio the planform implies', () => {
    // 4B / (pi L) for an elliptical planform.
    expect(AIRLANDER.aspectRatio).toBeCloseTo((4 * 42) / (Math.PI * 92), 3)
  })

  it('respects the geometric floor on section fullness', () => {
    // THE CHECK THAT WOULD HAVE CAUGHT THE ORIGINAL ERROR. Both limiting cases
    // of a union of equal circles, tangent and fully merged, give exactly pi/4,
    // and every overlap in between is fuller. A lobed hull below that floor has
    // a dimension that is not what it claims to be.
    const fullness = AIRLANDER.volume / (92 * 42 * AIRLANDER_HEIGHT)
    expect(fullness).toBeGreaterThan(MINIMUM_LOBED_SECTION_FULLNESS * 0.69)
  })

  it('records the published dimensions that disagree rather than picking one', () => {
    // Taking the smallest of each is the choice that flatters every derived
    // coefficient, which is why the spread is written down.
    expect(AIRLANDER_DIMENSIONS.lengthQuoted.length).toBeGreaterThan(2)
    expect(AIRLANDER_DIMENSIONS.beamQuoted.length).toBeGreaterThan(2)
  })

  it('carries a real skin penalty, an order smaller than the 63 percent claimed', () => {
    // THE CORRECTION THAT MATTERS MOST, and it has now been made twice. At the
    // bad dimensions a lobed hull came out 63 percent worse than a body of
    // revolution, and that penalty was the architecture chapter's central
    // argument against hybridLift. Correcting the volume coefficient alone
    // swung it to "a few percent", which was equally unfounded, because the
    // wetted area had its own error pushing the other way.
    //
    // This asserts the penalty against a COMPUTED equal-volume body of
    // revolution rather than a bare band, so it cannot be tuned into agreement
    // with whatever the module currently says.
    const penaltyAt = (fineness: number) => {
      const diameter = Math.cbrt(
        AIRLANDER.volume / (CONVENTIONAL_PRISMATIC_COEFFICIENT * (Math.PI / 4) * fineness),
      )
      const revolution = hullGeometry(
        m(fineness * diameter),
        fineness,
        hullShapeForPrismatic(CONVENTIONAL_PRISMATIC_COEFFICIENT),
      )
      const coefficient = revolution.wettedArea / revolution.volume ** (2 / 3)
      return AIRLANDER.wettedAreaCoefficient / coefficient - 1
    }

    // Against the fineness ratio this project's own hull uses, 11 percent.
    expect(penaltyAt(5)).toBeGreaterThan(0.09)
    expect(penaltyAt(5)).toBeLessThan(0.13)

    // The comparison is genuinely fineness-dependent, which is why quoting one
    // number without saying what it is against is how 63 percent survived. A
    // stubby body of revolution is worse and a slender one is no better.
    expect(penaltyAt(4)).toBeGreaterThan(penaltyAt(5))
    expect(penaltyAt(7)).toBeLessThan(0.02)

    // And nowhere near the figure the architecture chapter turned on.
    expect(penaltyAt(4)).toBeLessThan(0.63 / 3)
  })

  it('degenerates to an ellipsoid at one lobe', () => {
    const single = liftingBodyGeometry(m(92), m(42), m(AIRLANDER_HEIGHT), 1)
    expect(single.volume).toBeCloseTo((Math.PI / 6) * 92 * 42 * AIRLANDER_HEIGHT, -1)
  })

  it('charges for the diaphragms between the lobes', () => {
    expect(diaphragmArea(AIRLANDER, 3)).toBeGreaterThan(0)
    expect(diaphragmArea(AIRLANDER, 1)).toBe(0)
  })
})

describe('the lift curve slope', () => {
  it('approaches 2 pi at high aspect ratio', () => {
    expect(liftCurveSlope(1000)).toBeCloseTo(2 * Math.PI, 1)
  })

  it('approaches Jones slender wing theory at low aspect ratio', () => {
    // pi * AR / 2.
    expect(liftCurveSlope(0.05)).toBeCloseTo((Math.PI * 0.05) / 2, 3)
  })

  it('makes a lifting-body hull about a sixth as effective as a wing', () => {
    const ratio = liftCurveSlope(AIRLANDER.aspectRatio) / (2 * Math.PI)
    expect(ratio).toBeGreaterThan(0.1)
    expect(ratio).toBeLessThan(0.2)
  })
})

describe('hull lift', () => {
  const q = 0.5 * 1.225 * 28 * 28

  it('is zero at zero incidence, and that is the whole problem', () => {
    expect(hullLift(AIRLANDER, rad(0), q).lift).toBe(0)
  })

  it('grows faster than linearly, because of the vortex term', () => {
    const four = hullLift(AIRLANDER, rad((4 * Math.PI) / 180), q).liftCoefficient
    const eight = hullLift(AIRLANDER, rad((8 * Math.PI) / 180), q).liftCoefficient
    expect(eight / four).toBeGreaterThan(2)
  })

  it('reproduces the AAIB figure of 40 percent of weight at cruise', () => {
    // THE CALIBRATION, and it is checked rather than asserted. 28 m/s and 12
    // degrees should give about 40 percent of the Airlander's 33,285 kg MTOW.
    const lift = hullLift(AIRLANDER, rad((12 * Math.PI) / 180), q).lift
    expect(lift / 9.80665 / 33285).toBeGreaterThan(0.33)
    expect(lift / 9.80665 / 33285).toBeLessThan(0.47)
  })

  it('reproduces 5 percent of weight at the vehicle\'s own loiter speed', () => {
    // The SAME coefficient, at 20 knots. Lift goes as the square of speed, so
    // one calibration has to satisfy both conditions or it is not a
    // calibration. This is the number that kills hybridLift for a
    // station-keeper: the whole benefit is gone at loiter.
    const loiter = 0.5 * 1.225 * 10.29 * 10.29
    const lift = hullLift(AIRLANDER, rad((12 * Math.PI) / 180), loiter).lift
    expect(lift / 9.80665 / 33285).toBeGreaterThan(0.03)
    expect(lift / 9.80665 / 33285).toBeLessThan(0.08)
  })

  it('achieves about two fifths of what a thin wing of the same aspect ratio would', () => {
    // A hull is a thick body, not a lifting surface. Using the thin-wing slope
    // flattered hybridLift by a factor of three.
    const thinWing = liftCurveSlope(AIRLANDER.aspectRatio)
    const actual =
      hullLift(AIRLANDER, rad(0.01), 1).liftCoefficient / 0.01
    expect(actual / thinWing).toBeGreaterThan(0.2)
    expect(actual / thinWing).toBeLessThan(0.45)
  })

  it('uses the MEASURED induced drag law, not the elliptical ideal', () => {
    // CDi = 1.976 CL^2 on planform, from NACA TR-432 and NASA CR-137691. The
    // textbook CL^2/(pi AR e) with e near unity gives 0.516 CL^2 at this
    // aspect ratio, so the ideal is optimistic by a factor of 3.8 on the term
    // that decides whether hybridLift can be afforded.
    const at12 = hullLift(AIRLANDER, rad((12 * Math.PI) / 180), q)
    const ideal =
      (at12.liftCoefficient * at12.liftCoefficient) / (Math.PI * AIRLANDER.aspectRatio * 0.95)
    expect(at12.inducedDragCoefficient / ideal).toBeCloseTo(3.8, 0)
  })

  it('refuses to extrapolate past its validity range', () => {
    expect(() => hullLift(AIRLANDER, rad((30 * Math.PI) / 180), q)).toThrow(RangeError)
  })
})

describe('the minimum flying speed, which is the mission question', () => {
  it('is zero for a neutrally buoyant vehicle', () => {
    expect(minimumFlyingSpeed(AIRLANDER, 0, 1.225)).toBe(0)
  })

  it('rises as the square root of heaviness', () => {
    const light = minimumFlyingSpeed(AIRLANDER, 2000, 1.225)
    const heavy = minimumFlyingSpeed(AIRLANDER, 8000, 1.225)
    expect(heavy / light).toBeCloseTo(2, 1)
  })

  it('forces a real cruise on a vehicle carrying real heaviness', () => {
    // The Airlander at maximum takeoff weight is 13.3 t heavy and has to hold
    // this or come down. A station-keeping liveaboard cannot pay that bill for
    // a year: the power goes as the cube of it.
    const speed = minimumFlyingSpeed(AIRLANDER, 13285, 1.225)
    expect(speed).toBeGreaterThan(20)
    expect(speed).toBeLessThan(40)
  })

  it('costs an order of magnitude more power than flying neutrally buoyant', () => {
    // The comparison that settles it. 20 percent heavy on the baseline hull
    // needs a couple of hundred kilowatts continuously; the same hull neutrally
    // buoyant needs about ten to push against the same wind, and nothing at all
    // in still air.
    const OURS = liftingBodyGeometry(m(115), m(58), m(27), 3)
    const heavy = stationKeepingPower(OURS, 4900, 1.0065, 8)
    expect(heavy.heavyPower).toBeGreaterThan(150000)
    expect(heavy.ratio).toBeGreaterThan(10)
    const neutral = stationKeepingPower(OURS, 0, 1.0065, 8)
    expect(neutral.heavyPower).toBe(0)
    expect(neutral.buoyantPower).toBeLessThan(20000)
  })
})

describe('what hybridLift costs a station-keeping vehicle', () => {
  const OURS = liftingBodyGeometry(m(115), m(58), m(27), 3)

  it('adds only a few percent of extra skin, which is NOT why hybridLift loses', () => {
    // THIS TEST USED TO ASSERT A 50 PERCENT SKIN PENALTY and it was an artifact
    // of a bounding box built from a wingspan row and a height that included
    // the fins. A lobed hull carries a little more skin per unit volume than a
    // body of revolution at the same fineness and a little LESS than one at the
    // drag optimum. The argument against hybridLift has to be made on the lift
    // split and on power at low speed, and it survives being made there.
    const penalty = hybridLiftPenalty(OURS, 5.4, 0.53, 4000, 1.0065)
    expect(penalty.wettedAreaPenalty).toBeLessThan(0.2)
  })

  it('says plainly that a heavy hybridLift vehicle cannot hold station', () => {
    const penalty = hybridLiftPenalty(OURS, 5.4, 0.53, 4000, 1.0065)
    expect(penalty.canHover).toBe(false)
    expect(penalty.minimumFlyingSpeed).toBeGreaterThan(5)
    expect(penalty.verdict).toContain('or descend')
  })

  it('can hover when flown neutrally buoyant, which is the only way it stays up', () => {
    // The trap in the hybridLift argument is still real, it is just smaller
    // than this module used to claim: fly it neutral and you have paid for a
    // lifting body and are using it as an airship with a worse planform.
    const penalty = hybridLiftPenalty(OURS, 5.4, 0.53, 0, 1.0065)
    expect(penalty.canHover).toBe(true)
    expect(penalty.verdict).toContain('still paid every day')
  })
})
