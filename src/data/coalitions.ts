/**
 * Party records used by the coalition builder. Neutral, verifiable facts only,
 * drawn from the same sources as partyInfo.ts (party websites, Wikipedia party
 * articles, Elections Department results). Scores built on these are illustrative.
 */

/** Left–right position (−2 left … +2 right), from the wording in PARTY_INFO[p].position. */
export const AXIS: Record<string, number> = {
  PAP: 1,
  WP: -1,
  PSP: -0.5,
  SDP: -1,
  RDU: -1,
  SDA: 0,
  SPP: 0,
  PAR: 0,
  SUP: 0,
  PPP: 1,
  NSP: 0,
  IND: 0,
}

export const axisOf = (p: string) => AXIS[p] ?? 0

export const leanLabel = (x: number) =>
  x <= -1.25 ? 'left' : x <= -0.4 ? 'centre-left' : x < 0.4 ? 'centrist' : x < 1.25 ? 'centre-right' : 'right'

/** Governing record: shown when the party leads or joins a coalition. */
export const GOVERNING_RECORD: Record<string, string> = {
  PAP: 'Has governed alone since 1959 and has never needed a coalition partner.',
  WP: 'The only opposition party with elected MPs today; it presents itself as a check and balance in Parliament rather than a government-in-waiting.',
}

export interface PairRecord {
  a: string
  b: string
  /** score effect, in points */
  effect: number
  note: string
}

/** Documented links between parties. Order of a/b does not matter. */
export const PAIR_RECORDS: PairRecord[] = [
  { a: 'SDP', b: 'SPP', effect: -6, note: 'SPP was formed in 1994 as a breakaway from SDP, after Chiam See Tong left.' },
  { a: 'PSP', b: 'RDU', effect: -4, note: 'RDU was founded in 2020 by former PSP members.' },
  { a: 'SPP', b: 'SDA', effect: 5, note: 'SPP was part of the Singapore Democratic Alliance from 2001 until 2011.' },
  { a: 'NSP', b: 'SDA', effect: 3, note: 'NSP was a founding member of the Singapore Democratic Alliance in 2001.' },
  { a: 'PAP', b: 'PSP', effect: 3, note: 'PSP was founded by Tan Cheng Bock, a former PAP MP.' },
  { a: 'PPP', b: 'WP', effect: 2, note: "PPP's founder Goh Meng Seng was formerly a WP member." },
  { a: 'PPP', b: 'NSP', effect: 2, note: "PPP's founder Goh Meng Seng previously led NSP." },
]

export function pairRecord(a: string, b: string) {
  return PAIR_RECORDS.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))
}

export const COALITION_HISTORY =
  'Singapore last had a coalition government in 1955–59, led by the Labour Front under David Marshall and then Lim Yew Hock. The PAP has governed alone ever since.'

export const OPPOSITION_TALKS_NOTE = 'Opposition parties have held talks before recent elections to avoid three-cornered fights.'

export const GRAND_COALITION_NOTE =
  'The PAP and the opposition have been rivals for decades; a grand coalition would be unprecedented, though the PAP could offer the stability of an experienced government.'
