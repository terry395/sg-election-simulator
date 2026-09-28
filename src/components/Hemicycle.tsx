import { useMemo, useRef } from 'react'
import type { Party } from '../types'
import { PAP } from '../data/parties'
import { mix } from '../lib/color'

export interface Seat { x: number; y: number; angle: number }

/**
 * Parliament-chart layout: seats on concentric half-rings, each row holding seats in proportion
 * to its radius, then ordered left-to-right by angle so parties form wedges.
 * Coordinates are in a unit half-disc (x -1..1, y 0..1, y up).
 */
export function hemicycleLayout(total: number): { seats: Seat[]; dotR: number } {
  if (total <= 0) return { seats: [], dotR: 0.05 }
  const rows = Math.max(1, Math.min(8, Math.round(Math.sqrt(total / 4.2))))
  const inner = rows === 1 ? 0.7 : 0.38
  const radii = Array.from({ length: rows }, (_, i) => (rows === 1 ? 0.85 : inner + ((1 - inner) * i) / (rows - 1)))
  const sumR = radii.reduce((a, b) => a + b, 0)
  const perRow = radii.map((r) => Math.max(1, Math.round((total * r) / sumR)))
  // fix rounding so the rows add up exactly, adjusting the outer rows first
  let diff = total - perRow.reduce((a, b) => a + b, 0)
  for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) {
    if (diff > 0) { perRow[i]++; diff-- }
    else if (perRow[i] > 1) { perRow[i]--; diff++ }
  }
  const seats: Seat[] = []
  radii.forEach((r, i) => {
    const n = perRow[i]
    for (let j = 0; j < n; j++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (n - 1)
      seats.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), angle })
    }
  })
  // left to right; within the same angle, inner rows first
  seats.sort((a, b) => b.angle - a.angle || Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
  const spacing = rows === 1 ? 0.3 : (1 - inner) / (rows - 1)
  const arc = Math.min(...radii.map((r, i) => (perRow[i] > 1 ? (Math.PI * r) / (perRow[i] - 1) : 1)))
  return { seats, dotR: Math.min(spacing, arc) * 0.42 }
}

/** empty (undeclared) seats are drawn as hollow rings so they never look like a party colour */
const UNDECLARED = 'transparent'

/**
 * Order seats: government on the left, undeclared in the middle, opposition from the right.
 * `government` lists coalition members (largest first on the left); by default the PAP, or else the largest party.
 */
export function seatColors(seats: Record<string, number>, total: number, parties: Record<string, Party>, government?: string[]): { color: string; party: string | null }[] {
  const entries = Object.entries(seats).filter(([, n]) => n > 0)
  const fallback = entries.find(([p]) => p === PAP) ?? [...entries].sort((a, b) => b[1] - a[1])[0]
  const govEntries = government?.length
    ? entries.filter(([p]) => government.includes(p)).sort((a, b) => b[1] - a[1])
    : fallback ? [fallback] : []
  const others = entries.filter((e) => !govEntries.includes(e)).sort((a, b) => a[1] - b[1]) // smallest nearest the middle
  const out: { color: string; party: string | null }[] = []
  for (const [p, n] of govEntries) for (let i = 0; i < n; i++) out.push({ color: parties[p]?.color ?? '#999', party: p })
  const declared = entries.reduce((s, [, n]) => s + n, 0)
  for (let i = 0; i < total - declared; i++) out.push({ color: UNDECLARED, party: null })
  for (const [p, n] of others) for (let i = 0; i < n; i++) out.push({ color: parties[p]?.color ?? '#999', party: p })
  return out.slice(0, total)
}

export function Hemicycle({ seats, total, parties, ncmp, width = 300, caption, government }: {
  seats: Record<string, number>
  total: number
  parties: Record<string, Party>
  ncmp?: { party: string; seats: number }[]
  width?: number
  caption?: string
  /** coalition members to group on the government side */
  government?: string[]
}) {
  const layout = useMemo(() => hemicycleLayout(total), [total])
  const colors = seatColors(seats, total, parties, government)
  // seats that just changed colour get a short "pop" animation
  const prev = useRef<string[]>([])
  const popped = colors.map((c, i) => c.party !== null && prev.current[i] !== undefined && prev.current[i] !== c.color)
  prev.current = colors.map((c) => c.color)

  const majority = Math.floor(total / 2) + 1
  const ranked = Object.entries(seats).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  const coalition = government && government.length > 1 ? government.filter((p) => seats[p]) : null
  const leader: [string, number] | undefined = coalition ? [coalition.join('–'), coalition.reduce((s, p) => s + seats[p], 0)] : ranked[0]
  const declared = ranked.reduce((s, [, n]) => s + n, 0)
  const ncmpSeats = (ncmp ?? []).flatMap((n) => Array.from({ length: n.seats }, () => n.party))

  return (
    <figure className="m-0" style={{ width: '100%', maxWidth: width }}>
      <svg viewBox="-1.08 -1.1 2.16 1.22" className="block w-full" role="img"
        aria-label={`Parliament: ${ranked.map(([p, n]) => `${p} ${n}`).join(', ') || 'no seats declared yet'}, ${total - declared} to declare`}>
        {/* majority marker at the top of the arc */}
        <line x1="0" y1="-0.3" x2="0" y2="-1.08" stroke="#f8fafc" strokeWidth="0.008" strokeDasharray="0.03 0.025" opacity="0.55" />
        {layout.seats.map((s, i) => (
          <circle key={i} cx={s.x} cy={-s.y} r={layout.dotR * (colors[i]?.party ? 1 : 0.8)} fill={colors[i]?.color ?? UNDECLARED}
            stroke={colors[i]?.party ? 'none' : '#64748b'} strokeWidth={colors[i]?.party ? 0 : layout.dotR * 0.28}
            className={popped[i] ? 'seat-pop' : undefined} style={{ transition: 'fill .45s ease', transformOrigin: `${s.x}px ${-s.y}px`, transformBox: 'fill-box' }} />
        ))}
        <text x="0" y="-0.12" textAnchor="middle" fontSize="0.26" fontWeight="800" fill={leader ? mix(parties[coalition ? coalition[0] : leader[0]]?.color ?? '#e2e8f0', '#ffffff', 0.35) : '#94a3b8'} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {leader ? leader[1] : 0}
        </text>
        <text x="0" y="0.02" textAnchor="middle" fontSize="0.085" fill="#94a3b8">
          {leader ? `${coalition ? 'coalition' : leader[0]} · majority ${majority}` : `majority ${majority}`}
        </text>
      </svg>
      {ncmpSeats.length > 0 && (
        <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-slate-400">
          <span>+ NCMP</span>
          {ncmpSeats.map((p, i) => <span key={i} className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: parties[p]?.color }} title={`${p} Non-Constituency MP`} />)}
        </div>
      )}
      {caption && <figcaption className="text-center text-[10px] text-slate-500">{caption}</figcaption>}
    </figure>
  )
}
