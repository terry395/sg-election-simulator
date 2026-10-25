import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { fmt } from '../../components/ui'
import { usePlanner } from '../state/planner'
import { PHASES } from '../model/population'
import { reclaimCost, reclaimPhases, type CellStates } from '../model/simulate'
import { DENSITIES, ZONE } from '../model/zones'

const CARD_W = 256
const coarse = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/** What a hexagon is today, what the plan does to it, and what it holds at the end of the phase. */
export function CellCard({ id, x, y, states, bounds, bottomInset = 0, onClose }: {
  id: number; x: number; y: number; states: CellStates; bounds?: HTMLElement | null; bottomInset?: number; onClose?: () => void
}) {
  const card = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(0)
  useLayoutEffect(() => { setH(card.current?.offsetHeight ?? 0) }, [id, x, y])
  const data = usePlanner((s) => s.data)!
  const plan = usePlanner((s) => s.plan)
  const phase = usePlanner((s) => s.phase)
  const W = bounds?.clientWidth ?? window.innerWidth
  const H = (bounds?.clientHeight ?? window.innerHeight) - bottomInset
  const touch = coarse()
  const w = Math.min(CARD_W, W - 16)
  const left = Math.max(8, x + 14 + w > W - 8 ? x - 14 - w : x + 14)
  const top = Math.max(8, y + 14 + h > H - 8 ? y - 14 - h : y + 14)

  const base = data.base[id]
  const place = data.place[id]
  const now = states.zone[id]
  const actions = plan.map((p, k) => ({ k, a: p[id] })).filter((x) => x.a)
  const status = states.status[id]
  return (
    <div ref={card} className={`absolute z-20 w-64 max-w-[calc(100%-16px)] rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 text-xs shadow-xl ${touch ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ left, top }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 font-semibold text-slate-100">{place.sz || (base ? place.pa : `Sea off ${place.pa || 'Singapore'}`)}</div>
        {touch && onClose && <button type="button" onClick={onClose} className="-m-1.5 p-1.5 text-slate-400" aria-label="Close"><X size={15} /></button>}
      </div>
      <div className="text-slate-400">
        {place.sz && place.pa ? `${place.pa} · ` : ''}{data.region[id] ?? ''}{data.station[id] ? ` · ${data.station[id]} MRT` : ''}
      </div>
      <div className="mt-1.5 flex justify-between gap-2"><span className="text-slate-400">Today</span><span className="text-right">{base ? ZONE[base].label : `Sea, ${data.ring[id] * 250} m from shore`}</span></div>
      {data.prot[id] && <div className="text-emerald-300">Protected nature reserve</div>}
      {!base && <div className="flex justify-between gap-2"><span className="text-slate-400">Reclaim</span><span className="tabular">S${reclaimCost(data.ring[id])}m · {reclaimPhases(data.ring[id]) * 5} yrs</span></div>}
      {actions.length > 0 && (
        <div className="mt-1.5 space-y-0.5 border-t border-slate-700 pt-1.5">
          {actions.map(({ k, a }) => (
            <div key={k} className="flex justify-between gap-2">
              <span className={k === phase ? 'font-semibold text-slate-100' : 'text-slate-400'}>{PHASES[k].label}</span>
              <span className="text-right">{[a!.r ? 'Reclaim' : null, a!.z ? `${ZONE[a!.z].label}${ZONE[a!.z].density ? ` (${DENSITIES[a!.d ?? 1].label.toLowerCase()})` : ''}` : null].filter(Boolean).join(' → ')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 border-t border-slate-700 pt-1.5">
        <div className="flex justify-between gap-2"><span className="text-slate-400">End of {PHASES[phase].label}</span>
          <span className="text-right font-medium">{now ? `${ZONE[now].label}${status === 1 ? ' (building)' : status === 2 ? ' (land not ready)' : ''}` : 'Sea'}</span></div>
        {states.homes[id] > 0 && <div className="flex justify-between"><span className="text-slate-400">Homes</span><span className="tabular">{fmt(states.homes[id])}</span></div>}
        {states.jobs[id] >= 1 && <div className="flex justify-between"><span className="text-slate-400">Jobs (approx.)</span><span className="tabular">{fmt(states.jobs[id])}</span></div>}
        {base && data.pop[id] > 0 && states.builtIn[id] < 0 && <div className="flex justify-between"><span className="text-slate-400">Residents 2026</span><span className="tabular">{fmt(data.pop[id])}</span></div>}
      </div>
    </div>
  )
}
