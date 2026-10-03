import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data, Plan, Year } from '../types'
import { DEFAULT_PARTIES, CONSTITUENCY_PALETTE } from '../data/parties'
import { buildBlockContext, computeStats, ge2025Plan } from './stats'
import { validate, DEFAULT_RULES } from './validation'
import { buildEbrcReport, type EbrcReport } from './ebrc'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const ctx = buildBlockContext(blocks, ge)
const ge25 = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)
const date = new Date(2029, 2, 11)

function report(plan: Plan, year: Year = 2025) {
  const stats = computeStats(plan, blocks, ctx, DEFAULT_PARTIES, year)
  return buildEbrcReport({ plan, stats, issues: validate(plan, stats, blocks, DEFAULT_RULES), rules: DEFAULT_RULES, ge, blocks, year, date })
}

/** every sentence the report shows */
const allText = (r: EbrcReport) => [
  ...r.letter,
  ...r.sections.flatMap((s) => s.blocks.flatMap((b) => [b.heading ?? '', ...b.paras.flatMap((p) => [p.text, ...(p.items ?? [])])])),
  ...r.annexC.map((c) => c.outcome),
  ...r.caveats,
].join('\n')

/** carve the four biggest-electorate Sengkang areas out into a new SMC */
function sengkangCarve(): { plan: Plan; ids: number[] } {
  const ids = blocks.filter((b) => b.ed === 'SK').sort((a, b) => b.e25 - a.e25).slice(0, 4).map((b) => b.id)
  const assign = ge25.assign.map((a, i) => (ids.includes(i) ? 'NEWSMC' : a))
  return { ids, plan: { constituencies: [...ge25.constituencies, { id: 'NEWSMC', name: 'Sengkang Central', type: 'SMC', seats: 1, color: '#000' }], assign } }
}

describe('EBRC report', () => {
  it('GE2025 map: no changes recommended, 18 GRCs + 15 SMCs, 97 MPs', () => {
    const r = report(ge25)
    expect(r.changed).toBe(false)
    expect(r.totalMps).toBe(97)
    expect(r.sizes[0]).toMatchObject({ label: 'Single Member Constituencies', count: 15 })
    expect(r.sizes.slice(1).reduce((n, s) => n + s.count, 0)).toBe(18)
    expect(r.annexA).toHaveLength(33)
    expect(r.annexA.reduce((n, a) => n + a.electors, 0)).toBe(2758846)
    expect(r.annexC).toHaveLength(0)
    expect(r.caveats).toHaveLength(0)
    expect(allText(r)).toMatch(/recommends no change/)
  })

  it('a new SMC carved out of Sengkang names the areas and electors moved', () => {
    const { plan, ids } = sengkangCarve()
    const r = report(plan)
    const moved = ids.reduce((n, i) => n + blocks[i].e25, 0)
    const text = allText(r)
    expect(r.changed).toBe(true)
    expect(text).toMatch(/A new SMC, Sengkang Central SMC, will (be formed|be created) from the [^.]* of Sengkang GRC/)
    const sz = blocks[ids[0]].sz.toLowerCase()
    expect(text.toLowerCase()).toContain(sz)
    expect(text).toContain(`${moved.toLocaleString('en-SG')} electors`)
    expect(r.annexC.map((c) => c.name)).toContain('Sengkang GRC')
  })

  it('an absorbed SMC is reported', () => {
    const assign = ge25.assign.map((a) => (a === 'HG' ? 'AJ' : a))
    const r = report({ constituencies: ge25.constituencies.filter((c) => c.id !== 'HG'), assign })
    expect(allText(r)).toMatch(/Hougang SMC will be absorbed into Aljunied GRC/)
    expect(r.annexC.find((c) => c.name === 'Hougang SMC')?.outcome).toBe('Absorbed into Aljunied GRC')
  })

  it('the 2030 register mentions growth areas such as Tengah', () => {
    expect(allText(report(ge25, 2030))).toMatch(/growth in the number of electors in [^.]*Tengah/)
  })

  it('is deterministic and never mentions parties', () => {
    const { plan } = sengkangCarve()
    expect(allText(report(plan))).toBe(allText(report(plan)))
    const text = allText(report(plan))
    for (const p of DEFAULT_PARTIES) {
      expect(text, p.id).not.toMatch(new RegExp(`\\b${p.id}\\b`))
      expect(text, p.name).not.toContain(p.name)
    }
  })

  it('a map with errors gets a caveat instead of hiding them', () => {
    const assign = ge25.assign.map((a) => (a === 'HG' ? null : a))
    const r = report({ constituencies: ge25.constituencies.filter((c) => c.id !== 'HG'), assign })
    expect(r.caveats[0]).toMatch(/does not yet meet every rule/)
  })
})

// handy when tuning the wording: EBRC_PRINT=1 npx vitest run src/model/ebrc.test.ts
if (process.env.EBRC_PRINT) console.log(allText(report(sengkangCarve().plan, 2030)))
