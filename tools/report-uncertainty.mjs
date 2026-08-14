// The research queue.
//
// Every value the model does not actually know, with its range and with a
// statement of what measurement would resolve it. The brief asks for this
// sorted by how much each value moves the endurance number, which requires an
// endurance number: that arrives in phase 2. Until then this sorts by relative
// range width, which is a proxy and is labelled as one rather than presented as
// the real thing.
import { allUncertain, allProvenanced, SOURCES, sourceExists } from '../packages/data/dist/index.js'

const uncertain = allUncertain()
const all = allProvenanced()

console.log('\n%d provenanced values, %d of them uncertain.\n', all.length, uncertain.length)

if (uncertain.length === 0) {
  console.log('No Uncertain values declared yet.\n')
} else {
  const ranked = [...uncertain].sort((a, b) => {
    const width = (e) => (e.value.high - e.value.low) / Math.abs(e.value.nominal || 1)
    return width(b) - width(a)
  })

  console.log('Ranked by relative range width (a PROXY for endurance sensitivity,')
  console.log('which needs the phase 2 mission integrator to compute properly):\n')

  for (const { path, value } of ranked) {
    const width = ((value.high - value.low) / Math.abs(value.nominal || 1)) * 100
    console.log('  %s', `${path}  [+/-${(width / 2).toFixed(0)}%]`)
    console.log('    %s to %s (nominal %s) %s', value.low, value.high, value.nominal, value.unit)
    console.log('    why unknown: %s', value.reason)
    console.log('    resolved by: %s', value.resolvedBy)
    console.log()
  }
}

// Integrity: every cited source id must resolve. A typo in a source id is a
// citation that looks real and is not, which is worse than no citation.
let broken = 0
for (const { path, value } of all) {
  const id = value.kind === 'measured' ? value.source : value.source
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
