import { useMemo, useState } from 'react'
import { useStore, type Lens } from '../state/store'
import { useDerived } from '../state/derived'
import { Button, Section, ShareBar, Stat, Swatch, fmt, pct } from '../components/ui'
import { AlertTriangle, CheckCircle2, Redo2, ScrollText, Trash2, Undo2, Wand2, XCircle } from 'lucide-react'
import { DEMO_GROUPS } from '../model/swing'
import { LENS_INFO } from '../map/useBlockColors'
import { fmtDev } from '../model/validation'
import { suggestName } from '../model/stats'
import { AutoDrawPanel } from './AutoDrawPanel'
import { TOOLS } from './tools'
import { PAP } from '../data/parties'

const LENSES: { id: Lens; label: string }[] = [
  { id: 'constituency', label: 'Constituencies' },
  { id: 'deviation', label: 'Elector quota' },
  { id: 'pap', label: 'GE2025 PAP vote' },
  { id: 'young', label: 'Young voters' },
  { id: 'senior', label: 'Seniors' },
  { id: 'malay', label: 'Malay' },
  { id: 'indian', label: 'Indian' },
  { id: 'landed', label: 'Landed' },
  { id: 'condo', label: 'Condo' },
  { id: 'density', label: 'Density' },
]

export function DrawPanel() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const lens = useStore((s) => s.lens)
  const setLens = useStore((s) => s.setLens)
  const showGE2025 = useStore((s) => s.showGE2025)
  const setShowGE2025 = useStore((s) => s.setShowGE2025)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const loadPreset = useStore((s) => s.loadPreset)
  const [confirm, setConfirm] = useState<null | 'ge2025' | 'blank'>(null)
  const [auto, setAuto] = useState(false)
  if (auto) return <AutoDrawPanel onClose={() => setAuto(false)} />

  return (
    <div>
      <Section title="Start from">
        {confirm ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="flex-1 text-amber-200">Replace the current map? (Undo is available)</span>
            <Button variant="primary" onClick={() => { loadPreset(confirm); setConfirm(null) }}>Yes</Button>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setConfirm('ge2025')}>GE2025 boundaries</Button>
              <Button className="flex-1" onClick={() => setConfirm('blank')}>Blank map</Button>
            </div>
            <button onClick={() => setAuto(true)} className="mt-2 flex w-full items-center gap-2 rounded-md border border-violet-500/60 bg-gradient-to-r from-violet-600/25 to-rose-600/20 px-3 py-2 text-left hover:from-violet-600/40">
              <Wand2 size={18} className="shrink-0 text-violet-300" aria-hidden />
              <span><span className="block text-sm font-semibold">Auto-draw the whole map</span><span className="block text-[11px] text-slate-300">EBRC-style, fair & compact, custom mix or gerrymander</span></span>
            </button>
          </>
        )}
      </Section>

      <Section title="Tools" className="phone:hidden" right={
        <div className="flex gap-1">
          <Button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={14} /></Button>
          <Button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={14} /></Button>
        </div>
      }>
        <div className="grid grid-cols-6 gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} title={`${t.hint} (${t.key})`} onClick={() => setTool(t.id)}
              className={`flex flex-col items-center rounded-md border py-1.5 text-[10px] ${tool === t.id ? 'border-rose-500 bg-rose-600/20 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
              <t.icon size={16} className="mb-0.5" aria-hidden />{t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-400">{TOOLS.find((t) => t.id === tool)?.hint}. Scroll to zoom; hold <kbd className="rounded bg-slate-800 px-1">Space</kbd> to pan.</p>
      </Section>

      <Section title="Map lens" right={
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <input type="checkbox" checked={showGE2025} onChange={(e) => setShowGE2025(e.target.checked)} /> GE2025 lines
        </label>
      }>
        <div className="flex flex-wrap gap-1">
          {LENSES.map((l) => (
            <button key={l.id} onClick={() => setLens(l.id)} className={`rounded-full border px-2 py-0.5 text-[11px] ${lens === l.id ? 'border-sky-400 bg-sky-500/20 text-sky-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>{l.label}</button>
          ))}
        </div>
        {LENS_INFO[lens] && (
          <div className="mt-2">
            <div className="h-2 rounded" style={{ background: `linear-gradient(90deg, ${LENS_INFO[lens].stops.join(',')})` }} />
            <div className="mt-0.5 flex justify-between text-[10px] text-slate-400"><span>{LENS_INFO[lens].lo}</span><span>{LENS_INFO[lens].label}</span><span>{LENS_INFO[lens].hi}</span></div>
          </div>
        )}
      </Section>

      <Issues />
      <ActiveConstituency />
      <ConstituencyList />
      <RulesEditor />
    </div>
  )
}

