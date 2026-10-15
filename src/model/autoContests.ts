import type { Contest, GE2025Data, Party, Plan } from '../types'
import type { PlanStats } from './stats'
import { PAP } from '../data/parties'
import { candidatesByParty, leaderBonus } from '../data/candidates'
import { defaultContests, defaultLeaders, leaderOrder, type UsedLeaders } from './contests'

/** Where a party stands: nowhere, where it fought in 2025, its best seats up to a cap, or everywhere. */
export type FillMode = 'none' | 'footprint' | 'best' | 'all'
/** Where a party puts its best-known people: their 2025 home seats, the closest fights, or its safest seats. */
export type AnchorStrategy = 'home' | 'battleground' | 'safe'

export interface PartyAuto {
  mode: FillMode
  /** MPs to field when mode is 'best' */
  maxSeats: number
  anchors: AnchorStrategy
  /** constituency id → leader pinned there (the party always stands where it pins someone) */
  pins: Record<string, string>
}

export interface AutoSettings {
  parties: Record<string, PartyAuto>
  /** `pairKey(a, b)` → whether the two parties avoid standing against each other (missing = cooperate) */
  cooperate: Record<string, boolean>
}

/** A seat is in a party's 2025 footprint when at least this share of its voters had that party on the ballot. */
const FOOTPRINT = 0.3

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
export const cooperates = (s: AutoSettings, a: string, b: string) => s.cooperate[pairKey(a, b)] ?? true

const seatIds = (plan: Plan, stats: PlanStats) => plan.constituencies.filter((c) => stats.byId[c.id]?.electors).map((c) => c.id)

function footprint(plan: Plan, stats: PlanStats, p: string): string[] {
  return seatIds(plan, stats).filter((id) => {
    const s = stats.byId[id]
    return (s.legacy[p] ?? 0) >= FOOTPRINT || s.mainOpp === p
  })
}

const mpsOf = (plan: Plan, ids: string[]) => {
  const set = new Set(ids)
  return plan.constituencies.filter((c) => set.has(c.id)).reduce((n, c) => n + c.seats, 0)
}

/**
 * Starting settings that roughly reproduce the default line-ups: PAP everywhere, every opposition party
 * in its 2025 footprint, and parties that fought each other somewhere in 2025 still competing.
 */
export function defaultAutoSettings(plan: Plan, stats: PlanStats, ge: GE2025Data, parties: Party[]): AutoSettings {
  const out: AutoSettings = { parties: {}, cooperate: {} }
  for (const p of parties) {
    if (p.id === PAP) { out.parties[p.id] = { mode: 'all', maxSeats: mpsOf(plan, seatIds(plan, stats)), anchors: 'home', pins: {} }; continue }
    const fp = footprint(plan, stats, p.id)
    out.parties[p.id] = { mode: fp.length ? 'footprint' : 'none', maxSeats: Math.max(1, mpsOf(plan, fp)), anchors: 'home', pins: {} }
  }
  for (const c of ge.constituencies) {
    const opp = c.result.map((r) => r.party).filter((p) => p !== PAP)
    for (let i = 0; i < opp.length; i++) for (let j = i + 1; j < opp.length; j++) out.cooperate[pairKey(opp[i], opp[j])] = false
  }
  return out
}

/** How strongly a party can claim a seat: its notional 2025 vote there (PAP: its own share). */
function claim(stats: PlanStats, id: string, p: string): number {
  const s = stats.byId[id]
  return p === PAP ? s.pap0 : s.opp0[p] ?? 0
}

/** Seats a party wants before clashes with other parties are settled. */
function wanted(plan: Plan, stats: PlanStats, p: string, a: PartyAuto): Set<string> {
  const ids = seatIds(plan, stats)
  let out: string[] = []
  if (a.mode === 'all') out = ids
  else if (a.mode === 'footprint') out = footprint(plan, stats, p)
  else if (a.mode === 'best') {
    // own 2025 vote first; with none, the seats where PAP was weakest
    const ranked = ids.slice().sort((x, y) => claim(stats, y, p) - claim(stats, x, p) || (p === PAP ? 0 : stats.byId[x].pap0 - stats.byId[y].pap0))
    const seatsOf = new Map(plan.constituencies.map((c) => [c.id, c.seats]))
    let mps = 0
    for (const id of ranked) {
      const n = seatsOf.get(id) ?? 1
      if (mps + n > a.maxSeats) continue
      out.push(id)
      mps += n
    }
  }
  const set = new Set(out)
  for (const id of Object.keys(a.pins)) if (stats.byId[id]?.electors) set.add(id)
  return set
}

