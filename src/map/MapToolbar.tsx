import { useStore } from '../state/store'
import { TOOLS } from '../panels/tools'
import { useSheet } from '../lib/sheet'
import { Redo2, Undo2 } from 'lucide-react'

const DRAWING = new Set(['paint', 'fill', 'lasso', 'erase'])

/** Phones: drawing tools float on the map so you never scroll away from what you draw. */
export function MapToolbar() {
  const tab = useStore((s) => s.tab)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const active = useStore((s) => s.plan.constituencies.find((c) => c.id === s.activeId))
  const setSnap = useSheet((s) => s.setSnap)
  const sheetH = useSheet((s) => s.height)
  const sheetFull = useSheet((s) => s.snap === 'full')
  // the panel is fully raised: there is no map left to draw on
  if (tab !== 'draw' || sheetFull) return null

  const pick = (id: typeof tool) => {
    setTool(id)
    // get the panel out of the way of the map while drawing
    if (DRAWING.has(id)) setSnap('peek')
  }
  const btn = 'flex h-12 w-10 flex-col items-center justify-center text-[9px] leading-none disabled:opacity-35'
  const hint = DRAWING.has(tool)
    ? !active && tool !== 'erase' ? 'Select or add a constituency first' : tool === 'fill' ? 'Tap an area to fill' : 'One finger draws · two fingers move the map'
    : null

  return (
    <>
      {/* sits just above the sheet (and the map attribution), within thumb reach */}
      <div className="absolute left-1/2 z-10 flex -translate-x-1/2 items-stretch overflow-hidden rounded-xl bg-slate-950/90 shadow-lg ring-1 ring-slate-700 backdrop-blur desk:hidden"
        style={{ bottom: sheetH + 28 }} role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" onClick={() => pick(t.id)} aria-pressed={tool === t.id} title={t.hint}
            className={`${btn} ${tool === t.id ? 'bg-rose-600 text-white' : 'text-slate-200 active:bg-slate-800'}`}>
            <t.icon size={17} aria-hidden /><span className="mt-0.5">{t.label}</span>
          </button>
        ))}
        <div className="border-l border-slate-700" />
        <button type="button" onClick={undo} disabled={!canUndo} className={`${btn} text-slate-200`} aria-label="Undo"><Undo2 size={17} aria-hidden /></button>
        <button type="button" onClick={redo} disabled={!canRedo} className={`${btn} text-slate-200`} aria-label="Redo"><Redo2 size={17} aria-hidden /></button>
      </div>
      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-2.5 z-10 flex max-w-[calc(100%-7rem)] -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-950/85 px-3 py-1 text-[11px] text-slate-200 shadow ring-1 ring-slate-700 desk:hidden">
          {active && tool !== 'erase' && <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/60" style={{ background: active.color }} />}
          <span className="truncate">{hint}</span>
        </div>
      )}
    </>
  )
}
