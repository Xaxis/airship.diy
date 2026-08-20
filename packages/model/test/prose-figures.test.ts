import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { BASELINE, BASELINE_ARRANGEMENT, LANDING_TRIM, massStatement } from '../src/index.js'

/**
 * Figures that appear in PROSE inside the physics packages, checked against the
 * model that produces them.
 *
 * WHY THIS IS NEEDED AND WHY IT LOOKS ODD. The repository's founding rule is
 * that a number appearing in both prose and the solver is a defect. The
 * dependency rule makes that impossible to enforce the obvious way in `core`,
 * which may not import a design point, so a core docstring that illustrates a
 * point with "the baseline is 115 m" has nothing keeping it true.
 *
 * They duly went stale. `boat.ts` described the vehicle as 115 m, trimmed 500 kg
 * heavy, massing 24,516 kg on 32,968 m3 of gas, long after those were 118 m,
 * 600 kg, 25,772 kg and 34,271 m3. Nothing failed, because nothing read them.
 *
 * This test closes the loop from the model tier, which IS allowed to know both.
 * Each case asserts two things: that the model still produces the figure, and
 * that the docstring still contains it. Move the design and the first fails.
 * Fix the model figure and the second fails until the prose is updated too.
 */

const CORE = join(dirname(fileURLToPath(import.meta.url)), '../../core/src')
const read = (relative: string) => readFileSync(join(CORE, relative), 'utf8')

const MASS = massStatement(BASELINE, BASELINE_ARRANGEMENT)

describe('prose in packages/core that quotes the baseline', () => {
  it('has boat.ts quoting the hull length the model uses', () => {
    expect(BASELINE.hull.length).toBe(118)
    expect(read('marine/boat.ts')).toContain('118 m sail')
    expect(read('marine/boat.ts')).toContain('118 m envelope')
  })

  it('has boat.ts quoting the landing trim the arrangement uses', () => {
    expect(LANDING_TRIM).toBe(600)
    expect(read('marine/boat.ts')).toContain('trimmed 600 kg heavy')
  })

  it('has boat.ts quoting the heave inertia the model computes', () => {
    // THE WORKED EXAMPLE THAT DRIFTED FURTHEST, because it is three numbers
    // multiplied together and every one of them moved.
    const ship = Math.round(MASS.total)
    const gas = Math.round(MASS.gasVolume)
    expect(ship).toBe(25772)
    expect(gas).toBe(34271)

    const text = read('marine/boat.ts')
    expect(text).toContain('25,772 kg plus')
    expect(text).toContain('34,271 = 37,543 kg of air')
    expect(text).toContain('63,314 kg of effective heave inertia')
  })

  it('quotes ONE cushion pressure for the XC-8A, not two', () => {
    // It carried 8,200 Pa in one docstring and 8,140 in another forty lines
    // down, for the same aircraft, with only the second citing its source. A
    // rounded paraphrase and a measurement are indistinguishable once they are
    // both sitting in comments.
    const text = read('marine/boat.ts')
    expect(text).not.toContain('8,200 Pa')
    expect(text).not.toContain('16,400 Pa')
    expect(text).toContain('8,140 Pa')
  })
})
