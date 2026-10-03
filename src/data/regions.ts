/** URA's five planning regions, in the order boundary reports usually go round the island. */
export const REGIONS = ['Central', 'East', 'North-East', 'North', 'West'] as const
export type Region = (typeof REGIONS)[number]

/** URA Master Plan 2019 planning area → planning region. */
export const PA_REGION: Record<string, Region> = {
  'BISHAN': 'Central', 'BUKIT MERAH': 'Central', 'BUKIT TIMAH': 'Central', 'DOWNTOWN CORE': 'Central', 'GEYLANG': 'Central',
  'KALLANG': 'Central', 'MARINA EAST': 'Central', 'MARINA SOUTH': 'Central', 'MARINE PARADE': 'Central', 'MUSEUM': 'Central',
  'NEWTON': 'Central', 'NOVENA': 'Central', 'ORCHARD': 'Central', 'OUTRAM': 'Central', 'QUEENSTOWN': 'Central',
  'RIVER VALLEY': 'Central', 'ROCHOR': 'Central', 'SINGAPORE RIVER': 'Central', 'SOUTHERN ISLANDS': 'Central',
  'STRAITS VIEW': 'Central', 'TANGLIN': 'Central', 'TOA PAYOH': 'Central',
  'BEDOK': 'East', 'CHANGI': 'East', 'CHANGI BAY': 'East', 'PASIR RIS': 'East', 'PAYA LEBAR': 'East', 'TAMPINES': 'East',
  'ANG MO KIO': 'North-East', 'HOUGANG': 'North-East', 'NORTH-EASTERN ISLANDS': 'North-East', 'PUNGGOL': 'North-East',
  'SELETAR': 'North-East', 'SENGKANG': 'North-East', 'SERANGOON': 'North-East',
  'CENTRAL WATER CATCHMENT': 'North', 'LIM CHU KANG': 'North', 'MANDAI': 'North', 'SEMBAWANG': 'North',
  'SIMPANG': 'North', 'SUNGEI KADUT': 'North', 'WOODLANDS': 'North', 'YISHUN': 'North',
  'BOON LAY': 'West', 'BUKIT BATOK': 'West', 'BUKIT PANJANG': 'West', 'CHOA CHU KANG': 'West', 'CLEMENTI': 'West',
  'JURONG EAST': 'West', 'JURONG WEST': 'West', 'PIONEER': 'West', 'TENGAH': 'West', 'TUAS': 'West',
  'WESTERN ISLANDS': 'West', 'WESTERN WATER CATCHMENT': 'West',
}
