import { useEffect, useState } from 'react'
import { BarChart3, Hammer, Loader2, Redo2, ScrollText, Undo2, Users, type LucideIcon } from 'lucide-react'
import { MobileSheet } from '../components/MobileSheet'
import { Footer } from '../components/Footer'
import { useSheet } from '../lib/sheet'
import { useIsMobile } from '../lib/useIsMobile'
import { loadPlanner } from './data/loadPlanner'
import { savePlanner, usePlanner, type PlannerTab, type PlannerTool } from './state/planner'
import { PlannerDerivedProvider, usePlannerDerived } from './state/derived'
import { PlannerMap } from './map/PlannerMap'
import { PopulationPanel } from './panels/PopulationPanel'
import { BuildPanel, NoticeBox, PLANNER_TOOLS } from './panels/BuildPanel'
import { IndicatorsPanel } from './panels/IndicatorsPanel'
import { ReportPanel } from './panels/ReportPanel'
import { PlannerReport } from './report/PlannerReport'
import { PHASES } from './model/population'
import { ZONE } from './model/zones'
import { scoreWord, sgd, thousands } from './panels/format'

const TABS: { id: PlannerTab; label: string; short: string; n: number; icon: LucideIcon }[] = [
  { id: 'population', label: 'Population', short: 'People', n: 1, icon: Users },
  { id: 'build', label: 'Plan & build', short: 'Build', n: 2, icon: Hammer },
  { id: 'indicators', label: 'Indicators', short: 'Results', n: 3, icon: BarChart3 },
  { id: 'report', label: 'Final report', short: 'Report', n: 4, icon: ScrollText },
]
const TOOL_KEYS: Record<string, PlannerTool> = { v: 'inspect', b: 'paint', g: 'fill', l: 'lasso', r: 'reclaim', e: 'erase', h: 'pan' }

/** The National Planner: act as the government and plan Singapore's land to 2050. */
export default function PlannerApp() {
  const data = usePlanner((s) => s.data)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (usePlanner.getState().data) return
    loadPlanner().then((d) => usePlanner.getState().init(d)).catch((e) => setError(String(e)))
  }, [])
  if (error) return <div className="p-8 text-red-300">Failed to load planning data: {error}</div>
  if (!data) return (
    <div className="flex h-full flex-1 items-center justify-center text-slate-400">
      <div className="flex flex-col items-center gap-2 text-center"><Loader2 size={28} className="animate-spin text-emerald-500" aria-hidden />Loading the land use map…</div>
    </div>
  )
  return (
    <PlannerDerivedProvider>
      <PlannerShell />
    </PlannerDerivedProvider>
  )
}

function PlannerShell() {
  const tab = usePlanner((s) => s.tab)
  const setTab = usePlanner((s) => s.setTab)
  const mobile = useIsMobile()
  const sheetH = useSheet((s) => s.height)
  useAutosave()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
      const s = usePlanner.getState()
      if (s.reportOpen) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (s.tab === 'build' && TOOL_KEYS[e.key.toLowerCase()]) s.setTool(TOOL_KEYS[e.key.toLowerCase()])
      if (['1', '2', '3', '4'].includes(e.key)) s.setTab(TABS[Number(e.key) - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { useSheet.getState().setSnap('half') }, [tab])

  const panel = (
    <>
      {tab === 'population' && <PopulationPanel />}
      {tab === 'build' && <BuildPanel />}
      {tab === 'indicators' && <IndicatorsPanel />}
      {tab === 'report' && <ReportPanel />}
    </>
  )
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-3 phone:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? 'border-emerald-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px]">{t.n}</span>{t.label}
          </button>
        ))}
        <PhaseBadge />
      </nav>
      <main className="relative flex min-h-0 flex-1 flex-col desk:flex-row">
        <div className="relative min-h-0 flex-1 overflow-hidden" style={mobile ? { '--sheet-h': `${sheetH}px` } as React.CSSProperties : undefined}>
          <PlannerMap />
          <PhoneTools />
          <Notice />
        </div>
        {mobile ? <MobileSheet contentKey={tab} summary={<Summary />}>{panel}</MobileSheet> : (
          <aside key={tab} className="scroll-thin min-h-0 w-[420px] flex-none overflow-y-auto border-l border-slate-800 bg-slate-950">
            {panel}
          </aside>
        )}
      </main>
      <Footer className="desk:hidden" />
      <BottomTabs />
      <PlannerReport />
    </div>
  )
}

function PhaseBadge() {
  const phase = usePlanner((s) => s.phase)
  const { snap } = usePlannerDerived()
  return (
    <div className="ml-auto flex items-center gap-3 whitespace-nowrap py-2 text-xs text-slate-400">
      <span>Planning <b className="text-slate-100">{PHASES[phase].label}</b></span>
      <span>Score <b className="text-slate-100">{snap.score}</b></span>
      <span className={snap.spend > snap.budget ? 'text-amber-300' : ''}>Budget <b className="text-slate-100">{sgd(snap.spend)}</b> / S${snap.budget}b</span>
    </div>
  )
}

