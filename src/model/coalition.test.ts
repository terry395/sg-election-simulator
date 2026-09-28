import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data } from '../types'
import { DEFAULT_PARTIES, CONSTITUENCY_PALETTE } from '../data/parties'
import { buildBlockContext, computeStats, ge2025Plan } from './stats'
import { defaultContests } from './contests'
import { DEFAULT_SWINGS, runElection } from './swing'
import { HUNG_SCENARIO, assessCoalition, bandOf, isHung, majorityOf, suggestCoalitions, type CoalitionInput } from './coalition'
import { buildTimeline } from './timeline'

const toy = (seatsByParty: Record<string, number>, contests: CoalitionInput['contests'] = {}): CoalitionInput => ({
  seatsByParty,
  votesByParty: Object.fromEntries(Object.entries(seatsByParty).map(([p, n]) => [p, n * 1000])),
  totalValid: Object.values(seatsByParty).reduce((a, b) => a + b, 0) * 1000,
  total: Object.values(seatsByParty).reduce((a, b) => a + b, 0),
  contests,
})

describe('coalition arithmetic', () => {
  it('majority and hung detection', () => {
    expect(majorityOf(97)).toBe(49)
    expect(majorityOf(100)).toBe(51)
    expect(isHung({ PAP: 48, WP: 30, PSP: 19 }, 97)).toBe(true)
    expect(isHung({ PAP: 49, WP: 48 }, 97)).toBe(false)
  })
  it('detects viable, minimal and oversized coalitions', () => {
    const input = toy({ PAP: 40, WP: 30, PSP: 20, SDP: 7 })
    const a = assessCoalition(['WP', 'PSP'], input)
    expect(a.seats).toBe(50)
    expect(a.viable).toBe(true)
    expect(a.minimal).toBe(true)
    expect(a.lead).toBe('WP')
    const b = assessCoalition(['WP', 'PSP', 'SDP'], input)
    expect(b.viable).toBe(true)
    expect(b.minimal).toBe(false)
    expect(b.factors.some((f) => f.label === 'Oversized')).toBe(true)
    const c = assessCoalition(['WP', 'SDP'], input)
    expect(c.viable).toBe(false)
    expect(c.factors.some((f) => f.label === 'Short of a majority')).toBe(true)
    expect(c.band).toBe('Unlikely')
  })
  it('penalises members who fought each other', () => {
    const clash = { A: { parties: ['PAP', 'WP', 'PSP'], star: {} } }
    const apart = { A: { parties: ['PAP', 'WP'], star: {} }, B: { parties: ['PAP', 'PSP'], star: {} } }
    const input = { PAP: 40, WP: 30, PSP: 27 }
    expect(assessCoalition(['WP', 'PSP'], toy(input, clash)).score).toBeLessThan(assessCoalition(['WP', 'PSP'], toy(input, apart)).score)
  })
  it('bands follow the score thresholds', () => {
    expect([80, 70, 69, 50, 49, 30, 29].map(bandOf)).toEqual(['Likely', 'Likely', 'Plausible', 'Plausible', 'Difficult', 'Difficult', 'Unlikely'])
  })
  it('suggestions are viable, minimal, ranked and stable', () => {
    const input = toy({ PAP: 40, WP: 30, PSP: 15, SDP: 8, RDU: 4 })
    const s = suggestCoalitions(input, 4)
    expect(s.length).toBeGreaterThan(0)
    for (const a of s) { expect(a.viable).toBe(true); expect(a.minimal).toBe(true) }
    for (let i = 1; i < s.length; i++) expect(s[i].score).toBeLessThanOrEqual(s[i - 1].score)
    expect(suggestCoalitions(input, 4)).toEqual(s)
  })
})

describe('hung parliament scenario on the GE2025 map', () => {
  const dir = path.join(__dirname, '../../public/data')
  const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
  const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
  const parties = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))
  const plan = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)
  const stats = computeStats(plan, blocks, buildBlockContext(blocks, ge), DEFAULT_PARTIES, 2025)
  const contests = defaultContests(plan, stats, ge)
  const res = runElection(plan.constituencies, stats.byId, contests, { ...DEFAULT_SWINGS, ...HUNG_SCENARIO }, parties)

  it('the preset produces a hung parliament with workable coalitions', () => {
    expect(isHung(res.seatsByParty, 97)).toBe(true)
    expect(suggestCoalitions({ ...res, total: 97, contests }).length).toBeGreaterThan(0)
  })
  it('election night ends with a coalition-talks news flash', () => {
    const ev = buildTimeline(plan.constituencies, res, 5, { contests })
    const news = ev.filter((e) => e.kind === 'news')
    expect(news.at(-1)!.headline).toBe('Hung parliament: coalition talks expected')
    expect(ev.at(-1)!.kind).toBe('ncmp')
  })
})
