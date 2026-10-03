import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from 'geojson'

/** Projected outline of one constituency, in map units (1 unit ≈ 1/1000 of a degree). */
export interface MapShape { id: string; d: string; grc: boolean; bbox: [number, number, number, number] }
export interface MapLabel { id: string; n: number; x: number; y: number }

const LAT0 = 1.35
const K = Math.cos((LAT0 * Math.PI) / 180)
const project = ([lng, lat]: Position): [number, number] => [(lng - 103.6) * K * 1000, (1.48 - lat) * 1000]

/** smallest ring drawn, in map units² (about 0.4 ha) */
const MIN_RING = 0.3

function ringArea(ring: Position[]) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = project(ring[i])
    const [xj, yj] = project(ring[j])
    a += (xj + xi) * (yj - yi)
  }
  return a / 2
}

function ringsOf(g: Polygon | MultiPolygon): Position[][] {
  return g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()
}

/** Turns GeoJSON polygons into SVG path data plus a bounding box. */
export function toShape(id: string, g: Polygon | MultiPolygon, grc: boolean): MapShape {
  let d = ''
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const ring of ringsOf(g)) {
    // merging the building blocks leaves slivers and pin-holes; they would show as stray lines
    if (Math.abs(ringArea(ring)) < MIN_RING) continue
    ring.forEach((pt, i) => {
      const [x, y] = project(pt)
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    d += 'Z'
  }
  return { id, d, grc, bbox: [x0, y0, x1, y1] }
}

export function projectLabels(labels: FeatureCollection<Point, { id: string }>, numbers: Record<string, number>): MapLabel[] {
  return labels.features
    .filter((f) => numbers[f.properties.id])
    .map((f) => { const [x, y] = project(f.geometry.coordinates); return { id: f.properties.id, n: numbers[f.properties.id], x, y } })
}

export function outlines(fc: FeatureCollection | { features: Feature[] }): string {
  return fc.features.map((f) => toShape('', f.geometry as Polygon | MultiPolygon, false).d).join('')
}
