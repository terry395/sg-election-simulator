// Records the ~60 second demo video used by guide.html from a running dev server.
// Usage: npm run dev   (in another terminal), then: npm run guide:video
// Relies on the dev-only window.__store / __night / __map handles.
// Headless Chromium draws no mouse pointer, so a fake cursor and a caption bar are injected.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = process.env.GUIDE_URL ?? 'http://localhost:5317/'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'guide')
const TMP = path.join(os.tmpdir(), 'guide-video')
fs.mkdirSync(OUT, { recursive: true })
fs.rmSync(TMP, { recursive: true, force: true })

const W = 1280, H = 800
// use the real GPU: software rendering makes the map too choppy to film
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] })

// warm-up pass (not recorded) so map tiles and data are cached before filming
{
  const warm = await browser.newPage({ viewport: { width: W, height: H } })
  await warm.goto(URL)
  await warm.waitForFunction(() => window.__map && window.__store?.getState().data)
  await warm.close()
}

const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: TMP, size: { width: W, height: H } } })
const page = await context.newPage()
const recordStart = Date.now()
page.on('pageerror', (e) => console.error('page error:', e.message))

await page.addInitScript(() => {
  localStorage.setItem('sg-election-sim:guide-seen', '1')
  addEventListener('DOMContentLoaded', () => {
    const css = document.createElement('style')
    css.textContent = `
      #demo-cursor { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none; transform: translate(-3px, -2px); }
      .demo-ripple { position: fixed; z-index: 2147483646; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 3px solid #facc15;
        pointer-events: none; animation: demo-ripple .5s ease-out forwards; }
      @keyframes demo-ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
      #demo-caption { position: fixed; z-index: 2147483645; left: 430px; bottom: 30px; transform: translateX(-50%); width: max-content; max-width: 760px; pointer-events: none;
        background: rgb(2 6 23 / .86); color: #fff; font: 600 22px/1.3 system-ui, sans-serif; padding: 12px 22px; border-radius: 12px;
        border: 1px solid rgb(250 204 21 / .6); box-shadow: 0 8px 30px rgb(0 0 0 / .45); text-align: center; transition: opacity .3s; opacity: 0; }
      #demo-caption small { display: block; font-weight: 400; font-size: 16px; color: #cbd5e1; margin-top: 2px; }
      #demo-end { position: fixed; z-index: 2147483644; inset: 0; display: grid; place-items: center; background: rgb(2 6 23 / .82); color: #fff;
        font: 700 46px/1.25 system-ui, sans-serif; text-align: center; opacity: 0; transition: opacity .6s; pointer-events: none; }
      #demo-end small { display: block; font-weight: 400; font-size: 22px; color: #cbd5e1; margin-top: 10px; }`
    document.head.appendChild(css)
    const cur = document.createElement('div')
    cur.id = 'demo-cursor'
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.body.appendChild(cur)
    const cap = document.createElement('div')
    cap.id = 'demo-caption'
    document.body.appendChild(cap)
    const end = document.createElement('div')
    end.id = 'demo-end'
    document.body.appendChild(end)
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px' }, true)
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      r.className = 'demo-ripple'
      r.style.left = e.clientX + 'px'
      r.style.top = e.clientY + 'px'
      document.body.appendChild(r)
      setTimeout(() => r.remove(), 600)
    }, true)
  })
})

