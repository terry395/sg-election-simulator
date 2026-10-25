import type { PlannerData, PlannerRegion } from '../data/loadPlanner'
import { PLANNER_REGIONS } from '../data/loadPlanner'
import { BASE_YEAR, type PopulationPolicy } from '../data/demographics'
import { atYear, PHASES, type PhaseId, type YearPop } from './population'
import { AMEN, CELL_HA, ZONE, isGreen, isIndustry, isVacant, zoneCost, zoneHomes, zoneJobs, type Density, type ZoneId } from './zones'

/** what the plan does to one hexagon in one phase: reclaim it, build on it, or both */
export interface CellAction { r?: 1; z?: ZoneId; d?: Density }
export type PhasePlan = Record<number, CellAction>
/** one entry per phase */
export type NationalPlan = PhasePlan[]
export const emptyPlan = (): NationalPlan => PHASES.map(() => ({}))

/** S$ million per hexagon to reclaim: deeper water needs more sand */
export const reclaimCost = (ring: number) => 30 + 8 * ring
/** phases until reclaimed land can be built on (each phase is five years) */
export const reclaimPhases = (ring: number) => (ring <= 3 ? 1 : ring <= 8 ? 2 : 3)
/** compensation per home acquired for redevelopment (SERS-style), S$ million */
export const ACQUIRE_PER_HOME = 0.25
/** demolition and acquisition of a non-residential site, S$ million */
export const ACQUIRE_SITE = 30
/** hexagons that can be reclaimed per phase (sand supply) */
export const SAND_CAP = 300

export type SpendKind = 'Housing' | 'Economy' | 'Green & blue' | 'Community' | 'Infrastructure' | 'Other' | 'Reclamation' | 'Acquisition'

/** cancelledAt: phase of the later decision that replaces this one before it is finished (Infinity = never) */
export interface Build { phase: PhaseId; zone: ZoneId; density: Density; start: number; done: number; cancelledAt: number }
export const isCancelled = (b: Build) => b.cancelledAt !== Infinity
export interface CellTimeline {
  /** phase at whose end the land exists (-1 = already land, Infinity = never) */
  landReady: number
  reclaimPhase: number | null
  builds: Build[]
}

export interface Reach { park: number; school: number; station: number; health: number; community: number }

export interface Snapshot {
  /** -1 = today (2026), 0–4 = end of a phase */
  phase: number
  year: number
  zone: (ZoneId | null)[]
  /** 0 = in use, 1 = under construction, 2 = waiting for reclaimed land */
  status: Uint8Array
  homes: Float64Array
  jobs: Float64Array
  /** phase in which the hexagon's current use was completed (-1 = today's) */
  builtIn: Int8Array
  pop: YearPop
  supply: number
  demand: number
  greenHa: number
  greenPer1000: number
  landKm2: number
  reclaimedKm2: number
  industryHa: number
  industryShare: number
  jobsTotal: number
  jobsRatio: number
  jobsOutsideCentral: number
  reach: Reach
  schoolIndex: number
  healthIndex: number
  utilityIndex: number
  farmHa: number
  waterHa: number
  stations: number
  byZone: Partial<Record<ZoneId, number>>
  byRegion: Record<PlannerRegion, { homes: number; residents: number; jobs: number }>
  spend: number
  spendBy: Partial<Record<SpendKind, number>>
  budget: number
  homesDemolished: number
  homesCompleted: number
  reclaimedThisPhase: number
  score: number
  subscores: Record<'housing' | 'access' | 'services' | 'green' | 'jobs' | 'budget', number>
}

