import type { Constituency, Plan } from '../../types'
import type { DistrictSpec, GrcSize, OppMode, RedistrictOptions } from './types'

/** SMCs plus GRCs of the preferred size that add up to the requested seats. */
export function compactStructure(totalSeats: number, smcCount: number, grcSize: GrcSize): DistrictSpec[] {
  const smc = Math.max(0, Math.min(smcCount, totalSeats))
  const out: DistrictSpec[] = Array.from({ length: smc }, () => ({ type: 'SMC' as const, seats: 1 }))
  let rest = totalSeats - smc
  if (rest <= 0) return out
  const sizes: number[] = []
  if (grcSize === 'mixed') {
    // as many 5s and 4s as possible, keeping every GRC within 3..6
    const k = Math.max(1, Math.round(rest / 4.5))
    const base = Math.floor(rest / k)
    for (let i = 0; i < k; i++) sizes.push(base)
    for (let i = 0; i < rest - base * k; i++) sizes[i]++
  } else {
    const k = Math.max(1, Math.round(rest / grcSize))
    const base = Math.floor(rest / k)
    for (let i = 0; i < k; i++) sizes.push(base)
    for (let i = 0; i < rest - base * k; i++) sizes[i]++
  }
  for (const s of sizes) {
    if (s < 3) {
      // too few seats left for a GRC: make them SMCs
      for (let i = 0; i < s; i++) out.push({ type: 'SMC', seats: 1 })
    } else if (s > 6) {
      out.push({ type: 'GRC', seats: 6 })
      for (let i = 0; i < s - 6; i++) out.push({ type: 'SMC', seats: 1 })
    } else out.push({ type: 'GRC', seats: s })
    rest -= s
  }
  return out
}

export function customStructure(smcCount: number, grcCounts: Record<3 | 4 | 5 | 6, number>): DistrictSpec[] {
  const out: DistrictSpec[] = Array.from({ length: Math.max(0, smcCount) }, () => ({ type: 'SMC' as const, seats: 1 }))
  for (const size of [6, 5, 4, 3] as const) for (let i = 0; i < (grcCounts[size] || 0); i++) out.push({ type: 'GRC', seats: size })
  return out
}

/**
 * EBRC-style: keep the existing constituencies and re-apportion the target seats among them
 * by electors (SMCs stay at 1, GRCs 3..6). Extra SMCs are carved out later by the engine.
 * Opposition-held seats (`opp`) keep their seats unless `oppMode` is 'free'.
 */
export function ebrcStructure(plan: Plan, electors: Record<string, number>, totalSeats: number, opp: Set<string> = new Set(), oppMode: OppMode = 'free'): DistrictSpec[] {
  const cons = plan.constituencies.filter((c) => (electors[c.id] ?? 0) > 0)
  const kept = oppMode === 'free' ? [] : cons.filter((c) => opp.has(c.id))
  const rest = cons.filter((c) => !kept.includes(c))
  const smcs = rest.filter((c) => c.type === 'SMC')
  const grcs = rest.filter((c) => c.type === 'GRC')
  const grcSeats = Math.max(0, totalSeats - smcs.length - kept.reduce((s, c) => s + c.seats, 0))
  const grcElectors = grcs.reduce((s, c) => s + electors[c.id], 0) || 1
  const exact = grcs.map((c) => (electors[c.id] / grcElectors) * grcSeats)
  const seats = exact.map((v) => Math.min(6, Math.max(3, Math.floor(v))))
  let left = grcSeats - seats.reduce((a, b) => a + b, 0)
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (let pass = 0; left !== 0 && pass < 12; pass++) {
    for (const [, i] of order) {
      if (left > 0 && seats[i] < 6) { seats[i]++; left-- }
      else if (left < 0 && seats[i] > 3) { seats[i]--; left++ }
      if (left === 0) break
    }
  }
  return [
    ...kept.map((c) => protectedSpec(c, oppMode)),
    ...smcs.map((c) => ({ type: 'SMC' as const, seats: 1, baseId: c.id, name: c.name, color: c.color })),
    ...grcs.map((c, i) => ({ type: 'GRC' as const, seats: seats[i], baseId: c.id, name: c.name, color: c.color })),
  ]
}

function protectedSpec(c: Constituency, oppMode: OppMode): DistrictSpec {
  return { type: c.type, seats: c.seats, baseId: c.id, name: c.name, color: c.color, locked: oppMode === 'lock', opp: oppMode === 'minor' }
}

/**
 * EBRC-style with an exact mix: `smcCount` SMCs and `grcCounts` GRCs of each size.
 * Opposition-held seats are kept first and count towards the mix where their type and size fit;
 * otherwise they are kept on top of it. Existing seats are reused largest-first (keeping their
 * names); leftover ones are dissolved and missing ones become new districts (no baseId).
 */
export function ebrcChosenStructure(
  plan: Plan, electors: Record<string, number>, smcCount: number, grcCounts: Record<3 | 4 | 5 | 6, number>,
  opp: Set<string> = new Set(), oppMode: OppMode = 'free',
): { specs: DistrictSpec[]; note?: string } {
  const cons = plan.constituencies.filter((c) => (electors[c.id] ?? 0) > 0)
  const kept = oppMode === 'free' ? [] : cons.filter((c) => opp.has(c.id))
  const needSmc = { n: Math.max(0, smcCount) }
  const needGrc: Record<number, number> = { ...grcCounts }
  const extra: string[] = []
  for (const c of kept) {
    if (c.type === 'SMC' && needSmc.n > 0) needSmc.n--
    else if (c.type === 'GRC' && (needGrc[c.seats] ?? 0) > 0) needGrc[c.seats]--
    else extra.push(c.name)
  }
  const byElectors = (a: Constituency, b: Constituency) => electors[b.id] - electors[a.id]
  const smcs = cons.filter((c) => c.type === 'SMC' && !kept.includes(c)).sort(byElectors)
  const grcs = cons.filter((c) => c.type === 'GRC' && !kept.includes(c)).sort(byElectors)
  const sizes = ([6, 5, 4, 3] as const).flatMap((k) => Array.from({ length: Math.max(0, needGrc[k] ?? 0) }, () => k))

  const specs: DistrictSpec[] = kept.map((c) => protectedSpec(c, oppMode))
  for (let i = 0; i < needSmc.n; i++) {
    const c = smcs[i]
    specs.push(c ? { type: 'SMC', seats: 1, baseId: c.id, name: c.name, color: c.color } : { type: 'SMC', seats: 1 })
  }
  sizes.forEach((k, i) => {
    const c = grcs[i]
    specs.push(c ? { type: 'GRC', seats: k, baseId: c.id, name: c.name, color: c.color } : { type: 'GRC', seats: k })
  })
  const note = extra.length
    ? `${extra.join(', ')} ${extra.length > 1 ? 'are' : 'is'} opposition-held and kept as ${extra.length > 1 ? 'they are' : 'it is'}, on top of the mix you asked for.`
    : undefined
  return { specs, note }
}

export function structureFor(opts: RedistrictOptions): DistrictSpec[] {
  if (opts.method === 'custom') return customStructure(opts.smcCount, opts.grcCounts)
  return compactStructure(opts.totalSeats, opts.smcCount, opts.grcSize)
}
