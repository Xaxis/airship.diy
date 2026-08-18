import { describe, it } from 'vitest'
import { BASELINE } from '@airship/model'
import { integrateMission } from '../src/mission.js'
import { integrateMissionFixed } from '../src/_zz_probe_mission.js'
import { energyBalance } from '../src/energy-balance.js'
import { SI } from '@airship/units'

const STORES = { food: 100000, water: 100000, waterCapacity: 200000 }

describe('band', () => {
  it('sweep wind finely on the bad film to find the band where the two differ', () => {
    for (const film of ['metallised-bopet-laminate']) {
      for (let w = 8; w <= 14; w += 0.25) {
        const d = { ...BASELINE, hull: { ...BASELINE.hull, filmId: film }, mission: { ...BASELINE.mission, stationKeepingWind: w } }
        const e = energyBalance(d)
        const req = e.days.reduce((s, x) => s + x.solarRequired, 0)
        const sNow = Math.max((e.annualGenerated - e.annualDemand) / SI.DAYS_PER_YEAR, 0)
        const sFix = Math.max((e.annualGenerated - req) / SI.DAYS_PER_YEAR, 0)
        if (sNow > 0 && sFix === 0) {
          const a = integrateMission(d, STORES, 5000)
          const b = integrateMissionFixed(d, STORES, 5000)
          console.log('BAND wind', w.toFixed(2),
            '| NOW', a.physicalEnduranceDays, a.physicalLimit, JSON.stringify(a.resourceExhaustion),
            '| FIX', b.physicalEnduranceDays, b.physicalLimit, JSON.stringify(b.resourceExhaustion))
        }
      }
    }
  })
  it('sweep clearSky on baseline film', () => {
    for (let c = 0.30; c <= 0.75; c += 0.005) {
      const d = { ...BASELINE, mission: { ...BASELINE.mission, clearSkyFraction: c } }
      const e = energyBalance(d)
      const req = e.days.reduce((s, x) => s + x.solarRequired, 0)
      const sNow = Math.max((e.annualGenerated - e.annualDemand) / SI.DAYS_PER_YEAR, 0)
      const sFix = Math.max((e.annualGenerated - req) / SI.DAYS_PER_YEAR, 0)
      if (sNow > 0 && sFix === 0) {
        const a = integrateMission(d, STORES, 5000)
        const b = integrateMissionFixed(d, STORES, 5000)
        console.log('BAND clearSky', c.toFixed(3), '| NOW', a.physicalEnduranceDays, a.physicalLimit, '| FIX', b.physicalEnduranceDays, b.physicalLimit,
          '| gas', a.states[a.states.length-1]?.gasMass.toFixed(1), b.states[b.states.length-1]?.gasMass.toFixed(1))
      }
    }
  })
})