/** Build every seat's line-up and anchor leaders from the auto settings. */
export function autoContests(plan: Plan, stats: PlanStats, ge: GE2025Data, parties: Party[], settings: AutoSettings): Record<string, Contest> {
  const strength = Object.fromEntries(parties.map((p) => [p.id, p.strength]))
  const cfg = (p: string): PartyAuto => settings.parties[p] ?? { mode: 'none', maxSeats: 0, anchors: 'home', pins: {} }
  const wants = Object.fromEntries(parties.map((p) => [p.id, wanted(plan, stats, p.id, cfg(p.id))]))
  const out: Record<string, Contest> = {}

  for (const c of plan.constituencies) {
    if (!stats.byId[c.id]?.electors) { out[c.id] = { parties: [PAP], star: {}, leaders: {} }; continue }
    const pinned = (p: string) => Number(!!cfg(p).pins[c.id])
    // pinned parties first, then the strongest claim; a party stands down for any cooperating party already standing
    const keen = parties.map((p) => p.id).filter((p) => p !== PAP && wants[p].has(c.id))
      .sort((a, b) => pinned(b) - pinned(a) || claim(stats, c.id, b) - claim(stats, c.id, a) || (strength[b] ?? 0) - (strength[a] ?? 0))
    const opp: string[] = []
    for (const p of keen) if (!opp.some((q) => cooperates(settings, p, q))) opp.push(p)
    out[c.id] = { parties: wants[PAP]?.has(c.id) ? [PAP, ...opp] : opp, star: {}, leaders: {} }
  }

  fillAnchors(plan, stats, ge, settings, out)
  return out
}

function fillAnchors(plan: Plan, stats: PlanStats, ge: GE2025Data, settings: AutoSettings, out: Record<string, Contest>) {
  const order = leaderOrder(plan, stats)
  const candidates = candidatesByParty(ge)
  const used: UsedLeaders = new Map()
  const take = (p: string, name: string) => { if (!used.has(p)) used.set(p, new Set()); used.get(p)!.add(name) }
  const standing = (p: string, id: string) => out[id]?.parties.includes(p)
  const allParties = new Set(Object.values(out).flatMap((c) => c.parties))

  for (const [p, a] of Object.entries(settings.parties)) {
    for (const [id, name] of Object.entries(a.pins)) if (name && standing(p, id)) { out[id].leaders![p] = name; take(p, name) }
  }
  for (const p of allParties) {
    const a = settings.parties[p]
    if (!a || a.anchors === 'home') continue
    // big names go to the closest fights, or to the party's own safest seats
    const seats = order.filter((id) => standing(p, id) && !out[id].leaders![p])
    const pap0 = (id: string) => stats.byId[id].pap0
    seats.sort(a.anchors === 'battleground'
      ? (x, y) => Math.abs(pap0(x) - 0.5) - Math.abs(pap0(y) - 0.5)
      : (x, y) => claim(stats, y, p) - claim(stats, x, p))
    const names = [...new Set((candidates[p] ?? []).filter((x) => x.role).map((x) => x.name))].filter((n) => !used.get(p)?.has(n))
    seats.slice(0, names.length).forEach((id, i) => { out[id].leaders![p] = names[i]; take(p, names[i]) })
  }
  // everyone else: the 2025 anchor of the seat's main source constituency, never the same person twice
  for (const id of order) {
    const ct = out[id]
    const rest = ct.parties.filter((p) => !ct.leaders![p])
    Object.assign(ct.leaders!, defaultLeaders(rest, stats.byId[id].sources, ge, used))
  }

  // leader effect is measured against the 2025 anchor the default line-up would have used (as in the Contests panel)
  const base = defaultContests(plan, stats, ge)
  for (const [id, ct] of Object.entries(out)) {
    for (const p of ct.parties) {
      const name = ct.leaders![p]
      if (!name) continue
      const bonus = leaderBonus(name, p) - leaderBonus(base[id]?.leaders?.[p], p)
      if (bonus) ct.star[p] = Math.round(bonus * 2) / 2
    }
  }
}

export interface AutoSummary {
  /** party → constituencies and MPs contested */
  byParty: Record<string, { seats: number; mps: number }>
  walkovers: number
  multiCornered: number
}

export function summarise(plan: Plan, contests: Record<string, Contest>): AutoSummary {
  const out: AutoSummary = { byParty: {}, walkovers: 0, multiCornered: 0 }
  for (const c of plan.constituencies) {
    const ct = contests[c.id]
    if (!ct) continue
    for (const p of ct.parties) {
      const b = (out.byParty[p] ||= { seats: 0, mps: 0 })
      b.seats++
      b.mps += c.seats
    }
    if (ct.parties.length <= 1) out.walkovers++
    if (ct.parties.length > 2) out.multiCornered++
  }
  return out
}
