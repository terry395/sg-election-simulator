import type { GE2025Data } from '../types'

/**
 * Well-known figures among the GE2025 candidates, with their public role and a suggested
 * "anchor" effect in percentage points. Roles as of September 2026 (after the July 2026
 * Cabinet changes; Pritam Singh ceased to be Leader of the Opposition in January 2026).
 * `match` is a fragment of the name exactly as ELD lists it.
 */
export const NOTABLE: { match: string; name: string; party: string; role: string; bonus: number }[] = [
  // People's Action Party
  { match: 'Lawrence Wong', name: 'Lawrence Wong', party: 'PAP', role: 'Prime Minister & Minister for Finance', bonus: 3 },
  { match: 'Lee Hsien Loong', name: 'Lee Hsien Loong', party: 'PAP', role: 'Senior Minister, former Prime Minister', bonus: 2 },
  { match: 'Gan Kim Yong', name: 'Gan Kim Yong', party: 'PAP', role: 'Deputy Prime Minister', bonus: 2 },
  { match: 'K. Shanmugam', name: 'K. Shanmugam', party: 'PAP', role: 'Senior Minister; Minister for Home Affairs', bonus: 2 },
  { match: 'Chan Chun Sing', name: 'Chan Chun Sing', party: 'PAP', role: 'Coordinating Minister for Public Services; Minister for Defence', bonus: 1.5 },
  { match: 'Ong Ye Kung', name: 'Ong Ye Kung', party: 'PAP', role: 'Coordinating Minister for Social Policies; Minister for Health', bonus: 1.5 },
  { match: 'Vivian Balakrishnan', name: 'Vivian Balakrishnan', party: 'PAP', role: 'Minister for Foreign Affairs', bonus: 1.5 },
  { match: 'Grace Fu', name: 'Grace Fu', party: 'PAP', role: 'Minister for Sustainability and the Environment', bonus: 1.5 },
  { match: 'Masagos Zulkifli', name: 'Masagos Zulkifli', party: 'PAP', role: 'Minister for Social and Family Development', bonus: 1.5 },
  { match: 'Josephine Teo', name: 'Josephine Teo', party: 'PAP', role: 'Minister for Digital Development and Information', bonus: 1.5 },
  { match: 'Desmond Lee', name: 'Desmond Lee', party: 'PAP', role: 'Minister for Education', bonus: 1.5 },
  { match: 'Indranee Rajah', name: 'Indranee Rajah', party: 'PAP', role: "Minister in the Prime Minister's Office", bonus: 1.5 },
  { match: 'Tong Chun Fai', name: 'Edwin Tong', party: 'PAP', role: 'Minister for Law', bonus: 1.5 },
  { match: 'Tan See Leng', name: 'Tan See Leng', party: 'PAP', role: 'Cabinet minister (energy and industry)', bonus: 1.5 },
  { match: 'Chee Hong Tat', name: 'Chee Hong Tat', party: 'PAP', role: 'Minister for National Development', bonus: 1.5 },
  { match: 'Ng Chee Meng', name: 'Ng Chee Meng', party: 'PAP', role: "Minister in the Prime Minister's Office", bonus: 1.5 },
  { match: 'Jeffrey Siow', name: 'Jeffrey Siow', party: 'PAP', role: 'Minister for Transport', bonus: 1.5 },
  { match: 'David Neo', name: 'David Neo', party: 'PAP', role: 'Minister for Culture, Community and Youth', bonus: 1.5 },
  { match: 'Sim Ann', name: 'Sim Ann', party: 'PAP', role: 'Second Minister for Foreign Affairs and Home Affairs', bonus: 1.5 },
  { match: 'Zaqy Mohamad', name: 'Zaqy Mohamad', party: 'PAP', role: 'Acting Minister-in-charge of Muslim Affairs', bonus: 1 },
  { match: 'Jasmin Lau', name: 'Jasmin Lau', party: 'PAP', role: 'Acting Minister for Manpower', bonus: 1 },
  { match: 'Seah Kian Peng', name: 'Seah Kian Peng', party: 'PAP', role: 'Speaker of Parliament', bonus: 1 },
  // Workers' Party
  { match: 'Pritam Singh', name: 'Pritam Singh', party: 'WP', role: 'WP Secretary-General', bonus: 2 },
  { match: 'Sylvia Lim', name: 'Sylvia Lim', party: 'WP', role: 'WP Chair, MP for Aljunied', bonus: 1.5 },
  { match: 'Gerald Giam', name: 'Gerald Giam', party: 'WP', role: 'MP for Aljunied', bonus: 1 },
  { match: 'He Ting Ru', name: 'He Ting Ru', party: 'WP', role: 'MP for Sengkang', bonus: 1 },
  { match: 'Jamus Jerome Lim', name: 'Jamus Lim', party: 'WP', role: 'MP for Sengkang', bonus: 1 },
  { match: 'Chua Kheng Wee Louis', name: 'Louis Chua', party: 'WP', role: 'MP for Sengkang', bonus: 1 },
  { match: 'Dennis Tan', name: 'Dennis Tan', party: 'WP', role: 'MP for Hougang', bonus: 1 },
  // Progress Singapore Party
  { match: 'Tan Cheng Bock', name: 'Tan Cheng Bock', party: 'PSP', role: 'PSP founder, former PAP MP', bonus: 2 },
  { match: 'Leong Mun Wai', name: 'Leong Mun Wai', party: 'PSP', role: 'PSP Secretary-General', bonus: 1.5 },
  { match: 'Hazel Poa', name: 'Hazel Poa', party: 'PSP', role: 'Former Non-Constituency MP', bonus: 1 },
  // Singapore Democratic Party
  { match: 'Chee Soon Juan', name: 'Chee Soon Juan', party: 'SDP', role: 'SDP Secretary-General', bonus: 2 },
  { match: 'Paul Anantharajah Tambyah', name: 'Paul Tambyah', party: 'SDP', role: 'SDP Chairman', bonus: 1.5 },
  // other parties
  { match: 'Ravi Philemon', name: 'Ravi Philemon', party: 'RDU', role: 'RDU Secretary-General', bonus: 1 },
  { match: 'Steve Chia', name: 'Steve Chia', party: 'SPP', role: 'SPP Secretary-General', bonus: 1 },
  { match: 'Lim Tean', name: 'Lim Tean', party: 'PAR', role: 'PAR Secretary-General', bonus: 1 },
  { match: 'Lim Bak Chuan Desmond', name: 'Desmond Lim', party: 'SDA', role: 'SDA Chairman', bonus: 1 },
  { match: 'Goh Meng Seng', name: 'Goh Meng Seng', party: 'PPP', role: 'PPP founder', bonus: 1 },
  { match: 'Zhu Laicheng', name: 'Andy Zhu', party: 'SUP', role: 'SUP Secretary-General', bonus: 1 },
  { match: 'Ng Chung Hon', name: 'Spencer Ng', party: 'NSP', role: 'NSP Secretary-General', bonus: 1 },
]

