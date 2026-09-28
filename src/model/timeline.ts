import type { Constituency } from '../types'
import type { ElectionResult, SeatResult } from './swing'
import { rng } from './rng'

/** Minutes after polls close at 8pm. */
export type NightEvent =
  | { t: number; kind: 'walkover'; cid: string; winner: string }
  | { t: number; kind: 'sample'; cid: string; shares: Record<string, number> }
  | { t: number; kind: 'result'; cid: string; seat: SeatResult }
  | { t: number; kind: 'ncmp' }

export const POLLS_CLOSE = 20 * 60

/**
 * Builds a realistic election-night running order:
 * sample counts from ~10:30pm (±4% accuracy, as ELD states), official results from ~11:30pm,
 * smaller SMCs first and the big GRCs into the early morning.
 */
export function buildTimeline(plan: Constituency[], result: ElectionResult, seed: number): NightEvent[] {
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
  ev.push({ t: last + 10, kind: 'ncmp' })
  return ev
}

export const clock = (t: number) => {
  const m = Math.round(POLLS_CLOSE + t) % (24 * 60)
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${mm} ${h >= 12 ? 'pm' : 'am'}`
}
