import { useMemo, useState, type ReactNode } from 'react'
import { Plus, Wand2, X } from 'lucide-react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { Button, PartyBadge, Slider } from './ui'
import { LeaderPicker } from './LeaderPicker'
import { PAP } from '../data/parties'
import { candidatesByParty, type Candidate } from '../data/candidates'
import {
  autoContests, cooperates, defaultAutoSettings, pairKey, summarise,
  type AnchorStrategy, type AutoSettings, type FillMode, type PartyAuto,
} from '../model/autoContests'

/** last settings used this session, so reopening the modal keeps the user's choices */
let lastSettings: AutoSettings | null = null

const MODES: { id: FillMode; label: string }[] = [
  { id: 'footprint', label: 'Where it stood in 2025' },
  { id: 'best', label: 'Its best seats, up to a cap' },
  { id: 'all', label: 'Every seat' },
  { id: 'none', label: 'Sits out' },
]
const PAP_MODES: { id: FillMode; label: string }[] = [
  { id: 'all', label: 'Every seat' },
  { id: 'best', label: 'Its safest seats, up to a cap' },
]
const ANCHORS: { id: AnchorStrategy; label: string }[] = [
  { id: 'home', label: 'Keep 2025 home seats' },
  { id: 'battleground', label: 'Big names to the closest fights' },
  { id: 'safe', label: 'Big names to its safest seats' },
]

const selectCls = 'min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs'

