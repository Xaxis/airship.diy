import { describe, expect, it } from 'vitest'
import { m } from '@airship/units'
import { crossSectionDistribution, hullGeometry } from '../src/geometry/hull.js'
import {
  buoyancyDistribution,
  requiredSectionModulus,
  ringSectionModulus,
  solveBeam,
} from '../src/structure/beam.js'
import type { DistributedLoad, PointLoad } from '../src/structure/beam.js'

const G0 = 9.80665
const LENGTH = 90
const FINENESS = 5
const SPECIFIC_LIFT = 1.1397

const hull = hullGeometry(m(LENGTH), FINENESS)
const sections = crossSectionDistribution(m(LENGTH), FINENESS, 201)
const buoyancy = buoyancyDistribution(sections, SPECIFIC_LIFT)

/**
 * Total buoyant force, integrated with the SAME trapezoidal rule over the SAME
 * stations that solveBeam uses.
 *
 * Deliberately not `hull.volume * specificLift * g`. The hull volume comes from
 * a 4000-panel Simpson integration and the beam sums 201 trapezoids, and the two
 * quadratures of the same hull differ by about 3e-5 relative. That is a fine
 * discrepancy to have between two independent calculations and a terrible one to
 * feed into a balance check, because it appears as a residual force the ship
 * does not actually have. Balance tests must integrate the way the thing under
 * test integrates.
 */
const stationWidth = (i: number): number => {
  const previous = sections[i - 1]
  const next = sections[i + 1]
  const here = sections[i]
  if (!here) return 0
  return (previous ? (here.x - previous.x) / 2 : 0) + (next ? (next.x - here.x) / 2 : 0)
}

const totalBuoyantForce = buoyancy.reduce((sum, station, i) => sum + station.buoyancy * stationWidth(i), 0)

/**
 * A weight distribution proportional to hull SURFACE area rather than volume.
 * This is realistic: cover and frame mass follows area, and it is exactly the
 * mismatch with a volume-proportional buoyancy that bends the ship.
 */
const surfaceProportionalWeight = (totalForce: number): DistributedLoad[] => {
  const radii = sections.map((s) => Math.sqrt(s.area / Math.PI))

  // Normalise against the same trapezoidal weighting, so that the distribution
  // integrates to exactly totalForce rather than approximately.
  const integral = radii.reduce((a, r, i) => a + r * stationWidth(i), 0)

  return sections.map((section, i) => ({
    x: section.x,
    buoyancy: buoyancy[i]?.buoyancy ?? 0,
    weight: ((radii[i] ?? 0) / integral) * totalForce,
  }))
}

describe('quadrature consistency', () => {
  /**
   * The two integrations of the same hull, compared explicitly.
   *
   * hullGeometry integrates volume with 4000-panel Simpson; the beam sums 201
   * trapezoids over the station list. They agree to about 3e-5, which is fine
   * as an independent cross-check and is fatal if the two are mixed inside one
   * force balance, because the difference shows up as a residual force the ship
   * does not have. This test exists so that a future change to either
   * quadrature announces itself here rather than as a mystery bending moment.
   */
  it('trapezoidal station integration agrees with the Simpson hull volume', () => {
    const trapezoidalVolume = sections.reduce((sum, station, i) => sum + station.area * stationWidth(i), 0)
    const error = Math.abs(trapezoidalVolume / hull.volume - 1)
    expect(error).toBeLessThan(1e-3)
    expect(error).toBeGreaterThan(0)
  })
})

