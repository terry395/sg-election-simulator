// Captures the screenshots used by guide.html from a running dev server.
// Usage: npm run dev   (in another terminal), then: npm run guide:shots
// Relies on the dev-only window.__store / __night / __map handles.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = process.env.GUIDE_URL ?? 'http://localhost:5317/'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'guide')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('page error:', e.message))

const sleep = (ms) => page.waitForTimeout(ms)
const run = (fn, arg) => page.evaluate(fn, arg)
const idle = async () => {
  await run(() => new Promise((r) => {
    const m = window.__map
    if (m.loaded() && m.areTilesLoaded()) r()
    else m.once('idle', () => r())
  }))
  await sleep(400)
}
const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 70 })
  console.log('saved', name)
}
const parkMouse = () => page.mouse.move(1430, 890)
/** Scroll the side panel so the section whose heading contains `text` is at the top. */
const scrollPanelTo = (text) => run((t) => {
  const a = document.querySelector('aside')
  if (!t) { a.scrollTop = 0; return }
  const h = [...a.querySelectorAll('h3')].find((h) => h.textContent.includes(t))
  a.scrollTop = h.closest('section').offsetTop - a.offsetTop - 4
}, text)
const clickText = (text) => page.locator('button', { hasText: text }).first().click()
/** Screen position of a block's centroid. */
const blockPoint = (id) => run((i) => {
  const b = window.__store.getState().data.blocks[i]
  const p = window.__map.project(b.c)
  const r = window.__map.getCanvas().getBoundingClientRect()
  return { x: r.left + p.x, y: r.top + p.y }
}, id)
const lngLatPoint = (ll) => run((c) => {
  const p = window.__map.project(c)
  const r = window.__map.getCanvas().getBoundingClientRect()
  return { x: r.left + p.x, y: r.top + p.y }
}, ll)
const view = (center, zoom) => run(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), [center, zoom])
const home = () => run(() => window.__map.fitBounds([103.6, 1.2, 104.05, 1.47], { duration: 0 }))

// ---------------------------------------------------------------- start fresh
await page.goto(URL)
await run(() => { localStorage.clear(); localStorage.setItem('sg-election-sim:guide-seen', '1') })
await page.reload()
await page.waitForFunction(() => window.__map && window.__store?.getState().data)
await home()
await idle()
await parkMouse()

// 01 overview
await shot('01-overview')

// 02 select a constituency (Sengkang) and hover an area
await run(() => window.__store.getState().setActive('SK'))
await view([103.885, 1.385], 12.3)
await idle()
await scrollPanelTo('Active')
const skBlock = await run(() => window.__store.getState().data.blocks.filter((b) => b.ed === 'SK').sort((a, b) => b.e25 - a.e25)[0].id)
let p = await blockPoint(skBlock)
await page.mouse.move(p.x, p.y)
await sleep(300)
await shot('02-select')

// 03 new SMC painted out of Sengkang
const westIds = await run(() => {
  const bs = window.__store.getState().data.blocks.filter((b) => b.ed === 'SK').sort((a, b) => a.c[0] - b.c[0])
  const ids = []
  let s = 0
  for (const b of bs) { if (s > 27000) break; ids.push(b.id); s += b.e25 }
  return ids
})
await run((ids) => {
  const s = window.__store.getState()
  const id = s.addConstituency('SMC')
  s.updateConstituency(id, { name: 'Sengkang West', color: '#f59e0b' })
  s.checkpoint()
  window.__store.getState().assignBlocks(ids, id)
}, westIds)
await scrollPanelTo(null)
// show the brush over the new seat
p = await blockPoint(westIds[0])
await page.mouse.move(p.x, p.y)
await sleep(300)
await shot('03-paint')

// 04 the new seat's stats card
await parkMouse()
await scrollPanelTo('Active')
await sleep(200)
await shot('04-new-smc')

