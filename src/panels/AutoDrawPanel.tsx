import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { Button, Section, Stat, fmt, pct } from '../components/ui'
import { DEFAULT_OPTIONS, type GerryGoal, type Method, type RedistrictOptions, type RedistrictReport, type RedistrictResult } from '../model/redistrict'

const METHODS: { id: Method; icon: string; title: string; blurb: string }[] = [
  { id: 'ebrc', icon: '🏛️', title: 'EBRC-style', blurb: 'Update the existing map the way the real committee would: small changes to fix seats that have too many or too few voters.' },
  { id: 'compact', icon: '📐', title: 'Fair & compact', blurb: 'A brand-new map of neat, equal-sized constituencies that keep towns together.' },
  { id: 'custom', icon: '🧩', title: 'Custom mix', blurb: 'You choose exactly how many SMCs and GRCs of each size, e.g. 97 single-member seats.' },
  { id: 'gerrymander', icon: '🎭', title: 'Gerrymander', blurb: 'For learning: see how drawing lines alone can tilt an election, while staying within the rules.' },
]

const GOALS: { id: GerryGoal; label: string; hint: string }[] = [
  { id: 'pap', label: 'Favour the PAP', hint: 'Spread opposition voters thinly so they win as few seats as possible.' },
  { id: 'opposition', label: 'Favour the opposition', hint: 'Group opposition-leaning areas together so they win more seats.' },
  { id: 'competitive', label: 'Most competitive', hint: 'Create as many close, 50-50 seats as possible.' },
]

const METHOD_DEFAULT_DEV: Record<Method, number> = { ebrc: 0.15, compact: 0.1, custom: 0.1, gerrymander: 0.15 }
const GE2025_MIX = { smc: 15, grc: { 3: 0, 4: 8, 5: 10, 6: 0 } as Record<3 | 4 | 5 | 6, number> }

interface Props { onClose: () => void }

