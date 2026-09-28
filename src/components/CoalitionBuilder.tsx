import { useMemo, useState } from 'react'
import { CheckCircle2, Handshake, Info, Minus, Plus, Undo2 } from 'lucide-react'
import type { Contest, Party } from '../types'
import { Button, PartyBadge } from './ui'
import { assessCoalition, coalitionName, suggestCoalitions, type Band, type CoalitionAssessment, type CoalitionInput } from '../model/coalition'
import { COALITION_HISTORY } from '../data/coalitions'
import { DISCLAIMER_SHORT } from '../data/disclaimer'

const BAND_STYLE: Record<Band, string> = {
  Likely: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  Plausible: 'bg-sky-500/20 text-sky-300 ring-sky-500/40',
  Difficult: 'bg-amber-500/20 text-amber-300 ring-amber-500/40',
  Unlikely: 'bg-red-500/20 text-red-300 ring-red-500/40',
}

function BandChip({ a }: { a: CoalitionAssessment }) {
  return <span className={`rounded px-1.5 py-px text-[10px] font-semibold ring-1 ${BAND_STYLE[a.band]}`}>{a.band} · {a.score}</span>
}

/** Coalition seats from the left, everyone else greyed from the right, majority line in the middle. */
function CoalitionBar({ members, seats, total, parties }: { members: string[]; seats: Record<string, number>; total: number; parties: Record<string, Party> }) {
  const majority = Math.floor(total / 2) + 1
  const inside = members.reduce((s, p) => s + (seats[p] ?? 0), 0)
  return (
    <div>
      <div className="relative flex h-5 w-full overflow-hidden rounded bg-slate-800">
        {members.map((p) => seats[p] ? (
          <div key={p} style={{ width: `${(seats[p] / total) * 100}%`, background: parties[p]?.color }} className="flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300" title={`${p} ${seats[p]}`}>{seats[p] >= 4 ? seats[p] : ''}</div>
        ) : null)}
        <div className="flex-1" />
        <div style={{ width: `${((total - inside) / total) * 100}%` }} className="bg-slate-600/60 transition-all duration-300" title={`Others ${total - inside}`} />
        <div className="absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${(majority / total) * 100}%` }} title={`Majority: ${majority}`} />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
        <span className={inside >= majority ? 'font-semibold text-emerald-300' : ''}>{inside} seats</span>
        <span>majority {majority}</span>
        <span>{total - inside} others</span>
      </div>
    </div>
  )
}

/**
 * Shown when no party has a majority: suggested coalitions, a free-form builder
 * with a record-based likelihood assessment, and a button to form the government.
 */
export function CoalitionBuilder({ seatsByParty, votesByParty, totalValid, total, contests, parties, formed, onForm }: {
  seatsByParty: Record<string, number>
  votesByParty: Record<string, number>
  totalValid: number
  total: number
  contests: Record<string, Contest>
  parties: Record<string, Party>
  formed: string[] | null
  onForm: (members: string[] | null) => void
}) {
  const input: CoalitionInput = useMemo(() => ({
    seatsByParty, votesByParty, totalValid, total, contests,
    names: Object.fromEntries(Object.values(parties).map((p) => [p.id, p.name])),
  }), [seatsByParty, votesByParty, totalValid, total, contests, parties])
  const suggestions = useMemo(() => suggestCoalitions(input, 4), [input])
  const [picked, setPicked] = useState<string[]>(() => formed ?? suggestions[0]?.members ?? [])
  const a = useMemo(() => assessCoalition(picked, input), [picked, input])
  const withSeats = Object.entries(seatsByParty).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1])
  const toggle = (p: string) => setPicked((m) => (m.includes(p) ? m.filter((x) => x !== p) : [...m, p]))
  const isFormed = !!formed && formed.length === a.members.length && a.members.every((p) => formed.includes(p))

  return (
    <div className="mt-3 rounded-lg border border-violet-500/40 bg-violet-950/20 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-violet-200"><Handshake size={16} aria-hidden /> Build a coalition</div>
      <p className="mt-1 text-[11px] text-slate-400">No party has the {a.majorityNeeded} seats needed to govern alone. Combine parties to reach a majority and see how workable each partnership would be, based on the parties' records.</p>

      {suggestions.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Most workable combinations</div>
          <div className="mt-1 space-y-1">
            {suggestions.map((s) => {
              const active = s.members.join() === a.members.join()
              return (
                <button key={s.members.join()} onClick={() => setPicked(s.members)}
                  className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs ${active ? 'border-violet-400 bg-violet-600/20' : 'border-slate-700 hover:bg-slate-800'}`}>
                  <span className="flex flex-wrap gap-0.5">{s.members.map((p) => <PartyBadge key={p} party={parties[p]} small noInfo />)}</span>
                  <span className="tabular text-slate-300">{s.seats} seats</span>
                  <span className="ml-auto"><BandChip a={s} /></span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Choose partners</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {withSeats.map(([p, n]) => (
            <button key={p} type="button" onClick={() => toggle(p)} aria-pressed={picked.includes(p)}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] ${picked.includes(p) ? 'border-violet-400 bg-violet-600/25 text-white' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>
              <PartyBadge party={parties[p]} active={picked.includes(p)} small noInfo /> <span className="tabular">{n}</span>
            </button>
          ))}
        </div>
        <div className="mt-2"><CoalitionBar members={a.members} seats={seatsByParty} total={total} parties={parties} /></div>
      </div>

      {a.members.length > 0 && (
        <div className="mt-3 rounded-md bg-slate-900/80 p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <b className="text-slate-100">{a.members.length > 1 ? `${coalitionName(a.members)} coalition` : `${a.lead} minority government`}</b>
            <BandChip a={a} />
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-800">
            <div className="h-full rounded bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 transition-all duration-300" style={{ width: `${a.score}%` }} />
          </div>
          <p className="mt-2 leading-snug text-slate-300">{a.description}</p>
          <ul className="mt-2 space-y-1">
            {a.factors.map((f) => (
              <li key={f.label} className="flex items-start gap-1.5 text-[11px]">
                <span className={`mt-px inline-flex h-4 min-w-8 shrink-0 items-center justify-center gap-px rounded text-[10px] font-semibold ${f.effect > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                  {f.effect > 0 ? <Plus size={9} aria-hidden /> : <Minus size={9} aria-hidden />}{Math.abs(f.effect)}
                </span>
                <span><b className="text-slate-200">{f.label}.</b> <span className="text-slate-400">{f.note}</span></span>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex gap-2">
            {isFormed ? (
              <>
                <span className="inline-flex flex-1 items-center gap-1.5 text-emerald-300"><CheckCircle2 size={14} aria-hidden /> Governing</span>
                <Button onClick={() => onForm(null)}><Undo2 size={14} aria-hidden /> Undo</Button>
              </>
            ) : (
              <Button variant="primary" className="flex-1" disabled={!a.viable} onClick={() => onForm(a.members)}
                title={a.viable ? 'Make this coalition the government' : 'Needs a majority'}>
                <Handshake size={14} aria-hidden /> {a.viable ? 'Form this government' : `${a.majorityNeeded - a.seats} more seats needed`}
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="mt-2 flex items-start gap-1 text-[10px] leading-snug text-slate-500">
        <Info size={11} className="mt-px shrink-0" aria-hidden />
        <span>Illustrative only: scores combine public party records with this simulated result, not any real negotiation. {COALITION_HISTORY} {DISCLAIMER_SHORT}</span>
      </p>
    </div>
  )
}
