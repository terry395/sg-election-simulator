// Builds the National Planner's hexagon grid from public government datasets.
// Run: node pipeline/planner.mjs   (inputs in pipeline/raw, output public/data/planner.json)
//
// 1. URA Master Plan 2019 land-use parcels are rasterised onto a 50 m sample lattice (scanline fill).
// 2. Samples are grouped into ~250 m flat-top hexagons: dominant land use, plot ratio, floor area.
// 3. Census 2020 subzone residents are placed on residential floor area, then each planning region and
//    age band is scaled to SingStat's end-June 2026 residents (the latest annual release).
// 4. Sea hexes within ~3 km of the shore and inside an approximate limit of Singapore waters can be reclaimed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(DIR, 'raw');
const OUT = path.join(DIR, '..', 'public', 'data');
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const log = (...a) => console.log('[planner]', ...a);

function readCsv(f) {
  const lines = fs.readFileSync(path.join(RAW, f), 'utf8').trim().split(/\r?\n/);
  const split = (l) => {
    const out = []; let cur = ''; let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => {
    const v = split(l); const o = {};
    head.forEach((h, i) => (o[h] = v[i]));
    return o;
  });
}
const num = (s) => (s === undefined || s === '-' || s === '' ? 0 : Number(String(s).replace(/,/g, '')));
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

// ---------------------------------------------------------------- grid
// local metric projection (equirectangular at 1.35°N is accurate to <0.1% over Singapore)
const LNG0 = 103.58, LAT0 = 1.14, LNG1 = 104.10, LAT1 = 1.48;
const KX = 111320 * Math.cos((1.35 * Math.PI) / 180), KY = 110574;
const W = (LNG1 - LNG0) * KX, H = (LAT1 - LAT0) * KY;
const toXY = ([lng, lat]) => [(lng - LNG0) * KX, (lat - LAT0) * KY];
/** hex circumradius: rows are 250 m apart */
const R = 250 / Math.sqrt(3);
const COLS = Math.ceil(W / (1.5 * R)) + 1, ROWS = Math.ceil(H / (Math.sqrt(3) * R)) + 1;
const NHEX = COLS * ROWS;
const STEP = 50; // sample lattice spacing (m)
const NX = Math.ceil(W / STEP), NY = Math.ceil(H / STEP);
const SAMPLE_M2 = STEP * STEP;

/** "odd-q" flat-top hex containing a metric point */
function hexOf(x, y) {
  const q = ((2 / 3) * x) / R;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / R;
  let cx = Math.round(q), cz = Math.round(r), cy = Math.round(-q - r);
  const dx = Math.abs(cx - q), dz = Math.abs(cz - r), dy = Math.abs(cy + q + r);
  if (dx > dy && dx > dz) cx = -cy - cz;
  else if (dy <= dz) cz = -cx - cy;
  const col = cx, row = cz + (cx - (cx & 1)) / 2;
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return -1;
  return col * ROWS + row;
}
const hexCenter = (h) => {
  const col = Math.floor(h / ROWS), row = h % ROWS;
  return [R * 1.5 * col, R * Math.sqrt(3) * (row + 0.5 * (col & 1))];
};
function hexNeighbours(h) {
  const col = Math.floor(h / ROWS), row = h % ROWS;
  const odd = col & 1;
  const d = odd ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  const out = [];
  for (const [dc, dr] of d) {
    const c = col + dc, r = row + dr;
    if (c >= 0 && r >= 0 && c < COLS && r < ROWS) out.push(c * ROWS + r);
  }
  return out;
}

