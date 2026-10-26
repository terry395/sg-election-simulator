import type { PlannerData } from '../data/loadPlanner'
import { PHASES } from './population'
import { reclaimCost, type NationalPlan, type SimResult } from './simulate'
import { crossingBy, hasLandBy } from './rules'
import { CELL_HA, isCrossing, zoneCost, type ZoneId } from './zones'

/** an island off the main island, as it is today */
export interface Island {
  name: string
  cells: number[]
  /** already joined to the main island by a real bridge or causeway (Sentosa, Jurong Island) */
  prelinked: boolean
}
export interface BaseIslands {
  /** cells of the main island */
  main: number[]
  /** islands of at least a few hexagons, largest first */
  islands: Island[]
}

/** known islands by centre [lng, lat]; components are named after the nearest within ~1.5 km */
const KNOWN: { name: string; at: [number, number]; prelinked?: boolean }[] = [
  { name: 'Pulau Tekong', at: [104.052, 1.399] },
  { name: 'Pulau Ubin', at: [103.966, 1.412] },
  { name: 'Jurong Island', at: [103.692, 1.266], prelinked: true },
  { name: 'Sentosa', at: [103.831, 1.251], prelinked: true },
  { name: 'Pulau Semakau', at: [103.77, 1.201] },
  { name: 'Pulau Bukom', at: [103.761, 1.232] },
  { name: 'Pulau Sudong', at: [103.719, 1.207] },
  { name: 'Pulau Pawai', at: [103.725, 1.187] },
  { name: 'Pulau Senang', at: [103.735, 1.172] },
  { name: 'Lazarus and St John\'s', at: [103.852, 1.224] },
  { name: 'Pulau Tekukor', at: [103.838, 1.231] },
]
const MIN_CELLS = 4
const title = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])\w/g, (m) => m.toUpperCase())

const cache = new WeakMap<PlannerData, BaseIslands>()
/** today's land split into the main island and offshore islands */
export function baseIslands(data: PlannerData): BaseIslands {
  const hit = cache.get(data)
  if (hit) return hit
  const comp = new Int32Array(data.n).fill(-1)
  const comps: number[][] = []
  for (let i = 0; i < data.n; i++) {
    if (!data.land[i] || comp[i] >= 0) continue
    const list = [i]
    comp[i] = comps.length
    for (let k = 0; k < list.length; k++) for (const j of data.neighbours[list[k]]) if (data.land[j] && comp[j] < 0) { comp[j] = comps.length; list.push(j) }
    comps.push(list)
  }
  comps.sort((a, b) => b.length - a.length)
  const islands: Island[] = []
  for (const cells of comps.slice(1)) {
    if (cells.length < MIN_CELLS) continue
    let x = 0, y = 0
    for (const i of cells) { x += data.center[i][0]; y += data.center[i][1] }
    x /= cells.length; y /= cells.length
    let best: (typeof KNOWN)[number] | null = null, bd = 0.0135 ** 2
    for (const k of KNOWN) {
      const d = (k.at[0] - x) ** 2 + (k.at[1] - y) ** 2
      if (d < bd) { bd = d; best = k }
    }
    const used = islands.filter((s) => s.name === best?.name).length
    const name = best && !used ? best.name : title(data.place[cells[0]].sz || 'Islet')
    islands.push({ name: islands.some((s) => s.name === name) ? `${name} ${islands.filter((s) => s.name.startsWith(name)).length + 1}` : name, cells, prelinked: !!best?.prelinked && !used })
  }
  const out = { main: comps[0] ?? [], islands }
  cache.set(data, out)
  return out
}

/** breadth-first search over passable cells from sources; distance in steps (-1 = not reached) */
function bfs(data: PlannerData, sources: Iterable<number>, pass: (i: number) => boolean) {
  const dist = new Int32Array(data.n).fill(-1)
  const queue: number[] = []
  for (const s of sources) if (dist[s] < 0) { dist[s] = 0; queue.push(s) }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]
    for (const j of data.neighbours[i]) if (dist[j] < 0 && pass(j)) { dist[j] = dist[i] + 1; queue.push(j) }
  }
  return dist
}

/** the main island plus islands already linked to it */
const mainSources = (b: BaseIslands) => [...b.main, ...b.islands.filter((s) => s.prelinked).flatMap((s) => s.cells)]

/**
 * Cells joined to the main island by the end of phase `p` as planned: land (or land being reclaimed)
 * and bridges, causeways and tunnels decided by then.
 */
export function plannedLinks(data: PlannerData, plan: NationalPlan, p: number) {
  const on = (i: number) => hasLandBy(data, plan, i, p) || crossingBy(plan, i, p)
  return bfs(data, mainSources(baseIslands(data)), on)
}

