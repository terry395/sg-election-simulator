import { useState } from 'react'
import { HIST_YEARS, type HistYear } from '../model/history'

/** Timeline slider over the past elections; the user's own map sits at the far end. */
export function YearSlider({ year, onChange, yours = 'Yours' }: { year: HistYear; onChange: (y: HistYear) => void; yours?: string }) {
  const i = HIST_YEARS.indexOf(year)
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <input type="range" min={0} max={HIST_YEARS.length - 1} step={1} value={i} className="w-full"
          onChange={(e) => onChange(HIST_YEARS[Number(e.target.value)])} aria-label="Past election to compare with"
          aria-valuetext={`GE${year}`} />
        <div className="-mt-0.5 flex justify-between px-0.5 text-[10px] text-slate-500">
          {HIST_YEARS.map((y) => (
            <button key={y} type="button" onClick={() => onChange(y)} className={`tabular phone:py-1 ${y === year ? 'font-bold text-slate-100' : 'hover:text-slate-300'}`}>{y}</button>
          ))}
        </div>
      </div>
      <div className="mb-[18px] shrink-0 rounded bg-rose-600/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 ring-1 ring-rose-500/50" title="Compared against your own map">→ {yours}</div>
    </div>
  )
}

interface Bar { label: string; values: number[]; mine?: boolean; tip: string }

/**
 * Small vertical bar chart (one series, or stacked series) for one value per election plus the
 * user's own. The user's bar is outlined and labelled so it never relies on colour alone.
 */
export function YearBars({ bars, colors, names, height = 96, fmt = (v) => String(v), selected }: {
  bars: Bar[]; colors: string[]; names?: string[]; height?: number; fmt?: (v: number) => string; selected?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...bars.map((b) => b.values.reduce((a, c) => a + c, 0)))
  const w = 300
  const top = 14
  const bottom = 16
  const plotH = height - top - bottom
  const slot = w / bars.length
  const bw = Math.min(30, slot * 0.6)
  return (
    <figure className="relative m-0">
      {names && names.length > 1 && (
        <figcaption className="mb-1 flex gap-3 text-[10px] text-slate-400">
          {names.map((n, k) => <span key={n} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: colors[k] }} />{n}</span>)}
        </figcaption>
      )}
      <svg viewBox={`0 0 ${w} ${height}`} className="block w-full" role="img" aria-label={bars.map((b) => b.tip).join('; ')} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={w} y1={top + plotH} y2={top + plotH} stroke="#334155" strokeWidth={1} />
        {bars.map((b, k) => {
          const x = slot * k + (slot - bw) / 2
          let y = top + plotH
          const total = b.values.reduce((a, c) => a + c, 0)
          return (
            <g key={b.label} onMouseEnter={() => setHover(k)} onClick={() => setHover(k)}>
              <rect x={slot * k} y={0} width={slot} height={height} fill="transparent" />
              {b.values.map((v, s) => {
                const h = (v / max) * plotH
                y -= h
                // 2px surface gap between stacked segments; rounded data end on the top segment only
                const isTop = s === b.values.length - 1 || b.values.slice(s + 1).every((n) => n === 0)
                const gap = s > 0 ? 2 : 0
                return v > 0 ? <rect key={s} x={x} y={y} width={bw} height={Math.max(0, h - gap)} rx={isTop ? 3 : 0} fill={colors[s]} opacity={b.mine ? 0.55 : hover === null || hover === k ? 1 : 0.6} /> : null
              })}
              {b.mine && <rect x={x - 1.5} y={top + plotH - (total / max) * plotH - 1.5} width={bw + 3} height={(total / max) * plotH + 1.5} rx={4} fill="none" stroke="#fb7185" strokeWidth={1.5} strokeDasharray="3 2" />}
              {(b.mine || hover === k || selected === b.label) && <text x={x + bw / 2} y={top + plotH - (total / max) * plotH - 3} textAnchor="middle" fontSize={9} fill="#e2e8f0" className="tabular">{fmt(total)}</text>}
              <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize={9} fill={b.mine ? '#fda4af' : selected === b.label ? '#f1f5f9' : '#94a3b8'} fontWeight={b.mine || selected === b.label ? 700 : 400}>{b.label}</text>
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-100 shadow ring-1 ring-slate-600"
          style={{ left: `${((hover + 0.5) / bars.length) * 100}%`, top: 0 }}>{bars[hover].tip}</div>
      )}
    </figure>
  )
}

/** Small line chart of one value per election, with the user's result as a dashed final step. */
export function YearLine({ points, color, height = 90, fmt, domain }: {
  points: { label: string; value: number; mine?: boolean; tip: string }[]; color: string; height?: number; fmt: (v: number) => string; domain: [number, number]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 300
  const top = 14
  const bottom = 16
  const plotH = height - top - bottom
  const slot = w / points.length
  const xs = points.map((_, k) => slot * k + slot / 2)
  const y = (v: number) => top + plotH - ((v - domain[0]) / (domain[1] - domain[0])) * plotH
  const past = points.filter((p) => !p.mine)
  const path = past.map((p, k) => `${k ? 'L' : 'M'}${xs[k]},${y(p.value)}`).join(' ')
  const mineK = points.findIndex((p) => p.mine)
  return (
    <figure className="relative m-0">
      <svg viewBox={`0 0 ${w} ${height}`} className="block w-full" role="img" aria-label={points.map((p) => p.tip).join('; ')} onMouseLeave={() => setHover(null)}>
        {[domain[0], (domain[0] + domain[1]) / 2, domain[1]].map((g) => (
          <g key={g}>
            <line x1={0} x2={w} y1={y(g)} y2={y(g)} stroke="#1e293b" strokeWidth={1} />
            <text x={2} y={y(g) - 2} fontSize={8} fill="#64748b">{fmt(g)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {mineK > 0 && <path d={`M${xs[mineK - 1]},${y(points[mineK - 1].value)} L${xs[mineK]},${y(points[mineK].value)}`} fill="none" stroke="#fb7185" strokeWidth={2} strokeDasharray="4 3" />}
        {hover !== null && <line x1={xs[hover]} x2={xs[hover]} y1={top} y2={top + plotH} stroke="#475569" strokeWidth={1} />}
        {points.map((p, k) => (
          <g key={p.label} onMouseEnter={() => setHover(k)} onClick={() => setHover(k)}>
            <rect x={slot * k} y={0} width={slot} height={height} fill="transparent" />
            <circle cx={xs[k]} cy={y(p.value)} r={p.mine ? 4.5 : 3.5} fill={p.mine ? '#fb7185' : color} stroke="#020617" strokeWidth={2} />
            {(p.mine || hover === k) && <text x={xs[k]} y={y(p.value) - 7} textAnchor="middle" fontSize={9} fill="#e2e8f0" className="tabular">{fmt(p.value)}</text>}
            <text x={xs[k]} y={height - 4} textAnchor="middle" fontSize={9} fill={p.mine ? '#fda4af' : '#94a3b8'} fontWeight={p.mine ? 700 : 400}>{p.label}</text>
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-100 shadow ring-1 ring-slate-600"
          style={{ left: `${((hover + 0.5) / points.length) * 100}%`, top: 0 }}>{points[hover].tip}</div>
      )}
    </figure>
  )
}
