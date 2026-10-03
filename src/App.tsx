import { useEffect, useRef, useState } from 'react'
import { loadData } from './data/loadData'
import { useStore, type Tab, type Tool } from './state/store'
import { DerivedProvider, useDerived } from './state/derived'
import { useNight } from './state/night'
import { MapView } from './map/MapView'
import { DrawPanel } from './panels/DrawPanel'
import { ContestPanel } from './panels/ContestPanel'
import { ForecastPanel } from './panels/ForecastPanel'
import { NightOverlay, NightPanel, NightParliament } from './panels/NightPanel'
import { Button, Swatch, fmt } from './components/ui'
import { AlertTriangle, ArrowRight, BookOpen, Download, Info, Landmark, Loader2, Share2, ShieldCheck, Upload, Vote, X } from 'lucide-react'
import { DISCLAIMER_FULL, DISCLAIMER_SHORT } from './data/disclaimer'
import { PartyDrawer } from './components/PartyDrawer'
import { ElectionReport } from './components/ElectionReport'
import { decodeState, encodeState, type SharedState } from './share/serialize'
import { DEFAULT_PARTIES } from './data/parties'

const STORAGE_KEY = 'sg-election-sim:v1'
/** shown with everything that leaves the app: shares, exports, shared-link visits */
const DISCLAIMER = 'Made by an individual with the GE2030 Simulator, for entertainment and education. It does not represent any real-life polling, survey or official projection, and is not affiliated with the Elections Department or any political party.'
const shareText = (url: string) => `My GE2030 scenario on the SG Election Simulator, made for entertainment and education. Not real-life polling, a survey or an official projection.\n${url}`
const GUIDE_SEEN_KEY = 'sg-election-sim:guide-seen'
const GUIDE_URL = import.meta.env.BASE_URL + 'guide.html'

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
        init(d, shared, !!hash && !!shared)
        if (hash) history.replaceState(null, '', location.pathname + location.search)
      })
      .catch((e) => setError(String(e)))
  }, [init])

  if (error) return <div className="p-8 text-red-300">Failed to load data: {error}</div>
  if (!data) return (
    <div className="flex h-full items-center justify-center text-slate-400">
      <div className="flex flex-col items-center gap-2 text-center"><Loader2 size={28} className="animate-spin text-rose-500" aria-hidden />Loading electoral map…</div>
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
    // phones: the whole page scrolls (map, then panel); desktop: fixed layout with a scrolling side panel
    <div className="flex h-full flex-col overflow-y-auto md:overflow-hidden">
      <Header />
      <SharedNotice />
      <WelcomeBanner />
      <PartyDrawer />
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-3">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? 'border-rose-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px]">{t.n}</span>{t.label}
          </button>
        ))}
      </nav>
      <main className="flex shrink-0 flex-col md:min-h-0 md:flex-1 md:shrink md:flex-row">
        <div className="relative h-[55vh] shrink-0 md:h-auto md:flex-1">
          <MapView />
          {tab === 'night' && <NightOverlay />}
          {tab === 'night' && <NightParliament />}
          <MapLegend />
        </div>
        <aside key={tab} className="scroll-thin border-slate-800 bg-slate-950 md:min-h-0 md:w-[420px] md:flex-none md:overflow-y-auto md:border-l">
          {tab === 'draw' && <DrawPanel />}
          {tab === 'contests' && <ContestPanel />}
          {tab === 'forecast' && <ForecastPanel />}
          {tab === 'night' && <NightPanel />}
        </aside>
      </main>
      <Footer />
      <ElectionReport />
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
        {ids.map((p) => <span key={p}><Swatch color={partyMap[p]?.color} /> {p}</span>)}
        {tab === 'contests' && <span><Swatch /> walkover</span>}
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

