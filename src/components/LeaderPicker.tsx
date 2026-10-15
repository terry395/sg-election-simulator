import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Candidate } from '../data/candidates'

const CUSTOM = '__custom'

/** Native select of GE2025 candidates (easy on phones), with a free-text fallback for anyone else. */
export function LeaderPicker({ party, name, list, badge, custom, setCustom, onChange }: {
  party: string; name: string; list: Candidate[]; badge: ReactNode; custom: boolean
  setCustom: (v: boolean) => void; onChange: (name: string) => void
}) {
  const notable = list.filter((x) => x.role)
  const byEd = new Map<string, Candidate[]>()
  for (const x of list) if (!x.role) byEd.set(x.edName, [...(byEd.get(x.edName) ?? []), x])
  const eds = [...byEd.keys()].sort((a, b) => a.localeCompare(b))
  const clear = name ? <button className="text-[10px] text-slate-500 hover:text-slate-300" onClick={() => { setCustom(false); onChange('') }} title="Clear" aria-label="Clear"><X size={12} /></button> : null
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {badge}
        {list.length > 0 && (
          <select value={custom ? CUSTOM : name} aria-label={`${party} anchor leader`}
            onChange={(e) => {
              const v = e.target.value
              if (v === CUSTOM) { setCustom(true); return }
              setCustom(false)
              onChange(v)
            }}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs">
            <option value="">— No anchor leader —</option>
            {notable.length > 0 && (
              <optgroup label="Well-known">
                {notable.map((x) => <option key={`${x.name}-${x.edId}`} value={x.name}>{x.name} — {x.role}</option>)}
              </optgroup>
            )}
            {eds.map((ed) => (
              <optgroup key={ed} label={`GE2025 ${ed}`}>
                {byEd.get(ed)!.map((x) => <option key={`${x.name}-${x.edId}`} value={x.name}>{x.name}</option>)}
              </optgroup>
            ))}
            <option value={CUSTOM}>Custom name…</option>
          </select>
        )}
        {list.length === 0 && (
          <input value={name} onChange={(e) => onChange(e.target.value)} placeholder="Type your candidate’s name"
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs" aria-label={`${party} anchor leader`} />
        )}
        {clear}
      </div>
      {list.length > 0 && custom && (
        <input value={name} onChange={(e) => onChange(e.target.value)} placeholder="Type your candidate’s name" autoFocus={!name}
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs" aria-label={`${party} custom anchor leader`} />
      )}
    </div>
  )
}