/** shortest chain of sea hexagons joining `from` cells to cells where `to` is true (empty = none) */
export function seaPath(data: PlannerData, from: number[], to: (i: number) => boolean, sea: (i: number) => boolean): number[] {
  const prev = new Int32Array(data.n).fill(-2)
  const queue: number[] = []
  for (const s of from) { prev[s] = -1; queue.push(s) }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]
    // prefer shallow water: visit neighbours shallowest first
    const nb = [...data.neighbours[i]].sort((a, b) => data.ring[a] - data.ring[b])
    for (const j of nb) {
      if (prev[j] !== -2) continue
      if (to(j)) {
        const path: number[] = []
        for (let c = i; prev[c] !== -1; c = prev[c]) path.push(c)
        return path.reverse()
      }
      if (!sea(j)) continue
      prev[j] = i
      queue.push(j)
    }
  }
  return []
}

export type LinkKind = 'land' | 'bridge' | 'causeway' | 'tunnel'
export interface IslandLink {
  island: Island
  /** phase at whose end the island is joined (null = not joined by 2050) */
  joinedPhase: number | null
  /** the island is joined only once land being reclaimed has settled, after 2050 */
  afterwards: boolean
  /** new hexagons that make the link (reclaimed land and crossings) */
  cells: number[]
  kinds: LinkKind[]
  km: number
  /** S$ million for the hexagons that make the link */
  cost: number
  /** homes on the island and the new land joined to it, 2050 */
  homes: number
  areaHa: number
}

/** Which offshore islands the plan joins to the main island, when and how. */
export function islandLinks(data: PlannerData, sim: SimResult): { links: IslandLink[]; unlinkedHomes: number[] } {
  const b = baseIslands(data)
  const sources = mainSources(b)
  const tl = sim.timelines
  /** cells usable as a link at the end of phase q */
  const onAt = (q: number) => {
    const st = sim.snaps[q + 1]
    return (i: number) => tl[i].landReady <= q || (isCrossing(st.zone[i]) && st.status[i] === 0)
  }
  const reached = PHASES.map((_, q) => bfs(data, sources, onAt(q)))
  const unlinkedHomes = PHASES.map((_, q) => {
    const st = sim.snaps[q + 1]
    let n = 0
    for (let i = 0; i < data.n; i++) if (st.homes[i] && reached[q][i] < 0) n += st.homes[i]
    return n
  })
  // eventually: all reclamation settled and every crossing built
  const eventually = bfs(data, sources, (i) => tl[i].landReady !== Infinity || tl[i].builds.some((x) => isCrossing(x.zone) && x.cancelledAt === Infinity))
  const last = sim.snaps[sim.snaps.length - 1]
  const links: IslandLink[] = []
  for (const island of b.islands) {
    if (island.prelinked) continue
    const q = reached.findIndex((r) => island.cells.some((i) => r[i] >= 0))
    const afterwards = q < 0 && island.cells.some((i) => eventually[i] >= 0)
    if (q < 0 && !afterwards) continue
    // the new hexagons on the shortest way from the island to the main island
    const on = q >= 0 ? onAt(q) : (i: number) => eventually[i] >= 0
    const mainSet = new Uint8Array(data.n)
    for (const i of sources) mainSet[i] = 1
    const path = seaPath(data, island.cells, (i) => !!mainSet[i], (i) => on(i) && !mainSet[i])
    const cells = path.filter((i) => !data.land[i])
    const kinds = new Set<LinkKind>()
    let cost = 0
    for (const i of cells) {
      const z = (q >= 0 ? sim.snaps[q + 1].zone[i] : last.zone[i]) as ZoneId | null
      if (isCrossing(z)) { kinds.add(z as LinkKind); cost += zoneCost(z!) }
      else { kinds.add('land'); cost += reclaimCost(data.ring[i]) }
    }
    // the island with the new land nearer to it than to the main island
    const newLand = (i: number) => !data.land[i] && tl[i].landReady !== Infinity
    const dI = bfs(data, island.cells, newLand)
    const dM = bfs(data, sources, newLand)
    let homes = 0, area = 0
    for (let i = 0; i < data.n; i++) if (dI[i] >= 0 && (dM[i] < 0 || dI[i] < dM[i])) { homes += last.homes[i]; area++ }
    links.push({ island, joinedPhase: q >= 0 ? q : null, afterwards, cells, kinds: [...kinds], km: (cells.length + 1) * 0.25, cost, homes, areaHa: area * CELL_HA })
  }
  links.sort((x, y) => (x.joinedPhase ?? 9) - (y.joinedPhase ?? 9) || y.island.cells.length - x.island.cells.length)
  return { links, unlinkedHomes }
}

export const LINK_WORDS: Record<LinkKind, string> = { land: 'reclaimed land', bridge: 'a bridge', causeway: 'a causeway', tunnel: 'an undersea tunnel' }
