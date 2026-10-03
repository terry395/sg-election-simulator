import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data, Plan, Swings } from '../types'
import { DEFAULT_PARTIES, CONSTITUENCY_PALETTE } from '../data/parties'
import { buildBlockContext, computeStats, ge2025Plan } from './stats'
import { defaultContests } from './contests'
import { DEFAULT_SWINGS, runElection } from './swing'
import { validate, DEFAULT_RULES } from './validation'
import { buildTimeline } from './timeline'
import { buildReport, type ReportInput } from './report'
import { rng } from './rng'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const partyMap = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))
const ctx = buildBlockContext(blocks, ge)
const ge25 = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)

function input(plan: Plan, swings: Swings = DEFAULT_SWINGS, seed?: number): ReportInput {
  const stats = computeStats(plan, blocks, ctx, DEFAULT_PARTIES, 2025)
  const contests = defaultContests(plan, stats, ge)
  const projection = runElection(plan.constituencies, stats.byId, contests, swings, partyMap)
  const result = seed === undefined ? projection : runElection(plan.constituencies, stats.byId, contests, swings, partyMap, rng(seed))
  return {
    plan: plan.constituencies, result, projection,
    events: buildTimeline(plan.constituencies, result, seed ?? 1),
    mode: seed === undefined ? 'projection' : 'surprise',
    coalition: null, stats, issues: validate(plan, stats, blocks, DEFAULT_RULES),
    contests, defaults: contests, swings, parties: DEFAULT_PARTIES, ge, blocks, year: 2025,
  }
}

describe('election report', () => {
  it('GE2025 map with zero swing: nothing changed', () => {
    const r = buildReport(input(ge25))
    expect(r.boundaries.changed).toBe(false)
    expect(r.seats.every((s) => s.status === 'unchanged')).toBe(true)
    expect(r.boundaries.oldSeats.every((o) => o.fate === 'kept')).toBe(true)
    expect(r.boundaries.votersMoved).toBe(0)
    expect(r.boundaries.notionalSeats).toEqual({ PAP: 87, WP: 10 })
    expect(r.boundaries.boundaryEffect).toEqual({})
    expect(r.boundaries.notionalFlips).toHaveLength(0)
    expect(r.summary.gains).toBe(0)
    expect(r.contests.changedLineups).toHaveLength(0)
    for (const s of r.seats.filter((s) => s.totalSwing !== null)) {
      expect(Math.abs(s.totalSwing!), s.c.name).toBeLessThan(0.3)
      expect(s.surprise).toBe(0)
    }
    expect(r.takeaways.length).toBeGreaterThanOrEqual(4)
  })

  it('a redrawn map is classified and voters moved are counted', () => {
    // merge Hougang SMC into Aljunied GRC
    const assign = ge25.assign.map((a) => (a === 'HG' ? 'AJ' : a))
    const plan: Plan = { constituencies: ge25.constituencies.filter((c) => c.id !== 'HG'), assign }
    const r = buildReport(input(plan))
    const al = r.seats.find((s) => s.c.id === 'AJ')!
    expect(al.status).toBe('redrawn')
    expect(al.basedOn).toBe('AJ')
    expect(r.boundaries.oldSeats.find((o) => o.id === 'HG')!.fate).toBe('merged')
    expect(r.boundaries.votersMoved).toBe(blocks.filter((b) => b.ed === 'HG').reduce((n, b) => n + b.e25, 0))
    expect(r.boundaries.changed).toBe(true)
    expect(r.boundaries.count.constituencies).toBe(ge.constituencies.length - 1)
  })

  it('settings and surprises add up to the total swing', () => {
    const r = buildReport(input(ge25, { ...DEFAULT_SWINGS, national: -4 }, 42))
    const withSwing = r.seats.filter((s) => s.totalSwing !== null)
    expect(withSwing.length).toBeGreaterThan(20)
    for (const s of withSwing) expect(s.settingsSwing! + s.surprise!).toBeCloseTo(s.totalSwing!, 6)
    expect(r.swings.avgSettings!).toBeLessThan(-3)
    expect(r.results.samples!.total).toBe(r.summary.contested)
  })

  it('the tipping point really costs the majority', () => {
    const r = buildReport(input(ge25))
    const tip = r.results.loseMajority.points!
    expect(tip).toBeGreaterThan(0)
    const stats = computeStats(ge25, blocks, ctx, DEFAULT_PARTIES, 2025)
    const contests = defaultContests(ge25, stats, ge)
    const seatsAt = (n: number) => runElection(ge25.constituencies, stats.byId, contests, { ...DEFAULT_SWINGS, national: n }, partyMap).seatsByParty.PAP ?? 0
    expect(seatsAt(-(tip - 0.5))).toBeGreaterThanOrEqual(r.summary.majority)
    expect(seatsAt(-(tip + 0.5))).toBeLessThan(r.summary.majority)
  })
})
