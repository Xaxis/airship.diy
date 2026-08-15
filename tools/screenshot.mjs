// Screenshot a region of the deployed site, so charts can be LOOKED AT.
//
// A palette validator checks colour and nothing else. Label collisions, clipped
// text, a curve that leaves its box, an axis that rounds to three identical
// ticks: none of those are visible from the code or from a passing test. The
// only way to catch them is to render the thing and look.
//
//   node tools/screenshot.mjs <url> <css-selector> <output.png> [click-text ...]
//
// Trailing arguments are button labels to click before the shot, in order, so a
// view that only appears after an interaction can still be looked at. Clicking
// is how you check the state a static build never renders.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, selector, output, ...clicks] = process.argv.slice(2)

// Width and height come from the environment so the same tool can look at the
// desktop layout and the phone layout. A responsive defect is only visible at
// the width it happens at, and hardcoding 1400 px means never seeing one.
const VIEW_WIDTH = Number(process.env['SHOT_WIDTH'] ?? 1400)
const VIEW_HEIGHT = Number(process.env['SHOT_HEIGHT'] ?? 2000)
if (!url || !output) {
  console.error('usage: node tools/screenshot.mjs <url> [selector] <output.png>')
  process.exit(1)
}

const CHROME =
  process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const profile = mkdtempSync(join(tmpdir(), 'airship-shot-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9334',
    `--window-size=${VIEW_WIDTH},${VIEW_HEIGHT}`,
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
  throw new Error('timed out')
}

const main = async () => {
  const target = await waitFor(async () => {
    const res = await fetch('http://127.0.0.1:9334/json/list')
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    deviceScaleFactor: 2,
    mobile: VIEW_WIDTH < 900,
  })
  await send('Page.navigate', { url })
  await new Promise((r) => setTimeout(r, 6000))

  for (const label of clicks) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const wanted = ${JSON.stringify(label)}.toLowerCase()
        const el = Array.from(document.querySelectorAll('button')).find(
          (b) => (b.textContent ?? '').trim().toLowerCase() === wanted,
        )
        if (!el) return 'not found: ' + wanted
        el.click()
        return 'clicked ' + wanted
      })()`,
      returnByValue: true,
    }).then((r) => console.log(r?.result?.value))
    await new Promise((r) => setTimeout(r, 1200))
  }

  let clip
  if (selector && selector !== '-') {
    const box = await send('Runtime.evaluate', {
      expression: `(() => {
        // Allow "text=..." to find a section by its heading, which survives
        // sections being inserted above it.
        const sel = ${JSON.stringify(selector)}
        let el
        if (sel.startsWith('text=')) {
          const wanted = sel.slice(5).toLowerCase()
          el = Array.from(document.querySelectorAll('section')).find(s =>
            (s.querySelector('h2')?.textContent ?? '').toLowerCase().includes(wanted))
        } else {
          el = document.querySelector(sel)
        }
        if (!el) return null
        el.scrollIntoView()
        const r = el.getBoundingClientRect()
        return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }
      })()`,
      returnByValue: true,
    })
    clip = box?.result?.value
    if (!clip) {
      console.error(`selector not found: ${selector}`)
      ws.close()
      cleanup()
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  })

  writeFileSync(output, Buffer.from(shot.data, 'base64'))
  console.log(`wrote ${output}`)

  ws.close()
  cleanup()
}

main().catch((e) => {
  console.error(e)
  cleanup()
  process.exit(1)
})
