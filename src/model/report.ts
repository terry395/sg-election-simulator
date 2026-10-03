import type { Block, Constituency, Contest, GE2025Data, Party, Swings, Year } from '../types'
import { DEMO_GROUPS, type ElectionResult, type NcmpSeat, type SeatResult } from './swing'
import { electorsOf, type PlanStats } from './stats'
import type { NightEvent } from './timeline'
import type { Issue } from './validation'
import { coalitionName, majorityOf } from './coalition'
import { DEFAULT_PARTIES, PAP } from '../data/parties'

/** The party that held these voters in 2025 (notionally). */
export function notionalHolder(pap0: number, mainOpp: string) {
  return pap0 >= 0.5 ? PAP : mainOpp
}

/** Overlap with a single 2025 constituency needed to call a seat unchanged / redrawn. */
export const UNCHANGED_OVERLAP = 0.98
export const REDRAWN_OVERLAP = 0.6
/** Seats decided by less than this are called close. */
export const CLOSE_MARGIN = 0.05

export type BoundaryStatus = 'unchanged' | 'redrawn' | 'new'

export interface ReportInput {
  plan: Constituency[]
  result: ElectionResult
  /** the no-surprise forecast for the same plan */
  projection: ElectionResult
  events: NightEvent[]
  mode: 'surprise' | 'projection'
  coalition: string[] | null
  stats: PlanStats
  issues: Issue[]
  contests: Record<string, Contest>
  defaults: Record<string, Contest>
  swings: Swings
  parties: Party[]
  ge: GE2025Data
  blocks: Block[]
  year: Year
}

export interface SourceShare { id: string; name: string; share: number }

export interface SeatReport {
  c: Constituency
  r: SeatResult
  forecast: SeatResult
  electors: number
  perMp: number
  deviation: number
  status: BoundaryStatus
  /** the 2025 constituency this seat continues (unchanged or redrawn) */
  basedOn: string | null
  /** where this seat's voters lived in 2025, largest first */
  sources: SourceShare[]
  typeChanged: boolean
  renamed: boolean
  /** notional 2025 holder of these voters */
  holder: string
  /** 2025 winner of the constituency most of these voters came from */
  sourceWinner: string | null
  gain: boolean
  lineup: string[]
  leaders: Record<string, string>
  /** PAP share: notional 2025, forecast, result (null where PAP did not stand or no vote took place) */
  pap0: number | null
  papForecast: number | null
  papResult: number | null
  /** changes in PAP share, in points */
  settingsSwing: number | null
  surprise: number | null
  totalSwing: number | null
  turnout: number
}

export interface OldSeatFate {
  id: string
  name: string
  type: 'SMC' | 'GRC'
  seats: number
  winner: string
  electors: number
  fate: 'kept' | 'redrawn' | 'merged' | 'split'
  /** where this constituency's voters went, largest first */
  into: SourceShare[]
}

export interface PartyRow {
  party: string
  seats: number
  ncmp: number
  votes: number
  share: number
  prevShare: number | null
  /** constituencies and MPs fielded */
  stood: number
  mpsStood: number
  won: number
  /** vote share in the seats it contested */
  shareWhereStood: number | null
  prevShareWhereStood: number | null
}

export interface Tipping {
  /** uniform shift (points) needed for the change, or null if no uniform shift gets there */
  points: number | null
  /** the seat that tips it */
  seat: string | null
}

