import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { Button, PartyBadge, Section, Slider, fmt, pct } from '../components/ui'
import { SeatBar } from '../components/SeatBar'
import { Hemicycle } from '../components/Hemicycle'
import { DEMO_GROUPS, DEFAULT_SWINGS } from '../model/swing'
import type { McOutput } from '../model/montecarlo'
import type { Swings } from '../types'
import { PAP } from '../data/parties'
import { Dices, Info, Play } from 'lucide-react'
import { DISCLAIMER_SHORT } from '../data/disclaimer'

const SCENARIOS: { label: string; hint: string; swings: Partial<Swings> }[] = [
  { label: 'GE2025 repeat', hint: 'No change from 2025', swings: {} },
  { label: 'Honeymoon', hint: 'PAP +4 nationally', swings: { national: 4 } },
  { label: 'GE2020 mood', hint: 'PAP −4.3: back to the 2020 national vote', swings: { national: -4.3 } },
  { label: 'Opposition surge', hint: 'PAP −8, WP +2', swings: { national: -8, party: { WP: 2 } } },
  { label: 'Youthquake', hint: 'Young voters swing hard to the opposition', swings: { demo: { a0: -14, a1: -4, a3: 3 } } },
  { label: 'Heartland squeeze', hint: 'Cost of living bites in HDB estates', swings: { demo: { h0: -10, h1: -7, h2: -4, h3: 2, h4: 3 } } },
]

