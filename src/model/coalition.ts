import type { Contest, Swings } from '../types'
import { PAP } from '../data/parties'
import { PARTY_INFO } from '../data/partyInfo'
import { GOVERNING_RECORD, GRAND_COALITION_NOTE, OPPOSITION_TALKS_NOTE, axisOf, leanLabel, pairRecord } from '../data/coalitions'

export type Band = 'Likely' | 'Plausible' | 'Difficult' | 'Unlikely'

export interface Factor { label: string; effect: number; note: string }

export interface CoalitionAssessment {
  members: string[]
  /** largest member, who would most likely provide the Prime Minister */
  lead: string
  seats: number
  total: number
  majorityNeeded: number
  surplus: number
  viable: boolean
  /** true if removing any single member would lose the majority */
  minimal: boolean
  voteShare: number
  lean: string
  score: number
  band: Band
  factors: Factor[]
  description: string
}

export interface CoalitionInput {
  seatsByParty: Record<string, number>
  votesByParty: Record<string, number>
  totalValid: number
  total: number
  contests: Record<string, Contest>
  /** display names, for the description */
  names?: Record<string, string>
}

/** Forecast preset that leaves no party with a majority on the GE2025 map (checked in coalition.test.ts). */
export const HUNG_SCENARIO: Partial<Swings> = { national: -18, party: { PSP: 4, SDP: 4 } }

export const majorityOf =(total: number) => Math.floor(total / 2) + 1

export const isHung = (seatsByParty: Record<string, number>, total: number) =>
  total > 0 && Math.max(0, ...Object.values(seatsByParty)) < majorityOf(total)

export const bandOf = (score: number): Band => (score >= 70 ? 'Likely' : score >= 50 ? 'Plausible' : score >= 30 ? 'Difficult' : 'Unlikely')

export const coalitionName = (members: string[]) => members.join('–')

const THEME_KEYWORDS: [RegExp, string][] = [
  [/cost of living|gst|fees|taxes/i, 'the cost of living'],
  [/check|transparen|accountab|open and/i, 'checks, balances and transparency'],
  [/social|welfare|safety net|healthcare|retirement|cpf/i, 'social support and healthcare'],
  [/jobs|workers|minimum wage/i, 'jobs and wages'],
  [/reform|constitution|civil liberties/i, 'political reform'],
]

function sharedThemes(members: string[]) {
  const out: { label: string; n: number }[] = []
  for (const [re, label] of THEME_KEYWORDS) {
    const n = members.filter((p) => PARTY_INFO[p]?.themes.some((t) => re.test(t))).length
    if (n >= 2) out.push({ label, n })
  }
  // the three most widely shared themes
  return out.sort((a, b) => b.n - a.n).slice(0, 3).map((t) => t.label)
}

const sortMembers = (members: string[], seats: Record<string, number>) =>
  [...members].sort((a, b) => (seats[b] ?? 0) - (seats[a] ?? 0) || a.localeCompare(b))

