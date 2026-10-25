import type { ZoneId } from '../model/zones'
import { BASELINE } from './demographics'

export const PLANNER_REGIONS = ['Central', 'East', 'North-East', 'North', 'West'] as const
export type PlannerRegion = (typeof PLANNER_REGIONS)[number]

/** planner.json as written by pipeline/planner.mjs (columnar, one entry per hexagon) */
export interface PlannerFile {
  meta: {
    source: string
    grid: { lng0: number; lat0: number; kx: number; ky: number; r: number; cols: number; rows: number }
    lu: ZoneId[]
    subzones: { name: string; pa: string; region: string }[]
    residents2026: number
    age2026: number[]
    female2026: number[]
    totalJobs: number
    stations: { name: string; cell: number }[]
  }
  col: number[]
  row: number[]
  lu: number[]
  ring: number[]
  sz: number[]
  prot: number[]
  pop: number[]
  age: number[][]
  eth: number[][]
  house: number[][]
  gpr: number[]
  jobs: number[]
  amen: number[]
}

export interface PlannerData {
  file: PlannerFile
  n: number
  /** today's use (null = sea) */
  base: (ZoneId | null)[]
  land: boolean[]
  /** sea rings from the shore (each 250 m); 0 on land */
  ring: number[]
  prot: boolean[]
  pop: number[]
  /** existing homes, from residents and household size */
  homes: number[]
  jobs: number[]
  amen: number[]
  region: (PlannerRegion | null)[]
  /** subzone and planning area names */
  place: { sz: string; pa: string }[]
  center: [number, number][]
  /** polygon ring per hexagon [lng, lat] */
  ringCoords: [number, number][][]
  neighbours: number[][]
  /** MRT station name in a hexagon */
  station: Record<number, string>
}

const NO_PLACE = { sz: '', pa: '' }
const title = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])\w/g, (m) => m.toUpperCase())

export function buildPlannerData(file: PlannerFile): PlannerData {
  const { grid } = file.meta
  const n = file.col.length
  const R = grid.r
  const xy = (col: number, row: number): [number, number] => [R * 1.5 * col, R * Math.sqrt(3) * (row + 0.5 * (col & 1))]
  const toLngLat = ([x, y]: [number, number]): [number, number] => [grid.lng0 + x / grid.kx, grid.lat0 + y / grid.ky]
  const index = new Map<number, number>()
  for (let i = 0; i < n; i++) index.set(file.col[i] * grid.rows + file.row[i], i)

  const base: (ZoneId | null)[] = []
  const center: [number, number][] = []
  const ringCoords: [number, number][][] = []
  const neighbours: number[][] = []
  const region: (PlannerRegion | null)[] = []
  const place: { sz: string; pa: string }[] = []
  for (let i = 0; i < n; i++) {
    const lu = file.lu[i]
    let z: ZoneId | null = lu < 0 ? null : file.meta.lu[lu]
    // protected greenery is a nature reserve
    if (z && file.prot[i] && (z === 'open' || z === 'park' || z === 'reserve')) z = 'nature'
    base.push(z)
    const [x, y] = xy(file.col[i], file.row[i])
    center.push(toLngLat([x, y]))
    const ring: [number, number][] = []
    for (let k = 0; k <= 6; k++) {
      const a = (Math.PI / 3) * (k % 6)
      ring.push(toLngLat([x + R * Math.cos(a), y + R * Math.sin(a)]))
    }
    ringCoords.push(ring)
    const col = file.col[i], row = file.row[i]
    const d = col & 1 ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]
    const nb: number[] = []
    for (const [dc, dr] of d) {
      const j = index.get((col + dc) * grid.rows + row + dr)
      if (j !== undefined) nb.push(j)
    }
    neighbours.push(nb)
    const s = file.sz[i] >= 0 ? file.meta.subzones[file.sz[i]] : null
    region.push(s ? (PLANNER_REGIONS.find((r) => r.toUpperCase() === s.region) ?? null) : null)
    place.push(s ? { sz: title(s.name), pa: title(s.pa) } : NO_PLACE)
  }
  const land = base.map((z) => z !== null)
  // sea hexes take the region of the nearest land
  for (let pass = 0; pass < 14; pass++) {
    for (let i = 0; i < n; i++) {
      if (region[i]) continue
      const j = neighbours[i].find((k) => region[k])
      if (j !== undefined) { region[i] = region[j]; if (!land[i]) place[i] = { sz: '', pa: place[j].pa } }
    }
  }
  const station: Record<number, string> = {}
  for (const s of file.meta.stations) station[s.cell] = title(s.name)
  return {
    file, n, base, land, ring: file.ring, prot: file.prot.map(Boolean), pop: file.pop,
    homes: file.pop.map((p) => p / BASELINE.householdSize),
    jobs: file.jobs, amen: file.amen, region, place, center, ringCoords, neighbours, station,
  }
}

export async function loadPlanner(): Promise<PlannerData> {
  const file: PlannerFile = await fetch(import.meta.env.BASE_URL + 'data/planner.json').then((r) => {
    if (!r.ok) throw new Error(`planner data: HTTP ${r.status}`)
    return r.json()
  })
  return buildPlannerData(file)
}
