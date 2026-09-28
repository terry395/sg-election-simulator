import type { Block, Constituency, GE2025Data, Party, Plan, Year } from '../types'

export const electorsOf = (b: Block, year: Year) => (year === 2030 ? b.e30 : b.e25)

/** Per-block GE2025 context derived from the constituency each block sat in. */
export interface BlockContext {
  /** opposition parties that contested this block in 2025 and their notional share */
  opp: Record<string, number>
  /** the strongest opposition party here in 2025 */
  mainOpp: string
  turnout: number
}

export const MPBH_HYPOTHETICAL_OPP = 'WP'

export function buildBlockContext(blocks: Block[], ge: GE2025Data): BlockContext[] {
  const byEd = new Map(ge.constituencies.map((c) => [c.id, c]))
  const avgTurnout =
    ge.constituencies.filter((c) => c.turnout).reduce((s, c) => s + c.turnout! * c.electors, 0) /
    ge.constituencies.filter((c) => c.turnout).reduce((s, c) => s + c.electors, 0)
  return blocks.map((b) => {
    const c = byEd.get(b.ed)!
    const oppRes = c.result.filter((r) => r.party !== 'PAP')
    const oppTotal = oppRes.reduce((s, r) => s + r.share, 0)
    const opp: Record<string, number> = {}
    if (c.walkover || oppTotal === 0) opp[MPBH_HYPOTHETICAL_OPP] = 1 - b.pap
    else for (const r of oppRes) opp[r.party] = ((1 - b.pap) * r.share) / oppTotal
    const mainOpp = c.walkover ? MPBH_HYPOTHETICAL_OPP : oppRes[0]?.party ?? MPBH_HYPOTHETICAL_OPP
    return { opp, mainOpp, turnout: c.turnout ?? avgTurnout }
  })
}

export interface ConstituencyStats {
  id: string
  electors: number
  blocks: number
  perMp: number
  /** deviation from the national electors-per-MP quota, e.g. 0.12 = +12% */
  deviation: number
  /** notional GE2025 PAP share */
  pap0: number
  /** notional GE2025 opposition shares by party */
  opp0: Record<string, number>
  /** fraction of electors living where the party contested in 2025 */
  legacy: Record<string, number>
  /** elector-weighted strength of the 2025 main opponent */
  oldQuality: number
  /** most common 2025 main opponent */
  mainOpp: string
  turnout0: number
  age: number[]
  eth: number[]
  house: number[]
  /** electors drawn from each GE2025 constituency */
  sources: Record<string, number>
  centroid: [number, number]
}

export interface PlanStats {
  byId: Record<string, ConstituencyStats>
  quota: number
  totalElectors: number
  assignedElectors: number
  unassignedBlocks: number[]
  seats: number
}

function weightedAdd(acc: number[], v: number[] | null, w: number) {
  if (!v) return
  for (let i = 0; i < v.length; i++) acc[i] += v[i] * w
}

