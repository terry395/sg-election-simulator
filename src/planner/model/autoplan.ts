import { PLANNER_REGIONS, type PlannerData, type PlannerRegion } from '../data/loadPlanner'
import type { PopulationPolicy } from '../data/demographics'
import { PHASES, type YearPop } from './population'
import { ACQUIRE_PER_HOME, ACQUIRE_SITE, SAND_CAP, cellStates, emptyPlan, reclaimCost, reclaimPhases, simulate, timelines, type NationalPlan, type Snapshot } from './simulate'
import { buildBlocked, crossingBy, hasLandBy, reclaimBlocked, reclaimedCount } from './rules'
import { baseIslands, plannedLinks, seaPath } from './islands'
import { AMEN, CELL_HA, CROSSING_MAX_RING, ZONE, isVacant, zoneCost, zoneHomes, zoneJobs, type Density, type ZoneId } from './zones'

/** What the auto-planner aims for and where it may build. */
export interface AutoOptions {
  /** which phases to plan, from the phase being viewed */
  phases: 'all' | 'fromCurrent' | 'current'
  /** add to the plan, or clear the phases being planned first */
  mode: 'add' | 'replace'
  /** share of new homes that are public (HDB, some ECs); the rest are condos */
  publicShare: number
  /** auto = high density within 500 m of MRT, standard elsewhere */
  density: 'auto' | Density
  sites: { landBank: boolean; openSpace: boolean; redevelop: boolean; reclaim: boolean }
  /** sea hexagons reclaimed per phase at most */
  reclaimPerPhase: number
  /** reclaim the maximum every phase, not only when the land bank runs short */
  reclaimAlways: boolean
  /** where new land may be reclaimed, and which islands to join to the main island */
  sea: SeaChoice
  /** spare homes above households (0.03 = 3%) */
  housingBuffer: number
  /** ha of parks and nature per 1,000 residents */
  greenTarget: number
  /** share of homes within 1 km of MRT */
  mrtTarget: number
  /** school and utility capacity against demand (1 = as today) */
  serviceTarget: number
  /** hospital and eldercare capacity against demand (1 = as today) */
  careTarget: number
  /** jobs per worker */
  jobsTarget: number
  /** new jobs go to regional centres outside the Central Region */
  decentralise: boolean
  /** eldercare goes where seniors live */
  ageing: boolean
  /** share of each phase's budget the auto-planner may spend */
  budgetUse: number
}

/**
 * Where to reclaim. Simple picks whole coasts (planning regions), detailed picks stretches of coast
 * (the planning area nearest the sea). Empty lists mean anywhere.
 */
export interface SeaChoice {
  detail: 'simple' | 'detailed'
  regions: PlannerRegion[]
  areas: string[]
  /** islands to join to the main island with new land, by name */
  join: string[]
}

export interface Strategy { id: string; label: string; desc: string; options: Partial<AutoOptions> }

export const DEFAULT_AUTO: AutoOptions = {
  phases: 'all', mode: 'add', publicShare: 0.8, density: 'auto',
  sites: { landBank: true, openSpace: false, redevelop: false, reclaim: true },
  reclaimPerPhase: 120, reclaimAlways: false, sea: { detail: 'simple', regions: [], areas: [], join: [] }, housingBuffer: 0.03, greenTarget: 0.9, mrtTarget: 0.85,
  serviceTarget: 1.02, careTarget: 1.03, jobsTarget: 1, decentralise: false, ageing: false, budgetUse: 0.95,
}

