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

  it('puts every source and every load on one bus', () => {
    // The architecture decision: nothing drives a propeller mechanically, which
    // is what lets the engine sit aft for the exhaust rule while the propulsors
    // sit where they are aerodynamically useful.
    const bus = schematic.nodes.find((n) => n.id === 'bus')
    expect(bus?.critical).toBe(true)
    const throughBus = schematic.flows.filter((f) => f.to === 'bus' || f.from === 'bus')
    expect(throughBus.length).toBeGreaterThan(6)
  })

  it('gives the habitat load four independent sources', () => {
    const findings = redundancyCheck(schematic)
    const habitat = findings.find((f) => f.id === 'redundancy-habitat')
    expect(habitat?.severity).toBe('pass')
  })

  it('fails a load with only one path, however many sources exist', () => {
    // Two sources behind one converter is ONE path. That is the mistake this
    // check counts rather than assumes.
    const single = {
      ...schematic,
      flows: schematic.flows.filter((f) => f.to !== 'bus' || f.from === 'array'),
    }
    const habitat = redundancyCheck(single).find((f) => f.id === 'redundancy-habitat')
    expect(habitat?.severity).toBe('fail')
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
