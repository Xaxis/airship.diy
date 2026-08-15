// Load every route at every width a real person uses, and assert it fits.
//
// THE FAILURE THIS CATCHES IS INVISIBLE FROM THE CODE. A table with six columns
// is correct CSS, correct HTML and correct data, and on a 375 px screen it
// pushes the whole document sideways so every paragraph on the page runs off the
// edge. Nothing in a type check, a unit test or a desktop screenshot sees it.
//
// It reports the OFFENDING ELEMENT, not just the overflow, because "the page is
// 40 px too wide" is not actionable and "the bill of materials table is 720 px
// wide inside a 375 px viewport" is.
//
//   node tools/check-responsive.mjs [origin]
//
// Defaults to the local static export, served from apps/web/out.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'

const ROUTES = [
  '/',
  '/ship',
  '/architecture',
  '/energy',
  '/structure',
  '/water',
  '/flight',
  '/failure',
  '/build',
  '/validation',
  '/open',
]

/**
 * The widths that matter, and why each one is here.
 *
 * 320 is the narrowest phone still in use (iPhone SE 1st gen, and any phone with
 * the display zoom setting on). 375 is the commonest iPhone logical width. 414
 * is the large iPhone. 768 is portrait iPad and the Tailwind md breakpoint. 1024
 * is landscape iPad and lg. Anything wider has never been the problem.
 */
const WIDTHS = [
  { width: 320, height: 720, mobile: true, label: 'small phone' },
  { width: 375, height: 812, mobile: true, label: 'phone' },
  { width: 414, height: 896, mobile: true, label: 'large phone' },
  { width: 768, height: 1024, mobile: true, label: 'tablet portrait' },
  { width: 1024, height: 768, mobile: false, label: 'tablet landscape' },
]

/** @source WCAG 2.2 target size (minimum), SC 2.5.8: 24 by 24 CSS pixels. */
const MINIMUM_TARGET = 24

const root = new URL('../apps/web/out/', import.meta.url).pathname
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
}

let origin = process.argv[2]
let server

if (!origin) {
  if (!existsSync(root)) {
    console.error(`No static export at ${root}. Run "make web-build" first.`)
    process.exit(1)
  }
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]))
    const candidates = [
      join(root, path),
      join(root, `${path}.html`),
      join(root, path, 'index.html'),
    ]
    const file = candidates.find((c) => existsSync(c) && statSync(c).isFile())
    if (!file) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
}

const CHROME =
  process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const profile = mkdtempSync(join(tmpdir(), 'airship-responsive-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9336',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const cleanup = () => {
  chrome.kill()
  server?.close()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))

const waitFor = async (probe, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await probe().catch(() => null)
    if (r) return r
    await new Promise((s) => setTimeout(s, 150))
  }
  throw new Error('timed out waiting for Chrome')
}

const target = await waitFor(async () => {
  const res = await fetch('http://127.0.0.1:9336/json/list')
  return (await res.json()).find((t) => t.type === 'page') ?? null
}, 15000)

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let id = 1
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = id++
    pending.set(n, resolve)
    ws.send(JSON.stringify({ id: n, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')

/**
 * What runs in the page.
 *
 * The overflow test walks every element and reports the ones that stick out,
 * skipping any that sit inside a scroll container of their own, because a table
 * that scrolls inside its box is the CORRECT answer to a wide table and flagging
 * it would train everyone to ignore this check.
 */
const AUDIT = `(() => {
  const vw = document.documentElement.clientWidth
  const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)

  const scrollsItself = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return true
    }
    return false
  }

  const overflowing = []
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right <= vw + 1 && r.left >= -1) continue
    if (scrollsItself(el)) continue
    const s = getComputedStyle(el)
    if (s.position === 'fixed') continue
    overflowing.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') ?? '').slice(0, 70),
      text: (el.textContent ?? '').trim().slice(0, 50),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
    })
  }

  // Keep only the OUTERMOST offenders. One wide table reports itself plus every
  // cell in it, and a hundred rows of the same defect is not a report.
  const outermost = overflowing.filter(
    (o, i) => !overflowing.some((p, j) => j !== i && p.left <= o.left && p.right >= o.right && p.width > o.width),
  )

  const small = []
  for (const el of document.querySelectorAll('a, button, summary, input, select')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    // Screen-reader-only skip links are 1x1 until focused, at which point they
    // are full size. Flagging them would be flagging the accessibility feature.
    if (r.width <= 2 || r.height <= 2) continue
    if (r.height >= ${MINIMUM_TARGET} && r.width >= ${MINIMUM_TARGET}) continue
    small.push({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().slice(0, 30),
      w: Math.round(r.width),
      h: Math.round(r.height),
    })
  }

  // A canvas that is taller than the viewport on a phone is a viewer nobody can
  // see around, which is a real defect even though nothing overflows.
  const tallCanvases = Array.from(document.querySelectorAll('canvas, svg')).map((c) => {
    const r = c.getBoundingClientRect()
    return { tag: c.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) }
  }).filter((c) => c.h > innerHeight * 1.05)

  return { vw, docWidth, overflow: docWidth - vw, outermost: outermost.slice(0, 8), small: small.slice(0, 8), tallCanvases: tallCanvases.slice(0, 4) }
})()`

let failures = 0
const report = []

for (const vp of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 2,
    mobile: vp.mobile,
  })

  for (const route of ROUTES) {
    await send('Page.navigate', { url: `${origin}${route}` })
    // Wait for the document to finish rather than for a fixed time. A page
    // measured mid-layout reports overflow that is not there, and a flaky
    // responsive check is worse than none because nobody believes it.
    await waitFor(async () => {
      const { result } = await send('Runtime.evaluate', {
        expression: 'document.readyState === "complete" && document.fonts.status === "loaded"',
        returnByValue: true,
      })
      return result?.value === true
    }, 15000).catch(() => null)
    await new Promise((r) => setTimeout(r, route === '/' || route === '/ship' ? 2000 : 500))

    const { result } = await send('Runtime.evaluate', { expression: AUDIT, returnByValue: true })
    const a = result?.value
    if (!a) {
      console.log(`  ${vp.width.toString().padStart(4)}  ${route.padEnd(14)} COULD NOT AUDIT`)
      failures += 1
      continue
    }

    const bad = a.overflow > 1 || a.small.length > 0 || a.tallCanvases.length > 0
    if (bad) failures += 1
    report.push({ vp, route, a, bad })

    const mark = bad ? 'FAIL' : 'ok  '
    console.log(
      `  ${mark} ${vp.width.toString().padStart(4)}px ${route.padEnd(14)} doc ${a.docWidth}px` +
        (a.overflow > 1 ? `  OVERFLOW +${a.overflow}px` : '') +
        (a.small.length ? `  ${a.small.length} tiny targets` : '') +
        (a.tallCanvases.length ? `  ${a.tallCanvases.length} oversize figures` : ''),
    )
    for (const o of a.outermost) {
      console.log(`         <${o.tag} class="${o.cls}"> ${o.width}px at x=${o.left}  "${o.text}"`)
    }
    for (const s of a.small) {
      console.log(`         tiny target <${s.tag}> ${s.w}x${s.h} "${s.text}"`)
    }
    for (const c of a.tallCanvases) {
      console.log(`         oversize <${c.tag}> ${c.w}x${c.h} against ${vp.height}px of viewport`)
    }
  }
}

console.log(
  `\n${report.length - failures} of ${report.length} route/width combinations fit. ` +
    `${failures} do not.`,
)

cleanup()
process.exit(failures > 0 ? 1 : 0)
