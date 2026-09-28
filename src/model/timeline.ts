import type { Constituency, Contest } from '../types'
import type { ElectionResult, SeatResult } from './swing'
import { rng } from './rng'
import { coalitionName, suggestCoalitions } from './coalition'

/** Minutes after polls close at 8pm. */
export type NightEvent =
  | { t: number; kind: 'walkover'; cid: string; winner: string }
  | { t: number; kind: 'sample'; cid: string; shares: Record<string, number> }
  | { t: number; kind: 'result'; cid: string; seat: SeatResult }
  | { t: number; kind: 'ncmp' }
  | { t: number; kind: 'news'; tag: NewsTag; headline: string; body?: string; cid?: string }

export type NewsTag = 'breaking' | 'projection' | 'analysis' | 'desk'

/** Optional context that lets the news desk name leaders and spot seats changing hands. */
export interface NewsContext {
  /** constituency id → party → anchor leader */
  leaders?: Record<string, Record<string, string> | undefined>
  /** constituency id → party that notionally held the seat in 2025 */
  holders?: Record<string, string>
  /** party → GE2025 national vote share */
  prevNational?: Record<string, number>
  /** line-ups, used to suggest coalitions after a hung result */
  contests?: Record<string, Contest>
}

export const POLLS_CLOSE = 20 * 60

/**
 * Builds a realistic election-night running order:
 * sample counts from ~10:30pm (±4% accuracy, as ELD states), official results from ~11:30pm,
 * smaller SMCs first and the big GRCs into the early morning.
 */
export function buildTimeline(plan: Constituency[], result: ElectionResult, seed: number, news?: NewsContext): NightEvent[] {
  const r = rng(seed)
  const ev: NightEvent[] = []
  plan.forEach((c, i) => {
    const s = result.seats[i]
    if (s.walkover) {
      ev.push({ t: 0, kind: 'walkover', cid: c.id, winner: s.winner })
      return
    }
    const size = s.valid / 1000 // thousands of votes
    const sampleT = 150 + r.next() * 80 + size * 0.15
    const shares: Record<string, number> = {}
    for (const [p, v] of Object.entries(s.shares)) shares[p] = Math.max(0.001, v + r.normal() * 0.018)
    const tot = Object.values(shares).reduce((a, b) => a + b, 0)
    for (const p of Object.keys(shares)) shares[p] = Math.round((shares[p] / tot) * 100) / 100
    ev.push({ t: sampleT, kind: 'sample', cid: c.id, shares })
    // close fights take longer (and may need a recount)
    const recount = s.margin < 0.02 ? 50 + r.next() * 40 : 0
    const resultT = 225 + size * 1.25 + r.next() * 70 + recount
    ev.push({ t: Math.max(sampleT + 25, resultT), kind: 'result', cid: c.id, seat: s })
  })
  ev.sort((a, b) => a.t - b.t)
  const last = ev.length ? ev[ev.length - 1].t : 0
  if (news) {
    ev.push(...buildNews(plan, result, ev, seed, news, last))
    ev.sort((a, b) => a.t - b.t)
  }
  ev.push({ t: last + 10, kind: 'ncmp' })
  return ev
}

/** Minimum simulated minutes between routine news items, so they stay occasional. */
export const NEWS_GAP = 15
const MAX_GAINS = 4
const MAX_CLOSE = 2

const pc = (v: number) => `${(v * 100).toFixed(1)}%`

/**
 * Broadcast-style news flashes woven into the night: milestones (first result,
 * halfway, majority, supermajority, final tally) always run; routine items
 * (seats changing hands, tight counts) are throttled by NEWS_GAP.
 * Uses its own RNG stream so the underlying count timings are unaffected.
 */
