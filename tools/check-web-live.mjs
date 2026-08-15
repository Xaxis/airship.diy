// Load the deployed site in a real browser and assert it is not broken.
//
// THE ONLY CHECK THAT CATCHES A DEAD HYDRATION. Every other check in this
// repository can pass while the page is a corpse: the HTML is correct, the
// status is 200, the screenshot looks right, and React threw during hydration
// so nothing interactive works. A static grep for a number proves the server
// rendered it, not that the browser survived reading it.
//
// Drives Chrome over the DevTools protocol with no dependencies beyond Chrome
// itself, because adding Puppeteer to a repository with ignore-scripts=true is
// more trouble than the two hundred lines below.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_UNDER_TEST = process.argv[2] ?? 'https://airship-diy.vercel.app/'

const CHROME =
  process.env['CHROME_PATH'] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const profile = mkdtempSync(join(tmpdir(), 'airship-chrome-'))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    // SwiftShader rather than --disable-gpu. Disabling the GPU entirely means
    // no WebGL context at all, which would make this check assert that the
    // page survives a condition no real visitor has, while missing whether it
    // survives the one they do.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9333',
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

const waitFor = async (probe, timeoutMs, description) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await probe().catch(() => null)
    if (result) return result
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const main = async () => {
  const target = await waitFor(
    async () => {
      const res = await fetch('http://127.0.0.1:9333/json/list')
      const list = await res.json()
      return list.find((t) => t.type === 'page') ?? null
    },
    15000,
    'Chrome to start',
  )

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let nextId = 1
  const pending = new Map()
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)

    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result)
      pending.delete(message.id)
      return
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const d = message.params.exceptionDetails
      pageErrors.push(d.exception?.description ?? d.text ?? 'unknown exception')
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
    if (message.method === 'Network.loadingFailed') {
      failedRequests.push(message.params.errorText)
    }
  }

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Runtime.enable')
  await send('Network.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: URL_UNDER_TEST })

  // Give hydration and the first simulator frames time to run or to fail.
  await new Promise((r) => setTimeout(r, 6000))

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true })
    return result?.result?.value
  }

  const checks = []
  const check = (name, ok, detail) => checks.push({ name, ok, detail })

  check('page has a title', Boolean(await evaluate('document.title')), await evaluate('document.title'))

  // React actually mounted and rendered the tree.
  const sectionCount = await evaluate('document.querySelectorAll("section").length')
  check('sections rendered', sectionCount >= 10, `${sectionCount} sections`)

  // The two Three.js views both created a WebGL context. A canvas that never
  // appears is the signature of a client component that threw on mount.
  const canvasCount = await evaluate('document.querySelectorAll("canvas").length')
  check('both WebGL canvases present', canvasCount >= 2, `${canvasCount} canvases`)

  // The simulator's instrument row updates from the physics loop, so a readout
  // that is still showing the placeholder means the loop never ran.
  const readouts = await evaluate(
    `Array.from(document.querySelectorAll('.num')).map(e => e.textContent).filter(t => t && t.includes('m/s')).join('|')`,
  )
  check('simulator instruments are live', Boolean(readouts && !readouts.includes('—')), readouts)

  // The explorer runs the solvers client-side. Missing sliders means the
  // component threw on mount and the section is a hollow shell.
  const sliderCount = await evaluate(
    "document.querySelectorAll('input[type=range]').length",
  )
  check('design explorer sliders present', sliderCount >= 8, `${sliderCount} sliders`)

  check('no uncaught exceptions', pageErrors.length === 0, pageErrors.join(' | '))
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '))
  check(
    'no failed requests',
    failedRequests.length === 0,
    failedRequests.join(' | '),
  )

  console.log(`\nLive check: ${URL_UNDER_TEST}\n`)
  let failed = 0
  for (const c of checks) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
    if (!c.ok) failed += 1
  }
  console.log()

  ws.close()
  cleanup()

  if (failed > 0) {
    console.error(`${failed} live check(s) failed.\n`)
    process.exit(1)
  }
  console.log('The deployed page loads, hydrates and runs.\n')
}

main().catch((error) => {
  console.error(error)
  cleanup()
  process.exit(1)
})
