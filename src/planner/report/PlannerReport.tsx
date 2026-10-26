import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ScrollText, X } from 'lucide-react'
import { mix } from '../../lib/color'
import { usePlanner } from '../state/planner'
import { usePlannerDerived } from '../state/derived'
import { BASELINE, SOURCES } from '../data/demographics'
import { PLANNER_REGIONS, type PlannerData } from '../data/loadPlanner'
import { PHASES } from '../model/population'
import { buildPlanReport, linkWords, listWords, projectLabel, type PlanReport } from '../model/report'
import type { IslandLink } from '../model/islands'
import { ACQUIRE_PER_HOME, SAND_CAP, type Snapshot, type SpendKind } from '../model/simulate'
import { CELL_HA, ZONE, isCrossing } from '../model/zones'
import { PHASE_COLORS } from '../map/colors'
import { HexCanvas } from './HexCanvas'
import { scoreWord } from '../panels/format'

const NOTICE = 'Simulation · Not an official document'
const DISCLAIMER = 'This is a mock plan written automatically by the SG Simulator from choices made by one of its users, for entertainment and learning. It is not an official document. It has not been issued, reviewed or endorsed by the Ministry of National Development, the Urban Redevelopment Authority, the Housing & Development Board or any other government body, and it does not describe any real government plan or policy. Costs, jobs and capacities are rough model estimates.'

const PAGES = [
  { id: 'plan-cover', label: 'Cover' },
  { id: 'plan-foreword', label: 'Foreword' },
  { id: 'plan-islands', label: 'One Singapore: joining the islands' },
  { id: 'plan-summary', label: 'Summary' },
  { id: 'plan-population', label: 'Population' },
  { id: 'plan-land', label: 'Land use' },
  { id: 'plan-housing', label: 'Housing' },
  { id: 'plan-newland', label: 'New land' },
  { id: 'plan-living', label: 'Green, transport, services' },
  { id: 'plan-economy', label: 'Economy' },
  { id: 'plan-finance', label: 'Financing' },
  { id: 'plan-risks', label: 'Risks' },
  { id: 'plan-annex-a', label: 'Annex A' },
  { id: 'plan-annex-b', label: 'Annex B' },
  { id: 'plan-annex-c', label: 'Annex C' },
]

