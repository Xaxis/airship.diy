import { describe, expect, it } from 'vitest'

import {
  atmosphere,
  gasDensity,
  grossLift,
  meanMolarMass,
  pure,
  specificLift,
  staticHeaviness,
  superheatHeavinessExcursion,
  superheatResponse,
} from '../src/index.js'
import { K, kg, m, m3, purity as asPurity } from '@airship/units'

/**
 * Buoyancy, which everything else in this repository stands on.
 *
 * THIS FILE DID NOT EXIST. `buoyancy.validation.test.ts` checks the module
 * against ships that flew, which catches being wrong about the world, and
 * nothing checked it against itself. That is how `superheatHeavinessExcursion`
 * came to compute the same physical quantity as `superheatResponse` and get an
 * answer 7.5 percent lower, in the same file, for a year.
 */

describe('lift is three different quantities and they must not be confused', () => {
  const AIR = atmosphere(m(0))
  const H2 = pure('hydrogen')

  it('separates gross lift from static heaviness by sign and by meaning', () => {
    // Gross lift is what the gas displaces. Static heaviness is gross minus the
    // CURRENT weight and it is signed, with positive meaning heavy, which is the
    // safe direction. Published airship figures confuse these constantly.
    const volume = m3(34_000)
    const gross = grossLift(volume, H2, AIR, K(AIR.temperature))
    expect(gross).toBeGreaterThan(0)

    // The signature is (totalWeight, lift), so heaviness is weight minus lift.
    const heavy = staticHeaviness(kg(gross + 600), gross)
    const light = staticHeaviness(kg(gross - 600), gross)
    expect(heavy).toBeGreaterThan(0)
    expect(light).toBeLessThan(0)
    expect(heavy).toBeCloseTo(600, 6)
  })

  it('makes impure gas lift less, because purity is a state variable', () => {
    // Air leaks inward continuously and that decay IS lift. Modelled pure, the
    // USS Macon comes out 6.3 percent high and fails its own validation gate.
    const clean = specificLift(H2, AIR, K(AIR.temperature))
    const stale = specificLift(
      { species: 'hydrogen', purity: asPurity(0.95) },
      AIR,
      K(AIR.temperature),
    )
    expect(stale).toBeLessThan(clean)
  })

  it('makes humid air lift less, which gets left out in the flattering direction', () => {
    // Water at 18 g/mol displaces air averaging 29, so saturated air at 30 C is
    // about 1.6 percent less dense and costs the same fraction of gross lift.
    const dry = atmosphere(m(0), { temperatureOffset: 15 })
    const wet = atmosphere(m(0), { temperatureOffset: 15, relativeHumidity: 1 })
    expect(wet.density).toBeLessThan(dry.density)
  })

  it('gives hydrogen a lower molar mass than helium and so more lift', () => {
    expect(meanMolarMass(pure('hydrogen'))).toBeLessThan(meanMolarMass(pure('helium')))
    expect(gasDensity(pure('hydrogen'), AIR.pressure, K(AIR.temperature))).toBeLessThan(
      gasDensity(pure('helium'), AIR.pressure, K(AIR.temperature)),
    )
  })
})

describe('the two superheat regimes, which differ by everything', () => {
  /**
   * CLAUDE.md names `superheatResponse` as the definition of the two regimes and
   * calls confusing them "the difference between a control input and an
   * irreversible loss". It had no test anywhere. Every superheat test in the
   * repository exercised `superheatHeavinessExcursion` instead, which is why
   * that helper could drop the prefactor this one applies and nothing noticed.
   */
  const AIR = atmosphere(m(0))
  const H2 = pure('hydrogen')
  /** @derived Twenty kelvin, the design superheat. */
  const SUPERHEAT = K(20)

  it('gains 7.5 percent of lift when the cell can still expand', () => {
    // The prefactor is rho_air / (rho_air - rho_gas), which for hydrogen at sea
    // level is 1.225/1.140 = 1.075. So 20 K on a 288 K day is 7.5 percent and
    // NOT the 6.9 percent that dT/T alone gives. That difference sizes the
    // seawater ballast bladder.
    const partial = superheatResponse(SUPERHEAT, K(AIR.temperature), H2, AIR, 0.9)
    expect(partial.pressureLimited).toBe(false)
    expect(partial.liftFraction).toBeCloseTo(0.0746, 3)

    const naive = 20 / AIR.temperature
    expect(partial.liftFraction / naive).toBeCloseTo(1.075, 2)
  })

  it('gains NO lift when the cell is full, and valves instead', () => {
    // A full cell cannot expand, so the same 20 K produces zero lift change and
    // about 7 kPa of overpressure, which is far above any sane relief setting.
    // The cell valves and the lift is gone permanently.
    const full = superheatResponse(SUPERHEAT, K(AIR.temperature), H2, AIR, 1)
    expect(full.pressureLimited).toBe(true)
    expect(full.liftFraction).toBeCloseTo(0, 6)
    expect(full.overpressure).toBeGreaterThan(6000)
    expect(full.overpressure).toBeLessThan(8000)
  })

  it('is continuous across the boundary between them', () => {
    // A cell at 1/(1 + dT/T) full is exactly on the edge. Either side of it the
    // answer must not jump, because a discontinuity here would mean the model
    // disagrees with itself about a cell one percent fuller.
    const edge = 1 / (1 + 20 / AIR.temperature)
    const below = superheatResponse(SUPERHEAT, K(AIR.temperature), H2, AIR, edge - 1e-4)
    const above = superheatResponse(SUPERHEAT, K(AIR.temperature), H2, AIR, edge + 1e-4)
    expect(Math.abs(below.liftFraction - above.liftFraction)).toBeLessThan(1e-3)
  })

  it('is what the excursion helper reports, rather than a second derivation', () => {
    // The helper used to compute dT/T * grossLift on its own, 7.5 percent below
    // this function, and it is the one that sizes the ballast loop and the gear.
    const grossLift = 33_000
    const excursion = superheatHeavinessExcursion(grossLift, 20, H2, AIR, 0.9)
    const direct = superheatResponse(SUPERHEAT, K(AIR.temperature), H2, AIR, 0.9)
    expect(excursion).toBeCloseTo(direct.liftFraction * grossLift, 6)
  })
})
