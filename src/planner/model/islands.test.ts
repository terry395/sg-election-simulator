import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildPlannerData, type PlannerFile } from '../data/loadPlanner'
import { DEFAULT_POLICY } from '../data/demographics'
import { project } from './population'
import { emptyPlan, simulate } from './simulate'
import { NOT_CONNECTED, buildBlocked } from './rules'
import { DEFAULT_AUTO, autoPlan, joinableIslands, seaAreas, strategyOptions } from './autoplan'
import { baseIslands, islandLinks, seaPath } from './islands'

const file: PlannerFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/data/planner.json'), 'utf8'))
const data = buildPlannerData(file)
const policy = DEFAULT_POLICY
const proj = project(file.meta.age2026, file.meta.female2026, policy)
const island = (name: string) => baseIslands(data).islands.find((s) => s.name === name)!

describe('islands', { timeout: 30_000 }, () => {
  it('finds the offshore islands and which are already linked', () => {
    const names = baseIslands(data).islands.map((s) => s.name)
    for (const n of ['Pulau Tekong', 'Pulau Ubin', 'Jurong Island', 'Sentosa', 'Pulau Semakau']) expect(names).toContain(n)
    expect(island('Sentosa').prelinked).toBe(true)
    expect(joinableIslands(data).map((s) => s.name)).not.toContain('Sentosa')
    expect(islandLinks(data, simulate(data, emptyPlan(), proj, policy)).links).toHaveLength(0)
  })

  it('auto-plan joins a chosen island with new land, and the report sees it', () => {
    const opts = { ...strategyOptions('sea'), sea: { ...DEFAULT_AUTO.sea, join: ['Pulau Ubin'] } }
    const r = autoPlan(data, emptyPlan(), proj, { ...policy, budget: 80 }, opts, 0)
    const { links } = islandLinks(data, simulate(data, r.plan, proj, policy))
    const ubin = links.find((l) => l.island.name === 'Pulau Ubin')!
    expect(ubin).toBeTruthy()
    expect(ubin.joinedPhase).not.toBeNull()
    expect(ubin.kinds).toContain('land')
    expect(ubin.cells.length).toBeGreaterThan(0)
  })

  it('reclaims only off the coasts chosen', () => {
    const simple = autoPlan(data, emptyPlan(), proj, { ...policy, budget: 80 }, { ...strategyOptions('sea'), sea: { ...DEFAULT_AUTO.sea, regions: ['West'] } }, 0)
    const cells = simple.plan.flatMap((p) => Object.entries(p).filter(([, a]) => a.r).map(([c]) => Number(c)))
    expect(cells.length).toBeGreaterThan(50)
    expect(cells.every((i) => data.region[i] === 'West')).toBe(true)
    const area = seaAreas(data).find((a) => a.area === 'Changi')!.area
    const detailed = autoPlan(data, emptyPlan(), proj, { ...policy, budget: 80 }, { ...strategyOptions('sea'), sea: { ...DEFAULT_AUTO.sea, detail: 'detailed', areas: [area] } }, 0)
    const d = detailed.plan.flatMap((p) => Object.entries(p).filter(([, a]) => a.r).map(([c]) => Number(c)))
    expect(d.length).toBeGreaterThan(20)
    expect(d.every((i) => data.place[i].pa === area)).toBe(true)
  })

  it('bridges grow out from the shore, link an island and are not land', () => {
    const plan = emptyPlan()
    const ubin = island('Pulau Ubin')
    const main = new Set(baseIslands(data).main)
    const path = seaPath(data, ubin.cells, (i) => main.has(i), (i) => !data.land[i])
    expect(path.length).toBeGreaterThan(0)
    // open water far out is refused, the first span next to the island is fine
    const far = data.ring.findIndex((r, i) => !data.land[i] && r === 6)
    expect(buildBlocked(data, plan, far, 0, 'bridge')).toBe(NOT_CONNECTED)
    expect(buildBlocked(data, plan, path[0], 0, 'bridge')).toBeNull()
    expect(buildBlocked(data, plan, main.values().next().value!, 0, 'bridge')).not.toBeNull()
    for (const i of path) plan[0][i] = { z: 'bridge', d: 1 }
    const sim = simulate(data, plan, proj, policy)
    expect(sim.snaps[1].landKm2).toBe(sim.snaps[0].landKm2)
    expect(sim.snaps[1].crossings).toBe(path.length)
    const link = islandLinks(data, sim).links.find((l) => l.island.name === 'Pulau Ubin')!
    expect(link.joinedPhase).toBe(0)
    expect(link.kinds).toEqual(['bridge'])
  })
})
