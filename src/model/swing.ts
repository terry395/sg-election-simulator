import type { Constituency, Contest, Party, Swings } from '../types'
import type { ConstituencyStats } from './stats'
import type { Rng } from './rng'
import { PAP } from '../data/parties'

export const DEMO_GROUPS = {
  age: [
    { id: 'a0', label: '21–34' },
    { id: 'a1', label: '35–49' },
    { id: 'a2', label: '50–64' },
    { id: 'a3', label: '65+' },
  ],
  eth: [
    { id: 'e0', label: 'Chinese' },
    { id: 'e1', label: 'Malay' },
    { id: 'e2', label: 'Indian' },
    { id: 'e3', label: 'Others' },
  ],
  house: [
    { id: 'h0', label: 'HDB 1–3 room' },
    { id: 'h1', label: 'HDB 4 room' },
    { id: 'h2', label: 'HDB 5 room / EC' },
    { id: 'h3', label: 'Condo / apartment' },
    { id: 'h4', label: 'Landed' },
  ],
} as const

export const DEFAULT_SWINGS: Swings = {
  national: 0,
  party: {},
  demo: {},
  local: {},
  turnout: 0,
  sigmaNational: 2.5,
  sigmaLocal: 3,
}

export const REJECTED_RATE = 0.015
/** how strongly a better/worse opposition slate than 2025 moves the opposition vote */
export const QUALITY_ELASTICITY = 0.35
/** vote lost by the opposition per extra opposition party in a multi-cornered fight */
export const MULTI_CORNER_PENALTY = 0.02
/** opposition share a strength-1 party would expect on fresh ground */
export const NEW_GROUND_SHARE = 0.4

export interface SeatResult {
  id: string
  shares: Record<string, number>
  votes: Record<string, number>
  winner: string
  runnerUp: string | null
  margin: number
  valid: number
  turnout: number
  walkover: boolean
}

