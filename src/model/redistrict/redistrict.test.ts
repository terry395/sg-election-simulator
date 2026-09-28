import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data, Plan } from '../../types'
import { CONSTITUENCY_PALETTE, DEFAULT_PARTIES } from '../../data/parties'
import { buildBlockContext, computeStats, ge2025Plan, isContiguous } from '../stats'
import { validate, DEFAULT_RULES } from '../validation'
import { redistrict, DEFAULT_OPTIONS, type RedistrictOptions, type RedistrictResult } from './index'
import { compactStructure } from './structure'

const dir = path.join(__dirname, '../../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const ctx = buildBlockContext(blocks, ge)
const ge25 = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)

const run = (o: Partial<RedistrictOptions>) => redistrict(blocks, ge, ge25, { ...DEFAULT_OPTIONS, ...o })

function checkValid(r: RedistrictResult, opts: { seats: number; smc?: number; maxDev: number }) {
  const { plan, report } = r
  // every populated block assigned
  for (const b of blocks) if (b.e25 > 0) expect(plan.assign[b.id], `block ${b.id}`).not.toBeNull()
  // contiguous
  const members: Record<string, number[]> = {}
  plan.assign.forEach((c, i) => { if (c) (members[c] ||= []).push(i) })
  for (const c of plan.constituencies) expect(isContiguous(members[c.id] ?? [], blocks), c.name).toBe(true)
  // structure
  expect(plan.constituencies.reduce((s, c) => s + c.seats, 0)).toBe(opts.seats)
  if (opts.smc !== undefined) expect(plan.constituencies.filter((c) => c.type === 'SMC').length).toBe(opts.smc)
  // rules
  const stats = computeStats(plan, blocks, ctx, DEFAULT_PARTIES, 2025)
  const issues = validate(plan, stats, blocks, { ...DEFAULT_RULES, targetSeats: opts.seats })
  expect(issues.filter((i) => i.level === 'error'), JSON.stringify(issues.filter((i) => i.level === 'error'))).toEqual([])
  expect(report.maxDeviation).toBeLessThanOrEqual(opts.maxDev + 1e-9)
  // unique names
  expect(new Set(plan.constituencies.map((c) => c.name)).size).toBe(plan.constituencies.length)
}

describe('structure', () => {
  it('fills seats with SMCs and GRCs of 3-6', () => {
    const s = compactStructure(97, 15, 'mixed')
    expect(s.reduce((a, d) => a + d.seats, 0)).toBe(97)
    expect(s.filter((d) => d.type === 'SMC').length).toBe(15)
    for (const d of s) if (d.type === 'GRC') expect(d.seats).toBeGreaterThanOrEqual(3)
    for (const d of s) expect(d.seats).toBeLessThanOrEqual(6)
  })
})

describe('auto-draw', () => {
  let compact: RedistrictResult
  it('fair & compact: 97 seats, 15 SMCs, within ±10%', () => {
    compact = run({ method: 'compact', seed: 3 })
    console.log('compact', compact.report)
    checkValid(compact, { seats: 97, smc: 15, maxDev: 0.1 })
    expect(compact.report.ms).toBeLessThan(8000)
  }, 30000)

  it('is deterministic for a fixed seed', () => {
    const again = run({ method: 'compact', seed: 3 })
    expect(again.plan.assign.map((c) => again.plan.constituencies.findIndex((x) => x.id === c)))
      .toEqual(compact.plan.assign.map((c) => compact.plan.constituencies.findIndex((x) => x.id === c)))
  }, 30000)

  it('all SMCs: 97 single-member seats within ±15%', () => {
    const r = run({ method: 'custom', smcCount: 97, grcCounts: { 3: 0, 4: 0, 5: 0, 6: 0 }, maxDeviation: 0.15, seed: 2 })
    console.log('all-smc', r.report)
    checkValid(r, { seats: 97, smc: 97, maxDev: 0.15 })
  }, 30000)

  it('EBRC-style keeps most voters in their constituency and fixes imbalances', () => {
    const r = run({ method: 'ebrc', totalSeats: 97, smcCount: 15, maxDeviation: 0.15, seed: 1 })
    console.log('ebrc', r.report)
    checkValid(r, { seats: 97, maxDev: 0.15 })
    expect(r.report.keptShare).toBeGreaterThan(0.8)
  }, 30000)

  it('EBRC-style for the 2030 register adds seats and SMCs', () => {
    const r = run({ method: 'ebrc', year: 2030, totalSeats: 101, smcCount: 17, maxDeviation: 0.15, seed: 1 })
    console.log('ebrc-2030', r.report)
    expect(r.report.seats).toBe(101)
    expect(r.report.smc).toBeGreaterThanOrEqual(17)
    expect(r.report.maxDeviation).toBeLessThanOrEqual(0.15 + 1e-9)
  }, 30000)

  it('gerrymanders move seats in the chosen direction', () => {
    const pap = run({ method: 'gerrymander', goal: 'pap', maxDeviation: 0.15, seed: 5 })
    const opp = run({ method: 'gerrymander', goal: 'opposition', maxDeviation: 0.15, seed: 5 })
    const comp = run({ method: 'gerrymander', goal: 'competitive', maxDeviation: 0.15, seed: 5 })
    console.log('gerry pap', pap.report, 'opp', opp.report, 'competitive', comp.report, 'compact', compact.report)
    checkValid(pap, { seats: 97, smc: 15, maxDev: 0.15 })
    checkValid(opp, { seats: 97, smc: 15, maxDev: 0.15 })
    expect(pap.report.papSeats).toBeGreaterThanOrEqual(compact.report.papSeats)
    expect(opp.report.oppSeats).toBeGreaterThan(compact.report.oppSeats)
    checkValid(comp, { seats: 97, smc: 15, maxDev: 0.15 })
    expect(comp.report.competitiveSeats).toBeGreaterThan(compact.report.competitiveSeats)
  }, 60000)
})

export type { Plan }