export function computeStats(
  plan: Plan,
  blocks: Block[],
  ctx: BlockContext[],
  parties: Party[],
  year: Year,
): PlanStats {
  const strength = Object.fromEntries(parties.map((p) => [p.id, p.strength]))
  const acc: Record<string, ConstituencyStats & { cx: number; cy: number }> = {}
  for (const c of plan.constituencies) {
    acc[c.id] = {
      id: c.id, electors: 0, blocks: 0, perMp: 0, deviation: 0, pap0: 0, opp0: {}, legacy: {},
      oldQuality: 0, mainOpp: 'WP', turnout0: 0, age: [0, 0, 0, 0], eth: [0, 0, 0, 0], house: [0, 0, 0, 0, 0],
      sources: {}, centroid: [0, 0], cx: 0, cy: 0,
    }
  }
  let totalElectors = 0
  let assignedElectors = 0
  const unassignedBlocks: number[] = []
  for (const b of blocks) {
    const w = electorsOf(b, year)
    totalElectors += w
    const cid = plan.assign[b.id]
    const s = cid ? acc[cid] : undefined
    if (!s) {
      if (w > 0) unassignedBlocks.push(b.id)
      continue
    }
    assignedElectors += w
    s.blocks++
    s.electors += w
    s.pap0 += b.pap * w
    const bc = ctx[b.id]
    for (const [p, v] of Object.entries(bc.opp)) {
      s.opp0[p] = (s.opp0[p] || 0) + v * w
      s.legacy[p] = (s.legacy[p] || 0) + w
    }
    s.oldQuality += (strength[bc.mainOpp] ?? 0.5) * w
    s.turnout0 += bc.turnout * w
    weightedAdd(s.age, b.age, w)
    weightedAdd(s.eth, b.eth, w)
    weightedAdd(s.house, b.house, w)
    s.sources[b.ed] = (s.sources[b.ed] || 0) + w
    const cw = w + 1
    s.cx += b.c[0] * cw
    s.cy += b.c[1] * cw
    s.centroid[0] += cw
  }
  const seats = plan.constituencies.reduce((s, c) => s + c.seats, 0)
  const quota = seats ? assignedElectors / seats : 0
  const byId: Record<string, ConstituencyStats> = {}
  for (const c of plan.constituencies) {
    const s = acc[c.id]
    const e = s.electors || 1
    const cw = s.centroid[0] || 1
    const mainOpp = Object.entries(s.opp0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'WP'
    byId[c.id] = {
      id: s.id,
      electors: s.electors,
      blocks: s.blocks,
      perMp: s.electors / c.seats,
      deviation: quota ? s.electors / c.seats / quota - 1 : 0,
      pap0: s.pap0 / e,
      opp0: Object.fromEntries(Object.entries(s.opp0).map(([p, v]) => [p, v / e])),
      legacy: Object.fromEntries(Object.entries(s.legacy).map(([p, v]) => [p, v / e])),
      oldQuality: s.oldQuality / e,
      mainOpp,
      turnout0: s.turnout0 / e,
      age: s.age.map((v) => v / e),
      eth: s.eth.map((v) => v / e),
      house: s.house.map((v) => v / e),
      sources: s.sources,
      centroid: [s.cx / cw, s.cy / cw],
    }
  }
  return { byId, quota, totalElectors, assignedElectors, unassignedBlocks, seats }
}

/** The GE2025 map as an editable plan. */
export function ge2025Plan(blocks: Block[], ge: GE2025Data, palette: string[]): Plan {
  const assign = blocks.map((b) => b.ed)
  const sorted = ge.constituencies.slice().sort((a, b) => a.name.localeCompare(b.name))
  const colors = distinctColors(sorted.map((c) => c.id), assign, blocks, palette)
  const constituencies: Constituency[] = sorted.map((c) => ({
    id: c.id,
    name: c.name.replace(/ (GRC|SMC)$/i, ''),
    type: c.type,
    seats: c.seats,
    color: colors[c.id],
  }))
  return { constituencies, assign }
}

/** Greedy map colouring: neighbouring constituencies never share a colour. */
export function distinctColors(ids: string[], assign: (string | null)[], blocks: Block[], palette: string[]) {
  const nb: Record<string, Set<string>> = Object.fromEntries(ids.map((id) => [id, new Set<string>()]))
  for (const b of blocks) {
    const a = assign[b.id]
    if (!a) continue
    for (const n of b.adj) { const o = assign[n]; if (o && o !== a) nb[a]?.add(o) }
  }
  const out: Record<string, string> = {}
  const order = [...ids].sort((x, y) => nb[y].size - nb[x].size)
  order.forEach((id, k) => {
    const used = new Set([...nb[id]].map((n) => out[n]).filter(Boolean))
    // start at a different offset per constituency so colours stay varied
    for (let i = 0; i < palette.length; i++) {
      const c = palette[(i + k * 5) % palette.length]
      if (!used.has(c)) { out[id] = c; break }
    }
  })
  return out
}

/** Is every populated block of the constituency connected? (uninhabited land is ignored) */
export function isContiguous(ids: number[], blocks: Block[]): boolean {
  const populated = ids.filter((i) => blocks[i].e25 + blocks[i].e30 > 0)
  if (populated.length <= 1) return true
  const all = new Set(ids)
  const seen = new Set([populated[0]])
  const stack = [populated[0]]
  while (stack.length) {
    const i = stack.pop()!
    for (const n of blocks[i].adj) if (all.has(n) && !seen.has(n)) { seen.add(n); stack.push(n) }
  }
  return populated.every((i) => seen.has(i))
}

export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-/])(\w)/g, (m) => m.toUpperCase())

/** A constituency name from the one or two towns (planning areas) holding most of its electors. */
export function suggestName(ids: number[], blocks: Block[]): string {
  const pa: Record<string, number> = {}
  for (const i of ids) pa[blocks[i].pa] = (pa[blocks[i].pa] || 0) + blocks[i].e25 + 1
  const ranked = Object.entries(pa).sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 1)
  // add a second town only if it is a sizeable part of the seat
  if (ranked[1] && ranked[1][1] > ranked[0][1] * 0.35) top.push(ranked[1])
  return top.map(([n]) => titleCase(n)).join('-')
}
