import type { Contest, GE2025Data, Plan } from '../types'
import type { PlanStats } from './stats'
import { PAP } from '../data/parties'
import { MPBH_HYPOTHETICAL_OPP } from './stats'
import { anchor2025 } from '../data/candidates'

/**
 * Default anchor leaders: each party's 2025 anchor from the GE2025 constituency that supplies most
 * of this seat's voters (or the next one where that party stood).
 */
export function defaultLeaders(parties: string[], sources: Record<string, number>, ge: GE2025Data): Record<string, string> {
  const order = Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const out: Record<string, string> = {}
  for (const p of parties) {
    for (const ed of order) {
      const a = anchor2025(ge, ed, p)
      if (a) { out[p] = a; break }
    }
  }
  return out
}

/**
 * Default line-ups: PAP versus the opposition party that fought for most of these electors in 2025.
 * Straight fights by default (opposition parties usually avoid clashing); the walkover seat defaults to WP.
 */
export function defaultContests(plan: Plan, stats: PlanStats, ge: GE2025Data): Record<string, Contest> {
  const geById = new Map(ge.constituencies.map((c) => [c.id, c]))
  const out: Record<string, Contest> = {}
  for (const c of plan.constituencies) {
    const s = stats.byId[c.id]
    if (!s || !s.electors) { out[c.id] = { parties: [PAP], star: {} }; continue }
    // exact GE2025 constituency (unchanged) keeps its full 2025 line-up
    const same = geById.get(c.id)
    const src = Object.entries(s.sources).sort((a, b) => b[1] - a[1])
    if (same && src.length === 1 && src[0][0] === c.id && Math.abs(same.electors - s.electors) / same.electors < 0.02 && !same.walkover) {
      const parties = same.result.map((r) => r.party)
      out[c.id] = { parties, star: {}, leaders: defaultLeaders(parties, s.sources, ge) }
      continue
    }
    const main = s.mainOpp || MPBH_HYPOTHETICAL_OPP
    out[c.id] = { parties: [PAP, main], star: {}, leaders: defaultLeaders([PAP, main], s.sources, ge) }
  }
  return out
}

/** Keep existing choices for constituencies that still exist; fill defaults for new ones. */
export function reconcileContests(prev: Record<string, Contest>, defaults: Record<string, Contest>): Record<string, Contest> {
  const out: Record<string, Contest> = {}
  for (const [id, d] of Object.entries(defaults)) out[id] = prev[id] ?? d
  return out
}
