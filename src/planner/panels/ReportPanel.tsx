import { ScrollText } from 'lucide-react'
import { Section, Stat } from '../../components/ui'
import { usePlanner } from '../state/planner'
import { usePlannerDerived } from '../state/derived'
import { CELL_HA } from '../model/zones'
import { millions, scoreWord, sgd, thousands } from './format'

export function ReportPanel() {
  const name = usePlanner((s) => s.name)
  const setName = usePlanner((s) => s.setName)
  const setReportOpen = usePlanner((s) => s.setReportOpen)
  const plan = usePlanner((s) => s.plan)
  const { sim, issues } = usePlannerDerived()
  const first = sim.snaps[0], last = sim.snaps[sim.snaps.length - 1]
  const decisions = plan.reduce((n, p) => n + Object.keys(p).length, 0)
  const spend = sim.snaps.reduce((s, x) => s + x.spend, 0)
  const built = sim.snaps.reduce((s, x) => s + x.homesCompleted, 0)
  return (
    <div>
      <Section title="Your national plan">
        <label className="block text-xs text-slate-300">Name of the plan
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Stat label="Population 2050" value={millions(last.pop.total)} sub={`from ${millions(first.pop.total)} today`} />
          <Stat label="Homes completed" value={thousands(built)} sub={`${thousands(last.supply - last.demand)} spare in 2050`} />
          <Stat label="New land" value={`${last.reclaimedKm2.toFixed(1)} km²`} sub={`${Math.round(sim.timelines.filter((t) => t.reclaimPhase !== null).length * CELL_HA)} ha reclaimed`} />
          <Stat label="Spending" value={sgd(spend)} sub="over 25 years" />
          <Stat label="Liveability 2050" value={last.score} sub={`${scoreWord(last.score)} · today ${first.score}`} />
          <Stat label="Plan checks" value={issues.length} sub={`${issues.filter((i) => i.level === 'error').length} serious`} />
        </div>
      </Section>
      <Section title="Mock White Paper">
        <p className="text-[11px] leading-snug text-slate-400">The report sets out your plan the way a government land use plan would: population outlook, land budget, housing programme, new land, green spaces, transport, jobs, financing, risks, a schedule of every project and before-and-after maps. It is a simulation, not an official document.</p>
        <button onClick={() => setReportOpen(true)} disabled={!decisions}
          className="mt-2 flex w-full items-center gap-2 rounded-md border border-emerald-500/60 bg-gradient-to-r from-emerald-600/25 to-sky-600/20 px-3 py-2 text-left hover:from-emerald-600/40 disabled:opacity-40">
          <ScrollText size={18} className="shrink-0 text-emerald-300" aria-hidden />
          <span><span className="block text-sm font-semibold">Generate the White Paper</span><span className="block text-[11px] text-slate-300">{decisions ? `${decisions.toLocaleString('en-SG')} hexagons planned across five phases` : 'Plan something in step 2 first'}</span></span>
        </button>
      </Section>
    </div>
  )
}
