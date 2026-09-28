import type { Graph } from './graph'
import type { DistrictSpec, GerryGoal } from './types'
import type { Rng } from '../rng'

export interface Weights {
  /** squared deviation from the quota */
  pop: number
  /** extra penalty beyond the allowed deviation */
  hard: number
  /** mean squared distance from the district centre (km²) per seat */
  compact: number
  /** each extra town (planning area) a district reaches into */
  town: number
  /** electors moved away from their starting constituency (per quota of electors) */
  change: number
  /** partisan objective, per seat */
  party: number
  goal?: GerryGoal
}

export interface EngineInput {
  g: Graph
  districts: DistrictSpec[]
  maxDev: number
  weights: Weights
  /** starting assignment (district index or -1) for every block; null = grow from seeds */
  init: Int32Array | null
  /** assignment the change penalty compares against */
  base: Int32Array | null
  rng: Rng
  iterations: number
}

/** Land with no voters still counts a little towards shape, so districts don't sprawl over it. */
const EMPTY_WEIGHT = 400
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

export class Partition {
  readonly D: number
  readonly assign: Int32Array
  readonly E: Float64Array
  readonly P: Float64Array
  readonly SW: Float64Array
  readonly SX: Float64Array
  readonly SY: Float64Array
  readonly SQ: Float64Array
  readonly count: Int32Array
  readonly paCnt: Int32Array
  readonly distinct: Int32Array
  readonly target: Float64Array
  readonly cost: Float64Array
  readonly quota: number
  private readonly nPA: number
  changeCost = 0
  private readonly g: Graph
  private readonly specs: DistrictSpec[]
  private readonly wt: Weights
  private readonly maxDev: number
  private readonly base: Int32Array | null

  constructor(g: Graph, specs: DistrictSpec[], wt: Weights, maxDev: number, base: Int32Array | null) {
    this.g = g
    this.specs = specs
    this.wt = wt
    this.maxDev = maxDev
    this.base = base
    const D = (this.D = specs.length)
    this.assign = new Int32Array(g.n).fill(-1)
    this.E = new Float64Array(D)
    this.P = new Float64Array(D)
    this.SW = new Float64Array(D)
    this.SX = new Float64Array(D)
    this.SY = new Float64Array(D)
    this.SQ = new Float64Array(D)
    this.count = new Int32Array(D)
    this.nPA = g.paNames.length
    this.paCnt = new Int32Array(D * this.nPA)
    this.distinct = new Int32Array(D)
    this.cost = new Float64Array(D)
    const mainElectors = g.mainList.reduce((s, i) => s + g.w[i], 0)
    const seats = specs.reduce((s, d) => s + d.seats, 0)
    this.quota = mainElectors / seats
    this.target = Float64Array.from(specs, (d) => d.seats * this.quota)
  }

  // ------------------------------------------------------------------ cost model
  districtCost(d: number, E: number, P: number, SW: number, SX: number, SY: number, SQ: number, distinct: number): number {
    const wt = this.wt
    const seats = this.specs[d].seats
    const dev = E / this.target[d] - 1
    const over = Math.abs(dev) - this.maxDev
    let c = wt.pop * dev * dev + (over > 0 ? wt.hard * over * over + wt.hard * 0.002 : 0)
    if (wt.compact && SW > 0) c += (wt.compact * ((SQ - (SX * SX + SY * SY) / SW) / SW)) / seats
    if (wt.town && distinct > 1) c += wt.town * (distinct - 1)
    if (wt.party && wt.goal) {
      const p = E > 0 ? P / E : 0.5
      let v = 0
      if (wt.goal === 'pap') v = sigmoid((p - 0.53) / 0.015)
      else if (wt.goal === 'opposition') v = sigmoid((0.47 - p) / 0.015)
      else v = Math.exp(-(((p - 0.5) / 0.03) ** 2))
      c -= wt.party * seats * v
    }
    return c
  }

  total(): number {
    let s = this.changeCost
    for (let d = 0; d < this.D; d++) s += this.cost[d]
    return s
  }

  private refresh(d: number) {
    this.cost[d] = this.districtCost(d, this.E[d], this.P[d], this.SW[d], this.SX[d], this.SY[d], this.SQ[d], this.distinct[d])
  }

  private changeOf(i: number, d: number) {
    if (!this.base || !this.wt.change) return 0
    return this.base[i] >= 0 && this.base[i] !== d ? (this.wt.change * this.g.w[i]) / this.quota : 0
  }

  /** Put block i into district d (i must currently be unassigned). */
  add(i: number, d: number) {
    const g = this.g
    const w = g.w[i]
    const ww = w + EMPTY_WEIGHT
    this.assign[i] = d
    this.E[d] += w
    this.P[d] += w * g.pap[i]
    this.SW[d] += ww
    this.SX[d] += ww * g.x[i]
    this.SY[d] += ww * g.y[i]
    this.SQ[d] += ww * (g.x[i] * g.x[i] + g.y[i] * g.y[i])
    this.count[d]++
    if (w > 0 && this.paCnt[d * this.nPA + g.pa[i]]++ === 0) this.distinct[d]++
    this.changeCost += this.changeOf(i, d)
    this.refresh(d)
  }