/** scanline fill of a polygon (rings in metric coords, even-odd) onto the sample lattice */
function fillPolygon(rings, cb) {
  let y0 = Infinity, y1 = -Infinity;
  for (const ring of rings) for (const p of ring) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const j0 = Math.max(0, Math.ceil(y0 / STEP - 0.5)), j1 = Math.min(NY - 1, Math.floor(y1 / STEP - 0.5));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const yc = (j + 0.5) * STEP;
    xs.length = 0;
    for (const ring of rings) {
      for (let k = 0, n = ring.length; k < n - 1; k++) {
        const [xa, ya] = ring[k], [xb, yb] = ring[k + 1];
        if ((ya <= yc) !== (yb <= yc)) xs.push(xa + ((yc - ya) * (xb - xa)) / (yb - ya));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / STEP - 0.5)), i1 = Math.min(NX - 1, Math.floor(xs[k + 1] / STEP - 0.5));
      for (let i = i0; i <= i1; i++) cb(j * NX + i);
    }
  }
}
const ringsXY = (poly) => poly.map((ring) => ring.map(toXY));

// ---------------------------------------------------------------- land-use classes (ids match src/planner/model/zones.ts)
const LU = ['hdb', 'condo', 'landed', 'mixed', 'commercial', 'bizpark', 'industrial', 'port', 'airport', 'park', 'open', 'beach', 'water',
  'sports', 'school', 'health', 'community', 'farm', 'utility', 'transport', 'road', 'special', 'cemetery', 'reserve'];
const LUI = Object.fromEntries(LU.map((k, i) => [k, i]));
const AIRPORT_PA = new Set(['CHANGI', 'CHANGI BAY', 'PAYA LEBAR', 'SELETAR']);
function classify(desc) {
  switch (desc) {
    case 'RESIDENTIAL': return 'res';
    case 'COMMERCIAL & RESIDENTIAL': case 'RESIDENTIAL WITH COMMERCIAL AT 1ST STOREY': case 'WHITE': return 'mixed';
    case 'COMMERCIAL': case 'HOTEL': case 'COMMERCIAL / INSTITUTION': return 'commercial';
    case 'BUSINESS PARK': case 'BUSINESS PARK - WHITE': return 'bizpark';
    case 'BUSINESS 1': case 'BUSINESS 2': case 'BUSINESS 1 - WHITE': case 'BUSINESS 2 - WHITE': return 'industrial';
    case 'PORT / AIRPORT': return 'port';
    case 'PARK': return 'park';
    case 'OPEN SPACE': return 'open';
    case 'BEACH AREA': return 'beach';
    case 'WATERBODY': return 'water';
    case 'SPORTS & RECREATION': return 'sports';
    case 'EDUCATIONAL INSTITUTION': return 'school';
    case 'HEALTH & MEDICAL CARE': return 'health';
    case 'CIVIC & COMMUNITY INSTITUTION': case 'PLACE OF WORSHIP': case 'RESIDENTIAL / INSTITUTION': return 'community';
    case 'AGRICULTURE': return 'farm';
    case 'UTILITY': return 'utility';
    case 'TRANSPORT FACILITIES': case 'MASS RAPID TRANSIT': case 'LIGHT RAPID TRANSIT': return 'transport';
    case 'ROAD': return 'road';
    case 'SPECIAL USE': return 'special';
    case 'CEMETERY': return 'cemetery';
    case 'RESERVE SITE': return 'reserve';
    default: return 'reserve';
  }
}
/** floor area per m² of land when the plan gives no number (EVA, SDP...) */
const DEFAULT_GPR = { commercial: 4, mixed: 3, bizpark: 2.5, industrial: 1.4, health: 2, school: 1, community: 1, res: 1.6 };
/** jobs per m² of floor area (port and airport are by land area) */
const JOBS_PER_M2 = { commercial: 1 / 22, mixed: 1 / 60, bizpark: 1 / 35, industrial: 1 / 90, port: 1 / 450, health: 1 / 40, school: 1 / 70,
  community: 1 / 150, utility: 1 / 1500, transport: 1 / 400, special: 1 / 600, res: 1 / 500, farm: 1 / 3000, sports: 1 / 1500 };
/** amenity bits found inside a hex */
const AMEN = { school: 1, health: 2, park: 4, community: 8, sports: 16, station: 32 };

