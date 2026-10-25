export const millions = (v: number, d = 2) => `${(v / 1e6).toFixed(d)}m`
export const thousands = (v: number) => `${Math.round(v / 1000).toLocaleString('en-SG')}k`
export const sgd = (billions: number) => `S$${billions >= 10 ? billions.toFixed(0) : billions.toFixed(1)}b`

export function scoreWord(s: number) {
  return s >= 85 ? 'Excellent' : s >= 70 ? 'Good' : s >= 55 ? 'Fair' : s >= 40 ? 'Strained' : 'Failing'
}
