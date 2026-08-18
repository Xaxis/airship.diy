import { describe, expect, it } from 'vitest'

import {
  emergence,
  heaveResponse,
  quasiStaticSuspensionLoad,
  resonantWaveHeight,
} from '../src/index.js'
import { kg } from '@airship/units'

/**
 * What the sea actually does to a vehicle that floats on millimetres.
 *
 * Every intuition here comes from boats and seaplanes, and every one of them is
 * about a hull that carries its own weight. This one carries six hundred
 * kilograms of a twenty-six tonne vehicle, and almost everything follows from
 * that single fact.
 */

/** @derived Gondola, contents and the water's added mass on the immersed hull, kg. */
const GONDOLA = kg(4000)
/** @derived Waterplane area of the gondola hulls, m2. */
const WATERPLANE = 24
/** @derived Static heaviness the vehicle rests at, kg. */
const TRIM = kg(600)
/** @derived A stiff suspension, N/m. */
const STIFF = 1e6
/** @derived Envelope heave inertia including added mass, kg. */
const ENVELOPE = 64000

describe('what actually oscillates', () => {
  it('is the whole vehicle, not the gondola alone', () => {
    // The envelope was treated as ground because its inertia is an order of
    // magnitude larger. That is the wrong test: what decides whether a body
    // acts as ground is its inertial IMPEDANCE at the forcing frequency against
    // the stiffness connecting to it. At wave frequencies the envelope's
    // m * omega^2 is around 60 kN/m against a 1 MN/m suspension, so it is a
    // nearly free mass the suspension drags along, and the two heave as one.
    const r = heaveResponse(4, GONDOLA, STIFF, WATERPLANE, ENVELOPE, TRIM)
    expect(r.oscillatingMass).toBeGreaterThan(ENVELOPE)
    expect(r.naturalPeriod).toBeGreaterThan(3)
    expect(r.naturalPeriod).toBeLessThan(4)
  })

  it('resonates in a SMOOTH sea, which is backwards from the intuition', () => {
    // A heave period of three and a half seconds is excited by short waves, not
    // long ones. So the vehicle rides a gale and is bad in a chop.
    const chop = heaveResponse(2, GONDOLA, STIFF, WATERPLANE, ENVELOPE, TRIM)
    const gale = heaveResponse(6, GONDOLA, STIFF, WATERPLANE, ENVELOPE, TRIM)
    expect(chop.regime).toBe('near resonance')
    expect(gale.regime).toBe('follows the sea')
    expect(chop.frequencyRatio).toBeGreaterThan(gale.frequencyRatio)
  })
})

describe('the suspension load, which is a bracket rather than a number', () => {
  it('cannot be taken from the linear model, because the float leaves the water', () => {
    // rho * g * A is the restoring force of a CONTINUOUSLY IMMERSED float. This
    // one draws about twenty millimetres because the vehicle is nearly
    // neutrally buoyant, and the relative motion is hundreds. Water can push
    // and it cannot pull, so the linear spring is not in contact for part of
    // every cycle in every sea state.
    for (const seaState of [2, 3, 4, 5, 6]) {
      const r = heaveResponse(seaState, GONDOLA, STIFF, WATERPLANE, ENVELOPE, TRIM)
      expect(`${seaState}: ${r.contactMaintained}`).toBe(`${seaState}: false`)
      expect(r.draught).toBeLessThan(0.05)
    }
  })

  it('brackets it between following the surface and taking the crest', () => {
    const r = heaveResponse(4, GONDOLA, STIFF, WATERPLANE, ENVELOPE, TRIM)
    expect(r.quasiStaticLoad).toBeLessThan(r.fullImmersionLoad)
    // And the lower bound is the standalone helper, on the same inertia.
    expect(r.quasiStaticLoad).toBeCloseTo(quasiStaticSuspensionLoad(ENVELOPE, 4), 6)
    // And both are tens of kilonewtons, not the five this module used to report
    // by treating the envelope as ground and the springs as being in series.
    expect(r.quasiStaticLoad).toBeGreaterThan(20e3)
  })

  it('grows with the sea at the upper bound, which is what sets the limit', () => {
    // The old model said the load does not grow with sea state at all. That was
    // a tautology of an assumed T = C * sqrt(Hs): omega^2 * A is then constant
    // for ANY C. Against the tabulated periods, and at the bound that does not
    // assume the vehicle follows, it grows by an order of magnitude.
    const smooth = heaveResponse(2, GONDOLA, STIFF, WATERPLANE, ENVELOPE, TRIM)
    const rough = heaveResponse(6, GONDOLA, STIFF, WATERPLANE, ENVELOPE, TRIM)
    expect(rough.fullImmersionLoad / smooth.fullImmersionLoad).toBeGreaterThan(10)
  })
})

describe('resonance, which inverts the usual isolation intuition', () => {
  it('moves into BIGGER seas as the suspension softens', () => {
    // Vibration isolation says soften the mount to get below the forcing. Here
    // softening lowers the coupled mode and walks the resonance up the sea
    // state table towards waves the vehicle will actually meet.
    const soft = resonantWaveHeight(GONDOLA, 5e4, WATERPLANE, ENVELOPE)
    const rigid = resonantWaveHeight(GONDOLA, Infinity, WATERPLANE, ENVELOPE)
    expect(soft).toBeGreaterThan(rigid)
  })

  it('cannot be put on a ripple at any stiffness', () => {
    // Which is the correction. The old model said a stiff suspension parks the
    // resonance below 6 cm of significant height, where there is no energy to
    // excite it. That came from treating the envelope as ground: the mass on
    // the waterplane is sixteen times larger than the gondola alone, and even
    // rigidly coupled the resonance sits at about half a metre, which is a
    // slight sea.
    const rigid = resonantWaveHeight(GONDOLA, Infinity, WATERPLANE, ENVELOPE)
    expect(rigid).toBeGreaterThan(0.3)
  })
})

describe('emergence, which is the real load case', () => {
  it('lifts the float clear in every sea, because it floats on millimetres', () => {
    for (const seaState of [2, 3, 4, 5, 6]) {
      const e = emergence(seaState, TRIM, GONDOLA, STIFF, WATERPLANE, ENVELOPE)
      expect(`${seaState}: ${e.emerges}`).toBe(`${seaState}: true`)
      expect(e.draught).toBeLessThan(0.05)
    }
  })

  it('sets it down well below a seaplane, but not gently', () => {
    // A seaplane arrives at several metres per second and that is why it slams.
    // This arrives at tenths of a metre per second, so it does not slam, but
    // "millimetres per second" was an artefact of a re-entry velocity written
    // as omega * (Z - d), which goes to zero exactly where the physics does
    // not: a float that barely clears the water re-enters at close to its full
    // relative velocity. The correct crossing velocity is omega * sqrt(Z^2 - d^2).
    for (const seaState of [2, 3, 4, 5, 6]) {
      const e = emergence(seaState, TRIM, GONDOLA, STIFF, WATERPLANE, ENVELOPE)
      expect(`${seaState}: ${e.reentryVelocity < 1.5}`).toBe(`${seaState}: true`)
      expect(`${seaState}: ${e.impactPressure < 20e3}`).toBe(`${seaState}: true`)
    }
  })

  it('stays immersed if the vehicle is landed heavy enough', () => {
    // Which is the other half of the trade: a heavier trim buys immersion and
    // costs everything the gear and the propulsors have to carry.
    const heavy = emergence(4, kg(20000), GONDOLA, STIFF, WATERPLANE)
    expect(heavy.emerges).toBe(false)
  })
})
