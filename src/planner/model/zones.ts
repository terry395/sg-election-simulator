/**
 * Everything a hexagon can be. Existing land uses come from URA Master Plan 2019 (ids match
 * pipeline/planner.mjs); the rest can only be built. Figures are per hexagon (~5.4 ha) at standard
 * density and are rough planning-level estimates, not official costs.
 */
export type ZoneId =
  | 'hdb' | 'ec' | 'condo' | 'landed' | 'mixed'
  | 'commercial' | 'bizpark' | 'industrial' | 'datacentre' | 'port' | 'airport'
  | 'park' | 'nature' | 'open' | 'beach' | 'water' | 'sports' | 'farm'
  | 'school' | 'health' | 'eldercare' | 'community'
  | 'mrt' | 'utility' | 'transport' | 'road' | 'special' | 'cemetery' | 'reserve'
  | 'highway' | 'bridge' | 'causeway' | 'tunnel'

export type ZoneGroup = 'Housing' | 'Economy' | 'Green & blue' | 'Community' | 'Infrastructure' | 'Other'
export const GROUPS: ZoneGroup[] = ['Housing', 'Economy', 'Green & blue', 'Community', 'Infrastructure', 'Other']

/** amenity bits (same bits as the pipeline) */
export const AMEN = { school: 1, health: 2, park: 4, community: 8, sports: 16, station: 32 } as const

export interface Zone {
  id: ZoneId
  label: string
  group: ZoneGroup
  color: string
  /** can be chosen from the palette (some uses only exist on today's map) */
  buildable: boolean
  /** homes per hexagon at standard density */
  homes?: number
  /** jobs per hexagon at standard density */
  jobs?: number
  /** government cost, S$ million per hexagon (land sales go to the reserves, not the budget) */
  cost: number
  /** years from start to completion */
  years: number
  /** offers low / standard / high density */
  density?: boolean
  /** counts towards parks & nature */
  green?: boolean
  amen?: number
  desc: string
}

