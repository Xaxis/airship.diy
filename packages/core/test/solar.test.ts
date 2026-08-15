import { describe, expect, it } from 'vitest'
import { fromDegrees, m, rad } from '@airship/units'
import {
  airMass,
  arrayOutput,
  coveredArea,
  dailyArrayEnergy,
  declination,
  naiveFlatPlate,
  projectedAreaEstimate,
  solarIrradiance,
  solarPosition,
} from '../src/solar.js'
import type { ArrayLayout } from '../src/solar.js'

const layout: ArrayLayout = {
  length: m(90),
  finenessRatio: 5,
  coverageHalfAngle: fromDegrees(75),
  forwardStation: 0.1,
  aftStation: 0.85,
}

describe('solar geometry', () => {
  it('declination is near zero at the equinoxes and extreme at the solstices', () => {
    // Day 80 is about 21 March, day 172 about 21 June, day 355 about 21 December.
    expect(Math.abs((declination(80) * 180) / Math.PI)).toBeLessThan(1.5)
    expect((declination(172) * 180) / Math.PI).toBeGreaterThan(23)
    expect((declination(355) * 180) / Math.PI).toBeLessThan(-23)
  })

  it('the sun is overhead at the tropic of Cancer at the June solstice', () => {
    const position = solarPosition(fromDegrees(23.44), 172, 12)
    expect((position.elevation * 180) / Math.PI).toBeGreaterThan(89)
  })

  it('the sun is below the horizon at midnight', () => {
    expect(solarPosition(fromDegrees(10), 172, 0).elevation).toBeLessThan(0)
  })

  it('air mass is 1 at the zenith and rises steeply at the horizon', () => {
    expect(Math.abs(airMass(fromDegrees(90)) - 1)).toBeLessThan(0.001)
    expect(airMass(fromDegrees(30))).toBeGreaterThan(1.9)
    expect(airMass(fromDegrees(30))).toBeLessThan(2.1)
    // Kasten-Young stays finite at the horizon, where 1/sin would diverge.
    expect(airMass(fromDegrees(0.5))).toBeLessThan(50)
    expect(Number.isFinite(airMass(fromDegrees(0.5)))).toBe(true)
  })

  it('diverges from the naive 1/sin form near the horizon', () => {
    // At 10 degrees the difference is only 3 percent, but 1/sin runs away as
    // elevation goes to zero while the real optical path does not. That is why
    // the shoulders of the day use Kasten-Young: an integrator stepping through
    // sunrise with 1/sin picks up a spurious spike.
    const at10 = Math.abs(airMass(fromDegrees(10)) / (1 / Math.sin(fromDegrees(10))) - 1)
    expect(at10).toBeGreaterThan(0.02)
    expect(at10).toBeLessThan(0.05)

    const at1 = airMass(fromDegrees(1)) / (1 / Math.sin(fromDegrees(1)))
    expect(at1).toBeLessThan(0.6)
  })
})

describe('irradiance', () => {
  it('clear-sky direct normal at sea level near noon is in the expected band', () => {
    const irradiance = solarIrradiance(fromDegrees(15), 172, 12, m(0))
    expect(irradiance.directNormal).toBeGreaterThan(850)
    expect(irradiance.directNormal).toBeLessThan(1050)
  })

  it('altitude buys irradiance, because there is less atmosphere overhead', () => {
    const low = solarIrradiance(fromDegrees(15), 172, 12, m(0))
    const high = solarIrradiance(fromDegrees(15), 172, 12, m(4000))
    expect(high.directNormal).toBeGreaterThan(low.directNormal)
    // A meaningful gain, not a rounding error: this is one of the reasons to
    // cruise high rather than low.
    expect(high.directNormal / low.directNormal).toBeGreaterThan(1.03)
  })

  it('orbital eccentricity gives a 6 percent swing between January and July', () => {
    // Larger than most of the effects this model argues about, and it favours
    // the southern hemisphere summer.
    const january = solarIrradiance(fromDegrees(0), 4, 12, m(0))
    const july = solarIrradiance(fromDegrees(0), 185, 12, m(0))
    expect(january.directNormal / july.directNormal).toBeGreaterThan(1.04)
  })

  it('is zero at night', () => {
    const night = solarIrradiance(fromDegrees(15), 172, 1, m(0))
    expect(night.directNormal).toBe(0)
    expect(night.globalHorizontal).toBe(0)
  })
})

