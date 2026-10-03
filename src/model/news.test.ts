import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data, Plan, Swings } from '../types'
import { DEFAULT_PARTIES, CONSTITUENCY_PALETTE } from '../data/parties'
import { NOTABLE } from '../data/candidates'
import { buildBlockContext, computeStats, ge2025Plan } from './stats'
import { defaultContests } from './contests'
import { DEFAULT_SWINGS, runElection } from './swing'
import { validate, DEFAULT_RULES } from './validation'
import { buildTimeline } from './timeline'
import { buildReport } from './report'
import { buildNewsArticle, clockEn, clockZh, wan, type NewsArticle, type NewsInput } from './news'
import { zhSeat } from '../data/zh'
import { redistrict, DEFAULT_OPTIONS } from './redistrict'
import { rng } from './rng'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const partyMap = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))
const ctx = buildBlockContext(blocks, ge)
const ge25 = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)

function input(plan: Plan, swings: Swings = DEFAULT_SWINGS, seed?: number, coalition: string[] | null = null): NewsInput {
  const stats = computeStats(plan, blocks, ctx, DEFAULT_PARTIES, 2025)
  const contests = defaultContests(plan, stats, ge)
  const projection = runElection(plan.constituencies, stats.byId, contests, swings, partyMap)
  const result = seed === undefined ? projection : runElection(plan.constituencies, stats.byId, contests, swings, partyMap, rng(seed))
  const events = buildTimeline(plan.constituencies, result, seed ?? 1)
  const report = buildReport({
    plan: plan.constituencies, result, projection, events, mode: seed === undefined ? 'projection' : 'surprise',
    coalition, stats, issues: validate(plan, stats, blocks, DEFAULT_RULES),
    contests, defaults: contests, swings, parties: DEFAULT_PARTIES, ge, blocks, year: 2025,
  })
  return { report, events, swings, stats, partyMap, useLeaders: true, seed: seed ?? 1, date: new Date(2030, 4, 4) }
}

const text = (a: NewsArticle) => [a.headline, a.standfirst, ...a.sections.flatMap((s) => [s.heading ?? '', ...s.paras]), ...a.factbox.rows.map((r) => `${r.label} ${r.value}`)].join('\n')
const clean = (a: NewsArticle) => {
  const t = text(a)
  expect(t).not.toMatch(/undefined|NaN|null|\$\{|Infinity/)
  expect(a.sections.every((s) => s.paras.length > 0)).toBe(true)
}

describe('mock news article', () => {
  it('GE2025 map, zero swing: English numbers match the report', () => {
    const inp = input(ge25)
    const a = buildNewsArticle(inp, 'en')
    clean(a)
    const s = inp.report.summary
    expect(a.masthead).toBe('The Straits Times')
    expect(a.standfirst).toContain(`${s.govSeats} of ${s.total} seats`)
    expect(a.sections[0].paras[0]).toContain(`${s.govSeats} of the ${s.total} seats`)
    expect(a.table.find((r) => r.party === 'PAP')?.seats).toBe(s.govSeats)
    expect(a.dateline).toBe('Sunday, 5 May 2030')
  })

  it('Chinese version uses Chinese party and place names', () => {
    const a = buildNewsArticle(input(ge25), 'zh')
    clean(a)
    const t = text(a)
    expect(a.masthead).toBe('联合早报')
    expect(t).toContain('人民行动党')
    expect(t).toContain('工人党')
    expect(t).not.toMatch(/\bPAP\b|\bWP\b/)
    expect(zhSeat('Marine Parade-Braddell Heights', 'GRC')).toBe('马林百列-布莱德岭集选区')
    expect(zhSeat('Sengkang', 'GRC')).toBe('盛港集选区')
    expect(zhSeat('Fernvale North', 'SMC')).toBe('芬维尔北单选区')
    expect(zhSeat('Somewhere New', 'SMC')).toBe('Somewhere New 单选区')
  })

  it('image prompts never name candidates', () => {
    const a = buildNewsArticle(input(ge25, { ...DEFAULT_SWINGS, national: -12 }, 3), 'en')
    const prompts = a.images.map((i) => i.prompt).join(' ')
    for (const n of NOTABLE) expect(prompts).not.toContain(n.name)
    for (const p of DEFAULT_PARTIES) expect(prompts).not.toContain(p.name)
    expect(a.images.length).toBeGreaterThanOrEqual(3)
  })

  it('writes every scenario cleanly in both languages', () => {
    const cases: [Swings, string[] | null][] = [
      [{ ...DEFAULT_SWINGS, national: 6 }, null],
      [{ ...DEFAULT_SWINGS, national: -6, demo: { a0: -4, h3: 2 } }, null],
      [{ ...DEFAULT_SWINGS, national: -14 }, null],
      [{ ...DEFAULT_SWINGS, national: -20 }, null],
    ]
    const headlines = new Set<string>()
    for (const [sw, co] of cases) {
      for (const lang of ['en', 'zh'] as const) {
        const a = buildNewsArticle(input(ge25, sw, undefined, co), lang)
        clean(a)
        headlines.add(a.headline)
      }
    }
    expect(headlines.size).toBeGreaterThanOrEqual(6)
  })

  it('handles a redrawn map with a realistic night', () => {
    const { plan } = redistrict(blocks, ge, ge25, { ...DEFAULT_OPTIONS, method: 'compact', seed: 2 })
    for (const lang of ['en', 'zh'] as const) clean(buildNewsArticle(input(plan, { ...DEFAULT_SWINGS, national: -5 }, 9), lang))
  })

  it('formats times and numbers', () => {
    expect(clockEn(222)).toBe('11.42pm')
    expect(clockEn(305)).toBe('1.05am')
    expect(clockZh(222)).toBe('晚上11时42分')
    expect(clockZh(240)).toBe('凌晨12时')
    expect(wan(123456)).toBe('12万3500')
    expect(wan(40000)).toBe('4万')
  })
})
