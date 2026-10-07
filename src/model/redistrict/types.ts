import type { Plan, Year } from '../../types'

export type Method = 'ebrc' | 'compact' | 'custom' | 'gerrymander'
export type GerryGoal = 'pap' | 'opposition' | 'competitive'
export type GrcSize = 4 | 5 | 'mixed'
/** how EBRC mode treats opposition-held constituencies: keep as-is, small changes only, or redraw freely */
export type OppMode = 'lock' | 'minor' | 'free'

export interface RedistrictOptions {
  method: Method
  year: Year
  /** allowed deviation of electors per MP from the national average, e.g. 0.1 = ±10% */
  maxDeviation: number
  seed: number
  // compact / gerrymander
  totalSeats: number
  smcCount: number
  grcSize: GrcSize
  // custom mix: number of GRCs of each size 3..6
  grcCounts: Record<3 | 4 | 5 | 6, number>
  // ebrc
  startFrom: 'ge2025' | 'current'
  keepNames: boolean
  oppMode: OppMode
  /** auto = re-apportion seats among existing ones; choose = exact SMC count and GRCs by size (smcCount, grcCounts) */
  ebrcMix: 'auto' | 'choose'
  // gerrymander
  goal: GerryGoal
}

export interface DistrictSpec {
  type: 'SMC' | 'GRC'
  seats: number
  /** existing constituency this district continues (EBRC mode) */
  baseId?: string
  name?: string
  color?: string
  /** opposition-held seat that keeps its exact boundaries */
  locked?: boolean
  /** opposition-held seat that may only change a little */
  opp?: boolean
}

export interface RedistrictReport {
  seats: number
  smc: number
  grc: number
  maxDeviation: number
  meanDeviation: number
  /** extra constituencies per town (planning area) beyond one */
  townSplits: number
  /** share of electors who stay with a constituency of the same name as in GE2025 */
  keptShare: number
  /** notional seats at GE2025 vote shares (no swing) */
  papSeats: number
  oppSeats: number
  /** seats where the notional GE2025 result is within 5 points of 50-50 */
  competitiveSeats: number
  /** opposition-held seats that were kept or protected (EBRC mode) */
  protected: string[]
  /** explains when protected seats did not fit the requested mix */
  mixNote?: string
  ms: number
}

export interface RedistrictResult {
  plan: Plan
  report: RedistrictReport
}

export type Progress = (fraction: number, label: string) => void