function Issues() {
  const { issues } = useDerived()
  const setActive = useStore((s) => s.setActive)
  const [open, setOpen] = useState(false)
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  const infos = issues.filter((i) => i.level === 'info')
  const list = [...errors, ...warnings]
  const shown = open ? list : list.slice(0, 4)
  return (
    <Section title="Checks" right={
      <span className="text-[11px]">
        <span className={errors.length ? 'text-red-400' : 'text-emerald-400'}>{errors.length} errors</span>
        <span className="text-slate-600"> · </span>
        <span className={warnings.length ? 'text-amber-300' : 'text-slate-400'}>{warnings.length} warnings</span>
      </span>
    }>
      {infos.map((i, k) => <div key={k} className="text-[11px] text-slate-400">{i.message}</div>)}
      {list.length === 0 && <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 size={14} aria-hidden /> This map satisfies all the rules</div>}
      <ul className="mt-1 space-y-0.5">
        {shown.map((i, k) => (
          <li key={k}>
            <button className="w-full text-left text-xs hover:underline" onClick={() => i.constituency && setActive(i.constituency)}>
              {i.level === 'error' ? <XCircle size={12} className="inline align-[-2px] text-red-400" aria-hidden /> : <AlertTriangle size={12} className="inline align-[-2px] text-amber-300" aria-hidden />} {i.message}
            </button>
          </li>
        ))}
      </ul>
      {list.length > 4 && <button className="mt-1 text-[11px] text-sky-400" onClick={() => setOpen(!open)}>{open ? 'Show less' : `Show all ${list.length}`}</button>}
      <button type="button" onClick={() => useStore.getState().setEbrcOpen(true)}
        className="mt-2.5 flex w-full items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-left hover:bg-amber-500/20">
        <ScrollText size={17} className="shrink-0 text-amber-300" aria-hidden />
        <span><span className="block text-sm font-semibold">Generate EBRC report</span><span className="block text-[11px] text-slate-300">A mock boundaries report for this map, styled like the real one (view only)</span></span>
      </button>
    </Section>
  )
}

