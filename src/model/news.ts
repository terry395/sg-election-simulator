import type { Party, Swings } from '../types'
import type { PlanStats } from './stats'
import type { NightEvent } from './timeline'
import type { PartyRow, Report, SeatReport } from './report'
import { DEMO_GROUPS } from './swing'
import { PAP } from '../data/parties'
import { leaderRole } from '../data/candidates'
import { ZH_GROUP, ZH_PARTY, ZH_PEOPLE, zhSeat } from '../data/zh'
import { buildImages, type Mood, type NewsImage } from './newsImages'
import { rng } from './rng'

/**
 * Mock newspaper write-up of a simulated election night, in the style of an English or a Chinese
 * daily. Built from the same Report as the in-app election report, so every figure matches it.
 * It quotes nobody: comment is credited only to unnamed analysts and observers.
 */

export type NewsLang = 'en' | 'zh'

export interface NewsInput {
  report: Report
  events: NightEvent[]
  swings: Swings
  stats: PlanStats
  partyMap: Record<string, Party>
  /** anchor leaders were picked (otherwise the article doesn't name candidates) */
  useLeaders: boolean
  seed: number
  /** polling day */
  date: Date
}

export interface NewsSection { heading?: string; paras: string[] }

export interface NewsArticle {
  lang: NewsLang
  masthead: string
  /** e.g. "GE2030 | Singapore" */
  kicker: string
  headline: string
  standfirst: string
  byline: string
  /** publication date line, the morning after polling day */
  dateline: string
  sections: NewsSection[]
  factbox: { title: string; rows: { label: string; value: string }[] }
  images: NewsImage[]
  /** label for the results table */
  tableTitle: string
  tableHead: [string, string, string, string]
  table: { party: string; name: string; seats: number; share: number; change: number | null }[]
}

type Scenario = 'landslide' | 'reduced' | 'lostTwoThirds' | 'oppWin' | 'hung' | 'coalition'

interface Timed { t: number; seat: SeatReport }

/** Everything both languages need, worked out once. */
interface Facts {
  scenario: Scenario
  r: Report
  lead: string
  gov: string[]
  shareChange: number | null
  others: PartyRow[]
  firstResult: Timed | null
  majorityCall: Timed | null
  lastResult: Timed | null
  recounts: SeatReport[]
  closest: SeatReport | null
  demo: { id: string; label: string; pp: number; top: SeatReport | null }[]
  national: number
  leadersWon: { seat: SeatReport; party: string; name: string; role?: string }[]
  leadersLost: { seat: SeatReport; party: string; name: string; role?: string }[]
  pick: <T>(xs: T[]) => T
}

function gatherFacts(inp: NewsInput): Facts {
  const { report: r, events, swings, stats } = inp
  const s = r.summary
  const random = rng(inp.seed ^ 0x5eed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(random.next() * xs.length)]
  const lead = r.results.parties[0]?.party ?? PAP
  const gov = s.government
  const scenario: Scenario = s.coalition ? 'coalition'
    : s.hung ? 'hung'
    : gov[0] !== PAP ? 'oppWin'
    : !s.supermajority ? 'lostTwoThirds'
    : s.govPrevShare !== null && s.govShare < s.govPrevShare ? 'reduced'
    : 'landslide'

  const byId = new Map(r.seats.map((x) => [x.c.id, x]))
  const results = events.filter((e): e is Extract<NightEvent, { kind: 'result' }> => e.kind === 'result')
  const firstResult = results[0] && byId.get(results[0].cid) ? { t: results[0].t, seat: byId.get(results[0].cid)! } : null
  const last = results.at(-1)
  const lastResult = last && byId.get(last.cid) ? { t: last.t, seat: byId.get(last.cid)! } : null
  // the moment the governing side (or, in a hung result, nobody) passes the majority mark
  let majorityCall: Timed | null = null
  if (!s.hung) {
    const govSet = new Set(s.coalition ? [] : gov)
    let tally = 0
    for (const e of events) {
      if (e.kind !== 'result' && e.kind !== 'walkover') continue
      const seat = byId.get(e.cid)
      if (!seat || !govSet.has(seat.r.winner)) continue
      tally += seat.c.seats
      if (tally >= s.majority) { majorityCall = { t: e.t, seat }; break }
    }
  }
  const contested = r.seats.filter((x) => !x.r.walkover)
  const recounts = contested.filter((x) => x.r.margin < 0.02)
  const closest = r.results.closest[0] ?? null

  const groups = [...DEMO_GROUPS.age.map((g, i) => ({ ...g, key: 'age' as const, i })), ...DEMO_GROUPS.eth.map((g, i) => ({ ...g, key: 'eth' as const, i })), ...DEMO_GROUPS.house.map((g, i) => ({ ...g, key: 'house' as const, i }))]
  const demo = groups
    .filter((g) => swings.demo[g.id])
    .map((g) => {
      const top = r.seats.filter((x) => stats.byId[x.c.id]?.electors && !x.r.walkover).sort((a, b) => stats.byId[b.c.id][g.key][g.i] - stats.byId[a.c.id][g.key][g.i])[0] ?? null
      return { id: g.id, label: g.label, pp: swings.demo[g.id], top }
    })
    .sort((a, b) => Math.abs(b.pp) - Math.abs(a.pp))

  const withRole = (x: { seat: SeatReport; party: string; name: string }) => ({ ...x, role: leaderRole(x.name, x.party) })
  const leadersWon = inp.useLeaders ? r.contests.electedLeaders.map(withRole).filter((x) => x.role) : []
  const leadersLost = inp.useLeaders ? r.contests.defeatedLeaders.map(withRole).filter((x) => x.role) : []

  return {
    scenario, r, lead, gov,
    shareChange: s.govPrevShare !== null ? (s.govShare - s.govPrevShare) * 100 : null,
    others: r.results.parties.filter((p) => !gov.includes(p.party) && (p.seats > 0 || p.share >= 0.01)),
    firstResult, majorityCall, lastResult, recounts, closest, demo,
    national: swings.national,
    leadersWon, leadersLost,
    pick,
  }
}

