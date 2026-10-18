import type * as maplibregl from 'maplibre-gl'

export const STYLE = 'https://tiles.openfreemap.org/styles/positron'
export const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dfe7ef' } }],
}
export const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const SATELLITE_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics'
export const SG_BOUNDS: [number, number, number, number] = [103.55, 1.13, 104.15, 1.49]
export const MAX_BOUNDS: [number, number, number, number] = [103.3, 1.0, 104.4, 1.65]

/** tabs that can show the past-election swipe comparison */
export const COMPARE_TABS = new Set(['draw', 'night'])

/** block fill opacity: [normal, hovered] for the street map and the satellite view */
export const fillOpacity = (satellite: boolean) => (satellite ? [0.5, 0.8] : [0.78, 0.95])
