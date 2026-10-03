import type { Block, GE2025Data, Plan, Year } from '../types'
import { electorsOf, type PlanStats } from './stats'
import type { Issue, Rules } from './validation'
import { analyseBoundaries, type BoundarySeat, type OldSeatFate } from './report'
import { rng } from './rng'
import { PA_REGION, REGIONS, type Region } from '../data/regions'
import { about, capitalise, fmtInt, listAnd, longDate, numberWord, plural, titleCase } from './text'

/**
 * A mock Electoral Boundaries Review Committee report for the user's map, laid out like the real
 * White Paper: letter, numbered paragraphs, recommendations by region and annexes. It deliberately
 * says nothing about parties or votes, as the real report does not.
 */

export interface EbrcInput {
  plan: Plan
  stats: PlanStats
  issues: Issue[]
  rules: Rules
  ge: GE2025Data
  blocks: Block[]
  year: Year
  date: Date
}

/** A numbered paragraph; `items` are its lettered sub-paragraphs (a), (b)… */
export interface Para { n: number; text: string; items?: string[] }
/** Paragraphs under a heading; `sub` marks a constituency heading inside Detailed Changes. */
export interface EbrcBlock { heading?: string; sub?: boolean; paras: Para[] }
export interface EbrcSection { id: string; title: string; blocks: EbrcBlock[] }

export interface AnnexARow { id: string; name: string; type: 'SMC' | 'GRC'; seats: number; electors: number; perMp: number; deviation: number; status: BoundarySeat['status'] }
export interface AnnexCRow { name: string; type: 'SMC' | 'GRC'; seats: number; outcome: string }
export interface SizeRow { label: string; count: number; mps: number }

export interface EbrcReport {
  dateText: string
  registerLabel: string
  totalElectors: number
  quota: number
  totalMps: number
  letter: string[]
  sections: EbrcSection[]
  /** recommendation summary: SMCs, then GRCs by size */
  sizes: SizeRow[]
  annexA: AnnexARow[]
  annexC: AnnexCRow[]
  /** constituency ids by region, for the annex map insets */
  regions: { region: Region; ids: string[]; changed: boolean }[]
  /** the map still breaks rules: shown as a note rather than hidden */
  caveats: string[]
  changed: boolean
}

export const COMMITTEE = [
  'Secretary to the Prime Minister (Chairman)',
  'Chief Executive, Singapore Land Authority',
  'Chief Executive Officer, Housing & Development Board',
  'Chief Statistician, Department of Statistics',
  'Head, Elections Department',
]

const full = (c: { name: string; type: string }) => `${c.name} ${c.type}`
const seatsWord = (n: number) => `${numberWord(n)}-member GRC`

