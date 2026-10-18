import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry, Point } from 'geojson'
import { GripVertical } from 'lucide-react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useHistory } from '../data/loadHistory'
import { CONSTITUENCY_PALETTE, partyFor } from '../data/parties'
import { fracEntries, fullName, winnerOf, type HistConstituency, type HistYearData } from '../model/history'
import { marginShade } from '../lib/color'
import { pct } from '../components/ui'
import { COMPARE_TABS, FALLBACK_STYLE, MAX_BOUNDS, SATELLITE_ATTRIBUTION, SATELLITE_TILES, STYLE, fillOpacity } from './style'

const marginOf = (c: HistConstituency) => (c.walkover ? 0.3 : (c.result[0]?.share ?? 1) - (c.result[1]?.share ?? 0))

/** Label points: the elector-weighted centre of the blocks in each past constituency (always on land). */
function labelPoints(yd: HistYearData, blocks: { c: [number, number]; e25: number }[]): FeatureCollection<Point, { name: string }> {
  const acc = yd.constituencies.map(() => [0, 0, 0])
  blocks.forEach((b, i) => {
    for (const [j, f] of fracEntries(yd.frac[i])) {
      const w = (b.e25 + 1) * f
      acc[j][0] += b.c[0] * w; acc[j][1] += b.c[1] * w; acc[j][2] += w
    }
  })
  return {
    type: 'FeatureCollection',
    features: yd.constituencies.map((c, j) => ({
      type: 'Feature',
      properties: { name: c.name },
      geometry: { type: 'Point', coordinates: [acc[j][0] / (acc[j][2] || 1), acc[j][1] / (acc[j][2] || 1)] },
    })),
  }
}

/**
 * Swipe comparison: a second map showing a past election, stacked over the main map and clipped
 * to the left of a draggable divider. It follows the main map's camera and takes no input itself.
 */
export function CompareMap({ main }: { main: maplibregl.Map }) {
  const compare = useStore((s) => s.compare)
  const setCompare = useStore((s) => s.setCompare)
  const tab = useStore((s) => s.tab)
  const history = useHistory((s) => s.data)
  const load = useHistory((s) => s.load)
  const active = compare.on && COMPARE_TABS.has(tab)
  useEffect(() => { if (active) load() }, [active, load])
  if (!active || !history) return null
  const yd = history.years.find((y) => y.year === compare.year)!
  return <CompareLayer main={main} yd={yd} topo={history.topo} split={compare.split} onSplit={(split) => setCompare({ split })} results={tab === 'night'} />
}