/** Demographic swing (pp) experienced by a constituency. */
export function demoEffect(s: ConstituencyStats, demo: Record<string, number>): number {
  let pp = 0
  DEMO_GROUPS.age.forEach((g, i) => (pp += (demo[g.id] || 0) * (s.age[i] || 0)))
  DEMO_GROUPS.eth.forEach((g, i) => (pp += (demo[g.id] || 0) * (s.eth[i] || 0)))
  DEMO_GROUPS.house.forEach((g, i) => (pp += (demo[g.id] || 0) * (s.house[i] || 0)))
  return pp
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Projects the vote in one constituency.
 * `noisePP` is an extra swing to PAP (pp) used by Monte Carlo / election-night draws.
 */
export function projectSeat(
  c: Constituency,
  s: ConstituencyStats,
  contest: Contest,
  swings: Swings,
  parties: Record<string, Party>,
  noisePP = 0,
): SeatResult {
  const contesting = contest.parties.filter((p) => parties[p])
  const turnout = clamp(s.turnout0 + swings.turnout / 100, 0.5, 0.99)
  if (contesting.length <= 1) {
    const w = contesting[0] ?? PAP
    return { id: c.id, shares: { [w]: 1 }, votes: { [w]: 0 }, winner: w, runnerUp: null, margin: 1, valid: 0, turnout: 0, walkover: true }
  }
  const opp = contesting.filter((p) => p !== PAP)
  const papIn = contesting.includes(PAP)

  // 1. opposition slate quality vs the 2025 opponents of these electors
  const qNew = Math.max(...opp.map((p) => parties[p].strength))
  const f = clamp(1 + (QUALITY_ELASTICITY * (qNew - s.oldQuality)) / Math.max(0.1, s.oldQuality), 0.6, 1.5)
  let pap = 1 - (1 - s.pap0) * f
  // 2. national + demographic + local swings
  pap += (swings.national + demoEffect(s, swings.demo) + (swings.local[c.id] || 0) + noisePP) / 100
  // 3. vote splitting: more (or fewer) opposition parties than these electors saw in 2025
  const oldCount = Math.max(1, Object.values(s.legacy).reduce((a, b) => a + b, 0))
  pap += MULTI_CORNER_PENALTY * (opp.length - oldCount) * (1 - pap)
  pap = clamp(pap, 0.03, 0.97)

  // 4. split the opposition vote: a party keeps its 2025 vote where it stood before and
  //    competes on strength where it is new (so the GE2025 map reproduces GE2025 exactly)
  const weights = opp.map((p) => (s.opp0[p] || 0) + NEW_GROUND_SHARE * parties[p].strength * (1 - Math.min(1, s.legacy[p] || 0)))
  const wSum = weights.reduce((a, b) => a + b, 0) || 1
  const oppTotal = papIn ? 1 - pap : 1
  const shares: Record<string, number> = {}
  if (papIn) shares[PAP] = pap
  opp.forEach((p, i) => (shares[p] = (oppTotal * weights[i]) / wSum))

  // 5. party-specific swings (taken from PAP, or from the other parties if PAP is absent)
  for (const p of opp) {
    const d = (swings.party[p] || 0) / 100
    if (!d) continue
    shiftTo(shares, p, d)
  }
  // 6. candidate bonuses
  for (const [p, pp] of Object.entries(contest.star || {})) if (p in shares && pp) shiftTo(shares, p, pp / 100)

  // normalise
  for (const p of Object.keys(shares)) shares[p] = Math.max(0.003, shares[p])
  const tot = Object.values(shares).reduce((a, b) => a + b, 0)
  for (const p of Object.keys(shares)) shares[p] /= tot

  const valid = Math.round(s.electors * turnout * (1 - REJECTED_RATE))
  const votes: Record<string, number> = {}
  for (const [p, v] of Object.entries(shares)) votes[p] = Math.round(v * valid)
  const ranked = Object.entries(shares).sort((a, b) => b[1] - a[1])
  return {
    id: c.id,
    shares,
    votes,
    winner: ranked[0][0],
    runnerUp: ranked[1]?.[0] ?? null,
    margin: ranked[0][1] - (ranked[1]?.[1] ?? 0),
    valid,
    turnout,
    walkover: false,
  }
}

/** Move `d` share to party p, taking proportionally from all other parties. */
function shiftTo(shares: Record<string, number>, p: string, d: number) {
  const others = Object.keys(shares).filter((k) => k !== p)
  const oSum = others.reduce((a, k) => a + shares[k], 0)
  if (oSum <= 0) return
  const delta = clamp(d, -shares[p] + 0.003, oSum - 0.003 * others.length)
  shares[p] += delta
  for (const k of others) shares[k] -= (delta * shares[k]) / oSum
}

export interface ElectionResult {
  seats: SeatResult[]
  seatsByParty: Record<string, number>
  votesByParty: Record<string, number>
  totalValid: number
  government: string
  ncmp: NcmpSeat[]
}

export interface NcmpSeat { constituency: string; party: string; share: number; seats: number }

export function runElection(
  plan: Constituency[],
  stats: Record<string, ConstituencyStats>,
  contests: Record<string, Contest>,
  swings: Swings,
  parties: Record<string, Party>,
  r?: Rng,
): ElectionResult {
  const nat = r ? r.normal() * swings.sigmaNational : 0
  const seats = plan.map((c) =>
    projectSeat(c, stats[c.id], contests[c.id] ?? { parties: [PAP], star: {} }, swings, parties, r ? nat + r.normal() * swings.sigmaLocal : 0),
  )
  return summarise(plan, seats)
}

export function summarise(plan: Constituency[], seats: SeatResult[]): ElectionResult {
  const seatsByParty: Record<string, number> = {}
  const votesByParty: Record<string, number> = {}
  let totalValid = 0
  seats.forEach((s, i) => {
    seatsByParty[s.winner] = (seatsByParty[s.winner] || 0) + plan[i].seats
    for (const [p, v] of Object.entries(s.votes)) votesByParty[p] = (votesByParty[p] || 0) + v
    totalValid += s.valid
  })
  const government = Object.entries(seatsByParty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? PAP
  return { seats, seatsByParty, votesByParty, totalValid, government, ncmp: allocateNcmp(plan, seats, government) }
}

/**
 * Non-Constituency MPs: up to 12 opposition MPs in total (elected + NCMP).
 * Offered to the best-performing losing opposition candidates with at least 15% of the vote,
 * at most one per SMC and two per GRC.
 */
export const NCMP_TOTAL = 12
export function allocateNcmp(plan: Constituency[], seats: SeatResult[], government: string): NcmpSeat[] {
  const oppElected = seats.reduce((n, s, i) => n + (s.winner !== government ? plan[i].seats : 0), 0)
  let remaining = Math.max(0, NCMP_TOTAL - oppElected)
  const out: NcmpSeat[] = []
  const candidates = seats
    .map((s, i) => ({ s, c: plan[i] }))
    .filter(({ s }) => !s.walkover && s.winner === government && s.runnerUp && s.runnerUp !== government && s.shares[s.runnerUp] >= 0.15)
    .sort((a, b) => b.s.shares[b.s.runnerUp!] - a.s.shares[a.s.runnerUp!])
  for (const { s, c } of candidates) {
    if (remaining <= 0) break
    const n = Math.min(remaining, c.type === 'GRC' ? 2 : 1)
    out.push({ constituency: c.id, party: s.runnerUp!, share: s.shares[s.runnerUp!], seats: n })
    remaining -= n
  }
  return out
}