/** One-time invitation to read the beginner guide. */
function WelcomeBanner() {
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(GUIDE_SEEN_KEY) } catch { return false }
  })
  if (!show) return null
  const dismiss = () => {
    try { localStorage.setItem(GUIDE_SEEN_KEY, '1') } catch { /* ignore */ }
    setShow(false)
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rose-900/60 bg-rose-950/60 px-4 py-2 text-sm">
      <BookOpen size={16} className="shrink-0 text-rose-300" aria-hidden />
      <span>New here? Read the <b>5-minute beginner guide</b>: it explains every button and every election term in plain English. <span className="text-slate-400">{DISCLAIMER_SHORT}</span></span>
      <a href={GUIDE_URL} target="_blank" rel="noopener" onClick={dismiss} className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500">Open the guide <ArrowRight size={13} aria-hidden /></a>
      <button onClick={dismiss} className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">Dismiss <X size={13} aria-hidden /></button>
    </div>
  )
}

/** Persistent disclaimer strip at the bottom of the app. */
function Footer() {
  return (
    <footer className="flex shrink-0 items-center gap-1.5 border-t border-slate-800 bg-slate-950 px-4 py-1 text-[10px] text-slate-500">
      <ShieldCheck size={12} className="shrink-0" aria-hidden />
      <span>{DISCLAIMER_SHORT} Not affiliated with the Elections Department or any political party.</span>
    </footer>
  )
}

function Header() {
  const year = useStore((s) => s.year)
  const setYear = useStore((s) => s.setYear)
  const data = useStore((s) => s.data)!
  const importState = useStore((s) => s.importState)
  const [msg, setMsg] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const [sharing, setSharing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500) }

  const share = () => setSharing(`${location.origin}${location.pathname}#s=${encodeState(currentState())}`)
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'sg-election-simulator', version: 1, disclaimer: DISCLAIMER, state: currentState() }, null, 1)], { type: 'application/json' })
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
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-600"><Vote size={18} className="text-white" aria-hidden /></div>
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
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {msg && <span className="text-xs text-emerald-300">{msg}</span>}
        <Button onClick={() => useStore.getState().showPartyInfo('PAP')} title="Who are the parties? Beginner-friendly profiles"><Landmark size={14} aria-hidden /> Parties</Button>
        <a href={GUIDE_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/70 bg-rose-600/15 px-2.5 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-600/30" title="Step-by-step beginner guide"><BookOpen size={14} aria-hidden /> Guide</a>
        <Button onClick={share} title="Copy a link containing your map, contests and swings"><Share2 size={14} aria-hidden /> Share link</Button>
        <Button onClick={exportJson}><Download size={14} aria-hidden /> Export</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden /> Import</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
        <Button onClick={() => setAbout(true)} title="About, sources and disclaimer" aria-label="About"><Info size={14} aria-hidden /></Button>
      </div>
      {about && <About onClose={() => setAbout(false)} />}
      {sharing && <ShareDialog url={sharing} onClose={() => setSharing(null)} onCopied={() => flash('Link copied with disclaimer')} />}
    </header>
  )
}

/** Share dialog: every copied link carries the disclaimer. */
function ShareDialog({ url, onClose, onCopied }: { url: string; onClose: () => void; onCopied: () => void }) {
  const text = shareText(url)
  const [failed, setFailed] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      onCopied()
      onClose()
    } catch {
      setFailed(true)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share your scenario">
        <div className="mb-2 flex items-start justify-between"><h2 className="flex items-center gap-2 text-base font-bold"><Share2 size={16} aria-hidden /> Share your scenario</h2><button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} /></button></div>
        <div className="rounded-md border border-amber-600/60 bg-amber-950/40 p-2.5 text-xs leading-snug text-amber-100">
          <b>Please share responsibly.</b> {DISCLAIMER} The link opens your map, contests and swings exactly as you set them.
        </div>
        <p className="mt-3 text-xs text-slate-400">This is what will be copied. The note travels with the link:</p>
        <textarea readOnly value={text} rows={4} onFocus={(e) => e.currentTarget.select()}
          className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-slate-950 p-2 font-mono text-[11px] text-slate-200" aria-label="Link with disclaimer" />
        {failed && <p className="mt-1 text-xs text-amber-300">Your browser blocked copying. Select the text above and copy it (Ctrl+C).</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={copy}>Copy link with disclaimer</Button>
        </div>
      </div>
    </div>
  )
}

