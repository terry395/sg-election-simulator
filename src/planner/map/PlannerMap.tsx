import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ExpressionSpecification, GeoJSONSource, MapMouseEvent, MapTouchEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Map as MapIcon, Satellite, Sparkles, X } from 'lucide-react'
import { useStore } from '../../state/store'
import { FALLBACK_STYLE, MAX_BOUNDS, SATELLITE_ATTRIBUTION, SATELLITE_TILES, SG_BOUNDS, STYLE } from '../../map/style'
import { useIsMobile } from '../../lib/useIsMobile'
import { useSheet } from '../../lib/sheet'
import { usePlanner } from '../state/planner'
import { cellStates, timelines } from '../model/simulate'
import { PHASES } from '../model/population'
import { cellColors } from './colors'
import { CellCard } from './CellCard'

maplibregl.setWorkerUrl(workerUrl)

const DRAG_TOOLS = new Set(['paint', 'erase', 'lasso', 'reclaim'])

function pointInRing(pt: [number, number], ring: [number, number][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** The National Planner's hexagon map: paint land uses, reclaim the sea, inspect any hexagon. */
export function PlannerMap() {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState<maplibregl.Map | null>(null)
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null)
  const data = usePlanner((s) => s.data)!
  const plan = usePlanner((s) => s.plan)
  const phase = usePlanner((s) => s.phase)
  const lens = usePlanner((s) => s.lens)
  const tool = usePlanner((s) => s.tool)
  const tab = usePlanner((s) => s.tab)
  const selected = usePlanner((s) => s.selected)
  const autoResult = usePlanner((s) => s.autoResult)
  const highlight = usePlanner((s) => s.highlight)
  const focus = usePlanner((s) => s.focus)
  const basemap = useStore((s) => s.basemap)
  const setBasemap = useStore((s) => s.setBasemap)
  const mobile = useIsMobile()
  const sheetH = useSheet((s) => s.height)
  const spaceDown = useRef(false)

  // the map follows every brush stroke straight away (the indicators catch up a moment later)
  const states = useMemo(() => cellStates(data, timelines(data, plan), phase), [data, plan, phase])
  const fill = useMemo(() => cellColors(data, states, plan, lens, tool, phase), [data, states, plan, lens, tool, phase])
  const statesRef = useRef(states)
  useEffect(() => { statesRef.current = states }, [states])

  // ------------------------------------------------------------------ init
  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({
      container: el.current, style: STYLE, bounds: SG_BOUNDS, maxBounds: MAX_BOUNDS,
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, doubleClickZoom: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __plannerMap: maplibregl.Map }).__plannerMap = map
    let fellBack = false
    map.on('error', (e) => {
      if (!fellBack && !map.isStyleLoaded() && String(e.error?.message ?? '').match(/style|fetch|Failed/i)) {
        fellBack = true
        map.setStyle(FALLBACK_STYLE)
      }
    })
    map.on('style.load', () => {
      if (map.getSource('hex')) return
      map.addSource('hex', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: data.ringCoords.map((ring, i) => ({ type: 'Feature', id: i, properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } })),
        },
      })
      map.addSource('lasso', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const firstSymbol = map.getStyle().layers.find((l: { type: string }) => l.type === 'symbol')?.id
      map.addSource('satellite', { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION })
      map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, firstSymbol)
      map.addLayer({
        id: 'hex-fill', type: 'fill', source: 'hex',
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'fill'], '#000000'],
          'fill-opacity': ['case', ['==', ['feature-state', 'fill'], null], 0, ['boolean', ['feature-state', 'hover'], false], 0.95, 0.8],
        },
      }, firstSymbol)
      map.addLayer({
        id: 'hex-line', type: 'line', source: 'hex', minzoom: 12.5,
        paint: { 'line-color': '#ffffff', 'line-width': 0.5, 'line-opacity': ['case', ['==', ['feature-state', 'fill'], null], 0, 0.5] },
      })
      map.addLayer({
        id: 'hex-focus', type: 'line', source: 'hex',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#facc15', '#0f172a'],
          'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, ['boolean', ['feature-state', 'hover'], false], 2, 0],
        },
      })
      // what the last auto-plan changed: 1 = ready by the end of the phase, 2 = still being built
      const autoColor: ExpressionSpecification = ['case', ['==', ['feature-state', 'auto'], 1], '#facc15', '#e879f9']
      const autoOn: ExpressionSpecification = ['>', ['coalesce', ['feature-state', 'auto'], 0], 0]
      map.addLayer({
        id: 'hex-auto-glow', type: 'line', source: 'hex',
        paint: { 'line-color': autoColor, 'line-blur': 3, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8], 'line-opacity': ['case', autoOn, 0.55, 0] },
      })
      map.addLayer({
        id: 'hex-auto', type: 'line', source: 'hex',
        paint: { 'line-color': autoColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 2.2], 'line-opacity': ['case', autoOn, 1, 0] },
      })
      map.addLayer({ id: 'lasso-fill', type: 'fill', source: 'lasso', paint: { 'fill-color': '#facc15', 'fill-opacity': 0.2 } })
      map.addLayer({ id: 'lasso-line', type: 'line', source: 'lasso', paint: { 'line-color': '#ca8a04', 'line-width': 2, 'line-dasharray': [1, 1] } })
      setReady(map)
    })
    return () => map.remove()
  }, [data])

  // ------------------------------------------------------------------ data sync
  const shown = useRef<(string | null)[]>([])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const prev = shown.current
    for (let i = 0; i < fill.length; i++) if (prev[i] !== fill[i]) map.setFeatureState({ source: 'hex', id: i }, { fill: fill[i] })
    shown.current = fill
  }, [fill, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || selected === null) return
    map.setFeatureState({ source: 'hex', id: selected }, { sel: true })
    return () => { try { map.setFeatureState({ source: 'hex', id: selected }, { sel: false }) } catch { /* map removed */ } }
  }, [selected, ready])

  // the last auto-plan's changes in the phase being viewed
  const marked = useMemo(() => {
    const cells = highlight && autoResult ? autoResult.changes[phase] ?? [] : []
    return new Map(cells.map((i) => [i, states.zone[i] && states.status[i] === 0 ? 1 : 2]))
  }, [highlight, autoResult, phase, states])
  const markedRef = useRef(new Map<number, number>())
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const i of markedRef.current.keys()) if (!marked.has(i)) map.setFeatureState({ source: 'hex', id: i }, { auto: 0 })
    for (const [i, v] of marked) if (markedRef.current.get(i) !== v) map.setFeatureState({ source: 'hex', id: i }, { auto: v })
    markedRef.current = marked
  }, [marked, ready])

  const dim = marked.size > 0
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !map.getLayer('satellite')) return
    const sat = basemap === 'satellite'
    map.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none')
    // while highlighting, everything the auto-plan did not touch fades back
    const rest = dim ? (sat ? 0.2 : 0.15) : sat ? 0.55 : 0.8
    map.setPaintProperty('hex-fill', 'fill-opacity', ['case', ['==', ['feature-state', 'fill'], null], 0,
      ['boolean', ['feature-state', 'hover'], false], sat ? 0.8 : 0.95, ['>', ['coalesce', ['feature-state', 'auto'], 0], 0], 0.95, rest])
  }, [basemap, ready, dim])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !focus?.cells.length) return
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (const i of focus.cells) {
      const [x, y] = data.center[i]
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y)
    }
    const pad = 48
    // the phone sheet is already part of the camera padding
    map.fitBounds([[w, s], [e, n]], { padding: pad, maxZoom: 14.5, duration: 700 })
  }, [focus, ready, data])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: mobile ? sheetH : 0 }, duration: 250 })
  }, [mobile, sheetH, ready])

  // ------------------------------------------------------------------ interaction
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const canvas = map.getCanvas()
    const drawing = tab === 'build' && DRAG_TOOLS.has(tool)
    canvas.style.cursor = tool === 'pan' ? 'grab' : drawing ? 'crosshair' : 'pointer'
    if (drawing) map.dragPan.disable()
    else map.dragPan.enable()

    let hovered: number | null = null
    let painting = false
    let lasso: [number, number][] = []
    const st = () => usePlanner.getState()
    const cellAt = (e: { point: maplibregl.Point }) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['hex-fill'] })[0]
      return f ? (f.id as number) : null
    }
    const setHoverState = (id: number | null) => {
      if (hovered !== null) map.setFeatureState({ source: 'hex', id: hovered }, { hover: false })
      hovered = id
      if (id !== null) map.setFeatureState({ source: 'hex', id }, { hover: true })
    }
    const paintAt = (id: number | null) => {
      if (id === null) return
      if (tool === 'erase') st().erase([id])
      else st().apply([id])
    }
    const setLasso = (pts: [number, number][]) => {
      ;(map.getSource('lasso') as GeoJSONSource).setData(pts.length > 2
        ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } }
        : { type: 'FeatureCollection', features: [] })
    }
    let lastTouch = 0
    const fromTouch = () => performance.now() - lastTouch < 800

    const start = (e: MapMouseEvent | MapTouchEvent) => {
      st().checkpoint()
      painting = true
      if (tool === 'lasso') lasso = [[e.lngLat.lng, e.lngLat.lat]]
      else paintAt(cellAt(e))
    }
    const extend = (e: MapMouseEvent | MapTouchEvent, id: number | null) => {
      if (!painting) return
      if (tool === 'lasso') { lasso.push([e.lngLat.lng, e.lngLat.lat]); setLasso(lasso) }
      else paintAt(id)
    }
    const onDown = (e: MapMouseEvent) => {
      if (fromTouch() || !drawing || spaceDown.current || e.originalEvent.button !== 0) return
      start(e)
    }
    const onMove = (e: MapMouseEvent) => {
      if (fromTouch()) return
      const id = cellAt(e)
      setHoverState(id)
      setHover(id === null || painting ? null : { id, x: e.point.x, y: e.point.y })
      extend(e, id)
    }
    const onUp = () => {
      if (!painting) return
      painting = false
      if (tool === 'lasso' && lasso.length > 3) {
        const ids: number[] = []
        for (let i = 0; i < data.n; i++) if (pointInRing(data.center[i], lasso)) ids.push(i)
        st().apply(ids)
      }
      lasso = []
      setLasso([])
    }

    let twoFinger = false
    let strokeStart = 0
    const onTouchStart = (e: MapTouchEvent) => {
      lastTouch = performance.now()
      const n = e.originalEvent.touches.length
      if (n === 1) setHover(null)
      if (!drawing) return
      if (n > 1) {
        if (painting) {
          painting = false
          lasso = []
          setLasso([])
          if (performance.now() - strokeStart < 300) st().undo()
        }
        twoFinger = true
        map.dragPan.enable()
        return
      }
      if (!twoFinger) { strokeStart = performance.now(); start(e) }
    }
    const onTouchMove = (e: MapTouchEvent) => {
      lastTouch = performance.now()
      if (!drawing || twoFinger || e.originalEvent.touches.length !== 1) return
      const id = cellAt(e)
      setHoverState(id)
      extend(e, id)
    }
    const onTouchEnd = (e: MapTouchEvent) => {
      lastTouch = performance.now()
      if (!drawing) return
      if (e.originalEvent.touches.length === 0) {
        if (twoFinger) { twoFinger = false; if (!spaceDown.current) map.dragPan.disable() }
        else onUp()
        setHoverState(null)
      }
    }
    const onClick = (e: MapMouseEvent) => {
      const id = cellAt(e)
      const s = st()
      if (id === null) { setHover(null); s.setSelected(null); return }
      if (tool === 'fill' && tab === 'build') {
        // every connected hexagon with the same use at the end of this phase
        const zone = statesRef.current.zone
        const from = zone[id]
        if (from === null) return
        const seen = new Set([id])
        const stack = [id]
        while (stack.length && seen.size < 3000) {
          const i = stack.pop()!
          for (const j of data.neighbours[i]) if (!seen.has(j) && zone[j] === from) { seen.add(j); stack.push(j) }
        }
        s.checkpoint()
        s.apply([...seen])
        return
      }
      if (!drawing) {
        s.setSelected(id)
        if (fromTouch()) setHover({ id, x: e.point.x, y: e.point.y })
      }
    }
    const onLeave = () => { if (fromTouch()) return; setHoverState(null); setHover(null) }
    const onMoveStart = (e: { originalEvent?: Event }) => { if (e.originalEvent && fromTouch()) setHover(null) }

    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('click', onClick)
    map.on('mouseout', onLeave)
    map.on('touchstart', onTouchStart)
    map.on('touchmove', onTouchMove)
    map.on('touchend', onTouchEnd)
    map.on('touchcancel', onTouchEnd)
    map.on('movestart', onMoveStart)
    window.addEventListener('mouseup', onUp)
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && drawing && !(e.target instanceof HTMLInputElement)) {
        spaceDown.current = true
        map.dragPan.enable()
        canvas.style.cursor = 'grab'
        e.preventDefault()
      }
    }
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space' && drawing) {
        spaceDown.current = false
        map.dragPan.disable()
        canvas.style.cursor = 'crosshair'
      }
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('click', onClick)
      map.off('mouseout', onLeave)
      map.off('touchstart', onTouchStart)
      map.off('touchmove', onTouchMove)
      map.off('touchend', onTouchEnd)
      map.off('touchcancel', onTouchEnd)
      map.off('movestart', onMoveStart)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      try { setHoverState(null) } catch { /* map removed */ }
      setHover(null)
    }
  }, [ready, tool, tab, data])

  return (
    <div className="relative h-full w-full">
      <div ref={(n) => { el.current = n; setBox(n) }} className="main-map h-full w-full" />
      {hover && <CellCard id={hover.id} x={hover.x} y={hover.y} states={states} bounds={box} bottomInset={mobile ? sheetH : 0} onClose={() => setHover(null)} />}
      <div className="absolute left-2.5 top-[82px] z-10 flex overflow-hidden rounded-md text-[11px] phone:top-[96px] font-medium shadow ring-1 ring-black/20" role="group" aria-label="Basemap">
        {([['map', 'Map', MapIcon], ['satellite', 'Satellite', Satellite]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setBasemap(id)} aria-pressed={basemap === id} title={`${label} view`}
            className={`inline-flex items-center gap-1 px-2 py-1 phone:px-2.5 phone:py-2 ${basemap === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>
            <Icon size={13} aria-hidden /><span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      {dim && <AutoLegend marked={marked} />}
    </div>
  )
}

/** What the outlines mean while the last auto-plan is highlighted. */
function AutoLegend({ marked }: { marked: Map<number, number> }) {
  const phase = usePlanner((s) => s.phase)
  const kind = usePlanner((s) => s.autoResult?.kind)
  let ready = 0
  for (const v of marked.values()) if (v === 1) ready++
  const st = usePlanner.getState()
  return (
    <div className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-7rem)] -translate-x-1/2 items-center gap-2 rounded-lg bg-slate-950/90 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-lg ring-1 ring-slate-700 backdrop-blur" role="status">
      <Sparkles size={13} className="shrink-0 text-amber-300" aria-hidden />
      <span className="min-w-0">
        <b>{kind === 'fix' ? 'Fixed' : 'Auto-planned'} in {PHASES[phase].label}:</b>{' '}
        <span className="whitespace-nowrap"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-300" />{ready} ready</span>{' '}
        <span className="whitespace-nowrap"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-fuchsia-400" />{marked.size - ready} still building</span>
      </span>
      <button onClick={() => st.focusOn([...marked.keys()])} className="shrink-0 rounded px-1 text-sky-300 hover:underline">Zoom</button>
      <button onClick={() => st.setHighlight(false)} className="shrink-0 text-slate-400 hover:text-white" aria-label="Hide highlight"><X size={14} /></button>
    </div>
  )
}