// 05 lasso in progress around part of Punggol, into a new GRC
// (the map is restored to this point after the lasso and checks demos)
await run(() => { window.__savedPlan = window.__store.getState().plan })
await run(() => {
  const s = window.__store.getState()
  const id = s.addConstituency('GRC')
  s.updateConstituency(id, { name: 'Punggol North', color: '#e11d48' })
  s.setTool('lasso')
})
await scrollPanelTo(null)
const loop = [[103.895, 1.418], [103.91, 1.424], [103.925, 1.418], [103.927, 1.405], [103.915, 1.398], [103.9, 1.403], [103.893, 1.41]]
const pts = []
for (const ll of loop) pts.push(await lngLatPoint(ll))
await page.mouse.move(pts[0].x, pts[0].y)
await page.mouse.down()
for (const q of pts.slice(1)) await page.mouse.move(q.x, q.y, { steps: 6 })
await page.mouse.move(pts[0].x + 4, pts[0].y + 4, { steps: 6 })
await sleep(200)
await shot('05-lasso')
await page.mouse.up()
await sleep(300)
await parkMouse()
await scrollPanelTo('Active')
await sleep(200)
await shot('06-lasso-done')

// 07 checks with problems: remove the example GRC, then erase part of Punggol
await run(() => {
  const s = window.__store.getState()
  const g = s.plan.constituencies.find((c) => c.name === 'Punggol North')
  if (g) s.deleteConstituency(g.id)
  window.__store.getState().setActive('PG')
  window.__store.getState().setTool('erase')
})
const eraseIds = await run(() => window.__store.getState().data.blocks.filter((b) => b.ed === 'PG' && b.e25 > 0).slice(0, 4).map((b) => b.id))
await run((ids) => { const s = window.__store.getState(); s.checkpoint(); s.assignBlocks(ids, null) }, eraseIds)
await scrollPanelTo('Checks')
await sleep(300)
await shot('07-checks')
// clean up: back to the map with just the new Sengkang West SMC
await run(() => {
  window.__store.setState({ plan: window.__savedPlan, past: [], future: [] })
  window.__store.getState().setTool('inspect')
})

// 08 map lens: young voters
await run(() => window.__store.getState().setLens('young'))
await home()
await idle()
await scrollPanelTo('Map lens')
await shot('08-lens')
await run(() => window.__store.getState().setLens('constituency'))

// 09 contests overview
await run(() => { window.__store.getState().setActive(null); window.__store.getState().setTab('contests') })
await idle()
await scrollPanelTo(null)
await shot('09-contests')

// 10 contest detail: East Coast, add PSP for a three-cornered fight, WP star candidate
await run(() => {
  const s = window.__store.getState()
  s.setActive('EC')
})
await sleep(200)
await run(() => {
  const li = [...document.querySelectorAll('aside li')].find((l) => l.textContent.startsWith('East Coast'))
  const a = document.querySelector('aside')
  a.scrollTop = li.offsetTop - a.offsetTop - 60
})
// pick Pritam Singh as the WP anchor to show the leader effect
await page.getByLabel('WP anchor leader').selectOption('Pritam Singh')
await sleep(300)
await run(() => {
  const li = [...document.querySelectorAll('aside li')].find((l) => l.textContent.startsWith('East Coast'))
  const a = document.querySelector('aside')
  a.scrollTop = li.offsetTop - a.offsetTop - 60
})
await sleep(300)
await shot('10-contest-detail')
// undo it so the forecast and election-night numbers in the guide stay the same
await run(() => window.__store.getState().resetContests())

// 11 forecast with the "GE2020 mood" scenario
await run(() => window.__store.getState().setTab('forecast'))
await sleep(200)
await clickText('GE2020 mood')
await idle()
await scrollPanelTo(null)
await shot('11-forecast')

// 12 simulations
// fixed seed so the numbers quoted in the guide stay the same
await run(() => { window.__realRandom = Math.random; Math.random = () => 0.4242 })
await clickText('2,000 simulations')
await run(() => { Math.random = window.__realRandom })
await page.waitForSelector('text=PAP keeps majority', { timeout: 60000 })
await sleep(300)
await run(() => { document.querySelector('aside').scrollTop = 120 })
await sleep(200)
await shot('12-simulations')

