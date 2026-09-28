export type Year = 2025 | 2030

/** A building block of the map (roughly the size of a polling district). */
export interface Block {
  id: number
  /** GE2025 constituency id */
  ed: string
  /** URA subzone & planning area names */
  sz: string
  pa: string
  /** electors: GE2025 register (calibrated to official totals) and 2030 projection */
  e25: number
  e30: number
  area: number
  /** elector-weighted centroid [lng, lat] */
  c: [number, number]
  /** shares: age 21-34/35-49/50-64/65+ */
  age: number[] | null
  /** shares: Chinese/Malay/Indian/Others */
  eth: number[] | null
  /** shares: HDB 1-3rm / HDB 4rm / HDB 5rm & EC / condo & apt / landed */
  house: number[] | null
  /** notional GE2025 PAP share of valid votes */
  pap: number
  adj: number[]
}

export interface PartyResult {
  party: string
  votes: number
  share: number
  candidates: string[]
}

export interface GE2025Constituency {
  id: string
  name: string
  key: string
  type: 'SMC' | 'GRC'
  seats: number
  electors: number
  walkover: boolean
  turnout: number | null
  result: PartyResult[]
}

export interface GE2025Data {
  asOf: string
  totalElectors: number
  totalElectors2030: number
  seats: number
  constituencies: GE2025Constituency[]
  parties: Record<string, { votes: number; national: number; avgContested: number; contested: number }>
  national2020: Record<string, number>
}

export interface Party {
  id: string
  name: string
  color: string
  /** relative campaign strength used to split the opposition vote (WP = 1) */
  strength: number
  custom?: boolean
}

export interface Constituency {
  id: string
  name: string
  type: 'SMC' | 'GRC'
  seats: number
  color: string
}

export interface Plan {
  constituencies: Constituency[]
  /** block id -> constituency id (or null = unassigned) */
  assign: (string | null)[]
}

export interface Contest {
  parties: string[]
  /** per-party candidate bonus in percentage points (anchor minister, star candidate...) */
  star: Record<string, number>
  /** per-party anchor leader (team leader in a GRC, the candidate in an SMC) */
  leaders?: Record<string, string>
}

export interface Swings {
  /** national swing to PAP in percentage points (negative = to opposition) */
  national: number
  /** per opposition party swing in pp (taken from PAP where both contest) */
  party: Record<string, number>
  /** demographic swings to PAP in pp, keyed by group id */
  demo: Record<string, number>
  /** per-constituency swing to PAP in pp */
  local: Record<string, number>
  /** turnout adjustment in pp */
  turnout: number
  /** uncertainty (pp, 1 s.d.) for nationwide polling error and per-seat noise */
  sigmaNational: number
  sigmaLocal: number
}
