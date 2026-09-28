import type { Block, Year } from '../../types'
import { electorsOf } from '../stats'

/** Flat, typed view of the block map used by the redistricting engine. */
export interface Graph {
  n: number
  /** electors */
  w: Float64Array
  /** centroid in km relative to the island centre */
  x: Float64Array
  y: Float64Array
  /** planning-area index per block */
  pa: Int32Array
  paNames: string[]
  /** notional GE2025 PAP share */
  pap: Float64Array
  adj: number[][]
  /** blocks in the main (mainland) component: these are partitioned */
  main: Uint8Array
  mainList: number[]
  /** other components (islands), attached afterwards */
  islands: number[][]
  total: number
}

const KM_PER_DEG_LNG = 111.28 // at 1.35°N
const KM_PER_DEG_LAT = 110.57

export function buildGraph(blocks: Block[], year: Year): Graph {
  const n = blocks.length
  const w = new Float64Array(n)
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const pa = new Int32Array(n)
  const pap = new Float64Array(n)
  const paIndex = new Map<string, number>()
  const paNames: string[] = []
  let total = 0
  for (const b of blocks) {
    w[b.id] = electorsOf(b, year)
    total += w[b.id]
    x[b.id] = (b.c[0] - 103.82) * KM_PER_DEG_LNG
    y[b.id] = (b.c[1] - 1.35) * KM_PER_DEG_LAT
    if (!paIndex.has(b.pa)) { paIndex.set(b.pa, paNames.length); paNames.push(b.pa) }
    pa[b.id] = paIndex.get(b.pa)!
    pap[b.id] = b.pap
  }
  const adj = blocks.map((b) => b.adj)

  // connected components; the one with most electors is the mainland
  const comp = new Int32Array(n).fill(-1)
  const comps: number[][] = []
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue
    const id = comps.length
    const list = [s]
    comp[s] = id
    for (let k = 0; k < list.length; k++) for (const nb of adj[list[k]]) if (comp[nb] < 0) { comp[nb] = id; list.push(nb) }
    comps.push(list)
  }
  const weight = (c: number[]) => c.reduce((s, i) => s + w[i], 0)
  let mainIdx = 0
  comps.forEach((c, i) => { if (weight(c) > weight(comps[mainIdx])) mainIdx = i })
  const main = new Uint8Array(n)
  for (const i of comps[mainIdx]) main[i] = 1
  return {
    n, w, x, y, pa, paNames, pap, adj, main,
    mainList: comps[mainIdx],
    islands: comps.filter((_, i) => i !== mainIdx),
    total,
  }
}
