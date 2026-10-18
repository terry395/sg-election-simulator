import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data } from '../types'
import { CONSTITUENCY_PALETTE, DEFAULT_PARTIES } from '../data/parties'
import { buildBlockContext, computeStats, ge2025Plan } from './stats'
import { compareBoundaries, compareResults, fracEntries, HIST_YEARS, notionalPast, seatLineage, type HistYearData } from './history'
import { runElection, DEFAULT_SWINGS } from './swing'
import { defaultContests } from './contests'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const years: HistYearData[] = JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8')).years
const plan = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)
const stats = computeStats(plan, blocks, buildBlockContext(blocks, ge), DEFAULT_PARTIES, 2025)
const y = (yr: number) => years.find((d) => d.year === yr)!

describe('history data', () => {
  it('has every year with official seat totals', () => {
    expect(years.map((d) => d.year)).toEqual([...HIST_YEARS])
    expect(years.map((d) => d.seats)).toEqual([84, 87, 89, 93, 97])
    for (const d of years) expect(d.constituencies.reduce((s, c) => s + c.seats, 0)).toBe(d.seats)
  })
  it('every block maps to past constituencies with shares adding up to 1', () => {
    for (const d of years) {
      expect(d.frac.length).toBe(blocks.length)
      for (const f of d.frac) {
        const e = fracEntries(f)
        expect(Math.abs(e.reduce((s, x) => s + x[1], 0) - 1)).toBeLessThan(1e-6)
        for (const [j] of e) expect(d.constituencies[j]).toBeDefined()
      }
    }
  })
  it('national results match the official totals', () => {
    expect(y(2011).parties.PAP.share).toBeCloseTo(0.6014, 3)
    expect(y(2011).parties.WP.seats).toBe(6)
    expect(y(2020).parties.WP.seats).toBe(10)
    expect(y(2020).parties.PAP.seats).toBe(83)
    expect(y(2006).constituencies.filter((c) => c.walkover).length).toBe(7)
    expect(y(2025).parties.PAP.share).toBeCloseTo(ge.parties.PAP.national, 3)
  })
})

describe('boundary comparison', () => {
  it('the GE2025 map matches GE2025 exactly', () => {
    const cmp = compareBoundaries(plan, stats, blocks, y(2025), 2025)
    expect(cmp.similarity).toBeCloseTo(1, 6)
    expect(cmp.unchanged).toBe(plan.constituencies.length)
    expect(cmp.fates.kept).toBe(ge.constituencies.length)
    expect(cmp.then.seats).toBe(97)
    expect(cmp.yours.seats).toBe(97)
  })
  it('the GE2025 map differs from GE2020', () => {
    const cmp = compareBoundaries(plan, stats, blocks, y(2020), 2025)
    expect(cmp.similarity).toBeLessThan(0.95)
    expect(cmp.similarity).toBeGreaterThan(0.5)
    expect(cmp.then.constituencies).toBe(31)
    expect(cmp.created + cmp.redrawn + cmp.unchanged).toBe(33)
    // Aljunied GRC was hardly touched
    const al = cmp.seats.find((s) => s.id === plan.constituencies.find((c) => c.name.startsWith('Aljunied'))!.id)!
    expect(al.best?.name).toBe('Aljunied GRC')
    expect(al.status).not.toBe('new')
  })
  it('traces each seat back through every election', () => {
    const lin = seatLineage(plan, blocks, years, 2025)
    const sk = lin[plan.constituencies.find((c) => c.name.startsWith('Sengkang'))!.id]
    expect(sk.map((s) => s.year)).toEqual([...HIST_YEARS])
    expect(sk.at(-1)!.name).toBe('Sengkang GRC')
  })
})

describe('notional past results', () => {
  it('reproduces GE2025 on the GE2025 map', () => {
    const n = notionalPast(plan, blocks, y(2025), 2025)
    for (const c of ge.constituencies) {
      if (c.walkover) { expect(n[c.id].shares).toBeNull(); continue }
      for (const r of c.result) expect(n[c.id].shares![r.party]).toBeCloseTo(r.share, 4)
      expect(n[c.id].covered).toBeCloseTo(1, 6)
    }
  })
  it('compares an election night with a past election', () => {
    const contests = defaultContests(plan, stats, ge)
    const parties = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))
    const result = runElection(plan.constituencies, stats.byId, contests, DEFAULT_SWINGS, parties)
    const electors = Object.fromEntries(Object.entries(stats.byId).map(([id, s]) => [id, s.electors]))
    const cmp = compareResults(result, plan.constituencies, electors, y(2025), notionalPast(plan, blocks, y(2025), 2025))
    const pap = cmp.parties.find((p) => p.party === 'PAP')!
    expect(pap.seatsThen).toBe(87)
    expect(pap.seatsNow).toBe(87)
    expect(pap.shareNow! - pap.shareThen!).toBeLessThan(0.01)
    // zero swing on the GE2025 map: every contested seat's PAP share is unchanged
    for (const s of cmp.seatSwings) if (s.swing !== null) expect(Math.abs(s.swing)).toBeLessThan(0.002)
  })
})
