// The research queue: what to go and measure first.
//
// Every value the model does not actually know, ranked BY HOW MUCH IT MOVES THE
// ENDURANCE NUMBER, which is what CLAUDE.md has always said this report does
// and what it did not do. It sorted by relative range width instead, labelled
// as a proxy "until the phase 2 mission integrator arrives". The integrator
// arrived several phases ago and nothing came back to finish this.
//
// The difference is not cosmetic. Range width says the most urgent unknown is
// whichever number is quoted loosest, which flatters wide bands on quantities
// nothing depends on and buries narrow bands on quantities everything does.
// What a person with a test budget needs to know is which measurement changes
// the answer.
//
// HOW IT WORKS. Each value is swept to its low and its high in a FRESH PROCESS,
// because several are read into module-scope constants at import time and an
// in-process override would silently fail to move those. See the `sweep` note in
// packages/data/src/citation.ts.
import { execFile } from 'node:child_process'
import { cpus } from 'node:os'
import { allUncertain, allProvenanced, SOURCES, sourceExists } from '../packages/data/dist/index.js'

const uncertain = allUncertain()
const all = allProvenanced()

/**
 * `--fast` does the citation integrity checks and skips the sweep.
 *
 * The sweep spawns two processes per uncertain value and takes a couple of
 * minutes, which is too slow for `make check` to run on every save. The
 * INTEGRITY half is instantaneous and is the part that must never be skipped: a
 * source id that does not resolve is a citation that looks real and is not.
 */
const fast = process.argv.includes('--fast')

const probe = (sweep) =>
  new Promise((resolve) => {
    execFile(
      'node',
      [new URL('_probe-endurance.mjs', import.meta.url).pathname],
      { env: sweep ? { ...process.env, AIRSHIP_SWEEP: sweep } : process.env, timeout: 120_000 },
      (error, stdout) => {
        if (error) return resolve({ ok: false, error: String(error.message) })
        try {
          resolve(JSON.parse(stdout.trim().split('\n').pop()))
        } catch {
          resolve({ ok: false, error: 'probe produced no result' })
        }
      },
    )
  })

/** @derived Probes in flight at once. The work is CPU bound and each is a whole module graph. */
const CONCURRENCY = Math.max(2, Math.min(8, cpus().length - 2))

