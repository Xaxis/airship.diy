import { describe, expect, it } from 'vitest'

import { powerSchematic, redundancyCheck, waterLoopCheck, waterSchematic } from '../src/index.js'
import type { PowerInputs, WaterInputs } from '../src/index.js'

/**
 * The schematic checks, which are connectivity questions rather than budget
 * ones. An energy balance can close perfectly on a vehicle with one bus, one
 * converter and one tank, and a year is long enough that every single point of
 * failure gets its turn.
 */

const POWER: PowerInputs = {
  arrayPeak: 40000,
  fuelCellRating: 30000,
  electrolyzerRating: 40000,
  batteryEnergy: 150e3 * 3600,
  habitatLoad: 900,
  propulsionRating: 72000,
  generatorRating: 30000,
}

const WATER: WaterInputs = {
  dailyConsumption: 62,
  dailyRecovered: 52,
  dailyCatchment: 2028,
  fuelCellProduct: 2,
  electrolyzerDemand: 2,
  tankCapacity: 2500,
}

describe('the power schematic', () => {
  const schematic = powerSchematic(POWER)

  it('is all-electric, so nothing drives a propeller mechanically', () => {
    // The architecture decision: it is what lets the engine sit aft for the
    // exhaust rule while the propulsors sit where they are aerodynamically
    // useful. It USED to say "every source and every load on one bus", which
    // described the arrangement correctly and was also the worst defect in the
    // vehicle. There are two buses now and neither is critical on its own.
    const buses = schematic.nodes.filter((n) => n.id.startsWith('bus-'))
    expect(buses).toHaveLength(2)
    expect(buses.every((b) => !b.critical)).toBe(true)
    const throughBuses = schematic.flows.filter(
      (f) => f.to.startsWith('bus-') || f.from.startsWith('bus-'),
    )
    expect(throughBuses.length).toBeGreaterThan(10)
  })

  it('gives the habitat load four independent sources', () => {
    const findings = redundancyCheck(schematic)
    const habitat = findings.find((f) => f.id === 'redundancy-habitat')
    expect(habitat?.severity).toBe('pass')
  })

  it('fails a load whose every path runs through one node', () => {
    // Cut the habitat's feed from bus B and it has one path again, however many
    // sources the schematic contains. Counting sources would still say five.
    const oneSided = {
      ...schematic,
      flows: schematic.flows.filter((f) => !(f.to === 'habitat' && f.from === 'bus-b')),
    }
    const habitat = redundancyCheck(oneSided).find((f) => f.id === 'redundancy-habitat')
    expect(habitat?.severity).toBe('fail')
    expect(habitat?.detail).toContain('DC bus A')
  })
})

describe('the water loop', () => {
  it('closes with an enormous margin, and says which resource actually binds', () => {
    const findings = waterLoopCheck(WATER)
    const average = findings.find((f) => f.id === 'water-closes-on-average')
    expect(average?.severity).toBe('pass')
    expect(average?.detail).toContain('NOT THE BINDING RESOURCE')
  })

  it('survives a dry month on recycling and fuel cell product alone', () => {
    const dry = waterLoopCheck(WATER).find((f) => f.id === 'water-survives-a-dry-month')
    expect(dry?.severity).toBe('pass')
  })

  it('fails a dry month when the tank is too small for it', () => {
    const thirsty = waterLoopCheck({ ...WATER, dailyRecovered: 5, tankCapacity: 200 })
    const dry = thirsty.find((f) => f.id === 'water-survives-a-dry-month')
    expect(dry?.severity).toBe('fail')
  })

  it('counts electrolyzer feedstock as circulation rather than consumption', () => {
    // Nine kilograms of water per kilogram of hydrogen, both ways. Counting the
    // outbound leg as consumption double counts the largest flow in the loop.
    const finding = waterLoopCheck(WATER).find((f) => f.id === 'electrolyzer-water-is-circulation')
    expect(finding?.severity).toBe('pass')
    expect(finding?.detail).toContain('double count')
  })

  it('describes the fuel cell and electrolyzer as one closed water loop', () => {
    const schematic = waterSchematic(WATER)
    const toElectrolyzer = schematic.flows.find((f) => f.to === 'electrolyzer-water')
    const fromFuelCell = schematic.flows.find((f) => f.from === 'fuel-cell-water')
    expect(toElectrolyzer).toBeDefined()
    expect(fromFuelCell).toBeDefined()
  })
})


describe('the split bus, which is the whole point of the redundancy check', () => {
  it('reports the single bus as a single point of failure', () => {
    // THE DEFECT THIS CHECK EXISTS TO CATCH, reconstructed. Counting a load's
    // feeders one level up finds five sources behind one bus and reports five
    // paths, which is exactly the arrangement that was catastrophic. Deleting
    // each node in turn asks the question that matters.
    const split = powerSchematic(POWER)
    const single: typeof split = {
      ...split,
      nodes: split.nodes
        .filter((n) => n.id !== 'bus-b' && n.id !== 'tie')
        .map((n) => (n.id === 'bus-a' ? { ...n, id: 'bus', name: 'Main DC bus' } : n)),
      flows: split.flows
        .filter((f) => f.from !== 'tie' && f.to !== 'tie')
        .map((f) => ({
          ...f,
          from: f.from.startsWith('bus') ? 'bus' : f.from,
          to: f.to.startsWith('bus') ? 'bus' : f.to,
        }))
        .filter((f) => f.from !== f.to),
    }

    const findings = redundancyCheck(single)
    expect(findings.every((f) => f.severity === 'fail')).toBe(true)
    expect(findings[0]?.detail).toContain('Main DC bus')
  })

  it('passes the split bus, and every node can be deleted', () => {
    const findings = redundancyCheck(powerSchematic(POWER))
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((f) => f.severity === 'pass')).toBe(true)
  })

  it('feeds every critical load from both halves and the electrolyzer from one', () => {
    // The electrolyzer is the deliberate exception: it is the load that gets
    // shed first and misses nothing, so duplicating its feed would be mass
    // spent on the one thing that does not need it.
    const s = powerSchematic(POWER)
    const feedersOf = (id: string) => s.flows.filter((f) => f.to === id).map((f) => f.from)
    expect(feedersOf('habitat').sort()).toEqual(['bus-a', 'bus-b'])
    expect(feedersOf('propulsion').sort()).toEqual(['bus-a', 'bus-b'])
    expect(feedersOf('electrolyzer')).toEqual(['bus-a'])
  })
})