describe('the hull as a beam', () => {
  it('shear and moment return to zero at the tail on a relieved free-free beam', () => {
    // The boundary condition a free-flying vehicle must satisfy. If this fails,
    // the inertial relief is wrong and every bending moment downstream is too.
    const loads = surfaceProportionalWeight(totalBuoyantForce * 0.5)
    const result = solveBeam(loads, [{ name: 'gondola', x: m(27), mass: 3000 }])

    const tail = result.stations[result.stations.length - 1]
    const scale = Math.abs(result.maximumMoment) || 1

    expect(Math.abs(tail?.shear ?? 0) / (Math.abs(result.maximumShear) || 1)).toBeLessThan(0.02)
    expect(Math.abs(tail?.moment ?? 0) / scale).toBeLessThan(0.02)
  })

  it('a perfectly matched weight and buoyancy distribution bends nothing', () => {
    // The degenerate case that proves the machinery is not manufacturing
    // moments out of its own discretisation.
    const matched: DistributedLoad[] = sections.map((section, i) => ({
      x: section.x,
      buoyancy: buoyancy[i]?.buoyancy ?? 0,
      weight: buoyancy[i]?.buoyancy ?? 0,
    }))

    const result = solveBeam(matched)
    const reference = totalBuoyantForce * LENGTH

    expect(Math.abs(result.maximumMoment) / reference).toBeLessThan(1e-6)
    expect(Math.abs(result.residualForce) / totalBuoyantForce).toBeLessThan(1e-9)
  })

  /**
   * The finding this module exists to produce. Buoyancy follows cross-sectional
   * AREA and weight follows wherever the heavy things are, so a real ship bends
   * even in still air at exact global equilibrium.
   */
  it('mismatched distributions bend the ship even in exact equilibrium', () => {
    const loads = surfaceProportionalWeight(totalBuoyantForce)
    const result = solveBeam(loads)

    expect(Math.abs(result.residualForce) / totalBuoyantForce).toBeLessThan(1e-6)
    expect(Math.abs(result.maximumMoment)).toBeGreaterThan(0)
  })

  it('a heavy gondola amidships makes the ship hog', () => {
    // Weight concentrated in the middle, buoyancy spread along the ends: the
    // middle is pushed up relative to the ends.
    const loads = surfaceProportionalWeight(totalBuoyantForce * 0.4)
    const heavy: PointLoad[] = [{ name: 'gondola', x: m(LENGTH / 2), mass: 6000 }]
    const result = solveBeam(loads, heavy)
    expect(result.hogging).toBe(true)
  })

  it('reports the residual when the ship is out of balance', () => {
    // A heavy ship really is accelerating downward, and the model says so
    // rather than quietly forcing the books to balance.
    const loads = surfaceProportionalWeight(totalBuoyantForce * 1.05)
    const result = solveBeam(loads)

    expect(result.residualForce).toBeLessThan(0)
    expect(result.verticalAcceleration).toBeLessThan(0)
    // 5 percent heavy on a body whose buoyancy equals its weight is about 0.05g.
    expect(Math.abs(result.verticalAcceleration)).toBeGreaterThan(0.02 * G0)
    expect(Math.abs(result.verticalAcceleration)).toBeLessThan(0.1 * G0)
  })

  it('point loads produce a shear step at their station', () => {
    const loads = surfaceProportionalWeight(totalBuoyantForce * 0.5)
    const withEngine = solveBeam(loads, [{ name: 'engine', x: m(60), mass: 2000 }])
    const without = solveBeam(loads, [])
    expect(Math.abs(withEngine.maximumShear)).not.toBeCloseTo(Math.abs(without.maximumShear), 0)
  })

  it('refuses a station list too short to integrate', () => {
    expect(() => solveBeam([{ x: m(0), buoyancy: 1, weight: 1 }])).toThrow(RangeError)
  })
})

describe('section modulus', () => {
  it('a ring of longitudinals scales with radius and count', () => {
    // S = A*R*N/2. A fatter hull is a deeper beam, which is why the fineness
    // ratio trade is not purely aerodynamic.
    expect(ringSectionModulus(1e-3, 9, 12)).toBeCloseTo((1e-3 * 9 * 12) / 2, 12)
    expect(ringSectionModulus(1e-3, 18, 12)).toBeCloseTo(2 * ringSectionModulus(1e-3, 9, 12), 12)
  })

  it('required modulus is moment over allowable stress', () => {
    expect(requiredSectionModulus(1e6 as never, 5e8)).toBeCloseTo(1e6 / 5e8, 12)
  })

  it('refuses a non-positive allowable stress', () => {
    expect(() => requiredSectionModulus(1e6 as never, 0)).toThrow(RangeError)
  })

  /**
   * The relation that decides how much material the hull needs. Doubling hull
   * radius halves the longitudinal area required for the same moment, which is
   * a large part of why bigger airships have better structural mass fractions.
   */
  it('doubling hull radius halves the longitudinal area needed for a given moment', () => {
    const moment = 5e6 as never
    const allowable = 4e8
    const required = requiredSectionModulus(moment, allowable)

    const areaAt9m = (required * 2) / (9 * 12)
    const areaAt18m = (required * 2) / (18 * 12)
    expect(areaAt18m).toBeCloseTo(areaAt9m / 2, 12)
  })
})
