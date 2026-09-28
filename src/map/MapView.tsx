import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { feature } from 'topojson-client'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useBlockColors } from './useBlockColors'
import { BlockTooltip } from './BlockTooltip'

maplibregl.setWorkerUrl(workerUrl)

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dfe7ef' } }],
}
const SG_BOUNDS: [number, number, number, number] = [103.55, 1.13, 104.15, 1.49]

/** Paint-type tools that capture left-drag instead of panning the map. */
const DRAG_TOOLS = new Set(['paint', 'erase', 'lasso'])

export function MapView() {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null)
  const data = useStore((s) => s.data)!
  const tool = useStore((s) => s.tool)
  const tab = useStore((s) => s.tab)
  const showGE2025 = useStore((s) => s.showGE2025)
  const activeId = useStore((s) => s.activeId)
  const { districts, labels } = useDerived()
  const colors = useBlockColors()
  const spaceDown = useRef(false)

  // ------------------------------------------------------------------ init
  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      bounds: SG_BOUNDS,
      maxBounds: [103.3, 1.0, 104.4, 1.65],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      doubleClickZoom: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    mapRef.current = map
    let fellBack = false
    map.on('error', (e) => {
      // basemap unreachable (offline): fall back to a plain background so the simulator still works
      if (!fellBack && !map.isStyleLoaded() && String(e.error?.message ?? '').match(/style|fetch|Failed/i)) {
        fellBack = true
        map.setStyle(FALLBACK_STYLE)
      }
    })
    map.on('style.load', () => {
      const blocksFc = feature(data.topo, data.topo.objects.blocks)
      const ge = feature(data.topo, data.topo.objects.ge2025)
      if (map.getSource('blocks')) return
      map.addSource('blocks', { type: 'geojson', data: blocksFc, promoteId: undefined })
      map.addSource('ge2025', { type: 'geojson', data: ge })
      map.addSource('districts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('lasso', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const firstSymbol = map.getStyle().layers.find((l: { type: string }) => l.type === 'symbol')?.id
      map.addLayer({
        id: 'blocks-fill', type: 'fill', source: 'blocks',
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'fill'], '#e2e8f0'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.78],
        },
      }, firstSymbol)
      map.addLayer({ id: 'blocks-line', type: 'line', source: 'blocks', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.2, 14, 1], 'line-opacity': 0.6 } })
      map.addLayer({ id: 'blocks-hover', type: 'line', source: 'blocks', paint: { 'line-color': '#0f172a', 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0] } })
      map.addLayer({ id: 'districts-line', type: 'line', source: 'districts', paint: { 'line-color': '#0f172a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 3] } })
      map.addLayer({ id: 'districts-active', type: 'line', source: 'districts', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#facc15', 'line-width': 3.5 } })
      map.addLayer({ id: 'ge2025-line', type: 'line', source: 'ge2025', layout: { visibility: 'none' }, paint: { 'line-color': '#dc2626', 'line-width': 1.6, 'line-dasharray': [2, 2] } })
      map.addLayer({ id: 'lasso-fill', type: 'fill', source: 'lasso', paint: { 'fill-color': '#facc15', 'fill-opacity': 0.2 } })
      map.addLayer({ id: 'lasso-line', type: 'line', source: 'lasso', paint: { 'line-color': '#ca8a04', 'line-width': 2, 'line-dasharray': [1, 1] } })
      map.addLayer({
        id: 'labels', type: 'symbol', source: 'labels',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 13, 13],
          'text-max-width': 8,
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      })
      setReady(true)
    })
    return () => map.remove()
  }, [data])

  // ------------------------------------------------------------------ data sync
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    colors.forEach((c, i) => map.setFeatureState({ source: 'blocks', id: i }, { fill: c }))
  }, [colors, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('districts') as GeoJSONSource).setData(districts)
    ;(map.getSource('labels') as GeoJSONSource).setData(labels)
  }, [districts, labels, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setLayoutProperty('ge2025-line', 'visibility', showGE2025 ? 'visible' : 'none')
    map.setFilter('districts-active', ['==', ['get', 'id'], tab === 'draw' ? activeId ?? '' : ''])
  }, [showGE2025, activeId, tab, ready])

  // ------------------------------------------------------------------ interaction
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const canvas = map.getCanvas()
    const drawing = tab === 'draw' && DRAG_TOOLS.has(tool)
    canvas.style.cursor = tab !== 'draw' ? 'pointer' : tool === 'pan' ? 'grab' : tool === 'inspect' ? 'pointer' : 'crosshair'
    if (drawing) map.dragPan.disable()
    else map.dragPan.enable()

    let hovered: number | null = null
    let painting = false
    let lasso: [number, number][] = []
    const st = () => useStore.getState()
    const blockAt = (e: MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['blocks-fill'] })[0]
      return f ? (f.id as number) : null
    }
    const setHoverState = (id: number | null) => {
      if (hovered !== null) map.setFeatureState({ source: 'blocks', id: hovered }, { hover: false })
      hovered = id
      if (id !== null) map.setFeatureState({ source: 'blocks', id }, { hover: true })
    }
    const paintAt = (id: number | null) => {
      if (id === null) return
      const s = st()
      if (tool === 'erase') s.assignBlocks([id], null)
      else if (s.activeId) s.assignBlocks([id], s.activeId)
    }
    const setLasso = (pts: [number, number][]) => {
      const src = map.getSource('lasso') as GeoJSONSource
      src.setData(pts.length > 2
        ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } }
        : { type: 'FeatureCollection', features: [] })
    }

    const onDown = (e: MapMouseEvent) => {
      if (!drawing || spaceDown.current || e.originalEvent.button !== 0) return
      if (tool !== 'lasso' && !st().activeId && tool !== 'erase') return
      st().checkpoint()
      painting = true
      if (tool === 'lasso') lasso = [[e.lngLat.lng, e.lngLat.lat]]
      else paintAt(blockAt(e))
    }
    const onMove = (e: MapMouseEvent) => {
      const id = blockAt(e)
      setHoverState(id)
      setHover(id === null ? null : { id, x: e.point.x, y: e.point.y })
      if (!painting) return
      if (tool === 'lasso') {
        lasso.push([e.lngLat.lng, e.lngLat.lat])
        setLasso(lasso)
      } else paintAt(id)
    }
    const onUp = () => {
      if (!painting) return
      painting = false
      if (tool === 'lasso' && lasso.length > 3) {
        const poly = { type: 'Polygon' as const, coordinates: [[...lasso, lasso[0]]] }
        const s = st()
        const ids = s.data!.blocks.filter((b) => booleanPointInPolygon(b.c, poly)).map((b) => b.id)
        if (s.activeId) s.assignBlocks(ids, s.activeId)
      }
      lasso = []
      setLasso([])
    }
    const onClick = (e: MapMouseEvent) => {
      const id = blockAt(e)
      const s = st()
      if (id === null) return
      if (s.tab !== 'draw' || tool === 'inspect' || tool === 'pan') {
        s.setSelectedBlock(id)
        const cid = s.plan.assign[id]
        if (cid) s.setActive(cid)
        return
      }
      if (tool === 'fill' && s.activeId) {
        // flood fill: all connected blocks that share the clicked block's current constituency
        s.checkpoint()
        const from = s.plan.assign[id]
        const blocks = s.data!.blocks
        const seen = new Set([id])
        const stack = [id]
        while (stack.length) {
          const i = stack.pop()!
          for (const n of blocks[i].adj) if (!seen.has(n) && s.plan.assign[n] === from) { seen.add(n); stack.push(n) }
        }
        s.assignBlocks([...seen], s.activeId)
      }
    }
    const onLeave = () => { setHoverState(null); setHover(null) }

    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('click', onClick)
    map.on('mouseout', onLeave)
    window.addEventListener('mouseup', onUp)
    // hold space to pan temporarily while a drawing tool is active
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
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      // the map may already be destroyed when this effect is torn down
      try { setHoverState(null) } catch { /* map removed */ }
    }
  }, [ready, tool, tab])

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      {hover && <BlockTooltip id={hover.id} x={hover.x} y={hover.y} />}
    </div>
  )
}