export function assessCoalition(membersIn: string[], input: CoalitionInput): CoalitionAssessment {
  const { seatsByParty, votesByParty, totalValid, total, contests } = input
  const members = sortMembers([...new Set(membersIn)], seatsByParty)
  const seatOf = (p: string) => seatsByParty[p] ?? 0
  const seats = members.reduce((s, p) => s + seatOf(p), 0)
  const majorityNeeded = majorityOf(total)
  const viable = seats >= majorityNeeded
  const minimal = viable && members.every((p) => seats - seatOf(p) < majorityNeeded)
  const surplus = seats - majorityNeeded
  const lead = members[0] ?? ''
  const voteShare = totalValid ? members.reduce((s, p) => s + (votesByParty[p] ?? 0), 0) / totalValid : 0
  const weighted = seats ? members.reduce((s, p) => s + axisOf(p) * seatOf(p), 0) / seats : 0
  const lean = leanLabel(weighted)

  const factors: Factor[] = []
  const add = (label: string, effect: number, note: string) => { if (effect !== 0) factors.push({ label, effect: Math.round(effect), note }) }

  if (members.length >= 2) {
    // ideology
    const axes = members.map(axisOf)
    const spread = Math.max(...axes) - Math.min(...axes)
    if (spread <= 0.5) add('Similar outlook', 6, `The members sit close together politically (${lean}).`)
    else if (spread > 1) add('Ideological distance', -8 * (spread - 1), `The members span ${leanLabel(Math.min(...axes))} to ${leanLabel(Math.max(...axes))} positions.`)

    // size
    if (members.length > 2) add('Many partners', -8 * (members.length - 2), `${members.length} parties must agree on every vote, which makes the government less stable.`)

    // arithmetic
    if (minimal) add('Minimal winning', 10, 'Every member is needed for the majority, so each has a real stake in keeping it together.')
    else if (viable) {
      const spare = members.filter((p) => seats - seatOf(p) >= majorityNeeded)
      add('Oversized', -6 * spare.length, `${spare.join(', ')} could be dropped without losing the majority, reducing ${spare.length > 1 ? 'their' : 'its'} bargaining power.`)
    }
    if (viable && surplus <= 1) add('Wafer-thin majority', -6, `${surplus ? 'Only 1 seat to spare' : `Exactly the ${majorityNeeded} seats needed`}; a single defection or by-election could topple it.`)

    // documented relationships
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const r = pairRecord(members[i], members[j])
      if (r) add(`${members[i]} & ${members[j]}`, r.effect, r.note)
    }

    // PAP involvement
    const hasPap = members.includes(PAP)
    if (hasPap) add('Grand coalition', -25, GRAND_COALITION_NOTE)
    else add('Opposition cooperation', 4, OPPOSITION_TALKS_NOTE)

    // record in this election: clashes on the same ballot
    const cids = Object.values(contests)
    let clashes = 0
    const clashPairs = new Set<string>()
    for (const c of cids) {
      const on = members.filter((p) => c.parties.includes(p))
      if (on.length >= 2) { clashes++; clashPairs.add(on.join(' v ')) }
    }
    if (clashes) add('Fought each other', -4 * Math.min(clashes, 5), `Members stood against each other in ${clashes} constituenc${clashes > 1 ? 'ies' : 'y'} this election (${[...clashPairs].slice(0, 3).join(', ')}).`)
    else if (!hasPap) add('Stood aside for each other', 5, 'No two members competed in the same constituency this election.')
  }

  // governing experience
  const experienced = members.filter((p) => GOVERNING_RECORD[p])
  if (experienced.length) add('Experience in Parliament', 5, experienced.map((p) => `${p}: ${GOVERNING_RECORD[p]}`).join(' '))
  else add('No parliamentary experience', -10, 'None of the members has held an elected seat in recent Parliaments.')

  // mandate
  if (voteShare >= 0.5) add('Popular mandate', 6, `Together the members won ${(voteShare * 100).toFixed(1)}% of the national vote.`)
  else if (voteShare < 0.4) add('Weak mandate', -6, `Together the members won only ${(voteShare * 100).toFixed(1)}% of the national vote.`)

  if (!viable) add('Short of a majority', -20, `${majorityNeeded - seats} more seat${majorityNeeded - seats > 1 ? 's' : ''} needed; it could only govern as a minority with outside support on confidence and budget votes.`)

  // without a majority it cannot govern on its own, so it is never better than "Unlikely"
  const score = Math.max(0, Math.min(viable ? 100 : 25, Math.round(60 + factors.reduce((s, f) => s + f.effect, 0))))
  const band = bandOf(score)
  const name = (p: string) => input.names?.[p] ?? p

  const themes = sharedThemes(members)
  const risks = factors.filter((f) => f.effect < 0).sort((a, b) => a.effect - b.effect).slice(0, 2).map((f) => f.label.toLowerCase())
  const description = members.length === 0 ? 'Select parties to build a coalition.' : [
    members.length === 1
      ? `${name(lead)} governing alone as a minority with ${seats} of ${total} seats.`
      : `A ${lean} ${coalitionName(members)} coalition with ${seats} of ${total} seats (${viable ? `a working majority of ${2 * seats - total}` : `${majorityNeeded - seats} short of a majority`}), led by ${name(lead)}, whose leader would be the likely Prime Minister.`,
    `The members won ${(voteShare * 100).toFixed(1)}% of the national vote between them.`,
    themes.length ? `They share an emphasis on ${themes.join(', ')}.` : '',
    risks.length ? `Main risks: ${risks.join(' and ')}.` : '',
  ].filter(Boolean).join(' ')

  return { members, lead, seats, total, majorityNeeded, surplus, viable, minimal, voteShare, lean, score, band, factors, description }
}

/** Ranks every viable combination of seat-winning parties, preferring minimal winning coalitions. */
export function suggestCoalitions(input: CoalitionInput, limit = 4): CoalitionAssessment[] {
  const parties = Object.entries(input.seatsByParty).filter(([, n]) => n > 0).map(([p]) => p).slice(0, 14)
  const out: CoalitionAssessment[] = []
  for (let mask = 1; mask < 1 << parties.length; mask++) {
    const members = parties.filter((_, i) => mask & (1 << i))
    const seats = members.reduce((s, p) => s + input.seatsByParty[p], 0)
    if (seats < majorityOf(input.total) || members.length < 2) continue
    const a = assessCoalition(members, input)
    if (a.minimal) out.push(a)
  }
  return out.sort((a, b) => b.score - a.score || a.members.length - b.members.length || b.seats - a.seats).slice(0, limit)
}