function buildNews(plan: Constituency[], result: ElectionResult, ev: NightEvent[], seed: number, ctx: NewsContext, last: number): NightEvent[] {
  const r = rng((seed ^ 0x5eed5) >>> 0)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r.next() * xs.length)]
  const byId = new Map(plan.map((c) => [c.id, c]))
  const total = plan.reduce((s, c) => s + c.seats, 0)
  const majority = Math.floor(total / 2) + 1
  const twoThirds = Math.ceil((total * 2) / 3)
  const gov = result.government
  const out: NightEvent[] = []
  let lastRoutine = -Infinity
  const add = (t: number, tag: NewsTag, headline: string, body?: string, cid?: string, milestone = false) => {
    if (!milestone && t - lastRoutine < NEWS_GAP) return false
    out.push({ t, kind: 'news', tag, headline, body, cid })
    if (!milestone) lastRoutine = t
    return true
  }
  const lag = () => 2 + r.next() * 4
  const label = (c: Constituency) => `${c.name} ${c.type}`
  const tally = (seats: Record<string, number>) => Object.entries(seats).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ')

  // polls close
  const walkovers = ev.filter((e) => e.kind === 'walkover').map((e) => byId.get(e.cid)!)
  const contested = plan.length - walkovers.length
  add(1, 'desk', pick(['Polls have closed across Singapore', 'Voting has ended; the count begins']),
    `${contested} contested constituencies and ${total} seats are up for election.` +
    (walkovers.length ? ` ${walkovers.map((c) => `${label(c)} (${result.seats[plan.indexOf(c)].winner})`).join(', ')} ${walkovers.length > 1 ? 'were' : 'was'} returned unopposed on Nomination Day.` : ''),
    undefined, true)

  const seats: Record<string, number> = {}
  let declared = 0
  let firstSample = false
  let firstResult = false
  let halfway = false
  let majorityCalled = false
  let supermajority = false
  let gains = 0
  let close = 0
  for (const w of walkovers) {
    const s = result.seats[plan.indexOf(w)]
    seats[s.winner] = (seats[s.winner] || 0) + w.seats
    declared += w.seats
  }

  for (const e of ev) {
    if (e.kind === 'sample') {
      const c = byId.get(e.cid)!
      const [[p1, v1], [p2, v2] = ['', 0]] = Object.entries(e.shares).sort((a, b) => b[1] - a[1])
      if (!firstSample) {
        firstSample = true
        add(e.t + lag(), 'desk', `First sample count in: ${label(c)}`,
          `The early indication puts ${p1} ahead on about ${Math.round(v1 * 100)}%. Sample counts are accurate to within 4 percentage points.`, c.id, true)
      } else if (p2 && v1 - v2 < 0.04 && close < MAX_CLOSE) {
        if (add(e.t + lag(), 'analysis', pick([`Too close to call in ${label(c)}`, `${label(c)} on a knife edge`]),
          `The sample count has ${p1} and ${p2} within ${Math.max(1, Math.round((v1 - v2) * 100))} point${Math.round((v1 - v2) * 100) > 1 ? 's' : ''} of each other, inside the margin of error.`, c.id)) close++
      }
      continue
    }
    if (e.kind !== 'result') continue
    const c = byId.get(e.cid)!
    const s = e.seat
    seats[s.winner] = (seats[s.winner] || 0) + c.seats
    declared += c.seats
    const t = e.t + lag()
    const leaders = ctx.leaders?.[c.id]
    const holder = ctx.holders?.[c.id]

    if (!firstResult) {
      firstResult = true
      add(t, 'breaking', `First result: ${s.winner} wins ${label(c)}`,
        `${s.winner} takes ${pc(s.shares[s.winner])} of the vote${s.runnerUp ? `, ahead of ${s.runnerUp} on ${pc(s.shares[s.runnerUp])}` : ''}.`, c.id, true)
    } else if (holder && s.winner !== holder && gains < MAX_GAINS) {
      const who = !leaders?.[s.winner] ? s.winner : c.type === 'GRC' ? `The ${s.winner} team led by ${leaders[s.winner]}` : `${s.winner}'s ${leaders[s.winner]}`
      const loser = leaders?.[holder] ? ` ${leaders[holder]} is defeated.` : ''
      if (add(t, 'breaking', pick([`${s.winner} gains ${label(c)} from ${holder}`, `${label(c)} changes hands: ${s.winner} gain`]),
        `${who} wins with ${pc(s.shares[s.winner])}.${loser}`, c.id)) gains++
    } else if (s.margin < 0.02 && close < MAX_CLOSE) {
      if (add(t, 'breaking', `Photo finish in ${label(c)}`,
        `${s.winner} holds on by ${(s.margin * 100).toFixed(1)} points over ${s.runnerUp}, close enough for a recount to be requested.`, c.id)) close++
    }

    if (!halfway && declared >= total / 2) {
      halfway = true
      add(t + 1, 'desk', 'Halfway through the count', `${declared} of ${total} seats declared. Running tally: ${tally(seats)}.`, undefined, true)
    }
    const lead = Object.entries(seats).sort((a, b) => b[1] - a[1])[0]
    if (!majorityCalled && lead && lead[1] >= majority) {
      majorityCalled = true
      add(t + 2, 'projection', lead[0] === 'PAP' ? pick(['PAP returned to government', 'PAP secures a majority']) : `${lead[0]} wins a majority`,
        `${lead[0]} has ${lead[1]} seats declared, passing the ${majority} needed to form the government.`, undefined, true)
    }
    const govSeats = seats[gov] || 0
    if (!supermajority && majorityCalled && govSeats >= twoThirds) {
      supermajority = true
      add(t + 3, 'projection', `${gov} secures a two-thirds supermajority`, `With ${govSeats} seats, ${gov} can amend the Constitution without opposition support.`, undefined, true)
    } else if (!supermajority && majorityCalled && govSeats + (total - declared) < twoThirds) {
      supermajority = true
      add(t + 3, 'analysis', `Two-thirds supermajority out of reach for ${gov}`, `Even winning every remaining seat would leave ${gov} short of the ${twoThirds} needed to amend the Constitution alone.`, undefined, true)
    }
  }

  // final wrap-up, just before the NCMP announcement
  const govShare = result.totalValid ? (result.votesByParty[gov] ?? 0) / result.totalValid : 0
  const prev = ctx.prevNational?.[gov]
  const swing = prev === undefined ? '' : ` (${govShare - prev >= 0 ? '+' : ''}${((govShare - prev) * 100).toFixed(1)} points on 2025)`
  const govTotal = result.seatsByParty[gov] ?? 0
  add(last + 5, 'analysis', 'All results declared',
    `${govTotal > total / 2 ? `${gov} forms the government with ${govTotal} of ${total} seats` : `No party has a majority: ${gov} is the largest with ${govTotal} of ${total} seats`} and ${pc(govShare)} of the national vote${swing}. Final tally: ${tally(result.seatsByParty)}.`,
    undefined, true)
  if (govTotal <= total / 2) {
    const [top] = suggestCoalitions({ ...result, total, contests: ctx.contests ?? {} }, 1)
    add(last + 7, 'breaking', 'Hung parliament: coalition talks expected',
      `No party can govern alone for the first time since 1959.${top ? ` The most workable combination on paper is ${coalitionName(top.members)}, with ${top.seats} seats.` : ''} Use the coalition builder in the Result panel to explore the options.`,
      undefined, true)
  }
  return out
}

export const clock = (t: number) => {
  const m = Math.round(POLLS_CLOSE + t) % (24 * 60)
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${mm} ${h >= 12 ? 'pm' : 'am'}`
}
