import type { PlannerData } from '../data/loadPlanner'
import { PHASES } from './population'
import { SAND_CAP, isCancelled, type NationalPlan, type SimResult } from './simulate'
import { CROSSING_MAX_RING, ZONE, isCrossing, type ZoneId } from './zones'
import { islandLinks } from './islands'

/** land exists at the end of `phase` or is being reclaimed by then */
export function hasLandBy(data: PlannerData, plan: NationalPlan, cell: number, phase: number) {
  if (data.land[cell]) return true
  for (let p = 0; p <= phase; p++) if (plan[p][cell]?.r) return true
  return false
}

/** why a sea hexagon cannot be reclaimed in a phase (null = it can) */
export function reclaimBlocked(data: PlannerData, plan: NationalPlan, cell: number, phase: number, reclaimedNow: number): string | null {
  if (data.land[cell]) return 'This is already land'
  if (hasLandBy(data, plan, cell, phase)) return null
  if (reclaimedNow >= SAND_CAP) return `Sand supply limit: at most ${SAND_CAP} hexagons (~${Math.round(SAND_CAP * 0.054)} km²) can be reclaimed in one phase`
  if (!data.neighbours[cell].some((j) => hasLandBy(data, plan, j, phase))) return 'New land must grow out from the coast: reclaim next to existing or newly reclaimed land'
  return null
}

/** a bridge, causeway or tunnel that does not yet reach land (it may once its neighbours are built) */
export const NOT_CONNECTED = 'Bridges, causeways and tunnels must start from the coast: build next to land or another crossing'

/** a crossing is planned on the hexagon in this phase or before */
export function crossingBy(plan: NationalPlan, cell: number, phase: number) {
  for (let p = 0; p <= phase; p++) if (isCrossing(plan[p][cell]?.z)) return true
  return false
}

/** why a zone cannot be built on a hexagon (null = it can; "reclaim" = it can once reclaimed) */
export function buildBlocked(data: PlannerData, plan: NationalPlan, cell: number, phase: number, zone: ZoneId): string | null {
  if (!ZONE[zone].buildable) return `${ZONE[zone].label} cannot be built`
  if (data.prot[cell] && zone !== 'nature' && zone !== 'park') return 'Protected nature reserve: only parks and nature are allowed here'
  if (isCrossing(zone)) {
    if (hasLandBy(data, plan, cell, phase)) return 'Bridges, causeways and tunnels cross the sea: on land, build an expressway'
    if (data.ring[cell] > (CROSSING_MAX_RING[zone] ?? 0)) return zone === 'causeway' ? 'A causeway needs shallow water (within 750 m of shore): use a bridge or tunnel' : 'Too deep for a bridge (more than 2.5 km out): use an undersea tunnel'
    if (!data.neighbours[cell].some((j) => hasLandBy(data, plan, j, phase) || crossingBy(plan, j, phase))) return NOT_CONNECTED
    return null
  }
  if (!hasLandBy(data, plan, cell, phase)) return 'reclaim'
  return null
}

export function reclaimedCount(plan: NationalPlan, phase: number) {
  let n = 0
  for (const a of Object.values(plan[phase])) if (a.r) n++
  return n
}

export interface PlanIssue { phase: number; level: 'error' | 'warn'; text: string }

/** The plan's problems, phase by phase, in plain words. */
export function planIssues(sim: SimResult, data?: PlannerData): PlanIssue[] {
  const out: PlanIssue[] = []
  const unlinked = data ? islandLinks(data, sim).unlinkedHomes : null
  for (const s of sim.snaps.slice(1)) {
    const p = s.phase
    const label = PHASES[p].label
    const gap = s.demand - s.supply
    if (gap > s.demand * 0.02) out.push({ phase: p, level: 'error', text: `${label}: a shortfall of about ${Math.round(gap / 1000)}k homes for ${Math.round(s.demand / 1000)}k households. Build more housing or plan for slower growth.` })
    else if (s.supply > s.demand * 1.12) out.push({ phase: p, level: 'warn', text: `${label}: about ${Math.round((s.supply - s.demand) / 1000)}k more homes than households. Many flats would stand empty.` })
    if (s.spend > s.budget) out.push({ phase: p, level: 'error', text: `${label}: spending of S$${s.spend.toFixed(1)}b is over the S$${s.budget}b budget.` })
    if (s.homesDemolished > 0 && s.homesCompleted < s.homesDemolished) out.push({ phase: p, level: 'warn', text: `${label}: ${Math.round(s.homesDemolished).toLocaleString('en-SG')} homes are demolished for redevelopment but only ${Math.round(s.homesCompleted).toLocaleString('en-SG')} are completed. Residents need replacement flats (decanting).` })
    if (s.greenPer1000 < 0.8) out.push({ phase: p, level: 'warn', text: `${label}: ${s.greenPer1000.toFixed(2)} ha of parks and nature per 1,000 residents, below the 0.8 ha target.` })
    if (s.reach.station < 0.7) out.push({ phase: p, level: 'warn', text: `${label}: only ${Math.round(s.reach.station * 100)}% of homes are within 1 km of an MRT station.` })
    if (s.schoolIndex < 0.95) out.push({ phase: p, level: 'warn', text: `${label}: school places are falling behind the number of children (index ${s.schoolIndex.toFixed(2)}).` })
    if (s.healthIndex < 0.95) out.push({ phase: p, level: 'error', text: `${label}: hospitals and eldercare are not keeping up with an ageing population (index ${s.healthIndex.toFixed(2)}).` })
    if (s.utilityIndex < 0.95) out.push({ phase: p, level: 'warn', text: `${label}: power, water and waste capacity is not keeping up with population (index ${s.utilityIndex.toFixed(2)}).` })
    if (s.jobsRatio < 0.95) out.push({ phase: p, level: 'warn', text: `${label}: about ${Math.round((1 - s.jobsRatio) * 100)}% fewer jobs than workers. Add commercial, business or industrial land.` })
    if (s.jobsRatio > 1.15) out.push({ phase: p, level: 'warn', text: `${label}: ${Math.round((s.jobsRatio - 1) * 100)}% more jobs than workers. Expect more foreign workers or labour shortages.` })
    if (unlinked && unlinked[p] >= 100) out.push({ phase: p, level: 'warn', text: `${label}: about ${Math.round(unlinked[p]).toLocaleString('en-SG')} homes are on islands with no bridge, causeway, tunnel or land link to the main island.` })
    if (s.industryShare < 0.15) out.push({ phase: p, level: 'warn', text: `${label}: industry is down to ${Math.round(s.industryShare * 100)}% of land. Manufacturing needs space.` })
  }
  const unbuilt = sim.timelines.reduce((n, t) => n + t.builds.filter((b) => !isCancelled(b) && b.done > 4).length, 0)
  if (unbuilt) out.push({ phase: 4, level: 'warn', text: `${unbuilt} project${unbuilt === 1 ? '' : 's'} will not be finished by 2050 (waiting for reclaimed land or long build times).` })
  return out
}
