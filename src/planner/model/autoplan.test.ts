import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildPlannerData, type PlannerFile } from '../data/loadPlanner'
import { DEFAULT_POLICY } from '../data/demographics'
import { project } from './population'
import { emptyPlan, simulate, SAND_CAP } from './simulate'
import { planIssues } from './rules'
import { DEFAULT_AUTO, STRATEGIES, autoPlan, fixPlan, strategyOptions } from './autoplan'

const file: PlannerFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/data/planner.json'), 'utf8'))
const data = buildPlannerData(file)
const policy = DEFAULT_POLICY
const proj = project(file.meta.age2026, file.meta.female2026, policy)
const reclaimed = (plan: ReturnType<typeof emptyPlan>) => plan.map((p) => Object.values(p).filter((a) => a.r).length)

describe('auto-planner', () => {
  const balanced = autoPlan(data, emptyPlan(), proj, policy, DEFAULT_AUTO, 0)
  const sim = simulate(data, balanced.plan, proj, policy)

  it('balanced growth meets housing and service needs within budget', () => {
    for (const s of sim.snaps.slice(1)) {
      expect(s.supply).toBeGreaterThanOrEqual(s.demand)
      expect(s.healthIndex).toBeGreaterThanOrEqual(0.99)
      expect(s.schoolIndex).toBeGreaterThanOrEqual(0.99)
      expect(s.spend).toBeLessThanOrEqual(s.budget + 1e-9)
    }
    expect(sim.snaps[5].score).toBeGreaterThan(simulate(data, emptyPlan(), proj, policy).snaps[5].score)
  })
  it('only builds where building is allowed', () => {
    balanced.plan.forEach((p) => {
      for (const [c, a] of Object.entries(p)) {
        const i = Number(c)
        if (a.z && data.prot[i]) expect(['park', 'nature']).toContain(a.z)
        if (a.r) expect(data.land[i]).toBe(false)
      }
    })
    expect(sim.timelines.every((t) => t.builds.every((b) => b.cancelledAt !== -1))).toBe(true)
  })
  it('is deterministic', () => {
    expect(JSON.stringify(autoPlan(data, emptyPlan(), proj, policy, DEFAULT_AUTO, 0).plan)).toBe(JSON.stringify(balanced.plan))
  })
  it('compact city reclaims nothing; expand to the sea reclaims within the sand limit', () => {
    const compact = autoPlan(data, emptyPlan(), proj, policy, strategyOptions('compact'), 0)
    expect(reclaimed(compact.plan).every((n) => n === 0)).toBe(true)
    const sea = autoPlan(data, emptyPlan(), proj, { ...policy, budget: 80 }, strategyOptions('sea'), 0)
    const r = reclaimed(sea.plan)
    expect(r.reduce((a, b) => a + b, 0)).toBeGreaterThan(100)
    expect(Math.max(...r)).toBeLessThanOrEqual(SAND_CAP)
  })
  it('add keeps existing projects, replace clears the phases planned', () => {
    const mine = emptyPlan()
    const site = data.base.findIndex((z, i) => z === 'reserve' && !data.prot[i])
    mine[2][site] = { z: 'sports', d: 1 }
    expect(autoPlan(data, mine, proj, policy, { ...DEFAULT_AUTO, mode: 'add' }, 0).plan[2][site]?.z).toBe('sports')
    expect(autoPlan(data, mine, proj, policy, { ...DEFAULT_AUTO, mode: 'replace', phases: 'current' }, 2).plan[2][site]?.z).not.toBe('sports')
    expect(autoPlan(data, mine, proj, policy, { ...DEFAULT_AUTO, mode: 'replace', phases: 'current' }, 3).plan[2][site]?.z).toBe('sports')
  })
  it('every strategy produces a plan', () => {
    for (const s of STRATEGIES) {
      const r = autoPlan(data, emptyPlan(), proj, policy, strategyOptions(s.id), 0)
      expect(r.summary.reduce((n, x) => n + x.homes, 0)).toBeGreaterThan(50_000)
    }
  })
  it('fix my plan leaves fewer problems', () => {
    const before = planIssues(simulate(data, emptyPlan(), proj, policy)).length
    const fixed = fixPlan(data, emptyPlan(), proj, policy)
    const after = planIssues(simulate(data, fixed.plan, proj, policy)).length
    expect(after).toBeLessThan(before)
  })
})