// ---------------------------------------------------------------- subzones
const szFeatures = readJSON('subzone2019.geojson').features;
const SZ = szFeatures.map((f) => ({ name: f.properties.SUBZONE_N, pa: f.properties.PLN_AREA_N, region: f.properties.REGION_N.replace(' REGION', '') }));
const sampleSz = new Int16Array(NX * NY).fill(-1);
szFeatures.forEach((f, si) => { for (const p of polys(f.geometry)) fillPolygon(ringsXY(p), (s) => { sampleSz[s] = si; }); });
log('subzones rasterised', SZ.length);

// ---------------------------------------------------------------- land use
log('reading land use (large)...');
const land = readJSON('landuse2019.geojson').features;
const sampleLu = new Int8Array(NX * NY).fill(-1);
const sampleRes = new Float32Array(NX * NY); // residential floor area (m²)
const sampleLanded = new Uint8Array(NX * NY);
const sampleJobs = new Float32Array(NX * NY);
const hexAmen = new Uint8Array(NHEX);
for (const f of land) {
  const p = f.properties;
  let cls = classify(p.LU_DESC);
  const g = Number(p.GPR);
  const landed = p.GPR === 'LND';
  const gpr = cls === 'res' && landed ? 0.9 : Number.isFinite(g) && g > 0 ? g : DEFAULT_GPR[cls] ?? 1;
  let resFactor = 0;
  if (cls === 'res') resFactor = 1;
  if (p.LU_DESC === 'COMMERCIAL & RESIDENTIAL' || p.LU_DESC === 'WHITE') resFactor = 0.5;
  if (p.LU_DESC === 'RESIDENTIAL WITH COMMERCIAL AT 1ST STOREY') resFactor = 0.9;
  if (p.LU_DESC === 'RESIDENTIAL / INSTITUTION') resFactor = 0.25;
  const jobsPer = JOBS_PER_M2[cls] ?? 0;
  const byArea = cls === 'port' || cls === 'farm' || cls === 'utility' || cls === 'special';
  // residential class is resolved per hex later (HDB / condo / landed)
  const code = cls === 'res' ? -2 : LUI[cls];
  for (const poly of polys(f.geometry)) {
    const rings = ringsXY(poly);
    fillPolygon(rings, (s) => {
      sampleLu[s] = code;
      sampleRes[s] = SAMPLE_M2 * gpr * resFactor;
      sampleLanded[s] = landed ? 1 : 0;
      sampleJobs[s] = SAMPLE_M2 * (byArea ? 1 : gpr) * jobsPer;
    });
    // small amenities (schools, clinics, stations) may fall between samples: mark the hex at the parcel's centre
    const amen = p.LU_DESC === 'MASS RAPID TRANSIT' || p.LU_DESC === 'LIGHT RAPID TRANSIT' ? AMEN.station : AMEN[cls];
    if (amen) {
      let x = 0, y = 0;
      for (const q of rings[0]) { x += q[0]; y += q[1]; }
      const h = hexOf(x / rings[0].length, y / rings[0].length);
      if (h >= 0) hexAmen[h] |= amen;
    }
  }
}
land.length = 0;
// MRT stations: the centre of each station's exits (LTA)
const stations = new Map();
for (const f of readJSON('mrtexits.geojson').features) {
  const name = f.properties.STATION_NA.replace(/ (MRT|LRT) STATION$/, '');
  const s = stations.get(name) ?? { x: 0, y: 0, n: 0 };
  const [x, y] = toXY(f.geometry.coordinates);
  s.x += x; s.y += y; s.n++;
  stations.set(name, s);
}
const stationHex = new Map();
for (const [name, s] of stations) {
  const h = hexOf(s.x / s.n, s.y / s.n);
  if (h < 0) continue;
  hexAmen[h] |= AMEN.station;
  stationHex.set(name, h);
}
log('MRT stations', stationHex.size);
// res samples carry code -2: store them as 'hdb' for now and keep a flag
const isRes = new Uint8Array(NX * NY);
for (let s = 0; s < sampleLu.length; s++) if (sampleLu[s] === -2) { isRes[s] = 1; sampleLu[s] = LUI.hdb; }
log('land use rasterised');

