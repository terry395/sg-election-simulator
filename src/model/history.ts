import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Block, Constituency, PartyResult, Plan, Year } from '../types'
import { electorsOf, type PlanStats } from './stats'
import { REDRAWN_OVERLAP, UNCHANGED_OVERLAP, type BoundaryStatus } from './report'
import type { ElectionResult } from './swing'
import { PAP } from '../data/parties'

/**
 * Past general elections (GE2006–GE2025) for comparison with the user's map and results.
 * Only years with official boundary maps are included. Past votes on new boundaries are
 * estimates: each building block takes the result of the past constituency it lay in (split by
 * area where a past line crossed it), weighted by today's electors.
 */

export const HIST_YEARS = [2006, 2011, 2015, 2020, 2025] as const
export type HistYear = (typeof HIST_YEARS)[number]

export interface HistConstituency {
  id: string
  name: string
  type: 'SMC' | 'GRC'
  seats: number
  electors: number
  walkover: boolean
  turnout: number | null
  result: PartyResult[]
}

export interface HistParty { votes: number; share: number; seats: number; contested: number }

/** a block's past constituency: an index, or [index, area share] pairs where a past line crossed it */
export type BlockFrac = number | [number, number][]

export interface HistYearData {
  year: HistYear
  date: string
  totalElectors: number
  seats: number
  valid: number
  constituencies: HistConstituency[]
  parties: Record<string, HistParty>
  frac: BlockFrac[]
}

export interface HistoryData {
  years: HistYearData[]
  topo: Topology<Record<string, GeometryCollection<{ i: number }>>>
}

export const fracEntries = (f: BlockFrac): [number, number][] => (Array.isArray(f) ? f : [[f, 1]])
export const fullName = (c: { name: string; type: string }) => `${c.name} ${c.type}`
export const winnerOf = (c: HistConstituency) => c.result[0]?.party ?? PAP

/** Electors (on today's register) shared by each new constituency and each past one. */
export function overlap(plan: Plan, blocks: Block[], yd: HistYearData, year: Year) {
  const n = yd.constituencies.length
  const byId: Record<string, number[]> = {}
  for (const c of plan.constituencies) byId[c.id] = new Array(n).fill(0)
  const past = new Array(n).fill(0)
  for (const b of blocks) {
    const w = electorsOf(b, year)
    if (!w) continue
    const cid = plan.assign[b.id]
    for (const [j, f] of fracEntries(yd.frac[b.id])) {
      past[j] += w * f
      if (cid && byId[cid]) byId[cid][j] += w * f
    }
  }
  return { byId, past }
}

export interface MapCount {
  constituencies: number
  smc: number
  grc: number
  seats: number
  electors: number
  perMp: number
  /** number of GRCs by size (3–6 MPs) */
  sizes: Record<number, number>
  largest: { name: string; perMp: number } | null
  smallest: { name: string; perMp: number } | null
}

function countMap(cs: { name: string; type: 'SMC' | 'GRC'; seats: number; electors: number }[]): MapCount {
  const populated = cs.filter((c) => c.electors > 0)
  const seats = cs.reduce((s, c) => s + c.seats, 0)
  const electors = cs.reduce((s, c) => s + c.electors, 0)
  const sizes: Record<number, number> = {}
  for (const c of cs) if (c.type === 'GRC') sizes[c.seats] = (sizes[c.seats] || 0) + 1
  const byPerMp = populated.map((c) => ({ name: fullName(c), perMp: c.electors / c.seats })).sort((a, b) => b.perMp - a.perMp)
  return {
    constituencies: cs.length,
    smc: cs.filter((c) => c.type === 'SMC').length,
    grc: cs.filter((c) => c.type === 'GRC').length,
    seats, electors,
    perMp: seats ? electors / seats : 0,
    sizes,
    largest: byPerMp[0] ?? null,
    smallest: byPerMp.at(-1) ?? null,
  }
}

export interface Match { idx: number; name: string; share: number }
export interface SeatMatch {
  id: string
  status: BoundaryStatus
  /** the past constituency most of this seat's electors were in */
  best: Match | null
  sources: Match[]
}
export interface PastFate {
  idx: number
  name: string
  type: 'SMC' | 'GRC'
  seats: number
  winner: string
  fate: 'kept' | 'redrawn' | 'merged' | 'split'
  into: { id: string; name: string; share: number }[]
}

export interface BoundaryComparison {
  year: HistYear
  then: MapCount
  yours: MapCount
  /** share of electors who stay with most of their past constituency's voters */
  similarity: number
  seats: SeatMatch[]
  past: PastFate[]
  unchanged: number
  redrawn: number
  created: number
  fates: Record<PastFate['fate'], number>
}

