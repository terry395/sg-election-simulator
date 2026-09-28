import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Contest, Party, Plan, Swings, Year } from '../types'
import { DEFAULT_SWINGS } from '../model/swing'

export interface SharedState {
  plan: Plan
  contests: Record<string, Contest>
  swings: Swings
  year: Year
  customParties: Party[]
}

/**
 * Compact encoding: constituencies as tuples, assignment as run-length encoded indices
 * (block ids are in geographic clusters, so runs are long).
 */
export function encodeState(s: SharedState): string {
  const idx = new Map(s.plan.constituencies.map((c, i) => [c.id, i]))
  const runs: number[] = []
  let prev = -2
  let count = 0
  for (const a of s.plan.assign) {
    const v = a === null ? -1 : idx.get(a) ?? -1
    if (v === prev) count++
    else {
      if (count) runs.push(prev, count)
      prev = v
      count = 1
    }
  }
  if (count) runs.push(prev, count)
  const payload = {
    v: 1,
    c: s.plan.constituencies.map((c) => [c.id, c.name, c.type === 'GRC' ? 1 : 0, c.seats, c.color]),
    a: runs,
    k: s.contests,
    s: s.swings,
    y: s.year,
    p: s.customParties,
  }
  return compressToEncodedURIComponent(JSON.stringify(payload))
}

export function decodeState(str: string, blockCount: number): SharedState | null {
  try {
    const json = decompressFromEncodedURIComponent(str)
    if (!json) return null
    const p = JSON.parse(json)
    if (p.v !== 1) return null
    const constituencies = p.c.map((t: [string, string, number, number, string]) => ({ id: t[0], name: t[1], type: t[2] ? 'GRC' : 'SMC', seats: t[3], color: t[4] }))
    const assign: (string | null)[] = []
    for (let i = 0; i < p.a.length; i += 2) for (let k = 0; k < p.a[i + 1]; k++) assign.push(p.a[i] < 0 ? null : constituencies[p.a[i]].id)
    while (assign.length < blockCount) assign.push(null)
    assign.length = blockCount
    return {
      plan: { constituencies, assign },
      contests: p.k ?? {},
      swings: { ...DEFAULT_SWINGS, ...p.s },
      year: p.y === 2030 ? 2030 : 2025,
      customParties: p.p ?? [],
    }
  } catch {
    return null
  }
}