// ---------------------------------------------------------------- census (2020 subzones) and SingStat end-June 2026 (planning regions)
const census = {};
const subzoneRow = (r) => r.Number && !/Total/.test(r.Number);
for (const r of readCsv('age2020.csv').filter(subzoneRow)) {
  const a = (band) => num(r['Total_' + band]);
  census[r.Number.toUpperCase()] = {
    total: num(r.Total_Total),
    age: [a('0_4'), a('5_9') + a('10_14') + a('15_19'),
      a('20_24') + a('25_29') + a('30_34') + a('35_39') + a('40_44') + a('45_49') + a('50_54') + a('55_59') + a('60_64'),
      a('65_69') + a('70_74') + a('75_79') + a('80_84') + a('85_89') + a('90andOver')],
  };
}
for (const r of readCsv('dwelling2020.csv').filter(subzoneRow)) {
  const c = census[r.Number.toUpperCase()];
  if (!c) continue;
  c.dwelling = [
    num(r['HDBDwellings_1_and2_RoomFlats1']) + num(r['HDBDwellings_3_RoomFlats']),
    num(r['HDBDwellings_4_RoomFlats']),
    num(r['HDBDwellings_5_RoomandExecutiveFlats']),
    num(r['CondominiumsandOtherApartments']) + num(r['Others']),
    num(r['LandedProperties']),
  ];
}
for (const r of readCsv('ethnic2020.csv').filter(subzoneRow)) {
  const c = census[r.Number.toUpperCase()];
  if (c) c.eth = [num(r.Chinese_Total), num(r.Malays_Total), num(r.Indians_Total), num(r.Others_Total)];
}

// residents by planning region and 5-year age group, end June (SingStat via data.gov.sg)
const regionRows = fs.readFileSync(path.join(RAW, 'region2025.csv'), 'utf8').trim().split(/\r?\n/).map((l) => l.split(','));
const YEAR_COL = regionRows[0].indexOf('2026');
if (YEAR_COL < 0) throw new Error('region file has no 2026 column');
const regionAge = {}; // region -> { total, groups[19] } (sexes combined)
const nationalAge = new Array(19).fill(0), nationalFemale = new Array(19).fill(0);
{
  let cur = null, sex = null, gi = 0;
  for (const row of regionRows.slice(1)) {
    const label = row[0].trim();
    const m = label.match(/^(.*) Region(?: \((Male|Female)\))?$/);
    if (m) {
      cur = m[1].toUpperCase(); sex = m[2] ?? null; gi = 0;
      if (!sex) regionAge[cur] = { total: num(row[YEAR_COL]), groups: [] };
      continue;
    }
    const v = num(row[YEAR_COL]);
    if (!sex) { regionAge[cur].groups[gi] = v; nationalAge[gi] += v; }
    else if (sex === 'Female') nationalFemale[gi] += v;
    gi++;
  }
}
const band4 = (g) => [g[0], g[1] + g[2] + g[3], g.slice(4, 13).reduce((a, b) => a + b, 0), g.slice(13).reduce((a, b) => a + b, 0)];
const residents2026 = Object.values(regionAge).reduce((s, r) => s + r.total, 0);
log('residents June 2026', residents2026);

