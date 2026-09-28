import type { Party } from '../types'

// Strength: relative pull of each party's slate when splitting the opposition vote,
// derived from GE2025 average vote share where contested (WP = 1).
export const DEFAULT_PARTIES: Party[] = [
  { id: 'PAP', name: "People's Action Party", color: '#1e3a9e', strength: 1 },
  { id: 'WP', name: "Workers' Party", color: '#22c5e8', strength: 1 },
  { id: 'PSP', name: 'Progress Singapore Party', color: '#e53935', strength: 0.65 },
  { id: 'SDP', name: 'Singapore Democratic Party', color: '#c2185b', strength: 0.7 },
  { id: 'RDU', name: 'Red Dot United', color: '#7e57c2', strength: 0.45 },
  { id: 'SDA', name: 'Singapore Democratic Alliance', color: '#8bc34a', strength: 0.62 },
  { id: 'SPP', name: "Singapore People's Party", color: '#2e7d32', strength: 0.47 },
  { id: 'PAR', name: "People's Alliance for Reform", color: '#f4c430', strength: 0.33 },
  { id: 'SUP', name: 'Singapore United Party', color: '#ff8a65', strength: 0.22 },
  { id: 'PPP', name: "People's Power Party", color: '#8d6e63', strength: 0.12 },
  { id: 'NSP', name: 'National Solidarity Party', color: '#00897b', strength: 0.05 },
  { id: 'IND', name: 'Independent', color: '#78909c', strength: 0.6 },
]

export const PAP = 'PAP'

/** distinct, saturated colours for user-drawn constituencies (golden-angle hues) */
export const CONSTITUENCY_PALETTE = Array.from({ length: 48 }, (_, i) => {
  const h = (i * 137.508) % 360
  const l = [52, 42, 62][i % 3]
  const sat = [72, 60, 68][i % 3]
  return hsl(h, sat, l)
})

function hsl(h: number, s: number, l: number) {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}
