import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data, Plan } from '../types'
import { DEFAULT_PARTIES, CONSTITUENCY_PALETTE } from '../data/parties'
import { buildBlockContext, computeStats, ge2025Plan, isContiguous } from './stats'
import { defaultContests } from './contests'
import { DEFAULT_SWINGS, allocateNcmp, projectSeat, runElection } from './swing'
import { validate, DEFAULT_RULES } from './validation'
import { monteCarlo } from './montecarlo'
import { buildTimeline } from './timeline'
import { decodeState, encodeState } from '../share/serialize'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const parties = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))
const ctx = buildBlockContext(blocks, ge)
const plan = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)
const stats = computeStats(plan, blocks, ctx, DEFAULT_PARTIES, 2025)
const contests = defaultContests(plan, stats, ge)

describe('data', () => {
  it('reproduces official GE2025 electors', () => {
    expect(stats.assignedElectors).toBe(ge.totalElectors)
    for (const c of ge.constituencies) expect(stats.byId[c.id].electors).toBe(c.electors)
    expect(stats.seats).toBe(97)
  })
  it('GE2025 constituencies are contiguous', () => {
    for (const c of plan.constituencies) {
      const ids = blocks.filter((b) => b.ed === c.id).map((b) => b.id)
      expect(isContiguous(ids, blocks), c.name).toBe(true)
    }
  })
})

