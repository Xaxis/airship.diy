// Is what is LIVE what this tree would build?
//
// WHY THIS EXISTS. The site sat several commits stale for a day and nobody
// noticed, because the Vercel project has no Git link: pushing to GitHub never
// deployed anything, and `make deploy` was broken in a way that failed quietly.
// Every check in this repository verified the model and none of them verified
// that the model the public can read is the model in the tree.
//
// It compares the NUMBERS, not the markup. Next.js emits fresh chunk hashes on
// every build, so comparing bytes would report drift constantly and teach
// everyone to ignore it. What matters is whether the published figures are the
// ones the solvers currently produce.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

/** @derived The routes whose numbers are the argument for the design. */
const ROUTES = ['', 'ship', 'energy', 'structure', 'water', 'flight', 'failure', 'build']

/** @derived Where production actually answers, which is not the apex domain. */
const LIVE = process.env.LIVE_ORIGIN ?? 'https://airship-diy.vercel.app'

const OUT = new URL('../apps/web/out/', import.meta.url).pathname

/**
 * Every number a reader can see, in order.
 *
 * Tags are stripped first, so an attribute or a chunk hash cannot enter. React
 * splits interpolated text with `<!-- -->` markers, which are comments and go
 * with the tags.
 */
const figuresOf = (html) => {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
  return (text.match(/-?\d[\d,]*\.?\d*/g) ?? []).map((n) => n.replace(/,/g, ''))
}

const fingerprint = (html) => {
  const figures = figuresOf(html)
  return { count: figures.length, hash: createHash('sha256').update(figures.join('|')).digest('hex').slice(0, 12), figures }
}

const localHtml = (route) => {
  const file = route === '' ? 'index.html' : `${route}.html`
  const path = `${OUT}${file}`
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

const fetchLive = async (route) => {
  const url = `${LIVE}/${route}`
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.text()
}

if (!existsSync(OUT) || readdirSync(OUT).length === 0) {
  console.error('No local build in apps/web/out. Run `make web-build` first.')
  process.exit(2)
}

let drifted = 0
let checked = 0
const rows = []

for (const route of ROUTES) {
  const local = localHtml(route)
  if (local === null) {
    rows.push(['skip', route || '/', 'no local build for this route'])
    continue
  }
  let live
  try {
    live = await fetchLive(route)
  } catch (error) {
    rows.push(['ERROR', route || '/', String(error.message)])
    drifted += 1
    continue
  }
  checked += 1
  const a = fingerprint(local)
  const b = fingerprint(live)
  if (a.hash === b.hash) {
    rows.push(['ok', route || '/', `${a.count} figures match`])
    continue
  }
  drifted += 1
  // Name the first figure that differs, because "the hashes differ" is not a
  // debuggable message.
  const limit = Math.min(a.figures.length, b.figures.length)
  let first = null
  for (let i = 0; i < limit; i += 1) {
    if (a.figures[i] !== b.figures[i]) {
      first = `first difference: tree has ${a.figures[i]}, live has ${b.figures[i]}`
      break
    }
  }
  if (first === null) first = `tree has ${a.figures.length} figures, live has ${b.figures.length}`
  rows.push(['DRIFT', route || '/', first])
}

const width = Math.max(...rows.map((r) => r[1].length))
for (const [state, route, detail] of rows) {
  console.log(`  ${state.padEnd(5)} ${route.padEnd(width)}  ${detail}`)
}
console.log()

if (drifted === 0) {
  console.log(`${checked} routes live at ${LIVE} carry exactly the figures this tree builds.`)
  process.exit(0)
}

console.log(
  `${drifted} of ${checked} routes DISAGREE with this tree.\n` +
    `The published model is not the model in the repository. Run \`make deploy\`.`,
)
process.exit(1)