// ---------------------------------------------------------------- aggregate samples into hexes
const K = LU.length;
const luW = new Float32Array(NHEX * K);
const nLand = new Uint16Array(NHEX), nAll = new Uint16Array(NHEX);
const hexJobs = new Float32Array(NHEX);
const hexGpr = new Float32Array(NHEX), hexGprN = new Uint16Array(NHEX);
/** residential floor area per (hex, subzone) piece */
const pieces = new Map();
const szVotes = new Map();
const LU_WEIGHT = new Float32Array(K).fill(1);
LU_WEIGHT[LUI.road] = 0.3; // a hex is "road" only when there is little else in it
for (let j = 0; j < NY; j++) {
  for (let i = 0; i < NX; i++) {
    const s = j * NX + i;
    const h = hexOf((i + 0.5) * STEP, (j + 0.5) * STEP);
    if (h < 0) continue;
    nAll[h]++;
    const lu = sampleLu[s];
    if (lu < 0) continue;
    nLand[h]++;
    luW[h * K + lu] += LU_WEIGHT[lu];
    hexJobs[h] += sampleJobs[s];
    if (sampleRes[s] > 0) { hexGpr[h] += sampleRes[s] / SAMPLE_M2; hexGprN[h]++; }
    const sz = sampleSz[s];
    if (sz >= 0) {
      const key = h * 400 + sz;
      szVotes.set(key, (szVotes.get(key) ?? 0) + 1);
      if (isRes[s]) {
        let pc = pieces.get(key);
        if (!pc) pieces.set(key, (pc = { h, sz, cap: 0, landedCap: 0 }));
        if (sampleLanded[s]) pc.landedCap += sampleRes[s]; else pc.cap += sampleRes[s];
      } else if (sampleRes[s] > 0) {
        let pc = pieces.get(key);
        if (!pc) pieces.set(key, (pc = { h, sz, cap: 0, landedCap: 0 }));
        pc.cap += sampleRes[s];
      }
    }
  }
}
// majority subzone per hex
const hexSz = new Int16Array(NHEX).fill(-1);
{
  const best = new Float32Array(NHEX);
  for (const [key, n] of szVotes) {
    const h = Math.floor(key / 400), sz = key % 400;
    if (n > best[h]) { best[h] = n; hexSz[h] = sz; }
  }
}

// residents: census 2020 by floor area within each subzone (landed residents to landed homes)
const bySz = new Map();
for (const pc of pieces.values()) { if (!bySz.has(pc.sz)) bySz.set(pc.sz, []); bySz.get(pc.sz).push(pc); }
for (const [sz, list] of bySz) {
  const c = census[SZ[sz].name];
  const total = c?.total ?? 0;
  const landedShare = c?.dwelling ? c.dwelling[4] / Math.max(1, c.dwelling.reduce((a, b) => a + b, 0)) : 0;
  const lc = list.reduce((s, p) => s + p.landedCap, 0), nc = list.reduce((s, p) => s + p.cap, 0);
  let tl = total * landedShare, tn = total - tl;
  if (!lc) { tn = total; tl = 0; }
  if (!nc) { tl = total; tn = 0; }
  for (const p of list) p.census = (lc ? (tl * p.landedCap) / lc : 0) + (nc ? (tn * p.cap) / nc : 0);
}
// blend with capacity so estates finished after 2020 (Tengah, Bidadari...) are not empty
{
  const all = [...pieces.values()];
  const totCap = all.reduce((s, p) => s + p.cap + p.landedCap, 0);
  const totCensus = all.reduce((s, p) => s + p.census, 0);
  for (const p of all) p.pop = 0.8 * p.census + 0.2 * ((p.cap + p.landedCap) / totCap) * totCensus;
}
// scale each region and age band to end-June 2026
const hexAge = new Float64Array(NHEX * 4);
{
  const modelled = {};
  for (const p of pieces.values()) {
    const reg = SZ[p.sz].region, c = census[SZ[p.sz].name];
    const share = c && c.total ? c.age.map((v) => v / c.total) : [0.04, 0.15, 0.62, 0.19];
    p.share = share;
    const m = (modelled[reg] ||= [0, 0, 0, 0]);
    share.forEach((v, b) => (m[b] += p.pop * v));
  }
  for (const p of pieces.values()) {
    const reg = SZ[p.sz].region;
    const target = band4(regionAge[reg].groups);
    for (let b = 0; b < 4; b++) hexAge[p.h * 4 + b] += (p.pop * p.share[b] * target[b]) / modelled[reg][b];
  }
}