const int = (v: number) => Math.round(v).toLocaleString('en-SG')
const m = (v: number, d = 2) => `${(v / 1e6).toFixed(d)} million`
const pc = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`
const ha = (v: number) => `${int(v)} ha`

/** Mock White Paper for the national redevelopment plan. View-only. */
export function PlannerReport() {
  const open = usePlanner((s) => s.reportOpen)
  if (!open) return null
  return <ReportDialog />
}

function ReportDialog() {
  const close = () => usePlanner.getState().setReportOpen(false)
  const data = usePlanner((s) => s.data)!
  const policy = usePlanner((s) => s.policy)
  const name = usePlanner((s) => s.name)
  const { sim } = usePlannerDerived()
  const body = useRef<HTMLDivElement>(null)
  const report = useMemo(() => buildPlanReport(data, sim, policy, name), [data, sim, policy, name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') usePlanner.getState().setReportOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const goTo = (id: string) => body.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95" role="dialog" aria-label="Mock national redevelopment plan">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <ScrollText size={18} className="shrink-0 text-emerald-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">Mock White Paper: {name}</div>
          <div className="truncate text-[11px] text-slate-400">Generated from your plan · for entertainment and learning · not an official document</div>
        </div>
        <select onChange={(e) => goTo(e.target.value)} defaultValue="" aria-label="Jump to a page"
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 phone:max-w-32">
          <option value="" disabled>Jump to…</option>
          {PAGES.filter((p) => p.id !== 'plan-islands' || report.islandLinks.length).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={close} className="p-1 text-slate-400 hover:text-white" aria-label="Close report"><X size={20} /></button>
      </div>
      <div ref={body} className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="ebrc-doc mx-auto flex max-w-[860px] flex-col gap-6 px-3 py-6 phone:gap-4 phone:px-2 phone:py-3">
          <Document r={report} data={data} />
        </div>
        <div className="ebrc-print-note">The mock White Paper is view-only and cannot be printed. {DISCLAIMER}</div>
      </div>
    </div>
  )
}

function zoneFill(data: PlannerData, s: Snapshot) {
  return s.zone.map((z, i) => (z ? (s.status[i] === 1 ? mix(ZONE[z].color, '#ffffff', 0.55) : s.status[i] === 2 ? '#e7d7b0' : ZONE[z].color) : null)).map((f, i) => (f ?? (data.land[i] ? '#e5e7eb' : null)))
}

function Document({ r, data }: { r: PlanReport; data: PlannerData }) {
  const plan = usePlanner((s) => s.plan)
  const fills = useMemo(() => {
    const before = zoneFill(data, r.first)
    const after = zoneFill(data, r.last)
    const changes = r.last.zone.map((z, i) => {
      let last = -1
      for (let p = 0; p < plan.length; p++) if (plan[p][i]) last = p
      return last >= 0 ? PHASE_COLORS[last] : z ? '#e5e7eb' : null
    })
    return { before, after, changes }
  }, [data, r, plan])

  const dateText = r.date.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
  const first = r.first, last = r.last
  const p26 = first.pop, p50 = last.pop
  let n = 0
  /** a numbered paragraph */
  const P = (children: ReactNode, key?: string) => <li key={key}><span className="ebrc-num">{++n}.</span><span>{children}</span></li>
  let page = 0
  const next = () => ++page
  const years = r.snaps.map((s) => s.year)
  const kinds: SpendKind[] = ['Housing', 'Economy', 'Green & blue', 'Community', 'Infrastructure', 'Other', 'Reclamation', 'Acquisition']
  const topIssues = r.issues.filter((i) => i.level === 'error').slice(0, 6)
  const warnIssues = r.issues.filter((i) => i.level === 'warn').slice(0, 6)
  const totalReclaimed = r.reclaimByPhase.reduce((a, b) => a + b, 0)

  return (
    <>
      {/* ---------------------------------------------------------------- cover */}
      <Page id="plan-cover" n={next()} cover>
        <div className="flex min-h-[880px] flex-col items-center text-center phone:min-h-[560px]">
          <div className="mt-6 text-[13px] tracking-[0.3em]">SIMULATED · SINGAPORE 2026–2050</div>
          <div className="mt-24 phone:mt-14">
            <div className="text-[13px] tracking-[0.25em]">NATIONAL LAND USE AND REDEVELOPMENT PLAN</div>
            <h1 className="mx-auto mt-3 max-w-lg text-[32px] font-bold leading-tight tracking-wide phone:text-[22px]">{r.name.toUpperCase()}</h1>
            <div className="mx-auto my-8 h-px w-24 bg-black" />
            <p className="text-[15px] italic">A liveable and sustainable home for {m(p50.total, 1)} people</p>
            {r.islandLinks.length > 0 && (
              <p className="mx-auto mt-10 max-w-md border-2 border-black px-4 py-2.5 text-[13px] font-bold leading-snug tracking-wide">
                FEATURING · {listWords(r.islandLinks.map((l) => l.island.name)).toUpperCase()} JOINED TO THE MAIN ISLAND
              </p>
            )}
          </div>
          <div className="mt-auto space-y-6 pb-4">
            <p className="text-[13px] tracking-wider">[ SIMULATED PAPER · NOT PRESENTED TO PARLIAMENT ]</p>
            <p className="text-[13px]">Generated on {dateText}</p>
            <p className="mx-auto max-w-lg border border-black px-4 py-3 text-left text-[11.5px] leading-snug">{DISCLAIMER}</p>
          </div>
        </div>
      </Page>

      {/* ---------------------------------------------------------------- foreword */}
      <Page id="plan-foreword" n={next()}>
        <h2 className="ebrc-title">FOREWORD</h2>
        <div className="mt-6 space-y-4 text-justify">
          <p>Singapore has about 735 square kilometres of land and must fit homes, jobs, defence, water catchments, parks, ports and an airport within it. Every generation has had to plan ahead, and this plan sets out how the land will be used and renewed from {PHASES[0].label.slice(0, 4)} to 2050.</p>
          <p>We start from {m(BASELINE.total)} people, of whom {m(BASELINE.citizens)} are citizens and {m(BASELINE.prs)} permanent residents. Our society is ageing quickly: {pc(BASELINE.seniorShare, 1)} of residents are aged 65 and over, and the fertility rate has fallen to {BASELINE.tfr.toFixed(2)}. By 2050 this plan expects {m(p50.residents)} residents and {m(p50.nonResidents)} non-residents, with {pc(p50.bands[3] / p50.residents)} of residents aged 65 and over.</p>
          {r.headline.map((h) => <p key={h}>{h}</p>)}
          <p>The plan is set out in five phases of five years. It has been tested against the needs of the projected population: homes, transport, schools, healthcare, parks, utilities and jobs. Where it falls short, the shortfalls are stated plainly in Chapter 9.</p>
        </div>
        <div className="mt-12 w-64 border-t border-dotted border-black pt-1 text-[13px]">Minister for National Development<br />(the player of this simulation)</div>
        <p className="mt-4 text-[13px]">{dateText}</p>
      </Page>

      {/* ---------------------------------------------------------------- special feature: islands joined */}
      {r.islandLinks.length > 0 && (
        <Page id="plan-islands" n={next()}>
          <div className="text-center text-[12px] font-bold tracking-[0.3em]">SPECIAL FEATURE</div>
          <h2 className="ebrc-title mt-2">ONE SINGAPORE: JOINING THE ISLANDS</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[15px] italic">
            {listWords(r.islandLinks.map((l) => l.island.name))} {r.islandLinks.length > 1 ? 'become' : 'becomes'} part of the main island, reached by road for the first time.
          </p>
          {r.islandLinks.map((l) => (
            <div key={l.island.name} className="mt-6 border-2 border-black">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black bg-black px-3 py-1.5 text-white">
                <span className="text-[16px] font-bold tracking-wide">{l.island.name.toUpperCase()}</span>
                <span className="text-[12px]">{l.joinedPhase !== null ? `Joined by ${PHASES[l.joinedPhase].end}` : 'Joined after 2050'} · by {linkWords(l)}</span>
              </div>
              <IslandMap data={data} link={l} />
              <div className="grid grid-cols-4 gap-px border-t-2 border-black bg-black text-center phone:grid-cols-2">
                <Fact label="Joined" value={l.joinedPhase !== null ? String(PHASES[l.joinedPhase].end) : 'after 2050'} />
                <Fact label="Across the sea" value={`${l.km.toFixed(2)} km`} />
                <Fact label="Cost of the link" value={`S$${int(l.cost)}m`} />
                <Fact label="Homes on the island, 2050" value={int(l.homes)} />
              </div>
            </div>
          ))}
          <IslandKey />
          <ol className="ebrc-paras mt-4">
            {r.islandLinks.map((l) => P(<>
              {l.island.name} ({ha(l.island.cells.length * CELL_HA)} today) {l.joinedPhase !== null ? <>is joined to the main island in {PHASES[l.joinedPhase].label} by {linkWords(l)}</> : <>will be joined to the main island by {linkWords(l)} once the reclaimed land has settled, after 2050</>}, spanning about {l.km.toFixed(2)} km of sea at a cost of about S${int(l.cost)} million.
              {' '}{l.areaHa > l.island.cells.length * CELL_HA ? `With the new land around it, the island covers ${ha(l.areaHa)}` : `The island covers ${ha(l.areaHa)}`}{l.homes > 0 ? ` and holds ${int(l.homes)} homes in 2050.` : ' and has no homes in 2050.'}
            </>, l.island.name))}
            {P(<>A fixed link lets people, goods, buses and emergency services reach the island at any hour without a ferry. The island's land can then be planned as part of the main island: for homes and jobs, or kept for nature and recreation with easy access.</>)}
            {r.islandLinks.some((l) => l.kinds.includes('land')) && P(<>Joining islands with reclaimed land closes the channel between them. Tidal flows, mangroves, seagrass and coral in the channel would need to be studied, and culverts or a short bridge kept where water must still flow.</>)}
            {P(<>Links across the water must leave room for shipping and be built above future sea levels. Their costs are shown in Annex A.</>)}
          </ol>
        </Page>
      )}

      {/* ---------------------------------------------------------------- 1 summary */}
      <Page id="plan-summary" n={next()}>
        <h3 className="ebrc-heading">Chapter 1 · Summary of the plan</h3>
        <ol className="ebrc-paras">
          {P(<>This plan covers the years {PHASES[0].label.slice(0, 4)} to 2050 in five phases: {PHASES.map((p) => p.label).join(', ')}.</>)}
          {P(<>It completes {int(r.homesBuilt)} homes and redevelops sites with {int(r.homesDemolished)} older homes. In 2050 there are {int(last.supply)} homes for {int(last.demand)} resident households.</>)}
          {P(<>It reclaims {(totalReclaimed * CELL_HA / 100).toFixed(1)} km² of land and changes the use of {int(r.projects.filter((p) => p.zone !== 'reclaim').reduce((s, p) => s + p.cells, 0) * CELL_HA)} ha. Land in use grows from {first.landKm2.toFixed(0)} km² to {last.landKm2.toFixed(0)} km² (model area).</>)}
          {P(<>Parks and nature {r.greenChange >= 0 ? 'grow' : 'shrink'} by {ha(Math.abs(r.greenChange))} to {ha(last.greenHa)}, or {last.greenPer1000.toFixed(2)} ha for every 1,000 residents.</>)}
          {P(<>{pc(last.reach.station)} of homes are within 1 km of an MRT station in 2050, compared with {pc(first.reach.station)} today.</>)}
          {P(<>Total spending is about S${r.totalSpend.toFixed(0)} billion over 25 years, against a budget of S${r.policy.budget} billion per phase.</>)}
          {P(<>The plan's liveability score is {last.score} out of 100 in 2050 ({scoreWord(last.score).toLowerCase()}), compared with {first.score} today. The score combines housing (25%), access to services (20%), services keeping up with demand (20%), parks (15%), jobs (10%) and keeping within budget (10%).</>)}
        </ol>
        <table className="ebrc-table mx-auto mt-4 w-full">
          <thead><tr><th className="text-left">Key figures</th>{years.map((y) => <th key={y}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="Total population (m)" values={r.snaps.map((s) => (s.pop.total / 1e6).toFixed(2))} />
            <Row label="Homes ('000)" values={r.snaps.map((s) => int(s.supply / 1000))} />
            <Row label="Resident households ('000)" values={r.snaps.map((s) => int(s.demand / 1000))} />
            <Row label="Land (km², model)" values={r.snaps.map((s) => s.landKm2.toFixed(0))} />
            <Row label="Parks & nature (ha per 1,000)" values={r.snaps.map((s) => s.greenPer1000.toFixed(2))} />
            <Row label="Homes near MRT" values={r.snaps.map((s) => pc(s.reach.station))} />
            <Row label="Jobs per worker" values={r.snaps.map((s) => s.jobsRatio.toFixed(2))} />
            <Row label="Liveability score" values={r.snaps.map((s) => String(s.score))} />
          </tbody>
        </table>
      </Page>

      {/* ---------------------------------------------------------------- 2 population */}
      <Page id="plan-population" n={next()}>
        <h3 className="ebrc-heading">Chapter 2 · Population outlook</h3>
        <ol className="ebrc-paras">
          {P(<>The plan starts from the population at the end of June 2026: {m(BASELINE.total)} people, made up of {m(BASELINE.citizens)} citizens, {m(BASELINE.prs)} permanent residents and {m(BASELINE.nonResidents)} non-residents. The resident median age is {BASELINE.medianAge} years.</>)}
          {P(<>The projection assumes a fertility rate of {r.policy.tfr.toFixed(2)} from 2031, {int(r.policy.netMigration)} new citizens and permanent residents a year (net), non-resident growth of {r.policy.nonResidentGrowth.toFixed(1)}% a year, and life expectancy rising to {r.policy.lifeExpectancy.toFixed(1)} years by 2050.</>)}
          {P(<>On these assumptions the resident population {p50.residents >= p26.residents ? 'grows' : 'falls'} from {m(p26.residents)} to {m(p50.residents)}. Residents aged 65 and over rise from {int(p26.bands[3])} to {int(p50.bands[3])}. For every resident aged 65 and over there are {p50.supportRatio.toFixed(1)} of working age (20–64) in 2050, compared with {p26.supportRatio.toFixed(1)} today.</>)}
          {P(<>Households shrink as the population ages, from about {p26.householdSize.toFixed(2)} to {p50.householdSize.toFixed(2)} people. Resident households therefore rise from {int(p26.households)} to {int(p50.households)}, even where the population itself grows slowly.</>)}
        </ol>
        <table className="ebrc-table mx-auto mt-4 w-full">
          <thead><tr><th className="text-left">Population</th>{years.map((y) => <th key={y}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="Residents (m)" values={r.snaps.map((s) => (s.pop.residents / 1e6).toFixed(2))} />
            <Row label="Non-residents (m)" values={r.snaps.map((s) => (s.pop.nonResidents / 1e6).toFixed(2))} />
            <Row label="Aged under 20 ('000)" values={r.snaps.map((s) => int((s.pop.bands[0] + s.pop.bands[1]) / 1000))} />
            <Row label="Aged 65+ ('000)" values={r.snaps.map((s) => int(s.pop.bands[3] / 1000))} />
            <Row label="Share aged 65+" values={r.snaps.map((s) => pc(s.pop.bands[3] / s.pop.residents))} />
            <Row label="Median age" values={r.snaps.map((s) => s.pop.medianAge.toFixed(1))} />
            <Row label="Working-age per senior" values={r.snaps.map((s) => s.pop.supportRatio.toFixed(1))} />
            <Row label="Births a year ('000)" values={r.snaps.map((s) => (s.year === 2026 ? '–' : int(s.pop.births / 1000)))} />
          </tbody>
        </table>
      </Page>

      {/* ---------------------------------------------------------------- 3 land use */}
      <Page id="plan-land" n={next()}>
        <h3 className="ebrc-heading">Chapter 3 · How the land is used</h3>
        <ol className="ebrc-paras">
          {P(<>Table 3.1 sets out the land budget: the area given to each use today and in 2050. Areas are measured in hexagons of {CELL_HA.toFixed(1)} ha, each counted by its main use. They are model estimates, not survey figures.</>)}
          {P(<>Land that is cleared but not yet rebuilt by 2050 is shown as "cleared site". Projects still under construction in 2050 are counted under their final use.</>)}
        </ol>
        <table className="ebrc-table mx-auto mt-3 w-full">
          <thead><tr><th className="text-left">Table 3.1 · Land use</th><th>2026 (ha)</th><th>2050 (ha)</th><th>Change</th><th>Share 2050</th></tr></thead>
          <tbody>
            {r.landUse.map((g) => (
              <GroupRows key={g.group} group={g.group} zones={g.zones} total={last.landKm2 * 100} />
            ))}
            <tr className="font-bold"><td className="text-left">Total</td><td>{int(first.landKm2 * 100)}</td><td>{int(last.landKm2 * 100)}</td><td>{last.landKm2 >= first.landKm2 ? '+' : '−'}{int(Math.abs(last.landKm2 - first.landKm2) * 100)}</td><td>100%</td></tr>
          </tbody>
        </table>
      </Page>

      {/* ---------------------------------------------------------------- 4 housing */}
      <Page id="plan-housing" n={next()}>
        <h3 className="ebrc-heading">Chapter 4 · Homes for every household</h3>
        <ol className="ebrc-paras">
          {P(<>Table 4.1 shows the housing programme by phase. Homes demolished for redevelopment are taken out when work starts, and their residents must be rehoused before then. Compensation of about S${(ACQUIRE_PER_HOME * 1000).toFixed(0)},000 a home is included in the costs.</>)}
          {r.housingMix.length > 0 && P(<>New homes by type: {r.housingMix.map((x) => `${ZONE[x.id].label.toLowerCase()} ${int(x.homes)}`).join('; ')}.</>)}
          {P(<>{last.supply >= last.demand ? `In 2050 there are about ${int(last.supply - last.demand)} more homes than resident households. Some spare homes are needed so that people can move and so that homes can be renewed.` : `In 2050 there is a shortfall of about ${int(last.demand - last.supply)} homes. Waiting times would lengthen and prices would rise unless more homes are built.`}</>)}
        </ol>
        <table className="ebrc-table mx-auto mt-3 w-full">
          <thead><tr><th className="text-left">Table 4.1 · Homes</th>{PHASES.map((p) => <th key={p.id}>{p.label}</th>)}</tr></thead>
          <tbody>
            <Row label="Completed" values={r.snaps.slice(1).map((s) => int(s.homesCompleted))} />
            <Row label="Demolished" values={r.snaps.slice(1).map((s) => int(s.homesDemolished))} />
            <Row label="Homes at end" values={r.snaps.slice(1).map((s) => int(s.supply))} />
            <Row label="Households at end" values={r.snaps.slice(1).map((s) => int(s.demand))} />
            <Row label="Surplus / shortfall" values={r.snaps.slice(1).map((s) => `${s.supply >= s.demand ? '+' : '−'}${int(Math.abs(s.supply - s.demand))}`)} />
          </tbody>
        </table>
        <table className="ebrc-table mx-auto mt-4 w-full">
          <thead><tr><th className="text-left">Table 4.2 · By region</th><th>Homes 2026</th><th>Homes 2050</th><th>Jobs 2026</th><th>Jobs 2050</th></tr></thead>
          <tbody>
            {PLANNER_REGIONS.map((g) => (
              <tr key={g}><td className="text-left">{g}</td><td>{int(first.byRegion[g].homes)}</td><td>{int(last.byRegion[g].homes)}</td><td>{int(first.byRegion[g].jobs)}</td><td>{int(last.byRegion[g].jobs)}</td></tr>
            ))}
          </tbody>
        </table>
      </Page>

      {/* ---------------------------------------------------------------- 5 new land */}
      <Page id="plan-newland" n={next()}>
        <h3 className="ebrc-heading">Chapter 5 · New land from the sea</h3>
        <ol className="ebrc-paras">
          {totalReclaimed ? (
            <>
              {P(<>The plan reclaims {(totalReclaimed * CELL_HA / 100).toFixed(1)} km² in total: {r.reclaimByPhase.map((c, k) => `${(c * CELL_HA / 100).toFixed(1)} km² in ${PHASES[k].label}`).join(', ')}.</>)}
              {P(<>The largest areas are off {r.reclaimAreas.slice(0, 5).map((a) => `${a.area} (${a.km2.toFixed(1)} km²)`).join(', ')}.</>)}
              {P(<>New land is reclaimed outwards from the existing coast, within Singapore's waters and clear of the main shipping lanes. Land in shallow water can be built on after about five years. Land in deeper water needs ten to fifteen years to settle. Sand is scarce, so no more than {SAND_CAP} hexagons (about {Math.round(SAND_CAP * CELL_HA / 100)} km²) are reclaimed in any one phase.</>)}
              {P(<>New land should be raised well above today's sea level to allow for rising seas, and the coast in front of it protected with seawalls or polders. These costs are included only in part.</>)}
            </>
          ) : P(<>The plan does not reclaim new land. All growth is met by using existing land more intensively.</>)}
        </ol>
        <div className="mt-4 border border-black"><HexCanvas data={data} fill={fills.changes} title="Map of changes by phase, including reclaimed land" /></div>
        <PhaseKey />
      </Page>

      {/* ---------------------------------------------------------------- 6 living */}
      <Page id="plan-living" n={next()}>
        <h3 className="ebrc-heading">Chapter 6 · Green spaces, transport and services</h3>
        <ol className="ebrc-paras">
          {P(<>Parks, nature reserves and beaches cover {ha(last.greenHa)} in 2050 ({r.greenChange >= 0 ? '+' : '−'}{ha(Math.abs(r.greenChange))} on today). That is {last.greenPer1000.toFixed(2)} ha for every 1,000 residents, against a target of 0.8 ha. {r.natureAdded > 0 ? `${ha(r.natureAdded)} of new nature reserves are gazetted.` : r.natureAdded < 0 ? `${ha(-r.natureAdded)} of nature reserve land is lost.` : ''} {pc(last.reach.park)} of homes are within 500 m of a park.</>)}
          {P(<>The plan {r.stationsAdded > 0 ? `adds ${r.stationsAdded} MRT station sites` : 'adds no MRT stations'}. {pc(last.reach.station)} of homes are within 1 km of a station in 2050, against {pc(first.reach.station)} today.</>)}
          {r.links.length > 0 && P(<>New roads and fixed links: {listWords(r.links.map((l) => `${l.zone === 'highway' ? 'expressways' : `${ZONE[l.zone].label.toLowerCase()}s`} of about ${(l.cells * 0.25).toFixed(1)} km (${listWords(l.areas.slice(0, 3))}${l.areas.length > 3 ? ' and elsewhere' : ''})`))}, costing about S${(r.links.reduce((n, l) => n + l.cost, 0) / 1000).toFixed(1)} billion in all.</>)}
          {P(<>School places compared with children score {last.schoolIndex.toFixed(2)} against 1.00 today. {last.schoolIndex >= 1 ? 'Falling numbers of children free up places, and some schools can be merged or reused.' : 'More schools are needed.'}</>)}
          {P(<>Hospitals and eldercare compared with an ageing population score {last.healthIndex.toFixed(2)} against 1.00 today. {last.healthIndex >= 1 ? 'Capacity keeps pace with the growing number of seniors.' : 'Capacity does not keep pace with the growing number of seniors, and hospitals would be crowded.'}</>)}
          {P(<>Utilities (power, NEWater, desalination and waste-to-energy) score {last.utilityIndex.toFixed(2)} against population growth.</>)}
        </ol>
      </Page>

      {/* ---------------------------------------------------------------- 7 economy */}
      <Page id="plan-economy" n={next()}>
        <h3 className="ebrc-heading">Chapter 7 · Jobs and the economy</h3>
        <ol className="ebrc-paras">
          {P(<>The plan provides about {m(last.jobsTotal)} jobs in 2050 for a labour force of {m(last.pop.labourForce)}, or {last.jobsRatio.toFixed(2)} jobs per worker (today: {first.jobsRatio.toFixed(2)}).</>)}
          {P(<>{pc(last.jobsOutsideCentral)} of jobs are outside the Central Region in 2050, against {pc(first.jobsOutsideCentral)} today. More jobs near homes in the regions shorten journeys and ease crowding in the city.</>)}
          {P(<>Factories, business parks, data centres and ports take {pc(last.industryShare)} of land in 2050 ({ha(last.industryHa)}). Manufacturing is about a fifth of the economy and needs land that cannot easily be moved.</>)}
          {P(<>Farms take {ha(last.farmHa)}, towards the goal of producing 30% of nutritional needs locally.</>)}
        </ol>
      </Page>

      {/* ---------------------------------------------------------------- 8 finance */}
      <Page id="plan-finance" n={next()}>
        <h3 className="ebrc-heading">Chapter 8 · Financing the plan</h3>
        <ol className="ebrc-paras">
          {P(<>Spending is counted in the phase in which a project is decided. It covers the government's share of building, land reclamation, and acquisition and resettlement for redevelopment. Proceeds from land sales go to the national reserves and are not counted.</>)}
          {P(<>Total spending is about S${r.totalSpend.toFixed(0)} billion. {r.snaps.slice(1).filter((s) => s.spend > s.budget).length ? `Spending exceeds the budget of S$${r.policy.budget} billion in ${r.snaps.slice(1).filter((s) => s.spend > s.budget).map((s) => PHASES[s.phase].label).join(', ')}.` : `Every phase keeps within the budget of S$${r.policy.budget} billion.`}</>)}
        </ol>
        <table className="ebrc-table mx-auto mt-3 w-full">
          <thead><tr><th className="text-left">Table 8.1 · S$ billion</th>{PHASES.map((p) => <th key={p.id}>{p.label}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {kinds.filter((k) => r.spendByKind[k]).map((k) => (
              <Row key={k} label={k} values={[...r.snaps.slice(1).map((s) => ((s.spendBy[k] ?? 0) / 1000).toFixed(1)), (r.spendByKind[k] ?? 0).toFixed(1)]} />
            ))}
            <tr className="font-bold"><td className="text-left">Total</td>{r.snaps.slice(1).map((s) => <td key={s.phase}>{s.spend.toFixed(1)}</td>)}<td>{r.totalSpend.toFixed(1)}</td></tr>
            <Row label="Budget" values={[...PHASES.map(() => String(r.policy.budget)), String(r.policy.budget * PHASES.length)]} />
          </tbody>
        </table>
      </Page>

      {/* ---------------------------------------------------------------- 9 risks */}
      <Page id="plan-risks" n={next()}>
        <h3 className="ebrc-heading">Chapter 9 · Risks and shortfalls</h3>
        <ol className="ebrc-paras">
          {topIssues.length + warnIssues.length === 0 && P(<>The checks found no shortfall in any phase.</>)}
          {topIssues.map((i) => P(i.text, i.text))}
          {warnIssues.map((i) => P(i.text, i.text))}
          {P(<>Projections are uncertain. Fertility, immigration and the economy may differ from the assumptions, so the plan should be reviewed every five years, as land use plans are.</>)}
          {P(<>Rising sea levels threaten low-lying coasts. New and existing coastal land will need protection, and reclaimed land should be built higher.</>)}
        </ol>
      </Page>

      {/* ---------------------------------------------------------------- annex A */}
      <Page id="plan-annex-a" n={next()}>
        <AnnexHead letter="A" title="Schedule of projects" />
        {r.projects.length ? (
          <div className="overflow-x-auto">
            <table className="ebrc-table w-full">
              <thead><tr><th>Phase</th><th className="text-left">Project</th><th className="text-left">Area</th><th>ha</th><th>Homes</th><th>S$m</th><th>Ready</th></tr></thead>
              <tbody>
                {r.projects.slice(0, 120).map((p, k) => (
                  <tr key={k}>
                    <td>{PHASES[p.phase].label}</td>
                    <td className="text-left">{projectLabel(p)}</td>
                    <td className="text-left">{p.area}</td>
                    <td>{int(p.cells * CELL_HA)}</td>
                    <td>{p.homes ? int(p.homes) : '–'}</td>
                    <td>{int(p.cost)}</td>
                    <td>{p.done <= 4 ? PHASES[p.done].end : 'after 2050'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.projects.length > 120 && <p className="mt-2 text-[12px]">… and {r.projects.length - 120} smaller projects.</p>}
          </div>
        ) : <p>No projects have been planned.</p>}
      </Page>

      {/* ---------------------------------------------------------------- annex B */}
      <Page id="plan-annex-b" n={next()}>
        <AnnexHead letter="B" title="Land use maps" />
        <h4 className="ebrc-subheading">Map B.1 · Land use, 2026</h4>
        <div className="border border-black"><HexCanvas data={data} fill={fills.before} title="Land use in 2026" /></div>
        <h4 className="ebrc-subheading">Map B.2 · Land use, 2050</h4>
        <div className="border border-black"><HexCanvas data={data} fill={fills.after} title="Land use in 2050" /></div>
        <ZoneKey s={last} />
      </Page>

      {/* ---------------------------------------------------------------- annex C */}
      <Page id="plan-annex-c" n={next()}>
        <AnnexHead letter="C" title="Method and sources" />
        <ol className="ebrc-paras">
          {P(<>The island is divided into hexagons about 250 m across ({CELL_HA.toFixed(1)} ha), and each takes the main land use of the URA Master Plan 2019. Coastal hexagons that are at least half land count as land, so the model's land area ({first.landKm2.toFixed(0)} km²) is a little larger than the official figure.</>)}
          {P(<>Residents are placed using Census 2020 subzone figures, spread over residential floor space. Each planning region and age band is then scaled to SingStat's end-June 2026 figures. Existing homes are estimated from residents and household size.</>)}
          {P(<>Jobs are modelled from floor space by land use and calibrated to the size of the labour force. They are indicative only.</>)}
          {P(<>The population is projected with a cohort-component model in five-year age groups: survival from a Gompertz life table matched to life expectancy, births from the fertility rate and women aged 15–49, and immigration mostly at ages 20–44.</>)}
          {P(<>Costs, homes and jobs per hexagon are rough planning-level estimates chosen for this simulation. They are not official figures.</>)}
        </ol>
        <h4 className="ebrc-subheading">Sources</h4>
        <ul className="ml-6 list-disc text-[13.5px]">{SOURCES.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="mt-6 border border-black p-3 text-[12px] leading-snug">{DISCLAIMER}</p>
      </Page>
    </>
  )
}

function Page({ id, n, cover, children }: { id: string; n: number; cover?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="ebrc-page scroll-mt-3">
      <div className="ebrc-running" aria-hidden>{NOTICE}</div>
      {children}
      {!cover && <div className="ebrc-folio">— {n} —</div>}
    </section>
  )
}

function AnnexHead({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="mb-4 text-center">
      <div className="text-right text-[13px] font-bold">ANNEX {letter}</div>
      <h3 className="ebrc-heading mt-2">{title}</h3>
    </div>
  )
}

function Row({ label, values }: { label: string; values: string[] }) {
  return <tr><td className="text-left">{label}</td>{values.map((v, k) => <td key={k}>{v}</td>)}</tr>
}

function GroupRows({ group, zones, total }: { group: string; zones: { id: keyof typeof ZONE; ha0: number; ha1: number }[]; total: number }) {
  return (
    <>
      <tr><td className="text-left font-bold" colSpan={5}>{group}</td></tr>
      {zones.map((z) => (
        <tr key={z.id}>
          <td className="text-left">&nbsp;&nbsp;{ZONE[z.id].label}</td>
          <td>{int(z.ha0)}</td>
          <td>{int(z.ha1)}</td>
          <td>{z.ha1 - z.ha0 >= 0 ? '+' : '−'}{int(Math.abs(z.ha1 - z.ha0))}</td>
          <td>{pc(z.ha1 / total, 1)}</td>
        </tr>
      ))}
    </>
  )
}

function PhaseKey() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
      {PHASES.map((p) => <span key={p.id} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 border border-black" style={{ background: PHASE_COLORS[p.id] }} />{p.label}</span>)}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 border border-black bg-[#e5e7eb]" />Unchanged</span>
    </div>
  )
}

const ISLAND = { old: '#d1d5db', island: '#15803d', newLand: '#e7d7b0', link: '#dc2626', sea: '#dbeafe' }

/** A close-up of one island, the new land around it and the link to the main island. */
function IslandMap({ data, link }: { data: PlannerData; link: IslandLink }) {
  const { sim } = usePlannerDerived()
  const fill = useMemo(() => {
    const isle = new Set(link.island.cells)
    const path = new Set(link.cells)
    const last = sim.snaps[sim.snaps.length - 1]
    // frame the island and the link with about 1.5 km of sea around them
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (const i of [...link.island.cells, ...link.cells]) {
      const [x, y] = data.center[i]
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y)
    }
    const pad = 0.014
    return data.center.map(([x, y], i) => {
      if (x < w - pad || x > e + pad || y < s - pad || y > n + pad) return null
      const z = last.zone[i]
      if (path.has(i)) return isCrossing(z) ? ZONE[z!].color : ISLAND.link
      if (isle.has(i)) return ISLAND.island
      if (data.land[i]) return ISLAND.old
      if (sim.timelines[i].landReady !== Infinity) return ISLAND.newLand
      if (isCrossing(z)) return ZONE[z!].color
      return ISLAND.sea
    })
  }, [data, link, sim])
  return <HexCanvas data={data} fill={fill} height={420} maxHeight={420} title={`Map of ${link.island.name} and its link to the main island`} />
}

function IslandKey() {
  const items: [string, string][] = [[ISLAND.island, 'Island today'], [ISLAND.old, 'Other land today'], [ISLAND.newLand, 'New land'], [ISLAND.link, 'Land link'], [ZONE.bridge.color, 'Bridge'], [ZONE.causeway.color, 'Causeway'], [ZONE.tunnel.color, 'Undersea tunnel']]
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
      {items.map(([c, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 border border-black" style={{ background: c }} />{label}</span>)}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-2 py-2">
      <div className="text-[20px] font-bold leading-tight phone:text-[16px]">{value}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </div>
  )
}

function ZoneKey({ s }: { s: Snapshot }) {
  const used = Object.keys(s.byZone) as (keyof typeof ZONE)[]
  return (
    <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-0.5 text-[11.5px] phone:grid-cols-2">
      {used.map((z) => <span key={z} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 shrink-0 border border-black" style={{ background: ZONE[z].color }} />{ZONE[z].label}</span>)}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 shrink-0 border border-black bg-[#e7d7b0]" />Land being reclaimed</span>
    </div>
  )
}
