// Render the Open Graph card to a real PNG.
//
// WHY A FILE AND NOT next/og. This site is a static export, so there is no
// runtime to answer an `opengraph-image` route with an ImageResponse. A crawler
// asking for the card gets whatever is on disk, so the card has to be on disk.
//
// It is drawn from the SAME numbers the site publishes, through the model
// bridge, so the card cannot advertise a vehicle the pages do not describe. A
// social card is the first thing anybody sees and the last thing anybody thinks
// to regenerate.
//
// Drives the Chrome the repo already drives, with no dependency beyond it.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BASELINE, BASELINE_ARRANGEMENT, consumables, massStatement } from '../packages/model/dist/index.js'
import { integrateMission } from '../packages/solvers/dist/index.js'

/** @derived The Open Graph card size every platform crops from. */
const WIDTH = 1200
const HEIGHT = 630
/** @derived Retina, because these are shown at 2x on most timelines. */
const SCALE = 2

const mass = massStatement(BASELINE, BASELINE_ARRANGEMENT)
const mission = integrateMission(BASELINE, consumables(BASELINE_ARRANGEMENT), 2200)

const n = (x, d = 0) =>
  x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const FACTS = [
  [n(BASELINE.hull.length), 'm hull'],
  [n(mission.physicalEnduranceDays), 'days aloft'],
  [n(mass.total / 1000, 1), 't gross'],
  ['2', 'crew'],
]

const html = `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${WIDTH}px;height:${HEIGHT}px;background:#0a0c0f;color:#e6edf3;
       font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       display:flex;flex-direction:column;justify-content:space-between;
       padding:64px 72px;position:relative;overflow:hidden}
  .rule{position:absolute;left:0;right:0;height:1px;background:#232b35}
  .mark{display:flex;align-items:center;gap:18px}
  .word{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;
        letter-spacing:.22em;color:#6ba8e5}
  h1{font-size:66px;line-height:1.06;letter-spacing:-.022em;font-weight:500;max-width:16.5em}
  .sub{margin-top:22px;font-size:25px;line-height:1.45;color:#9aa7b4;max-width:23em}
  .facts{display:flex;gap:56px;align-items:baseline}
  .fact .v{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:40px;color:#e6edf3}
  .fact .l{font-size:18px;color:#61707f;margin-top:6px;letter-spacing:.04em}
  .glow{position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;
        background:radial-gradient(circle,rgba(107,168,229,.12),transparent 68%)}
</style>
<div class="glow"></div>
<div class="rule" style="top:0"></div>
<div class="mark">
  <svg width="46" height="46" viewBox="0 0 32 32" fill="none" style="color:#6ba8e5">
    <ellipse cx="15.5" cy="12.6" rx="11" ry="4.4" fill="currentColor"/>
    <path d="M26 12.6 L30 8.6 L30 16.6 Z" fill="currentColor" opacity=".7"/>
    <rect x="12" y="16.4" width="7" height="2.3" rx="1.15" fill="currentColor"/>
    <line x1="3.5" y1="20.4" x2="28.5" y2="20.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".45"/>
    <line x1="6.5" y1="24" x2="25.5" y2="24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".25"/>
  </svg>
  <span class="word">AIRSHIP.DIY</span>
</div>
<div>
  <h1>A hydrogen airship you can build in a shop and then never have to land.</h1>
  <p class="sub">The complete parametric model, every number traced to a source, and the ones that are guesses marked as guesses.</p>
</div>
<div class="facts">
  ${FACTS.map(([v, l]) => `<div class="fact"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}
</div>
<div class="rule" style="bottom:0"></div>`

const CHROME =
  process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'airship-og-'))
const PORT = 9336

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const cleanup = () => {
  chrome.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

const waitFor = async (probe, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await probe().catch(() => null)
    if (r) return r
    await new Promise((s) => setTimeout(s, 200))
  }
  throw new Error('Chrome did not come up')
}

const main = async () => {
  const target = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    return (await res.json()).find((t) => t.type === 'page') ?? null
  }, 20000)

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let id = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: SCALE,
    mobile: false,
  })
  await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` })
  await new Promise((s) => setTimeout(s, 900))

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: SCALE },
  })

  const out = new URL('../apps/web/public/og.png', import.meta.url).pathname
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`wrote ${out} (${WIDTH}x${HEIGHT} at ${SCALE}x)`)
  ws.close()
}

main()
  .then(cleanup)
  .catch((error) => {
    cleanup()
    console.error(String(error?.message ?? error))
    process.exit(1)
  })