export interface Report {
  seats: SeatReport[]
  summary: {
    government: string[]
    governmentName: string
    coalition: boolean
    hung: boolean
    total: number
    majority: number
    twoThirds: number
    govSeats: number
    supermajority: boolean
    govShare: number
    govPrevShare: number | null
    gains: number
    gainMps: number
    turnout: number
    turnout2025: number
    contested: number
    walkovers: number
  }
  boundaries: {
    changed: boolean
    count: { constituencies: number; smc: number; grc: number; seats: number; electors: number }
    count2025: { constituencies: number; smc: number; grc: number; seats: number; electors: number }
    unchanged: number
    redrawn: number
    created: number
    oldSeats: OldSeatFate[]
    votersMoved: number
    quota: number
    largest: SeatReport | null
    smallest: SeatReport | null
    beyond: { p10: number; p20: number; p30: number }
    issues: Issue[]
    notionalSeats: Record<string, number>
    actualSeats2025: Record<string, number>
    /** notional − actual 2025 seats */
    boundaryEffect: Record<string, number>
    /** seats whose notional 2025 holder differs from who won most of their voters' 2025 seat */
    notionalFlips: SeatReport[]
  }
  contests: {
    contested: number
    walkovers: SeatReport[]
    straight: number
    multi: SeatReport[]
    parties: PartyRow[]
    electedLeaders: { seat: SeatReport; party: string; name: string }[]
    defeatedLeaders: { seat: SeatReport; party: string; name: string }[]
    stars: { seat: SeatReport; party: string; points: number }[]
    changedLineups: { seat: SeatReport; added: string[]; removed: string[]; otherChanges: boolean }[]
    strengthEdits: { party: string; from: number; to: number }[]
    customParties: string[]
  }
  swings: {
    settings: { label: string; text: string }[]
    mode: 'surprise' | 'projection'
    national: { party: string; share: number; prev: number | null }[]
    avgTotal: number | null
    avgSettings: number | null
    avgSurprise: number | null
    toPap: SeatReport[]
    fromPap: SeatReport[]
    forecastFlips: SeatReport[]
  }
  results: {
    parties: PartyRow[]
    gains: SeatReport[]
    holds: number
    closest: SeatReport[]
    safest: SeatReport[]
    close: SeatReport[]
    ncmp: (NcmpSeat & { name: string })[]
    samples: { total: number; rightLeader: number; withinMargin: number; avgError: number } | null
    loseMajority: Tipping
    gainMajority: Tipping
    twoThirds: Tipping & { direction: 'lose' | 'gain' }
  }
  takeaways: string[]
}