/** How the user's map compares with one past election's boundaries. */
export function compareBoundaries(plan: Plan, stats: PlanStats, blocks: Block[], yd: HistYearData, year: Year): BoundaryComparison {
  const { byId, past } = overlap(plan, blocks, yd, year)
  const pc = yd.constituencies
  let kept = 0
  const seats: SeatMatch[] = plan.constituencies.map((c) => {
    const e = stats.byId[c.id]?.electors ?? 0
    const sources = (byId[c.id] ?? []).map((v, idx) => ({ idx, name: fullName(pc[idx]), share: e ? v / e : 0 }))
      .filter((m) => m.share >= 0.005).sort((a, b) => b.share - a.share)
    const best = sources[0] ?? null
    let status: BoundaryStatus = 'new'
    if (best) {
      const ov = Math.min(best.share, (best.share * e) / (past[best.idx] || 1))
      if (ov >= UNCHANGED_OVERLAP) status = 'unchanged'
      else if (ov >= REDRAWN_OVERLAP) status = 'redrawn'
      kept += best.share * e
    }
    return { id: c.id, status, best, sources }
  })
  const seatById = new Map(seats.map((s) => [s.id, s]))
  const nameOf = new Map(plan.constituencies.map((c) => [c.id, c.name]))
  const pastFates: PastFate[] = pc.map((o, idx) => {
    const e = past[idx] || 0
    const into = plan.constituencies.map((c) => ({ id: c.id, name: nameOf.get(c.id) ?? c.id, share: e ? (byId[c.id]?.[idx] ?? 0) / e : 0 }))
      .filter((x) => x.share >= 0.005).sort((a, b) => b.share - a.share)
    const top = into[0] ? seatById.get(into[0].id) : undefined
    let fate: PastFate['fate'] = 'split'
    if (top && top.best?.idx === idx && top.status !== 'new') fate = top.status === 'unchanged' ? 'kept' : 'redrawn'
    else if (into[0] && into[0].share >= REDRAWN_OVERLAP) fate = 'merged'
    return { idx, name: fullName(o), type: o.type, seats: o.seats, winner: winnerOf(o), fate, into }
  })
  const fates = { kept: 0, redrawn: 0, merged: 0, split: 0 }
  for (const f of pastFates) fates[f.fate]++
  return {
    year: yd.year,
    then: countMap(pc),
    yours: countMap(plan.constituencies.map((c) => ({ name: c.name, type: c.type, seats: c.seats, electors: stats.byId[c.id]?.electors ?? 0 }))),
    similarity: stats.assignedElectors ? kept / stats.assignedElectors : 0,
    seats,
    past: pastFates,
    unchanged: seats.filter((s) => s.status === 'unchanged').length,
    redrawn: seats.filter((s) => s.status === 'redrawn').length,
    created: seats.filter((s) => s.status === 'new').length,
    fates,
  }
}

export interface LineageStep { year: HistYear; name: string; share: number }

/** Each new seat's closest past constituency at every election. */
export function seatLineage(plan: Plan, blocks: Block[], years: HistYearData[], year: Year): Record<string, LineageStep[]> {
  const out: Record<string, LineageStep[]> = Object.fromEntries(plan.constituencies.map((c) => [c.id, []]))
  for (const yd of years) {
    const { byId } = overlap(plan, blocks, yd, year)
    for (const c of plan.constituencies) {
      const row = byId[c.id]
      const tot = row.reduce((a, b) => a + b, 0)
      if (!tot) continue
      let j = 0
      row.forEach((v, k) => { if (v > row[j]) j = k })
      out[c.id].push({ year: yd.year, name: fullName(yd.constituencies[j]), share: row[j] / tot })
    }
  }
  return out
}

export interface NotionalPast {
  /** estimated vote shares on the new boundaries (contested parts only); null if all of it was a walkover */
  shares: Record<string, number> | null
  winner: string | null
  margin: number
  /** share of the seat's electors who had a contest that year */
  covered: number
  /** share of the seat's electors held by each party that year (walkovers included) */
  held: Record<string, number>
}

/** What a past election's votes would have looked like on the user's boundaries. */
export function notionalPast(plan: Plan, blocks: Block[], yd: HistYearData, year: Year): Record<string, NotionalPast> {
  const acc: Record<string, { v: Record<string, number>; covered: number; total: number; held: Record<string, number> }> = {}
  for (const c of plan.constituencies) acc[c.id] = { v: {}, covered: 0, total: 0, held: {} }
  for (const b of blocks) {
    const w = electorsOf(b, year)
    const cid = plan.assign[b.id]
    const a = cid ? acc[cid] : undefined
    if (!w || !a) continue
    for (const [j, f] of fracEntries(yd.frac[b.id])) {
      const pc = yd.constituencies[j]
      const ww = w * f
      a.total += ww
      a.held[winnerOf(pc)] = (a.held[winnerOf(pc)] || 0) + ww
      if (pc.walkover) continue
      a.covered += ww
      for (const r of pc.result) a.v[r.party] = (a.v[r.party] || 0) + ww * r.share
    }
  }
  const out: Record<string, NotionalPast> = {}
  for (const [id, a] of Object.entries(acc)) {
    const held = Object.fromEntries(Object.entries(a.held).map(([p, v]) => [p, a.total ? v / a.total : 0]))
    if (!a.covered) {
      const holder = Object.entries(held).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
      out[id] = { shares: null, winner: holder, margin: 0, covered: 0, held }
      continue
    }
    const shares = Object.fromEntries(Object.entries(a.v).map(([p, v]) => [p, v / a.covered]))
    const sorted = Object.values(shares).sort((x, y) => y - x)
    const winner = Object.entries(shares).sort((x, y) => y[1] - x[1])[0][0]
    out[id] = { shares, winner, margin: (sorted[0] ?? 0) - (sorted[1] ?? 0), covered: a.total ? a.covered / a.total : 0, held }
  }
  return out
}

