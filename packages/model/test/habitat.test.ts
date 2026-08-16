import { describe, expect, it } from 'vitest'

import { assessHabitat, assessRoom, BASELINE_ARRANGEMENT, FITOUT } from '../src/index.js'

/**
 * The inside of the rooms.
 *
 * Volume per person says nothing about whether you can stand up, put a pan
 * down, or get out. These are the checks that a cubic metre figure cannot make.
 */

const HABITAT = assessHabitat(BASELINE_ARRANGEMENT, 5)

describe('the rooms', () => {
  it('clears the marine accommodation minimum in every space', () => {
    // 2.3 m of structural height less 200 mm of sole and deckhead lining is
    // 2.10, against the 2.03 m MLC minimum for a vessel somebody lives on.
    // 1.9 m is what a boat gets away with for a fortnight; a year is exactly
    // the case the standard was written for.
    for (const room of HABITAT.rooms) {
      expect(`${room.name}: ${room.headroom.toFixed(2)}`).toBe(`${room.name}: 2.10`)
    }
  })

  it('leaves at least half the sole free to move in', () => {
    for (const room of HABITAT.rooms) {
      expect(`${room.name}: ${room.freeFraction > 0.5}`).toBe(`${room.name}: true`)
    }
  })

  it('flags a room whose fittings cover too much of the floor', () => {
    const compartment = BASELINE_ARRANGEMENT.compartments.find((c) => c.id === 'head')!
    const crowded = {
      compartmentId: 'head',
      fittings: [
        { id: 'a', name: 'Too much', kind: 'appliance' as const, footprint: 4, volume: 0, mass: 10 },
      ],
    }
    const assessment = assessRoom(compartment, crowded)
    expect(assessment.findings.some((f) => f.includes('edge around'))).toBe(true)
  })

  it('demands two exits from a sleeping space and not from a galley', () => {
    // A galley in a linear gondola is a passage with a hob in it. Demanding two
    // exits from every room fires on every room and means nothing.
    const cabin = HABITAT.rooms.find((r) => r.compartmentId === 'cabin')
    const galley = HABITAT.rooms.find((r) => r.compartmentId === 'galley')
    expect(cabin?.sleeps).toBeGreaterThan(0)
    expect(cabin?.findings).toEqual([])
    expect(galley?.sleeps).toBe(0)
    expect(galley?.findings).toEqual([])
  })

  it('flags a berth with one way out', () => {
    const compartment = BASELINE_ARRANGEMENT.compartments.find((c) => c.id === 'cabin')!
    const trapped = {
      compartmentId: 'cabin',
      fittings: [
        {
          id: 'berth',
          name: 'Berth',
          kind: 'berth' as const,
          sleeps: 2,
          footprint: 2.8,
          volume: 1.4,
          mass: 68,
        },
        { id: 'way', name: 'Door', kind: 'passage' as const, footprint: 1, volume: 0, mass: 0 },
      ],
    }
    expect(assessRoom(compartment, trapped).findings.some((f) => f.includes('one way out'))).toBe(
      true,
    )
  })
})

describe('the habitat as a whole', () => {
  it('sleeps three for a crew of two', () => {
    // The spare is the settee. Over a year there has to be somewhere for one of
    // them to sleep when the other is ill, working or awake at the wrong time.
    const finding = HABITAT.findings.find((f) => f.includes('Sleeps'))
    expect(finding).toContain('Sleeps 3')
  })

  it('has two independent ways out of the accommodation', () => {
    const finding = HABITAT.findings.find((f) => f.includes('ways out'))
    expect(finding).toContain('2 independent')
  })

  it('has lockers for the stores in daily use', () => {
    const finding = HABITAT.findings.find((f) => f.includes('lockers'))
    expect(finding).toContain('rest lives in the keel')
  })

  it('reconciles the itemised fitout against the mass the arrangement carries', () => {
    // Two routes to the same number. The arrangement is the authority because
    // the lift figure is built on it.
    expect(HABITAT.totalFitoutMass).toBeGreaterThan(HABITAT.arrangementMass * 0.75)
    expect(HABITAT.totalFitoutMass).toBeLessThan(HABITAT.arrangementMass * 1.25)
  })

  it('gives about fifty square metres of floor to two people', () => {
    expect(HABITAT.totalFloorArea).toBeGreaterThan(40)
    expect(HABITAT.totalFloorArea).toBeLessThan(65)
  })

  it('fits out every room the arrangement calls habitable in the gondola', () => {
    const habitable = BASELINE_ARRANGEMENT.compartments.filter(
      (c) => c.deck === 'gondola' && c.netHabitable,
    )
    expect(FITOUT.length).toBe(habitable.length)
  })
})
