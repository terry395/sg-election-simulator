import { useEffect, useRef, useState } from 'react'
import { loadData } from './data/loadData'
import { useStore, type Tab, type Tool } from './state/store'
import { DerivedProvider, useDerived } from './state/derived'
import { useNight } from './state/night'
import { MapView } from './map/MapView'
import { DrawPanel } from './panels/DrawPanel'
import { ContestPanel } from './panels/ContestPanel'
import { ForecastPanel } from './panels/ForecastPanel'
import { NightOverlay, NightPanel } from './panels/NightPanel'
import { Button, fmt } from './components/ui'
import { decodeState, encodeState, type SharedState } from './share/serialize'
import { DEFAULT_PARTIES } from './data/parties'

const STORAGE_KEY = 'sg-election-sim:v1'

export default function App() {
  const data = useStore((s) => s.data)
  const init = useStore((s) => s.init)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
      .then((d) => {
        const hash = new URLSearchParams(location.hash.slice(1)).get('s')
        let shared: SharedState | null = hash ? decodeState(hash, d.blocks.length) : null
        if (!shared) {
          try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) shared = decodeState(saved, d.blocks.length)
          } catch { /* storage unavailable */ }
        }
        init(d, shared)
        if (hash) history.replaceState(null, '', location.pathname + location.search)
      })
      .catch((e) => setError(String(e)))
  }, [init])

  if (error) return <div className="p-8 text-red-300">Failed to load data: {error}</div>
  if (!data) return (
    <div className="flex h-full items-center justify-center text-slate-400">
      <div className="text-center"><div className="mb-2 animate-pulse text-3xl">🗳️</div>Loading electoral map…</div>
    </div>
  )
  return (
    <DerivedProvider>
      <Shell />
    </DerivedProvider>
  )
}

const TABS: { id: Tab; label: string; n: number }[] = [
  { id: 'draw', label: 'Draw boundaries', n: 1 },
  { id: 'contests', label: 'Contests', n: 2 },
  { id: 'forecast', label: 'Swings & forecast', n: 3 },
  { id: 'night', label: 'Election night', n: 4 },
]
const TOOL_KEYS: Record<string, Tool> = { v: 'inspect', b: 'paint', g: 'fill', l: 'lasso', e: 'erase', h: 'pan' }

function Shell() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const plan = useStore((s) => s.plan)
  const resetNight = useNight((s) => s.reset)
  useAutosave()

  // a changed map, contest or swing invalidates an election night in progress
  const contestOverrides = useStore((s) => s.contestOverrides)
  const swings = useStore((s) => s.swings)
  const year = useStore((s) => s.year)
  const parties = useStore((s) => s.parties)
  useEffect(() => { resetNight() }, [plan, contestOverrides, swings, year, parties, resetNight])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
      const s = useStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (s.tab === 'draw' && TOOL_KEYS[e.key.toLowerCase()]) s.setTool(TOOL_KEYS[e.key.toLowerCase()])
      if (['1', '2', '3', '4'].includes(e.key)) s.setTab(TABS[Number(e.key) - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <Header />
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-3">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? 'border-rose-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px]">{t.n}</span>{t.label}
          </button>
        ))}
      </nav>
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-[55vh] shrink-0 md:h-auto md:flex-1">
          <MapView />
          {tab === 'night' && <NightOverlay />}
          <MapLegend />
        </div>
        <aside key={tab} className="scroll-thin min-h-0 flex-1 overflow-y-auto border-l border-slate-800 bg-slate-950 md:w-[420px] md:flex-none">
          {tab === 'draw' && <DrawPanel />}
          {tab === 'contests' && <ContestPanel />}
          {tab === 'forecast' && <ForecastPanel />}
          {tab === 'night' && <NightPanel />}
        </aside>
      </main>
    </div>
  )
}

function MapLegend() {
  const tab = useStore((s) => s.tab)
  const { partyMap, contests, projection } = useDerived()
  if (tab === 'draw') return null
  const ids = tab === 'contests'
    ? [...new Set(Object.values(contests).map((c) => c.parties.find((p) => p !== 'PAP')).filter(Boolean) as string[])]
    : [...new Set(projection.seats.map((s) => s.winner))]
  return (
    <div className="pointer-events-none absolute bottom-6 left-3 z-10 rounded-md bg-slate-950/85 px-2.5 py-1.5 text-[11px] ring-1 ring-slate-700">
      <div className="mb-0.5 text-slate-400">{tab === 'contests' ? 'Main challenger' : tab === 'forecast' ? 'Projected winner (paler = closer)' : 'Declared winner (grey = counting)'}</div>
      <div className="flex flex-wrap gap-x-2">
        {ids.map((p) => <span key={p}><span style={{ color: partyMap[p]?.color }}>■</span> {p}</span>)}
        {tab === 'contests' && <span><span className="text-slate-400">■</span> walkover</span>}
      </div>
    </div>
  )
}

function currentState(): SharedState {
  const s = useStore.getState()
  // contests are stored as overrides; share the full effective set so links are stable
  return {
    plan: s.plan,
    contests: s.contestOverrides,
    swings: s.swings,
    year: s.year,
    customParties: s.parties.filter((p) => p.custom || JSON.stringify(p) !== JSON.stringify(DEFAULT_PARTIES.find((d) => d.id === p.id))),
  }
}

