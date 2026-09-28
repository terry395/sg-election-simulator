import type { Plan, Year } from '../../types'

export type Method = 'ebrc' | 'compact' | 'custom' | 'gerrymander'
export type GerryGoal = 'pap' | 'opposition' | 'competitive'
export type GrcSize = 4 | 5 | 'mixed'

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
  ms: number
}

export interface RedistrictResult {
  plan: Plan
  report: RedistrictReport
}

export type Progress = (fraction: number, label: string) => void
