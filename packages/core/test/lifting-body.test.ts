import { describe, expect, it } from 'vitest'

import {
  diaphragmArea,
  stationKeepingPower,
  hullLift,
  hybridLiftPenalty,
  liftCurveSlope,
  liftingBodyGeometry,
  minimumFlyingSpeed,
} from '../src/index.js'
import { m, rad } from '@airship/units'

/**
 * The hybrid-lift case, calibrated on the one hybrid-lift vehicle that has flown.
 *
 * Airlander 10: 98 m by 50 m by 30 m, three lobes, 38,000 m3, 20,000 kg gross,
 * 33,285 kg maximum takeoff. Every geometric figure here is checked against
 * those, because a hybrid-lift model that cannot reproduce the only real one is not a
 * model.
 */

const AIRLANDER = liftingBodyGeometry(m(98), m(50), m(30), 3)

describe('the Airlander as the calibration case', () => {
  it('reproduces the published 38,000 m3 envelope', () => {
    expect(AIRLANDER.volume).toBeCloseTo(38000, -2)
  })

  it('has the aspect ratio the planform implies', () => {
    // 4B / (pi L) for an elliptical planform.
    expect(AIRLANDER.aspectRatio).toBeCloseTo((4 * 50) / (Math.PI * 98), 3)
    expect(AIRLANDER.aspectRatio).toBeCloseTo(0.65, 2)
  })

  it('does NOT treat the hull as an ellipsoid of its bounding box', () => {
    // The error this replaced. pi/6 * 98 * 50 * 30 is 76,969 m3, twice the
    // published envelope, and every downstream figure inherits it.
    const boundingEllipsoid = (Math.PI / 6) * 98 * 50 * 30
    expect(AIRLANDER.volume).toBeLessThan(boundingEllipsoid * 0.6)
  })

  it('carries far more skin per unit volume than a body of revolution', () => {
    // The quiet cost of hybrid-lift, and it is paid every day: cover mass, film
    // mass, permeating area and friction drag all scale with this.
    expect(AIRLANDER.wettedAreaCoefficient).toBeGreaterThan(8)
    expect(AIRLANDER.wettedAreaCoefficient).toBeGreaterThan(5.4 * 1.4)
  })

  it('degenerates to an ellipsoid at one lobe', () => {
    const single = liftingBodyGeometry(m(98), m(50), m(30), 1)
    expect(single.volume).toBeCloseTo((Math.PI / 6) * 98 * 50 * 30, -1)
    expect(single.wettedAreaCoefficient).toBeLessThan(AIRLANDER.wettedAreaCoefficient)
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
    // calibration. This is the number that kills hybrid-lift for a
    // station-keeper: the whole benefit is gone at loiter.
    const loiter = 0.5 * 1.225 * 10.29 * 10.29
    const lift = hullLift(AIRLANDER, rad((12 * Math.PI) / 180), loiter).lift
    expect(lift / 9.80665 / 33285).toBeGreaterThan(0.03)
    expect(lift / 9.80665 / 33285).toBeLessThan(0.08)
  })

  it('achieves about a third of what a thin wing of the same aspect ratio would', () => {
    // A hull is a thick body, not a lifting surface. Using the thin-wing slope
    // flattered hybrid-lift by a factor of three.
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
    // that decides whether hybrid-lift can be afforded.
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

describe('what hybrid-lift costs a station-keeping vehicle', () => {
  const OURS = liftingBodyGeometry(m(115), m(58), m(27), 3)

  it('adds most of a hull worth of extra skin for the same gas', () => {
    const penalty = hybridLiftPenalty(OURS, 5.4, 0.53, 4000, 1.0065)
    expect(penalty.wettedAreaPenalty).toBeGreaterThan(0.5)
    expect(penalty.skinMassPenalty).toBeGreaterThan(1000)
  })

  it('says plainly that a heavy hybrid-lift vehicle cannot hold station', () => {
    const penalty = hybridLiftPenalty(OURS, 5.4, 0.53, 4000, 1.0065)
    expect(penalty.canHover).toBe(false)
    expect(penalty.minimumFlyingSpeed).toBeGreaterThan(5)
    expect(penalty.verdict).toContain('or descend')
  })

  it('still charges the skin penalty when flown neutrally buoyant', () => {
    // The trap in the hybrid-lift argument: fly it neutral and you have paid for a
    // lifting body and are using it as a worse airship.
    const penalty = hybridLiftPenalty(OURS, 5.4, 0.53, 0, 1.0065)
    expect(penalty.canHover).toBe(true)
    expect(penalty.skinMassPenalty).toBeGreaterThan(1000)
    expect(penalty.verdict).toContain('still paid every day')
  })
})