export function buildNewsArticle(inp: NewsInput, lang: NewsLang): NewsArticle {
  const f = gatherFacts(inp)
  const mood: Mood = f.scenario === 'hung' || f.scenario === 'coalition' ? 'hung' : f.scenario === 'oppWin' ? 'upset' : 'win'
  const images = buildImages({
    mood,
    winnerColor: inp.partyMap[f.gov[0]]?.color ?? '#1e3a9e',
    close: f.recounts.length > 0 || (f.closest !== null && f.closest.r.margin < 0.03),
  })
  const table = f.r.results.parties
    .filter((p) => p.seats > 0 || p.votes > 0)
    .map((p) => ({
      party: p.party,
      name: lang === 'zh' ? zhParty(p.party, inp.partyMap, true) : inp.partyMap[p.party]?.name ?? p.party,
      seats: p.seats,
      share: p.share,
      change: p.prevShare !== null ? (p.share - p.prevShare) * 100 : null,
    }))
  return lang === 'zh' ? writeZh(f, inp, images, table) : writeEn(f, inp, images, table)
}

// ---------------------------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)

/** newspaper style: "62.7 per cent" */
const perCent = (v: number) => `${(v * 100).toFixed(1)} per cent`
const ptsEn = (v: number) => `${Math.abs(v).toFixed(1)} percentage point${Math.abs(v).toFixed(1) === '1.0' ? '' : 's'}`
/** "11.42pm", "1.05am" */
export function clockEn(t: number): string {
  const total = 20 * 60 + Math.round(t)
  const h24 = Math.floor(total / 60) % 24
  const m = total % 60
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}.${String(m).padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`
}
const turnoutEn = (t: number, t0: number) => (perCent(t) === perCent(t0) ? `Turnout was ${perCent(t)}, unchanged from 2025.` : `Turnout was ${perCent(t)}, compared with ${perCent(t0)} in 2025.`)
const listEn = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const nWord = (n: number) => NUM[n] ?? String(n)
/** a number that starts a sentence: "Five", or "A total of 14" */
const numStart = (n: number) => (n < 10 ? cap(nWord(n)) : `A total of ${n}`)
const EN_GROUP: Record<string, string> = {
  a0: 'voters aged 21 to 34', a1: 'voters aged 35 to 49', a2: 'voters aged 50 to 64', a3: 'voters aged 65 and above',
  e0: 'Chinese voters', e1: 'Malay voters', e2: 'Indian voters', e3: 'voters of other races',
  h0: 'residents of one- to three-room HDB flats', h1: 'residents of four-room HDB flats', h2: 'residents of five-room HDB flats and ECs',
  h3: 'condominium and apartment dwellers', h4: 'landed-home owners',
}
/** "Sengkang GRC" from the plain display name used in the report */
const seatName = (name: string, r: Report) => {
  const x = r.seats.find((s) => s.c.name === name)
  return x ? `${x.c.name} ${x.c.type}` : name
}

function writeEn(f: Facts, inp: NewsInput, images: NewsImage[], table: NewsArticle['table']): NewsArticle {
  const { r, pick } = f
  const s = r.summary
  const pm = inp.partyMap
  const seen = new Set<string>()
  /** "the Workers' Party (WP)" the first time, then "the WP" */
  const P = (p: string) => {
    const party = pm[p]
    const article = p === 'RDU' || p === 'IND' || party?.custom ? '' : 'the '
    if (p === 'IND') return 'independent candidates'
    if (seen.has(p) || !party) return `${article}${p}`
    seen.add(p)
    return `${article}${party.name} (${p})`
  }
  const seat = (x: SeatReport) => `${x.c.name} ${x.c.type}`
  const govName = s.coalition ? `the ${s.governmentName} coalition` : P(f.gov[0])
  const govShort = s.coalition ? `the ${s.governmentName} coalition` : `the ${f.gov[0]}`
  const lead = f.lead

  // --- headline & standfirst ----------------------------------------------------------------
  const H: Record<Scenario, string[]> = {
    landslide: [`GE2030: PAP returned to power with a stronger mandate`, `GE2030: PAP wins ${s.govSeats} of ${s.total} seats as vote share rises`],
    reduced: [`GE2030: PAP retains power, but with a smaller share of the vote`, `GE2030: PAP returned with ${s.govSeats} seats as vote share slips`],
    lostTwoThirds: [`GE2030: PAP keeps power but loses two-thirds majority`, `GE2030: PAP returned without a two-thirds majority for the first time in decades`],
    oppWin: [`GE2030: ${lead} wins general election in historic change of government`, `GE2030: Historic night as ${lead} wins ${s.govSeats} seats to form government`],
    hung: [`GE2030: No party wins a majority as Singapore faces a hung Parliament`, `GE2030: Hung Parliament after ${lead} falls ${s.majority - (r.results.parties[0]?.seats ?? 0)} seats short`],
    coalition: [`GE2030: ${s.governmentName} coalition to govern after hung result`, `GE2030: Parties agree on ${s.governmentName} coalition after no one wins a majority`],
  }
  const headline = pick(H[f.scenario])
  const shareLine = f.shareChange !== null ? `${perCent(s.govShare)} of the vote, ${f.shareChange >= 0 ? 'up' : 'down'} ${ptsEn(f.shareChange)} from 2025` : `${perCent(s.govShare)} of the vote`
  const standfirst = f.scenario === 'hung'
    ? `${lead} is the largest party with ${r.results.parties[0]?.seats ?? 0} of ${s.total} seats, short of the ${s.majority} needed to govern alone. Turnout was ${perCent(s.turnout)}.`
    : `${cap(govShort)} won ${s.govSeats} of ${s.total} seats and ${shareLine}. ${s.gains ? `${numStart(s.gains)} constituenc${s.gains === 1 ? 'y' : 'ies'} changed hands.` : 'No constituency changed hands.'}`

  // --- election night -------------------------------------------------------------------------
  const night: string[] = []
  const otherSeats = f.others.filter((p) => p.seats > 0)
  if (f.scenario === 'hung') {
    night.push(`Singapore woke up to a hung Parliament on ${DAYS[nextDay(inp.date).getDay()]} morning after no party won the ${s.majority} seats needed for a majority in the ${s.total}-seat House. ${cap(P(lead))} emerged as the largest party with ${r.results.parties[0]?.seats ?? 0} seats and ${perCent(r.results.parties[0]?.share ?? 0)} of the popular vote.`)
  } else if (f.scenario === 'coalition') {
    night.push(`${cap(govName)} will form Singapore's next government after the general election produced no outright winner. Together, its members hold ${s.govSeats} of the ${s.total} seats in Parliament, ${s.govSeats >= s.majority ? `above the ${s.majority} needed for a majority` : `short of an outright majority`}.`)
  } else if (f.scenario === 'oppWin') {
    night.push(`In a result that redraws Singapore's political landscape, ${P(lead)} won the general election on ${DAYS[inp.date.getDay()]}, taking ${s.govSeats} of the ${s.total} seats and ending the People's Action Party's unbroken run in government since 1959. It won ${shareLine}.`)
  } else {
    const how = f.scenario === 'landslide' ? 'with an increased mandate' : f.scenario === 'reduced' ? 'with a reduced share of the vote' : 'but without the two-thirds majority it has held for decades'
    night.push(`${cap(P(PAP))} has been returned to power ${how}, winning ${s.govSeats} of the ${s.total} seats in Parliament and ${shareLine}.`)
  }
  if (otherSeats.length) {
    night.push(`${cap(listEn(otherSeats.map((p) => `${P(p.party)} won ${p.seats} seat${p.seats === 1 ? '' : 's'}`)))}${f.others.some((p) => p.seats === 0) ? `, while ${listEn(f.others.filter((p) => p.seats === 0).slice(0, 3).map((p) => P(p.party)))} did not win any` : ''}.`)
  }
  const gains = r.results.gains
  if (gains.length) {
    const named = gains.slice(0, 3).map((g) => `${seat(g)} (${g.r.winner} from ${g.holder})`)
    night.push(`${numStart(gains.length)} constituenc${gains.length === 1 ? 'y' : 'ies'}, with ${s.gainMps} MP${s.gainMps === 1 ? '' : 's'}, changed hands compared with how their voters backed parties in 2025, including ${listEn(named)}${gains.length > 3 ? ', among others' : ''}.`)
  }
  if (f.firstResult) {
    const bits = [`The first result, for ${seat(f.firstResult.seat)}, was declared at ${clockEn(f.firstResult.t)}.`]
    if (f.majorityCall) bits.push(`${cap(govShort)} crossed the ${s.majority}-seat mark at ${clockEn(f.majorityCall.t)}, when ${seat(f.majorityCall.seat)} was declared.`)
    if (f.lastResult) bits.push(`The final result, for ${seat(f.lastResult.seat)}, came at ${clockEn(f.lastResult.t)}.`)
    night.push(bits.join(' '))
  }
  const samples = r.results.samples
  if (samples) night.push(`Sample counts released by the Elections Department from about 10.30pm proved a good guide: they pointed to the eventual winner in ${samples.rightLeader} of ${samples.total} contests, and were on average ${samples.avgError.toFixed(1)} percentage points from the final result.`)
  if (f.recounts.length) {
    const rc = f.recounts.slice(0, 2)
    night.push(`${f.recounts.length === 1 ? 'A recount was' : 'Recounts were'} needed in ${listEn(rc.map(seat))}${f.recounts.length > 2 ? ' and elsewhere' : ''}, where the margin between the top two was under 2 percentage points.`)
  } else if (f.closest) {
    night.push(`The tightest contest was in ${seat(f.closest)}, where ${P(f.closest.r.winner)} won with ${perCent(f.closest.r.shares[f.closest.r.winner])} of the vote, a margin of ${ptsEn(f.closest.r.margin * 100)}.`)
  }
  if (s.walkovers) night.push(`${numStart(s.walkovers)} constituenc${s.walkovers === 1 ? 'y was' : 'ies were'} won unopposed on Nomination Day.`)

  // --- campaign -----------------------------------------------------------------------------
  const campaign: string[] = []
  const b = r.boundaries
  if (b.changed) {
    campaign.push(`The election was fought on a redrawn map of ${b.count.constituencies} constituencies, ${b.count.grc} GRCs and ${b.count.smc} SMCs, electing ${b.count.seats} MPs${b.count.seats !== b.count2025.seats ? `, ${b.count.seats > b.count2025.seats ? 'up' : 'down'} from ${b.count2025.seats} in 2025` : ''}. ${b.created ? `${numStart(b.created)} new constituenc${b.created === 1 ? 'y was' : 'ies were'} created, ` : ''}${b.redrawn ? `${nWord(b.redrawn)} ${b.redrawn === 1 ? 'was' : 'were'} redrawn, ` : ''}and about ${Math.round(b.votersMoved / 1000).toLocaleString('en-SG')},000 voters found themselves in a different constituency from 2025.`)
    const fx = Object.entries(b.boundaryEffect).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0]
    if (fx) campaign.push(`On 2025 voting patterns, the new boundaries alone would have ${fx[1] > 0 ? 'given' : 'cost'} ${P(fx[0])} ${Math.abs(fx[1])} seat${Math.abs(fx[1]) === 1 ? '' : 's'}, analysts noted, before any change in how people voted.`)
  } else {
    campaign.push(`The contest was fought on the same boundaries as in 2025, with ${b.count.seats} seats across ${b.count.grc} GRCs and ${b.count.smc} SMCs, so any change in the result reflected how Singaporeans voted rather than where the lines were drawn.`)
  }
  const stood = r.contests.parties.filter((p) => p.party !== PAP && p.stood > 0).sort((a, b2) => b2.mpsStood - a.mpsStood)
  if (stood.length) campaign.push(`${numStart(stood.length)} opposition part${stood.length === 1 ? 'y' : 'ies'} took part. ${cap(listEn(stood.slice(0, 4).map((p) => `${P(p.party)} fielded ${p.mpsStood} candidate${p.mpsStood === 1 ? '' : 's'} in ${p.stood} constituenc${p.stood === 1 ? 'y' : 'ies'}`)))}.`)
  const multi = r.contests.multi
  campaign.push(multi.length
    ? `Most seats saw straight fights, but ${multi.length} ${multi.length === 1 ? 'was' : 'were'} multi-cornered, including ${listEn(multi.slice(0, 3).map(seat))}, where observers had warned that a split opposition vote could help the front runner.`
    : `Opposition parties avoided three-cornered fights, so every contested seat was a straight fight.`)
  if (f.leadersWon.length || f.leadersLost.length) {
    const won = f.leadersWon.filter((x) => x.party !== lead).concat(f.leadersWon.filter((x) => x.party === lead)).slice(0, 3)
    const parts: string[] = []
    if (won.length) parts.push(`Among the party heavyweights returned to Parliament were ${listEn(won.map((x) => `${x.name} (${x.party}) in ${seat(x.seat)}`))}.`)
    if (f.leadersLost.length) parts.push(`${f.leadersLost.length === 1 ? 'The most prominent casualty was' : 'Prominent casualties included'} ${listEn(f.leadersLost.slice(0, 3).map((x) => `${x.name} (${x.party}) in ${seat(x.seat)}`))}.`)
    campaign.push(parts.join(' '))
  }

  // --- voter analysis -----------------------------------------------------------------------
  const analysis: string[] = []
  const nat = r.swings.national.filter((n) => n.prev !== null && n.share > 0.005).sort((a, b2) => b2.share - a.share).slice(0, 4)
  if (nat.length) analysis.push(`Across the island, ${listEn(nat.map((n) => `${P(n.party)} took ${perCent(n.share)} of valid votes (${n.share >= n.prev! ? '+' : '-'}${Math.abs((n.share - n.prev!) * 100).toFixed(1)})`))}. ${turnoutEn(s.turnout, s.turnout2025)}`)
  if (r.swings.avgTotal !== null && Math.abs(r.swings.avgTotal) >= 0.3) analysis.push(`In the seats it contested, the PAP's vote moved by an average of ${ptsEn(r.swings.avgTotal)} ${r.swings.avgTotal > 0 ? 'in its favour' : 'against it'}.`)
  for (const d of f.demo.slice(0, 2)) {
    const who = EN_GROUP[d.id] ?? `${d.label} voters`
    analysis.push(`Analysts pointed to a shift among ${who}, who moved about ${ptsEn(d.pp)} towards ${d.pp > 0 ? 'the PAP' : 'the opposition'}. The effect was most visible where they make up a large share of the electorate${d.top ? `, such as ${seat(d.top)}` : ''}.`)
  }
  const fromPap = r.swings.fromPap[0]
  const toPap = r.swings.toPap[0]
  const big: string[] = []
  if (fromPap) big.push(`the largest swing against the PAP came in ${seat(fromPap)} (${ptsEn(fromPap.totalSwing!)})`)
  if (toPap) big.push(`its strongest gain was in ${seat(toPap)} (${ptsEn(toPap.totalSwing!)})`)
  if (big.length) analysis.push(`${cap(listEn(big))}.`)
  const top = r.results.parties[0]
  if (top && s.total) analysis.push(`${cap(P(top.party))}'s ${top.seats} seats amount to ${Math.round((top.seats / s.total) * 100)} per cent of Parliament, from ${perCent(top.share)} of the vote, a gap that observers attribute to the first-past-the-post system and GRCs, where a team wins or loses as one.`)
  const flips = r.swings.mode === 'surprise' ? r.swings.forecastFlips : []
  if (flips.length === 1) analysis.push(`One seat, ${seat(flips[0])}, went against pre-election expectations.`)
  else if (flips.length) analysis.push(`${numStart(flips.length)} seats went against pre-election expectations, among them ${listEn(flips.slice(0, 3).map(seat))}.`)
  if (r.results.ncmp.length) {
    const ncmpSeats = r.results.ncmp.reduce((n, x) => n + x.seats, 0)
    analysis.push(`With fewer than 12 opposition MPs elected, ${ncmpSeats} Non-Constituency MP seat${ncmpSeats === 1 ? '' : 's'} will be offered to the best-performing losing opposition candidates, who stood in ${listEn([...new Set(r.results.ncmp.map((n) => seatName(n.name, r)))].slice(0, 4))}.`)
  }

  // --- what next ----------------------------------------------------------------------------
  const next: string[] = []
  if (f.scenario === 'hung') next.push(`Attention now turns to talks between the parties. Constitutional experts said the President would invite the MP most likely to command the confidence of a majority of Parliament to form the government, which could require a coalition or a confidence-and-supply arrangement.`)
  else if (f.scenario === 'coalition') next.push(`The coalition partners will have to agree on Cabinet posts and a common programme. Observers said holding together a multi-party government would be a new test for Singapore's political system.`)
  else if (s.supermajority) next.push(`With more than two-thirds of the seats, ${govShort} can amend the Constitution without support from other parties.`)
  else next.push(`Without two-thirds of the seats, ${govShort} will need support from other parties to amend the Constitution, a significant change for the new Parliament.`)
  const lm = r.results.loseMajority
  if (lm.points !== null && !s.hung) next.push(`By one rough measure, a further uniform swing of ${ptsEn(lm.points)} would have cost ${govShort} its majority, with ${seatName(lm.seat!, r)} the tipping-point seat.`)
  next.push(`The new Parliament is expected to convene in the coming months.`)

  const pub = nextDay(inp.date)
  return {
    lang: 'en',
    masthead: 'The Straits Times',
    kicker: 'GE2030 | Singapore',
    headline,
    standfirst,
    byline: 'By our Political Desk',
    dateline: `${DAYS[pub.getDay()]}, ${pub.getDate()} ${MONTHS[pub.getMonth()]} ${pub.getFullYear()}`,
    sections: [
      { paras: night },
      { heading: 'The campaign', paras: campaign },
      { heading: 'How Singapore voted', paras: analysis },
      { heading: 'What happens next', paras: next },
    ],
    factbox: {
      title: 'GE2030 at a glance',
      rows: [
        { label: 'Seats in Parliament', value: String(s.total) },
        { label: 'Needed for a majority', value: String(s.majority) },
        { label: s.coalition ? 'Coalition seats' : `${f.gov[0]} seats`, value: String(s.govSeats) },
        { label: 'Seats that changed hands', value: String(s.gains) },
        { label: 'Turnout', value: perCent(s.turnout) },
        ...(f.closest ? [{ label: 'Closest contest', value: `${seat(f.closest)}, ${(f.closest.r.margin * 100).toFixed(1)} points` }] : []),
      ],
    },
    images,
    tableTitle: 'Results by party',
    tableHead: ['Party', 'Seats', 'Vote share', 'Change vs 2025'],
    table,
  }
}