function useAutosave() {
  const plan = usePlanner((s) => s.plan)
  const policy = usePlanner((s) => s.policy)
  const name = usePlanner((s) => s.name)
  const phase = usePlanner((s) => s.phase)
  useEffect(() => {
    const t = setTimeout(savePlanner, 600)
    return () => clearTimeout(t)
  }, [plan, policy, name, phase])
}

/** Why the last brush stroke could not change some hexagons. */
function Notice() {
  const notice = usePlanner((s) => s.notice)
  const clear = usePlanner((s) => s.clearNotice)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clear, 6000)
    return () => clearTimeout(t)
  }, [notice, clear])
  if (!notice) return null
  return (
    <div className="absolute right-3 top-3 z-20 w-80 max-w-[calc(100%-5rem)] shadow-lg phone:left-14 phone:right-2 phone:w-auto">
      <NoticeBox text={notice.text} n={notice.n} onClose={clear} />
    </div>
  )
}

/** One-glance summary in the phone sheet header. */
function Summary() {
  const phase = usePlanner((s) => s.phase)
  const zone = usePlanner((s) => s.zone)
  const tab = usePlanner((s) => s.tab)
  const { snap } = usePlannerDerived()
  const balance = snap.supply - snap.demand
  return (
    <div className="flex items-center gap-3 px-4 pb-2.5 text-xs">
      <span className="font-semibold text-slate-100">{PHASES[phase].label}</span>
      {tab === 'build' && <span className="flex min-w-0 items-center gap-1 text-slate-300"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ZONE[zone].color }} /><span className="truncate">{ZONE[zone].label}</span></span>}
      <span className="ml-auto whitespace-nowrap text-slate-400">Score <b className="text-slate-100">{snap.score}</b> · {scoreWord(snap.score)}</span>
      <span className={`whitespace-nowrap ${balance < -snap.demand * 0.02 ? 'text-rose-300' : 'text-slate-400'}`}>{balance >= 0 ? '+' : '−'}{thousands(Math.abs(balance))} homes</span>
    </div>
  )
}

const DRAWING = new Set<PlannerTool>(['paint', 'fill', 'lasso', 'reclaim', 'erase'])

/** Phones: tools float on the map within thumb reach. */
function PhoneTools() {
  const tab = usePlanner((s) => s.tab)
  const tool = usePlanner((s) => s.tool)
  const setTool = usePlanner((s) => s.setTool)
  const undo = usePlanner((s) => s.undo)
  const redo = usePlanner((s) => s.redo)
  const canUndo = usePlanner((s) => s.past.length > 0)
  const canRedo = usePlanner((s) => s.future.length > 0)
  const setSnap = useSheet((s) => s.setSnap)
  const sheetH = useSheet((s) => s.height)
  const sheetFull = useSheet((s) => s.snap === 'full')
  if (tab !== 'build' || sheetFull) return null
  const pick = (id: PlannerTool) => { setTool(id); if (DRAWING.has(id)) setSnap('peek') }
  const btn = 'flex h-12 w-10 flex-col items-center justify-center text-[9px] leading-none disabled:opacity-35'
  return (
    <div className="absolute left-1/2 z-10 flex -translate-x-1/2 items-stretch overflow-hidden rounded-xl bg-slate-950/90 shadow-lg ring-1 ring-slate-700 backdrop-blur desk:hidden"
      style={{ bottom: sheetH + 28 }} role="toolbar" aria-label="Planning tools">
      {PLANNER_TOOLS.filter((t) => t.id !== 'pan').map((t) => (
        <button key={t.id} type="button" onClick={() => pick(t.id)} aria-pressed={tool === t.id} title={t.hint}
          className={`${btn} ${tool === t.id ? 'bg-emerald-600 text-white' : 'text-slate-200 active:bg-slate-800'}`}>
          <t.icon size={17} aria-hidden /><span className="mt-0.5">{t.label.split(' ')[0]}</span>
        </button>
      ))}
      <div className="border-l border-slate-700" />
      <button type="button" onClick={undo} disabled={!canUndo} className={`${btn} text-slate-200`} aria-label="Undo"><Undo2 size={17} aria-hidden /></button>
      <button type="button" onClick={redo} disabled={!canRedo} className={`${btn} text-slate-200`} aria-label="Redo"><Redo2 size={17} aria-hidden /></button>
    </div>
  )
}

function BottomTabs() {
  const tab = usePlanner((s) => s.tab)
  const setTab = usePlanner((s) => s.setTab)
  return (
    <nav className="flex shrink-0 border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)] desk:hidden" aria-label="Steps">
      {TABS.map((t) => (
        <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${tab === t.id ? 'text-emerald-400' : 'text-slate-400'}`}>
          <t.icon size={19} aria-hidden />{t.short}
        </button>
      ))}
    </nav>
  )
}
