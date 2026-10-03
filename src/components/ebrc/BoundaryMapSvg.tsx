import { useId, useMemo } from 'react'
import type { MapLabel, MapShape } from './mapShapes'

/**
 * Black-and-white boundary map in the style of a White Paper annex: GRCs hatched, SMCs plain,
 * each division numbered to match the table, optional dashed 2025 boundaries for comparison.
 */
export function BoundaryMapSvg({ shapes, labels, old, focus, title }: {
  shapes: MapShape[]
  labels: MapLabel[]
  /** GE2025 boundaries as one path (dashed) */
  old?: string
  /** ids to frame; all shapes when omitted */
  focus?: string[]
  title: string
}) {
  const hatch = useId().replace(/:/g, '')
  const box = useMemo(() => {
    const sel = focus ? shapes.filter((s) => focus.includes(s.id)) : shapes
    const b = sel.reduce((a, s) => [Math.min(a[0], s.bbox[0]), Math.min(a[1], s.bbox[1]), Math.max(a[2], s.bbox[2]), Math.max(a[3], s.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity])
    const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.06
    return [b[0] - pad, b[1] - pad, b[2] - b[0] + pad * 2, b[3] - b[1] + pad * 2]
  }, [shapes, focus])
  const fs = Math.max(box[2], box[3]) / 42
  const shown = focus ? labels.filter((l) => focus.includes(l.id)) : labels
  return (
    <svg viewBox={box.join(' ')} className="block h-auto w-full" role="img" aria-label={title}>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width={fs * 0.5} height={fs * 0.5} patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={fs * 0.5} stroke="#b5b5b5" strokeWidth={fs * 0.12} />
        </pattern>
      </defs>
      <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="#ffffff" />
      {shapes.map((s) => <path key={`f-${s.id}`} d={s.d} fill={s.grc ? `url(#${hatch})` : '#ffffff'} fillOpacity={focus && !focus.includes(s.id) ? 0.35 : 1} />)}
      {/* 2025 lines sit under the new ones, so they only show where a boundary moved */}
      {old && <path d={old} fill="none" stroke="#a32020" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      {shapes.map((s) => (
        <path key={s.id} d={s.d} fill="none"
          stroke="#111" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
      {shown.map((l) => (
        <g key={l.id} transform={`translate(${l.x} ${l.y})`}>
          <circle r={fs * 0.62} fill="#fff" stroke="#111" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={fs * 0.72} fontFamily="'Times New Roman', Georgia, serif" fill="#111">{l.n}</text>
        </g>
      ))}
    </svg>
  )
}