  remove(i: number) {
    const g = this.g
    const d = this.assign[i]
    const w = g.w[i]
    const ww = w + EMPTY_WEIGHT
    this.assign[i] = -1
    this.E[d] -= w
    this.P[d] -= w * g.pap[i]
    this.SW[d] -= ww
    this.SX[d] -= ww * g.x[i]
    this.SY[d] -= ww * g.y[i]
    this.SQ[d] -= ww * (g.x[i] * g.x[i] + g.y[i] * g.y[i])
    this.count[d]--
    if (w > 0 && --this.paCnt[d * this.nPA + g.pa[i]] === 0) this.distinct[d]--
    this.changeCost -= this.changeOf(i, d)
    this.refresh(d)
  }

  /** Cost change if block i moved from its district to district b. */
  moveDelta(i: number, b: number): number {
    const g = this.g
    const a = this.assign[i]
    const w = g.w[i]
    const ww = w + EMPTY_WEIGHT
    const x = g.x[i]
    const y = g.y[i]
    const q = x * x + y * y
    const pa = g.pa[i]
    const distA = this.distinct[a] - (w > 0 && this.paCnt[a * this.nPA + pa] === 1 ? 1 : 0)
    const distB = this.distinct[b] + (w > 0 && this.paCnt[b * this.nPA + pa] === 0 ? 1 : 0)
    const ca = this.districtCost(a, this.E[a] - w, this.P[a] - w * g.pap[i], this.SW[a] - ww, this.SX[a] - ww * x, this.SY[a] - ww * y, this.SQ[a] - ww * q, distA)
    const cb = this.districtCost(b, this.E[b] + w, this.P[b] + w * g.pap[i], this.SW[b] + ww, this.SX[b] + ww * x, this.SY[b] + ww * y, this.SQ[b] + ww * q, distB)
    return ca + cb - this.cost[a] - this.cost[b] + this.changeOf(i, b) - this.changeOf(i, a)
  }

  move(i: number, b: number) {
    this.remove(i)
    this.add(i, b)
  }

  /** Would district a stay in one piece without block i? (mainland blocks only) */
  staysConnected(i: number, a: number): boolean {
    const g = this.g
    const nbs: number[] = []
    for (const n of g.adj[i]) if (this.assign[n] === a && g.main[n]) nbs.push(n)
    if (nbs.length <= 1) return true
    const seen = new Set<number>([i, nbs[0]])
    const stack = [nbs[0]]
    let found = 1
    while (stack.length) {
      const c = stack.pop()!
      for (const n of g.adj[c]) {
        if (seen.has(n) || this.assign[n] !== a || !g.main[n]) continue
        seen.add(n)
        if (nbs.includes(n) && ++found === nbs.length) return true
        stack.push(n)
      }
    }
    return false
  }
}

// ------------------------------------------------------------------ seeding & growth

/**
 * Seed blocks from population-balanced centres ("balanced k-means"): each district gets a centre,
 * blocks go to the nearest centre after a per-district handicap that is tuned until every
 * district's catchment holds about its target number of electors. This puts seats where voters
 * live, so the growth phase starts close to balanced across the whole island.
 */
function pickSeeds(g: Graph, targets: Float64Array, rng: Rng): number[] {
  const pool = g.mainList.filter((i) => g.w[i] > 0)
  const k = targets.length
  // k-means++ style initial centres, weighted by electors
  const cx = new Float64Array(k)
  const cy = new Float64Array(k)
  const nearest = new Float64Array(g.n).fill(Infinity)
  const pickWeighted = (score: (i: number) => number) => {
    let tot = 0
    for (const i of pool) tot += score(i)
    let r = rng.next() * tot
    for (const i of pool) { r -= score(i); if (r <= 0) return i }
    return pool[pool.length - 1]
  }
  for (let d = 0; d < k; d++) {
    const s = d === 0 ? pickWeighted((i) => g.w[i]) : pickWeighted((i) => g.w[i] * nearest[i])
    cx[d] = g.x[s]
    cy[d] = g.y[s]
    for (const i of pool) nearest[i] = Math.min(nearest[i], (g.x[i] - cx[d]) ** 2 + (g.y[i] - cy[d]) ** 2)
  }
  // balance: Lloyd iterations with per-district handicaps
  const handicap = new Float64Array(k)
  const E = new Float64Array(k)
  const SX = new Float64Array(k)
  const SY = new Float64Array(k)
  for (let it = 0; it < 80; it++) {
    E.fill(0); SX.fill(0); SY.fill(0)
    for (const i of pool) {
      let best = 0
      let bd = Infinity
      for (let d = 0; d < k; d++) {
        const v = (g.x[i] - cx[d]) ** 2 + (g.y[i] - cy[d]) ** 2 - handicap[d]
        if (v < bd) { bd = v; best = d }
      }
      E[best] += g.w[i]
      SX[best] += g.w[i] * g.x[i]
      SY[best] += g.w[i] * g.y[i]
    }
    const step = 1.5 * (1 - it / 100)
    for (let d = 0; d < k; d++) {
      if (E[d] > 0) { cx[d] = SX[d] / E[d]; cy[d] = SY[d] / E[d] }
      // under-filled districts reach further, over-filled ones pull back
      handicap[d] += step * Math.max(-1, Math.min(1, (targets[d] - E[d]) / targets[d]))
    }
  }
  // the populated block closest to each centre becomes its seed
  const taken = new Set<number>()
  return Array.from({ length: k }, (_, d) => {
    let best = -1
    let bd = Infinity
    for (const i of pool) {
      if (taken.has(i)) continue
      const v = (g.x[i] - cx[d]) ** 2 + (g.y[i] - cy[d]) ** 2
      if (v < bd) { bd = v; best = i }
    }
    taken.add(best)
    return best
  })
}