const sleep = (ms) => page.waitForTimeout(ms)
const run = (fn, arg) => page.evaluate(fn, arg)
const idle = async () => {
  await run(() => new Promise((r) => {
    const m = window.__map
    if (m.loaded() && m.areTilesLoaded()) r()
    else m.once('idle', () => r())
  }))
  await sleep(200)
}
/** Show a caption (empty text hides it). */
const caption = (text, sub = '') => run(([t, s]) => {
  const c = document.getElementById('demo-caption')
  if (!t) { c.style.opacity = '0'; return }
  c.innerHTML = t + (s ? `<small>${s}</small>` : '')
  c.style.opacity = '1'
}, [text, sub])
let mouse = { x: W - 40, y: H - 40 }
/** Glide the visible cursor to a point. */
const glide = async (x, y, steps = 25) => { await page.mouse.move(x, y, { steps }); mouse = { x, y } }
/** Glide to an element and click it. */
const clickOn = async (locator) => {
  const b = await locator.boundingBox()
  await glide(b.x + b.width / 2, b.y + b.height / 2)
  await sleep(150)
  await locator.click()
}
const lngLatPoint = (ll) => run((c) => {
  const p = window.__map.project(c)
  const r = window.__map.getCanvas().getBoundingClientRect()
  return { x: r.left + p.x, y: r.top + p.y }
}, ll)
const home = () => run(() => window.__map.fitBounds([103.6, 1.2, 104.05, 1.47], { duration: 0 }))
const flyTo = async (center, zoom, ms = 1500) => {
  await run(([c, z, d]) => window.__map.flyTo({ center: c, zoom: z, duration: d }), [center, zoom, ms])
  await sleep(ms)
  await idle()
}
const tab = (label) => page.locator('header button, nav button, button').filter({ hasText: label }).first()

