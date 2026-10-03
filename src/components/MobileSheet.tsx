import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { NightControls, useDeclared } from '../panels/NightPanel'
import { SeatBar } from './SeatBar'
import { fmt } from './ui'
import { fmtDev } from '../model/validation'
import { clock } from '../model/timeline'
import { CheckCircle2, ChevronUp, XCircle } from 'lucide-react'
import { ORDER, nearestSnap, useSheet, type Snap } from '../lib/sheet'

/** gap kept above a full-height sheet so the map stays reachable */
const TOP_GAP = 48
/** movement before a press on the header counts as a drag rather than a tap */
const DRAG_SLOP = 6

/** Draggable bottom sheet holding the side panel on phones. */
export function MobileSheet({ children, contentKey }: { children: ReactNode; contentKey: string }) {
  const snap = useSheet((s) => s.snap)
  const setSnap = useSheet((s) => s.setSnap)
  const setHeight = useSheet((s) => s.setHeight)
  const box = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const [parentH, setParentH] = useState(0)
  const [headH, setHeadH] = useState(96)
  const [dragH, setDragH] = useState<number | null>(null)
  const drag = useRef<{ y: number; h: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null)

  // track the space available and the size of the summary row
  useLayoutEffect(() => {
    const parent = box.current?.parentElement
    if (!parent || !head.current) return
    const ro = new ResizeObserver(() => {
      setParentH(parent.clientHeight)
      if (head.current) setHeadH(head.current.offsetHeight)
    })
    ro.observe(parent)
    ro.observe(head.current)
    return () => ro.disconnect()
  }, [])

  const snaps: Record<Snap, number> = {
    peek: Math.min(headH, parentH),
    half: Math.max(headH, Math.round(parentH * 0.5)),
    full: Math.max(headH, parentH - TOP_GAP),
  }
  const settled = snaps[snap]
  const height = dragH ?? settled

  useEffect(() => { setHeight(settled) }, [settled, setHeight])

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { y: e.clientY, h: settled, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = d.y - e.clientY
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_SLOP) return
      d.moved = true
      head.current?.setPointerCapture(e.pointerId)
    }
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    setDragH(Math.max(snaps.peek, Math.min(snaps.full, d.h + dy)))
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    head.current?.releasePointerCapture(e.pointerId)
    setSnap(nearestSnap(dragH ?? settled, d.v, snaps))
    setDragH(null)
  }
  const cycle = () => setSnap(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length])

  return (
    <div ref={box} role="region" aria-label="Panel"
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border-t border-slate-700 bg-slate-950 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] ${dragH === null ? 'transition-[height] duration-200 ease-out' : ''}`}
      style={{ height }}>
      <div ref={head} className="shrink-0 touch-none select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <button type="button" onClick={cycle} className="flex w-full justify-center pb-1 pt-2" aria-label={snap === 'full' ? 'Lower the panel' : 'Raise the panel'}>
          <span className="h-1.5 w-10 rounded-full bg-slate-600" />
        </button>
        <SheetSummary />
      </div>
      <div key={contentKey} className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-800 pb-4">
        {children}
      </div>
    </div>
  )
}

/** One-glance summary of the current tab, visible even when the sheet is lowered. */
function SheetSummary() {
  const tab = useStore((s) => s.tab)
  return (
    <div className="px-4 pb-2.5 text-xs">
      {tab === 'draw' && <DrawSummary />}
      {tab === 'contests' && <ContestsSummary />}
      {tab === 'forecast' && <ForecastSummary />}
      {tab === 'night' && <NightSummary />}
    </div>
  )
}

function ChecksBadge() {
  const { issues } = useDerived()
  const errors = issues.filter((i) => i.level === 'error').length
  const warnings = issues.filter((i) => i.level === 'warning').length
  if (!errors && !warnings) return <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 size={13} aria-hidden /> All rules met</span>
  return <span className="inline-flex items-center gap-1"><XCircle size={13} className={errors ? 'text-red-400' : 'text-amber-300'} aria-hidden /><span className={errors ? 'text-red-400' : 'text-slate-400'}>{errors} errors</span><span className="text-slate-600">·</span><span className={warnings ? 'text-amber-300' : 'text-slate-400'}>{warnings} warnings</span></span>
}

function DrawSummary() {
  const activeId = useStore((s) => s.activeId)
  const plan = useStore((s) => s.plan)
  const rules = useStore((s) => s.rules)
  const { stats } = useDerived()
  const c = plan.constituencies.find((x) => x.id === activeId)
  const s = c ? stats.byId[c.id] : null
  const bad = s && Math.abs(s.deviation) > rules.maxDeviation
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {c ? <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} /> : null}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c ? `${c.name} ${c.type === 'GRC' ? `GRC · ${c.seats} MPs` : 'SMC'}` : 'No constituency selected'}</span>
        {s && s.electors > 0 && <span className="tabular shrink-0 text-slate-300">{fmt(s.electors)} <span className={bad ? 'text-red-400' : 'text-slate-500'}>{fmtDev(s.deviation)}</span></span>}
      </div>
      <div className="flex items-center justify-between text-slate-400">
        <ChecksBadge />
        <span>{plan.constituencies.length} seats · {stats.seats} MPs</span>
      </div>
    </div>
  )
}

function ContestsSummary() {
  const { contests } = useDerived()
  const all = Object.values(contests)
  const walkovers = all.filter((c) => c.parties.length <= 1).length
  const multi = all.filter((c) => c.parties.length > 2).length
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold">Party line-ups</span>
      <span className="text-slate-400">{all.length - walkovers} contested · {multi} multi-cornered · {walkovers} walkovers</span>
    </div>
  )
}

function ForecastSummary() {
  const { projection, partyMap, stats } = useDerived()
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">Projected Parliament</span>
        <span className="text-slate-400">{Object.entries(projection.seatsByParty).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} ${n}`).join(' · ')}</span>
      </div>
      <SeatBar seats={projection.seatsByParty} total={stats.seats} parties={partyMap} height={14} showLabels={false} />
    </div>
  )
}

function NightSummary() {
  const result = useNight((s) => s.result)
  const t = useNight((s) => s.t)
  const { partyMap } = useDerived()
  const d = useDeclared()
  const setSnap = useSheet((s) => s.setSnap)
  if (!result) return (
    <button type="button" onClick={() => setSnap('half')} className="flex w-full items-center justify-between text-left">
      <span className="text-sm font-semibold">Election night</span>
      <span className="inline-flex items-center gap-1 text-rose-300">Choose a night and start the count <ChevronUp size={14} aria-hidden /></span>
    </button>
  )
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-sm font-bold text-rose-400">{t < 0 ? '8:00 pm' : clock(t)}</span>
        <NightControls compact />
      </div>
      <SeatBar seats={d.seats} total={d.total} parties={partyMap} height={12} showLabels={false} />
      <div className="text-[11px] text-slate-400">{d.declared} of {d.total} seats declared</div>
    </div>
  )
}
