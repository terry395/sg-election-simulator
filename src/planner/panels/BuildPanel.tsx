import { useState } from 'react'
import { AlertTriangle, Eraser, Hand, Lasso, MousePointer2, PaintBucket, Paintbrush, Redo2, Trash2, Undo2, Waves, X, type LucideIcon } from 'lucide-react'
import { Button, Section, fmt } from '../../components/ui'
import { usePlanner, type PlannerTool } from '../state/planner'
import { usePlannerDerived } from '../state/derived'
import { DENSITIES, GROUPS, ZONE, ZONES, zoneCost, zoneHomes, zoneJobs, type Density } from '../model/zones'
import { SAND_CAP } from '../model/simulate'
import { reclaimedCount } from '../model/rules'
import { PRESETS } from '../model/presets'
import { LENSES, LENS_LEGEND, PHASE_COLORS } from '../map/colors'
import { PHASES } from '../model/population'
import { Meter, PhasePicker } from './common'
import { sgd, thousands } from './format'

export const PLANNER_TOOLS: { id: PlannerTool; label: string; key: string; icon: LucideIcon; hint: string }[] = [
  { id: 'inspect', label: 'Select', key: 'V', icon: MousePointer2, hint: 'Click a hexagon to see what is there and what the plan does to it' },
  { id: 'paint', label: 'Build', key: 'B', icon: Paintbrush, hint: 'Click or drag to build the chosen land use. Painting onto the sea next to the coast reclaims it first' },
  { id: 'fill', label: 'Fill', key: 'G', icon: PaintBucket, hint: 'Click a hexagon: it and every connected hexagon with the same use are rebuilt with the chosen land use' },
  { id: 'lasso', label: 'Lasso', key: 'L', icon: Lasso, hint: 'Drag a loop: every hexagon inside gets the chosen land use' },
  { id: 'reclaim', label: 'Reclaim', key: 'R', icon: Waves, hint: 'Drag over the sea to reclaim new land. It must grow out from the coast and takes 5–15 years to settle' },
  { id: 'erase', label: 'Undo cell', key: 'E', icon: Eraser, hint: 'Remove this phase\'s plans for the hexagons you drag over' },
  { id: 'pan', label: 'Pan', key: 'H', icon: Hand, hint: 'Drag to move the map (or hold Space with any tool)' },
]

export function BuildPanel() {
  return (
    <div>
      <Section title="Phase"><PhasePicker /><PhaseMeters /></Section>
      <Tools />
      <Palette />
      <Lens />
      <Scenarios />
    </div>
  )
}

function PhaseMeters() {
  const { snap } = usePlannerDerived()
  const plan = usePlanner((s) => s.plan)
  const phase = usePlanner((s) => s.phase)
  const reclaimed = reclaimedCount(plan, phase)
  const balance = snap.supply - snap.demand
  return (
    <div className="mt-2">
      <Meter label="Budget used this phase" value={snap.spend} max={snap.budget} warn={snap.spend > snap.budget}
        text={`${sgd(snap.spend)} of S$${snap.budget}b`} hint="Building, reclaiming and acquiring land decided in this phase" />
      <Meter label="Sand for reclamation" value={reclaimed} max={SAND_CAP} warn={reclaimed >= SAND_CAP}
        text={`${reclaimed} / ${SAND_CAP} hexagons`} hint="Sand is scarce: neighbouring countries ban its export. Each phase can reclaim a limited area" />
      <div className="mt-1 flex justify-between text-xs">
        <span className="text-slate-300">Homes vs households, {PHASES[phase].end}</span>
        <span className={`tabular font-semibold ${balance < -snap.demand * 0.02 ? 'text-rose-300' : 'text-emerald-300'}`}>
          {balance >= 0 ? '+' : '−'}{thousands(Math.abs(balance))} {balance >= 0 ? 'spare' : 'short'}
        </span>
      </div>
    </div>
  )
}