/** Grow districts outwards, always feeding the emptiest one, until every mainland block is taken. */
export function grow(p: Partition, g: Graph, rng: Rng, seedPa?: Int32Array) {
  const D = p.D
  const frontier: Set<number>[] = Array.from({ length: D }, () => new Set())
  let unassigned = 0
  for (const i of g.mainList) {
    if (p.assign[i] >= 0) continue
    unassigned++
  }
  for (const i of g.mainList) {
    const d = p.assign[i]
    if (d < 0) continue
    for (const n of g.adj[i]) if (g.main[n] && p.assign[n] < 0) frontier[d].add(n)
  }
  const paOf = seedPa ?? new Int32Array(D).fill(-1)
  while (unassigned > 0) {
    let d = -1
    let fill = Infinity
    for (let k = 0; k < D; k++) {
      if (!frontier[k].size) continue
      const f = p.E[k] / p.target[k] + rng.next() * 1e-6
      if (f < fill) { fill = f; d = k }
    }
    if (d < 0) break
    const cx = p.SW[d] ? p.SX[d] / p.SW[d] : 0
    const cy = p.SW[d] ? p.SY[d] / p.SW[d] : 0
    let pick = -1
    let bestCost = Infinity
    for (const i of frontier[d]) {
      let c = (g.x[i] - cx) ** 2 + (g.y[i] - cy) ** 2
      if (paOf[d] >= 0 && g.pa[i] === paOf[d]) c -= 1.5
      if (c < bestCost) { bestCost = c; pick = i }
    }
    p.add(pick, d)
    unassigned--
    for (const f of frontier) f.delete(pick)
    for (const n of g.adj[pick]) if (g.main[n] && p.assign[n] < 0) frontier[d].add(n)
  }
}

// ------------------------------------------------------------------ annealing

export function anneal(p: Partition, g: Graph, rng: Rng, iterations: number, t0 = 2, t1 = 0.002) {
  const main = g.mainList
  const ratio = t1 / t0
  for (let it = 0; it < iterations; it++) {
    const T = t0 * Math.pow(ratio, it / iterations)
    const i = main[Math.floor(rng.next() * main.length)]
    const a = p.assign[i]
    const nbs = g.adj[i]
    if (!nbs.length || p.count[a] <= 1) continue
    let b = -1
    const start = Math.floor(rng.next() * nbs.length)
    for (let k = 0; k < nbs.length; k++) {
      const n = nbs[(start + k) % nbs.length]
      if (g.main[n] && p.assign[n] !== a) { b = p.assign[n]; break }
    }
    if (b < 0) continue
    const delta = p.moveDelta(i, b)
    if (delta > 0 && rng.next() >= Math.exp(-delta / T)) continue
    if (!p.staysConnected(i, a)) continue
    p.move(i, b)
  }
}

/** One full run: seed/grow (or start from `init`), then anneal. */
export function runOnce(input: EngineInput): Partition {
  const { g, districts, weights, maxDev, rng } = input
  const p = new Partition(g, districts, weights, maxDev, input.base)
  let seedPa: Int32Array | undefined
  if (input.init) {
    for (const i of g.mainList) if (input.init[i] >= 0) p.add(i, input.init[i])
  } else {
    const seeds = pickSeeds(g, p.target, rng)
    seedPa = new Int32Array(districts.length)
    seeds.forEach((s, d) => { p.add(s, d); seedPa![d] = g.pa[s] })
  }
  grow(p, g, rng, seedPa)
  // any mainland block still unassigned joins a neighbouring district
  for (let pass = 0; pass < 5; pass++)
    for (const i of g.mainList) {
      if (p.assign[i] >= 0) continue
      const n = g.adj[i].find((j) => p.assign[j] >= 0)
      if (n !== undefined) p.add(i, p.assign[n])
    }
  anneal(p, g, rng, input.iterations)
  return p
}
