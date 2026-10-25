/**
 * Latest official population figures, the planner's starting point.
 * Residents by age (19 five-year groups) come with the map data (SingStat, end-June 2026).
 */
export const BASE_YEAR = 2026
export const BASELINE = {
  /** Population in Brief 2026 (NPTD / SingStat, 25 Sep 2026), end-June 2026, thousands → persons */
  total: 6_208_500,
  citizens: 3_684_900,
  prs: 546_600,
  nonResidents: 1_977_000,
  /** resident median age, years (Population Trends 2026) */
  medianAge: 43.6,
  /** share of residents aged 65 and over (Population Trends 2026) */
  seniorShare: 0.195,
  /** resident total fertility rate, 2025 (preliminary) */
  tfr: 0.87,
  /** resident life expectancy at birth, years (SingStat, about 83.5) */
  lifeExpectancy: 83.5,
  /** average resident household size (about 3.0) */
  householdSize: 3.0,
} as const

export const SOURCES = [
  'Population in Brief 2026, National Population and Talent Division and Singapore Department of Statistics (September 2026)',
  'Population Trends 2026, Singapore Department of Statistics',
  'Singapore Residents by Planning Region, Age Group and Sex, end June (SingStat, via data.gov.sg)',
  'Census of Population 2020: residents by subzone, age, ethnic group and dwelling type (SingStat, via data.gov.sg)',
  'URA Master Plan 2019 Land Use and Subzone Boundary layers (via data.gov.sg)',
  'LTA MRT Station Exits (via data.gov.sg)',
]

/** default policy settings for the projection */
export interface PopulationPolicy {
  /** resident total fertility rate from 2027 */
  tfr: number
  /** net new residents (citizens + PRs) a year from immigration */
  netMigration: number
  /** non-resident population growth, % a year */
  nonResidentGrowth: number
  /** life expectancy at birth reached by 2050 */
  lifeExpectancy: number
  /** development budget per 5-year phase, S$ billion */
  budget: number
}
export const DEFAULT_POLICY: PopulationPolicy = { tfr: 0.87, netMigration: 22_000, nonResidentGrowth: 1, lifeExpectancy: 86, budget: 40 }
