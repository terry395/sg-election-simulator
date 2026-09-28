import type { Block, Constituency, GE2025Data, Plan } from '../../types'
import { buildGraph, type Graph } from './graph'
import { ebrcStructure, structureFor } from './structure'
import { runOnce, type Partition, type Weights } from './partition'
import type { DistrictSpec, Progress, RedistrictOptions, RedistrictResult } from './types'
import { rng } from '../rng'
import { distinctColors, electorsOf, ge2025Plan, titleCase } from '../stats'
import { uniqueNames } from '../naming'
import { CONSTITUENCY_PALETTE } from '../../data/parties'

export * from './types'

const WEIGHTS: Record<RedistrictOptions['method'], Weights> = {
  ebrc: { pop: 200, hard: 5000, compact: 1, town: 0.6, change: 4, party: 0 },
  compact: { pop: 300, hard: 5000, compact: 6, town: 1, change: 0, party: 0 },
  custom: { pop: 300, hard: 5000, compact: 6, town: 1, change: 0, party: 0 },
  gerrymander: { pop: 100, hard: 5000, compact: 0.5, town: 0.1, change: 0, party: 3 },
}
const RESTARTS: Record<RedistrictOptions['method'], number> = { ebrc: 2, compact: 4, custom: 4, gerrymander: 5 }
const ITERATIONS: Record<RedistrictOptions['method'], number> = { ebrc: 200_000, compact: 300_000, custom: 300_000, gerrymander: 300_000 }
/** more districts need more optimisation steps */
const scaleFor = (districts: number) => Math.max(1, districts / 35)

export const DEFAULT_OPTIONS: RedistrictOptions = {
  method: 'compact',
  year: 2025,
  maxDeviation: 0.1,
  seed: 1,
  totalSeats: 97,
  smcCount: 15,
  grcSize: 'mixed',
  grcCounts: { 3: 0, 4: 8, 5: 10, 6: 0 },
  startFrom: 'ge2025',
  keepNames: true,
  goal: 'pap',
}

let idCounter = 0
const newId = () => `a${Date.now().toString(36)}${(idCounter++).toString(36)}`

export function redistrict(
  blocks: Block[],
  ge: GE2025Data,
  current: Plan,
  opts: RedistrictOptions,
  progress: Progress = () => {},
): RedistrictResult {
  const t0 = Date.now()
  const g = buildGraph(blocks, opts.year)
  let specs: DistrictSpec[]
  let init: Int32Array | null = null
  let base: Int32Array | null = null
  let startPlan: Plan | null = null

  if (opts.method === 'ebrc') {
    const useCurrent = opts.startFrom === 'current' && current.constituencies.length > 0 && current.assign.some(Boolean)
    startPlan = useCurrent ? current : ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)
    const electors: Record<string, number> = {}
    startPlan.assign.forEach((cid, i) => { if (cid) electors[cid] = (electors[cid] || 0) + g.w[i] })
    specs = ebrcStructure(startPlan, electors, opts.totalSeats)
    const index = new Map(specs.map((s, i) => [s.baseId, i]))
    init = new Int32Array(g.n).fill(-1)
    startPlan.assign.forEach((cid, i) => { if (cid && index.has(cid)) init![i] = index.get(cid)! })
    base = init.slice()
    carveSmcs(g, specs, init, opts.smcCount)
  } else {
    specs = structureFor(opts)
  }
  if (!specs.length) throw new Error('No constituencies to draw')

  const restarts = RESTARTS[opts.method]
  let best: Partition | null = null
  for (let r = 0; r < restarts; r++) {
    progress(r / restarts, `Drawing option ${r + 1} of ${restarts}…`)
    const p = runOnce({
      g,
      districts: specs,
      maxDev: opts.maxDeviation,
      weights: { ...WEIGHTS[opts.method], goal: opts.method === 'gerrymander' ? opts.goal : undefined },
      init: init ? init.slice() : null,
      base,
      rng: rng(opts.seed * 7919 + r * 104729 + 17),
      iterations: Math.round(ITERATIONS[opts.method] * scaleFor(specs.length)),
    })
    if (!best || p.total() < best.total()) best = p
  }
  progress(1, 'Naming constituencies…')
  const p = best!
  attachIslands(g, p, startPlan, specs)
  const plan = buildPlan(blocks, ge, g, p, specs, opts, startPlan)
  return { plan, report: makeReport(blocks, ge, g, p, specs, plan, Date.now() - t0) }
}

/** EBRC mode: create new SMCs (seeded at the edge of the biggest GRCs) until the minimum is met. */
function carveSmcs(g: Graph, specs: DistrictSpec[], init: Int32Array, minSmc: number) {
  let need = minSmc - specs.filter((s) => s.type === 'SMC').length
  while (need-- > 0) {
    const members = (d: number) => g.mainList.filter((i) => init[i] === d)
    const candidates = specs
      .map((s, d) => ({ s, d, e: members(d).reduce((a, i) => a + g.w[i], 0) }))
      .filter(({ s }) => s.type === 'GRC' && s.seats >= 4)
      .sort((a, b) => b.e / b.s.seats - a.e / a.s.seats || b.s.seats - a.s.seats)
    const pick = candidates[0]
    if (!pick) return
    pick.s.seats--
    const ids = members(pick.d).filter((i) => g.w[i] > 0)
    const cx = ids.reduce((a, i) => a + g.x[i], 0) / ids.length
    const cy = ids.reduce((a, i) => a + g.y[i], 0) / ids.length
    // the populated block farthest from the GRC's centre, so the new seat sits on its edge
    let seed = ids[0]
    let far = -1
    for (const i of ids) {
      const d = (g.x[i] - cx) ** 2 + (g.y[i] - cy) ** 2
      if (d > far) { far = d; seed = i }
    }
    specs.push({ type: 'SMC', seats: 1 })
    init[seed] = specs.length - 1
  }
}

