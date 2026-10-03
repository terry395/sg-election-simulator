import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { electorsOf } from '../model/stats'
import { fmt, pct } from '../components/ui'

const title = (s: string) => s.toLowerCase().replace(/(^|[\s-/])(\w)/g, (m) => m.toUpperCase())

const CARD_W = 256
const coarse = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function BlockTooltip({ id, x, y, bounds, bottomInset = 0, onClose }: {
  id: number; x: number; y: number
  /** the map element the card must stay inside */
  bounds?: HTMLElement | null
  /** px at the bottom covered by the phone sheet */
  bottomInset?: number
  onClose?: () => void
}) {
  const card = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(0)
  useLayoutEffect(() => { setH(card.current?.offsetHeight ?? 0) }, [id, x, y])
  const data = useStore((s) => s.data)!
  const year = useStore((s) => s.year)
  const tab = useStore((s) => s.tab)
  const plan = useStore((s) => s.plan)
  const { stats, projection, partyMap, contests } = useDerived()
  const revealed = useNight((s) => s.revealed)
  const nightResult = useNight((s) => s.result)
  const b = data.blocks[id]
  const cid = plan.assign[id]
  const c = plan.constituencies.find((x) => x.id === cid)
  const ge = data.ge.constituencies.find((x) => x.id === b.ed)
  const s = cid ? stats.byId[cid] : null

  let seat = null
  if (tab === 'forecast' && cid) seat = projection.seats.find((r) => r.id === cid)
  if (tab === 'night' && cid && revealed[cid] === 'result') seat = nightResult?.seats.find((r) => r.id === cid)

  // keep the card inside the map, flipping above or left of the pointer when needed
  const W = bounds?.clientWidth ?? window.innerWidth
  const H = (bounds?.clientHeight ?? window.innerHeight) - bottomInset
  const touch = coarse()
  const w = Math.min(CARD_W, W - 16)
  const left = Math.max(8, x + 14 + w > W - 8 ? x - 14 - w : x + 14)
  const top = Math.max(8, y + 14 + h > H - 8 ? y - 14 - h : y + 14)

  return (
    <div ref={card} className={`absolute z-20 w-64 max-w-[calc(100%-16px)] rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 text-xs shadow-xl ${touch ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ left, top }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 font-semibold text-slate-100">{title(b.sz)}</div>
        {touch && onClose && <button type="button" onClick={onClose} className="-m-1.5 p-1.5 text-slate-400" aria-label="Close"><X size={15} /></button>}
      </div>
      <div className="text-slate-400">{title(b.pa)} · {fmt(electorsOf(b, year))} electors{year === 2030 ? ' (2030 proj.)' : ''}</div>
      <div className="mt-1.5 flex justify-between"><span className="text-slate-400">Constituency</span><span className="font-medium">{c ? `${c.name} ${c.type}` : <em className="text-amber-300">unassigned</em>}</span></div>
      <div className="flex justify-between"><span className="text-slate-400">In GE2025</span><span>{ge?.name}</span></div>
      {b.e25 > 0 && <div className="flex justify-between"><span className="text-slate-400">Notional PAP 2025</span><span className="tabular">{pct(b.pap)}</span></div>}
      {s && tab === 'draw' && <div className="flex justify-between"><span className="text-slate-400">Constituency electors</span><span className="tabular">{fmt(s.electors)} ({(s.deviation * 100).toFixed(1)}%)</span></div>}
      {seat && !seat.walkover && (
        <div className="mt-1.5 space-y-0.5 border-t border-slate-700 pt-1.5">
          {Object.entries(seat.shares).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
            <div key={p} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: partyMap[p]?.color }} />
              <span className="flex-1 truncate">{p}{cid && contests[cid]?.leaders?.[p] ? <span className="text-slate-400"> · {contests[cid].leaders![p]}</span> : null}</span>
              <span className="tabular">{pct(v)}</span>
            </div>
          ))}
        </div>
      )}
      {seat?.walkover && <div className="mt-1 text-slate-300">Walkover — {seat.winner}</div>}
    </div>
  )
}
