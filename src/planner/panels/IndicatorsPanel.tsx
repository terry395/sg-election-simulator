import { useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Section, fmt } from '../../components/ui'
import { YearLine } from '../../components/HistoryCharts'
import { usePlanner } from '../state/planner'
import { usePlannerDerived } from '../state/derived'
import { PLANNER_REGIONS } from '../data/loadPlanner'
import type { Snapshot } from '../model/simulate'
import { PhasePicker } from './common'
import { AutoResultCard, FixButton } from './AutoPlanPanel'
import { scoreWord, sgd, thousands } from './format'

const SUBSCORES: { id: keyof Snapshot['subscores']; label: string; weight: number }[] = [
  { id: 'housing', label: 'Housing', weight: 25 },
  { id: 'access', label: 'Access to MRT, schools, parks, care', weight: 20 },
  { id: 'services', label: 'Schools, hospitals and utilities keep up', weight: 20 },
  { id: 'green', label: 'Parks and nature', weight: 15 },
  { id: 'jobs', label: 'Jobs for workers', weight: 10 },
  { id: 'budget', label: 'Within budget', weight: 10 },
]

export function IndicatorsPanel() {
  const { snap, today, sim } = usePlannerDerived()
  const s = snap
  return (
    <div>
      <Section title="Phase"><PhasePicker /></Section>
      <Section title={`Liveability score, ${s.year}`}>
        <div className="flex items-end gap-3">
          <div className="tabular text-4xl font-bold leading-none text-white">{s.score}</div>
          <div className="pb-0.5 text-sm text-slate-300">{scoreWord(s.score)} <span className="text-slate-500">· today {today.score}</span></div>
        </div>
        <div className="mt-2 space-y-1">
          {SUBSCORES.map((k) => (
            <div key={k.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-44 shrink-0 truncate text-slate-400" title={`${k.weight}% of the score`}>{k.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.subscores[k.id] * 100}%` }} /></div>
              <span className="tabular w-8 text-right text-slate-300">{Math.round(s.subscores[k.id] * 100)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <YearLine points={sim.snaps.map((x) => ({ label: String(x.year), value: x.score, tip: `${x.year}: ${x.score} (${scoreWord(x.score)})` }))} color="#10b981" fmt={(v) => String(Math.round(v))} domain={[0, 100]} />
        </div>
      </Section>
      <Section title="Indicators">
        <div className="space-y-1.5">
          <Indicator ok={s.supply >= s.demand * 0.98} bad={s.supply < s.demand * 0.95} label="Homes for every household"
            value={`${thousands(s.supply)} / ${thousands(s.demand)}`} sub={`${s.supply >= s.demand ? 'Surplus' : 'Shortfall'} of ${thousands(Math.abs(s.supply - s.demand))} homes. ${thousands(s.homesCompleted)} completed and ${thousands(s.homesDemolished)} demolished this phase.`} />
          <Indicator ok={s.greenPer1000 >= 0.8} bad={s.greenPer1000 < 0.6} label="Parks and nature per 1,000 residents"
            value={`${s.greenPer1000.toFixed(2)} ha`} sub={`${fmt(s.greenHa)} ha in total. Target: 0.8 ha per 1,000 residents.`} />
          <Indicator ok={s.reach.station >= 0.8} bad={s.reach.station < 0.65} label="Homes within 1 km of MRT"
            value={`${Math.round(s.reach.station * 100)}%`} sub={`${s.stations} station hexagons. Target: 8 in 10 homes within a 10-minute walk.`} />
          <Indicator ok={s.reach.park >= 0.9} bad={s.reach.park < 0.75} label="Homes within 500 m of a park" value={`${Math.round(s.reach.park * 100)}%`} />
          <Indicator ok={s.schoolIndex >= 1} bad={s.schoolIndex < 0.9} label="School places for children" value={s.schoolIndex.toFixed(2)} sub="Places compared with the number of 5–19 year-olds, against today (1.00)." />
          <Indicator ok={s.healthIndex >= 1} bad={s.healthIndex < 0.9} label="Hospitals and eldercare for an ageing population" value={s.healthIndex.toFixed(2)} sub="Capacity compared with demand (residents, with seniors counted three times), against today (1.00)." />
          <Indicator ok={s.utilityIndex >= 1} bad={s.utilityIndex < 0.9} label="Power, water and waste" value={s.utilityIndex.toFixed(2)} sub="Utility capacity compared with the total population, against today (1.00)." />
          <Indicator ok={s.jobsRatio >= 0.97 && s.jobsRatio <= 1.1} bad={s.jobsRatio < 0.92 || s.jobsRatio > 1.2} label="Jobs per worker"
            value={s.jobsRatio.toFixed(2)} sub={`${(s.jobsTotal / 1e6).toFixed(2)}m jobs for ${(s.pop.labourForce / 1e6).toFixed(2)}m workers. ${Math.round(s.jobsOutsideCentral * 100)}% of jobs are outside the Central Region.`} />
          <Indicator ok={s.industryShare >= 0.15} bad={s.industryShare < 0.12} label="Land for industry" value={`${Math.round(s.industryShare * 100)}%`} sub={`${fmt(s.industryHa)} ha of factories, business parks and ports.`} />
          <Indicator ok label="Land area" value={`${s.landKm2.toFixed(0)} km²`} sub={`${s.reclaimedKm2 > 0 ? '+' : ''}${s.reclaimedKm2.toFixed(1)} km² reclaimed since 2026. ${fmt(s.farmHa)} ha of farms, ${fmt(s.waterHa)} ha of reservoirs.`} />
          <Indicator ok={s.spend <= s.budget} bad={s.spend > s.budget * 1.1} label="Spending this phase" value={`${sgd(s.spend)} / S$${s.budget}b`} />
        </div>
      </Section>
      <Regions s={s} />
      <IssuesList />
      <FixResult />
    </div>
  )
}

function Indicator({ ok, bad, label, value, sub }: { ok: boolean; bad?: boolean; label: string; value: ReactNode; sub?: string }) {
  const Icon = ok ? CheckCircle2 : bad ? XCircle : AlertTriangle
  const color = ok ? 'text-emerald-400' : bad ? 'text-rose-400' : 'text-amber-300'
  return (
    <div className="rounded-md bg-slate-900 px-2.5 py-2">
      <div className="flex items-center gap-2 text-xs">
        <Icon size={14} className={`shrink-0 ${color}`} aria-label={ok ? 'On track' : bad ? 'Problem' : 'Watch'} />
        <span className="flex-1 text-slate-300">{label}</span>
        <span className="tabular font-semibold text-slate-100">{value}</span>
      </div>
      {sub && <div className="ml-[22px] mt-0.5 text-[11px] leading-snug text-slate-400">{sub}</div>}
    </div>
  )
}

function Regions({ s }: { s: Snapshot }) {
  return (
    <Section title={`Regions, ${s.year}`}>
      <table className="w-full text-[11px] tabular">
        <thead><tr className="text-left text-slate-500"><th className="font-normal">Region</th><th className="text-right font-normal">Homes</th><th className="text-right font-normal">Residents</th><th className="text-right font-normal">Jobs</th></tr></thead>
        <tbody>
          {PLANNER_REGIONS.map((r) => (
            <tr key={r} className="border-t border-slate-800">
              <td className="py-1 text-slate-300">{r}</td>
              <td className="text-right">{thousands(s.byRegion[r].homes)}</td>
              <td className="text-right">{thousands(s.byRegion[r].residents)}</td>
              <td className="text-right">{thousands(s.byRegion[r].jobs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-slate-500">Residents are estimated from homes. Jobs are modelled from floor space and are approximate.</p>
    </Section>
  )
}

function IssuesList() {
  const { issues } = usePlannerDerived()
  const setPhase = usePlanner((s) => s.setPhase)
  const [open, setOpen] = useState(false)
  const shown = open ? issues : issues.slice(0, 6)
  return (
    <Section title={`Plan checks (${issues.length})`} right={issues.length ? <FixButton /> : undefined}>
      {!issues.length && <div className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={14} aria-hidden /> No problems found in any phase.</div>}
      <ul className="space-y-1">
        {shown.map((i, k) => (
          <li key={k}>
            <button onClick={() => setPhase(i.phase as 0)} className="flex w-full items-start gap-1.5 text-left text-[11px] leading-snug text-slate-300 hover:text-white">
              {i.level === 'error' ? <XCircle size={13} className="mt-0.5 shrink-0 text-rose-400" aria-label="Problem" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" aria-label="Warning" />}
              <span>{i.text}</span>
            </button>
          </li>
        ))}
      </ul>
      {issues.length > 6 && <button onClick={() => setOpen(!open)} className="mt-1 text-[11px] text-sky-300 hover:underline">{open ? 'Show fewer' : `Show all ${issues.length}`}</button>}
    </Section>
  )
}

function FixResult() {
  const result = usePlanner((s) => s.autoResult)
  return result ? <AutoResultCard /> : null
}
