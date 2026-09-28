import type { Party } from '../types'
import { PAP } from '../data/parties'

/** Parliament bar: PAP from the left, opposition from the right, majority line in the middle. */
export function SeatBar({ seats, total, parties, height = 22, showLabels = true }: {
  seats: Record<string, number>
  total: number
  parties: Record<string, Party>
  height?: number
  showLabels?: boolean
}) {
  const order = Object.entries(seats).filter(([, n]) => n > 0).sort((a, b) => (a[0] === PAP ? -1 : b[0] === PAP ? 1 : b[1] - a[1]))
  const declared = order.reduce((s, [, n]) => s + n, 0)
  const pap = seats[PAP] ?? 0
  const opp = order.filter(([p]) => p !== PAP)
  const majority = Math.floor(total / 2) + 1
  return (
    <div>
      <div className="relative flex w-full overflow-hidden rounded bg-slate-800" style={{ height }}>
        {pap > 0 && <div style={{ width: `${(pap / total) * 100}%`, background: parties[PAP]?.color }} className="flex items-center justify-start pl-1.5 text-[11px] font-bold text-white transition-all duration-500">{showLabels && pap}</div>}
        <div style={{ width: `${((total - declared) / total) * 100}%` }} />
        {opp.map(([p, n]) => (
          <div key={p} style={{ width: `${(n / total) * 100}%`, background: parties[p]?.color }} className="flex items-center justify-center text-[11px] font-bold text-slate-900 transition-all duration-500" title={`${p} ${n}`}>{showLabels && n >= 3 ? n : ''}</div>
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${(majority / total) * 100}%` }} title={`Majority: ${majority}`} />
        <div className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${(Math.ceil((total * 2) / 3) / total) * 100}%` }} title="Two-thirds" />
      </div>
      {showLabels && (
        <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
          <span>0</span><span style={{ marginLeft: '8%' }}>majority {majority}</span><span>⅔ {Math.ceil((total * 2) / 3)}</span><span>{total}</span>
        </div>
      )}
    </div>
  )
}
