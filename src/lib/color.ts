const hex = (h: string) => {
  const s = h.replace('#', '')
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

/** Piecewise-linear colour ramp; t in [0,1]. */
export function ramp(stops: string[], t: number) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return mix(stops[i], stops[i + 1], x - i)
}

export const SEQ = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b']
export const DIVERGING = ['#b2182b', '#ef8a62', '#f7f7f7', '#67a9cf', '#2166ac']

/** Readable text colour on a background. */
export function ink(bg: string) {
  const [r, g, b] = hex(bg)
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#0f172a' : '#ffffff'
}

/** Party colour faded by how safe the margin is (safe = full colour). */
export function marginShade(color: string, margin: number) {
  const t = Math.min(1, margin / 0.3)
  return mix('#f1f5f9', color, 0.5 + 0.5 * t)
}
