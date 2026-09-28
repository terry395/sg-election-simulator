import type { Constituency, Contest, Party, Swings } from '../types'
import type { ConstituencyStats } from './stats'
import { runElection } from './swing'
import { rng } from './rng'

export interface McInput {
  plan: Constituency[]
  stats: Record<string, ConstituencyStats>
  contests: Record<string, Contest>
  swings: Swings
  parties: Record<string, Party>
  runs: number
  seed: number
}

export interface McOutput {
  runs: number
  /** constituency id -> party -> probability of winning */
  winProb: Record<string, Record<string, number>>
  /** party -> histogram of seats won (index = seats) */
  seatHist: Record<string, number[]>
  /** party -> [p5, median, p95] seats */
  seatRange: Record<string, [number, number, number]>
  /** P(largest party / PAP keeps a simple majority, two-thirds) */
  papMajority: number
  papSupermajority: number
  totalSeats: number
}

export function monteCarlo(input: McInput): McOutput {
  const { plan, runs } = input
  const r = rng(input.seed)
  const total = plan.reduce((s, c) => s + c.seats, 0)
  const winCount: Record<string, Record<string, number>> = {}
  const hist: Record<string, number[]> = {}
  let maj = 0
  let sup = 0
  for (let i = 0; i < runs; i++) {
    const res = runElection(plan, input.stats, input.contests, input.swings, input.parties, r)
    res.seats.forEach((s) => {
      const w = (winCount[s.id] ||= {})
      w[s.winner] = (w[s.winner] || 0) + 1
    })
    const papSeats = res.seatsByParty.PAP || 0
    if (papSeats > total / 2) maj++
    if (papSeats >= Math.ceil((total * 2) / 3)) sup++
    for (const p of Object.keys(input.parties)) {
      const h = (hist[p] ||= new Array(total + 1).fill(0))
      h[res.seatsByParty[p] || 0]++
    }
  }
  const winProb: McOutput['winProb'] = {}
  for (const [id, w] of Object.entries(winCount)) winProb[id] = Object.fromEntries(Object.entries(w).map(([p, n]) => [p, n / runs]))
  const seatRange: McOutput['seatRange'] = {}
  for (const [p, h] of Object.entries(hist)) {
    if (h[0] === runs) continue
    const q = (f: number) => { let acc = 0; for (let k = 0; k < h.length; k++) { acc += h[k]; if (acc >= f * runs) return k } return h.length - 1 }
    seatRange[p] = [q(0.05), q(0.5), q(0.95)]
  }
  for (const p of Object.keys(hist)) if (hist[p][0] === runs) delete hist[p]
  return { runs, winProb, seatHist: hist, seatRange, papMajority: maj / runs, papSupermajority: sup / runs, totalSeats: total }
}
