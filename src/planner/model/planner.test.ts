import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildPlannerData, type PlannerFile } from '../data/loadPlanner'
import { BASELINE, DEFAULT_POLICY } from '../data/demographics'
import { atYear, project } from './population'
import { emptyPlan, simulate, timelines } from './simulate'
import { buildBlocked, planIssues, reclaimBlocked } from './rules'
import { zoneHomes } from './zones'

const file: PlannerFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/data/planner.json'), 'utf8'))
const data = buildPlannerData(file)
const proj = project(file.meta.age2026, file.meta.female2026, DEFAULT_POLICY)

describe('planner data', () => {
  it('places every resident counted at end-June 2026', () => {
    const placed = data.pop.reduce((a, b) => a + b, 0)
    expect(Math.abs(placed - file.meta.residents2026) / file.meta.residents2026).toBeLessThan(0.001)
    // Population in Brief 2026: 3,684.9k citizens + 546.6k PRs
    expect(Math.abs(file.meta.residents2026 - (BASELINE.citizens + BASELINE.prs))).toBeLessThan(1000)
  })
  it('has land and reclaimable sea', () => {
    expect(data.land.filter(Boolean).length).toBeGreaterThan(12000)
    expect(data.land.filter((l) => !l).length).toBeGreaterThan(3000)
    expect(Object.keys(data.station).length).toBeGreaterThan(150)
  })
})

describe('population projection', () => {
  it('starts at the 2026 baseline', () => {
    const p = proj[0]
    expect(p.total).toBeCloseTo(BASELINE.total, -4)
    expect(Math.abs(p.medianAge - BASELINE.medianAge)).toBeLessThan(1.5)
    expect(Math.abs(p.bands[3] / p.residents - BASELINE.seniorShare)).toBeLessThan(0.01)
  })
  it('ages: more seniors and fewer children by 2050 at low fertility', () => {
    const p = atYear(proj, 2050)
    expect(p.bands[3]).toBeGreaterThan(proj[0].bands[3] * 1.4)
    expect(p.bands[1]).toBeLessThan(proj[0].bands[1])
    expect(p.supportRatio).toBeLessThan(proj[0].supportRatio)
  })
  it('responds to immigration', () => {
    const more = project(file.meta.age2026, file.meta.female2026, { ...DEFAULT_POLICY, netMigration: 60_000 })
    expect(atYear(more, 2050).residents).toBeGreaterThan(atYear(proj, 2050).residents + 800_000)
  })
})

describe('simulation', () => {
  const base = simulate(data, emptyPlan(), proj, DEFAULT_POLICY)
  it('with no plan, today matches the baseline and housing is balanced', () => {
    const s = base.snaps[0]
    expect(Math.abs(s.supply / s.demand - 1)).toBeLessThan(0.01)
    expect(s.jobsRatio).toBeGreaterThan(0.85)
    expect(s.jobsRatio).toBeLessThan(1.15)
    expect(s.reach.station).toBeGreaterThan(0.5)
    expect(s.score).toBeGreaterThan(50)
    expect(s.reclaimedKm2).toBe(0)
  })
  it('a new HDB estate adds homes when finished', () => {
    const plan = emptyPlan()
    const sites = data.base.map((z, i) => (z === 'reserve' && !data.prot[i] ? i : -1)).filter((i) => i >= 0).slice(0, 20)
    for (const i of sites) plan[1][i] = { z: 'hdb', d: 1 }
    const sim = simulate(data, plan, proj, DEFAULT_POLICY)
    expect(sim.snaps[1].supply).toBeCloseTo(base.snaps[1].supply, 0)
    expect(sim.snaps[2].supply - base.snaps[2].supply).toBeCloseTo(20 * zoneHomes('hdb', 1), 0)
    expect(sim.snaps[2].spend).toBeGreaterThan(0)
  })
  it('reclamation grows from the coast and deep land takes longer', () => {
    const plan = emptyPlan()
    const shore = data.land.findIndex((l, i) => !l && data.ring[i] === 1)
    const far = data.land.findIndex((l, i) => !l && data.ring[i] >= 9)
    expect(reclaimBlocked(data, plan, shore, 0, 0)).toBeNull()
    expect(reclaimBlocked(data, plan, far, 0, 0)).toMatch(/coast/)
    expect(buildBlocked(data, plan, shore, 0, 'park')).toBe('reclaim')
    plan[0][shore] = { r: 1, z: 'park' }
    const t = timelines(data, plan)[shore]
    expect(t.landReady).toBe(0)
    const sim = simulate(data, plan, proj, DEFAULT_POLICY)
    // land is ready at the end of 2026–30; the park is built in 2031–35
    expect(sim.snaps[1].zone[shore]).toBe('reserve')
    expect(sim.snaps[2].zone[shore]).toBe('park')
    expect(sim.snaps[1].reclaimedKm2).toBeGreaterThan(0)
    plan[0][far] = { r: 1 }
    expect(timelines(data, plan)[far].landReady).toBe(2)
  })
  it('protected reserves cannot be built on', () => {
    const p = data.prot.findIndex(Boolean)
    expect(buildBlocked(data, emptyPlan(), p, 0, 'hdb')).toMatch(/Protected/)
    expect(buildBlocked(data, emptyPlan(), p, 0, 'nature')).toBeNull()
  })
  it('an empty plan falls short of homes as households grow', () => {
    expect(planIssues(base).some((i) => /shortfall/.test(i.text))).toBe(true)
  })
})