export const STRATEGIES: Strategy[] = [
  { id: 'balanced', label: 'Balanced growth', desc: 'Meet every need at the lowest cost: new towns on the land bank, schools, clinics and parks beside them, MRT where homes lack it, and reclamation only when land runs short.', options: {} },
  { id: 'compact', label: 'Compact city', desc: 'Grow upwards, not outwards: rebuild older low-rise estates and industry near towns at high density around MRT stations. No reclamation.', options: { density: 2, sites: { landBank: true, openSpace: false, redevelop: true, reclaim: false }, mrtTarget: 0.9 } },
  { id: 'sea', label: 'Expand to the sea', desc: 'Reclaim large new islands every phase off the coasts you choose, join offshore islands if you like, put new towns on them as they settle and bank the rest for after 2050, keeping today\'s green spaces.', options: { sites: { landBank: true, openSpace: false, redevelop: false, reclaim: true }, reclaimPerPhase: 200, reclaimAlways: true } },
  { id: 'garden', label: 'City in nature', desc: 'Parks first: 1.2 ha of green for every 1,000 residents, no building on open greenery and lower-rise homes.', options: { greenTarget: 1.2, density: 1, sites: { landBank: true, openSpace: false, redevelop: false, reclaim: true } } },
  { id: 'regions', label: 'Jobs near homes', desc: 'Regional centres and business parks outside the city, next to MRT, so fewer people commute to the CBD.', options: { decentralise: true, jobsTarget: 1.05 } },
  { id: 'ageing', label: 'Ageing-ready', desc: 'More hospitals and eldercare than demand needs, placed where seniors live, with homes close to transport.', options: { careTarget: 1.15, ageing: true, mrtTarget: 0.9 } },
]

export const strategyOptions = (id: string, base: AutoOptions = DEFAULT_AUTO): AutoOptions => {
  const s = STRATEGIES.find((x) => x.id === id)?.options ?? {}
  return { ...DEFAULT_AUTO, phases: base.phases, mode: base.mode, sea: base.sea, ...s, sites: { ...DEFAULT_AUTO.sites, ...s.sites } }
}

/** a sea hexagon the choice allows reclaiming */
export function seaAllowed(data: PlannerData, sea: SeaChoice, i: number) {
  if (sea.detail === 'simple') return !sea.regions.length || sea.regions.includes(data.region[i]!)
  return !sea.areas.length || sea.areas.includes(data.place[i].pa)
}

export interface SeaArea { region: PlannerRegion; area: string; cells: number }
/** stretches of coast with shallow water to reclaim, by region then size */
export function seaAreas(data: PlannerData): SeaArea[] {
  const m = new Map<string, SeaArea>()
  for (let i = 0; i < data.n; i++) {
    if (data.land[i] || data.ring[i] > 8 || !data.region[i] || !data.place[i].pa) continue
    const key = data.place[i].pa
    const a = m.get(key) ?? { region: data.region[i]!, area: key, cells: 0 }
    a.cells++
    m.set(key, a)
  }
  return [...m.values()].filter((a) => a.cells >= 10).sort((a, b) => PLANNER_REGIONS.indexOf(a.region) - PLANNER_REGIONS.indexOf(b.region) || b.cells - a.cells)
}

/** offshore islands the planner can join to the main island */
export const joinableIslands = (data: PlannerData) => baseIslands(data).islands.filter((s) => !s.prelinked && s.cells.length >= 15)

export interface PhaseSummary {
  phase: number
  added: Partial<Record<ZoneId | 'reclaim', number>>
  homes: number
  /** S$ billion spent by the auto-planner in this phase */
  spend: number
  unmet: string[]
}
export interface AutoResult { plan: NationalPlan; summary: PhaseSummary[] }

const HOME_RINGS = 3
/** hexagons within `max` steps of any source (-1 = further) */
function distances(data: PlannerData, isSource: (i: number) => boolean, max: number) {
  const dist = new Int8Array(data.n).fill(-1)
  let frontier: number[] = []
  for (let i = 0; i < data.n; i++) if (isSource(i)) { dist[i] = 0; frontier.push(i) }
  for (let d = 1; d <= max && frontier.length; d++) {
    const next: number[] = []
    for (const i of frontier) for (const j of data.neighbours[i]) if (dist[j] < 0) { dist[j] = d; next.push(j) }
    frontier = next
  }
  return dist
}
/** cells within `rings` of one cell */
function around(data: PlannerData, from: number, rings: number) {
  const seen = new Set([from])
  let frontier = [from]
  for (let d = 0; d < rings; d++) {
    const next: number[] = []
    for (const i of frontier) for (const j of data.neighbours[i]) if (!seen.has(j)) { seen.add(j); next.push(j) }
    frontier = next
  }
  return seen
}
const k = (v: number) => `${Math.round(v / 1000).toLocaleString('en-SG')}k`

