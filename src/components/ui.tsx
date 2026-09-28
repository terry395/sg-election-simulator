import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { ink } from '../lib/color'
import { useStore } from '../state/store'
import type { Party } from '../types'

export function Button({ className = '', variant = 'ghost', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' | 'danger' | 'subtle' }) {
  const v = {
    primary: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500',
    danger: 'bg-transparent hover:bg-red-950 text-red-300 border-red-900',
    subtle: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-200 border-slate-700',
  }[variant]
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 disabled:pointer-events-none ${v} ${className}`} />
}

export function Section({ title, right, children, className = '' }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-b border-slate-800 px-4 py-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

/**
 * Party badge. With no onClick it opens the party's information card
 * (pass noInfo when the badge sits inside another button).
 */
export function PartyBadge({ party, active = true, onClick, small, noInfo }: { party: Party; active?: boolean; onClick?: () => void; small?: boolean; noInfo?: boolean }) {
  const showPartyInfo = useStore((s) => s.showPartyInfo)
  const style = active ? { background: party.color, color: ink(party.color), borderColor: party.color } : { borderColor: party.color, color: party.color }
  const clickable = !!onClick || !noInfo
  const cls = `inline-flex items-center rounded border font-bold ${small ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-[11px]'} ${clickable ? 'cursor-pointer hover:brightness-110' : ''} ${active ? '' : 'bg-transparent opacity-60 hover:opacity-100'}`
  if (onClick) return <button type="button" className={cls} style={style} onClick={onClick} title={party.name}>{party.id}</button>
  if (noInfo) return <span className={cls} style={style} title={party.name}>{party.id}</span>
  return (
    <button type="button" className={cls} style={style} title={`${party.name}: click for party info`}
      onClick={(e) => { e.stopPropagation(); showPartyInfo(party.id) }}>{party.id}</button>
  )
}

export function Slider({ label, value, min, max, step = 0.5, onChange, unit = 'pp', hint, colorize = true }: {
  label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string; hint?: string; colorize?: boolean
}) {
  const color = !colorize || value === 0 ? 'text-slate-400' : value > 0 ? 'text-blue-300' : 'text-sky-300'
  return (
    <label className="block py-1" title={hint}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className={`tabular font-semibold ${color}`} onDoubleClick={() => onChange(0)}>
          {value > 0 && unit === 'pp' ? '+' : ''}{value.toFixed(step < 1 ? 1 : 0)}{unit === 'pp' ? '' : ''} <span className="font-normal text-slate-500">{unit}</span>
        </span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(0)} />
    </label>
  )
}

/** Horizontal stacked share bar. */
export function ShareBar({ parts, height = 8 }: { parts: { color: string; value: number; label?: string }[]; height?: number }) {
  const tot = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div className="flex w-full overflow-hidden rounded-sm bg-slate-800" style={{ height }}>
      {parts.map((p, i) => <div key={i} style={{ width: `${(p.value / tot) * 100}%`, background: p.color }} title={p.label} />)}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-md bg-slate-900 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="tabular text-base font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}

export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`
export const fmt = (v: number) => Math.round(v).toLocaleString('en-SG')
