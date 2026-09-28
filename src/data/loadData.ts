import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Block, GE2025Data } from '../types'

export interface AppData {
  blocks: Block[]
  topo: Topology<{ blocks: GeometryCollection; ge2025: GeometryCollection<{ id: string }> }>
  ge: GE2025Data
}

export async function loadData(): Promise<AppData> {
  const base = import.meta.env.BASE_URL + 'data/'
  const [blocks, topo, ge] = await Promise.all([
    fetch(base + 'blocks.json').then((r) => r.json()),
    fetch(base + 'blocks.topo.json').then((r) => r.json()),
    fetch(base + 'ge2025.json').then((r) => r.json()),
  ])
  return { blocks, topo, ge }
}