/** A stable seed from the map, so the same map always reads the same way. */
function hashPlan(plan: Plan) {
  let h = 2166136261
  const s = plan.constituencies.map((c) => `${c.id}:${c.name}:${c.seats}`).join('|') + plan.assign.join(',')
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

interface Transfer { from: string; to: string | null; electors: number; subzones: string[] }

/** Groups blocks that changed hands by (2025 constituency → new constituency), naming their neighbourhoods. */
function transfers(plan: Plan, blocks: Block[], year: Year, basedOn: Map<string, string | null>): Transfer[] {
  const groups = new Map<string, { from: string; to: string | null; electors: number; sz: Map<string, number> }>()
  plan.assign.forEach((to, i) => {
    const b = blocks[i]
    const e = electorsOf(b, year)
    if (e <= 0) return
    // a block stays put when its new constituency continues its 2025 one
    if (to && basedOn.get(to) === b.ed) return
    const key = `${b.ed}>${to}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { from: b.ed, to, electors: 0, sz: new Map() }))
    g.electors += e
    g.sz.set(b.sz, (g.sz.get(b.sz) || 0) + e)
  })
  return [...groups.values()]
    .map((g) => ({ from: g.from, to: g.to, electors: g.electors, subzones: [...g.sz.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => titleCase(s)) }))
    .sort((a, b) => b.electors - a.electors)
}

/** "the Fernvale and Anchorvale areas" (the biggest few neighbourhoods) */
const areas = (subzones: string[]) => {
  const shown = subzones.slice(0, 3)
  return `the ${listAnd(shown)} area${shown.length > 1 ? 's' : ''}${subzones.length > 3 ? ' and nearby' : ''}`
}

export function buildEbrcReport(inp: EbrcInput): EbrcReport {
  const { plan, stats, ge, blocks, year, rules } = inp
  const r = rng(hashPlan(plan))
  const pick = <T,>(xs: T[]) => xs[Math.floor(r.next() * xs.length)]

  const b = analyseBoundaries(plan.constituencies, stats, ge, blocks, year)
  const geById = new Map(ge.constituencies.map((c) => [c.id, c]))
  const newById = new Map(plan.constituencies.map((c) => [c.id, c]))
  const seatById = new Map(b.seats.map((s) => [s.c.id, s]))
  const populated = b.seats.filter((s) => s.electors > 0)
  const totalMps = populated.reduce((n, s) => n + s.c.seats, 0)
  const quota = stats.quota
  const geName = (id: string) => { const o = geById.get(id); return o ? full(o) : id }
  const newName = (id: string | null) => { const c = id ? newById.get(id) : null; return c ? full(c) : 'no constituency' }

  // region of each constituency: where most of its electors live
  const regionVotes: Record<string, Record<string, number>> = {}
  plan.assign.forEach((cid, i) => {
    if (!cid) return
    const reg = PA_REGION[blocks[i].pa] ?? 'Central'
    ;(regionVotes[cid] ||= {})[reg] = (regionVotes[cid][reg] || 0) + electorsOf(blocks[i], year) + 1e-6 * blocks[i].area
  })
  const regionOf = (cid: string): Region => (Object.entries(regionVotes[cid] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] as Region) ?? 'Central'
  const oldRegion: Record<string, Region> = {}
  for (const o of ge.constituencies) {
    const v: Record<string, number> = {}
    for (const bl of blocks) if (bl.ed === o.id) v[PA_REGION[bl.pa] ?? 'Central'] = (v[PA_REGION[bl.pa] ?? 'Central'] || 0) + electorsOf(bl, year) + 1e-6 * bl.area
    oldRegion[o.id] = (Object.entries(v).sort((a, b) => b[1] - a[1])[0]?.[0] as Region) ?? 'Central'
  }

  const moves = transfers(plan, blocks, year, new Map(b.seats.map((s) => [s.c.id, s.basedOn])))
  const fateById = new Map(b.oldSeats.map((o) => [o.id, o]))
  // a 2025 constituency is abolished when no new seat continues it
  const continued = new Set(b.seats.map((s) => s.basedOn).filter(Boolean) as string[])
  const abolished = b.oldSeats.filter((o) => !continued.has(o.id) && o.electors > 0)

  const isChanged = (s: BoundarySeat) => {
    const old = s.basedOn ? geById.get(s.basedOn) : null
    return s.status !== 'unchanged' || s.renamed || s.typeChanged || (!!old && old.seats !== s.c.seats)
  }

  // ---------------------------------------------------------------- numbering
  let n = 0
  const p = (text: string, items?: string[]): Para => ({ n: ++n, text, items })

  // ---------------------------------------------------------------- 1 introduction
  const intro: EbrcSection = {
    id: 'intro', title: 'Introduction',
    blocks: [{ paras: [
      p(`The Electoral Boundaries Review Committee (“the Committee”) was convened to review the boundaries of the electoral divisions ahead of the next General Election, and to recommend the number and boundaries of Single Member Constituencies (SMCs) and Group Representation Constituencies (GRCs).`),
      p(`The Committee comprised the following members:`, COMMITTEE),
    ] }],
  }

  // ---------------------------------------------------------------- 2 terms of reference
  const terms: EbrcSection = {
    id: 'terms', title: 'Terms of Reference',
    blocks: [{ paras: [
      p(`The Committee was asked to:`, [
        `review the existing electoral divisions and recommend the number and boundaries of SMCs and GRCs, taking into account population shifts and housing developments since the last review;`,
        `recommend not fewer than ${numberWord(Math.max(rules.minSMC, 8))} SMCs;`,
        `ensure that every GRC comprises not fewer than ${numberWord(rules.minGRCSeats)} and not more than ${numberWord(rules.maxGRCSeats)} Members of Parliament;`,
        `keep the number of electors per Member of Parliament in each electoral division within ${Math.round(rules.maxDeviation * 100)} per cent of the national average; and`,
        `recommend a total of about ${numberWord(rules.targetSeats)} elected Members of Parliament.`,
      ]),
      p(`Each GRC returns at least one Member of Parliament from the Malay community, or from the Indian or other minority communities, as required by the Constitution and the Parliamentary Elections Act.`),
    ] }],
  }

  // ---------------------------------------------------------------- 3 electors
  const total = stats.assignedElectors
  const total2025 = ge.totalElectors
  const diff = total - total2025
  const growth: string[] = []
  if (year === 2030) {
    const byPa: Record<string, number> = {}
    for (const bl of blocks) byPa[bl.pa] = (byPa[bl.pa] || 0) + (bl.e30 - bl.e25)
    growth.push(...Object.entries(byPa).filter(([, v]) => v > 1500).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([pa]) => titleCase(pa)))
  }
  const oldPerMp = ge.constituencies
    .map((o) => ({ o, dev: (b.oldElectors[o.id] / o.seats) / (b.count2025.electors / b.count2025.seats) - 1 }))
    .sort((a, c) => c.dev - a.dev)
  const crowded = oldPerMp.filter((x) => x.dev > 0.15).slice(0, 4)
  const electorsSec: EbrcSection = {
    id: 'electors', title: 'Number of Electors',
    blocks: [{ paras: [
      p(year === 2030
        ? `The Committee based its review on the projected electorate for 2030, which numbers ${fmtInt(total)} electors. This is ${diff >= 0 ? 'an increase' : 'a decrease'} of ${fmtInt(Math.abs(diff))} (${(Math.abs(diff) / total2025 * 100).toFixed(1)} per cent) over the ${fmtInt(total2025)} electors at the 2025 General Election.`
        : `The Committee based its review on the Registers of Electors used at the 2025 General Election, which list ${fmtInt(total)} electors.`),
      p(`With ${numberWord(totalMps)} elected Members of Parliament, the national average is ${fmtInt(quota)} electors per Member of Parliament. Under the terms of reference, each electoral division should therefore have between ${fmtInt(quota * (1 - rules.maxDeviation))} and ${fmtInt(quota * (1 + rules.maxDeviation))} electors per Member of Parliament.`),
      ...(growth.length ? [p(`The Committee noted ${pick(['significant', 'substantial', 'notable'])} growth in the number of electors in ${listAnd(growth)}, ${pick(['largely due to', 'mainly as a result of', 'reflecting'])} new housing developments in these areas.`)] : []),
      ...(crowded.length ? [p(`On the existing boundaries, the electoral divisions with the most electors per Member of Parliament ${year === 2030 ? 'would be' : 'are'} ${listAnd(crowded.map((x) => `${full(x.o)} (${x.dev >= 0 ? '+' : '−'}${Math.abs(x.dev * 100).toFixed(1)} per cent)`))}.`)] : []),
    ] }],
  }

  // ---------------------------------------------------------------- 4 considerations
  const moved = b.votersMoved
  const considerations: EbrcSection = {
    id: 'considerations', title: 'Considerations',
    blocks: [{ paras: [
      p(`In making its recommendations, the Committee sought to:`, [
        `keep the number of electors per Member of Parliament in each division within the permitted range;`,
        `follow natural and physical features, such as major roads, rivers and expressways, where possible;`,
        `keep towns and housing estates within one electoral division where possible; and`,
        `${pick(['minimise changes to existing boundaries', 'keep changes to existing boundaries to a minimum'])}, so that electors can remain in the divisions they are familiar with.`,
      ]),
      p(b.changed
        ? `Of the ${numberWord(populated.length)} electoral divisions recommended, ${numberWord(b.unchanged)} ${b.unchanged === 1 ? 'is' : 'are'} unchanged, ${numberWord(b.redrawn)} ${b.redrawn === 1 ? 'has' : 'have'} been adjusted, and ${numberWord(b.created)} ${b.created === 1 ? 'is' : 'are'} new. About ${fmtInt(Math.round(moved / 100) * 100)} electors (${(moved / (total || 1) * 100).toFixed(1)} per cent) will vote in a different electoral division from the 2025 General Election.`
        : `The Committee found that the existing electoral divisions remain within the terms of reference, and recommends no change to their boundaries.`),
    ] }],
  }

  // ---------------------------------------------------------------- 5 recommendations
  const smcs = populated.filter((s) => s.c.type === 'SMC')
  const grcs = populated.filter((s) => s.c.type === 'GRC')
  const sizes: SizeRow[] = [{ label: 'Single Member Constituencies', count: smcs.length, mps: smcs.length }]
  for (const k of [3, 4, 5, 6]) {
    const g = grcs.filter((s) => s.c.seats === k)
    if (g.length) sizes.push({ label: `${capitalise(numberWord(k))}-member GRCs`, count: g.length, mps: g.length * k })
  }
  const grcMps = grcs.reduce((x, s) => x + s.c.seats, 0)
  const avgGrc = grcs.length ? grcMps / grcs.length : 0
  const avgGrcOld = b.count2025.grc ? (b.count2025.seats - b.count2025.smc) / b.count2025.grc : 0
  const mpDiff = totalMps - b.count2025.seats
  const caveats: string[] = []
  const errs = inp.issues.filter((i) => i.level === 'error')
  if (errs.length) caveats.push(`This map does not yet meet every rule in the terms of reference: ${listAnd(errs.slice(0, 3).map((e) => e.message.replace(/\.$/, '')))}${errs.length > 3 ? `, and ${plural(errs.length - 3, 'other issue')}` : ''}. The recommendations below describe the map as drawn.`)
  const recs: EbrcSection = {
    id: 'recommendations', title: 'Recommendations',
    blocks: [{ paras: [
      p(`The Committee recommends ${numberWord(populated.length)} electoral divisions: ${plural(smcs.length, 'SMC')} and ${plural(grcs.length, 'GRC')}, returning ${numberWord(totalMps)} Members of Parliament${mpDiff ? `, ${mpDiff > 0 ? 'an increase' : 'a decrease'} of ${numberWord(Math.abs(mpDiff))} from the ${numberWord(b.count2025.seats)} at the 2025 General Election` : `, the same number as at the 2025 General Election`}. The composition is summarised in the table below.`),
      ...(grcs.length ? [p(`The average size of the GRCs is ${avgGrc.toFixed(2)} Members of Parliament, compared with ${avgGrcOld.toFixed(2)} at the 2025 General Election.`)] : []),
      p(`The detailed recommendations for each region are set out in the following paragraphs. The number of electors in each electoral division is at Annex A, maps of the recommended boundaries are at Annex B, and the changes to the 2025 electoral divisions are summarised at Annex C.`),
    ] }],
  }

  // ---------------------------------------------------------------- 6 detailed changes, by region
  const detail: EbrcBlock[] = []
  for (const region of REGIONS) {
    const seats = populated.filter((s) => regionOf(s.c.id) === region).sort((a, c) => a.c.name.localeCompare(c.c.name))
    const changed = seats.filter(isChanged)
    const unchanged = seats.filter((s) => !isChanged(s))
    const gone = abolished.filter((o) => oldRegion[o.id] === region)
    if (!seats.length && !gone.length) continue
    const paras: Para[] = []
    detail.push({ heading: `${region} Region`, paras })

    for (const s of changed) {
      const old = s.basedOn ? geById.get(s.basedOn) : null
      const ins = moves.filter((m) => m.to === s.c.id)
      const outs = old ? moves.filter((m) => m.from === old.id && m.to !== s.c.id) : []
      const items = [
        ...ins.map((m) => `${capitalise(areas(m.subzones))} (${about(m.electors)} electors) ${pick(['will be transferred', 'will move'])} from ${geName(m.from)};`),
        ...outs.map((m) => `${capitalise(areas(m.subzones))} (${about(m.electors)} electors) ${pick(['will be transferred', 'will move'])} to ${newName(m.to)};`),
      ]
      if (items.length) items[items.length - 1] = items[items.length - 1].replace(/;$/, '.')
      const size = `${fmtInt(s.electors)} electors (${fmtInt(s.perMp)} per Member of Parliament)`
      let lead: string
      if (s.status === 'new' || !old) {
        const from = ins.slice(0, 4).map((m) => `${areas(m.subzones)} of ${geName(m.from)}`)
        const rest = ins.length > 4 ? ` and smaller parts of ${listAnd([...new Set(ins.slice(4).map((m) => geName(m.from)))])}` : ''
        lead = `A new ${s.c.type === 'SMC' ? 'SMC' : seatsWord(s.c.seats)}, ${full(s.c)}, ${pick(['will be formed', 'will be created'])} from ${listAnd(from)}${rest}. It will have ${size}.`
        paras.push(p(lead))
        continue
      } else {
        const bits: string[] = []
        if (s.typeChanged) bits.push(s.c.type === 'SMC' ? `become an SMC` : `become a ${seatsWord(s.c.seats)}`)
        else if (old.seats !== s.c.seats) bits.push(`return ${numberWord(s.c.seats)} Members of Parliament instead of ${numberWord(old.seats)}`)
        if (s.renamed) bits.push(`be renamed ${full(s.c)}`)
        lead = `${full(old)} will ${bits.length ? listAnd(bits) : 'be retained'}${items.length ? ', with the following changes' : ''}${items.length ? ':' : '.'}`
        if (!items.length) lead += ` It will have ${size}.`
      }
      paras.push(p(lead, items.length ? items : undefined))
      if (items.length) paras.push(p(`${full(s.c)} will then have ${size}.`))
    }
    for (const o of gone) {
      const into = o.into.filter((x) => x.share >= 0.02)
      paras.push(p(into.length === 1 || o.fate === 'merged'
        ? `${full(o)} will be absorbed into ${into[0] ? newName(into[0].id) : 'neighbouring divisions'}.`
        : `${full(o)} will be dissolved. Its electors will be divided among ${listAnd(into.map((x) => `${newName(x.id)} (${Math.round(x.share * 100)} per cent)`))}.`))
    }
    if (unchanged.length) paras.push(p(`The boundaries of ${listAnd(unchanged.map((s) => full(s.c)))} ${unchanged.length === 1 ? 'remains' : 'remain'} unchanged.`))
  }
  const details: EbrcSection = { id: 'details', title: 'Detailed Recommendations', blocks: detail }

  const closing: EbrcSection = {
    id: 'closing', title: 'Conclusion',
    blocks: [{ paras: [
      p(`The Committee submits its recommendations for the consideration of the Prime Minister.`),
    ] }],
  }

  // ---------------------------------------------------------------- letter
  const letter = [
    `We have completed our review of the boundaries of the electoral divisions, and are pleased to submit our report.`,
    `We recommend ${numberWord(populated.length)} electoral divisions, comprising ${plural(smcs.length, 'Single Member Constituency', 'Single Member Constituencies')} and ${plural(grcs.length, 'Group Representation Constituency', 'Group Representation Constituencies')}, returning a total of ${numberWord(totalMps)} Members of Parliament.`,
    b.changed
      ? `In making our recommendations, we took into account the ${year === 2030 ? 'projected ' : ''}number of electors, population shifts and housing developments. ${capitalise(numberWord(b.unchanged))} electoral division${b.unchanged === 1 ? '' : 's'} ${b.unchanged === 1 ? 'is' : 'are'} unchanged.`
      : `We found that the existing electoral divisions remain within our terms of reference, and recommend that their boundaries be retained.`,
    `We would like to thank the officers of the Elections Department, the Singapore Land Authority, the Housing & Development Board and the Department of Statistics who supported the Committee in its work.`,
  ]

  // ---------------------------------------------------------------- annexes
  const annexA: AnnexARow[] = [...populated]
    .sort((a, c) => (a.c.type === c.c.type ? a.c.name.localeCompare(c.c.name) : a.c.type === 'GRC' ? -1 : 1))
    .map((s) => ({ id: s.c.id, name: full(s.c), type: s.c.type, seats: s.c.seats, electors: s.electors, perMp: s.perMp, deviation: s.deviation, status: s.status }))

  const annexC: AnnexCRow[] = ge.constituencies
    .map((o) => ({ o, f: fateById.get(o.id)!, next: b.seats.find((s) => s.basedOn === o.id) }))
    .filter(({ next, f }) => !next || isChanged(next) || f.fate !== 'kept')
    .map(({ o, f, next }) => ({ name: full(o), type: o.type, seats: o.seats, outcome: outcomeText(f, next, newName) }))
    .sort((a, c) => a.name.localeCompare(c.name))

  const regions = REGIONS.map((region) => {
    const ids = populated.filter((s) => regionOf(s.c.id) === region).map((s) => s.c.id)
    return { region, ids, changed: ids.some((id) => isChanged(seatById.get(id)!)) || abolished.some((o) => oldRegion[o.id] === region) }
  }).filter((x) => x.ids.length)

  return {
    dateText: longDate(inp.date),
    registerLabel: year === 2030 ? 'projected 2030 electorate' : '2025 Registers of Electors',
    totalElectors: total,
    quota,
    totalMps,
    letter,
    sections: [intro, terms, electorsSec, considerations, recs, details, closing],
    sizes,
    annexA,
    annexC,
    regions,
    caveats,
    changed: b.changed,
  }
}

function outcomeText(f: OldSeatFate, next: BoundarySeat | undefined, newName: (id: string | null) => string): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`
  if (next) {
    const bits: string[] = []
    if (next.status === 'redrawn') {
      const out = f.into.filter((x) => x.id !== next.c.id && x.share >= 0.02)
      bits.push(`boundaries adjusted${out.length ? `; part to ${out.map((x) => newName(x.id)).join(', ')}` : ''}`)
    }
    if (next.typeChanged) bits.push(next.c.type === 'SMC' ? 'becomes an SMC' : `becomes a ${next.c.seats}-member GRC`)
    else if (next.c.seats !== f.seats) bits.push(`${f.seats} → ${next.c.seats} MPs`)
    if (next.renamed) bits.push(`renamed ${next.c.name} ${next.c.type}`)
    return capitalise(bits.join('; ') || 'retained')
  }
  const into = f.into.filter((x) => x.share >= 0.02)
  if (f.fate === 'merged' || into.length === 1) return `Absorbed into ${newName(into[0]?.id ?? null)}`
  return `Divided among ${into.map((x) => `${newName(x.id)} (${pct(x.share)})`).join(', ')}`
}

