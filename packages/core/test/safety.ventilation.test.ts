import { describe, expect, it } from 'vitest'
import { HYDROGEN_SAFETY, barrierFilm, v } from '@airship/data'
import { m, m3, purity as asPurity } from '@airship/units'
import { atmosphere } from '../src/atmosphere.js'
import { hullGeometry } from '../src/geometry/hull.js'
import { cellFilmArea, permeationRates } from '../src/permeation.js'
import {
  airChangesPerHour,
  assessConfinement,
  buoyantClearanceTime,
  criticalDuctDiameter,
  equipmentGroup,
  inertingOxygenTarget,
  requiredVentilationFlow,
} from '../src/safety/ventilation.js'

const hull = hullGeometry(m(90), 5)
const seaLevel = atmosphere(m(0))

/**
 * THE DESIGN RULE THAT COSTS NOTHING AT THE DRAWING STAGE AND IS IMPOSSIBLE TO
 * RETROFIT.
 */
describe('confinement: a 200 mm duct is a detonation launcher', () => {
  it('the critical tube diameter for hydrogen is about 195 mm', () => {
    const critical = criticalDuctDiameter()
    expect(critical).toBeGreaterThan(0.15)
    expect(critical).toBeLessThan(0.25)
  })

  it('methane intuition is off by more than an order of magnitude', () => {
    // Methane's cell size is 330 mm, so its critical diameter is about 4.3 m.
    // Anyone reasoning from natural gas experience will believe a 300 mm trunk
    // is obviously safe. For hydrogen it is not.
    const methaneCritical = v(HYDROGEN_SAFETY.criticalTubeDiameterRatio) * 0.33
    expect(methaneCritical / criticalDuctDiameter()).toBeGreaterThan(15)
  })

  it('a narrow run is safe because a detonation cannot exit it', () => {
    const verdict = assessConfinement(m(0.1), m(40), false)
    expect(verdict.safe).toBe(true)
    expect(verdict.reason).toContain('critical tube diameter')
  })

  it('a short run is safe because a deflagration cannot develop', () => {
    const verdict = assessConfinement(m(0.4), m(5), false)
    expect(verdict.safe).toBe(true)
    expect(verdict.reason).toContain('run-up')
  })

  it('an open run is safe because the gas never accumulates', () => {
    const verdict = assessConfinement(m(0.8), m(60), true)
    expect(verdict.safe).toBe(true)
    expect(verdict.reason).toContain('free stream')
  })

  it('a wide long closed run is NOT safe, and says why', () => {
    // A keel walkway is exactly this geometry, which is why the keel has to be
    // ventilated to the free stream rather than merely inspected.
    const verdict = assessConfinement(m(0.9), m(60), false)
    expect(verdict.safe).toBe(false)
    expect(verdict.reason).toContain('detonation')
  })

  it('never reports safe without a reason', () => {
    // A verdict that cannot be reviewed cannot survive a design change.
    for (const [d, l, open] of [
      [0.1, 40, false],
      [0.4, 5, false],
      [0.8, 60, true],
      [0.9, 60, false],
    ] as const) {
      expect(assessConfinement(m(d), m(l), open).reason.length).toBeGreaterThan(40)
    }
  })
})

/**
 * Ordinary flame arrestors do not work, and the number that says so is MESG
 * rather than the quenching distance the brief cites.
 */
describe('equipment must be Group IIC, which is a purchasing constraint', () => {
  it('hydrogen falls in the strictest group', () => {
    expect(equipmentGroup()).toBe('IIC')
  })

  it('because its safe gap is well under the group threshold', () => {
    expect(v(HYDROGEN_SAFETY.maximumExperimentalSafeGap)).toBeLessThan(
      v(HYDROGEN_SAFETY.groupIICThreshold),
    )
  })

  it('and methane, which most equipment is rated for, is nearly four times wider', () => {
    // 1.16 mm against 0.30 mm. Off-the-shelf IIA gear does not contain a
    // hydrogen flame.
    const methaneMesg = 1.16e-3
    expect(methaneMesg / v(HYDROGEN_SAFETY.maximumExperimentalSafeGap)).toBeGreaterThan(3.5)
  })
})

