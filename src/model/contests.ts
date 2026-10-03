import type { Contest, GE2025Data, Plan } from '../types'
import type { PlanStats } from './stats'
import { PAP } from '../data/parties'
import { MPBH_HYPOTHETICAL_OPP } from './stats'
import { team2025 } from '../data/candidates'

/** party → names already leading a seat, so a default leader is never used twice */
export type UsedLeaders = Map<string, Set<string>>

/** Names each party already uses as a leader across these contests (optionally skipping one seat). */
export function usedLeaders(contests: Record<string, Contest>, except?: string): UsedLeaders {
  const used: UsedLeaders = new Map()
  for (const [id, c] of Object.entries(contests)) {
    if (id === except) continue
    for (const p of c.parties) {
      const name = c.leaders?.[p]
      if (!name) continue
      if (!used.has(p)) used.set(p, new Set())
      used.get(p)!.add(name)
    }
  }
  return used
}

/**
 * Default anchor leaders: each party's 2025 anchor from the GE2025 constituency that supplies most
 * of this seat's voters (or the next one where that party stood). Names in `used` are skipped in favour
 * of the next member of the same 2025 team, then the next constituency; picks are added to `used`.
 */
export function defaultLeaders(parties: string[], sources: Record<string, number>, ge: GE2025Data, used?: UsedLeaders): Record<string, string> {
  const order = Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const out: Record<string, string> = {}
  for (const p of parties) {
    const taken = used?.get(p)
    for (const ed of order) {
      const name = team2025(ge, ed, p).find((n) => !taken?.has(n))
      if (!name) continue
      out[p] = name
      if (used) {
        if (!used.has(p)) used.set(p, new Set())
        used.get(p)!.add(name)
      }
      break
    }
  }
  return out
}

/**
 * Default line-ups: PAP versus the opposition party that fought for most of these electors in 2025.
 * Straight fights by default (opposition parties usually avoid clashing); the walkover seat defaults to WP.
 * Leaders are filled afterwards, unchanged seats first and then the seats most rooted in one 2025
 * constituency, so each person leads at most one seat.
 */
export function defaultContests(plan: Plan, stats: PlanStats, ge: GE2025Data): Record<string, Contest> {
  const geById = new Map(ge.constituencies.map((c) => [c.id, c]))
  const out: Record<string, Contest> = {}
  const unchanged = new Set<string>()
  for (const c of plan.constituencies) {
    const s = stats.byId[c.id]
    if (!s || !s.electors) { out[c.id] = { parties: [PAP], star: {} }; continue }
    // exact GE2025 constituency (unchanged) keeps its full 2025 line-up
    const same = geById.get(c.id)
    const src = Object.entries(s.sources).sort((a, b) => b[1] - a[1])
    if (same && src.length === 1 && src[0][0] === c.id && Math.abs(same.electors - s.electors) / same.electors < 0.02 && !same.walkover) {
      out[c.id] = { parties: same.result.map((r) => r.party), star: {} }
      unchanged.add(c.id)
      continue
    }
    const main = s.mainOpp || MPBH_HYPOTHETICAL_OPP
    out[c.id] = { parties: [PAP, main], star: {} }
  }
  const topShare = (id: string) => {
    const s = stats.byId[id]
    return s?.electors ? Math.max(0, ...Object.values(s.sources)) / s.electors : 0
  }
  const order = plan.constituencies
    .filter((c) => stats.byId[c.id]?.electors)
    .map((c) => c.id)
    .sort((a, b) => Number(unchanged.has(b)) - Number(unchanged.has(a)) || topShare(b) - topShare(a))
  const used: UsedLeaders = new Map()
  for (const id of order) out[id].leaders = defaultLeaders(out[id].parties, stats.byId[id].sources, ge, used)
  return out
}

/** Keep existing choices for constituencies that still exist; fill defaults for new ones. */
export function reconcileContests(prev: Record<string, Contest>, defaults: Record<string, Contest>): Record<string, Contest> {
  const out: Record<string, Contest> = {}
  for (const [id, d] of Object.entries(defaults)) out[id] = prev[id] ?? d
  return out
}

/** The same contests with no anchor leaders and no leader effects (the "parties only" setting). */
export function withoutLeaders(contests: Record<string, Contest>): Record<string, Contest> {
  const out: Record<string, Contest> = {}
  for (const [id, c] of Object.entries(contests)) out[id] = { ...c, leaders: {}, star: {} }
  return out
}