/** Islands and other detached land join their old constituency, or the nearest one. */
function attachIslands(g: Graph, p: Partition, startPlan: Plan | null, specs: DistrictSpec[]) {
  const byBase = new Map(specs.map((s, i) => [s.baseId, i]))
  for (const comp of g.islands) {
    let d = -1
    if (startPlan) {
      const cid = startPlan.assign[comp[0]]
      if (cid && byBase.has(cid)) d = byBase.get(cid)!
    }
    if (d < 0) {
      const cx = comp.reduce((a, i) => a + g.x[i], 0) / comp.length
      const cy = comp.reduce((a, i) => a + g.y[i], 0) / comp.length
      let best = Infinity
      for (let k = 0; k < p.D; k++) {
        if (!p.SW[k]) continue
        const dd = (p.SX[k] / p.SW[k] - cx) ** 2 + (p.SY[k] / p.SW[k] - cy) ** 2
        if (dd < best) { best = dd; d = k }
      }
    }
    for (const i of comp) if (p.assign[i] < 0) p.add(i, d)
  }
}

function buildPlan(blocks: Block[], ge: GE2025Data, g: Graph, p: Partition, specs: DistrictSpec[], opts: RedistrictOptions, startPlan: Plan | null): Plan {
  const members: number[][] = specs.map(() => [])
  for (let i = 0; i < g.n; i++) if (p.assign[i] >= 0) members[p.assign[i]].push(i)

  // electors of each GE2025 constituency, to reuse familiar names
  const geTotal: Record<string, number> = {}
  for (const b of blocks) geTotal[b.ed] = (geTotal[b.ed] || 0) + electorsOf(b, opts.year)
  const geName = new Map(ge.constituencies.map((c) => [c.id, c.name.replace(/ (GRC|SMC)$/i, '')]))

  const finalNames = uniqueNames(
    specs.map((s, d) => {
      if (opts.method === 'ebrc' && opts.keepNames && s.name) return { members: members[d], preferred: s.name, locked: true }
      const from: Record<string, number> = {}
      for (const i of members[d]) from[blocks[i].ed] = (from[blocks[i].ed] || 0) + g.w[i]
      const top = Object.entries(from).sort((a, b) => b[1] - a[1])[0]
      // a seat that keeps most of a GE2025 constituency keeps its familiar name
      const preferred = top && top[1] > 0.6 * geTotal[top[0]] ? geName.get(top[0]) : undefined
      return { members: members[d], preferred }
    }),
    blocks,
  )

  const ids = specs.map((s) => s.baseId ?? newId())
  const assign: (string | null)[] = Array.from(p.assign, (d) => (d >= 0 ? ids[d] : null))
  const colors = distinctColors(ids, assign, blocks, CONSTITUENCY_PALETTE)
  const keepColors = opts.method === 'ebrc' && !!startPlan
  const constituencies: Constituency[] = specs.map((s, d) => ({
    id: ids[d],
    name: finalNames[d],
    type: s.type,
    seats: s.seats,
    color: keepColors && s.color ? s.color : colors[ids[d]],
  }))
  return { constituencies: constituencies.sort((a, b) => a.name.localeCompare(b.name)), assign }
}

function makeReport(blocks: Block[], ge: GE2025Data, g: Graph, p: Partition, specs: DistrictSpec[], plan: Plan, ms: number) {
  const seats = specs.reduce((s, d) => s + d.seats, 0)
  const quota = g.total / seats
  let maxDev = 0
  let sumDev = 0
  let papSeats = 0
  let townSplits = 0
  let competitiveSeats = 0
  specs.forEach((s, d) => {
    const dev = Math.abs(p.E[d] / (s.seats * quota) - 1)
    maxDev = Math.max(maxDev, dev)
    sumDev += dev
    if (p.E[d] > 0 && p.P[d] / p.E[d] > 0.5) papSeats += s.seats
    if (p.E[d] > 0 && Math.abs(p.P[d] / p.E[d] - 0.5) < 0.05) competitiveSeats += s.seats
    townSplits += Math.max(0, p.distinct[d] - 1)
  })
  // electors whose constituency keeps the name of the GE2025 one they voted in
  const geName = new Map(ge.constituencies.map((c) => [c.id, titleCase(c.name.replace(/ (GRC|SMC)$/i, ''))]))
  const nameOf = new Map(plan.constituencies.map((c) => [c.id, titleCase(c.name)]))
  let kept = 0
  for (const b of blocks) {
    const cid = plan.assign[b.id]
    if (cid && nameOf.get(cid) === geName.get(b.ed)) kept += g.w[b.id]
  }
  return {
    seats,
    smc: specs.filter((s) => s.type === 'SMC').length,
    grc: specs.filter((s) => s.type === 'GRC').length,
    maxDeviation: maxDev,
    meanDeviation: sumDev / specs.length,
    townSplits,
    keptShare: kept / g.total,
    papSeats,
    oppSeats: seats - papSeats,
    competitiveSeats,
    ms,
  }
}
