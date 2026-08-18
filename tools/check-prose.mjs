// Documentation style checks.
//
// Two rules, both of which exist because a violation is a real defect rather
// than a matter of taste.
//
// The em dash ban is inherited from nullroute and is purely house style, kept
// so that a person reading both repositories reads one voice.
//
// The bare "hybrid" ban is not style. In airship literature the word means
// hybrid LIFT, and this vehicle is fully buoyant. A document that is ambiguous
// about whether the ship needs forward speed to stay up is a document that
// cannot be checked. Lint enforces this in code; this enforces it in prose.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['docs', 'apps']
const TOP_LEVEL = ['README.md', 'CLAUDE.md']
const EXTENSIONS = new Set(['.md', '.mdx'])

// Qualified spellings, including the markdown-emphasised forms the terminology
// document uses when it contrasts the two meanings.
const QUALIFIED = /hybrid(?:Lift|Propulsion|-lift|-propulsion| \*?lift\*?| \*?propulsion\*?)/gi

// Use versus mention. A document that explains why the bare word is banned has
// to be able to write it, and every legitimate case is the word being quoted,
// emphasised, or set in code rather than used as a description of the vehicle.
const MENTIONED = /(["`*_])[^"`*_]*hybrid[^"`*_]*\1/gi

const BARE = /\bhybrid\b/i

const walk = (dir, out = []) => {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(extname(full))) out.push(full)
  }
  return out
}

const files = [...TOP_LEVEL, ...ROOTS.flatMap((r) => walk(r))]

let problems = 0

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  // Skip blocks written by other people's tools. `next dev` writes an agent
  // rules block into apps/web/AGENTS.md on every run and re-adds it when it is
  // removed, so holding it to this project's style is a fight with a generator
  // rather than a check on anything anybody wrote.
  let generated = false

  text.split('\n').forEach((line, index) => {
    const where = `${file}:${index + 1}`

    if (/<!--\s*BEGIN:[a-z0-9-]+\s*-->/i.test(line)) generated = true
    if (/<!--\s*END:[a-z0-9-]+\s*-->/i.test(line)) {
      generated = false
      return
    }
    if (generated) return

    if (line.includes('—')) {
      console.error('%s  em dash. Use a comma, a colon, parentheses, or two sentences.', where)
      problems += 1
    }

    // Strip qualified spellings and mentions, then look at what is left. What
    // remains is the word used bare to describe this vehicle, which is the
    // thing that is actually ambiguous.
    const stripped = line.replace(QUALIFIED, '').replace(MENTIONED, '')
    if (BARE.test(stripped)) {
      console.error('%s  bare "hybrid". Write hybridPropulsion or hybridLift.', where)
      problems += 1
    }
  })
}

if (problems > 0) {
  console.error('\n%d prose problem(s) across %d files.\n', problems, files.length)
  process.exit(1)
}

console.log('Prose OK across %d files.', files.length)