/** Shown to anyone who opens a shared link. */
function SharedNotice() {
  const fromShare = useStore((s) => s.fromShare)
  const dismiss = useStore((s) => s.dismissShareNotice)
  if (!fromShare) return null
  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-amber-700/60 bg-amber-950/70 px-4 py-2 text-sm text-amber-50" role="note">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
      <span className="flex-1">You're viewing a <b>scenario someone made for fun</b> with this simulator. It does <b>not represent any real-life polling, survey or official projection</b>, and is not affiliated with the Elections Department or any political party.</span>
      <button onClick={dismiss} className="inline-flex items-center gap-1 text-xs text-amber-200 hover:text-white">Got it <X size={13} aria-hidden /></button>
    </div>
  )
}

function About({ onClose }: { onClose: () => void }) {
  const ge = useStore((s) => s.data)!.ge
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="scroll-thin max-h-[85vh] max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm leading-relaxed" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between"><h2 className="text-lg font-bold">About this simulator</h2><button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} /></button></div>
        <p className="text-slate-300">Redraw Singapore's electoral map, choose who contests where, set the swing and watch a simulated GE2030 election night.</p>
        <div className="mt-3 rounded-md border border-amber-600/60 bg-amber-950/40 p-3 text-xs leading-snug text-amber-100">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><ShieldCheck size={14} aria-hidden /> Disclaimer &amp; privacy</div>
          {DISCLAIMER_FULL}
        </div>
        <h3 className="mt-3 font-semibold">How the map is built</h3>
        <p className="text-slate-300">The island is divided into ~700 building blocks: URA Master Plan 2019 subzones cut by the GE2025 electoral boundaries, with dense estates split further into cells of about 5,000 electors, which is close to polling-district size. Electors are placed using Census 2020 subzone populations and URA residential plot ratios. They are then scaled so that every GE2025 constituency matches the official register exactly ({ge.totalElectors.toLocaleString()} electors, 97 seats). The 2030 projection adds growth where planned housing is not yet filled (e.g. Tengah).</p>
        <h3 className="mt-3 font-semibold">How votes are modelled</h3>
        <p className="text-slate-300">Each block starts from its GE2025 result, tilted slightly by demographics and re-centred so every 2025 constituency reproduces its real result. New constituencies aggregate their blocks. Swings apply in this order: national, then party, then demographic (by each seat's age, ethnicity and housing mix), then local. A stronger or weaker opposition slate than 2025 moves the vote, and multi-cornered fights split it. With the GE2025 map and no swing, the model reproduces all 32 contested GE2025 results. Marine Parade–Braddell Heights was a walkover, so its notional vote (PAP ~62%) is an estimate.</p>
        <h3 className="mt-3 font-semibold">Sources</h3>
        <ul className="list-disc pl-5 text-slate-300">
          <li>Elections Department: Electoral Boundary 2025, GE results by candidate, registered electors (data.gov.sg)</li>
          <li>URA: Master Plan 2019 Subzone Boundary and Land Use layer (data.gov.sg)</li>
          <li>SingStat: Census of Population 2020, residents by subzone, age, ethnicity and dwelling type (data.gov.sg)</li>
          <li>Basemap © OpenFreeMap, © OpenStreetMap contributors; satellite imagery © Esri, Maxar, Earthstar Geographics</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">Block-level electors and vote shares are modelled estimates; official figures exist only at polling-district or constituency level. Contains information from data.gov.sg accessed under the Singapore Open Data Licence.</p>
      </div>
    </div>
  )
}
