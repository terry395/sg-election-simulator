import { useEffect, useMemo, useRef } from 'react'
import type { PlannerData } from '../data/loadPlanner'

/** A static picture of the hexagon map (for the report), drawn on a canvas. */
export function HexCanvas({ data, fill, title, height = 460 }: { data: PlannerData; fill: (string | null)[]; title: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // frame the drawn hexagons
  const bounds = useMemo(() => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (let i = 0; i < data.n; i++) {
      if (!fill[i]) continue
      const [x, y] = data.center[i]
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y
    }
    const pad = 0.004
    return [w - pad, s - pad, e + pad, n + pad]
  }, [data, fill])
  const aspect = ((bounds[2] - bounds[0]) * Math.cos((1.35 * Math.PI) / 180)) / (bounds[3] - bounds[1])
  const width = Math.round(height * aspect)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = width * dpr
    c.height = height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    const [w, s, e, n] = bounds
    const px = (lng: number) => ((lng - w) / (e - w)) * width
    const py = (lat: number) => height - ((lat - s) / (n - s)) * height
    for (let i = 0; i < data.n; i++) {
      const f = fill[i]
      if (!f) continue
      const ring = data.ringCoords[i]
      ctx.beginPath()
      ring.forEach(([lng, lat], k) => (k ? ctx.lineTo(px(lng), py(lat)) : ctx.moveTo(px(lng), py(lat))))
      ctx.closePath()
      ctx.fillStyle = f
      ctx.fill()
      // close the hairline gaps between neighbours
      ctx.strokeStyle = f
      ctx.lineWidth = 0.6
      ctx.stroke()
    }
  }, [data, fill, bounds, width, height])

  return <canvas ref={ref} role="img" aria-label={title} className="block h-auto w-full" style={{ aspectRatio: `${width} / ${height}` }} />
}
