import { describe, expect, it } from 'vitest'
import { kgPerM3, m3 } from '@airship/units'
import {
  addedMassMatrix,
  inertiaCoefficients,
  munkMoment,
  pendulumPeriod,
} from '../src/dynamics/added-mass.js'

/**
 * VALIDATION: Lamb's inertia coefficients, checked two independent ways.
 *
 * The sphere limit is the strong one. It is not a curve fit or a published
 * table lookup, it is a closed-form classical result: a sphere accelerating in
 * an ideal fluid carries added mass equal to HALF the fluid it displaces, and a
 * sphere rotating carries none at all. Any implementation that misses those two
 * limits is wrong regardless of what it does at fineness ratio 5.
 */
describe('validation: Lamb inertia coefficients', () => {
  it('converges to the sphere limit of exactly one half', () => {
    const nearSphere = inertiaCoefficients(1.0001)
    expect(nearSphere.k1).toBeCloseTo(0.5, 3)
    expect(nearSphere.k2).toBeCloseTo(0.5, 3)
  })

  it('a rotating sphere carries no added inertia at all', () => {
    expect(inertiaCoefficients(1.0001).kPrime).toBeCloseTo(0, 4)
  })

  it('matches published airship values at fineness ratio 5', () => {
    // Airship practice quotes roughly k1 = 0.06 and k2 = 0.90.
    const c = inertiaCoefficients(5)
    expect(c.k1).toBeCloseTo(0.059, 3)
    expect(c.k2).toBeCloseTo(0.894, 3)
  })

  /**
   * A DOCUMENTED DISAGREEMENT, asserted so it cannot be silently lost.
   *
   * The brief states k' is roughly 0.66 at fineness ratio 5. The implemented
   * form gives 0.700. It is kept because it satisfies the sphere limit, which
   * the alternative arrangement of the same terms fails by orders of magnitude.
   * The gap is recorded rather than tuned away.
   */
  it('gives k-prime of 0.700 at fineness 5, against the brief stated 0.66', () => {
    const kPrime = inertiaCoefficients(5).kPrime
    expect(kPrime).toBeCloseTo(0.7, 2)
    expect(Math.abs(kPrime / 0.66 - 1)).toBeGreaterThan(0.03)
    expect(Math.abs(kPrime / 0.66 - 1)).toBeLessThan(0.1)
  })

  it('axial resistance falls and transverse rises as the hull gets more slender', () => {
    // The physical statement: a slender body slips through the air lengthwise
    // and pushes a wall of it broadside.
    for (const [finer, coarser] of [
      [7, 3],
      [5, 4],
    ] as const) {
      expect(inertiaCoefficients(finer).k1).toBeLessThan(inertiaCoefficients(coarser).k1)
      expect(inertiaCoefficients(finer).k2).toBeGreaterThan(inertiaCoefficients(coarser).k2)
    }
  })

  it('refuses a fineness ratio at or below one', () => {
    expect(() => inertiaCoefficients(1)).toThrow(RangeError)
    expect(() => inertiaCoefficients(0.5)).toThrow(RangeError)
  })
})

describe('the added mass matrix', () => {
  const volume = m3(15803)
  const density = kgPerM3(1.225)
  const displaced = 15803 * 1.225

  it('nearly doubles the effective mass in sway and heave', () => {
    // The reason this module is mandatory. The ship masses about 18 t and the
    // air it has to shove sideways is about 17 t.
    const added = addedMassMatrix(volume, 5, density, 20)
    expect(added.sway / displaced).toBeCloseTo(0.894, 2)
    expect(added.sway).toBeGreaterThan(15000)
    expect(added.heave).toBeCloseTo(added.sway, 6)
  })

  it('costs almost nothing axially', () => {
    const added = addedMassMatrix(volume, 5, density, 20)
    expect(added.surge / displaced).toBeCloseTo(0.059, 2)
    expect(added.surge).toBeLessThan(added.sway / 10)
  })

  it('is exactly zero in roll for a body of revolution', () => {
    // A body of revolution spinning about its own axis in ideal flow moves no
    // fluid. Real roll damping comes from fins and viscosity, not from here,
    // and a model that put a number in this slot would be double counting.
    expect(addedMassMatrix(volume, 5, density, 20).roll).toBe(0)
  })

  it('shares one coefficient between pitch and yaw, by symmetry', () => {
    const added = addedMassMatrix(volume, 5, density, 20)
    expect(added.pitch).toBeCloseTo(added.yaw, 6)
  })
})