function CompareLayer({ main, yd, topo, split, onSplit, results }: {
  main: maplibregl.Map; yd: HistYearData; topo: NonNullable<ReturnType<typeof useHistory.getState>['data']>['topo']; split: number; onSplit: (v: number) => void; results: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const [width, setWidth] = useState(400)
  const basemap = useStore((s) => s.basemap)
  const blocks = useStore((s) => s.data)!.blocks
  const { partyMap } = useDerived()

  // ------------------------------------------------------------------ the past-election map
  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: main.getCenter(),
      zoom: main.getZoom(),
      maxBounds: MAX_BOUNDS,
      interactive: false,
      attributionControl: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __compareMap: maplibregl.Map }).__compareMap = map
    let fellBack = false
    map.on('error', (e) => {
      if (!fellBack && !map.isStyleLoaded() && String(e.error?.message ?? '').match(/style|fetch|Failed/i)) {
        fellBack = true
        map.setStyle(FALLBACK_STYLE)
      }
    })
    map.on('style.load', () => {
      if (map.getSource('past')) return
      const firstSymbol = map.getStyle().layers.find((l: { type: string }) => l.type === 'symbol')?.id
      map.addSource('satellite', { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION })
      map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, firstSymbol)
      map.addSource('past', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('past-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'past-fill', type: 'fill', source: 'past', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.78 } }, firstSymbol)
      map.addLayer({ id: 'past-line', type: 'line', source: 'past', paint: { 'line-color': '#0f172a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 3] } })
      map.addLayer({ id: 'past-hover', type: 'line', source: 'past', filter: ['==', ['get', 'i'], -1], paint: { 'line-color': '#facc15', 'line-width': 3 } })
      map.addLayer({
        id: 'past-labels', type: 'symbol', source: 'past-labels',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 13, 13], 'text-max-width': 8 },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      })
      setReady(true)
    })
    // follow the main map
    const sync = () => map.jumpTo({ center: main.getCenter(), zoom: main.getZoom(), bearing: main.getBearing(), pitch: main.getPitch(), padding: main.getPadding() })
    main.on('move', sync)
    const ro = new ResizeObserver(() => { map.resize(); sync(); setWidth(el.current?.clientWidth ?? 400) })
    ro.observe(el.current)
    return () => { main.off('move', sync); ro.disconnect(); map.remove(); mapRef.current = null }
  }, [main])

  // ------------------------------------------------------------------ data
  const fc = useMemo(() => {
    const geo = feature(topo, topo.objects[`y${yd.year}`]) as FeatureCollection<Geometry, { i: number }>
    return {
      type: 'FeatureCollection' as const,
      features: geo.features.map((f) => {
        const c = yd.constituencies[f.properties.i]
        const color = results
          ? marginShade(partyFor(winnerOf(c), partyMap).color, marginOf(c))
          : CONSTITUENCY_PALETTE[(f.properties.i * 7) % CONSTITUENCY_PALETTE.length]
        return { ...f, properties: { i: f.properties.i, color } }
      }),
    }
  }, [topo, yd, results, partyMap])
  const labels = useMemo(() => labelPoints(yd, blocks), [yd, blocks])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('past') as GeoJSONSource).setData(fc)
    ;(map.getSource('past-labels') as GeoJSONSource).setData(labels)
  }, [ready, fc, labels])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const sat = basemap === 'satellite'
    map.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none')
    map.setPaintProperty('past-fill', 'fill-opacity', fillOpacity(sat)[0])
  }, [ready, basemap])

  // ------------------------------------------------------------------ hover info on the past side
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const canvas = main.getCanvas()
    const pick = (e: MapMouseEvent) => {
      const x = e.point.x
      const f = x < useStore.getState().compare.split * canvas.clientWidth ? map.queryRenderedFeatures(e.point, { layers: ['past-fill'] })[0] : undefined
      const i = f ? (f.properties as { i: number }).i : -1
      map.setFilter('past-hover', ['==', ['get', 'i'], i])
      setHover(i >= 0 ? { i, x, y: e.point.y } : null)
    }
    const clear = () => { map.setFilter('past-hover', ['==', ['get', 'i'], -1]); setHover(null) }
    main.on('mousemove', pick)
    main.on('click', pick)
    main.on('mouseout', clear)
    main.on('movestart', clear)
    return () => { main.off('mousemove', pick); main.off('click', pick); main.off('mouseout', clear); main.off('movestart', clear) }
  }, [ready, main])

  // ------------------------------------------------------------------ divider
  const drag = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return
    onSplit(Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width)))
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onSplit(Math.max(0.05, split - 0.05))
    if (e.key === 'ArrowRight') onSplit(Math.min(0.95, split + 0.05))
  }
  const pc = hover ? yd.constituencies[hover.i] : null
  const left = `${split * 100}%`
  return (
    <div ref={wrap} className="pointer-events-none absolute inset-0 z-[5]">
      {/* MapLibre makes its container position: relative, so the clipped box wraps it */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split * 100}% 0 0)` }} aria-hidden>
        <div ref={el} className="h-full w-full" />
      </div>
      {/* divider: a thin line with a wide invisible grab area and a handle in the middle */}
      <div className="pointer-events-auto absolute inset-y-0 w-5 -translate-x-1/2 cursor-ew-resize touch-none" style={{ left }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e) }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e) }}>
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.5)]" />
        <button type="button" onKeyDown={keys} aria-label={`Comparison divider: GE${yd.year} on the left, yours on the right. Use the arrow keys to move it.`}
          className="absolute left-1/2 top-1/2 flex h-10 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-white text-slate-700 shadow-lg ring-1 ring-slate-900/30">
          <GripVertical size={16} aria-hidden />
        </button>
        <span className="absolute right-full top-1/2 mr-2 -translate-y-[calc(100%+26px)] whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow ring-1 ring-slate-700">
          GE{yd.year} {results ? 'results' : 'boundaries'}
        </span>
        <span className="absolute left-full top-1/2 ml-2 -translate-y-[calc(100%+26px)] whitespace-nowrap rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
          Your {results ? 'results' : 'map'}
        </span>
      </div>
      {pc && hover && (
        <div className="absolute z-10 max-w-60 rounded-md bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-xl ring-1 ring-slate-700"
          style={{ left: Math.min(hover.x + 14, width - 250), top: hover.y + 14 }}>
          <div className="font-semibold">{fullName(pc)} <span className="font-normal text-slate-400">GE{yd.year}</span></div>
          <div className="text-[11px] text-slate-400">{pc.type === 'GRC' ? `${pc.seats} MPs · ` : ''}{pc.electors.toLocaleString('en-SG')} electors</div>
          {pc.walkover
            ? <div className="mt-0.5 text-[11px]">{winnerOf(pc)} returned unopposed (walkover)</div>
            : <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">{pc.result.map((r) => (
              <span key={r.party}><span className="mr-0.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: partyFor(r.party, partyMap).color }} />{r.party} {pct(r.share)}</span>
            ))}</div>}
        </div>
      )}
    </div>
  )
}
