import type { PlannerData } from '../data/loadPlanner'
import type { NationalPlan } from './simulate'
import type { Density, ZoneId } from './zones'

/** ready-made projects inspired by ideas in Singapore's long-term planning discussions */
export interface Preset { id: string; label: string; desc: string; apply: (data: PlannerData, plan: NationalPlan) => void }

/** deterministic pick from a weighted mix */
function pick(i: number, mix: [ZoneId, number][]): ZoneId {
  const u = ((i * 2654435761) >>> 0) % 1000 / 1000
  const total = mix.reduce((s, [, w]) => s + w, 0)
  let acc = 0
  for (const [z, w] of mix) { acc += w / total; if (u < acc) return z }
  return mix[mix.length - 1][0]
}
const set = (plan: NationalPlan, p: number, i: number, z: ZoneId, d: Density = 1) => { plan[p][i] = { ...plan[p][i], z, d } }
const reclaim = (plan: NationalPlan, p: number, i: number) => { plan[p][i] = { ...plan[p][i], r: 1 } }
const inBox = (data: PlannerData, i: number, [w, s, e, n]: [number, number, number, number]) => {
  const [lng, lat] = data.center[i]
  return lng >= w && lng <= e && lat >= s && lat <= n
}
const TOWN: [ZoneId, number][] = [['hdb', 55], ['condo', 10], ['mixed', 8], ['park', 12], ['school', 6], ['community', 4], ['eldercare', 3], ['health', 1], ['mrt', 1]]

export const PRESETS: Preset[] = [
  {
    id: 'long-island',
    label: 'Long Island (East Coast)',
    desc: 'Reclaim land off East Coast Park from the 2030s. A new reservoir lagoon protects the coast from rising seas, with a new town and waterfront parks on the island.',
    apply: (data, plan) => {
      for (let i = 0; i < data.n; i++) {
        if (data.land[i] || !inBox(data, i, [103.885, 1.27, 104.0, 1.315]) || data.ring[i] > 8) continue
        const r = data.ring[i]
        reclaim(plan, 1, i)
        const z: ZoneId = r <= 2 ? 'water' : r >= 7 ? pick(i, [['beach', 2], ['park', 2]]) : pick(i, TOWN)
        set(plan, r <= 3 ? 2 : 3, i, z)
      }
    },
  },
  {
    id: 'southern-waterfront',
    label: 'Greater Southern Waterfront',
    desc: 'City terminals move to Tuas, freeing Keppel, Tanjong Pagar, Brani and Pasir Panjang for homes, offices and parks along the southern coast.',
    apply: (data, plan) => {
      for (let i = 0; i < data.n; i++) {
        // the new mega-port first, on reclaimed land off Tuas
        if (!data.land[i] && inBox(data, i, [103.6, 1.22, 103.665, 1.30]) && data.ring[i] <= 6) { reclaim(plan, 0, i); set(plan, 1, i, 'port') }
        if (data.base[i] === 'port' && inBox(data, i, [103.76, 1.255, 103.845, 1.30])) {
          const p = data.center[i][0] < 103.79 ? 3 : 2
          set(plan, p, i, pick(i, [['hdb', 30], ['condo', 20], ['mixed', 15], ['commercial', 10], ['park', 15], ['school', 4], ['community', 3], ['mrt', 1]]), 2)
        }
      }
    },
  },
  {
    id: 'paya-lebar',
    label: 'Paya Lebar Air Base new town',
    desc: 'After the air base moves in the 2030s, about 800 ha are freed for a new town of homes, jobs and parks, and the height limits in the north-east are lifted.',
    apply: (data, plan) => {
      for (let i = 0; i < data.n; i++) {
        if (data.base[i] !== 'airport' || data.place[i].pa !== 'Paya Lebar') continue
        set(plan, 2, i, pick(i, [...TOWN, ['bizpark', 8], ['commercial', 4]]))
      }
    },
  },
  {
    id: 'health-ageing',
    label: 'Healthcare for an ageing nation',
    desc: 'Add hospital campuses and eldercare in every region in 2026–35, on cleared land-bank sites close to where seniors live.',
    apply: (data, plan) => {
      const sites = data.base.map((z, i) => (z === 'reserve' && !data.prot[i] ? i : -1)).filter((i) => i >= 0)
      const byRegion = new Map<string, number[]>()
      for (const i of sites) {
        const r = data.region[i]
        if (!r || !data.neighbours[i].some((j) => data.pop[j] > 500)) continue
        if (!byRegion.has(r)) byRegion.set(r, [])
        byRegion.get(r)!.push(i)
      }
      for (const list of byRegion.values()) {
        list.slice(0, 2).forEach((i) => set(plan, 0, i, 'health'))
        list.slice(2, 8).forEach((i, k) => set(plan, k < 3 ? 0 : 1, i, 'eldercare'))
      }
    },
  },
]
