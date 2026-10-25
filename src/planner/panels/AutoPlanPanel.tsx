import { useState } from 'react'
import { ArrowLeft, Building, Building2, CheckCircle2, HeartPulse, Leaf, Loader2, MapPinned, Scale, Undo2, Wand2, Waves, Wrench, type LucideIcon } from 'lucide-react'
import { Button, Section } from '../../components/ui'
import { usePlanner } from '../state/planner'
import { PHASES } from '../model/population'
import { STRATEGIES, type AutoOptions, type PhaseSummary } from '../model/autoplan'
import { SAND_CAP } from '../model/simulate'
import { CELL_HA, DENSITIES, ZONE, type Density, type ZoneId } from '../model/zones'
import { PolicySlider } from './common'
import { sgd, thousands } from './format'

const ICONS: Record<string, LucideIcon> = { balanced: Scale, compact: Building2, sea: Waves, garden: Leaf, regions: MapPinned, ageing: HeartPulse }
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Auto-plan: choose a strategy and goals, and the planner builds the whole plan phase by phase. */
export function AutoPlanPanel({ onClose }: { onClose: () => void }) {
  const strategy = usePlanner((s) => s.strategy)
  const setStrategy = usePlanner((s) => s.setStrategy)
  const o = usePlanner((s) => s.autoOptions)
  const set = usePlanner((s) => s.setAutoOptions)
  const phase = usePlanner((s) => s.phase)
  const runAuto = usePlanner((s) => s.runAuto)
  const result = usePlanner((s) => s.autoResult)
  const [running, setRunning] = useState(false)
  const [custom, setCustom] = useState(false)

  const generate = () => {
    setRunning(true)
    // let the spinner paint before the planner runs
    setTimeout(() => { runAuto(); setRunning(false) }, 30)
  }
  const choice = 'flex-1 py-1.5 text-[11px] phone:min-h-9'
  const on = 'bg-slate-200 font-semibold text-slate-900'
  const off = 'text-slate-300 hover:bg-slate-800'

  return (
    <div>
      <Section title={<span className="flex items-center gap-1.5 text-sm normal-case tracking-normal text-slate-100"><Wand2 size={15} aria-hidden /> Auto-plan</span>} right={<Button onClick={onClose}><ArrowLeft size={14} aria-hidden /> Manual tools</Button>}>
        <p className="text-xs leading-relaxed text-slate-400">Pick a strategy and the planner builds homes, schools, hospitals, parks, MRT stations, jobs and new land for you, phase by phase, to meet the projected population within your budget. You can undo it or fine-tune by hand afterwards.</p>
      </Section>

      <Section title="Strategy">
        <div className="grid grid-cols-2 gap-1.5">
          {STRATEGIES.map((s) => {
            const Icon = ICONS[s.id] ?? Scale
            return (
              <button key={s.id} onClick={() => setStrategy(s.id)} aria-pressed={strategy === s.id} title={s.desc}
                className={`flex items-start gap-2 rounded-md border p-2 text-left ${strategy === s.id ? 'border-emerald-400 bg-emerald-500/15' : 'border-slate-800 hover:bg-slate-900'}`}>
                <Icon size={16} className={`mt-0.5 shrink-0 ${strategy === s.id ? 'text-emerald-300' : 'text-slate-400'}`} aria-hidden />
                <span className="text-xs font-semibold text-slate-100">{s.label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-300">{STRATEGIES.find((s) => s.id === strategy)?.desc}</p>
      </Section>

      <Section title="What to plan">
        <div className="text-[11px] text-slate-400">Phases</div>
        <div className="mt-1 flex overflow-hidden rounded-md border border-slate-700" role="group" aria-label="Phases to plan">
          {([['all', 'All 2026–50'], ['fromCurrent', `From ${PHASES[phase].label}`], ['current', `Only ${PHASES[phase].label}`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => set({ phases: id })} aria-pressed={o.phases === id} className={`${choice} ${o.phases === id ? on : off}`}>{label}</button>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Your existing plan</div>
        <div className="mt-1 flex overflow-hidden rounded-md border border-slate-700" role="group" aria-label="Existing plan">
          {([['add', 'Add to it'], ['replace', 'Replace those phases']] as const).map(([id, label]) => (
            <button key={id} onClick={() => set({ mode: id })} aria-pressed={o.mode === id} className={`${choice} ${o.mode === id ? on : off}`}>{label}</button>
          ))}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">{o.mode === 'add' ? 'Keeps everything you have planned and fills only what is still needed.' : 'Clears the phases being planned (earlier phases stay) and plans them afresh.'}</p>

        <button onClick={() => setCustom(!custom)} className="mt-3 text-[11px] font-medium text-sky-300 hover:underline" aria-expanded={custom}>
          {custom ? 'Hide' : 'Customise'} goals and sites
        </button>
        {custom && <Customise o={o} set={set} />}

        <button onClick={generate} disabled={running}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
          {running ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Planning…</> : <><Wand2 size={16} aria-hidden /> Generate plan</>}
        </button>
      </Section>

      {result && <AutoResultCard />}
    </div>
  )
}

function Customise({ o, set }: { o: AutoOptions; set: (p: Partial<AutoOptions>) => void }) {
  const site = (k: keyof AutoOptions['sites'], label: string, hint: string) => (
    <label className="flex items-start gap-2 py-0.5 text-xs text-slate-300" title={hint}>
      <input type="checkbox" className="mt-0.5" checked={o.sites[k]} onChange={(e) => set({ sites: { ...o.sites, [k]: e.target.checked } })} />
      <span>{label}<span className="block text-[10px] leading-snug text-slate-500">{hint}</span></span>
    </label>
  )
  return (
    <div className="mt-2 rounded-md border border-slate-800 p-2.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Where to build</div>
      {site('landBank', 'Land bank', 'Vacant state land and reserve sites')}
      {site('openSpace', 'Open greenery', 'Undeveloped green land that is not a nature reserve')}
      {site('redevelop', 'Redevelop older estates', 'Rebuild low-rise HDB and industry beside homes at higher density; residents are rehoused')}
      {site('reclaim', 'Reclaim land', 'New land from the sea, ready for later phases')}
      {o.sites.reclaim && (
        <>
          <PolicySlider label="Reclamation per phase" value={o.reclaimPerPhase} min={20} max={SAND_CAP} step={10} format={(v) => `${v} hex (${(v * CELL_HA / 100).toFixed(0)} km²)`} onChange={(reclaimPerPhase) => set({ reclaimPerPhase })} />
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={o.reclaimAlways} onChange={(e) => set({ reclaimAlways: e.target.checked })} /> Reclaim every phase, not only when land runs short</label>
        </>
      )}
      <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Housing</div>
      <PolicySlider label="Public housing (HDB and EC) share" value={o.publicShare} min={0.4} max={1} step={0.05} format={pct} onChange={(publicShare) => set({ publicShare })} />
      <div className="mt-1 flex overflow-hidden rounded-md border border-slate-700 text-[11px]" role="group" aria-label="Density">
        {(['auto', 0, 1, 2] as const).map((d) => (
          <button key={d} onClick={() => set({ density: d as 'auto' | Density })} aria-pressed={o.density === d}
            className={`flex-1 py-1 phone:min-h-9 ${o.density === d ? 'bg-slate-200 font-semibold text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>
            {d === 'auto' ? 'Auto' : DENSITIES[d].label}
          </button>
        ))}
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">Auto builds high density within 500 m of MRT.</p>
      <PolicySlider label="Spare homes above households" value={o.housingBuffer} min={0} max={0.1} step={0.01} format={pct} onChange={(housingBuffer) => set({ housingBuffer })} />
      <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Goals</div>
      <PolicySlider label="Parks and nature per 1,000 residents" value={o.greenTarget} min={0.6} max={1.6} step={0.05} format={(v) => `${v.toFixed(2)} ha`} onChange={(greenTarget) => set({ greenTarget })} />
      <PolicySlider label="Homes within 1 km of MRT" value={o.mrtTarget} min={0.6} max={0.98} step={0.01} format={pct} onChange={(mrtTarget) => set({ mrtTarget })} />
      <PolicySlider label="Hospitals and eldercare (vs demand)" value={o.careTarget} min={0.9} max={1.3} step={0.01} format={(v) => v.toFixed(2)} onChange={(careTarget) => set({ careTarget })} />
      <PolicySlider label="Schools and utilities (vs demand)" value={o.serviceTarget} min={0.9} max={1.3} step={0.01} format={(v) => v.toFixed(2)} onChange={(serviceTarget) => set({ serviceTarget })} />
      <PolicySlider label="Jobs per worker" value={o.jobsTarget} min={0.9} max={1.2} step={0.01} format={(v) => v.toFixed(2)} onChange={(jobsTarget) => set({ jobsTarget })} />
      <label className="flex items-center gap-2 py-0.5 text-xs text-slate-300"><input type="checkbox" checked={o.decentralise} onChange={(e) => set({ decentralise: e.target.checked })} /> New jobs outside the Central Region</label>
      <label className="flex items-center gap-2 py-0.5 text-xs text-slate-300"><input type="checkbox" checked={o.ageing} onChange={(e) => set({ ageing: e.target.checked })} /> Eldercare where seniors live</label>
      <PolicySlider label="Budget the planner may use" value={o.budgetUse} min={0.3} max={1} step={0.05} format={pct} onChange={(budgetUse) => set({ budgetUse })} hint="Share of each phase's budget, after anything you planned yourself." />
    </div>
  )
}

/** What the last auto-plan or fix did, phase by phase. */
export function AutoResultCard() {
  const result = usePlanner((s) => s.autoResult)!
  const undo = usePlanner((s) => s.undo)
  const clear = usePlanner((s) => s.clearAutoResult)
  const unmet = result.summary.flatMap((x) => x.unmet)
  const total = (f: (x: PhaseSummary) => number) => result.summary.reduce((n, x) => n + f(x), 0)
  return (
    <Section title={result.kind === 'auto' ? 'Auto-plan result' : 'Fix my plan result'} right={
      <div className="flex gap-1">
        <Button onClick={() => { undo(); clear() }} title="Undo"><Undo2 size={13} aria-hidden /> Undo</Button>
        <Button onClick={clear} aria-label="Dismiss">OK</Button>
      </div>
    }>
      <div className="flex items-center gap-2 text-xs text-slate-200">
        <CheckCircle2 size={14} className="shrink-0 text-emerald-400" aria-hidden />
        <span>Plan checks: {result.issuesBefore} → <b>{result.issuesAfter}</b>. {thousands(total((x) => x.homes))} homes, {total((x) => Object.entries(x.added).filter(([z]) => z !== 'reclaim').reduce((n, [, v]) => n + (v ?? 0), 0)).toLocaleString('en-SG')} projects{total((x) => x.added.reclaim ?? 0) ? `, ${(total((x) => x.added.reclaim ?? 0) * CELL_HA / 100).toFixed(1)} km² reclaimed` : ''}.</span>
      </div>
      <table className="mt-2 w-full text-[11px] tabular">
        <thead><tr className="text-left text-slate-500"><th className="font-normal">Phase</th><th className="text-right font-normal">Homes</th><th className="text-right font-normal">New land</th><th className="text-right font-normal">Spent</th></tr></thead>
        <tbody>
          {result.summary.map((x) => (
            <tr key={x.phase} className="border-t border-slate-800">
              <td className="py-1 text-slate-300">{PHASES[x.phase].label}</td>
              <td className="text-right">{thousands(x.homes)}</td>
              <td className="text-right">{x.added.reclaim ? `${(x.added.reclaim * CELL_HA / 100).toFixed(1)} km²` : '–'}</td>
              <td className="text-right">{sgd(x.spend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Built summary={result.summary} />
      {unmet.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-amber-200">
          {unmet.slice(0, 8).map((u) => <li key={u}>• {u}</li>)}
          {unmet.length > 8 && <li className="text-slate-400">… and {unmet.length - 8} more</li>}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-slate-500">See every phase on the map with the phase buttons, or the <Building size={10} className="inline" aria-hidden /> Changes by phase lens.</p>
    </Section>
  )
}

function Built({ summary }: { summary: PhaseSummary[] }) {
  const totals: Partial<Record<ZoneId, number>> = {}
  for (const x of summary) for (const [z, n] of Object.entries(x.added)) if (z !== 'reclaim') totals[z as ZoneId] = (totals[z as ZoneId] ?? 0) + (n ?? 0)
  const list = (Object.entries(totals) as [ZoneId, number][]).sort((a, b) => b[1] - a[1])
  if (!list.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {list.map(([z, n]) => (
        <span key={z} className="inline-flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300">
          <span className="h-2 w-2 rounded-sm" style={{ background: ZONE[z].color }} />{ZONE[z].label} {n}
        </span>
      ))}
    </div>
  )
}

/** One-click fix for the plan checks. */
export function FixButton({ className = '' }: { className?: string }) {
  const runFix = usePlanner((s) => s.runFix)
  const [running, setRunning] = useState(false)
  return (
    <button onClick={() => { setRunning(true); setTimeout(() => { runFix(); setRunning(false) }, 30) }} disabled={running}
      title="Add the cheapest projects that resolve the plan checks, across all phases (undoable)"
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-500/60 bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 disabled:opacity-60 phone:min-h-9 ${className}`}>
      {running ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Wrench size={13} aria-hidden />} Fix my plan
    </button>
  )
}
