import { describe, expect, it } from 'vitest'
import { ZEPPELIN_NT, HISTORICAL_SHIPS } from '@airship/data'
import { m } from '@airship/units'
import {
  hullGeometry,
  hullShapeForPrismatic,
  prismaticCoefficientOf,
  lengthForVolume,
  crossSectionDistribution,
  CONVENTIONAL_HULL,
  CONVENTIONAL_PRISMATIC_COEFFICIENT,
} from '../src/geometry/hull.js'

describe('parametric hull shape', () => {
  it('solves the fullness blend to the requested prismatic coefficient', () => {
    for (const target of [0.6, 0.65, 0.69, 0.7]) {
      const shape = hullShapeForPrismatic(target)
      expect(Math.abs(prismaticCoefficientOf(shape) - target)).toBeLessThan(1e-5)
    }
  })

  it('refuses targets the shape family cannot produce', () => {
    // A cylinder is Cp = 1 and is not a hull. Failing loudly beats silently
    // clamping, because a clamped sweep looks like a converged one.
    expect(() => hullShapeForPrismatic(0.95)).toThrow(RangeError)
    expect(() => hullShapeForPrismatic(0.2)).toThrow(RangeError)
  })

  it('puts maximum diameter forward of midships, as real hulls do', () => {
    const g = hullGeometry(m(90), 5)
    expect(g.maxDiameterStation).toBeGreaterThan(0.25)
    expect(g.maxDiameterStation).toBeLessThan(0.5)
  })

  it('prismatic coefficient is independent of length and fineness ratio', () => {
    // It is a property of the shape alone, which is what makes the fullness
    // solve reusable across the whole sizing sweep.
    const a = hullGeometry(m(50), 4)
    const b = hullGeometry(m(200), 7)
    expect(Math.abs(a.prismaticCoefficient - b.prismaticCoefficient)).toBeLessThan(1e-6)
  })
})

/**
 * VALIDATION: reproduce the envelope volume of real airships from published
 * length and diameter alone.
 *
 * This is what makes the sizing loop trustworthy. If the shape function cannot
 * turn 75 m by 14.16 m into 8,225 m3, then every volume the model produces for
 * a hull that does not exist is wrong by the same factor, and so is every lift,
 * every mass fraction and every endurance number downstream of it.
 */
describe('validation: hull volume from published dimensions', () => {
  it('Zeppelin NT: 75 m by 14.16 m gives 8,225 m3 within 5 percent', () => {
    const g = hullGeometry(m(ZEPPELIN_NT.length), ZEPPELIN_NT.length / ZEPPELIN_NT.maxDiameter)
    expect(Math.abs(g.volume / ZEPPELIN_NT.gasVolume - 1)).toBeLessThan(0.05)
  })

  it('USS Macon: 239.3 m by 40.5 m gives its 209,580 m3 air displacement within 8 percent', () => {
    // Air displacement, not gas volume: the cells were at 95 percent fill and
    // the envelope also contains structure and interstitial air. The tolerance
    // is wider than the Zeppelin NT case for exactly that reason.
    const macon = HISTORICAL_SHIPS.find((s) => s.id === 'zrs5-macon')
    if (!macon) throw new Error('Macon fixture missing')
    const g = hullGeometry(m(macon.length), macon.length / macon.maxDiameter)
    const airDisplacement = 209580
    expect(Math.abs(g.volume / airDisplacement - 1)).toBeLessThan(0.08)
  })
})

describe('hull geometry invariants', () => {
  it('volume scales as the cube of length at fixed fineness ratio', () => {
    const small = hullGeometry(m(50), 5)
    const large = hullGeometry(m(100), 5)
    expect(Math.abs(large.volume / small.volume - 8)).toBeLessThan(1e-6)
  })

  it('wetted area scales as the square of length at fixed fineness ratio', () => {
    const small = hullGeometry(m(50), 5)
    const large = hullGeometry(m(100), 5)
    expect(Math.abs(large.wettedArea / small.wettedArea - 4)).toBeLessThan(1e-6)
  })

  it('never beats a sphere on wetted area per unit volume', () => {
    // A sphere is the isoperimetric minimum at 4*pi*r^2 / ((4/3)pi r^3)^(2/3)
    // = 4.836. Any body of revolution must be worse. A shape function that
    // produced less would mean the area integral is wrong.
    const sphereCoefficient = (4 * Math.PI) / ((4 / 3) * Math.PI) ** (2 / 3)
    for (const fineness of [3, 4, 5, 6, 7]) {
      expect(hullGeometry(m(90), fineness).wettedAreaCoefficient).toBeGreaterThan(sphereCoefficient)
    }
  })

  it('wetted area per unit volume worsens as the hull gets more slender', () => {
    // The skin friction half of the fineness ratio trade. The pressure drag
    // half pulls the other way, which is what puts the optimum near 4.5 to 6.
    const stubby = hullGeometry(m(90), 3.5)
    const slender = hullGeometry(m(90), 7)
    expect(slender.wettedAreaCoefficient).toBeGreaterThan(stubby.wettedAreaCoefficient)
  })

  it('inverts volume to length', () => {
    const target = hullGeometry(m(87.3), 5.2).volume
    const solved = lengthForVolume(target, 5.2)
    expect(Math.abs(solved - 87.3)).toBeLessThan(1e-6)
  })

  it('the cross-section distribution integrates back to the volume', () => {
    // The structural model integrates buoyancy against this distribution, so a
    // disagreement here would put a systematic error into every bending moment.
    const g = hullGeometry(m(90), 5)
    const stations = crossSectionDistribution(m(90), 5, 2001)
    let volume = 0
    for (let i = 1; i < stations.length; i += 1) {
      const a = stations[i - 1]
      const b = stations[i]
      if (!a || !b) continue
      volume += ((a.area + b.area) / 2) * (b.x - a.x)
    }
    expect(Math.abs(volume / g.volume - 1)).toBeLessThan(0.001)
  })

  it('the default hull is the conventional one', () => {
    expect(Math.abs(prismaticCoefficientOf(CONVENTIONAL_HULL) - CONVENTIONAL_PRISMATIC_COEFFICIENT)).toBeLessThan(
      1e-5,
    )
  })

  it('refuses a fineness ratio that is not a hull', () => {
    expect(() => hullGeometry(m(90), 0.8)).toThrow(RangeError)
  })
})