describe('swing model', () => {
  it('zero swing on the GE2025 map reproduces every GE2025 result', () => {
    for (const c of ge.constituencies.filter((c) => !c.walkover)) {
      const pc = plan.constituencies.find((x) => x.id === c.id)!
      const r = projectSeat(pc, stats.byId[c.id], contests[c.id], DEFAULT_SWINGS, parties)
      expect(r.winner, c.name).toBe(c.result[0].party)
      for (const pr of c.result) expect(Math.abs(r.shares[pr.party] - pr.share), `${c.name} ${pr.party}`).toBeLessThan(0.002)
    }
  })
  it('national swing to the opposition lowers PAP share monotonically', () => {
    const c = plan.constituencies.find((x) => x.id === 'EC')!
    const at = (n: number) => projectSeat(c, stats.byId.EC, contests.EC, { ...DEFAULT_SWINGS, national: n }, parties).shares.PAP
    expect(at(-5)).toBeLessThan(at(0))
    expect(at(-10)).toBeLessThan(at(-5))
    expect(at(5)).toBeGreaterThan(at(0))
  })
  it('shares always sum to 1', () => {
    const r = projectSeat(plan.constituencies[0], stats.byId[plan.constituencies[0].id], { parties: ['PAP', 'WP', 'PSP', 'SDP'], star: { WP: 5 } }, { ...DEFAULT_SWINGS, national: -20, party: { PSP: 4 } }, parties)
    expect(Object.values(r.shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  })
  it('a stronger opposition slate than 2025 raises the opposition vote', () => {
    const c = plan.constituencies.find((x) => x.id === 'TP')! // PAR contested in 2025
    const par = projectSeat(c, stats.byId.TP, { parties: ['PAP', 'PAR'], star: {} }, DEFAULT_SWINGS, parties).shares.PAP
    const wp = projectSeat(c, stats.byId.TP, { parties: ['PAP', 'WP'], star: {} }, DEFAULT_SWINGS, parties).shares.PAP
    expect(wp).toBeLessThan(par)
  })
  it('GE2025 seat count: PAP 87, WP 10', () => {
    const res = runElection(plan.constituencies, stats.byId, contests, DEFAULT_SWINGS, parties)
    expect(res.seatsByParty.PAP).toBe(87)
    expect(res.seatsByParty.WP).toBe(10)
    // GE2025: 2 NCMP seats went to WP's Jalan Kayu candidate and the Tampines GRC team
    expect(res.ncmp.reduce((s, n) => s + n.seats, 0)).toBe(2)
  })
})

describe('NCMP', () => {
  it('caps GRC NCMPs at two and respects the 12-seat opposition floor', () => {
    const pc = [{ id: 'A', name: 'A', type: 'GRC' as const, seats: 5, color: '' }, { id: 'B', name: 'B', type: 'SMC' as const, seats: 1, color: '' }]
    const seat = (id: string, opp: number) => ({ id, shares: { PAP: 1 - opp, WP: opp }, votes: {}, winner: 'PAP', runnerUp: 'WP', margin: 1 - 2 * opp, valid: 1, turnout: 1, walkover: false })
    const n = allocateNcmp(pc, [seat('A', 0.45), seat('B', 0.3)], 'PAP')
    expect(n).toEqual([{ constituency: 'A', party: 'WP', share: 0.45, seats: 2 }, { constituency: 'B', party: 'WP', share: 0.3, seats: 1 }])
  })
})

describe('validation', () => {
  it('GE2025 map has no errors', () => {
    const issues = validate(plan, stats, blocks, DEFAULT_RULES)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
  })
  it('flags unassigned blocks and too few SMCs', () => {
    const p: Plan = { constituencies: plan.constituencies.filter((c) => c.type === 'GRC'), assign: plan.assign.map((a) => (plan.constituencies.find((c) => c.id === a)?.type === 'GRC' ? a : null)) }
    const s = computeStats(p, blocks, ctx, DEFAULT_PARTIES, 2025)
    const issues = validate(p, s, blocks, DEFAULT_RULES)
    expect(issues.some((i) => i.message.includes('not in any constituency'))).toBe(true)
    expect(issues.some((i) => i.message.includes('SMCs'))).toBe(true)
  })
})

describe('simulation', () => {
  it('monte carlo is reproducible and sensible', () => {
    const input = { plan: plan.constituencies, stats: stats.byId, contests, swings: DEFAULT_SWINGS, parties, runs: 200, seed: 7 }
    const a = monteCarlo(input)
    const b = monteCarlo(input)
    expect(a).toEqual(b)
    expect(a.papMajority).toBeGreaterThan(0.99)
    expect(a.winProb.AJ.WP).toBeGreaterThan(0.8)
  })
  it('timeline ends with every result declared', () => {
    const res = runElection(plan.constituencies, stats.byId, contests, DEFAULT_SWINGS, parties)
    const ev = buildTimeline(plan.constituencies, res, 1)
    expect(ev.filter((e) => e.kind === 'result' || e.kind === 'walkover').length).toBe(plan.constituencies.length)
    expect(ev.at(-1)!.kind).toBe('ncmp')
  })
  it('news flashes are occasional, ordered and reproducible', () => {
    const res = runElection(plan.constituencies, stats.byId, contests, { ...DEFAULT_SWINGS, national: -8 }, parties)
    const ctx = {
      leaders: Object.fromEntries(Object.entries(contests).map(([id, c]) => [id, c.leaders])),
      holders: Object.fromEntries(Object.entries(stats.byId).map(([id, s]) => [id, s.pap0 >= 0.5 ? 'PAP' : s.mainOpp])),
      prevNational: Object.fromEntries(Object.entries(ge.parties).map(([p, v]) => [p, v.national])),
    }
    const ev = buildTimeline(plan.constituencies, res, 3, ctx)
    expect(buildTimeline(plan.constituencies, res, 3, ctx)).toEqual(ev)
    // counts are unchanged by the news desk
    expect(ev.filter((e) => e.kind !== 'news')).toEqual(buildTimeline(plan.constituencies, res, 3))
    for (let i = 1; i < ev.length; i++) expect(ev[i].t).toBeGreaterThanOrEqual(ev[i - 1].t)
    expect(ev.at(-1)!.kind).toBe('ncmp')
    const news = ev.filter((e) => e.kind === 'news')
    expect(news.length).toBeGreaterThanOrEqual(5)
    expect(news.length).toBeLessThanOrEqual(16)
    expect(news.some((n) => n.headline.includes('PAP returned to government') || n.headline.includes('PAP secures a majority'))).toBe(true)
    expect(news.at(-1)!.headline).toBe('All results declared')
  })
})

describe('sharing', () => {
  it('round-trips a plan through the URL encoding', () => {
    const state = { plan, contests, swings: { ...DEFAULT_SWINGS, national: -3.5, demo: { a0: -4 } }, year: 2030 as const, customParties: [] }
    const back = decodeState(encodeState(state), blocks.length)
    expect(back?.plan).toEqual(plan)
    expect(back?.contests).toEqual(contests)
    expect(back?.swings.national).toBe(-3.5)
    expect(back?.year).toBe(2030)
  })
})