export interface SimResult {
  timelines: CellTimeline[]
  /** today, then the end of each phase */
  snaps: Snapshot[]
  projection: YearPop[]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
/** amenity reach in rings of 250 m */
const REACH_RINGS: Record<keyof Reach, number> = { park: 2, school: 4, station: 4, health: 8, community: 4 }
const REACH_BIT: Record<keyof Reach, number> = { park: AMEN.park, school: AMEN.school, station: AMEN.station, health: AMEN.health, community: AMEN.community }

export function timelines(data: PlannerData, plan: NationalPlan): CellTimeline[] {
  const out: CellTimeline[] = []
  for (let i = 0; i < data.n; i++) {
    let landReady = data.land[i] ? -1 : Infinity
    let reclaimPhase: number | null = null
    const builds: Build[] = []
    for (let p = 0; p < plan.length; p++) {
      const a = plan[p][i]
      if (!a) continue
      if (a.r && !data.land[i] && reclaimPhase === null) {
        reclaimPhase = p
        landReady = p + reclaimPhases(data.ring[i]) - 1
      }
      if (a.z) {
        const start = Math.max(p, landReady + 1)
        const years = ZONE[a.z].years
        builds.push({ phase: p as PhaseId, zone: a.z, density: a.d ?? 1, start, done: start + Math.max(0, Math.ceil(years / 5) - 1), cancelledAt: Infinity })
      }
    }
    // a later decision that starts before an earlier one is finished replaces it
    for (let k = 0; k + 1 < builds.length; k++) if (builds[k + 1].start <= builds[k].done) builds[k].cancelledAt = builds[k + 1].phase
    // nothing can be built on land that never appears
    if (landReady === Infinity) for (const b of builds) b.cancelledAt = -1
    out.push({ landReady, reclaimPhase, builds })
  }
  return out
}

/** hexagons within `rings` steps of a source, by breadth-first search */
function within(data: PlannerData, sources: number[], rings: number) {
  const dist = new Int8Array(data.n).fill(-1)
  let frontier = sources
  for (const s of sources) dist[s] = 0
  for (let d = 1; d <= rings && frontier.length; d++) {
    const next: number[] = []
    for (const i of frontier) for (const j of data.neighbours[i]) if (dist[j] < 0) { dist[j] = d; next.push(j) }
    frontier = next
  }
  return dist
}

export interface CellStates {
  zone: (ZoneId | null)[]
  /** 0 = in use, 1 = under construction, 2 = waiting for reclaimed land */
  status: Uint8Array
  homes: Float64Array
  jobs: Float64Array
  builtIn: Int8Array
  amen: Uint8Array
}

/** every hexagon's use at the end of phase q (-1 = today); cheap enough to run on every brush stroke */
export function cellStates(data: PlannerData, tl: CellTimeline[], q: number, jobScale = 1): CellStates {
  const zone: (ZoneId | null)[] = new Array(data.n)
  const status = new Uint8Array(data.n)
  const homes = new Float64Array(data.n)
  const jobs = new Float64Array(data.n)
  const builtIn = new Int8Array(data.n).fill(-1)
  const amen = new Uint8Array(data.n)
  for (let i = 0; i < data.n; i++) {
    const t = tl[i]
    let z = data.base[i] ?? (t.landReady <= q ? 'reserve' : null)
    let h = data.homes[i], j = data.jobs[i] * jobScale, st = 0, built = -1
    let a = data.land[i] ? data.amen[i] | (z ? ZONE[z].amen ?? 0 : 0) : 0
    if (!data.land[i]) { h = 0; j = 0 }
    for (const b of t.builds) {
      // decisions not yet taken, or already replaced by a later one
      if (b.phase > q || b.cancelledAt <= q) continue
      if (b.done <= q) { z = b.zone; h = zoneHomes(b.zone, b.density); j = zoneJobs(b.zone, b.density); st = 0; built = b.done; a = ZONE[b.zone].amen ?? 0 }
      else if (b.start <= q) { z = b.zone; h = 0; j = 0; st = 1; a = 0 }
      else st = 2
    }
    zone[i] = z; status[i] = st; homes[i] = h; jobs[i] = j; builtIn[i] = built; amen[i] = a
  }
  return { zone, status, homes, jobs, builtIn, amen }
}

export function simulate(data: PlannerData, plan: NationalPlan, projection: YearPop[], policy: PopulationPolicy): SimResult {
  const tl = timelines(data, plan)
  const snaps: Snapshot[] = []
  const zone0 = data.base
  // today's jobs are relative weights from floor area: calibrate them to today's labour force
  const jobScale = projection[0].labourForce / data.jobs.reduce((a, b) => a + b, 0)
  // spending is booked in the phase a decision is taken
  const spendBy: Partial<Record<SpendKind, number>>[] = PHASES.map(() => ({}))
  const add = (p: number, k: SpendKind, v: number) => { spendBy[p][k] = (spendBy[p][k] ?? 0) + v }
  const demolished = PHASES.map(() => 0)
  const completed = PHASES.map(() => 0)
  const reclaimedIn = PHASES.map(() => 0)
  for (let i = 0; i < data.n; i++) {
    const t = tl[i]
    if (t.reclaimPhase !== null) { add(t.reclaimPhase, 'Reclamation', reclaimCost(data.ring[i])); reclaimedIn[t.reclaimPhase]++ }
    let curZone = zone0[i], curHomes = data.homes[i], curJobs = data.jobs[i] * jobScale
    for (const b of t.builds) {
      if (isCancelled(b)) continue
      add(b.phase, ZONE[b.zone].group, zoneCost(b.zone, b.density))
      if (curZone && !isVacant(curZone)) {
        add(b.phase, 'Acquisition', curHomes * ACQUIRE_PER_HOME + (curJobs > 0 || !curHomes ? ACQUIRE_SITE : 0))
        if (b.start <= 4) demolished[b.start] += curHomes
      }
      if (b.done <= 4) completed[b.done] += zoneHomes(b.zone, b.density)
      curZone = b.zone
      curHomes = zoneHomes(b.zone, b.density)
      curJobs = zoneJobs(b.zone, b.density)
    }
  }

  const baseCounts = { school: 0, health: 0, utility: 0 }
  for (let q = -1; q < PHASES.length; q++) {
    const year = q < 0 ? BASE_YEAR : PHASES[q].end
    const { zone, status, homes, jobs, builtIn, amen } = cellStates(data, tl, q, jobScale)
    const pop = atYear(projection, year)
    const supply = homes.reduce((s, v) => s + v, 0)
    const demand = pop.households
    const occupancy = Math.min(1, demand / Math.max(1, supply))

    let greenHa = 0, landCells = 0, industryCells = 0, farm = 0, water = 0, schools = 0, health = 0, utility = 0, stations = 0
    const byZone: Partial<Record<ZoneId, number>> = {}
    const byRegion = Object.fromEntries(PLANNER_REGIONS.map((r) => [r, { homes: 0, residents: 0, jobs: 0 }])) as Snapshot['byRegion']
    let jobsTotal = 0, jobsCentral = 0
    for (let i = 0; i < data.n; i++) {
      const z = zone[i]
      if (!z) continue
      landCells++
      byZone[z] = (byZone[z] ?? 0) + 1
      if (status[i] === 0) {
        if (isGreen(z)) greenHa += CELL_HA
        if (isIndustry(z)) industryCells++
        if (z === 'farm') farm++
        if (z === 'water') water++
        if (z === 'school') schools++
        if (z === 'health') health++
        if (z === 'eldercare') health += 0.4
        if (z === 'utility') utility++
        if (amen[i] & AMEN.station) stations++
      }
      jobsTotal += jobs[i]
      const r = data.region[i]
      if (r) {
        byRegion[r].homes += homes[i]
        byRegion[r].residents += homes[i] * occupancy * pop.householdSize
        byRegion[r].jobs += jobs[i]
        if (r === 'Central') jobsCentral += jobs[i]
      }
    }
    if (q < 0) Object.assign(baseCounts, { school: schools, health, utility })
    const base = snaps[0]?.pop ?? pop

    const reach = {} as Reach
    for (const k of Object.keys(REACH_RINGS) as (keyof Reach)[]) {
      const src: number[] = []
      for (let i = 0; i < data.n; i++) if (amen[i] & REACH_BIT[k]) src.push(i)
      const dist = within(data, src, REACH_RINGS[k])
      let served = 0
      for (let i = 0; i < data.n; i++) if (homes[i] && dist[i] >= 0) served += homes[i]
      reach[k] = served / Math.max(1, supply)
    }
    const careDemand = (p: YearPop) => p.residents + 2 * p.bands[3]
    const schoolIndex = (schools / Math.max(1, baseCounts.school)) / (pop.bands[1] / base.bands[1])
    const healthIndex = (health / Math.max(1, baseCounts.health)) / (careDemand(pop) / careDemand(base))
    const utilityIndex = (utility / Math.max(1, baseCounts.utility)) / (pop.total / base.total)
    const jobsRatio = jobsTotal / pop.labourForce
    const spend = q < 0 ? 0 : Object.values(spendBy[q]).reduce((s, v) => s + (v ?? 0), 0) / 1000
    const budget = policy.budget
    const greenPer1000 = greenHa / (pop.residents / 1000)

    const subscores = {
      housing: clamp01((supply / Math.max(1, demand) - 0.92) / 0.08),
      access: (reach.station + reach.school + reach.park + reach.health + reach.community) / 5,
      services: (clamp01(schoolIndex) + clamp01(healthIndex) + clamp01(utilityIndex)) / 3,
      green: clamp01(greenPer1000 / 0.8),
      jobs: 1 - clamp01(Math.abs(jobsRatio - 1) / 0.15),
      budget: spend <= budget ? 1 : clamp01(1 - (spend - budget) / budget),
    }
    const score = Math.round(100 * (0.25 * subscores.housing + 0.2 * subscores.access + 0.2 * subscores.services + 0.15 * subscores.green + 0.1 * subscores.jobs + 0.1 * subscores.budget))
    const landKm2 = (landCells * CELL_HA) / 100
    snaps.push({
      phase: q, year, zone, status, homes, jobs, builtIn, pop, supply, demand,
      greenHa, greenPer1000, landKm2,
      reclaimedKm2: 0,
      industryHa: industryCells * CELL_HA, industryShare: industryCells / Math.max(1, landCells),
      jobsTotal, jobsRatio, jobsOutsideCentral: 1 - jobsCentral / Math.max(1, jobsTotal),
      reach, schoolIndex, healthIndex, utilityIndex,
      farmHa: farm * CELL_HA, waterHa: water * CELL_HA, stations, byZone, byRegion,
      spend, spendBy: q < 0 ? {} : spendBy[q], budget,
      homesDemolished: q < 0 ? 0 : demolished[q], homesCompleted: q < 0 ? 0 : completed[q],
      reclaimedThisPhase: q < 0 ? 0 : reclaimedIn[q],
      score, subscores,
    })
  }
  for (const s of snaps) s.reclaimedKm2 = s.landKm2 - snaps[0].landKm2
  return { timelines: tl, snaps, projection }
}
