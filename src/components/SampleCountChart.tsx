import type { Party } from '../types'
import { PAP } from '../data/parties'
import type { SampleTally } from '../model/timeline'

const HATCH = 'repeating-linear-gradient(135deg, rgba(15,23,42,0.55) 0 3px, transparent 3px 6px)'

/** Seats each party leads on sample count, scaled to the whole Parliament, with the majority line. */
export function SampleCountChart({ tally, total, parties }: { tally: SampleTally; total: number; parties: Record<string, Party> }) {
  const rows = Object.entries(tally.byParty).sort((a, b) => (a[0] === PAP ? -1 : b[0] === PAP ? 1 : b[1].seats - a[1].seats))
  const majority = Math.floor(total / 2) + 1
  const x = (n: number) => `${(n / total) * 100}%`
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-slate-400">Sample counts</span>
        <span className="tabular text-slate-400">{tally.sampled} of {tally.contested} contested seats sampled</span>
      </div>
      <div className="space-y-1">
        {rows.map(([p, t]) => (
          <div key={p} className="flex items-center gap-2 text-[11px]">
            <span className="w-9 shrink-0 font-bold" style={{ color: parties[p]?.color }}>{p}</span>
            <div className="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-slate-800">
              <div className="absolute inset-y-0 left-0 flex transition-all duration-500" style={{ width: x(t.seats) }}>
                <div className="h-full" style={{ width: `${((t.seats - t.close) / Math.max(1, t.seats)) * 100}%`, background: parties[p]?.color ?? '#999' }} />
                <div className="h-full opacity-70" style={{ flex: 1, background: parties[p]?.color ?? '#999', backgroundImage: HATCH }} />
              </div>
              <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: x(majority) }} title={`Majority: ${majority}`} />
            </div>
            <span className="tabular w-24 shrink-0 text-right text-slate-300"><b>{t.seats}</b> seat{t.seats === 1 ? '' : 's'}{t.close ? <span className="text-slate-500"> ({t.close} close)</span> : ''}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
        <span className="inline-block h-2 w-3 rounded-[1px] bg-slate-400" style={{ backgroundImage: HATCH }} aria-hidden />
        <span>lead under 4 points, within the sample's margin of error · white line = majority ({majority})</span>
      </div>
    </div>
  )
}