describe('ventilating the interstitial space', () => {
  /**
   * The ventilation rate driven by the leak the permeation model actually
   * predicts, which is the point of having both modules.
   */
  const film = barrierFilm('para-aramid-mylar-laminate')
  const filmArea = cellFilmArea(hull.wettedArea, hull.volume, hull.length, 12)
  const leak = permeationRates(film, filmArea, seaLevel.pressure, {
    species: 'hydrogen',
    purity: asPurity(0.99),
  })

  it('permeation alone needs only a modest flow', () => {
    const flow = requiredVentilationFlow(leak.hydrogenLoss)
    expect(flow).toBeGreaterThan(0)
    // Cubic metres per second, not per minute: a small fan.
    expect(flow).toBeLessThan(1)
  })

  it('but a design leak two orders of magnitude larger drives the fan size', () => {
    // Permeation is the rate you know about. A chafed cell is the one that
    // matters, and R101 is the precedent.
    const design = requiredVentilationFlow(leak.hydrogenLoss * 100)
    expect(design / requiredVentilationFlow(leak.hydrogenLoss)).toBeCloseTo(100, 0)
  })

  it('scales linearly with leak rate, as the dilution formula requires', () => {
    expect(requiredVentilationFlow(2e-6) / requiredVentilationFlow(1e-6)).toBeCloseTo(2, 6)
  })

  it('reports air changes per hour for a given interstitial volume', () => {
    const interstitial = m3(hull.volume * 0.05)
    const changes = airChangesPerHour(requiredVentilationFlow(leak.hydrogenLoss * 100), interstitial)
    expect(changes).toBeGreaterThan(0)
  })

  it('the dilution target sits an order of magnitude below the detonation threshold', () => {
    // Deliberate. The ventilation target protects against ignition; the margin
    // to detonation is the second line, not the first.
    const target = 0.25 * v(HYDROGEN_SAFETY.lowerFlammabilityLimit)
    expect(target).toBeLessThan(v(HYDROGEN_SAFETY.ddtConcentrationThreshold) / 10)
  })
})

/**
 * The one thing hydrogen is better at, and the entire basis of the safety case.
 */
describe('dispersion is the safety case', () => {
  it('an unconfined leak clears the hull height in seconds', () => {
    expect(buoyantClearanceTime(hull.maxDiameter)).toBeLessThan(10)
  })

  it('hydrogen is fourteen times more buoyant in air than methane is twice', () => {
    expect(v(HYDROGEN_SAFETY.buoyancyRatioInAir)).toBeGreaterThan(14)
  })

  it('and diffuses three times faster', () => {
    const methaneDiffusion = 2e-5
    expect(v(HYDROGEN_SAFETY.diffusionCoefficientInAir) / methaneDiffusion).toBeGreaterThan(2.5)
  })

  it('which is why eliminating confinement is the design rule, not adding barriers', () => {
    // Every other property is worse than methane. This one is better and it is
    // the only one, so the safety case has to be built entirely on it.
    expect(v(HYDROGEN_SAFETY.minimumIgnitionEnergy)).toBeLessThan(2.9e-4 / 10)
    expect(v(HYDROGEN_SAFETY.laminarBurningVelocity)).toBeGreaterThan(0.41 * 5)
  })
})

describe('inerting is not free', () => {
  it('has a quantitative oxygen target', () => {
    expect(inertingOxygenTarget()).toBeCloseTo(0.05, 3)
  })

  it('and the permeation module charges for it in lost purity', () => {
    // Raising the nitrogen partial pressure outside the cells raises the inward
    // leak that destroys lift. The safety case does not get to be free.
    const film = barrierFilm('para-aramid-mylar-laminate')
    const area = cellFilmArea(hull.wettedArea, hull.volume, hull.length, 12)
    const contents = { species: 'hydrogen' as const, purity: asPurity(0.99) }
    const inAir = permeationRates(film, area, seaLevel.pressure, contents, 0.7808)
    const inerted = permeationRates(film, area, seaLevel.pressure, contents, 1.0)
    expect(inerted.airMolesIn).toBeGreaterThan(inAir.airMolesIn)
  })
})

/**
 * Direct detonation is not a credible initiating event, and it is worth
 * recording why, because it is the one piece of genuinely good news.
 */
describe('direct detonation needs energy nothing aboard can deliver', () => {
  it('four megajoules, against a spark of seventeen microjoules to merely ignite', () => {
    const ratio =
      v(HYDROGEN_SAFETY.directDetonationIgnitionEnergy) / v(HYDROGEN_SAFETY.minimumIgnitionEnergy)
    expect(ratio).toBeGreaterThan(1e10)
  })

  it('so the real threat is transition from a deflagration, which needs confinement', () => {
    // Which is why the geometric rules above are the whole mitigation.
    expect(v(HYDROGEN_SAFETY.ddtConcentrationThreshold)).toBeGreaterThan(
      v(HYDROGEN_SAFETY.lowerFlammabilityLimit) * 2,
    )
  })
})