export const ZONES: Zone[] = [
  { id: 'hdb', label: 'HDB town', group: 'Housing', color: '#c2410c', buildable: true, homes: 700, jobs: 60, cost: 120, years: 5, density: true, desc: 'Public flats with void decks, playgrounds and neighbourhood shops. Government builds and subsidises them.' },
  { id: 'ec', label: 'Executive condo', group: 'Housing', color: '#ea580c', buildable: true, homes: 550, jobs: 30, cost: 25, years: 5, density: true, desc: 'Hybrid public–private housing for middle-income families, built by private developers on state land.' },
  { id: 'condo', label: 'Condominium', group: 'Housing', color: '#f59e0b', buildable: true, homes: 600, jobs: 40, cost: 20, years: 5, density: true, desc: 'Private apartments on Government Land Sales sites. The land premium goes to the reserves.' },
  { id: 'landed', label: 'Landed housing', group: 'Housing', color: '#fbbf24', buildable: true, homes: 120, jobs: 10, cost: 15, years: 5, desc: 'Terraces, semi-detached houses and bungalows. Very few homes for the land they use.' },
  { id: 'mixed', label: 'Mixed-use centre', group: 'Housing', color: '#db2777', buildable: true, homes: 450, jobs: 1200, cost: 60, years: 5, density: true, desc: 'Homes above malls, offices and hawker centres around a town hub.' },

  { id: 'commercial', label: 'Commercial / CBD', group: 'Economy', color: '#dc2626', buildable: true, jobs: 3000, cost: 40, years: 5, density: true, desc: 'Offices, retail and hotels. A regional centre spreads jobs away from the city.' },
  { id: 'bizpark', label: 'Business park', group: 'Economy', color: '#9333ea', buildable: true, jobs: 1500, cost: 30, years: 5, desc: 'R&D, tech and clean industry campuses, like one-north or Punggol Digital District.' },
  { id: 'industrial', label: 'Industrial estate', group: 'Economy', color: '#7c3aed', buildable: true, jobs: 400, cost: 25, years: 5, desc: 'Factories, workshops and warehouses (Business 1 and 2).' },
  { id: 'datacentre', label: 'Data centre park', group: 'Economy', color: '#6d28d9', buildable: true, jobs: 120, cost: 60, years: 5, desc: 'Green data centres. Few jobs, but valuable to the digital economy. Needs a power utility nearby.' },
  { id: 'port', label: 'Port / logistics', group: 'Economy', color: '#475569', buildable: true, jobs: 250, cost: 45, years: 10, desc: 'Container terminals and logistics hubs. Best on deep reclaimed land, like Tuas Port.' },
  { id: 'airport', label: 'Airport / airbase', group: 'Economy', color: '#334155', buildable: true, jobs: 400, cost: 90, years: 10, desc: 'Runways and terminals. They impose height limits on the area around them.' },

  { id: 'park', label: 'Park', group: 'Green & blue', color: '#16a34a', buildable: true, jobs: 5, cost: 20, years: 5, green: true, amen: AMEN.park, desc: 'Town, regional or waterfront park with park connectors.' },
  { id: 'nature', label: 'Nature reserve', group: 'Green & blue', color: '#14532d', buildable: true, cost: 5, years: 5, green: true, desc: 'Protected forest, wetland or mangrove. Once gazetted, it cannot be built on.' },
  { id: 'open', label: 'Open space / greenery', group: 'Green & blue', color: '#86efac', buildable: false, cost: 0, years: 0, desc: 'Undeveloped greenery and open land kept for the future.' },
  { id: 'beach', label: 'Beach / waterfront', group: 'Green & blue', color: '#fde68a', buildable: true, jobs: 10, cost: 25, years: 5, green: true, amen: AMEN.park, desc: 'Public beach and promenade along the coast.' },
  { id: 'water', label: 'Reservoir', group: 'Green & blue', color: '#0284c7', buildable: true, cost: 150, years: 10, desc: 'Fresh-water catchment and storage, one of the Four National Taps.' },
  { id: 'sports', label: 'Sports & recreation', group: 'Green & blue', color: '#65a30d', buildable: true, jobs: 40, cost: 60, years: 5, amen: AMEN.sports, desc: 'Sports hub, stadium, pools, golf or a recreation club.' },
  { id: 'farm', label: 'Agri-tech farm', group: 'Green & blue', color: '#a3e635', buildable: true, jobs: 80, cost: 15, years: 5, desc: 'High-tech farming towards the "30 by 30" goal of producing 30% of food locally.' },

  { id: 'school', label: 'Schools', group: 'Community', color: '#2563eb', buildable: true, jobs: 250, cost: 120, years: 5, amen: AMEN.school, desc: 'Primary and secondary schools, a campus of about 3,000 places.' },
  { id: 'health', label: 'Hospital & polyclinic', group: 'Community', color: '#e11d48', buildable: true, jobs: 3000, cost: 1000, years: 5, amen: AMEN.health, desc: 'A general hospital campus with a polyclinic. Demand grows fast as the population ages.' },
  { id: 'eldercare', label: 'Eldercare & active ageing', group: 'Community', color: '#f472b6', buildable: true, jobs: 300, cost: 80, years: 5, amen: AMEN.community, desc: 'Nursing homes, senior care centres and assisted-living flats.' },
  { id: 'community', label: 'Community & civic', group: 'Community', color: '#0ea5e9', buildable: true, jobs: 150, cost: 50, years: 5, amen: AMEN.community, desc: 'Community clubs, hawker centres, libraries and places of worship.' },

  { id: 'mrt', label: 'MRT station & line', group: 'Infrastructure', color: '#0f766e', buildable: true, jobs: 50, cost: 1500, years: 10, amen: AMEN.station, desc: 'A station with its share of a new rail line. It takes about 10 years.' },
  { id: 'utility', label: 'Utilities', group: 'Infrastructure', color: '#78716c', buildable: true, jobs: 60, cost: 600, years: 5, desc: 'Power, NEWater, desalination or waste-to-energy plant. It serves about 250,000 people.' },
  { id: 'transport', label: 'Transport facility', group: 'Infrastructure', color: '#64748b', buildable: true, jobs: 150, cost: 100, years: 5, desc: 'Bus interchanges, depots and checkpoints.' },
  { id: 'road', label: 'Road / expressway', group: 'Infrastructure', color: '#94a3b8', buildable: false, cost: 0, years: 0, desc: 'Expressways and major roads.' },

  { id: 'special', label: 'Special use (defence)', group: 'Other', color: '#57534e', buildable: true, jobs: 100, cost: 50, years: 5, desc: 'Military camps and training areas.' },
  { id: 'cemetery', label: 'Cemetery', group: 'Other', color: '#a8a29e', buildable: false, cost: 0, years: 0, desc: 'Burial grounds and columbaria.' },
  { id: 'reserve', label: 'Cleared site (land bank)', group: 'Other', color: '#d6d3d1', buildable: true, cost: 5, years: 0, desc: 'Vacant state land held for the future. Clearing a built site makes one.' },

  // fixed links (kept at the end: saved plans store zones by index)
  { id: 'highway', label: 'Expressway', group: 'Infrastructure', color: '#525252', buildable: true, jobs: 10, cost: 150, years: 5, desc: 'A new expressway or major road on land, like the North-South Corridor.' },
  { id: 'bridge', label: 'Bridge', group: 'Infrastructure', color: '#f43f5e', buildable: true, cost: 400, years: 5, desc: 'A road and rail bridge over the sea, up to 2.5 km from shore. Build it out from the coast to link an island.' },
  { id: 'causeway', label: 'Causeway', group: 'Infrastructure', color: '#a16207', buildable: true, cost: 120, years: 5, desc: 'A low embankment carrying a road across shallow water (within 750 m of shore), like the Jurong Island Causeway.' },
  { id: 'tunnel', label: 'Undersea tunnel', group: 'Infrastructure', color: '#7e22ce', buildable: true, cost: 900, years: 10, desc: 'A road or rail tunnel under the sea at any depth. Costly, but it keeps shipping lanes clear.' },
]

