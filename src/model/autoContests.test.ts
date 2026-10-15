import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data } from '../types'
import { DEFAULT_PARTIES, CONSTITUENCY_PALETTE, PAP } from '../data/parties'
import { buildBlockContext, computeStats, ge2025Plan } from './stats'
import { autoContests, cooperates, defaultAutoSettings, pairKey, summarise, type AutoSettings } from './autoContests'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const ctx = buildBlockContext(blocks, ge)
const plan = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)
const stats = computeStats(plan, blocks, ctx, DEFAULT_PARTIES, 2025)
const base = defaultAutoSettings(plan, stats, ge, DEFAULT_PARTIES)
const run = (s: AutoSettings) => autoContests(plan, stats, ge, DEFAULT_PARTIES, s)
const withParty = (p: string, patch: Partial<AutoSettings['parties'][string]>, s: AutoSettings = base): AutoSettings =>
  ({ ...s, parties: { ...s.parties, [p]: { ...s.parties[p], ...patch } } })

describe('auto line-ups', () => {
  it('defaults reproduce the GE2025 line-ups on the GE2025 map', () => {
    const out = run(base)
    for (const c of ge.constituencies) {
      if (c.walkover) continue
      expect(new Set(out[c.id].parties)).toEqual(new Set(c.result.map((r) => r.party)))
    }
    expect(summarise(plan, out).byParty[PAP].seats).toBe(plan.constituencies.length)
  })

  it('cooperating parties never stand against each other', () => {
    let all: AutoSettings = { ...base, cooperate: {} }
    for (const p of DEFAULT_PARTIES) if (p.id !== PAP) all = withParty(p.id, { mode: 'all' }, all)
    for (const ct of Object.values(run(all))) {
      const opp = ct.parties.filter((p) => p !== PAP)
      expect(opp.length).toBe(1)
      for (const a of opp) for (const b of opp) if (a !== b) expect(cooperates(all, a, b)).toBe(false)
    }
  })

  it('parties that compete everywhere make multi-cornered fights', () => {
    let s = base
    for (const p of DEFAULT_PARTIES) if (p.id !== PAP) s = withParty(p.id, { mode: p.id === 'WP' || p.id === 'PSP' ? 'all' : 'none' }, s)
    s = { ...s, cooperate: { ...s.cooperate, [pairKey('WP', 'PSP')]: false } }
    for (const ct of Object.values(run(s))) expect(ct.parties).toEqual(expect.arrayContaining([PAP, 'WP', 'PSP']))
  })

  it('best-N never fields more MPs than the cap', () => {
    for (const cap of [1, 5, 12, 30]) {
      const sum = summarise(plan, run(withParty('PSP', { mode: 'best', maxSeats: cap })))
      expect(sum.byParty.PSP?.mps ?? 0).toBeLessThanOrEqual(cap)
    }
  })

  it('honours pins and never repeats a leader', () => {
    const target = 'TP'
    const out = run(withParty('WP', { pins: { [target]: 'Pritam Singh' } }))
    expect(out[target].parties).toContain('WP')
    expect(out[target].leaders?.WP).toBe('Pritam Singh')
    for (const p of DEFAULT_PARTIES) {
      const names = Object.values(out).map((c) => c.leaders?.[p.id]).filter(Boolean)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('battleground sends the top PAP name to the closest PAP fight', () => {
    const out = run(withParty(PAP, { anchors: 'battleground' }))
    const closest = Object.keys(out).filter((id) => out[id].parties.length > 1)
      .sort((a, b) => Math.abs(stats.byId[a].pap0 - 0.5) - Math.abs(stats.byId[b].pap0 - 0.5))[0]
    expect(out[closest].leaders?.[PAP]).toBe('Lawrence Wong')
  })
})