function Tools() {
  const tool = usePlanner((s) => s.tool)
  const setTool = usePlanner((s) => s.setTool)
  const undo = usePlanner((s) => s.undo)
  const redo = usePlanner((s) => s.redo)
  const canUndo = usePlanner((s) => s.past.length > 0)
  const canRedo = usePlanner((s) => s.future.length > 0)
  return (
    <Section title="Tools" className="phone:hidden" right={
      <div className="flex gap-1">
        <Button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={14} /></Button>
        <Button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={14} /></Button>
      </div>
    }>
      <div className="grid grid-cols-7 gap-1">
        {PLANNER_TOOLS.map((t) => (
          <button key={t.id} title={`${t.hint} (${t.key})`} onClick={() => setTool(t.id)}
            className={`flex flex-col items-center rounded-md border py-1.5 text-[10px] ${tool === t.id ? 'border-emerald-400 bg-emerald-500/20 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
            <t.icon size={16} className="mb-0.5" aria-hidden />{t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-400">{PLANNER_TOOLS.find((t) => t.id === tool)?.hint}.</p>
    </Section>
  )
}

export function NoticeBox({ text, n, onClose }: { text: string; n: number; onClose: () => void }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-600/60 bg-amber-950/40 p-2 text-[11px] leading-snug text-amber-100" role="status">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
      <span className="flex-1">{n} hexagon{n === 1 ? '' : 's'} not changed. {text}.</span>
      <button onClick={onClose} className="text-amber-300 hover:text-white" aria-label="Dismiss"><X size={13} /></button>
    </div>
  )
}

function Palette() {
  const zone = usePlanner((s) => s.zone)
  const setZone = usePlanner((s) => s.setZone)
  const density = usePlanner((s) => s.density)
  const setDensity = usePlanner((s) => s.setDensity)
  const z = ZONE[zone]
  return (
    <Section title="Land use to build">
      {GROUPS.map((g) => {
        const list = ZONES.filter((x) => x.group === g && x.buildable)
        if (!list.length) return null
        return (
          <div key={g} className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{g}</div>
            <div className="grid grid-cols-2 gap-1">
              {list.map((x) => (
                <button key={x.id} onClick={() => setZone(x.id)} aria-pressed={zone === x.id} title={x.desc}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] phone:min-h-9 ${zone === x.id ? 'border-emerald-400 bg-emerald-500/15 text-white' : 'border-slate-800 text-slate-300 hover:bg-slate-800'}`}>
                  <span className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/30" style={{ background: x.color }} />
                  <span className="truncate">{x.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div className="rounded-md border border-slate-700 bg-slate-900 p-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-3.5 w-3.5 rounded-sm" style={{ background: z.color }} />{z.label}</div>
        <p className="mt-1 text-[11px] leading-snug text-slate-300">{z.desc}</p>
        {z.density && (
          <div className="mt-2 flex overflow-hidden rounded-md border border-slate-700 text-[11px]" role="group" aria-label="Density">
            {DENSITIES.map((d) => (
              <button key={d.id} onClick={() => setDensity(d.id as Density)} aria-pressed={density === d.id}
                className={`flex-1 py-1 phone:min-h-9 ${density === d.id ? 'bg-slate-200 font-semibold text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>{d.label}</button>
            ))}
          </div>
        )}
        <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] text-slate-400">
          <div><div className="tabular text-xs font-semibold text-slate-100">{z.homes ? fmt(zoneHomes(zone, density)) : '–'}</div>homes</div>
          <div><div className="tabular text-xs font-semibold text-slate-100">{z.jobs ? fmt(zoneJobs(zone, density)) : '–'}</div>jobs</div>
          <div><div className="tabular text-xs font-semibold text-slate-100">S${fmt(zoneCost(zone, density))}m</div>cost</div>
          <div><div className="tabular text-xs font-semibold text-slate-100">{z.years ? `${z.years} yrs` : 'now'}</div>to build</div>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">Per hexagon of about 5.4 ha. Redeveloping a built-up site also pays for acquisition and resettlement.</p>
      </div>
    </Section>
  )
}

function Lens() {
  const lens = usePlanner((s) => s.lens)
  const setLens = usePlanner((s) => s.setLens)
  const legend = LENS_LEGEND[lens]
  return (
    <Section title="Map lens">
      <div className="flex flex-wrap gap-1">
        {LENSES.map((l) => (
          <button key={l.id} onClick={() => setLens(l.id)} className={`rounded-full border px-2 py-0.5 text-[11px] phone:py-1.5 ${lens === l.id ? 'border-sky-400 bg-sky-500/20 text-sky-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>{l.label}</button>
        ))}
      </div>
      {legend && (
        <div className="mt-2">
          <div className="h-2 rounded" style={{ background: `linear-gradient(90deg, ${legend.stops.join(',')})` }} />
          <div className="mt-0.5 flex justify-between text-[10px] text-slate-400"><span>{legend.lo}</span><span>{legend.label}</span><span>{legend.hi}</span></div>
        </div>
      )}
      {lens === 'phase' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
          {PHASES.map((p) => <span key={p.id} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: PHASE_COLORS[p.id] }} />{p.label}</span>)}
        </div>
      )}
      {lens === 'access' && (
        <div className="mt-2 flex gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Homes within 1 km of MRT</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500" />Further away</span>
        </div>
      )}
    </Section>
  )
}

function Scenarios() {
  const applyPreset = usePlanner((s) => s.applyPreset)
  const reset = usePlanner((s) => s.reset)
  const [confirm, setConfirm] = useState(false)
  return (
    <Section title="Big projects (add to your plan)">
      <div className="space-y-1.5">
        {PRESETS.map((p) => (
          <div key={p.id} className="flex items-start gap-2 rounded-md border border-slate-800 p-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-100">{p.label}</div>
              <div className="text-[11px] leading-snug text-slate-400">{p.desc}</div>
            </div>
            <Button onClick={() => applyPreset(p.id)}>Add</Button>
          </div>
        ))}
      </div>
      <div className="mt-2">
        {confirm ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="flex-1 text-amber-200">Clear the whole plan and policy? (Undo is available)</span>
            <Button variant="danger" onClick={() => { reset(); setConfirm(false) }}>Clear</Button>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        ) : <Button variant="danger" onClick={() => setConfirm(true)}><Trash2 size={13} aria-hidden /> Start over</Button>}
      </div>
    </Section>
  )
}