export interface Candidate {
  /** display name (common form for well-known figures, ELD form otherwise) */
  name: string
  party: string
  /** GE2025 constituency they stood in */
  edId: string
  edName: string
  role?: string
  bonus: number
}

/** ELD lists some names as "Koh Kim Kui, Nathaniel": show them as "Nathaniel Koh Kim Kui" */
const tidy = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim()
  const m = t.match(/^(.+?),\s*(.+)$/)
  return m ? `${m[2]} ${m[1]}` : t
}

function notableFor(raw: string, party: string) {
  return NOTABLE.find((n) => n.party === party && raw.includes(n.match))
}

/** Every GE2025 candidate grouped by party, best-known first. */
export function candidatesByParty(ge: GE2025Data): Record<string, Candidate[]> {
  const out: Record<string, Candidate[]> = {}
  for (const c of ge.constituencies) {
    for (const r of c.result) {
      for (const raw of r.candidates) {
        const n = notableFor(raw, r.party)
        const cand: Candidate = {
          name: n?.name ?? tidy(raw),
          party: r.party,
          edId: c.id,
          edName: c.name.replace(/ (GRC|SMC)$/i, ''),
          role: n?.role,
          bonus: n?.bonus ?? 0,
        }
        ;(out[r.party] ||= []).push(cand)
      }
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.bonus - a.bonus || a.name.localeCompare(b.name))
  return out
}

/** Suggested anchor effect for a name typed or picked by the user (0 for unknown names). */
export function leaderBonus(name: string | undefined, party: string): number {
  if (!name) return 0
  const n = NOTABLE.find((x) => x.party === party && (x.name === name || name.includes(x.match)))
  return n?.bonus ?? 0
}

export function leaderRole(name: string | undefined, party: string): string | undefined {
  if (!name) return undefined
  return NOTABLE.find((x) => x.party === party && (x.name === name || name.includes(x.match)))?.role
}

/** The anchor a party fielded in a GE2025 constituency: its best-known member, else the first listed. */
export function anchor2025(ge: GE2025Data, edId: string, party: string): string | undefined {
  const c = ge.constituencies.find((x) => x.id === edId)
  const r = c?.result.find((x) => x.party === party)
  if (!r || !r.candidates.length) return undefined
  const ranked = r.candidates
    .map((raw) => ({ raw, n: notableFor(raw, party) }))
    .sort((a, b) => (b.n?.bonus ?? 0) - (a.n?.bonus ?? 0))
  return ranked[0].n?.name ?? tidy(ranked[0].raw)
}