/**
 * Greedy, deterministic auto-planner. For each phase it simulates the plan so far, works out what the
 * end of the phase is short of, and places projects on the best free sites in priority order until the
 * needs are met or the phase's budget is used.
 */
export function autoPlan(data: PlannerData, start: NationalPlan, projection: YearPop[], policy: PopulationPolicy, opts: AutoOptions, current: number): AutoResult {
  const plan = start.map((p) => ({ ...p }))
  const phases = opts.phases === 'all' ? [0, 1, 2, 3, 4] : opts.phases === 'fromCurrent' ? PHASES.map((p) => p.id as number).filter((p) => p >= current) : [current]
  if (opts.mode === 'replace') for (const p of phases) plan[p] = {}
  const summary: PhaseSummary[] = []
  const baseSnap = simulate(data, emptyPlan(), projection, policy).snaps[0]
  const base0 = {
    health: (baseSnap.byZone.health ?? 0) + 0.4 * (baseSnap.byZone.eldercare ?? 0),
    school: baseSnap.byZone.school ?? 0,
    utility: baseSnap.byZone.utility ?? 0,
  }
  for (const p of phases) summary.push(planPhase(data, plan, projection, policy, opts, p, phases, base0, baseSnap))
  return { plan, summary }
}

function planPhase(data: PlannerData, plan: NationalPlan, projection: YearPop[], policy: PopulationPolicy, opts: AutoOptions,
  p: number, phases: number[], base0: { health: number; school: number; utility: number }, today: Snapshot): PhaseSummary {
  const sim = simulate(data, plan, projection, policy)
  const s = sim.snaps[p + 1]
  const st = cellStates(data, timelines(data, plan), p)
  const out: PhaseSummary = { phase: p, added: {}, homes: 0, spend: 0, unmet: [] }
  const label = PHASES[p].label
  // budget left for the auto-planner in this phase (S$ million)
  let budget = policy.budget * 1000 * opts.budgetUse - s.spend * 1000
  let spent = 0
  const homes = Float64Array.from(st.homes)
  const zone = st.zone.slice()
  const amen = Uint8Array.from(st.amen)

  // ---- free sites: built-up land the plan does not already touch from this phase on
  const touched = (i: number) => { for (let q = p; q < plan.length; q++) if (plan[q][i]) return true; return false }
  const free = new Set<number>()
  for (let i = 0; i < data.n; i++) {
    const z = zone[i]
    if (!z || st.status[i] !== 0 || data.prot[i] || touched(i)) continue
    if ((z === 'reserve' && opts.sites.landBank) || (z === 'open' && opts.sites.openSpace)) free.add(i)
  }
  const isIndustryish = (z: ZoneId | null) => z === 'industrial' || z === 'port' || z === 'airport' || z === 'utility' || z === 'datacentre'
  // redevelopment: older low-rise estates and industry beside homes
  const redevelop = new Set<number>()
  if (opts.sites.redevelop) {
    for (let i = 0; i < data.n; i++) {
      const z = zone[i]
      if (!z || st.status[i] !== 0 || data.prot[i] || touched(i) || st.builtIn[i] >= 0) continue
      if (z === 'hdb' && homes[i] > 0 && homes[i] < 450) redevelop.add(i)
      if (z === 'industrial' && data.neighbours[i].some((j) => zone[j] === 'hdb' || zone[j] === 'condo')) redevelop.add(i)
    }
  }

  const dStation = () => distances(data, (i) => !!(amen[i] & AMEN.station), 4)
  let dS = dStation()
  const dHomes = distances(data, (i) => homes[i] > 0, HOME_RINGS)

  const costOf = (i: number, z: ZoneId, d: Density) => {
    const cur = zone[i]
    const acquire = cur && !isVacant(cur) ? homes[i] * ACQUIRE_PER_HOME + (st.jobs[i] > 0 || !homes[i] ? ACQUIRE_SITE : 0) : 0
    return zoneCost(z, d) + acquire
  }
  /** place a project if the budget allows; false when the money has run out */
  const place = (i: number, z: ZoneId, d: Density = 1) => {
    if (buildBlocked(data, plan, i, p, z)) return true
    const c = costOf(i, z, d)
    if (spent + c > budget) return false
    spent += c
    plan[p][i] = { ...plan[p][i], z, d }
    const gained = zoneHomes(z, d) - homes[i]
    homes[i] = zoneHomes(z, d)
    zone[i] = z
    amen[i] = ZONE[z].amen ?? 0
    free.delete(i)
    redevelop.delete(i)
    out.added[z] = (out.added[z] ?? 0) + 1
    if (gained > 0) out.homes += gained
    return true
  }
  /** best free site by score (null = none left) */
  const best = (score: (i: number) => number, pool: Iterable<number> = free) => {
    let bi = -1, bs = -Infinity
    for (const i of pool) { const v = score(i); if (v > bs) { bs = v; bi = i } }
    return bi < 0 || bs === -Infinity ? null : { i: bi, score: bs }
  }
  const nearIndustry = (i: number) => data.neighbours[i].some((j) => isIndustryish(zone[j]))
  const transit = (i: number) => (dS[i] >= 0 ? (5 - dS[i]) / 5 : 0)
  const nearHomes = (i: number) => (dHomes[i] >= 0 ? 1 - dHomes[i] / (HOME_RINGS + 1) : 0)
  const pop = s.pop

  // ---- 0. join the chosen islands to the main island with new land (an explicit choice: it comes first)
  if (opts.sites.reclaim && opts.sea.join.length) {
    const linked = plannedLinks(data, plan, p)
    let used = reclaimedCount(plan, p)
    for (const island of baseIslands(data).islands) {
      if (!opts.sea.join.includes(island.name) || island.cells.some((i) => linked[i] >= 0)) continue
      // the shortest strip of sea between them, grown out from the island
      const path = seaPath(data, island.cells, (i) => linked[i] >= 0, (i) => !hasLandBy(data, plan, i, p))
      if (!path.length) continue
      const cost = path.reduce((n, i) => n + reclaimCost(data.ring[i]), 0)
      if (used + path.length > SAND_CAP) { out.unmet.push(`${label}: not enough sand left to join ${island.name}`); continue }
      if (spent + cost > budget) { out.unmet.push(`${label}: not enough budget to join ${island.name} (about S$${(cost / 1000).toFixed(1)}b)`); continue }
      for (const i of path) plan[p][i] = { ...plan[p][i], r: 1 }
      spent += cost
      used += path.length
      out.added.reclaim = (out.added.reclaim ?? 0) + path.length
    }
  }

  // ---- 1. essentials: hospitals & eldercare, utilities
  const care = (q: YearPop) => q.residents + 2 * q.bands[3]
  let health = 0, utility = 0, schools = 0
  for (let i = 0; i < data.n; i++) {
    if (st.status[i] !== 0) continue
    if (zone[i] === 'health') health++
    if (zone[i] === 'eldercare') health += 0.4
    if (zone[i] === 'utility') utility++
    if (zone[i] === 'school') schools++
  }
  // demand five years on too, so capacity is ready before it is needed
  const later = sim.snaps[Math.min(p + 2, 5)].pop
  const needHealth = opts.careTarget * base0.health * Math.max(care(pop), care(later)) / care(today.pop) - health
  if (needHealth > 0.2) {
    const seniorsNear = (i: number) => {
      let v = 0
      for (const j of around(data, i, 2)) v += data.file.age[j]?.[3] ?? 0
      return v / 2000
    }
    const nearHospital = new Set<number>()
    let deficit = needHealth, stuck = false
    for (let n = 0; deficit > 0.2 && n < 60 && !stuck; n++) {
      // one hospital, then eldercare, keeping hospitals apart
      const hospital = n % 4 === 0
      const pick = best((i) => {
        if (nearIndustry(i)) return -Infinity
        let v = nearHomes(i) * 2 + transit(i)
        if (opts.ageing || !hospital) v += seniorsNear(i)
        if (hospital && nearHospital.has(i)) v -= 3
        return v
      })
      if (!pick) { out.unmet.push(`${label}: no free sites for hospitals and eldercare`); break }
      if (!place(pick.i, hospital ? 'health' : 'eldercare')) { stuck = true; break }
      if (hospital) for (const j of around(data, pick.i, 6)) nearHospital.add(j)
      deficit -= hospital ? 1 : 0.4
    }
    if (deficit > 0.2) out.unmet.push(`${label}: hospitals and eldercare still short (budget ran out)`)
  }
  const needUtility = Math.ceil(opts.serviceTarget * base0.utility * Math.max(pop.total, later.total) / today.pop.total - utility)
  for (let n = 0; n < needUtility; n++) {
    const pick = best((i) => (nearIndustry(i) ? 2 : 0) + (dHomes[i] < 0 || dHomes[i] >= 2 ? 1 : -2))
    if (!pick || !place(pick.i, 'utility')) { out.unmet.push(`${label}: utilities still short by ${needUtility - n}`); break }
  }

  // ---- 2. homes, in clusters that form towns
  const housingSites = new Set([...free, ...redevelop])
  const newHousing: number[] = []
  let needHomes = s.demand * (1 + opts.housingBuffer) - homes.reduce((a, b) => a + b, 0)
  let publicBuilt = 0, privateBuilt = 0, ecCount = 0
  const homeScore = (i: number) => {
    let v = transit(i) * 3 + nearHomes(i) * 2
    if (nearIndustry(i)) v -= 2
    // new land is where "expand to the sea" puts its towns
    if (!data.land[i]) v += opts.reclaimAlways ? 7 : 1
    if (redevelop.has(i)) v += opts.density === 2 ? 1 : -1.5
    if (zone[i] === 'open') v -= 1
    return v
  }
  let broke = false
  while (needHomes > 0 && housingSites.size && !broke) {
    const seed = best(homeScore, housingSites)
    if (!seed) break
    const cluster = [seed.i]
    const frontier = new Set<number>()
    const grow = (i: number) => { for (const j of data.neighbours[i]) if (housingSites.has(j) && !cluster.includes(j)) frontier.add(j) }
    grow(seed.i)
    while (cluster.length < 14 && frontier.size) {
      const nb = best(homeScore, frontier)
      if (!nb || nb.score < seed.score - 3) break
      frontier.delete(nb.i)
      cluster.push(nb.i)
      grow(nb.i)
    }
    for (const i of cluster) {
      housingSites.delete(i)
      if (needHomes <= 0) break
      const pub = publicBuilt <= opts.publicShare * (publicBuilt + privateBuilt)
      const z: ZoneId = pub ? (ecCount++ % 7 === 6 ? 'ec' : 'hdb') : 'condo'
      const d: Density = opts.density === 'auto' ? (dS[i] >= 0 && dS[i] <= 2 ? 2 : 1) : opts.density
      const before = homes[i]
      if (!place(i, z, d)) { broke = true; break }
      const gain = zoneHomes(z, d) - before
      needHomes -= gain
      if (pub) publicBuilt += gain; else privateBuilt += gain
      newHousing.push(i)
    }
  }
  if (needHomes > 0) out.unmet.push(`${label}: about ${k(needHomes)} homes short (${broke ? 'budget ran out' : 'no free sites left'})`)

  // ---- 2b. new homes on land cut off from the main island get a causeway, bridge or tunnel
  if (newHousing.length) {
    const linked = plannedLinks(data, plan, p)
    const seen = new Uint8Array(data.n)
    for (const h of newHousing) {
      if (linked[h] >= 0 || seen[h]) continue
      // the land the homes stand on
      const comp = [h]
      seen[h] = 1
      for (let c = 0; c < comp.length; c++) for (const j of data.neighbours[comp[c]]) if (!seen[j] && (hasLandBy(data, plan, j, p) || crossingBy(plan, j, p))) { seen[j] = 1; comp.push(j) }
      const path = seaPath(data, comp, (i) => linked[i] >= 0, (i) => !hasLandBy(data, plan, i, p) && !crossingBy(plan, i, p))
      let ok = path.length > 0
      for (const i of path) {
        const z: ZoneId = data.ring[i] <= CROSSING_MAX_RING.causeway! ? 'causeway' : data.ring[i] <= CROSSING_MAX_RING.bridge! ? 'bridge' : 'tunnel'
        if (!place(i, z)) { ok = false; break }
      }
      if (!ok) out.unmet.push(`${label}: new homes on an island with no link to the main island`)
    }
  }

  // ---- 3. schools, community and parks within reach of the new homes
  const local: [ZoneId, number, number][] = [['school', AMEN.school, 4], ['community', AMEN.community, 4], ['park', AMEN.park, 2]]
  for (const [z, bit, rings] of local) {
    let served = distances(data, (i) => !!(amen[i] & bit), rings)
    for (const h of newHousing) {
      if (served[h] >= 0) continue
      const pool = [...around(data, h, Math.max(1, rings - 1))].filter((i) => free.has(i))
      const pick = best((i) => -Math.abs(dHomes[i]) + transit(i), pool)
      if (!pick) continue
      if (!place(pick.i, z)) break
      served = distances(data, (i) => !!(amen[i] & bit), rings)
    }
  }
  // school places overall
  const needSchools = Math.ceil(opts.serviceTarget * base0.school * (pop.bands[1] / today.pop.bands[1]) - schools - (out.added.school ?? 0))
  for (let n = 0; n < needSchools; n++) {
    const pick = best((i) => nearHomes(i) * 2 + transit(i) - (nearIndustry(i) ? 2 : 0))
    if (!pick || !place(pick.i, 'school')) { out.unmet.push(`${label}: schools still short`); break }
  }

  // ---- 4. MRT stations where most homes are out of reach (not in the last phase: they take ten years)
  if (p < 4) {
    const total = homes.reduce((a, b) => a + b, 0)
    let reach = 0
    for (let i = 0; i < data.n; i++) if (homes[i] && dS[i] >= 0) reach += homes[i]
    for (let n = 0; n < 12 && reach / total < opts.mrtTarget; n++) {
      // the free site whose 1 km catchment holds the most unserved homes
      let bi = -1, bv = 0
      for (const i of free) {
        if (dHomes[i] < 0) continue
        let v = 0
        for (const j of around(data, i, 4)) if (homes[j] && dS[j] < 0) v += homes[j]
        if (v > bv) { bv = v; bi = i }
      }
      if (bi < 0 || bv < 3000) break
      if (!place(bi, 'mrt')) { out.unmet.push(`${label}: MRT access below target (budget ran out)`); break }
      reach += bv
      dS = dStation()
    }
  }

  // ---- 5. parks and nature up to the green target
  let greenHa = 0
  for (let i = 0; i < data.n; i++) if (zone[i] && st.status[i] === 0 && ZONE[zone[i]!].green) greenHa += CELL_HA
  greenHa += ((out.added.park ?? 0) + (out.added.beach ?? 0)) * CELL_HA
  let needGreen = Math.ceil((opts.greenTarget * pop.residents / 1000 - greenHa) / CELL_HA)
  if (needGreen > 0) {
    // turning open greenery near homes into parks is cheapest
    const pool = new Set(free)
    for (let i = 0; i < data.n; i++) if (zone[i] === 'open' && st.status[i] === 0 && !data.prot[i] && !touched(i)) pool.add(i)
    for (; needGreen > 0; needGreen--) {
      const pick = best((i) => nearHomes(i) * 2 + (zone[i] === 'open' ? 1 : 0), pool)
      if (!pick) break
      pool.delete(pick.i)
      if (!place(pick.i, 'park')) break
    }
    if (needGreen > 0) out.unmet.push(`${label}: parks short of the ${opts.greenTarget} ha per 1,000 target`)
  }

  // ---- 6. jobs
  // the simulation's total (today's jobs are calibrated to the labour force there)
  let jobs = s.jobsTotal
  for (const [z, n] of Object.entries(out.added)) if (z !== 'reclaim') jobs += zoneJobs(z as ZoneId) * (n ?? 0)
  let needJobs = opts.jobsTarget * pop.labourForce - jobs
  let industryCells = Math.round(s.industryShare * s.landKm2 * 100 / CELL_HA)
  const landCells = Math.round(s.landKm2 * 100 / CELL_HA)
  for (let n = 0; needJobs > 0 && n < 400; n++) {
    const pick = best((i) => {
      if (opts.decentralise && data.region[i] === 'Central') return -Infinity
      return transit(i) * 3 + nearHomes(i) + (opts.decentralise ? 1 : 0)
    })
    if (!pick) { out.unmet.push(`${label}: about ${k(needJobs)} jobs short (no free sites)`); break }
    const z: ZoneId = industryCells < landCells * 0.16 ? 'industrial' : dS[pick.i] >= 0 && dS[pick.i] <= 1 ? 'commercial' : 'bizpark'
    const d: Density = z === 'commercial' ? 2 : 1
    if (!place(pick.i, z, d)) { out.unmet.push(`${label}: about ${k(needJobs)} jobs short (budget ran out)`); break }
    if (z === 'industrial') industryCells++
    needJobs -= zoneJobs(z, d)
  }

  // ---- 7. reclaim land for later phases
  if (opts.sites.reclaim && p <= 3) {
    const nextNeed = phases.includes(p + 1) ? Math.max(0, sim.snaps[Math.min(p + 2, 5)].demand * (1 + opts.housingBuffer) - homes.reduce((a, b) => a + b, 0)) : 0
    const cellsNeeded = Math.ceil(nextNeed / 700 * 1.6)
    const room = Math.min(opts.reclaimPerPhase, SAND_CAP - reclaimedCount(plan, p))
    const want = opts.reclaimAlways ? room : Math.min(room, Math.max(0, cellsNeeded - free.size))
    let done = 0
    const seaHomes = distances(data, (i) => homes[i] > 0, 8)
    // sea next to the coast (or to land already being reclaimed)
    const edge = new Set<number>()
    // only water shallow enough to be built on before the last phase, off the coasts chosen
    const usable = (i: number) => p + reclaimPhases(data.ring[i]) - 1 <= 3 && seaAllowed(data, opts.sea, i) && !crossingBy(plan, i, p)
    for (let i = 0; i < data.n; i++) if (!data.land[i] && usable(i) && !hasLandBy(data, plan, i, p) && !reclaimBlocked(data, plan, i, p, 0)) edge.add(i)
    while (done < want) {
      // grow out from the shore, shallow water first, near where people live
      // compact islands rather than thin strips: favour water surrounded by new land
      const pick = best((i) => -data.ring[i] * 0.7 + (seaHomes[i] >= 0 ? 8 - seaHomes[i] : -4) + data.neighbours[i].filter((j) => plan[p][j]?.r || hasLandBy(data, plan, j, p - 1)).length * 3, edge)
      if (!pick) { if (opts.reclaimAlways && done < want * 0.8) out.unmet.push(`${label}: only ${done} of ${want} hexagons reclaimed (no more shallow water off the coasts chosen)`); break }
      const bi = pick.i
      edge.delete(bi)
      const c = reclaimCost(data.ring[bi])
      if (spent + c > budget) { if (opts.reclaimAlways) out.unmet.push(`${label}: reclamation stopped (budget ran out)`); break }
      spent += c
      plan[p][bi] = { ...plan[p][bi], r: 1 }
      out.added.reclaim = (out.added.reclaim ?? 0) + 1
      done++
      for (const j of data.neighbours[bi]) if (!data.land[j] && usable(j) && !hasLandBy(data, plan, j, p)) edge.add(j)
    }
  }
  out.spend = spent / 1000
  return out
}

/** Fix my plan: add the cheapest projects that resolve the plan checks, across all phases. */
export function fixPlan(data: PlannerData, plan: NationalPlan, projection: YearPop[], policy: PopulationPolicy): AutoResult {
  return autoPlan(data, plan, projection, policy, {
    ...DEFAULT_AUTO, phases: 'all', mode: 'add', housingBuffer: 0.005, greenTarget: 0.8, mrtTarget: 0.72,
    serviceTarget: 1, careTarget: 1, jobsTarget: 0.97, budgetUse: 1, reclaimPerPhase: 80,
  }, 0)
}
