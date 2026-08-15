import { describe, expect, it } from 'vitest'
import { barrierFilm } from '@airship/data'
import { m, purity as asPurity } from '@airship/units'
import { atmosphere } from '../src/atmosphere.js'
import { hullGeometry } from '../src/geometry/hull.js'
import {
  annualLossFraction,
  cellFilmArea,
  dailyMakeupMass,
  permeationRates,
} from '../src/permeation.js'

/**
 * A representative ship for the permeation comparison: 90 m at fineness ratio
 * 5, twelve gas cells, pure hydrogen at sea level.
 */
const hull = hullGeometry(m(90), 5)
const CELL_COUNT = 12
const filmArea = cellFilmArea(hull.wettedArea, hull.volume, hull.length, CELL_COUNT)
const seaLevel = atmosphere(m(0))
const contents = { species: 'hydrogen' as const, purity: asPurity(1) }

/**
 * VALIDATION GATE 4.3: the permeation model must span three orders of
 * magnitude, from a modern barrier laminate in the 1 to 5 percent per year band
 * to legacy goldbeater's skin in the several percent per MONTH band.
 *
 * If it cannot span both, the permeation physics is wrong, because those are the
 * two ends of what has actually been measured on real airships.
 */
describe('validation gate: annual gas loss spans historical and modern films', () => {
  it('a best-in-class modern laminate lands in the 1 to 5 percent per year band', () => {
    const loss = annualLossFraction(
      barrierFilm('para-aramid-mylar-laminate'),
      filmArea,
      hull.volume,
      seaLevel.pressure,
      contents,
    )
    expect(loss).toBeGreaterThan(0.01)
    expect(loss).toBeLessThan(0.05)
  })

  it("goldbeater's skin lands in the several percent per month band", () => {
    const loss = annualLossFraction(
      barrierFilm('goldbeaters-skin'),
      filmArea,
      hull.volume,
      seaLevel.pressure,
      contents,
    )
    const perMonth = loss / 12
    expect(perMonth).toBeGreaterThan(0.02)
    expect(perMonth).toBeLessThan(0.2)
  })

  it('spans more than two orders of magnitude between them', () => {
    const modern = annualLossFraction(
      barrierFilm('para-aramid-mylar-laminate'),
      filmArea,
      hull.volume,
      seaLevel.pressure,
      contents,
    )
    const historical = annualLossFraction(
      barrierFilm('goldbeaters-skin'),
      filmArea,
      hull.volume,
      seaLevel.pressure,
      contents,
    )
    expect(historical / modern).toBeGreaterThan(50)
  })

  /**
   * The finding that makes film selection a first-order design decision rather
   * than a detail to settle later.
   */
  it('a commodity metallised laminate does NOT close the loss budget', () => {
    const loss = annualLossFraction(
      barrierFilm('metallised-bopet-laminate'),
      filmArea,
      hull.volume,
      seaLevel.pressure,
      contents,
    )
    expect(loss).toBeGreaterThan(0.05)
  })
})

describe('permeation is bidirectional', () => {
  it('hydrogen leaves and air enters at the same time', () => {
    const rates = permeationRates(
      barrierFilm('para-aramid-mylar-laminate'),
      filmArea,
      seaLevel.pressure,
      contents,
    )
    expect(rates.hydrogenLoss).toBeGreaterThan(0)
    expect(rates.airIngress).toBeGreaterThan(0)
  })

  it('a degraded cell leaks hydrogen more slowly, so purity decay self-limits', () => {
    const film = barrierFilm('para-aramid-mylar-laminate')
    const fresh = permeationRates(film, filmArea, seaLevel.pressure, contents)
    const degraded = permeationRates(film, filmArea, seaLevel.pressure, {
      species: 'hydrogen',
      purity: asPurity(0.8),
    })
    expect(degraded.hydrogenLoss).toBeLessThan(fresh.hydrogenLoss)
    expect(degraded.airMolesIn).toBeLessThan(fresh.airMolesIn)
  })

  it('nitrogen inerting the interstitial space makes inward leakage worse', () => {
    // A real trade the safety module has to own. Inerting suppresses the
    // ignition hazard and accelerates purity decay, and pretending otherwise
    // would let the safety case be free.
    const film = barrierFilm('para-aramid-mylar-laminate')
    const inAir = permeationRates(film, filmArea, seaLevel.pressure, contents, 0.7808)
    const inerted = permeationRates(film, filmArea, seaLevel.pressure, contents, 1.0)
    expect(inerted.airMolesIn).toBeGreaterThan(inAir.airMolesIn)
  })

  it('leaks more slowly at altitude, because partial pressures fall', () => {
    const film = barrierFilm('para-aramid-mylar-laminate')
    const low = permeationRates(film, filmArea, seaLevel.pressure, contents)
    const high = permeationRates(film, filmArea, atmosphere(m(4000)).pressure, contents)
    expect(high.hydrogenLoss).toBeLessThan(low.hydrogenLoss)
  })
})

describe('cell count is a real trade, not a free choice', () => {
  it('more cells means more permeating area', () => {
    const few = cellFilmArea(hull.wettedArea, hull.volume, hull.length, 4)
    const many = cellFilmArea(hull.wettedArea, hull.volume, hull.length, 16)
    expect(many).toBeGreaterThan(few)
  })

  it('going from 4 cells to 16 costs a substantial fraction of the leak budget', () => {
    // Every internal bulkhead is film on both faces. This is the term that makes
    // the brief's open question about cell count answerable: damage tolerance
    // has to pay for the leak it adds.
    const few = cellFilmArea(hull.wettedArea, hull.volume, hull.length, 4)
    const many = cellFilmArea(hull.wettedArea, hull.volume, hull.length, 16)
    expect(many / few).toBeGreaterThan(1.3)
  })

  it('a single cell has only the hull area', () => {
    expect(cellFilmArea(hull.wettedArea, hull.volume, hull.length, 1)).toBeCloseTo(hull.wettedArea, 6)
  })

  it('refuses a hull with no cells', () => {
    expect(() => cellFilmArea(hull.wettedArea, hull.volume, hull.length, 0)).toThrow(RangeError)
  })
})

describe('makeup rate', () => {
  it('is a few hundred grams a day for a good film on a 90 m ship', () => {
    const makeup = dailyMakeupMass(
      barrierFilm('para-aramid-mylar-laminate'),
      filmArea,
      seaLevel.pressure,
      contents,
    )
    expect(makeup).toBeGreaterThan(0.05)
    expect(makeup).toBeLessThan(5)
  })
})
