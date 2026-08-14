import { describe, expect, it } from 'vitest'
import { HISTORICAL_SHIPS } from '@airship/data'
import type { HistoricalShip } from '@airship/data'
import { m, m3, purity as asPurity } from '@airship/units'
import { atmosphere } from '../src/atmosphere.js'
import { grossLift, specificLift, pure, STANDARD_GAS_TEMPERATURE } from '../src/buoyancy.js'

/**
 * VALIDATION GATE 4.2: compute gross lift for the historical rigids and match
 * published figures within their stated tolerance.
 *
 * These are the only ships in this repository that actually flew. If the model
 * cannot reproduce them it has no business making predictions about one that
 * has not.
 */
describe('validation gate: gross lift of historical rigid airships', () => {
  const seaLevel = atmosphere(m(0))

  const withPublishedLift = HISTORICAL_SHIPS.filter(
    (s): s is HistoricalShip & { publishedGrossLift: number } => s.publishedGrossLift !== undefined,
  )

  for (const ship of withPublishedLift) {
    it(`${ship.name}: within ${(ship.grossLiftTolerance * 100).toFixed(0)} percent of ${(
      ship.publishedGrossLift / 1000
    ).toFixed(1)} t`, () => {
      const predicted = grossLift(
        m3(ship.gasVolume),
        { species: ship.liftingGas, purity: asPurity(ship.purity) },
        seaLevel,
        STANDARD_GAS_TEMPERATURE,
      )

      const error = predicted / ship.publishedGrossLift - 1
      expect(Math.abs(error)).toBeLessThan(ship.grossLiftTolerance)
    })
  }

  /**
   * The finding that justifies purity being a state variable rather than a
   * refinement. Modelled with pure helium, Macon fails its own gate.
   */
  it('Macon fails the gate if purity is ignored, and passes if it is not', () => {
    const macon = HISTORICAL_SHIPS.find((s) => s.id === 'zrs5-macon')
    if (!macon?.publishedGrossLift) throw new Error('Macon fixture missing')

    const atPurity = grossLift(
      m3(macon.gasVolume),
      { species: 'helium', purity: asPurity(macon.purity) },
      seaLevel,
      STANDARD_GAS_TEMPERATURE,
    )
    const asPure = grossLift(m3(macon.gasVolume), pure('helium'), seaLevel, STANDARD_GAS_TEMPERATURE)

    const errorAtPurity = Math.abs(atPurity / macon.publishedGrossLift - 1)
    const errorAsPure = Math.abs(asPure / macon.publishedGrossLift - 1)

    expect(errorAtPurity).toBeLessThan(0.03)
    expect(errorAsPure).toBeGreaterThan(0.05)
  })

  /**
   * The empty weight fraction carbon fibre has to beat.
   *
   * Macon: 109,930 kg of duralumin structure against 182,797 kg of gross lift,
   * so 60.1 percent of the ship's entire lift went into holding itself up. The
   * project targets 40 to 50 percent, and the structures module has to prove
   * that rather than assume it.
   */
  it('records the duralumin empty weight fraction as the number to beat', () => {
    const macon = HISTORICAL_SHIPS.find((s) => s.id === 'zrs5-macon')
    if (!macon?.publishedDeadweight || !macon.publishedGrossLift) throw new Error('Macon fixture missing')

    const fraction = macon.publishedDeadweight / macon.publishedGrossLift
    expect(fraction).toBeGreaterThan(0.55)
    expect(fraction).toBeLessThan(0.65)
  })

  it('published deadweight plus useful lift equals gross lift, as it must', () => {
    for (const ship of HISTORICAL_SHIPS) {
      if (!ship.publishedDeadweight || !ship.publishedUsefulLift || !ship.publishedGrossLift) continue
      const sum = ship.publishedDeadweight + ship.publishedUsefulLift
      expect(Math.abs(sum / ship.publishedGrossLift - 1)).toBeLessThan(0.005)
    }
  })
})

/**
 * The reference specific lift figures that every airship discussion starts
 * from. The model must produce these rather than contain them.
 */
describe('reference specific lift at ISA sea level', () => {
  const seaLevel = atmosphere(m(0))

  it('hydrogen gives 1.140 kg/m3', () => {
    const lift = specificLift(pure('hydrogen'), seaLevel, STANDARD_GAS_TEMPERATURE)
    expect(Math.abs(lift - 1.14)).toBeLessThan(0.002)
  })

  it('helium gives 1.056 kg/m3', () => {
    const lift = specificLift(pure('helium'), seaLevel, STANDARD_GAS_TEMPERATURE)
    expect(Math.abs(lift - 1.056)).toBeLessThan(0.002)
  })

  it('hydrogen beats helium by about 8 percent', () => {
    const h2 = specificLift(pure('hydrogen'), seaLevel, STANDARD_GAS_TEMPERATURE)
    const he = specificLift(pure('helium'), seaLevel, STANDARD_GAS_TEMPERATURE)
    const advantage = h2 / he - 1
    expect(advantage).toBeGreaterThan(0.075)
    expect(advantage).toBeLessThan(0.085)
  })

  /**
   * The distinction the model must not blur: 0.08988 kg/m3 is hydrogen at
   * 0 degrees C, and 0.0852 is hydrogen at ISA sea level. Quoting lift against
   * the first while computing air density at the second inflates lift by about
   * 5 percent.
   */
  it('separates 0 C gas density from ISA sea level gas density', () => {
    const zeroC = atmosphere(m(0), { temperatureOffset: -15 as never })
    const isaSl = atmosphere(m(0))
    expect(zeroC.temperature).toBeCloseTo(273.15, 6)
    expect(isaSl.temperature).toBeCloseTo(288.15, 6)
  })
})