export const ZONE: Record<ZoneId, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, Zone>

export const DENSITIES = [
  { id: 0, label: 'Low', factor: 0.65, cost: 0.8 },
  { id: 1, label: 'Standard', factor: 1, cost: 1 },
  { id: 2, label: 'High', factor: 1.45, cost: 1.35 },
] as const
export type Density = 0 | 1 | 2

/** homes a zone provides at a density */
export const zoneHomes = (z: ZoneId, d: Density = 1) => Math.round((ZONE[z].homes ?? 0) * (ZONE[z].density ? DENSITIES[d].factor : 1))
export const zoneJobs = (z: ZoneId, d: Density = 1) => Math.round((ZONE[z].jobs ?? 0) * (ZONE[z].density ? DENSITIES[d].factor : 1))
export const zoneCost = (z: ZoneId, d: Density = 1) => ZONE[z].cost * (ZONE[z].density ? DENSITIES[d].cost : 1)
export const isHousing = (z: ZoneId) => (ZONE[z].homes ?? 0) > 0
export const isGreen = (z: ZoneId) => !!ZONE[z].green
export const isIndustry = (z: ZoneId) => z === 'industrial' || z === 'bizpark' || z === 'port' || z === 'datacentre'
/** fixed links that cross the sea without making land */
export const isCrossing = (z: ZoneId | null | undefined) => z === 'bridge' || z === 'causeway' || z === 'tunnel'
/** deepest sea ring (250 m each) a crossing can be built in */
export const CROSSING_MAX_RING: Partial<Record<ZoneId, number>> = { bridge: 10, causeway: 3, tunnel: 99 }
/** land with nothing to demolish */
export const isVacant = (z: ZoneId) => z === 'reserve' || z === 'open'

/** hexagon area in hectares (rows 250 m apart) */
export const CELL_HA = (3 * Math.sqrt(3) / 2) * (250 / Math.sqrt(3)) ** 2 / 10_000
