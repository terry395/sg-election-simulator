import type { Block } from '../types'
import { suggestName, titleCase } from './stats'

export interface NameRequest {
  /** block ids in the constituency */
  members: number[]
  /** preferred name (e.g. the GE2025 name it largely continues) */
  preferred?: string
  /** keep this name exactly (EBRC "keep names"); other seats must avoid it */
  locked?: boolean
}

const DIRECTIONS = ['East', 'North-East', 'North', 'North-West', 'West', 'South-West', 'South', 'South-East'] as const
/** last-resort descriptors in the style of existing Singapore constituency names */
const DESCRIPTORS = ['Central', 'Heights', 'Park', 'Gardens', 'Vale', 'View', 'Crescent', 'Hill']

const hasDigit = (s: string) => /\d/.test(s)
/** "PASIR PANJANG 1" -> "Pasir Panjang", "LORONG 8 TOA PAYOH" -> "Toa Payoh" */
const cleanName = (s: string) => titleCase(s.replace(/^LORONG \d+ /i, '').replace(/\s*\d+$/, '').trim())

interface Info {
  x: number
  y: number
  w: number
  /** towns (planning areas) by electors, largest first */
  towns: string[]
  /** neighbourhoods (URA subzones) by electors, largest first */
  hoods: string[]
}

function describe(members: number[], blocks: Block[]): Info {
  let x = 0, y = 0, w = 0
  const pa: Record<string, number> = {}
  const sz: Record<string, number> = {}
  for (const i of members) {
    const b = blocks[i]
    const e = b.e25 + 1
    x += b.c[0] * e
    y += b.c[1] * e
    w += e
    pa[b.pa] = (pa[b.pa] || 0) + e
    sz[b.sz] = (sz[b.sz] || 0) + e
  }
  const rank = (o: Record<string, number>) => [...new Set(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([n]) => cleanName(n)))]
  return { x: x / (w || 1), y: y / (w || 1), w, towns: rank(pa), hoods: rank(sz) }
}

/** Compass direction of a point from a centre (in 8 sectors). */
function directionIndex(dx: number, dy: number) {
  const a = Math.atan2(dy, dx) // 0 = east, counter-clockwise
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
}

/** Alternative names for one constituency, most natural first. */
function alternatives(info: Info): string[] {
  const town = info.towns[0] ?? 'Singapore'
  const out: string[] = []
  const push = (s: string) => { if (s && !hasDigit(s) && !out.includes(s)) out.push(s) }
  for (const h of info.hoods.slice(0, 3)) push(h)
  for (const h of info.hoods.slice(0, 3)) if (!h.startsWith(town)) push(`${town}-${h}`)
  if (info.hoods.length > 1) push(`${info.hoods[0]}-${info.hoods[1]}`)
  if (info.towns[1]) push(`${info.towns[1]}-${info.hoods[0] ?? town}`)
  for (const d of DESCRIPTORS) push(`${town} ${d}`)
  return out
}

/**
 * Unique, number-free names for a set of constituencies.
 * Seats that would share a name are all renamed together: first by compass direction within
 * their town (Punggol West / Punggol East), then by neighbourhood names (Fernvale, Anchorvale…).
 */
export function uniqueNames(requests: NameRequest[], blocks: Block[]): string[] {
  const infos = requests.map((r) => describe(r.members, blocks))
  const base = requests.map((r) => r.preferred || suggestName(r.members, blocks))
  const names: (string | null)[] = requests.map((r, d) => (r.locked ? base[d] : null))
  const used = new Set(names.filter((n): n is string => !!n))

  // group the remaining seats by their natural name
  const groups = new Map<string, number[]>()
  requests.forEach((r, d) => {
    if (r.locked) return
    const g = groups.get(base[d]) ?? []
    g.push(d)
    groups.set(base[d], g)
  })

  // unique natural names are kept as they are
  for (const [name, ds] of groups) {
    if (ds.length === 1 && !used.has(name) && !hasDigit(name)) {
      names[ds[0]] = name
      used.add(name)
    }
  }

  // clashes: give every seat in the group a compass name within its main town
  for (const [, ds] of groups) {
    const open = ds.filter((d) => names[d] === null)
    if (!open.length) continue
    let cx = 0, cy = 0, cw = 0
    for (const d of open) { cx += infos[d].x * infos[d].w; cy += infos[d].y * infos[d].w; cw += infos[d].w }
    cx /= cw || 1
    cy /= cw || 1
    // farthest-out seats pick first, so the clearest directions go to the clearest cases
    const order = [...open].sort((a, b) => Math.hypot(infos[b].x - cx, infos[b].y - cy) - Math.hypot(infos[a].x - cx, infos[a].y - cy))
    const spread = Math.max(...open.map((d) => Math.hypot(infos[d].x - cx, infos[d].y - cy)), 1e-9)
    for (const d of order) {
      if (open.length === 1) break // a single seat clashing with a locked name goes straight to neighbourhood names
      const town = infos[d].towns[0] ?? 'Central'
      // "Jurong West West" reads badly: towns already named by direction use neighbourhood names
      if (/ (North|South|East|West|Central)$/.test(town)) continue
      const dist = Math.hypot(infos[d].x - cx, infos[d].y - cy)
      const tries: string[] = []
      if (dist < spread * 0.25) tries.push(`${town} Central`)
      const k = directionIndex(infos[d].x - cx, infos[d].y - cy)
      // preferred sector first, then its neighbours
      for (const off of [0, 1, -1, 2, -2]) tries.push(`${town} ${DIRECTIONS[(k + off + 8) % 8]}`)
      tries.push(`${town} Central`)
      const pick = tries.find((t) => !used.has(t))
      if (pick) { names[d] = pick; used.add(pick) }
    }
  }

  // anything still unnamed (or clashing): neighbourhood-based alternatives
  requests.forEach((_, d) => {
    if (names[d] !== null) return
    let name = alternatives(infos[d]).find((t) => !used.has(t))
    // practically unreachable: combine every neighbourhood with every descriptor
    for (const h of infos[d].hoods) for (const x of DESCRIPTORS) if (!name && !used.has(`${h} ${x}`)) name = `${h} ${x}`
    name ??= `${infos[d].towns[0] ?? 'Singapore'} ${infos[d].hoods.join('-')}`
    names[d] = name
    used.add(name)
  })
  return names as string[]
}