// ---------------------------------------------------------------- choose cells
const hexPop = new Float64Array(NHEX);
for (let h = 0; h < NHEX; h++) hexPop[h] = hexAge[h * 4] + hexAge[h * 4 + 1] + hexAge[h * 4 + 2] + hexAge[h * 4 + 3];
const isLand = new Uint8Array(NHEX);
for (let h = 0; h < NHEX; h++) if (nAll[h] && (nLand[h] / nAll[h] >= 0.5 || hexPop[h] > 0)) isLand[h] = 1;

// approximate outer limit of Singapore waters for reclamation (not a legal boundary):
// the Johor Strait midline to the north and west, and short of the Singapore Strait shipping lanes to the south
const WATERS = [
  [103.600, 1.240], [103.612, 1.300], [103.626, 1.343], [103.655, 1.386], [103.676, 1.421], [103.702, 1.447], [103.740, 1.456],
  [103.772, 1.456], [103.800, 1.466], [103.830, 1.470], [103.862, 1.455], [103.893, 1.441], [103.930, 1.436], [103.970, 1.431],
  [104.005, 1.421], [104.045, 1.405], [104.090, 1.380], [104.100, 1.330], [104.080, 1.290], [104.030, 1.262], [103.960, 1.245],
  [103.900, 1.228], [103.850, 1.205], [103.800, 1.185], [103.740, 1.180], [103.680, 1.190], [103.630, 1.205],
].map(toXY);
function inWaters([x, y]) {
  let inside = false;
  for (let i = 0, j = WATERS.length - 1; i < WATERS.length; j = i++) {
    const [xi, yi] = WATERS[i], [xj, yj] = WATERS[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// rings of sea from the shore (each ring is 250 m)
const MAX_RING = 12;
const ring = new Int8Array(NHEX).fill(-1);
{
  let frontier = [];
  for (let h = 0; h < NHEX; h++) if (isLand[h]) { ring[h] = 0; frontier.push(h); }
  for (let d = 1; d <= MAX_RING; d++) {
    const next = [];
    for (const h of frontier) for (const n of hexNeighbours(h)) if (ring[n] < 0) { ring[n] = d; next.push(n); }
    frontier = next;
  }
}

// nature reserves and catchments are protected from development
const RESERVES = [
  { c: [103.7765, 1.3545], r: 900 }, // Bukit Timah Nature Reserve
  { c: [103.7290, 1.4465], r: 800 }, // Sungei Buloh Wetland Reserve
  { c: [103.8015, 1.2665], r: 250 }, // Labrador Nature Reserve
  { c: [103.9900, 1.4090], r: 450 }, // Chek Jawa, Pulau Ubin
].map((z) => ({ c: toXY(z.c), r: z.r }));

const cells = [];
for (let h = 0; h < NHEX; h++) {
  const [x, y] = hexCenter(h);
  if (!isLand[h]) {
    if (ring[h] < 1 || !inWaters([x, y])) continue;
  }
  const col = Math.floor(h / ROWS), row = h % ROWS;
  const sz = hexSz[h];
  let lu = -1;
  if (isLand[h]) {
    let bi = LUI.reserve, bw = -1;
    for (let k = 0; k < K; k++) if (luW[h * K + k] > bw) { bw = luW[h * K + k]; bi = k; }
    lu = bi;
    // residential: landed, HDB or condo from floor area and the subzone's dwelling mix
    if (lu === LUI.hdb) {
      let landed = 0, other = 0;
      for (let s = 0; s < 400; s++) { const pc = pieces.get(h * 400 + s); if (pc) { landed += pc.landedCap; other += pc.cap; } }
      const d = sz >= 0 ? census[SZ[sz].name]?.dwelling : null;
      const hdbShare = d ? (d[0] + d[1] + d[2]) / Math.max(1, d[0] + d[1] + d[2] + d[3]) : 1;
      lu = landed > other ? LUI.landed : hdbShare >= 0.5 ? LUI.hdb : LUI.condo;
    }
    if (lu === LUI.port && sz >= 0 && AIRPORT_PA.has(SZ[sz].pa)) lu = LUI.airport;
  }
  let prot = 0;
  if (sz >= 0 && SZ[sz].pa === 'CENTRAL WATER CATCHMENT' && (lu === LUI.open || lu === LUI.water || lu === LUI.park || lu === LUI.reserve)) prot = 1;
  for (const z of RESERVES) if (Math.hypot(x - z.c[0], y - z.c[1]) < z.r && isLand[h]) prot = 1;
  const c = sz >= 0 ? census[SZ[sz].name] : null;
  const share = (arr, n) => (arr && arr.reduce((a, b) => a + b, 0) > 0 ? arr.map((v) => Math.round((100 * v) / arr.reduce((a, b) => a + b, 0))) : new Array(n).fill(0));
  const age = [0, 1, 2, 3].map((b) => Math.round(hexAge[h * 4 + b]));
  cells.push({
    h, col, row, land: isLand[h], lu, ring: isLand[h] ? 0 : ring[h], sz, prot,
    pop: age.reduce((a, b) => a + b, 0), age,
    eth: share(c?.eth, 4), house: share(c?.dwelling, 5),
    gpr: hexGprN[h] ? Math.round((10 * hexGpr[h]) / hexGprN[h]) : 0,
    jobs: hexJobs[h], amen: hexAmen[h],
  });
}
// jobs are relative weights from floor area; scale to ~3.9 million jobs (modelled total, incl. non-residents)
const TOTAL_JOBS = 3_900_000;
const jw = cells.reduce((s, c) => s + c.jobs, 0);
for (const c of cells) c.jobs = Math.round((c.jobs / jw) * TOTAL_JOBS);

const landCells = cells.filter((c) => c.land);
const popSum = cells.reduce((s, c) => s + c.pop, 0);
const hexArea = (3 * Math.sqrt(3) / 2) * R * R;
log('cells', cells.length, 'land', landCells.length, 'sea', cells.length - landCells.length);
log('land area km²', ((landCells.length * hexArea) / 1e6).toFixed(1), 'residents placed', popSum);

// ---------------------------------------------------------------- write (columnar)
const usedSz = [...new Set(cells.map((c) => c.sz).filter((s) => s >= 0))].sort((a, b) => a - b);
const szIdx = new Map(usedSz.map((s, i) => [s, i]));
const col = (f) => cells.map(f);
const out = {
  meta: {
    source: 'URA Master Plan 2019 Land Use; Census of Population 2020 (subzones); SingStat residents by planning region and age, end-June 2026',
    grid: { lng0: LNG0, lat0: LAT0, kx: KX, ky: KY, r: R, cols: COLS, rows: ROWS },
    lu: LU,
    subzones: usedSz.map((s) => ({ name: SZ[s].name, pa: SZ[s].pa, region: SZ[s].region })),
    residents2026: residents2026,
    age2026: nationalAge,
    female2026: nationalFemale,
    totalJobs: TOTAL_JOBS,
    stations: [...stationHex].map(([name, h]) => ({ name, cell: cells.findIndex((c) => c.h === h) })).filter((s) => s.cell >= 0),
  },
  col: col((c) => c.col),
  row: col((c) => c.row),
  lu: col((c) => c.lu),
  ring: col((c) => c.ring),
  sz: col((c) => (c.sz >= 0 ? szIdx.get(c.sz) : -1)),
  prot: col((c) => c.prot),
  pop: col((c) => c.pop),
  age: col((c) => c.age),
  eth: col((c) => c.eth),
  house: col((c) => c.house),
  gpr: col((c) => c.gpr),
  jobs: col((c) => c.jobs),
  amen: col((c) => c.amen),
};
fs.writeFileSync(path.join(OUT, 'planner.json'), JSON.stringify(out));
log('wrote planner.json', (fs.statSync(path.join(OUT, 'planner.json')).size / 1e6).toFixed(2), 'MB');