export interface PartyCompare {
  party: string
  seatsThen: number
  seatsNow: number
  shareThen: number | null
  shareNow: number | null
  contestedThen: number
  contestedNow: number
}

export interface SeatSwing {
  id: string
  name: string
  type: 'SMC' | 'GRC'
  seats: number
  thenWinner: string | null
  nowWinner: string
  papThen: number | null
  papNow: number | null
  /** change in PAP share (now − then), null where either side was a walkover */
  swing: number | null
  covered: number
}

export interface ResultsComparison {
  year: HistYear
  parties: PartyCompare[]
  seatsThen: number
  seatsNow: number
  oppThen: number
  oppNow: number
  walkoversThen: number
  walkoversNow: number
  turnoutThen: number
  turnoutNow: number
  closestThen: { name: string; margin: number } | null
  closestNow: { name: string; margin: number } | null
  seatSwings: SeatSwing[]
}

const marginOf = (shares: number[]) => {
  const s = [...shares].sort((a, b) => b - a)
  return (s[0] ?? 0) - (s[1] ?? 0)
}

/** The user's election night against a past general election. */
export function compareResults(result: ElectionResult, plan: Constituency[], electors: Record<string, number>, yd: HistYearData, notional: Record<string, NotionalPast>): ResultsComparison {
  const pc = yd.constituencies
  const contestedNow: Record<string, number> = {}
  result.seats.forEach((s) => { if (!s.walkover) for (const p of Object.keys(s.votes)) contestedNow[p] = (contestedNow[p] || 0) + 1 })
  const ids = new Set([...Object.keys(yd.parties), ...Object.keys(result.seatsByParty), ...Object.keys(result.votesByParty)])
  const parties: PartyCompare[] = [...ids].map((p) => ({
    party: p,
    seatsThen: yd.parties[p]?.seats ?? 0,
    seatsNow: result.seatsByParty[p] ?? 0,
    shareThen: yd.parties[p] && yd.parties[p].votes > 0 ? yd.parties[p].share : null,
    shareNow: result.votesByParty[p] ? result.votesByParty[p] / result.totalValid : null,
    contestedThen: yd.parties[p]?.contested ?? 0,
    contestedNow: contestedNow[p] ?? 0,
  })).sort((a, b) => b.seatsNow - a.seatsNow || b.seatsThen - a.seatsThen || (b.shareNow ?? 0) - (a.shareNow ?? 0) || (b.shareThen ?? 0) - (a.shareThen ?? 0))

  const contestedPast = pc.filter((c) => !c.walkover && c.turnout !== null)
  const turnoutThen = contestedPast.reduce((s, c) => s + c.turnout! * c.electors, 0) / (contestedPast.reduce((s, c) => s + c.electors, 0) || 1)
  let tw = 0, te = 0
  result.seats.forEach((s, i) => { if (!s.walkover) { const e = electors[plan[i].id] ?? 0; tw += s.turnout * e; te += e } })

  const closestThen = contestedPast.map((c) => ({ name: fullName(c), margin: marginOf(c.result.map((r) => r.share)) })).sort((a, b) => a.margin - b.margin)[0] ?? null
  const closestNow = result.seats.map((s, i) => ({ s, c: plan[i] })).filter(({ s }) => !s.walkover)
    .map(({ s, c }) => ({ name: fullName(c), margin: s.margin })).sort((a, b) => a.margin - b.margin)[0] ?? null

  const seatSwings: SeatSwing[] = plan.map((c, i) => {
    const s = result.seats[i]
    const n = notional[c.id]
    const papThen = n?.shares ? n.shares[PAP] ?? 0 : null
    const papNow = s.walkover ? null : s.shares[PAP] ?? 0
    return {
      id: c.id, name: c.name, type: c.type, seats: c.seats,
      thenWinner: n?.winner ?? null, nowWinner: s.winner,
      papThen, papNow,
      swing: papThen !== null && papNow !== null ? papNow - papThen : null,
      covered: n?.covered ?? 0,
    }
  })
  const opp = (seats: Record<string, number>) => Object.entries(seats).filter(([p]) => p !== PAP).reduce((s, [, v]) => s + v, 0)
  const thenSeats = Object.fromEntries(Object.entries(yd.parties).map(([p, v]) => [p, v.seats]))
  return {
    year: yd.year,
    parties,
    seatsThen: yd.seats,
    seatsNow: plan.reduce((s, c) => s + c.seats, 0),
    oppThen: opp(thenSeats),
    oppNow: opp(result.seatsByParty),
    walkoversThen: pc.filter((c) => c.walkover).length,
    walkoversNow: result.seats.filter((s) => s.walkover).length,
    turnoutThen,
    turnoutNow: te ? tw / te : 0,
    closestThen, closestNow,
    seatSwings,
  }
}