describe('collection on a curved hull', () => {
  const noon = solarIrradiance(fromDegrees(15), 172, 12, m(2000))

  it('produces power in daylight and none at night', () => {
    const day = arrayOutput(layout, noon, rad(0), 293)
    expect(day.power).toBeGreaterThan(0)

    const night = solarIrradiance(fromDegrees(15), 172, 1, m(2000))
    expect(arrayOutput(layout, night, rad(0), 293).power).toBe(0)
  })

  /**
   * THE finding this module exists for. Treating the covered surface area as
   * though every square metre of it faced the sun overstates output by about a
   * factor of two, because the array is conformal to a doubly curved hull.
   */
  it('the naive area-times-irradiance estimate overstates output by about half', () => {
    const real = arrayOutput(layout, noon, rad(0), 293).power
    const naive = naiveFlatPlate(layout, noon)
    expect(naive).toBeGreaterThan(real)
    expect(naive / real).toBeGreaterThan(1.4)
  })

  /**
   * The counterpart check, and the one that would catch a sign error in the
   * surface normals. Projecting onto the plane normal to the sun is not an
   * approximation for the beam component, it is exact, so the full integral has
   * to agree with it once diffuse and temperature are allowed for.
   */
  it('agrees with the exact projected-area result for the beam component', () => {
    const real = arrayOutput(layout, noon, rad(0), 298).power
    const projected = projectedAreaEstimate(layout, noon, rad(0))
    // The integral adds diffuse and subtracts temperature derating, so it lands
    // near the projected figure rather than exactly on it.
    expect(real / projected).toBeGreaterThan(0.85)
    expect(real / projected).toBeLessThan(1.15)
  })

  it('mean flux over the covered area is far below the direct normal irradiance', () => {
    // The cosine penalty of the curvature, stated directly. If mean flux ever
    // approached the direct normal figure, the normals would be wrong.
    const output = arrayOutput(layout, noon, rad(0), 293)
    expect(output.meanFlux).toBeLessThan(noon.directNormal * 0.75)
  })

  it('the whole band is lit at high sun, and part of it is shaded at low sun', () => {
    // With the sun overhead every element of a 75 degree band has a positive
    // incidence cosine. Late in the day the far flank turns away from the sun
    // and stops contributing, which is the self-shading the integral captures
    // and a projected-area shortcut would get wrong by allowing it to
    // contribute negatively.
    expect(arrayOutput(layout, noon, rad(0), 293).illuminatedFraction).toBeCloseTo(1, 3)

    const evening = solarIrradiance(fromDegrees(15), 172, 17.5, m(2000))
    const lowSun = arrayOutput(layout, evening, rad(0), 293)
    expect(lowSun.illuminatedFraction).toBeGreaterThan(0.2)
    expect(lowSun.illuminatedFraction).toBeLessThan(0.95)
  })

  it('heading matters: beam-on to the sun collects more than nose-on', () => {
    // The flanks are what face the sun; the fine ends are not. This is a real
    // and free control input on a vehicle that can point wherever it likes.
    const morning = solarIrradiance(fromDegrees(15), 172, 9, m(2000))
    const outputs = [0, 45, 90, 135].map(
      (h) => arrayOutput(layout, morning, fromDegrees(h), 293).power,
    )
    const best = Math.max(...outputs)
    const worst = Math.min(...outputs)
    expect(best / worst).toBeGreaterThan(1.02)
  })

  it('cell heating derates output', () => {
    const cool = arrayOutput(layout, noon, rad(0), 283).power
    const hot = arrayOutput(layout, noon, rad(0), 313).power
    expect(hot).toBeLessThan(cool)
  })

  it('covered area matches the area the integral accumulates', () => {
    const output = arrayOutput(layout, noon, rad(0), 293)
    expect(Math.abs(output.coveredArea / coveredArea(layout) - 1)).toBeLessThan(1e-9)
  })
})

describe('daily energy', () => {
  it('collects more in tropical summer than at high latitude in winter', () => {
    const tropical = dailyArrayEnergy(layout, fromDegrees(10), 172, m(2000), rad(0), 298)
    const temperate = dailyArrayEnergy(layout, fromDegrees(50), 355, m(2000), rad(0), 275)
    expect(tropical.energy).toBeGreaterThan(temperate.energy * 3)
  })

  it('reports a plausible number of daylight hours', () => {
    const equatorial = dailyArrayEnergy(layout, fromDegrees(0), 80, m(2000), rad(0), 298)
    expect(equatorial.daylightHours).toBeGreaterThan(11.5)
    expect(equatorial.daylightHours).toBeLessThan(12.5)
  })

  it('daily energy is consistent with peak power and daylight duration', () => {
    // A sanity relation rather than an identity: the day integral must lie
    // between a triangle and a rectangle of the same peak and duration.
    const day = dailyArrayEnergy(layout, fromDegrees(15), 172, m(2000), rad(0), 298)
    const rectangle = day.peakPower * day.daylightHours * 3600
    expect(day.energy).toBeGreaterThan(rectangle * 0.3)
    expect(day.energy).toBeLessThan(rectangle)
  })
})