function useAutosave() {
  const plan = useStore((s) => s.plan)
  const contestOverrides = useStore((s) => s.contestOverrides)
  const swings = useStore((s) => s.swings)
  const year = useStore((s) => s.year)
  const parties = useStore((s) => s.parties)
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, encodeState(currentState())) } catch { /* ignore */ }
    }, 600)
    return () => clearTimeout(t)
  }, [plan, contestOverrides, swings, year, parties])
}

function Header() {
  const year = useStore((s) => s.year)
  const setYear = useStore((s) => s.setYear)
  const data = useStore((s) => s.data)!
  const importState = useStore((s) => s.importState)
  const [msg, setMsg] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500) }

  const share = async () => {
    const url = `${location.origin}${location.pathname}#s=${encodeState(currentState())}`
    try { await navigator.clipboard.writeText(url); flash('Link copied to clipboard') } catch { prompt('Copy this link', url) }
  }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'sg-election-simulator', version: 1, state: currentState() }, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ge2030-map.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text())
      const st = j.state as SharedState
      if (!st?.plan?.constituencies || st.plan.assign.length !== data.blocks.length) throw new Error('bad file')
      importState({ ...st, customParties: st.customParties ?? [] })
      flash('Map imported')
    } catch { flash('That file is not a simulator map') }
  }

  const electors = year === 2030 ? data.ge.totalElectors2030 : data.ge.totalElectors
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-600 text-lg font-black">✓</div>
        <div>
          <div className="text-sm font-bold leading-tight">GE2030 Simulator</div>
          <div className="text-[11px] leading-tight text-slate-400">Singapore electoral boundaries & election night</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">Electors</span>
        <div className="flex overflow-hidden rounded-md border border-slate-700">
          {([2025, 2030] as const).map((y) => (
            <button key={y} onClick={() => setYear(y)} className={`px-2.5 py-1 ${year === y ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>
              {y === 2025 ? '2025 register' : '2030 projection'}
            </button>
          ))}
        </div>
        <span className="tabular text-slate-300">{fmt(electors)}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {msg && <span className="text-xs text-emerald-300">{msg}</span>}
        <Button onClick={share} title="Copy a link containing your map, contests and swings">🔗 Share link</Button>
        <Button onClick={exportJson}>⬇ Export</Button>
        <Button onClick={() => fileRef.current?.click()}>⬆ Import</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
        <Button onClick={() => setAbout(true)}>ⓘ</Button>
      </div>
      {about && <About onClose={() => setAbout(false)} />}
    </header>
  )
}

function About({ onClose }: { onClose: () => void }) {
  const ge = useStore((s) => s.data)!.ge
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="scroll-thin max-h-[85vh] max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm leading-relaxed" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between"><h2 className="text-lg font-bold">About this simulator</h2><button onClick={onClose} className="text-slate-400">✕</button></div>
        <p className="text-slate-300">Redraw Singapore's electoral map, choose who contests where, set the swing and watch a simulated GE2030 election night. For entertainment and analysis only; it is not affiliated with ELD or any party.</p>
        <h3 className="mt-3 font-semibold">How the map is built</h3>
        <p className="text-slate-300">The island is divided into ~700 building blocks: URA Master Plan 2019 subzones cut by the GE2025 electoral boundaries, with dense estates split further into cells of about 5,000 electors, which is close to polling-district size. Electors are placed using Census 2020 subzone populations and URA residential plot ratios. They are then scaled so that every GE2025 constituency matches the official register exactly ({ge.totalElectors.toLocaleString()} electors, 97 seats). The 2030 projection adds growth where planned housing is not yet filled (e.g. Tengah).</p>
        <h3 className="mt-3 font-semibold">How votes are modelled</h3>
        <p className="text-slate-300">Each block starts from its GE2025 result, tilted slightly by demographics and re-centred so every 2025 constituency reproduces its real result. New constituencies aggregate their blocks. Swings apply in this order: national, then party, then demographic (by each seat's age, ethnicity and housing mix), then local. A stronger or weaker opposition slate than 2025 moves the vote, and multi-cornered fights split it. With the GE2025 map and no swing, the model reproduces all 32 contested GE2025 results. Marine Parade–Braddell Heights was a walkover, so its notional vote (PAP ~62%) is an estimate.</p>
        <h3 className="mt-3 font-semibold">Sources</h3>
        <ul className="list-disc pl-5 text-slate-300">
          <li>Elections Department: Electoral Boundary 2025, GE results by candidate, registered electors (data.gov.sg)</li>
          <li>URA: Master Plan 2019 Subzone Boundary and Land Use layer (data.gov.sg)</li>
          <li>SingStat: Census of Population 2020, residents by subzone, age, ethnicity and dwelling type (data.gov.sg)</li>
          <li>Basemap © OpenFreeMap, © OpenStreetMap contributors</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">Block-level electors and vote shares are modelled estimates; official figures exist only at polling-district or constituency level. Contains information from data.gov.sg accessed under the Singapore Open Data Licence.</p>
      </div>
    </div>
  )
}
