import type { ReactNode } from 'react'
import { usePlanner } from '../state/planner'
import { PHASES, type PhaseId } from '../model/population'

/** The five-year phase being planned; the map and the figures show its end. */
export function PhasePicker({ note = true }: { note?: boolean }) {
  const phase = usePlanner((s) => s.phase)
  const setPhase = usePlanner((s) => s.setPhase)
  return (
    <div>
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="Phase">
        {PHASES.map((p) => (
          <button key={p.id} onClick={() => setPhase(p.id as PhaseId)} aria-pressed={phase === p.id}
            className={`rounded-md border px-1 py-1.5 text-[11px] font-medium tabular phone:min-h-10 ${phase === p.id ? 'border-emerald-400 bg-emerald-500/20 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {note && <p className="mt-1.5 text-[11px] text-slate-400">You are planning <b className="text-slate-200">{PHASES[phase].label}</b>. The map shows Singapore at the end of {PHASES[phase].end}.</p>}
    </div>
  )
}

/** A thin progress meter with a label and value. */
export function Meter({ label, value, max, text, warn, hint }: { label: ReactNode; value: number; max: number; text: ReactNode; warn?: boolean; hint?: string }) {
  const pct = Math.max(0, Math.min(1, value / Math.max(1e-9, max)))
  return (
    <div className="py-1" title={hint}>
      <div className="flex justify-between text-xs"><span className="text-slate-300">{label}</span><span className={`tabular font-semibold ${warn ? 'text-amber-300' : 'text-slate-100'}`}>{text}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${warn ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  )
}

/** A labelled range input with its own value format. */
export function PolicySlider({ label, value, min, max, step, onChange, format, hint }: {
  label: ReactNode; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: string
}) {
  return (
    <label className="block py-1" title={hint}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="tabular font-semibold text-slate-100">{format(value)}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="block text-[10px] leading-snug text-slate-500">{hint}</span>}
    </label>
  )
}

