import { mix, ramp, SEQ } from '../../lib/color'
import type { PlannerData } from '../data/loadPlanner'
import { ZONE, AMEN } from '../model/zones'
import type { CellStates, NationalPlan } from '../model/simulate'
import { hasLandBy } from '../model/rules'
import type { PlannerLens, PlannerTool } from '../state/planner'

export const LENSES: { id: PlannerLens; label: string }[] = [
  { id: 'zone', label: 'Land use' },
  { id: 'phase', label: 'Changes by phase' },
  { id: 'density', label: 'Residents' },
  { id: 'seniors', label: 'Seniors' },
  { id: 'access', label: 'MRT access' },
  { id: 'depth', label: 'Sea & reclamation' },
]
export const PHASE_COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#e11d48']
const SEA_DEPTH = ['#e0f2fe', '#7dd3fc', '#0369a1']
export const LENS_LEGEND: Partial<Record<PlannerLens, { stops: string[]; lo: string; hi: string; label: string }>> = {
  density: { stops: SEQ, lo: '0', hi: '3,000+', label: 'residents per hexagon' },
  seniors: { stops: ['#f7f4f9', '#d4b9da', '#df65b0', '#980043'], lo: '0%', hi: '35%+', label: 'aged 65 and over' },
  depth: { stops: SEA_DEPTH, lo: 'shore', hi: '3 km out', label: 'distance from shore (deeper)' },
}
const SAND = '#e7d7b0'
const LAND_GREY = '#e2e8f0'

/** within `rings` steps of any hexagon with the bit */
function near(data: PlannerData, amen: Uint8Array, bit: number, rings: number) {
  const hit = new Uint8Array(data.n)
  let frontier: number[] = []
  for (let i = 0; i < data.n; i++) if (amen[i] & bit) { hit[i] = 1; frontier.push(i) }
  for (let d = 0; d < rings; d++) {
    const next: number[] = []
    for (const i of frontier) for (const j of data.neighbours[i]) if (!hit[j]) { hit[j] = 1; next.push(j) }
    frontier = next
  }
  return hit
}

/** fill colour per hexagon (null = not drawn) and whether it is under construction */
export function cellColors(data: PlannerData, st: CellStates, plan: NationalPlan, lens: PlannerLens, tool: PlannerTool, phase: number) {
  const fill: (string | null)[] = new Array(data.n).fill(null)
  const showSea = tool === 'reclaim' || lens === 'depth'
  const access = lens === 'access' ? near(data, st.amen, AMEN.station, 4) : null
  for (let i = 0; i < data.n; i++) {
    const z = st.zone[i]
    if (!z) {
      if (st.status[i] === 2 || hasLandBy(data, plan, i, phase)) { fill[i] = SAND; continue }
      if (showSea) {
        const reachable = data.neighbours[i].some((j) => hasLandBy(data, plan, j, phase))
        fill[i] = lens === 'depth' ? ramp(SEA_DEPTH, data.ring[i] / 12) : reachable ? '#38bdf8' : '#bae6fd'
      }
      continue
    }
    switch (lens) {
      case 'zone': fill[i] = st.status[i] === 2 ? SAND : ZONE[z].color; break
      case 'phase': {
        let last = -1
        for (let p = 0; p <= phase; p++) if (plan[p][i]) last = p
        fill[i] = last >= 0 ? PHASE_COLORS[last] : LAND_GREY
        break
      }
      case 'density': fill[i] = st.homes[i] ? ramp(SEQ, (st.homes[i] * 3) / 3000) : LAND_GREY; break
      case 'seniors': {
        if (!st.homes[i]) { fill[i] = LAND_GREY; break }
        const own = st.builtIn[i] < 0 && data.pop[i] > 0
        const share = own ? data.file.age[i][3] / data.pop[i] : 0.2
        fill[i] = ramp(LENS_LEGEND.seniors!.stops, share / 0.35)
        break
      }
      case 'access': fill[i] = st.homes[i] ? (access![i] ? '#10b981' : '#f43f5e') : LAND_GREY; break
      case 'depth': fill[i] = data.land[i] ? LAND_GREY : SAND; break
    }
    if (st.status[i] === 1 && lens === 'zone') fill[i] = mix(fill[i]!, '#ffffff', 0.55)
  }
  return fill
}