// 13 demographic sliders (with a youth swing)
await run(() => {
  const s = window.__store.getState()
  s.setSwings({ demo: { a0: -6 } })
})
await idle()
await scrollPanelTo('Demographic')
await shot('13-demographic')

// 14 election night: start screen
await run(() => window.__store.getState().setTab('night'))
await sleep(300)
await scrollPanelTo(null)
await shot('14-night-start')

// 15 election night in progress (exact forecast, paused mid-count)
await page.locator('text=Exactly my forecast').click()
await run(() => { Math.random = () => 0.1234 }) // fixed running order
await clickText('Polls close')
await run(() => { Math.random = window.__realRandom })

// 22 sample counts arriving (about half in), nothing declared yet
await run(() => {
  const n = window.__night.getState()
  n.setPlaying(false)
  const samples = n.events.flatMap((e, i) => (e.kind === 'sample' ? [i] : []))
  const target = samples[Math.floor(samples.length / 2)]
  window.__steps = 0
  while (window.__night.getState().cursor < target) { window.__night.getState().stepNext(); window.__steps++ }
})
await idle()
await scrollPanelTo(null)
await shot('22-night-samples')

await run(() => {
  const n = window.__night.getState()
  const target = n.events.findIndex((e) => e.kind === 'result') + 9
  // same number of steps from the start as before shot 22 was added, so the guide's numbers stay put
  for (let i = window.__steps; i < target; i++) window.__night.getState().stepNext()
})
await idle()
await scrollPanelTo(null)
await shot('15-night-live')

// 16 final result
await run(() => window.__night.getState().skipToEnd())
await idle()
// 24 the election report opens by itself at the end of the night
await sleep(400)
await shot('24-night-report')
await run(() => window.__night.getState().setReportOpen(false))
await idle()
await scrollPanelTo('Result')
await shot('16-night-result')

// 17 map colouring at the end of the night, zoomed on the east
await view([103.9, 1.36], 11.6)
await idle()
await scrollPanelTo(null)
await shot('17-night-map')

// 23 the same map over satellite imagery
await run(() => window.__store.getState().setBasemap('satellite'))
await idle()
await shot('23-satellite')
await run(() => window.__store.getState().setBasemap('map'))

// 18 auto-draw: method picker (EBRC-style selected by default)
await run(() => {
  window.__night.getState().reset()
  window.__store.getState().setTab('draw')
})
await home()
await idle()
await page.getByText('Auto-draw the whole map').click()
await sleep(300)
await scrollPanelTo(null)
await shot('18-autodraw-picker')

// 19 auto-draw: a fair & compact map (fixed variation so the guide's numbers stay put)
await page.locator('button', { hasText: 'Fair & compact' }).first().click()
const seedInput = page.locator('aside input[type=number]').last()
await seedInput.fill('7')
await page.getByRole('button', { name: /Draw the map/ }).click()
await page.waitForSelector('text=New map drawn', { timeout: 60000 })
await idle()
await scrollPanelTo(null)
await parkMouse()
await shot('19-autodraw-result')

// 20 auto-draw: gerrymander in favour of the opposition
await page.locator('button', { hasText: 'Gerrymander' }).first().click()
await page.getByText('Favour the opposition').click()
await page.locator('aside input[type=number]').last().fill('7')
await page.getByRole('button', { name: /Draw the map/ }).click()
await page.waitForSelector('text=New map drawn', { timeout: 60000 })
await page.waitForFunction(() => document.querySelector('aside').innerText.includes('Gerrymander: '))
await idle()
await scrollPanelTo(null)
await shot('20-autodraw-gerrymander')

// 21 party information drawer
await run(() => window.__store.getState().showPartyInfo('WP'))
await sleep(400)
await shot('21-parties')
await run(() => window.__store.getState().showPartyInfo(null))

await browser.close()