const pts = (v: number) => `${Math.abs(v).toFixed(1)} point${Math.abs(v).toFixed(1) === '1.0' ? '' : 's'}`
const pc = (v: number) => `${(v * 100).toFixed(1)}%`
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`
const stripType = (n: string) => n.replace(/ (GRC|SMC)$/i, '').trim().toLowerCase()
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const listAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

export function winner2025(c: GE2025Data['constituencies'][number]) {
  return c.result[0]?.party ?? PAP
}

export function buildReport(inp: ReportInput): Report {
  const { plan, result, projection, stats, contests, defaults, swings, ge, blocks, year } = inp
  const partyMap = Object.fromEntries(inp.parties.map((p) => [p.id, p]))
  const geById = new Map(ge.constituencies.map((c) => [c.id, c]))
  const total = plan.reduce((s, c) => s + c.seats, 0)
  const majority = majorityOf(total)
  const twoThirds = Math.ceil((total * 2) / 3)
  const forecastById = new Map(projection.seats.map((s) => [s.id, s]))

  // 2025 constituency sizes on the selected register
  const oldElectors: Record<string, number> = {}
  for (const b of blocks) oldElectors[b.ed] = (oldElectors[b.ed] || 0) + electorsOf(b, year)

  // --- per seat ---------------------------------------------------------------
  const seats: SeatReport[] = plan.map((c, i) => {
    const r = result.seats[i]
    const s = stats.byId[c.id]
    const forecast = forecastById.get(c.id) ?? r
    const electors = s?.electors ?? 0
    const src = Object.entries(s?.sources ?? {}).sort((a, b) => b[1] - a[1])
    const sources = src.map(([id, e]) => ({ id, name: geById.get(id)?.name ?? id, share: electors ? e / electors : 0 }))
    let status: BoundaryStatus = 'new'
    let basedOn: string | null = null
    if (src.length) {
      const [id, e] = src[0]
      const overlap = Math.min(e / (electors || 1), e / (oldElectors[id] || 1))
      if (overlap >= UNCHANGED_OVERLAP) status = 'unchanged'
      else if (overlap >= REDRAWN_OVERLAP) status = 'redrawn'
      if (status !== 'new') basedOn = id
    }
    const old = basedOn ? geById.get(basedOn) : undefined
    const mainSrc = src[0] ? geById.get(src[0][0]) : undefined
    const holder = s ? notionalHolder(s.pap0, s.mainOpp) : PAP
    const contest = contests[c.id]
    const papIn = !r.walkover && PAP in r.shares
    const pap0 = papIn && s ? s.pap0 : null
    const papForecast = papIn ? forecast.shares[PAP] ?? null : null
    const papResult = papIn ? r.shares[PAP] : null
    return {
      c, r, forecast, electors,
      perMp: s?.perMp ?? 0,
      deviation: s?.deviation ?? 0,
      status, basedOn, sources,
      typeChanged: !!old && old.type !== c.type,
      renamed: !!old && stripType(old.name) !== stripType(c.name),
      holder,
      sourceWinner: mainSrc ? winner2025(mainSrc) : null,
      gain: !r.walkover && r.winner !== holder,
      lineup: contest?.parties.filter((p) => partyMap[p]) ?? [],
      leaders: contest?.leaders ?? {},
      pap0, papForecast, papResult,
      settingsSwing: pap0 !== null && papForecast !== null ? (papForecast - pap0) * 100 : null,
      surprise: papForecast !== null && papResult !== null ? (papResult - papForecast) * 100 : null,
      totalSwing: pap0 !== null && papResult !== null ? (papResult - pap0) * 100 : null,
      turnout: r.turnout,
    }
  })
  const contestedSeats = seats.filter((s) => !s.r.walkover)

  // --- summary -----------------------------------------------------------------
  const government = inp.coalition ?? [result.government]
  const govSeats = government.reduce((n, p) => n + (result.seatsByParty[p] ?? 0), 0)
  const govVotes = government.reduce((n, p) => n + (result.votesByParty[p] ?? 0), 0)
  const govPrev = government.every((p) => ge.parties[p]) ? government.reduce((n, p) => n + ge.parties[p].national, 0) : null
  const hung = (result.seatsByParty[result.government] ?? 0) < majority
  const gains = contestedSeats.filter((s) => s.gain)
  const electorsContested = contestedSeats.reduce((n, s) => n + s.electors, 0)
  const turnout = electorsContested ? contestedSeats.reduce((n, s) => n + s.turnout * s.electors, 0) / electorsContested : 0
  const ge25Contested = ge.constituencies.filter((c) => c.turnout)
  const turnout2025 = ge25Contested.reduce((n, c) => n + c.turnout! * c.electors, 0) / (ge25Contested.reduce((n, c) => n + c.electors, 0) || 1)
  const summary = {
    government,
    governmentName: inp.coalition ? coalitionName(inp.coalition) : result.government,
    coalition: !!inp.coalition,
    hung,
    total, majority, twoThirds, govSeats,
    supermajority: govSeats >= twoThirds,
    govShare: result.totalValid ? govVotes / result.totalValid : 0,
    govPrevShare: govPrev,
    gains: gains.length,
    gainMps: gains.reduce((n, s) => n + s.c.seats, 0),
    turnout, turnout2025,
    contested: contestedSeats.length,
    walkovers: seats.length - contestedSeats.length,
  }

  // --- boundaries ----------------------------------------------------------------
  const destinations: Record<string, Record<string, number>> = {}
  for (const s of seats) for (const [id, e] of Object.entries(stats.byId[s.c.id]?.sources ?? {})) (destinations[id] ||= {})[s.c.id] = e
  const seatById = new Map(seats.map((s) => [s.c.id, s]))
  const oldSeats: OldSeatFate[] = ge.constituencies.map((o) => {
    const e = oldElectors[o.id] || 0
    const into = Object.entries(destinations[o.id] ?? {}).sort((a, b) => b[1] - a[1])
      .map(([id, v]) => ({ id, name: seatById.get(id)?.c.name ?? id, share: e ? v / e : 0 }))
    const top = into[0] ? seatById.get(into[0].id) : undefined
    let fate: OldSeatFate['fate'] = 'split'
    if (top && top.basedOn === o.id) fate = top.status === 'unchanged' ? 'kept' : 'redrawn'
    else if (into[0] && into[0].share >= REDRAWN_OVERLAP) fate = 'merged'
    return { id: o.id, name: o.name, type: o.type, seats: o.seats, winner: winner2025(o), electors: e, fate, into }
  })
  const votersMoved = seats.reduce((n, s) => n + (s.basedOn ? s.electors - (stats.byId[s.c.id]?.sources[s.basedOn] ?? 0) : s.electors), 0)
  const populated = seats.filter((s) => s.electors > 0)
  const bySize = [...populated].sort((a, b) => b.deviation - a.deviation)
  const notionalSeats: Record<string, number> = {}
  for (const s of seats) notionalSeats[s.holder] = (notionalSeats[s.holder] || 0) + s.c.seats
  const actualSeats2025: Record<string, number> = {}
  for (const c of ge.constituencies) actualSeats2025[winner2025(c)] = (actualSeats2025[winner2025(c)] || 0) + c.seats
  const boundaryEffect: Record<string, number> = {}
  for (const p of new Set([...Object.keys(notionalSeats), ...Object.keys(actualSeats2025)])) {
    const d = (notionalSeats[p] ?? 0) - (actualSeats2025[p] ?? 0)
    if (d) boundaryEffect[p] = d
  }
  const count = (cs: { type: string; seats: number }[], electors: number) => ({
    constituencies: cs.length,
    smc: cs.filter((c) => c.type === 'SMC').length,
    grc: cs.filter((c) => c.type === 'GRC').length,
    seats: cs.reduce((n, c) => n + c.seats, 0),
    electors,
  })
  const boundaries = {
    changed: seats.some((s) => s.status !== 'unchanged' || s.renamed || s.typeChanged) || plan.length !== ge.constituencies.length,
    count: count(plan, stats.assignedElectors),
    count2025: count(ge.constituencies, Object.values(oldElectors).reduce((a, b) => a + b, 0)),
    unchanged: seats.filter((s) => s.status === 'unchanged').length,
    redrawn: seats.filter((s) => s.status === 'redrawn').length,
    created: seats.filter((s) => s.status === 'new').length,
    oldSeats,
    votersMoved,
    quota: stats.quota,
    largest: bySize[0] ?? null,
    smallest: bySize.at(-1) ?? null,
    beyond: {
      p10: populated.filter((s) => Math.abs(s.deviation) > 0.1).length,
      p20: populated.filter((s) => Math.abs(s.deviation) > 0.2).length,
      p30: populated.filter((s) => Math.abs(s.deviation) > 0.3).length,
    },
    issues: inp.issues.filter((i) => i.level !== 'info'),
    notionalSeats, actualSeats2025, boundaryEffect,
    notionalFlips: seats.filter((s) => s.sourceWinner && s.holder !== s.sourceWinner),
  }

  // --- parties & contests ---------------------------------------------------------
  const partyIds = [...new Set([...Object.keys(result.votesByParty), ...Object.keys(result.seatsByParty)])]
  const partyRows: PartyRow[] = partyIds.map((p) => {
    const stood = contestedSeats.filter((s) => p in s.r.shares)
    const valid = stood.reduce((n, s) => n + s.r.valid, 0)
    const votes = result.votesByParty[p] ?? 0
    const prev = ge.parties[p]
    return {
      party: p,
      seats: result.seatsByParty[p] ?? 0,
      ncmp: result.ncmp.filter((n) => n.party === p).reduce((n, x) => n + x.seats, 0),
      votes,
      share: result.totalValid ? votes / result.totalValid : 0,
      prevShare: prev ? prev.national : null,
      stood: stood.length,
      mpsStood: stood.reduce((n, s) => n + s.c.seats, 0),
      won: seats.filter((s) => s.r.winner === p).length,
      shareWhereStood: valid ? votes / valid : null,
      prevShareWhereStood: prev ? prev.avgContested : null,
    }
  }).sort((a, b) => b.seats - a.seats || b.votes - a.votes)

  const electedLeaders: Report['contests']['electedLeaders'] = []
  const defeatedLeaders: Report['contests']['defeatedLeaders'] = []
  const stars: Report['contests']['stars'] = []
  const changedLineups: Report['contests']['changedLineups'] = []
  for (const s of seats) {
    for (const [p, name] of Object.entries(s.leaders)) {
      if (!name || !s.lineup.includes(p)) continue
      ;(p === s.r.winner ? electedLeaders : defeatedLeaders).push({ seat: s, party: p, name })
    }
    for (const [p, v] of Object.entries(contests[s.c.id]?.star ?? {})) if (v && s.lineup.includes(p)) stars.push({ seat: s, party: p, points: v })
    const d = defaults[s.c.id]
    const cur = contests[s.c.id]
    if (d && cur) {
      const added = cur.parties.filter((p) => !d.parties.includes(p))
      const removed = d.parties.filter((p) => !cur.parties.includes(p))
      const otherChanges = JSON.stringify(cur.star ?? {}) !== JSON.stringify(d.star ?? {}) || JSON.stringify(cur.leaders ?? {}) !== JSON.stringify(d.leaders ?? {})
      if (added.length || removed.length || otherChanges) changedLineups.push({ seat: s, added, removed, otherChanges })
    }
  }
  const contestsSection = {
    contested: contestedSeats.length,
    walkovers: seats.filter((s) => s.r.walkover),
    straight: contestedSeats.filter((s) => s.lineup.length === 2).length,
    multi: contestedSeats.filter((s) => s.lineup.length > 2),
    parties: partyRows.filter((r) => r.stood > 0 || r.seats > 0),
    electedLeaders, defeatedLeaders, stars, changedLineups,
    strengthEdits: inp.parties.flatMap((p) => {
      const d = DEFAULT_PARTIES.find((x) => x.id === p.id)
      return d && Math.abs(d.strength - p.strength) > 1e-9 ? [{ party: p.id, from: d.strength, to: p.strength }] : []
    }),
    customParties: inp.parties.filter((p) => p.custom).map((p) => p.id),
  }

  // --- swings -----------------------------------------------------------------------
  const settings = describeSettings(swings, inp.mode, seats, stats)
  const withSwing = seats.filter((s) => s.totalSwing !== null)
  const bySwing = [...withSwing].sort((a, b) => b.totalSwing! - a.totalSwing!)
  const swingsSection = {
    settings,
    mode: inp.mode,
    national: partyRows.filter((r) => r.votes > 0).map((r) => ({ party: r.party, share: r.share, prev: r.prevShare })),
    avgTotal: mean(withSwing.map((s) => s.totalSwing!)),
    avgSettings: mean(withSwing.map((s) => s.settingsSwing!)),
    avgSurprise: mean(withSwing.map((s) => s.surprise!)),
    toPap: bySwing.filter((s) => s.totalSwing! > 0).slice(0, 5),
    fromPap: bySwing.filter((s) => s.totalSwing! < 0).reverse().slice(0, 5),
    forecastFlips: contestedSeats.filter((s) => s.forecast.winner !== s.r.winner),
  }

  // --- results ------------------------------------------------------------------------
  const byMargin = [...contestedSeats].sort((a, b) => a.r.margin - b.r.margin)
  const govSet = new Set(government)
  const results = {
    parties: partyRows,
    gains,
    holds: contestedSeats.length - gains.length,
    closest: byMargin.slice(0, 5),
    safest: byMargin.slice(-5).reverse(),
    close: byMargin.filter((s) => s.r.margin < CLOSE_MARGIN),
    ncmp: result.ncmp.map((n) => ({ ...n, name: seatById.get(n.constituency)?.c.name ?? n.constituency })),
    samples: sampleAccuracy(inp.events, seatById),
    loseMajority: govSeats >= majority ? tipLoss(seats, govSet, govSeats - majority + 1) : { points: null, seat: null },
    gainMajority: govSeats < majority ? tipGain(seats, result.government, majority - govSeats) : { points: null, seat: null },
    twoThirds: govSeats >= twoThirds
      ? { ...tipLoss(seats, govSet, govSeats - twoThirds + 1), direction: 'lose' as const }
      : { ...tipGain(seats, government.length === 1 ? government[0] : result.government, twoThirds - govSeats, govSet), direction: 'gain' as const },
  }

  const report: Report = { seats, summary, boundaries, contests: contestsSection, swings: swingsSection, results, takeaways: [] }
  report.takeaways = takeaways(report)
  return report
}

/** Uniform shift away from the governing side that costs it `need` seats (MPs). */
function tipLoss(seats: SeatReport[], gov: Set<string>, need: number): Tipping {
  const held = seats
    .filter((s) => gov.has(s.r.winner) && !s.r.walkover)
    .map((s) => {
      const govShare = Math.max(...Object.entries(s.r.shares).filter(([p]) => gov.has(p)).map(([, v]) => v))
      const other = Math.max(0, ...Object.entries(s.r.shares).filter(([p]) => !gov.has(p)).map(([, v]) => v))
      return { s, points: other > 0 ? ((govShare - other) / 2) * 100 : Infinity }
    })
    .sort((a, b) => a.points - b.points)
  let lost = 0
  for (const h of held) {
    if (!Number.isFinite(h.points)) break
    lost += h.s.c.seats
    if (lost >= need) return { points: h.points, seat: h.s.c.name }
  }
  return { points: null, seat: null }
}

/** Uniform shift towards `party` that wins it `need` more seats (MPs). */
function tipGain(seats: SeatReport[], party: string, need: number, already: Set<string> = new Set([party])): Tipping {
  const targets = seats
    .filter((s) => !s.r.walkover && !already.has(s.r.winner) && party in s.r.shares)
    .map((s) => ({ s, points: ((s.r.shares[s.r.winner] - s.r.shares[party]) / 2) * 100 }))
    .sort((a, b) => a.points - b.points)
  let won = 0
  for (const t of targets) {
    won += t.s.c.seats
    if (won >= need) return { points: t.points, seat: t.s.c.name }
  }
  return { points: null, seat: null }
}

function sampleAccuracy(events: NightEvent[], seatById: Map<string, SeatReport>): Report['results']['samples'] {
  let total = 0
  let rightLeader = 0
  let withinMargin = 0
  const errors: number[] = []
  for (const e of events) {
    if (e.kind !== 'sample') continue
    const s = seatById.get(e.cid)
    if (!s) continue
    total++
    const leader = Object.entries(e.shares).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (leader === s.r.winner) rightLeader++
    const err = Math.max(...Object.keys(s.r.shares).map((p) => Math.abs((e.shares[p] ?? 0) - s.r.shares[p])))
    errors.push(err * 100)
    if (err <= 0.04) withinMargin++
  }
  return total ? { total, rightLeader, withinMargin, avgError: mean(errors)! } : null
}

const towards = (pp: number, to: string, from: string) => `${pts(pp)} towards ${pp >= 0 ? to : from}`

function describeSettings(sw: Swings, mode: ReportInput['mode'], seats: SeatReport[], stats: PlanStats): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = []
  if (sw.national) out.push({
    label: 'National mood',
    text: `${towards(sw.national, 'PAP', 'the opposition')} everywhere. In every constituency, about ${Math.abs(sw.national).toFixed(1)} in every 100 voters were assumed to switch ${sw.national >= 0 ? 'to PAP from the opposition' : 'from PAP to the opposition'}.`,
  })
  for (const [p, v] of Object.entries(sw.party)) if (v) out.push({
    label: `${p} swing`,
    text: `${p} was given ${v > 0 ? 'an extra' : 'a loss of'} ${pts(v)} wherever it stood, taken from ${v > 0 ? 'its opponents' : `${p} and given to its opponents`}.`,
  })
  const groups = [
    ...DEMO_GROUPS.age.map((g, i) => ({ ...g, key: 'age' as const, i, kind: 'voters aged' })),
    ...DEMO_GROUPS.eth.map((g, i) => ({ ...g, key: 'eth' as const, i, kind: '' })),
    ...DEMO_GROUPS.house.map((g, i) => ({ ...g, key: 'house' as const, i, kind: 'voters living in' })),
  ]
  for (const g of groups) {
    const v = sw.demo[g.id]
    if (!v) continue
    const top = seats.filter((s) => stats.byId[s.c.id]?.electors).sort((a, b) => stats.byId[b.c.id][g.key][g.i] - stats.byId[a.c.id][g.key][g.i])[0]
    const who = g.kind ? `${g.kind} ${g.label}` : `${g.label} voters`
    out.push({
      label: `Group: ${g.label}`,
      text: `${who[0].toUpperCase()}${who.slice(1)} moved ${towards(v, 'PAP', 'the opposition')}. This matters most where the group is largest, such as ${top ? `${top.c.name} (${pc(stats.byId[top.c.id][g.key][g.i])} of voters)` : 'seats with many of them'}.`,
    })
  }
  const local = Object.entries(sw.local).filter(([, v]) => v)
  if (local.length) {
    const named = local.map(([id, v]) => `${seats.find((s) => s.c.id === id)?.c.name ?? id} (${signed(v)})`)
    out.push({ label: 'Local swings', text: `You adjusted ${plural(local.length, 'constituency', 'constituencies')} by hand: ${listAnd(named.slice(0, 8))}${named.length > 8 ? ' and others' : ''}. Positive numbers favour PAP, negative numbers favour the opposition.` })
  }
  if (sw.turnout) out.push({ label: 'Turnout', text: `Turnout (the share of registered voters who vote) was set ${pts(sw.turnout)} ${sw.turnout > 0 ? 'higher' : 'lower'} than in 2025. This changes how many votes are counted, not who wins.` })
  if (!out.length) out.push({ label: 'No swings', text: 'You left every swing at zero, so voters were assumed to behave as they did in 2025. Any change comes from the boundaries, the line-ups or random surprises.' })
  out.push(mode === 'surprise'
    ? { label: 'Surprises', text: `You chose a realistic night: on top of your settings, the whole country could move by about ±${sw.sigmaNational} points (like a polling error) and each seat by about ±${sw.sigmaLocal} points more.` }
    : { label: 'Surprises', text: 'You chose "Exactly my forecast", so there were no random surprises: every seat matched your forecast.' })
  return out
}

function takeaways(r: Report): string[] {
  const out: string[] = []
  const b = r.boundaries
  const s = r.summary
  const effect = Object.entries(b.boundaryEffect).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
  if (!b.changed) out.push('You kept the GE2025 boundaries, so any change in seats came from how people voted, not from the map.')
  else if (!effect.length && b.count.seats === b.count2025.seats) out.push(`Your boundary changes would not have changed the number of seats any party won if people had voted exactly as in 2025.`)
  else {
    const tally = (m: Record<string, number>) => Object.entries(m).sort((x, y) => y[1] - x[1]).map(([p, n]) => `${p} ${n}`).join(', ')
    out.push(`On 2025 votes, your new map would have given ${tally(b.notionalSeats)}, compared with ${tally(b.actualSeats2025)} on the real 2025 map${b.count.seats !== b.count2025.seats ? ` (your map has ${b.count.seats} seats instead of ${b.count2025.seats})` : ''}. This is the effect of the boundaries alone, before any change in how people voted.`)
  }
  if (b.changed && b.votersMoved > 0) out.push(`${pc(b.votersMoved / (b.count.electors || 1))} of voters (${Math.round(b.votersMoved).toLocaleString('en-SG')}) ended up in a different or newly created constituency.`)

  const gov = r.summary.governmentName
  if (s.govPrevShare !== null) out.push(`${gov}'s share of the national vote went from ${pc(s.govPrevShare)} in 2025 to ${pc(s.govShare)} (${signed((s.govShare - s.govPrevShare) * 100)} points). ${s.gains ? `${plural(s.gains, 'constituency', 'constituencies')} (${plural(s.gainMps, 'MP')}) changed hands compared with who held those voters in 2025.` : 'No constituency changed hands compared with who held those voters in 2025.'}`)

  const top = r.results.parties[0]
  if (top && s.total) {
    const seatShare = top.seats / s.total
    out.push(`${top.party} won ${pc(seatShare)} of the elected seats with ${pc(top.share)} of the votes. In systems where each area elects its own MPs, like Singapore's, seat shares often differ from vote shares, and GRCs (where a whole team wins or loses together) can widen the gap.`)
  }
  const close = r.results.close
  if (close.length) out.push(`${plural(close.length, 'constituency', 'constituencies')} (${plural(close.reduce((n, x) => n + x.c.seats, 0), 'MP')}) were decided by less than ${CLOSE_MARGIN * 100} points. The closest was ${close[0].c.name}, by ${pts(close[0].r.margin * 100)}.`)
  else out.push(`No constituency was decided by less than ${CLOSE_MARGIN * 100} points.`)

  if (r.swings.mode === 'surprise') {
    const f = r.swings.forecastFlips
    out.push(f.length
      ? `The night's random surprises changed the winner in ${plural(f.length, 'constituency', 'constituencies')} compared with your forecast: ${listAnd(f.slice(0, 6).map((x) => `${x.c.name} (${x.r.winner} instead of ${x.forecast.winner})`))}${f.length > 6 ? ' and others' : ''}.`
      : 'The random surprises moved vote shares, but every constituency was won by the party your forecast expected.')
  }
  const lm = r.results.loseMajority
  const gm = r.results.gainMajority
  if (lm.points !== null) out.push(`A further shift of about ${pts(lm.points)} away from ${gov} in every seat would have cost it its majority (the tipping seat would be ${lm.seat}). This is a rough estimate.`)
  else if (gm.points !== null) out.push(`A shift of about ${pts(gm.points)} towards ${r.summary.government.length === 1 ? gov : r.results.parties[0]?.party} in every seat would have given it a majority on its own (the tipping seat would be ${gm.seat}). This is a rough estimate.`)
  return out
}