// ---------------------------------------------------------------------------------------------
// Chinese
// ---------------------------------------------------------------------------------------------

function zhParty(p: string, pm: Record<string, Party>, full = false): string {
  const z = ZH_PARTY[p]
  if (z) return full ? z.full : z.short
  return pm[p]?.name ?? p
}

const pc = (v: number) => `${(v * 100).toFixed(1)}%`
const ptsZh = (v: number) => `${Math.abs(v).toFixed(1)}个百分点`
/** "晚上11时42分", "凌晨1时5分" */
export function clockZh(t: number): string {
  const total = 20 * 60 + Math.round(t)
  const h24 = Math.floor(total / 60) % 24
  const m = total % 60
  const period = h24 < 6 ? '凌晨' : h24 < 12 ? '上午' : h24 < 18 ? '下午' : '晚上'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${period}${h}时${m ? `${m}分` : ''}`
}
/** 123456 → "12万3500" (rounded to the nearest hundred) */
export function wan(n: number): string {
  const v = Math.round(n / 100) * 100
  if (v < 10000) return String(v)
  const w = Math.floor(v / 10000)
  const rest = v % 10000
  return `${w}万${rest ? rest : ''}`
}
const listZh = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join('、')}和${xs.at(-1)}`)
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function writeZh(f: Facts, inp: NewsInput, images: NewsImage[], table: NewsArticle['table']): NewsArticle {
  const { r, pick } = f
  const s = r.summary
  const pm = inp.partyMap
  const seen = new Set<string>()
  /** full name the first time, short name after */
  const P = (p: string) => {
    if (seen.has(p)) return zhParty(p, pm)
    seen.add(p)
    return zhParty(p, pm, true)
  }
  const seat = (x: SeatReport) => zhSeat(x.c.name, x.c.type)
  const person = (name: string) => ZH_PEOPLE[name] ?? name
  const lead = f.lead
  const leadSeats = r.results.parties[0]?.seats ?? 0
  const govShort = s.coalition ? `${s.government.map((p) => zhParty(p, pm)).join('-')}联合政府` : zhParty(f.gov[0], pm)
  const change = f.shareChange !== null ? `，比2025年${f.shareChange >= 0 ? '上升' : '下滑'}${ptsZh(f.shareChange)}` : ''

  const H: Record<Scenario, string[]> = {
    landslide: ['2030年大选：行动党蝉联执政 委托加强', `2030年大选：行动党赢得${s.govSeats}席 得票率回升`],
    reduced: ['2030年大选：行动党蝉联执政 得票率下滑', `2030年大选：行动党赢${s.govSeats}席 继续执政`],
    lostTwoThirds: ['2030年大选：行动党保住政权 失去三分之二多数议席', '2030年大选：行动党蝉联执政 数十年来首次未取得三分之二议席'],
    oppWin: [`2030年大选：${zhParty(lead, pm)}胜选 新加坡政权历史性更替`, `2030年大选：${zhParty(lead, pm)}赢得${s.govSeats}席 将组织新政府`],
    hung: ['2030年大选：无一政党过半 国会悬峙', `2030年大选：${zhParty(lead, pm)}差${s.majority - leadSeats}席过半 出现悬峙国会`],
    coalition: [`2030年大选：${govShort}将上台执政`, `2030年大选：无政党过半 ${govShort}成形`],
  }
  const headline = pick(H[f.scenario])
  const standfirst = f.scenario === 'hung'
    ? `${zhParty(lead, pm)}以${leadSeats}席成为国会最大党，但未达到单独执政所需的${s.majority}席。投票率为${pc(s.turnout)}。`
    : `${govShort}在${s.total}个议席中赢得${s.govSeats}席，得票率${pc(s.govShare)}${change}。${s.gains ? `共有${s.gains}个选区易手。` : '没有选区易手。'}`

  const night: string[] = []
  if (f.scenario === 'hung') night.push(`新加坡大选结果出炉，没有任何政党赢得${s.total}席国会中过半所需的${s.majority}席，国会出现悬峙局面。${P(lead)}以${leadSeats}席及${pc(r.results.parties[0]?.share ?? 0)}的得票率成为最大党。`)
  else if (f.scenario === 'coalition') night.push(`大选未产生单一过半政党，${govShort}将组织下届政府。联合政府成员共拥有${s.total}席中的${s.govSeats}席${s.govSeats >= s.majority ? `，超过过半所需的${s.majority}席` : '，但仍未过半'}。`)
  else if (f.scenario === 'oppWin') night.push(`${P(lead)}在昨天举行的大选中胜出，赢得${s.total}席中的${s.govSeats}席，得票率${pc(s.govShare)}${change}，结束了人民行动党自1959年以来的连续执政，改写新加坡政治版图。`)
  else {
    const how = f.scenario === 'landslide' ? '获得更强的委托' : f.scenario === 'reduced' ? '但得票率有所下滑' : '但失去了长期掌握的三分之二多数议席'
    night.push(`${P(PAP)}在2030年大选中蝉联执政，${how}。该党在${s.total}个议席中赢得${s.govSeats}席，得票率为${pc(s.govShare)}${change}。`)
  }
  const otherSeats = f.others.filter((p) => p.seats > 0)
  if (otherSeats.length) night.push(`${listZh(otherSeats.map((p) => `${P(p.party)}赢得${p.seats}席`))}${f.others.some((p) => p.seats === 0) ? `；${listZh(f.others.filter((p) => p.seats === 0).slice(0, 3).map((p) => P(p.party)))}则未能赢得任何议席` : ''}。`)
  const gains = r.results.gains
  if (gains.length) night.push(`与2025年的投票情况相比，共有${gains.length}个选区（${s.gainMps}个议席）易手，包括${listZh(gains.slice(0, 3).map((g) => `${seat(g)}（${zhParty(g.r.winner, pm)}从${zhParty(g.holder, pm)}手中夺得）`))}${gains.length > 3 ? '等' : ''}。`)
  if (f.firstResult) {
    let t = `第一个选区成绩在${clockZh(f.firstResult.t)}公布，为${seat(f.firstResult.seat)}。`
    if (f.majorityCall) t += `${govShort}在${clockZh(f.majorityCall.t)}${seat(f.majorityCall.seat)}成绩揭晓后，议席越过${s.majority}席的过半门槛。`
    if (f.lastResult) t += `最后一个成绩在${clockZh(f.lastResult.t)}出炉，为${seat(f.lastResult.seat)}。`
    night.push(t)
  }
  const samples = r.results.samples
  if (samples) night.push(`选举局从晚上10时30分左右开始公布抽样点票结果，${samples.total}个竞选选区中，有${samples.rightLeader}个的抽样结果准确预示了最终胜方，与正式成绩平均相差${samples.avgError.toFixed(1)}个百分点。`)
  if (f.recounts.length) night.push(`${listZh(f.recounts.slice(0, 2).map(seat))}${f.recounts.length > 2 ? '等选区' : ''}因前两名的得票差距不到2个百分点而需要重新点票。`)
  else if (f.closest) night.push(`战况最激烈的是${seat(f.closest)}，${zhParty(f.closest.r.winner, pm)}以${pc(f.closest.r.shares[f.closest.r.winner])}的得票率险胜，差距仅${ptsZh(f.closest.r.margin * 100)}。`)
  if (s.walkovers) night.push(`另有${s.walkovers}个选区在提名日无人竞选，自动当选。`)

  const campaign: string[] = []
  const b = r.boundaries
  if (b.changed) {
    campaign.push(`本届大选在重新划分的选区范围下进行，全国共有${b.count.constituencies}个选区，包括${b.count.grc}个集选区和${b.count.smc}个单选区，选出${b.count.seats}名议员${b.count.seats !== b.count2025.seats ? `（2025年为${b.count2025.seats}名）` : ''}。${b.created ? `新设${b.created}个选区，` : ''}${b.redrawn ? `${b.redrawn}个选区范围有所调整，` : ''}约${wan(b.votersMoved)}名选民被划入与2025年不同的选区。`)
    const fx = Object.entries(b.boundaryEffect).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0]
    if (fx) campaign.push(`分析人士指出，若按2025年的投票模式计算，单是选区重划就会让${P(fx[0])}${fx[1] > 0 ? '多得' : '少得'}${Math.abs(fx[1])}席。`)
  } else {
    campaign.push(`本届大选沿用2025年的选区范围，共${b.count.grc}个集选区和${b.count.smc}个单选区，选出${b.count.seats}名议员，因此成绩的变化反映的是选民的投票取向，而非选区划分。`)
  }
  const stood = r.contests.parties.filter((p) => p.party !== PAP && p.stood > 0).sort((a, b2) => b2.mpsStood - a.mpsStood)
  if (stood.length) campaign.push(`共有${stood.length}个反对党参选。${listZh(stood.slice(0, 4).map((p) => `${P(p.party)}在${p.stood}个选区派出${p.mpsStood}名候选人`))}。`)
  const multi = r.contests.multi
  campaign.push(multi.length
    ? `大多数选区是两党对决，但有${multi.length}个选区出现多角战，包括${listZh(multi.slice(0, 3).map(seat))}。观察人士曾指出，反对党选票分散可能对领先的一方有利。`
    : '反对党之间避免了多角战，所有竞选选区都是两党直接对决。')
  if (f.leadersWon.length || f.leadersLost.length) {
    let t = ''
    const won = f.leadersWon.slice(0, 3)
    if (won.length) t += `成功当选的重量级人物包括${listZh(won.map((x) => `${zhParty(x.party, pm)}的${person(x.name)}（${seat(x.seat)}）`))}。`
    if (f.leadersLost.length) t += `${listZh(f.leadersLost.slice(0, 3).map((x) => `${zhParty(x.party, pm)}的${person(x.name)}`))}则在${listZh(f.leadersLost.slice(0, 3).map((x) => seat(x.seat)))}落败。`
    campaign.push(t)
  }

  const analysis: string[] = []
  const nat = r.swings.national.filter((n) => n.prev !== null && n.share > 0.005).sort((a, b2) => b2.share - a.share).slice(0, 4)
  if (nat.length) analysis.push(`从全国得票来看，${listZh(nat.map((n) => `${P(n.party)}获得${pc(n.share)}的有效选票（${n.share >= n.prev! ? '+' : '-'}${Math.abs((n.share - n.prev!) * 100).toFixed(1)}）`))}。${pc(s.turnout) === pc(s.turnout2025) ? `投票率为${pc(s.turnout)}，与2025年持平。` : `投票率为${pc(s.turnout)}，2025年为${pc(s.turnout2025)}。`}`)
  if (r.swings.avgTotal !== null && Math.abs(r.swings.avgTotal) >= 0.3) analysis.push(`在行动党参选的选区，该党得票率平均${r.swings.avgTotal > 0 ? '上升' : '下滑'}${ptsZh(r.swings.avgTotal)}。`)
  for (const d of f.demo.slice(0, 2)) analysis.push(`分析人士认为，${ZH_GROUP[d.id] ?? d.label}的投票取向出现变化，约${ptsZh(d.pp)}转向${d.pp > 0 ? '行动党' : '反对党'}。这在这类选民比例较高的选区尤其明显${d.top ? `，例如${seat(d.top)}` : ''}。`)
  const fromPap = r.swings.fromPap[0]
  const toPap = r.swings.toPap[0]
  const big: string[] = []
  if (fromPap) big.push(`行动党在${seat(fromPap)}的得票率跌幅最大（${ptsZh(fromPap.totalSwing!)}）`)
  if (toPap) big.push(`在${seat(toPap)}的增幅最大（${ptsZh(toPap.totalSwing!)}）`)
  if (big.length) analysis.push(`${big.join('，')}。`)
  const top = r.results.parties[0]
  if (top && s.total) analysis.push(`${P(top.party)}以${pc(top.share)}的得票率赢得国会${Math.round((top.seats / s.total) * 100)}%的议席。观察人士指出，这是简单多数制和集选区制度的特点：集选区团队同进同退，议席比例往往与得票率有落差。`)
  const flips = r.swings.mode === 'surprise' ? r.swings.forecastFlips : []
  if (flips.length === 1) analysis.push(`${seat(flips[0])}的成绩出乎选前预期。`)
  else if (flips.length) analysis.push(`有${flips.length}个选区的成绩出乎选前预期，包括${listZh(flips.slice(0, 3).map(seat))}。`)
  if (r.results.ncmp.length) {
    const n = r.results.ncmp.reduce((a, x) => a + x.seats, 0)
    analysis.push(`由于当选的反对党议员少于12人，将有${n}个非选区议员议席分配给表现最好的落选反对党候选人，来自${listZh([...new Set(r.results.ncmp.map((x) => zhSeatByName(x.name, r)))].slice(0, 4))}。`)
  }

  const next: string[] = []
  if (f.scenario === 'hung') next.push('各党接下来将展开磋商。宪法学者指出，总统将委任最有可能获得国会多数议员信任的议员组织政府，这可能需要组成联合政府或达成信任与供给协议。')
  else if (f.scenario === 'coalition') next.push('联合政府各成员党须就内阁职位和共同施政纲领达成共识。观察人士认为，维系多党政府将是新加坡政治制度的新考验。')
  else if (s.supermajority) next.push(`${govShort}掌握超过三分之二的议席，无须其他政党支持即可修改宪法。`)
  else next.push(`${govShort}未掌握三分之二议席，日后修宪须争取其他政党支持，这是新一届国会的重大变化。`)
  const lm = r.results.loseMajority
  if (lm.points !== null && !s.hung) next.push(`粗略估算，若各选区再出现${ptsZh(lm.points)}的一致摆动，${govShort}就会失去过半议席，关键选区为${zhSeatByName(lm.seat!, r)}。`)
  next.push('新一届国会预计将在未来数月内召开。')

  const pub = nextDay(inp.date)
  return {
    lang: 'zh',
    masthead: '联合早报',
    kicker: '2030年大选 | 新加坡',
    headline,
    standfirst,
    byline: '本报政治组',
    dateline: `${pub.getFullYear()}年${pub.getMonth() + 1}月${pub.getDate()}日 ${WEEK[pub.getDay()]}`,
    sections: [
      { paras: night },
      { heading: '竞选回顾', paras: campaign },
      { heading: '选民投票分析', paras: analysis },
      { heading: '下一步', paras: next },
    ],
    factbox: {
      title: '2030年大选一览',
      rows: [
        { label: '国会议席', value: `${s.total}席` },
        { label: '过半所需', value: `${s.majority}席` },
        { label: s.coalition ? '联合政府议席' : `${zhParty(f.gov[0], pm)}议席`, value: `${s.govSeats}席` },
        { label: '易手选区', value: `${s.gains}个` },
        { label: '投票率', value: pc(s.turnout) },
        ...(f.closest ? [{ label: '最接近的选区', value: `${seat(f.closest)}，差距${(f.closest.r.margin * 100).toFixed(1)}个百分点` }] : []),
      ],
    },
    images,
    tableTitle: '各党成绩',
    tableHead: ['政党', '议席', '得票率', '与2025年相比'],
    table,
  }
}

/** Chinese seat name from a display name used in the report (falls back to the plain name). */
function zhSeatByName(name: string, r: Report): string {
  const x = r.seats.find((s) => s.c.name === name)
  return x ? zhSeat(x.c.name, x.c.type) : name
}
