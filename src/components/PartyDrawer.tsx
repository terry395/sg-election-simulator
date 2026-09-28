import { useEffect } from 'react'
import { useStore } from '../state/store'
import { PARTY_INFO } from '../data/partyInfo'
import { NOTABLE } from '../data/candidates'
import { ink } from '../lib/color'
import { pct } from './ui'

/** Side drawer with beginner-friendly information about each party. */
export function PartyDrawer() {
  const id = useStore((s) => s.partyInfo)
  const show = useStore((s) => s.showPartyInfo)
  const parties = useStore((s) => s.parties)
  const ge = useStore((s) => s.data)!.ge

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') show(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])
  if (!id) return null

  const party = parties.find((p) => p.id === id) ?? parties[0]
  const info = PARTY_INFO[party.id]
  const stats = ge.parties[party.id]
  const seats = ge.constituencies.reduce((s, c) => s + (c.result[0]?.party === party.id ? c.seats : 0), 0)
  const people = NOTABLE.filter((n) => n.party === party.id)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => show(null)}>
      <aside className="scroll-thin flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-700 bg-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Political parties">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-4 pt-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">🏛 Singapore's political parties</h2>
            <button onClick={() => show(null)} className="text-slate-400 hover:text-white" aria-label="Close">✕</button>
          </div>
          <div className="flex gap-1 overflow-x-auto py-2">
            {parties.map((p) => (
              <button key={p.id} onClick={() => show(p.id)}
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-bold ${p.id === party.id ? '' : 'opacity-60 hover:opacity-100'}`}
                style={p.id === party.id ? { background: p.color, color: ink(p.color), borderColor: p.color } : { borderColor: p.color, color: p.color }}>{p.id}</button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-black" style={{ background: party.color, color: ink(party.color) }}>{party.id}</div>
            <div>
              <div className="text-lg font-bold leading-tight">{party.name}</div>
              {info && <div className="text-xs text-slate-400">{info.position} · founded {info.founded}</div>}
            </div>
          </div>

          {info ? (
            <>
              <p className="mt-4 text-sm leading-relaxed text-slate-200">{info.summary}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Leadership</dt><dd>{info.leaders}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Ideas it is associated with</dt><dd>{info.ideology}</dd></div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">Main themes</dt>
                  <dd><ul className="mt-1 list-disc space-y-0.5 pl-5">{info.themes.map((t) => <li key={t}>{t}</li>)}</ul></dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-300">This is a party you created in the simulator. Its strength is set to {party.strength.toFixed(2)} (the Workers' Party is 1.00). Change it in the Contests tab.</p>
          )}

          {stats && (
            <div className="mt-4 rounded-lg bg-slate-900 p-3 text-sm">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">GE2025 result</div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                <div><div className="tabular text-lg font-bold">{seats}</div><div className="text-[10px] text-slate-400">seats won</div></div>
                <div><div className="tabular text-lg font-bold">{pct(stats.national)}</div><div className="text-[10px] text-slate-400">of all votes</div></div>
                <div><div className="tabular text-lg font-bold">{pct(stats.avgContested)}</div><div className="text-[10px] text-slate-400">avg where it stood</div></div>
              </div>
              <div className="mt-1 text-center text-[11px] text-slate-500">Contested {stats.contested} constituenc{stats.contested === 1 ? 'y' : 'ies'}</div>
            </div>
          )}

          {people.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Well-known figures (can be picked as anchor leaders)</div>
              <ul className="mt-1 space-y-1 text-sm">
                {people.map((n) => <li key={n.name}><b>{n.name}</b> <span className="text-slate-400">— {n.role}</span></li>)}
              </ul>
            </div>
          )}

          <p className="mt-6 border-t border-slate-800 pt-3 text-[11px] leading-snug text-slate-500">
            Short, neutral summaries for beginners, as of September 2026, drawn from party websites, Wikipedia and Elections Department results. They are simplified; read each party's own materials for its full positions.
          </p>
        </div>
      </aside>
    </div>
  )
}