export function AutoDrawPanel({ onClose }: Props) {
  const data = useStore((s) => s.data)!
  const year = useStore((s) => s.year)
  const plan = useStore((s) => s.plan)
  const replacePlan = useStore((s) => s.replacePlan)
  const undo = useStore((s) => s.undo)
  const setTab = useStore((s) => s.setTab)

  const quota2025 = data.ge.totalElectors / data.ge.seats
  const suggestedSeats = Math.round((year === 2030 ? data.ge.totalElectors2030 : data.ge.totalElectors) / quota2025)
  const currentSmc = plan.constituencies.filter((c) => c.type === 'SMC').length

  const [opts, setOpts] = useState<RedistrictOptions>(() => ({
    ...DEFAULT_OPTIONS,
    method: 'ebrc',
    maxDeviation: METHOD_DEFAULT_DEV.ebrc,
    totalSeats: suggestedSeats,
    smcCount: Math.max(15, currentSmc),
    seed: 1 + Math.floor(Math.random() * 999),
  }))
  const set = (patch: Partial<RedistrictOptions>) => setOpts((o) => ({ ...o, ...patch }))
  const chooseMethod = (m: Method) => {
    const patch: Partial<RedistrictOptions> = { method: m, maxDeviation: METHOD_DEFAULT_DEV[m] }
    if (m === 'custom') Object.assign(patch, { smcCount: GE2025_MIX.smc, grcCounts: GE2025_MIX.grc })
    if (m !== 'custom' && opts.method === 'custom') patch.smcCount = 15
    set(patch)
  }

  const [running, setRunning] = useState<{ fraction: number; label: string } | null>(null)
  const [result, setResult] = useState<{ report: RedistrictReport; method: Method; opts: RedistrictOptions } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const worker = useRef<Worker | null>(null)
  const job = useRef(0)
  useEffect(() => () => worker.current?.terminate(), [])

  const customSeats = opts.smcCount + ([3, 4, 5, 6] as const).reduce((s, k) => s + k * (opts.grcCounts[k] || 0), 0)
  const seats = opts.method === 'custom' ? customSeats : opts.totalSeats
  const districts = opts.method === 'custom' ? opts.smcCount + Object.values(opts.grcCounts).reduce((a, b) => a + b, 0) : null
  const problem = useMemo(() => {
    if (seats < 20 || seats > 150) return 'Choose between 20 and 150 seats.'
    if (opts.method !== 'ebrc' && opts.smcCount > seats) return 'More SMCs than seats.'
    if (opts.method === 'custom' && districts === 0) return 'Add at least one constituency.'
    if (opts.smcCount < 8) return 'The Constitution requires at least 8 SMCs.'
    return null
  }, [seats, opts, districts])

  const draw = (o: RedistrictOptions = opts) => {
    worker.current ??= new Worker(new URL('../model/redistrict/redistrict.worker.ts', import.meta.url), { type: 'module' })
    const id = ++job.current
    setError(null)
    setRunning({ fraction: 0, label: 'Preparing…' })
    worker.current.onmessage = (e: MessageEvent<{ job: number; progress?: { fraction: number; label: string }; result?: RedistrictResult; error?: string }>) => {
      if (e.data.job !== id) return
      if (e.data.progress) setRunning(e.data.progress)
      if (e.data.error) { setRunning(null); setError(e.data.error) }
      if (e.data.result) {
        replacePlan(e.data.result.plan)
        setResult({ report: e.data.result.report, method: o.method, opts: o })
        setRunning(null)
        // bring the result card into view
        document.querySelector('aside')?.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
    worker.current.postMessage({ job: id, blocks: data.blocks, ge: data.ge, current: plan, opts: { ...o, year } })
  }
  const another = () => {
    const o = { ...(result?.opts ?? opts), seed: (result?.opts.seed ?? opts.seed) + 1 }
    setOpts(o)
    draw(o)
  }

  return (
    <div>
      <Section title={<span className="text-sm normal-case tracking-normal text-slate-100">✨ Auto-draw</span>} right={<Button onClick={onClose}>← Manual tools</Button>}>
        <p className="text-xs leading-relaxed text-slate-400">Pick a method and the simulator redraws every boundary for you in a few seconds. It uses the {year === 2030 ? '2030 projected' : '2025'} voter numbers (switch at the top). You can undo, or fine-tune the result by hand afterwards.</p>
      </Section>

      {result && !running && <ResultCard r={result.report} method={result.method} onUndo={() => { undo(); setResult(null) }} onAgain={another} onContests={() => setTab('contests')} />}

      <Section title="1 · Choose a method">
        <div className="grid grid-cols-2 gap-1.5">
          {METHODS.map((m) => (
            <button key={m.id} onClick={() => chooseMethod(m.id)}
              className={`rounded-lg border p-2 text-left transition ${opts.method === m.id ? 'border-rose-500 bg-rose-600/15' : 'border-slate-700 hover:bg-slate-900'}`}>
              <div className="text-sm font-semibold"><span className="mr-1">{m.icon}</span>{m.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{m.blurb}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="2 · Settings">
        {opts.method === 'ebrc' && (
          <>
            <Field label="Start from">
              <Segmented value={opts.startFrom} onChange={(v) => set({ startFrom: v })} options={[{ v: 'ge2025', l: 'GE2025 map' }, { v: 'current', l: 'My current map' }]} />
            </Field>
            <Field label="Total seats" hint={`Suggested for the ${year} voters: ${suggestedSeats} (keeps about ${fmt(quota2025)} voters per MP, as in 2025)`}>
              <NumberInput value={opts.totalSeats} min={60} max={130} onChange={(v) => set({ totalSeats: v })} />
              {opts.totalSeats !== suggestedSeats && <button className="ml-2 text-[11px] text-sky-400" onClick={() => set({ totalSeats: suggestedSeats })}>use {suggestedSeats}</button>}
            </Field>
            <Field label="At least this many SMCs" hint="New SMCs are carved out of the most crowded GRCs.">
              <NumberInput value={opts.smcCount} min={8} max={40} onChange={(v) => set({ smcCount: v })} />
            </Field>
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={opts.keepNames} onChange={(e) => set({ keepNames: e.target.checked })} /> Keep existing constituency names
            </label>
          </>
        )}

        {(opts.method === 'compact' || opts.method === 'gerrymander') && (
          <>
            {opts.method === 'gerrymander' && (
              <Field label="Goal">
                <div className="space-y-1">
                  {GOALS.map((g) => (
                    <label key={g.id} className={`flex cursor-pointer items-start gap-2 rounded-md border p-1.5 text-xs ${opts.goal === g.id ? 'border-rose-500/70 bg-rose-600/10' : 'border-slate-800 hover:bg-slate-900'}`}>
                      <input type="radio" className="mt-0.5" checked={opts.goal === g.id} onChange={() => set({ goal: g.id })} />
                      <span><b>{g.label}</b><br /><span className="text-slate-400">{g.hint}</span></span>
                    </label>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Total seats" hint={`Suggested for the ${year} voters: ${suggestedSeats}`}>
              <NumberInput value={opts.totalSeats} min={20} max={150} onChange={(v) => set({ totalSeats: v })} />
            </Field>
            <Field label="Number of SMCs">
              <NumberInput value={opts.smcCount} min={8} max={opts.totalSeats} onChange={(v) => set({ smcCount: v })} />
            </Field>
            <Field label="GRC size">
              <Segmented value={String(opts.grcSize)} onChange={(v) => set({ grcSize: v === 'mixed' ? 'mixed' : (Number(v) as 4 | 5) })}
                options={[{ v: '4', l: '4 MPs' }, { v: 'mixed', l: 'Mix of 4 & 5' }, { v: '5', l: '5 MPs' }]} />
            </Field>
          </>
        )}

        {opts.method === 'custom' && (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Button onClick={() => set({ smcCount: 97, grcCounts: { 3: 0, 4: 0, 5: 0, 6: 0 }, maxDeviation: 0.15 })}>All SMCs (97)</Button>
              <Button onClick={() => set({ smcCount: GE2025_MIX.smc, grcCounts: GE2025_MIX.grc })}>GE2025 mix</Button>
              <Button onClick={() => set({ smcCount: 32, grcCounts: { 3: 0, 4: 0, 5: 0, 6: 0 }, maxDeviation: 0.15 })}>Small Parliament (32)</Button>
            </div>
            <Field label="SMCs (1 MP each)"><NumberInput value={opts.smcCount} min={8} max={150} onChange={(v) => set({ smcCount: v })} /></Field>
            {([3, 4, 5, 6] as const).map((k) => (
              <Field key={k} label={`GRCs of ${k} MPs`}>
                <NumberInput value={opts.grcCounts[k]} min={0} max={40} onChange={(v) => set({ grcCounts: { ...opts.grcCounts, [k]: v } })} />
              </Field>
            ))}
            <div className="mt-1 text-xs text-slate-300">Total: <b className="tabular">{customSeats}</b> seats in <b className="tabular">{districts}</b> constituencies</div>
          </>
        )}

        <Field label="Fairness limit" hint="How far each seat's voters per MP may be from the national average.">
          <select className="rounded border border-slate-700 bg-slate-900 p-1 text-xs" value={opts.maxDeviation} onChange={(e) => set({ maxDeviation: Number(e.target.value) })}>
            {[0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((v) => <option key={v} value={v}>±{v * 100}%{v === 0.3 ? ' (legal limit)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Variation" hint="Each number gives a different map with the same settings.">
          <NumberInput value={opts.seed} min={1} max={9999} onChange={(v) => set({ seed: v })} />
          <button className="ml-2 text-sm" title="Random variation" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 9999) })}>🎲</button>
        </Field>
        {opts.method === 'gerrymander' && (
          <p className="mt-2 rounded-md border border-amber-700/60 bg-amber-950/40 p-2 text-[11px] leading-snug text-amber-100">
            <b>Why this matters:</b> gerrymandering means drawing boundaries to help one side. It works by "packing" rival voters into a few seats or "cracking" them across many. This map still obeys every rule, which shows why independent, transparent boundary-drawing matters. It uses how each neighbourhood voted in 2025.
          </p>
        )}
      </Section>

      <Section title="3 · Draw">
        {problem && <p className="mb-2 text-xs text-amber-300">{problem}</p>}
        {error && <p className="mb-2 text-xs text-red-400">Something went wrong: {error}</p>}
        {running ? (
          <div>
            <div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-rose-500 transition-all" style={{ width: `${Math.max(5, running.fraction * 100)}%` }} /></div>
            <div className="mt-1 text-xs text-slate-400">{running.label}</div>
          </div>
        ) : (
          <>
            <Button variant="primary" className="w-full py-2 text-sm" disabled={!!problem} onClick={() => draw()}>✨ Draw the map</Button>
            <p className="mt-1.5 text-[11px] text-slate-500">This replaces your current map. You can always press Undo.</p>
          </>
        )}
      </Section>
    </div>
  )
}

function ResultCard({ r, method, onUndo, onAgain, onContests }: { r: RedistrictReport; method: Method; onUndo: () => void; onAgain: () => void; onContests: () => void }) {
  const m = METHODS.find((x) => x.id === method)!
  return (
    <Section title={<span className="text-emerald-300">✓ New map drawn</span>} right={<span className="text-[11px] text-slate-500">{(r.ms / 1000).toFixed(1)}s</span>} className="bg-emerald-950/20">
      <p className="text-xs text-slate-300">{m.icon} {m.title}: <b>{r.seats} seats</b> in {r.smc + r.grc} constituencies ({r.smc} SMCs, {r.grc} GRCs).</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Stat label="Largest imbalance" value={`±${(r.maxDeviation * 100).toFixed(1)}%`} sub={`average ±${(r.meanDeviation * 100).toFixed(1)}%`} />
        <Stat label="Voters kept in same seat" value={pct(r.keptShare, 0)} sub="same name as in GE2025" />
        <Stat label="If people voted as in 2025" value={<span>PAP {r.papSeats} · Opp {r.oppSeats}</span>} sub="GE2025 actual: PAP 87 · Opp 10" />
        <Stat label="Close seats" value={r.competitiveSeats} sub="within 5 points of 50-50" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button onClick={onUndo}>↶ Undo</Button>
        <Button onClick={onAgain}>🎲 Try another variation</Button>
        <Button variant="primary" onClick={onContests}>Next: Contests →</Button>
      </div>
    </Section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-300">{label}</span>
        <div className="flex items-center">{children}</div>
      </div>
      {hint && <div className="text-[10px] leading-snug text-slate-500">{hint}</div>}
    </div>
  )
}

function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-slate-700">
      <button className="px-2 py-0.5 text-slate-300 hover:bg-slate-800" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <input type="number" className="w-12 bg-slate-900 py-0.5 text-center text-xs tabular" value={value} min={min} max={max}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, Math.round(v)))) }} />
      <button className="px-2 py-0.5 text-slate-300 hover:bg-slate-800" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-700 text-[11px]">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={`px-2 py-1 ${value === o.v ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>{o.l}</button>
      ))}
    </div>
  )
}