function ActiveConstituency() {
  const activeId = useStore((s) => s.activeId)
  const plan = useStore((s) => s.plan)
  const update = useStore((s) => s.updateConstituency)
  const del = useStore((s) => s.deleteConstituency)
  const data = useStore((s) => s.data)!
  const rules = useStore((s) => s.rules)
  const { stats, partyMap, membersOf } = useDerived()
  const [confirmDel, setConfirmDel] = useState(false)
  const c = plan.constituencies.find((x) => x.id === activeId)
  const s = c ? stats.byId[c.id] : null
  const suggested = useMemo(() => (c ? suggestName(membersOf[c.id] ?? [], data.blocks) : ''), [c, membersOf, data])
  if (c && s && s.electors === 0) return (
    <Section title="Active constituency" right={<span className="h-3 w-3 rounded-sm" style={{ background: c.color }} />}>
      <div className="text-sm font-semibold">{c.name} <span className="font-normal text-slate-400">{c.type === 'GRC' ? `GRC · ${c.seats} MPs` : 'SMC'}</span></div>
      <p className="mt-1 text-xs text-slate-400">No electors yet. Pick the <b>Paint</b>, <b>Fill</b> or <b>Lasso</b> tool and draw on the map to add areas.</p>
      <Button variant="danger" className="mt-2" onClick={() => del(c.id)}>Delete constituency</Button>
    </Section>
  )
  if (!c || !s) return (
    <Section title="Active constituency"><p className="text-xs text-slate-400">Select a constituency on the map or in the list, or add a new one below.</p></Section>
  )
  const geName = (id: string) => data.ge.constituencies.find((g) => g.id === id)?.name.replace(/ (GRC|SMC)$/, '') ?? id
  const devColor = Math.abs(s.deviation) > rules.maxDeviation ? 'text-red-400' : Math.abs(s.deviation) > rules.maxDeviation * 0.8 ? 'text-amber-300' : 'text-emerald-400'
  const opp = Object.entries(s.opp0).filter(([, v]) => v >= 0.0005).sort((a, b) => b[1] - a[1])
  return (
    <Section title="Active constituency" right={<span className="h-3 w-3 rounded-sm" style={{ background: c.color }} />}>
      <div className="flex gap-2">
        <input className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm font-semibold" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} />
        <input type="color" className="h-8 w-8 cursor-pointer rounded border border-slate-700 bg-transparent" value={c.color} onChange={(e) => update(c.id, { color: e.target.value })} title="Colour" />
      </div>
      {suggested && suggested !== c.name && <button className="mt-1 text-[11px] text-sky-400 hover:underline" onClick={() => update(c.id, { name: suggested })}>Rename to “{suggested}”</button>}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
          {(['SMC', 'GRC'] as const).map((t) => (
            <button key={t} onClick={() => update(c.id, { type: t })} className={`px-3 py-1 ${c.type === t ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>{t}</button>
          ))}
        </div>
        {c.type === 'GRC' && (
          <div className="flex items-center gap-1 text-xs">
            {[3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => update(c.id, { seats: n })} className={`h-7 w-7 rounded-md border ${c.seats === n ? 'border-rose-500 bg-rose-600/30' : 'border-slate-700 hover:bg-slate-800'}`}>{n}</button>
            ))}
            <span className="ml-1 text-slate-400">MPs</span>
          </div>
        )}
        <div className="flex-1" />
        {confirmDel ? (
          <><Button variant="danger" onClick={() => { del(c.id); setConfirmDel(false) }}>Delete</Button><Button onClick={() => setConfirmDel(false)}>Keep</Button></>
        ) : <Button variant="danger" onClick={() => setConfirmDel(true)} title="Delete constituency" aria-label="Delete constituency"><Trash2 size={14} /></Button>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Stat label="Electors" value={fmt(s.electors)} sub={`${s.blocks} areas`} />
        <Stat label="Per MP" value={fmt(s.perMp)} />
        <Stat label="vs quota" value={<span className={devColor}>{fmtDev(s.deviation)}</span>} sub={`limit ±${rules.maxDeviation * 100}%`} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Notional GE2025 result</span><span className="tabular">PAP {pct(s.pap0)}</span></div>
        <ShareBar parts={[{ color: partyMap[PAP].color, value: s.pap0, label: 'PAP' }, ...opp.map(([p, v]) => ({ color: partyMap[p]?.color ?? '#999', value: v, label: p }))]} />
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-400">{opp.map(([p, v]) => <span key={p}>{p} {pct(v)}</span>)}</div>
      </div>
      <DemoBars label="Age" groups={DEMO_GROUPS.age} values={s.age} />
      <DemoBars label="Ethnicity" groups={DEMO_GROUPS.eth} values={s.eth} />
      <DemoBars label="Housing" groups={DEMO_GROUPS.house} values={s.house} />
      <div className="mt-2 text-[11px] text-slate-400">
        Drawn from: {Object.entries(s.sources).filter(([, e]) => e > 0).sort((a, b) => b[1] - a[1]).map(([id, e]) => `${geName(id)} ${Math.round((e / s.electors) * 100)}%`).join(', ')}
      </div>
    </Section>
  )
}

const DEMO_COLORS = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c']
function DemoBars({ label, groups, values }: { label: string; groups: readonly { id: string; label: string }[]; values: number[] }) {
  return (
    <div className="mt-2">
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <ShareBar height={7} parts={groups.map((g, i) => ({ color: DEMO_COLORS[i], value: values[i] || 0, label: `${g.label} ${pct(values[i] || 0)}` }))} />
      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-slate-400">
        {groups.map((g, i) => <span key={g.id}><Swatch color={DEMO_COLORS[i]} /> {g.label} {pct(values[i] || 0, 0)}</span>)}
      </div>
    </div>
  )
}

function ConstituencyList() {
  const plan = useStore((s) => s.plan)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const add = useStore((s) => s.addConstituency)
  const rules = useStore((s) => s.rules)
  const { stats } = useDerived()
  const [sort, setSort] = useState<'name' | 'dev'>('name')
  const list = [...plan.constituencies].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : Math.abs(stats.byId[b.id]?.deviation ?? 0) - Math.abs(stats.byId[a.id]?.deviation ?? 0))
  const smc = plan.constituencies.filter((c) => c.type === 'SMC').length
  return (
    <Section title={`Constituencies (${plan.constituencies.length} · ${stats.seats} seats · ${smc} SMC)`} right={
      <div className="flex gap-1">
        <Button onClick={() => add('SMC')}>+ SMC</Button>
        <Button onClick={() => add('GRC')}>+ GRC</Button>
      </div>
    }>
      <div className="mb-1 flex gap-2 text-[11px] text-slate-500">
        Sort: <button className={sort === 'name' ? 'text-slate-200' : ''} onClick={() => setSort('name')}>name</button>
        <button className={sort === 'dev' ? 'text-slate-200' : ''} onClick={() => setSort('dev')}>quota deviation</button>
      </div>
      <ul className="space-y-0.5">
        {list.map((c) => {
          const s = stats.byId[c.id]
          const dev = s?.deviation ?? 0
          const bad = Math.abs(dev) > rules.maxDeviation
          const warn = Math.abs(dev) > rules.maxDeviation * 0.8
          return (
            <li key={c.id}>
              <button onClick={() => setActive(c.id)} className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs ${activeId === c.id ? 'bg-slate-800 ring-1 ring-rose-500/60' : 'hover:bg-slate-900'}`}>
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="w-12 text-slate-400">{c.type === 'SMC' ? 'SMC' : `GRC·${c.seats}`}</span>
                <span className="tabular w-16 text-right text-slate-300">{fmt(s?.electors ?? 0)}</span>
                <span className={`tabular w-14 text-right ${bad ? 'text-red-400' : warn ? 'text-amber-300' : 'text-slate-500'}`}>{s?.electors ? fmtDev(dev) : '—'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function RulesEditor() {
  const rules = useStore((s) => s.rules)
  const setRules = useStore((s) => s.setRules)
  return (
    <Section title="Rules">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label className="text-slate-400">Max deviation
          <select className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 p-1 text-slate-100" value={rules.maxDeviation} onChange={(e) => setRules({ maxDeviation: Number(e.target.value) })}>
            {[0.1, 0.15, 0.2, 0.25, 0.3].map((v) => <option key={v} value={v}>±{v * 100}%</option>)}
          </select>
        </label>
        <label className="text-slate-400">Min SMCs
          <input type="number" min={8} max={40} className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 p-1 text-slate-100" value={rules.minSMC} onChange={(e) => setRules({ minSMC: Math.max(8, Number(e.target.value)) })} />
        </label>
        <label className="text-slate-400">Target seats
          <input type="number" min={60} max={130} className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 p-1 text-slate-100" value={rules.targetSeats} onChange={(e) => setRules({ targetSeats: Number(e.target.value) })} />
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">The Constitution requires at least 8 SMCs and GRCs of 3–6 MPs. The EBRC keeps electors per MP within ±30% of the national average.</p>
    </Section>
  )
}
