import type { PlannerData } from '../data/loadPlanner'
import { BASELINE, type PopulationPolicy } from '../data/demographics'
import { atYear, PHASES } from './population'
import { isCancelled, reclaimCost, type SimResult, type Snapshot, type SpendKind } from './simulate'
import { planIssues } from './rules'
import { CELL_HA, GROUPS, ZONE, ZONES, isHousing, zoneCost, zoneHomes, type ZoneGroup, type ZoneId } from './zones'

export interface Project { phase: number; zone: ZoneId | 'reclaim'; area: string; cells: number; homes: number; cost: number; done: number }
export interface PlanReport {
  name: string
  date: Date
  first: Snapshot
  last: Snapshot
  snaps: Snapshot[]
  policy: PopulationPolicy
  projects: Project[]
  landUse: { group: ZoneGroup; zones: { id: ZoneId; ha0: number; ha1: number }[] }[]
  reclaimByPhase: number[]
  reclaimAreas: { area: string; km2: number }[]
  homesBuilt: number
  homesDemolished: number
  housingMix: { id: ZoneId; homes: number }[]
  totalSpend: number
  spendByKind: Partial<Record<SpendKind, number>>
  stationsAdded: number
  greenChange: number
  natureAdded: number
  issues: ReturnType<typeof planIssues>
  headline: string[]
}

const km2 = (cells: number) => (cells * CELL_HA) / 100

export function buildPlanReport(data: PlannerData, sim: SimResult, policy: PopulationPolicy, name: string, date = new Date()): PlanReport {
  const first = sim.snaps[0], last = sim.snaps[sim.snaps.length - 1]
  // ---- projects: decisions grouped by phase, use and planning area
  const proj = new Map<string, Project>()
  const reclaimByPhase = PHASES.map(() => 0)
  const reclaimArea = new Map<string, number>()
  for (let i = 0; i < data.n; i++) {
    const t = sim.timelines[i]
    const area = data.place[i].pa || data.region[i] || 'Singapore'
    if (t.reclaimPhase !== null) {
      reclaimByPhase[t.reclaimPhase]++
      reclaimArea.set(area, (reclaimArea.get(area) ?? 0) + 1)
      const k = `${t.reclaimPhase}|reclaim|${area}`
      const p = proj.get(k) ?? { phase: t.reclaimPhase, zone: 'reclaim' as const, area, cells: 0, homes: 0, cost: 0, done: t.landReady }
      p.cells++; p.cost += reclaimCost(data.ring[i]); p.done = Math.max(p.done, t.landReady)
      proj.set(k, p)
    }
    for (const b of t.builds) {
      if (isCancelled(b)) continue
      const k = `${b.phase}|${b.zone}|${area}`
      const p = proj.get(k) ?? { phase: b.phase, zone: b.zone, area, cells: 0, homes: 0, cost: 0, done: b.done }
      p.cells++; p.homes += zoneHomes(b.zone, b.density); p.cost += zoneCost(b.zone, b.density); p.done = Math.max(p.done, b.done)
      proj.set(k, p)
    }
  }
  const projects = [...proj.values()].sort((a, b) => a.phase - b.phase || b.cells - a.cells)

  // ---- land use, today and 2050
  const landUse = GROUPS.map((group) => ({
    group,
    zones: ZONES.filter((z) => z.group === group)
      .map((z) => ({ id: z.id, ha0: (first.byZone[z.id] ?? 0) * CELL_HA, ha1: (last.byZone[z.id] ?? 0) * CELL_HA }))
      .filter((z) => z.ha0 || z.ha1),
  })).filter((g) => g.zones.length)

  const homesBuilt = sim.snaps.slice(1).reduce((s, x) => s + x.homesCompleted, 0)
  const homesDemolished = sim.snaps.slice(1).reduce((s, x) => s + x.homesDemolished, 0)
  const mix = new Map<ZoneId, number>()
  for (const p of projects) if (p.zone !== 'reclaim' && isHousing(p.zone) && p.done <= 4) mix.set(p.zone, (mix.get(p.zone) ?? 0) + p.homes)
  const spendByKind: Partial<Record<SpendKind, number>> = {}
  for (const s of sim.snaps.slice(1)) for (const [k, v] of Object.entries(s.spendBy)) spendByKind[k as SpendKind] = (spendByKind[k as SpendKind] ?? 0) + (v ?? 0) / 1000
  const totalSpend = Object.values(spendByKind).reduce((a, b) => a + (b ?? 0), 0)
  const natureAdded = ((last.byZone.nature ?? 0) - (first.byZone.nature ?? 0)) * CELL_HA

  const pop50 = atYear(sim.projection, 2050)
  const headline: string[] = []
  headline.push(`Singapore grows from ${(BASELINE.total / 1e6).toFixed(2)} million people today to ${(pop50.total / 1e6).toFixed(2)} million in 2050, with ${((pop50.bands[3] / pop50.residents) * 100).toFixed(0)}% of residents aged 65 and over.`)
  headline.push(`The plan completes ${Math.round(homesBuilt).toLocaleString('en-SG')} new homes${homesDemolished ? ` and redevelops sites holding ${Math.round(homesDemolished).toLocaleString('en-SG')} older ones` : ''}, leaving ${last.supply >= last.demand ? 'a surplus' : 'a shortfall'} of about ${Math.round(Math.abs(last.supply - last.demand) / 1000)}k homes in 2050.`)
  if (last.reclaimedKm2 > 0.05) headline.push(`${last.reclaimedKm2.toFixed(1)} km² of new land is reclaimed, taking the land area to about ${last.landKm2.toFixed(0)} km².`)
  headline.push(`Liveability moves from ${first.score} today to ${last.score} in 2050, for total spending of about S$${totalSpend.toFixed(0)} billion over 25 years.`)

  return {
    name, date, first, last, snaps: sim.snaps, policy, projects, landUse, reclaimByPhase,
    reclaimAreas: [...reclaimArea].map(([area, n]) => ({ area, km2: km2(n) })).sort((a, b) => b.km2 - a.km2),
    homesBuilt, homesDemolished,
    housingMix: [...mix].map(([id, homes]) => ({ id, homes })).sort((a, b) => b.homes - a.homes),
    totalSpend, spendByKind,
    stationsAdded: last.stations - first.stations,
    greenChange: last.greenHa - first.greenHa,
    natureAdded,
    issues: planIssues(sim),
    headline,
  }
}

export const projectLabel = (p: Project) => (p.zone === 'reclaim' ? 'Land reclamation' : ZONE[p.zone].label)