const mapLimit = async (items, limit, run) => {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      results[i] = await run(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

console.log('\n%d provenanced values, %d of them uncertain.\n', all.length, uncertain.length)

const baseline = fast ? { ok: true, unread: [] } : await probe(null)
if (!baseline.ok) {
  console.error('The model does not run at its own design point: %s', baseline.error)
  process.exit(1)
}
if (!fast) console.log(
  'Design point: %d days, limited by %s. Lift margin %s kg. %d failing gates.\n',
  baseline.days,
  baseline.limit,
  Math.round(baseline.liftMargin).toLocaleString('en-US'),
  baseline.failures,
)

if (!fast) console.log('Sweeping %d values, both ends, %d at a time...\n', uncertain.length, CONCURRENCY)

const swept = fast ? [] : await mapLimit(uncertain, CONCURRENCY, async (entry) => {
  const key = `${entry.path}#${entry.ordinal}`
  const [low, high] = await Promise.all([probe(`${key}=low`), probe(`${key}=high`)])
  const span = low.ok && high.ok ? Math.abs(high.days - low.days) : null
  const massSpan = low.ok && high.ok ? Math.abs(high.liftMargin - low.liftMargin) : null
  // A value that BREAKS the design at either end matters more than one that
  // merely moves the endurance, however far.
  const breaks =
    (low.ok ? low.failures : 0) > baseline.failures || (high.ok ? high.failures : 0) > baseline.failures
  return { ...entry, key, low, high, span, massSpan, breaks }
})

const ranked = [...swept].sort((a, b) => {
  if (a.breaks !== b.breaks) return a.breaks ? -1 : 1
  if (a.span === null || b.span === null) return a.span === null ? 1 : -1
  if (b.span !== a.span) return b.span - a.span
  return (b.massSpan ?? 0) - (a.massSpan ?? 0)
})

const movers = ranked.filter((e) => e.breaks || (e.span ?? 0) > 0 || (e.massSpan ?? 0) > 1)
const inert = ranked.filter(
  (e) => !e.breaks && e.span !== null && (e.span ?? 0) === 0 && (e.massSpan ?? 0) <= 1,
)
const failed = ranked.filter((e) => e.span === null && !e.breaks)

// The unread set is whatever the baseline probe could not reach after
// exercising the whole model. Reported separately because a citation nothing
// reads is a different fault from one that is read and does not matter.
const unreadKeys = new Set(baseline.unread ?? [])
const deadUncertain = uncertain.filter((e) => unreadKeys.has(`${e.path}#${e.ordinal}`))

if (movers.every((e) => (e.span ?? 0) === 0)) {
  console.log('NOTE: no unknown moves the ENDURANCE number at all, because endurance')
  console.log('is limited by FOOD ABOARD, which is a loading choice rather than an')
  console.log('unknown. What the unknowns move is the LIFT MARGIN, and that is what')
  console.log('the ranking below falls back to. A value that eats the margin forces a')
  console.log('longer hull, which is how an unknown reaches the endurance eventually.\n')
}

if (fast) console.log('Citation integrity only (--fast). Run `make uncertainty` for the sweep.\n')

if (!fast) console.log('=== WHAT TO MEASURE FIRST ===\n')
if (movers.length === 0) console.log('  Nothing measured moves the endurance number.\n')

for (const e of movers) {
  const width = ((e.value.high - e.value.low) / Math.abs(e.value.nominal || 1)) * 100
  const lo = e.low.ok ? `${e.low.days} d` : 'DID NOT RUN'
  const hi = e.high.ok ? `${e.high.days} d` : 'DID NOT RUN'
  console.log('  %s  [+/-%s%%]', `${e.path}#${e.ordinal}`, (width / 2).toFixed(0))
  console.log(
    '    %s to %s (nominal %s) %s',
    e.value.low,
    e.value.high,
    e.value.nominal,
    e.value.unit,
  )
  console.log(
    '    endurance %s to %s (spans %s days) | lift margin spans %s kg%s',
    lo,
    hi,
    e.span === null ? '?' : e.span,
    e.massSpan === null ? '?' : Math.round(e.massSpan).toLocaleString('en-US'),
    e.breaks ? '   *** BREAKS A GATE AT ONE END ***' : '',
  )
  if (e.breaks) {
    const which = []
    if (e.low.ok && e.low.failures > baseline.failures) which.push(`low (${e.low.failures} failing)`)
    if (e.high.ok && e.high.failures > baseline.failures)
      which.push(`high (${e.high.failures} failing)`)
    console.log('    the design does not close at: %s', which.join(', '))
  }
  console.log('    why unknown: %s', e.value.reason)
  console.log('    resolved by: %s', e.value.resolvedBy)
  console.log()
}

if (inert.length > 0) {
  console.log(
    '=== MEASURED AND FOUND NOT TO MATTER (%d) ===\n',
    inert.length,
  )
  console.log('  These move the endurance number by zero days across their full range.')
  console.log('  That is a RESULT, not an omission: it is the list not to spend a')
  console.log('  test budget on. Several of them still set cost or mass.\n')
  for (const e of inert) {
    console.log(
      '  %s %s %s',
      `${e.path}#${e.ordinal}`.padEnd(30),
      `${e.value.low} to ${e.value.high}`.padEnd(24),
      e.value.unit,
    )
  }
  console.log()
}

if (deadUncertain.length > 0) {
  console.log('=== DECLARED AS RESEARCH ITEMS AND READ BY NOTHING (%d) ===\n', deadUncertain.length)
  console.log('  The model never asked for these while running everything it has. Some')
  console.log('  are catalogue entries for options not selected, which is expected: the')
  console.log('  engines and films tables describe more than one product. The rest are')
  console.log('  a defect, because a citation nothing reads is a decoration that still')
  console.log('  appears in this queue as though the model depended on it.\n')
  console.log('  This check found the array module areal mass declared here as')
  console.log('  uncertain(0.5 / 1.2 / 2.5) and read by nobody, while the design point')
  console.log('  carried a bare 2.6 for the same quantity, above the top of its own')
  console.log('  documented range.\n')
  for (const e of deadUncertain) {
    console.log(
      '  %s %s %s',
      `${e.path}#${e.ordinal}`.padEnd(30),
      `${e.value.low} to ${e.value.high}`.padEnd(24),
      e.value.unit,
    )
  }
  console.log()
}

if (failed.length > 0) {
  console.log('=== COULD NOT BE SWEPT (%d) ===\n', failed.length)
  console.log('  The model failed to run at one end of these. That is usually a real')
  console.log('  finding: the range includes values the model cannot represent.\n')
  for (const e of failed) {
    const why = (!e.low.ok && e.low.error) || (!e.high.ok && e.high.error) || 'unknown'
    console.log('  %s %s', `${e.path}#${e.ordinal}`.padEnd(30), String(why).slice(0, 90))
  }
  console.log()
}

// Integrity: every cited source id must resolve. A typo in a source id is a
// citation that looks real and is not, which is worse than no citation.
let broken = 0
for (const { path, value } of all) {
  const id = value.source
  if (id && !sourceExists(id)) {
    console.error('BROKEN CITATION: %s references unknown source "%s"', path, id)
    broken += 1
  }
}

// The reverse check: a source nobody cites is either dead weight or a sign that
// something was written from it and then attributed to something else.
const citedIds = new Set(all.map((e) => e.value.source).filter(Boolean))
const uncited = SOURCES.filter((s) => !citedIds.has(s.id))
if (uncited.length > 0) {
  console.log('Sources in the bibliography that nothing cites yet (%d):', uncited.length)
  for (const s of uncited) console.log('  %s', s.id)
  console.log()
}

if (broken > 0) {
  console.error('\n%d broken citation(s).\n', broken)
  process.exit(1)
}

console.log('All citations resolve.\n')