export function ForecastPanel() {
  const swings = useStore((s) => s.swings)
  const setSwings = useStore((s) => s.setSwings)
  const resetSwings = useStore((s) => s.resetSwings)
  const plan = useStore((s) => s.plan)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const setTab = useStore((s) => s.setTab)
  const { projection, partyMap, contests, stats, issues } = useDerived()
  const total = stats.seats
  const [mc, setMc] = useState<McOutput | null>(null)
  const [running, setRunning] = useState(false)
  const worker = useRef<Worker | null>(null)
  const job = useRef(0)

  // stale Monte Carlo results are cleared whenever the inputs change
  useEffect(() => setMc(null), [swings, contests, stats, partyMap])
  useEffect(() => () => worker.current?.terminate(), [])

  const runMc = () => {
    worker.current ??= new Worker(new URL('../model/montecarlo.worker.ts', import.meta.url), { type: 'module' })
    const id = ++job.current
    setRunning(true)
    worker.current.onmessage = (e) => {
      if (e.data.job !== id) return
      setMc(e.data.out)
      setRunning(false)
    }
    worker.current.postMessage({ job: id, plan: plan.constituencies, stats: stats.byId, contests, swings, parties: partyMap, runs: 2000, seed: Math.floor(Math.random() * 1e9) })
  }

  const oppParties = useMemo(() => [...new Set(Object.values(contests).flatMap((c) => c.parties))].filter((p) => p !== PAP && partyMap[p]), [contests, partyMap])
  const nationalVote = Object.entries(projection.votesByParty).sort((a, b) => b[1] - a[1])
  const errors = issues.filter((i) => i.level === 'error').length
  const active = plan.constituencies.find((c) => c.id === activeId)

  const rows = plan.constituencies
    .map((c) => ({ c, r: projection.seats.find((s) => s.id === c.id)! }))
    .sort((a, b) => (a.r.walkover ? 1 : 0) - (b.r.walkover ? 1 : 0) || a.r.margin - b.r.margin)

  return (
    <div>
      <Section title="Projected parliament">
        <div className="mb-2 flex justify-center">
          <Hemicycle seats={projection.seatsByParty} total={total} parties={partyMap} ncmp={projection.ncmp} width={260} />
        </div>
        <SeatBar seats={projection.seatsByParty} total={total} parties={partyMap} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {Object.entries(projection.seatsByParty).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
            <span key={p} className="flex items-center gap-1"><PartyBadge party={partyMap[p]} small /> <b className="tabular">{n}</b> seats</span>
          ))}
          {projection.ncmp.length > 0 && <span className="text-slate-400">+ {projection.ncmp.reduce((s, n) => s + n.seats, 0)} NCMP</span>}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Popular vote: {nationalVote.slice(0, 5).map(([p, v]) => `${p} ${pct(v / projection.totalValid)}`).join(' · ')}
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" className="flex-1 py-2 text-sm" onClick={() => setTab('night')}><Play size={15} aria-hidden /> Run election night</Button>
          <Button variant="subtle" onClick={runMc} disabled={running}>{running ? 'Simulating…' : <><Dices size={14} aria-hidden /> 2,000 simulations</>}</Button>
        </div>
        <p className="mt-2 flex items-start gap-1 text-[10px] text-slate-500"><Info size={12} className="mt-px shrink-0" aria-hidden />Simulated scenario. {DISCLAIMER_SHORT}</p>
        {errors > 0 && <p className="mt-2 text-[11px] text-amber-300">Your map still has {errors} rule errors (see Draw). You can still simulate it.</p>}
        {mc && <McSummary mc={mc} />}
      </Section>

      <Section title="Scenarios" right={<button className="text-[11px] text-sky-400" onClick={resetSwings}>Reset all</button>}>
        <div className="flex flex-wrap gap-1">
          {SCENARIOS.map((s) => (
            <button key={s.label} title={s.hint} onClick={() => setSwings({ ...DEFAULT_SWINGS, local: swings.local, sigmaLocal: swings.sigmaLocal, sigmaNational: swings.sigmaNational, ...s.swings })}
              className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800">{s.label}</button>
          ))}
        </div>
      </Section>

      <Section title="National swing">
        <Slider label="Swing to PAP (all seats)" value={swings.national} min={-25} max={15} onChange={(v) => setSwings({ national: v })} hint="Positive = towards PAP" />
        <Slider label="Turnout change" value={swings.turnout} min={-8} max={4} onChange={(v) => setSwings({ turnout: v })} />
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Party swings (where they stand)</div>
        {oppParties.map((p) => (
          <Slider key={p} label={<span className="flex items-center gap-1.5"><PartyBadge party={partyMap[p]} small />{partyMap[p].name}</span>}
            value={swings.party[p] ?? 0} min={-15} max={15} onChange={(v) => setSwings({ party: { ...swings.party, [p]: v } })} />
        ))}
      </Section>

      <Section title="Demographic swing to PAP">
        <p className="mb-1 text-[11px] text-slate-400">Each seat moves by its own mix of voters. Negative = towards the opposition.</p>
        {(['age', 'eth', 'house'] as const).map((dim) => (
          <div key={dim} className="mb-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{{ age: 'Age', eth: 'Ethnicity', house: 'Housing' }[dim]}</div>
            {DEMO_GROUPS[dim].map((g) => (
              <Slider key={g.id} label={g.label} value={swings.demo[g.id] ?? 0} min={-20} max={20} onChange={(v) => setSwings({ demo: { ...swings.demo, [g.id]: v } })} />
            ))}
          </div>
        ))}
      </Section>

      <Section title="Constituency swing">
        {active ? (
          <Slider label={`${active.name}: extra swing to PAP`} value={swings.local[active.id] ?? 0} min={-25} max={25} onChange={(v) => setSwings({ local: { ...swings.local, [active.id]: v } })} />
        ) : <p className="text-xs text-slate-400">Click a constituency on the map or in the table to give it its own swing.</p>}
        {Object.entries(swings.local).filter(([, v]) => v).length > 0 && (
          <div className="mt-1 text-[11px] text-slate-400">Local swings: {Object.entries(swings.local).filter(([, v]) => v).map(([id, v]) => `${plan.constituencies.find((c) => c.id === id)?.name ?? id} ${v > 0 ? '+' : ''}${v}`).join(', ')}</div>
        )}
      </Section>

      <Section title="Uncertainty (for simulations & election night)">
        <Slider label="National polling error (1 s.d.)" value={swings.sigmaNational} min={0} max={8} unit="pp" colorize={false} onChange={(v) => setSwings({ sigmaNational: v })} />
        <Slider label="Seat-level noise (1 s.d.)" value={swings.sigmaLocal} min={0} max={8} unit="pp" colorize={false} onChange={(v) => setSwings({ sigmaLocal: v })} />
      </Section>

      <Section title="Seats, closest first">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-slate-500">
            <tr><th className="text-left font-medium">Constituency</th><th className="font-medium">Win</th><th className="text-right font-medium">PAP</th><th className="text-right font-medium">Margin</th>{mc && <th className="text-right font-medium">Prob</th>}</tr>
          </thead>
          <tbody>
            {rows.map(({ c, r }) => {
              const prob = mc?.winProb[c.id]?.[r.winner]
              return (
                <tr key={c.id} className={`cursor-pointer border-t border-slate-800/70 ${activeId === c.id ? 'bg-slate-800' : 'hover:bg-slate-900'}`} onClick={() => setActive(c.id)}>
                  <td className="py-1">{c.name} <span className="text-slate-500">{c.type === 'GRC' ? c.seats : ''}</span></td>
                  <td className="text-center"><PartyBadge party={partyMap[r.winner]} small /></td>
                  <td className="tabular text-right">{r.walkover ? '—' : pct(r.shares[PAP] ?? 0)}</td>
                  <td className={`tabular text-right ${r.margin < 0.05 && !r.walkover ? 'font-semibold text-amber-300' : 'text-slate-400'}`}>{r.walkover ? 'w/o' : pct(r.margin)}</td>
                  {mc && <td className="tabular text-right text-slate-300">{prob !== undefined ? pct(prob, 0) : '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">{fmt(projection.totalValid)} valid votes projected.</p>
      </Section>
    </div>
  )
}

function McSummary({ mc }: { mc: McOutput }) {
  const { partyMap } = useDerived()
  const pap = mc.seatHist[PAP] ?? []
  const max = Math.max(...pap, 1)
  const lo = pap.findIndex((v) => v > 0)
  const hi = pap.length - 1 - [...pap].reverse().findIndex((v) => v > 0)
  return (
    <div className="mt-3 rounded-md bg-slate-900 p-2.5 text-xs">
      <div className="flex justify-between">
        <span>PAP keeps majority <b className="tabular">{pct(mc.papMajority, 1)}</b></span>
        <span>Keeps ⅔ <b className="tabular">{pct(mc.papSupermajority, 1)}</b></span>
      </div>
      {lo >= 0 && (
        <div className="mt-2">
          <div className="flex h-12 items-end gap-px">
            {pap.slice(lo, hi + 1).map((v, i) => (
              <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${(v / max) * 100}%`, background: lo + i > mc.totalSeats / 2 ? partyMap[PAP].color : '#f43f5e' }} title={`${lo + i} seats: ${pct(v / mc.runs)}`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500"><span>{lo}</span><span>PAP seats in {mc.runs.toLocaleString()} runs</span><span>{hi}</span></div>
        </div>
      )}
      <div className="mt-2 space-y-0.5">
        {Object.entries(mc.seatRange).filter(([, r]) => r[2] > 0).sort((a, b) => b[1][1] - a[1][1]).map(([p, [a, m, b]]) => (
          <div key={p} className="flex items-center gap-2"><PartyBadge party={partyMap[p]} small /><span className="tabular">{m} seats</span><span className="text-slate-500">(90%: {a}–{b})</span></div>
        ))}
      </div>
    </div>
  )
}