/**
 * The Munk moment, which is why fins exist.
 */
describe('the bare hull is unstable, and the Munk moment is why', () => {
  const volume = m3(15803)
  const density = kgPerM3(1.225)

  it('is destabilising: positive angle of attack gives a positive moment', () => {
    // The couple acts to INCREASE the angle of attack. An airship without fins
    // cannot be flown.
    expect(munkMoment(volume, 5, density, 15, 0.1)).toBeGreaterThan(0)
    expect(munkMoment(volume, 5, density, 15, -0.1)).toBeLessThan(0)
  })

  it('vanishes at zero and at ninety degrees, and peaks at forty five', () => {
    // The signature of the sin(2 alpha) form.
    expect(munkMoment(volume, 5, density, 15, 0)).toBeCloseTo(0, 9)
    expect(Math.abs(munkMoment(volume, 5, density, 15, Math.PI / 2))).toBeLessThan(1e-9)

    const peak = munkMoment(volume, 5, density, 15, Math.PI / 4)
    expect(peak).toBeGreaterThan(munkMoment(volume, 5, density, 15, Math.PI / 8))
    expect(peak).toBeGreaterThan(munkMoment(volume, 5, density, 15, (3 * Math.PI) / 8))
  })

  it('grows with the square of speed', () => {
    const slow = munkMoment(volume, 5, density, 10, 0.2)
    const fast = munkMoment(volume, 5, density, 20, 0.2)
    expect(fast / slow).toBeCloseTo(4, 6)
  })

  it('is larger for a more slender hull, because k2 minus k1 grows', () => {
    // The trade the explicit implementation makes visible: the same term that
    // makes a slender hull sluggish in sway makes it more unstable in yaw, so
    // the two cannot be traded independently.
    const stubby = munkMoment(volume, 3, density, 15, 0.2)
    const slender = munkMoment(volume, 7, density, 15, 0.2)
    expect(slender).toBeGreaterThan(stubby)
  })

  it('is large enough at cruise to need real fin authority', () => {
    // Hundreds of kilonewton metres at a few degrees of yaw on a 15,800 m3 hull.
    expect(munkMoment(volume, 5, density, 15, 0.087)).toBeGreaterThan(3e5)
  })
})

describe('the CG-below-CB pendulum', () => {
  it('gives a slow swing of tens of seconds, which is the signature behaviour', () => {
    // 18 t of lift, 12 m of buoyancy-to-gravity separation, and a pitch inertia
    // of about 12 million kg m2 including added mass.
    const period = pendulumPeriod(18015, 12, 12e6)
    expect(period).toBeGreaterThan(10)
    expect(period).toBeLessThan(60)
  })

  it('added mass lengthens the period, which is another reason it is not optional', () => {
    const withoutAdded = pendulumPeriod(18015, 12, 8e6)
    const withAdded = pendulumPeriod(18015, 12, 14e6)
    expect(withAdded).toBeGreaterThan(withoutAdded)
  })

  it('a larger separation stiffens the pendulum and shortens the period', () => {
    expect(pendulumPeriod(18015, 16, 12e6)).toBeLessThan(pendulumPeriod(18015, 8, 12e6))
  })

  it('refuses an inverted pendulum rather than returning a number', () => {
    // There is no oscillation period for a divergence, and returning NaN or a
    // large number would let a caller carry on as though there were.
    expect(() => pendulumPeriod(18015, 0, 12e6)).toThrow(RangeError)
    expect(() => pendulumPeriod(18015, -2, 12e6)).toThrow(RangeError)
  })
})