// ---------------------------------------------------------------- start fresh
await page.goto(URL)
await run(() => { localStorage.clear(); localStorage.setItem('sg-election-sim:guide-seen', '1') })
await page.reload()
await page.waitForFunction(() => window.__map && window.__store?.getState().data)
await home()
await idle()
await page.mouse.move(mouse.x, mouse.y)
const started = Date.now()
const stamp = (what) => console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s  ${what}`)

// 0–4s: overview
await page.screenshot({ path: path.join(OUT, 'demo-poster.jpg'), type: 'jpeg', quality: 75 })
await caption("This is Singapore's 2025 election map", 'Each colour is one constituency')
await glide(560, 380, 30)
await sleep(2600)
stamp('overview')

// 4–16s: draw boundaries — paint a new SMC out of western Sengkang
await caption('1. Draw boundaries', 'Paint neighbourhoods into a new seat')
await flyTo([103.885, 1.385], 12.6, 1200)
await clickOn(page.locator('aside button', { hasText: '+ SMC' }))
await run(() => {
  const s = window.__store.getState()
  s.updateConstituency(s.activeId, { name: 'Sengkang West', color: '#f59e0b' })
})
// the same ~27,000-elector seat as the guide's screenshots
const westIds = await run(() => {
  const bs = window.__store.getState().data.blocks.filter((b) => b.ed === 'SK').sort((a, b) => a.c[0] - b.c[0])
  const ids = []
  let s = 0
  for (const b of bs) { if (s > 27000) break; ids.push(b.id); s += b.e25 }
  return ids
})
const west = await run((ids) => ids.map((i) => window.__store.getState().data.blocks[i].c), westIds)
const lngs = west.map((c) => c[0]), lats = west.map((c) => c[1])
const [lo, hi, s0, n0] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)]
// brush strokes back and forth over those areas
const strokes = 4
for (let i = 0; i < strokes; i++) {
  const lat = s0 + ((n0 - s0) * (i + 0.5)) / strokes
  const a = await lngLatPoint([i % 2 ? hi : lo, lat])
  const b = await lngLatPoint([i % 2 ? lo : hi, lat])
  await glide(a.x, a.y, 6)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 10 })
  await page.mouse.up()
}
// tidy up so the seat is exactly the intended areas (keeps the map free of rule errors)
await run((ids) => {
  const s = window.__store.getState()
  const keep = new Set(ids)
  const extra = s.plan.assign.flatMap((a, i) => (a === s.activeId && !keep.has(i) ? [i] : []))
  s.assignBlocks(extra, 'SK')
  window.__store.getState().assignBlocks(ids, s.activeId)
  window.__store.getState().setTool('inspect')
}, westIds)
await glide(W - 300, 300, 15)
await sleep(1800)
stamp('draw')

// 16–26s: contests — East Coast, add PSP, pick a WP anchor leader
await caption('2. Contests', 'Choose which parties stand, and who leads them')
await clickOn(tab('Contests'))
await sleep(400)
await run(() => window.__map.flyTo({ center: [103.93, 1.32], zoom: 11.6, duration: 1000 }))
const ecRow = page.locator('aside li button').filter({ hasText: 'East Coast' }).first()
await ecRow.scrollIntoViewIfNeeded()
await clickOn(ecRow)
await run(() => {
  const li = [...document.querySelectorAll('aside li')].find((l) => l.textContent.startsWith('East Coast'))
  const a = document.querySelector('aside')
  a.scrollTo({ top: li.offsetTop - a.offsetTop - 60, behavior: 'smooth' })
})
await sleep(500)
const ecLi = page.locator('aside li').filter({ hasText: 'Anchor leaders' }).first()
await clickOn(ecLi.locator('button[title="Progress Singapore Party"]').first())
await sleep(600)
const pick = ecLi.getByLabel('WP anchor leader')
const pb = await pick.boundingBox()
await glide(pb.x + pb.width / 2, pb.y + pb.height / 2, 15)
await page.mouse.down(); await page.mouse.up()
await pick.selectOption('Pritam Singh')
await sleep(1800)
stamp('contests')

// 26–36s: swings & forecast — GE2020 mood
await caption('3. Swings & forecast', 'Tilt the national mood and see the projected seats')
await clickOn(tab('Swings'))
await home()
await sleep(500)
await clickOn(page.locator('button', { hasText: 'GE2020 mood' }).first())
await idle()
await glide(W - 230, 200, 15)
await sleep(2800)
stamp('forecast')

// 36–56s: election night
await caption('4. Election night', 'Polls close — watch the count, seat by seat')
await clickOn(tab('Election night'))
await sleep(400)
await clickOn(page.locator('text=Exactly my forecast'))
await run(() => { window.__realRandom = Math.random; Math.random = () => 0.1234 }) // fixed running order
await clickOn(page.locator('button', { hasText: 'Polls close' }).first())
await run(() => { Math.random = window.__realRandom })
await clickOn(page.locator('aside button', { hasText: '10×' }).first())
await glide(W - 230, 420, 15)
await sleep(1500)
// fast-forward past the quiet sample-count stretch to just before the first declarations
await run(() => {
  const n = window.__night.getState()
  const target = n.events.findIndex((e) => e.kind === 'result') - 1
  while (window.__night.getState().cursor < target) window.__night.getState().stepNext()
})
await sleep(4500)
await caption('4. Election night', 'Skip ahead to the final result')
const skip = page.locator('aside button[title="Skip to the end"]')
if (await skip.isEnabled()) await clickOn(skip)
await idle()
// park the cursor on the panel so no map tooltip covers the result
await glide(W - 200, 700, 20)
await sleep(3500)
stamp('night')

// 56–59s: end card
await caption('')
await run(() => {
  const e = document.getElementById('demo-end')
  e.innerHTML = 'Now try it yourself!<small>Draw · Contests · Forecast · Election night</small>'
  e.style.opacity = '1'
})
await sleep(3000)
stamp('end')

await context.close()
await browser.close()
const raw = path.join(TMP, fs.readdirSync(TMP)[0])
const out = path.join(OUT, 'demo.webm')

// cut the page-load pre-roll and re-encode smaller, using ffmpeg from PATH or Playwright's own copy
const findFfmpeg = () => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg' } catch { /* not on PATH */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
    : path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches' : '.cache', 'ms-playwright'))
  for (const d of fs.existsSync(root) ? fs.readdirSync(root).filter((d) => d.startsWith('ffmpeg')) : []) {
    const exe = fs.readdirSync(path.join(root, d)).find((f) => f.startsWith('ffmpeg'))
    if (exe) return path.join(root, d, exe)
  }
  return null
}
const ffmpeg = findFfmpeg()
const preRoll = ((started - recordStart) / 1000).toFixed(2)
if (ffmpeg) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', preRoll, '-i', raw,
    '-c:v', 'libvpx', '-b:v', '1200k', '-crf', '8', '-deadline', 'good', '-cpu-used', '2', '-an', out])
} else {
  console.warn('ffmpeg not found: keeping the untrimmed recording')
  fs.copyFileSync(raw, out)
}
fs.rmSync(TMP, { recursive: true, force: true })
console.log('saved demo.webm', (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', `(cut ${preRoll}s of page load)`)
