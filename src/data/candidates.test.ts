import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data } from '../types'
import { NOTABLE, anchor2025, candidatesByParty, leaderBonus } from './candidates'
import { PARTY_INFO } from './partyInfo'
import { CONSTITUENCY_PALETTE, DEFAULT_PARTIES } from './parties'
import { buildBlockContext, computeStats, ge2025Plan } from '../model/stats'
import { defaultContests } from '../model/contests'
import { projectSeat, DEFAULT_SWINGS } from '../model/swing'
import { decodeState, encodeState } from '../share/serialize'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))

describe('candidates', () => {
  it('every well-known figure matches a real GE2025 candidate of their party', () => {
    const all = ge.constituencies.flatMap((c) => c.result.flatMap((r) => r.candidates.map((n) => ({ n, party: r.party }))))
    for (const x of NOTABLE) expect(all.some((a) => a.party === x.party && a.n.includes(x.match)), `${x.name} (${x.party})`).toBe(true)
  })
  it('lists candidates per party with notable people first', () => {
    const c = candidatesByParty(ge)
    expect(c.PAP[0].name).toBe('Lawrence Wong')
    expect(c.WP[0].name).toBe('Pritam Singh')
    expect(c.PAP.length).toBeGreaterThan(90)
  })
  it('picks the real 2025 anchors', () => {
    expect(anchor2025(ge, 'AM', 'PAP')).toBe('Lee Hsien Loong')
    expect(anchor2025(ge, 'MY', 'PAP')).toBe('Lawrence Wong')
    expect(anchor2025(ge, 'AJ', 'WP')).toBe('Pritam Singh')
    expect(anchor2025(ge, 'SE', 'SDP')).toBe('Chee Soon Juan')
    expect(anchor2025(ge, 'WJ', 'PSP')).toBe('Tan Cheng Bock')
    expect(leaderBonus('Lawrence Wong', 'PAP')).toBe(3)
    expect(leaderBonus('Someone New', 'WP')).toBe(0)
  })
  it('has an information card for every built-in party', () => {
    for (const p of DEFAULT_PARTIES) expect(PARTY_INFO[p.id], p.id).toBeDefined()
  })
})

describe('leaders in contests', () => {
  const ctx = buildBlockContext(blocks, ge)
  const plan = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)
  const stats = computeStats(plan, blocks, ctx, DEFAULT_PARTIES, 2025)
  const contests = defaultContests(plan, stats, ge)
  const parties = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))

  it('defaults leaders without changing the GE2025 baseline', () => {
    expect(contests.MY.leaders?.PAP).toBe('Lawrence Wong')
    expect(contests.AJ.leaders?.WP).toBe('Pritam Singh')
    expect(Object.values(contests).every((c) => Object.values(c.star).every((v) => v === 0))).toBe(true)
  })

  it('a star leader moved into a seat lifts that party there', () => {
    const c = plan.constituencies.find((x) => x.id === 'EC')!
    const base = projectSeat(c, stats.byId.EC, contests.EC, DEFAULT_SWINGS, parties).shares.WP
    const withPritam = { ...contests.EC, leaders: { ...contests.EC.leaders, WP: 'Pritam Singh' }, star: { WP: leaderBonus('Pritam Singh', 'WP') - leaderBonus(contests.EC.leaders?.WP, 'WP') } }
    expect(projectSeat(c, stats.byId.EC, withPritam, DEFAULT_SWINGS, parties).shares.WP).toBeGreaterThan(base)
  })

  it('leaders survive the share link', () => {
    const edited = { ...contests, EC: { ...contests.EC, leaders: { PAP: 'My Custom Name', WP: 'Pritam Singh' } } }
    const back = decodeState(encodeState({ plan, contests: edited, swings: DEFAULT_SWINGS, year: 2025, customParties: [] }), blocks.length)
    expect(back?.contests.EC.leaders).toEqual({ PAP: 'My Custom Name', WP: 'Pritam Singh' })
  })
})
