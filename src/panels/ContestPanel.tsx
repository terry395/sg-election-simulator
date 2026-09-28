import { useState } from 'react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { Button, PartyBadge, Section, Slider, pct } from '../components/ui'
import { PAP } from '../data/parties'
import type { Contest } from '../types'

export function ContestPanel() {
  const plan = useStore((s) => s.plan)
  const parties = useStore((s) => s.parties)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const setContest = useStore((s) => s.setContest)
  const resetContests = useStore((s) => s.resetContests)
  const setAll = useStore((s) => s.setAllContests)
  const { contests, partyMap, stats } = useDerived()
  const [filter, setFilter] = useState('')

  const oppCount = new Set(Object.values(contests).flatMap((c) => c.parties.filter((p) => p !== PAP))).size
  const contested = Object.values(contests).filter((c) => c.parties.length > 1).length
  const straightFights = () => {
    const out: Record<string, Contest> = {}
    for (const [id, c] of Object.entries(contests)) {
      const opp = c.parties.filter((p) => p !== PAP).sort((a, b) => (partyMap[b]?.strength ?? 0) - (partyMap[a]?.strength ?? 0))
      out[id] = { ...c, parties: c.parties.includes(PAP) ? [PAP, ...opp.slice(0, 1)] : opp.slice(0, 1) }
    }
    setAll(out)
  }
  const partySeats = (p: string) => plan.constituencies.filter((c) => contests[c.id]?.parties.includes(p)).reduce((s, c) => s + c.seats, 0)
  const list = plan.constituencies.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <Section title="Line-ups">
        <p className="text-xs text-slate-400">{contested} of {plan.constituencies.length} constituencies contested by {oppCount} opposition parties. Defaults: PAP vs the party that fought for most of those voters in 2025.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button onClick={resetContests}>Reset to defaults</Button>
          <Button onClick={straightFights} title="Keep only the strongest opposition party in each seat">Straight fights only</Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] text-slate-500">Seats contested:</span>
          {parties.filter((p) => p.id !== PAP).map((p) => {
            const n = partySeats(p.id)
            return n ? <span key={p.id} className="text-[11px] text-slate-400"><PartyBadge party={p} small /> {n}</span> : null
          })}
        </div>
      </Section>

      <Section title="Seats" right={<input placeholder="Filter…" className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
        <ul className="space-y-1">
          {list.map((c) => {
            const ct = contests[c.id]
            const s = stats.byId[c.id]
            const open = activeId === c.id
            const toggle = (p: string) => {
              const has = ct.parties.includes(p)
              const next = has ? ct.parties.filter((x) => x !== p) : [...ct.parties, p]
              setContest(c.id, { ...ct, parties: next })
            }
            return (
              <li key={c.id} className={`rounded-md border ${open ? 'border-rose-500/60 bg-slate-900' : 'border-slate-800'}`}>
                <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs" onClick={() => setActive(open ? null : c.id)}>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name} <span className="font-normal text-slate-500">{c.type === 'GRC' ? `GRC·${c.seats}` : 'SMC'}</span></span>
                  <span className="flex gap-0.5">{ct.parties.map((p) => partyMap[p] && <PartyBadge key={p} party={partyMap[p]} small />)}</span>
                  {ct.parties.length <= 1 && <span className="text-[10px] text-amber-300">walkover</span>}
                </button>
                {open && (
                  <div className="border-t border-slate-800 px-2 py-2">
                    <div className="text-[11px] text-slate-400">Click to add/remove parties. Notional 2025: PAP {pct(s?.pap0 ?? 0)}{s?.mainOpp ? `, main opponent ${s.mainOpp}` : ''}.</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {parties.map((p) => <PartyBadge key={p.id} party={p} active={ct.parties.includes(p.id)} onClick={() => toggle(p.id)} />)}
                    </div>
                    {ct.parties.length > 0 && <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Candidate effect</div>}
                    {ct.parties.map((p) => (
                      <Slider key={p} label={<span>{p} <span className="text-slate-500">{p === PAP ? 'anchor minister / incumbency' : 'star candidate'}</span></span>}
                        value={ct.star?.[p] ?? 0} min={-8} max={8} step={0.5}
                        onChange={(v) => setContest(c.id, { ...ct, star: { ...ct.star, [p]: v } })} />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Section>
      <PartyEditor />
    </div>
  )
}

function PartyEditor() {
  const parties = useStore((s) => s.parties)
  const update = useStore((s) => s.updateParty)
  const add = useStore((s) => s.addParty)
  const remove = useStore((s) => s.removeParty)
  const [draft, setDraft] = useState({ id: '', name: '', color: '#10b981' })
  const valid = /^[A-Z0-9]{2,6}$/.test(draft.id) && !parties.some((p) => p.id === draft.id) && draft.name.trim()
  return (
    <Section title="Party strength">
      <p className="mb-1 text-[11px] leading-snug text-slate-400">How strongly each party's slate pulls opposition votes (WP = 1.0, from GE2025 average shares where contested). Also sets how much better or worse it does than the 2025 opponent in a seat.</p>
      {parties.filter((p) => p.id !== PAP).map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <PartyBadge party={p} small />
          <div className="flex-1"><Slider label={p.name} value={p.strength} min={0.05} max={1.5} step={0.05} unit="" colorize={false} onChange={(v) => update(p.id, { strength: v })} /></div>
          {p.custom && <button className="text-xs text-red-400" onClick={() => remove(p.id)} title="Remove party">✕</button>}
        </div>
      ))}
      <div className="mt-3 rounded-md border border-dashed border-slate-700 p-2">
        <div className="mb-1 text-[11px] font-semibold text-slate-300">Add a new party</div>
        <div className="flex gap-1.5">
          <input placeholder="ABBR" maxLength={6} className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs uppercase" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.toUpperCase() })} />
          <input placeholder="Party name" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input type="color" className="h-7 w-7 rounded border border-slate-700 bg-transparent" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
          <Button disabled={!valid} onClick={() => { add({ ...draft, name: draft.name.trim(), strength: 0.5, custom: true }); setDraft({ id: '', name: '', color: '#10b981' }) }}>Add</Button>
        </div>
      </div>
    </Section>
  )
}