export function AutoContestsModal({ onClose }: { onClose: () => void }) {
  const plan = useStore((s) => s.plan)
  const parties = useStore((s) => s.parties)
  const useLeaders = useStore((s) => s.useLeaders)
  const setAll = useStore((s) => s.setAllContests)
  const ge = useStore((s) => s.data)!.ge
  const { stats, partyMap } = useDerived()
  const fresh = () => defaultAutoSettings(plan, stats, ge, parties)
  const [settings, setSettings] = useState<AutoSettings>(() => lastSettings ?? fresh())
  const candidates = useMemo(() => candidatesByParty(ge), [ge])

  const result = useMemo(() => autoContests(plan, stats, ge, parties, settings), [plan, stats, ge, parties, settings])
  const sum = useMemo(() => summarise(plan, result), [plan, result])
  const totalMps = plan.constituencies.reduce((n, c) => n + c.seats, 0)
  const seats = useMemo(() => plan.constituencies.filter((c) => stats.byId[c.id]?.electors).sort((a, b) => a.name.localeCompare(b.name)), [plan, stats])
  const nameOf = (id: string) => plan.constituencies.find((c) => c.id === id)?.name ?? id

  const cfg = (p: string): PartyAuto => settings.parties[p] ?? { mode: 'none', maxSeats: 1, anchors: 'home', pins: {} }
  const patch = (p: string, v: Partial<PartyAuto>) => setSettings((s) => ({ ...s, parties: { ...s.parties, [p]: { ...cfg(p), ...v } } }))
  const opp = parties.filter((p) => p.id !== PAP)
  const active = opp.filter((p) => cfg(p.id).mode !== 'none' || Object.keys(cfg(p.id).pins).length)
  const setCoop = (a: string, b: string, v: boolean) => setSettings((s) => ({ ...s, cooperate: { ...s.cooperate, [pairKey(a, b)]: v } }))
  const setAllCoop = (v: boolean) => setSettings((s) => {
    const cooperate = { ...s.cooperate }
    for (const a of opp) for (const b of opp) if (a.id < b.id) cooperate[pairKey(a.id, b.id)] = v
    return { ...s, cooperate }
  })

  const apply = () => {
    lastSettings = settings
    setAll(result)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 md:items-center md:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Auto line-ups" onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-2xl flex-col border-slate-700 bg-slate-900 text-sm md:max-h-[90vh] md:rounded-xl md:border">
        <div className="flex items-start justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold"><Wand2 size={16} aria-hidden /> Auto line-ups</h2>
            <p className="text-xs text-slate-400">Choose how each party fills its seats{useLeaders ? ', where its anchor leaders go' : ''} and which opposition parties avoid clashing. Apply replaces every seat's line-up.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Parties</h3>
            <ul className="space-y-1.5">
              {parties.map((p) => (
                <PartyRow key={p.id} party={p.id} badge={<PartyBadge party={p} small noInfo />} name={p.name} cfg={cfg(p.id)} patch={(v) => patch(p.id, v)}
                  totalMps={totalMps} useLeaders={useLeaders} candidates={candidates[p.id] ?? []} seats={seats} nameOf={nameOf}
                  standing={sum.byParty[p.id]} />
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Opposition cooperation</h3>
              <span className="flex gap-1.5">
                <Button onClick={() => setAllCoop(true)}>All cooperate</Button>
                <Button onClick={() => setAllCoop(false)}>None cooperate</Button>
              </span>
            </div>
            <p className="mb-1.5 text-[11px] text-slate-400">Highlighted parties stand down for each other: where both want a seat, the one with more 2025 votes there stands (a pinned leader wins it). Others fight multi-cornered.</p>
            {active.length < 2 && <p className="text-[11px] text-slate-500">Fewer than two opposition parties are standing.</p>}
            <ul className="space-y-1">
              {active.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-1">
                  <span className="w-24 shrink-0 text-[11px] text-slate-300"><PartyBadge party={a} small noInfo /> works with</span>
                  {active.filter((b) => b.id !== a.id).map((b) => (
                    <PartyBadge key={b.id} party={b} small active={cooperates(settings, a.id, b.id)} onClick={() => setCoop(a.id, b.id, !cooperates(settings, a.id, b.id))} />
                  ))}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="border-t border-slate-800 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
            <span className="text-slate-500">Result:</span>
            {parties.map((p) => sum.byParty[p.id] && <span key={p.id}><PartyBadge party={partyMap[p.id] ?? p} small noInfo /> {sum.byParty[p.id].mps}</span>)}
            <span>· {sum.multiCornered} multi-cornered</span>
            <span className={sum.walkovers ? 'text-amber-300' : ''}>· {sum.walkovers} walkover{sum.walkovers === 1 ? '' : 's'}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button className="mr-auto" onClick={() => setSettings(fresh())}>Reset settings</Button>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={apply}>Apply line-ups</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PartyRow({ party, badge, name, cfg, patch, totalMps, useLeaders, candidates, seats, nameOf, standing }: {
  party: string; badge: ReactNode; name: string; cfg: PartyAuto; patch: (v: Partial<PartyAuto>) => void
  totalMps: number; useLeaders: boolean; candidates: Candidate[]
  seats: { id: string; name: string }[]; nameOf: (id: string) => string; standing?: { seats: number; mps: number }
}) {
  const [draft, setDraft] = useState<{ seat: string; name: string; custom: boolean } | null>(null)
  const modes = party === PAP ? PAP_MODES : MODES
  const pins = Object.entries(cfg.pins)
  const addPin = () => {
    if (!draft?.seat || !draft.name.trim()) return
    // one pin per person: moving someone drops their earlier pin
    const rest = Object.fromEntries(Object.entries(cfg.pins).filter(([, n]) => n !== draft.name.trim()))
    patch({ pins: { ...rest, [draft.seat]: draft.name.trim() } })
    setDraft(null)
  }
  return (
    <li className="rounded-md border border-slate-800 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex w-full items-center gap-1.5 text-xs sm:w-52 sm:shrink-0">{badge}<span className="truncate text-slate-300">{name}</span></span>
        <select value={cfg.mode} onChange={(e) => patch({ mode: e.target.value as FillMode })} className={selectCls} aria-label={`${party} seats`}>
          {modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {useLeaders && cfg.mode !== 'none' && (
          <select value={cfg.anchors} onChange={(e) => patch({ anchors: e.target.value as AnchorStrategy })} className={selectCls} aria-label={`${party} anchor leaders`}>
            {ANCHORS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        )}
        <span className="tabular w-full text-right text-[10px] text-slate-500 sm:w-14">{standing ? `${standing.mps} MPs` : '—'}</span>
      </div>
      {cfg.mode === 'best' && (
        <Slider label={<span className="text-slate-400">Cap (MPs)</span>} value={cfg.maxSeats} min={1} max={totalMps} step={1} unit="" colorize={false}
          onChange={(v) => patch({ maxSeats: v })} />
      )}
      {useLeaders && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {pins.map(([seat, n]) => (
            <span key={seat} className="inline-flex items-center gap-1 rounded border border-sky-800 bg-sky-950/40 px-1.5 py-0.5 text-[10px] text-sky-200">
              {n} → {nameOf(seat)}
              <button onClick={() => { const { [seat]: _, ...rest } = cfg.pins; patch({ pins: rest }) }} aria-label={`Unpin ${n}`} className="text-sky-400 hover:text-white"><X size={11} /></button>
            </span>
          ))}
          {!draft && <button className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-200" onClick={() => setDraft({ seat: seats[0]?.id ?? '', name: '', custom: false })}><Plus size={11} aria-hidden /> Pin a leader to a seat</button>}
        </div>
      )}
      {useLeaders && draft && (
        <div className="mt-1.5 space-y-1 rounded border border-slate-800 bg-slate-950/50 p-1.5">
          <select value={draft.seat} onChange={(e) => { const seat = e.target.value; setDraft((d) => d && { ...d, seat }) }} className={`${selectCls} w-full`} aria-label={`${party} pinned seat`}>
            {seats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <LeaderPicker party={party} name={draft.name} list={candidates} badge={null}
            custom={candidates.length === 0 || draft.custom} setCustom={(v) => setDraft((d) => d && { ...d, custom: v })}
            onChange={(v) => setDraft((d) => d && { ...d, name: v })} />
          <div className="flex justify-end gap-1.5">
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="subtle" disabled={!draft.seat || !draft.name.trim()} onClick={addPin}>Pin</Button>
          </div>
        </div>
      )}
    </li>
  )
}
