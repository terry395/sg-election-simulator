import { BASE_YEAR, BASELINE, type PopulationPolicy } from '../data/demographics'

export const END_YEAR = 2050
/** the planning phases: five-year terms ending in these years */
export const PHASES = [
  { id: 0, label: '2026–30', end: 2030 },
  { id: 1, label: '2031–35', end: 2035 },
  { id: 2, label: '2036–40', end: 2040 },
  { id: 3, label: '2041–45', end: 2045 },
  { id: 4, label: '2046–50', end: 2050 },
] as const
export type PhaseId = 0 | 1 | 2 | 3 | 4

export interface YearPop {
  year: number
  /** residents by five-year age group (0–4 … 90+) */
  groups: number[]
  residents: number
  nonResidents: number
  total: number
  births: number
  deaths: number
  /** 0–4, 5–19, 20–64, 65+ */
  bands: [number, number, number, number]
  medianAge: number
  /** residents aged 20–64 per resident aged 65+ */
  supportRatio: number
  householdSize: number
  households: number
  labourForce: number
}

/** age profile of new residents from immigration (per five-year group, sums to 1) */
const MIGRANT_AGES = [0.05, 0.05, 0.04, 0.04, 0.12, 0.2, 0.2, 0.14, 0.08, 0.04, 0.02, 0.01, 0.01, 0, 0, 0, 0, 0, 0]
const GOMPERTZ_B = 0.095

/** annual death rate at an age for a Gompertz level */
const mortality = (a: number, level: number) => Math.min(0.6, (a < 1 ? 0.0018 : 0.00012) + level * Math.exp(GOMPERTZ_B * a))

/** period life expectancy at birth for a Gompertz level */
function lifeExpectancy(level: number) {
  let alive = 1, e = 0
  for (let a = 0; a < 115; a++) {
    const q = mortality(a + 0.5, level)
    e += alive * (1 - q / 2)
    alive *= 1 - q
  }
  return e
}

/** Gompertz level that gives a life expectancy (bisection) */
export function levelFor(e0: number) {
  let lo = 1e-7, hi = 1e-3
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi)
    if (lifeExpectancy(mid) > e0) lo = mid
    else hi = mid
  }
  return Math.sqrt(lo * hi)
}

function median(groups: number[]) {
  const total = groups.reduce((a, b) => a + b, 0)
  let acc = 0
  for (let i = 0; i < groups.length; i++) {
    if (acc + groups[i] >= total / 2) return i * 5 + (5 * (total / 2 - acc)) / Math.max(1, groups[i])
    acc += groups[i]
  }
  return 90
}

/** household size drifts down as the population ages and families shrink */
export const householdSize = (year: number) => BASELINE.householdSize - 0.01 * (year - BASE_YEAR)

function summarise(year: number, groups: number[], nonResidents: number, births: number, deaths: number): YearPop {
  const sum = (a: number, b: number) => groups.slice(a, b).reduce((s, v) => s + v, 0)
  const bands: [number, number, number, number] = [groups[0], sum(1, 4), sum(4, 13), sum(13, 19)]
  const residents = bands[0] + bands[1] + bands[2] + bands[3]
  const hh = householdSize(year)
  return {
    year, groups: groups.slice(), residents, nonResidents, total: residents + nonResidents, births, deaths, bands,
    medianAge: median(groups),
    supportRatio: bands[2] / Math.max(1, bands[3]),
    householdSize: hh,
    households: residents / hh,
    // residents 20–64 mostly work, a third of 65+ do, and most non-residents are here to work
    labourForce: bands[2] * 0.82 + groups[3] * 0.3 + bands[3] * 0.3 + nonResidents * 0.8,
  }
}

/**
 * Cohort-component projection of residents, one year at a time in five-year age groups:
 * survival, ageing (a fifth of each group moves up a year), births from women aged 15–49, and immigration.
 * Non-residents follow a growth rate.
 */
export function project(age2026: number[], female2026: number[], policy: PopulationPolicy): YearPop[] {
  const femaleShare = female2026.map((f, i) => f / Math.max(1, age2026[i]))
  let groups = age2026.slice()
  let nonRes = BASELINE.nonResidents
  const out: YearPop[] = [summarise(BASE_YEAR, groups, nonRes, 0, 0)]
  const levelStart = levelFor(BASELINE.lifeExpectancy)
  const levelEnd = levelFor(policy.lifeExpectancy)
  for (let year = BASE_YEAR + 1; year <= END_YEAR; year++) {
    const t = (year - BASE_YEAR) / (END_YEAR - BASE_YEAR)
    const level = levelStart * Math.pow(levelEnd / levelStart, t)
    // fertility moves from today's rate to the policy rate over five years
    const tfr = BASELINE.tfr + (policy.tfr - BASELINE.tfr) * Math.min(1, (year - BASE_YEAR) / 5)
    let deaths = 0
    const next = new Array(groups.length).fill(0)
    for (let i = 0; i < groups.length; i++) {
      const d = groups[i] * mortality(i * 5 + 2.5, level)
      deaths += d
      const alive = groups[i] - d
      const up = i < groups.length - 1 ? alive / 5 : 0
      next[i] += alive - up
      if (up) next[i + 1] += up
    }
    let women = 0
    for (let i = 3; i <= 9; i++) women += groups[i] * femaleShare[i]
    const births = (tfr / 35) * women
    next[0] += births
    for (let i = 0; i < next.length; i++) next[i] += policy.netMigration * MIGRANT_AGES[i]
    nonRes *= 1 + policy.nonResidentGrowth / 100
    groups = next
    out.push(summarise(year, groups, nonRes, births, deaths))
  }
  return out
}

export const atYear = (proj: YearPop[], year: number) => proj[Math.min(proj.length - 1, Math.max(0, year - BASE_YEAR))]
