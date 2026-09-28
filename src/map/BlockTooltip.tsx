import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { electorsOf } from '../model/stats'
import { fmt, pct } from '../components/ui'

const title = (s: string) => s.toLowerCase().replace(/(^|[\s-/])(\w)/g, (m) => m.toUpperCase())

export function BlockTooltip({ id, x, y }: { id: number; x: number; y: number }) {
  const data = useStore((s) => s.data)!
  const year = useStore((s) => s.year)
  const tab = useStore((s) => s.tab)
  const plan = useStore((s) => s.plan)
  const { stats, projection, partyMap } = useDerived()
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

  return (
    <div className="pointer-events-none absolute z-20 w-64 rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 text-xs shadow-xl" style={{ left: Math.min(x + 14, window.innerWidth - 300), top: y + 14 }}>
      <div className="font-semibold text-slate-100">{title(b.sz)}</div>
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
              <span className="flex-1">{p}</span>
              <span className="tabular">{pct(v)}</span>
            </div>
          ))}
        </div>
      )}
      {seat?.walkover && <div className="mt-1 text-slate-300">Walkover — {seat.winner}</div>}
    </div>
  )
}
