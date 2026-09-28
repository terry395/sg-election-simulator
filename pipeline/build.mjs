// Builds the static data files used by the app from public government datasets.
// Run: node pipeline/build.mjs   (inputs in pipeline/raw, outputs in public/data)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as polyclip from 'polyclip-ts';
import { Delaunay } from 'd3-delaunay';
import { topology } from 'topojson-server';
import { merge, neighbors, feature } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import area from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(DIR, 'raw');
const OUT = path.join(DIR, '..', 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const log = (...a) => console.log('[pipeline]', ...a);

// ---------------------------------------------------------------- inputs
const edFeatures = readJSON('ed2025.geojson').features;
const szFeatures = readJSON('subzone2019.geojson').features;

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

// Census 2020 by subzone
const census = {};
const subzoneRow = (r) => r.Number && !/Total/.test(r.Number);
for (const r of readCsv('age2020.csv').filter(subzoneRow)) {
  const k = r.Number.toUpperCase();
  const a = (band) => num(r['Total_' + band]);
  const a20 = a('20_24') * 0.8; // ~ aged 21-24
  const young = a20 + a('25_29') + a('30_34');
  const mid = a('35_39') + a('40_44') + a('45_49');
  const older = a('50_54') + a('55_59') + a('60_64');
  const senior = a('65_69') + a('70_74') + a('75_79') + a('80_84') + a('85_89') + a('90andOver');
  census[k] = { total: num(r.Total_Total), adults: young + mid + older + senior, age: [young, mid, older, senior] };
}
for (const r of readCsv('dwelling2020.csv').filter(subzoneRow)) {
  const c = census[r.Number.toUpperCase()];
  c.dwelling = [
    num(r['HDBDwellings_1_and2_RoomFlats1']) + num(r['HDBDwellings_3_RoomFlats']),
    num(r['HDBDwellings_4_RoomFlats']),
    num(r['HDBDwellings_5_RoomandExecutiveFlats']),
    num(r['CondominiumsandOtherApartments']) + num(r['Others']),
    num(r['LandedProperties']),
  ];
}
for (const r of readCsv('ethnic2020.csv').filter(subzoneRow)) {
  census[r.Number.toUpperCase()].eth = [num(r.Chinese_Total), num(r.Malays_Total), num(r.Indians_Total), num(r.Others_Total)];
}

// Official GE2025 results & electors (ELD via data.gov.sg)
const results = readCsv('results.csv').filter((r) => r.year === '2025');
const results2020 = readCsv('results.csv').filter((r) => r.year === '2020');
const electorRows = readCsv('electors.csv').filter((r) => r.year === '2025');
const officialElectors = Object.fromEntries(electorRows.map((r) => [r.constituency.toUpperCase(), num(r.no_of_registered_electors)]));
const rejected = Object.fromEntries(electorRows.map((r) => [r.constituency.toUpperCase(), num(r.no_of_rejected_votes)]));
// Walkover: not in the ELD results tables
officialElectors['MARINE PARADE-BRADDELL HEIGHTS'] = 131820;

// ---------------------------------------------------------------- geometry helpers
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function bboxOf(g) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys(g)) for (const [x, y] of p[0]) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}
const bboxHit = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const m2 = (coordsMulti) => area({ type: 'MultiPolygon', coordinates: coordsMulti });
function ringCentroid(ring) {
  let x = 0, y = 0;
  for (const [a, b] of ring) { x += a; y += b; }
  return [x / ring.length, y / ring.length];
}

// ---------------------------------------------------------------- residential capacity points
// Each residential land-use parcel becomes a point weighted by floor area (area x plot ratio).
log('reading land use (large)...');
const land = readJSON('landuse2019.geojson').features;
const points = [];
for (const f of land) {
  const p = f.properties;
  if (!/RESIDENTIAL/.test(p.LU_DESC)) continue;
  const a = p['SHAPE.AREA'] || 0;
  let gpr = Number(p.GPR);
  const landed = p.GPR === 'LND';
  if (landed) gpr = 0.9;
  else if (!Number.isFinite(gpr)) gpr = 1.6;
  let factor = 1;
  if (p.LU_DESC === 'COMMERCIAL & RESIDENTIAL') factor = 0.5;
  if (p.LU_DESC === 'RESIDENTIAL / INSTITUTION') factor = 0.25;
  const ring = polys(f.geometry)[0][0];
  const cap = a * gpr * factor;
  // large parcels (whole HDB precincts) are sampled on a ~60 m grid so they can be split finely
  if (a > 12000) {
    const b = bboxOf(f.geometry);
    const step = 0.00055;
    const grid = [];
    for (let x = b[0] + step / 2; x < b[2]; x += step)
      for (let y = b[1] + step / 2; y < b[3]; y += step)
        if (booleanPointInPolygon([x, y], f)) grid.push([x, y]);
    if (grid.length > 1) {
      for (const [x, y] of grid) points.push({ x, y, cap: cap / grid.length, landed });
      continue;
    }
  }
  const [x, y] = ringCentroid(ring);
  points.push({ x, y, cap, landed });
}
land.length = 0;
log('residential points', points.length);

// assign points to subzone and ED
const szIndex = szFeatures.map((f) => ({ f, b: bboxOf(f.geometry), name: f.properties.SUBZONE_N }));
const edIndex = edFeatures.map((f) => ({ f, b: bboxOf(f.geometry), name: f.properties.ED_DESC }));
function locate(index, x, y) {
  for (const it of index) if (inBox(it.b, x, y) && booleanPointInPolygon([x, y], it.f)) return it.name;
  return null;
}
for (const p of points) { p.sz = locate(szIndex, p.x, p.y); p.ed = locate(edIndex, p.x, p.y); }
const usable = points.filter((p) => p.sz && p.ed);
log('points located', usable.length, 'of', points.length);

// Distribute each subzone's adults to its points: landed adults over landed parcels, others over the rest.
const bySz = {};
for (const p of usable) (bySz[p.sz] ||= []).push(p);
for (const [sz, pts] of Object.entries(bySz)) {
  const c = census[sz];
  const landedShare = c && c.dwelling ? c.dwelling[4] / Math.max(1, c.total) : 0;
  const adults = c ? c.adults : 0;
  const groups = [pts.filter((p) => p.landed), pts.filter((p) => !p.landed)];
  let targets = [adults * landedShare, adults * (1 - landedShare)];
  if (!groups[0].length) targets = [0, adults];
  if (!groups[1].length) targets = [adults, 0];
  groups.forEach((g, i) => {
    const capSum = g.reduce((s, p) => s + p.cap, 0) || 1;
    for (const p of g) p.census = (targets[i] * p.cap) / capSum;
  });
}
// Blend census (2020 reality) with capacity (captures estates completed since 2020, e.g. Tengah).
const totalCap = usable.reduce((s, p) => s + p.cap, 0);
const totalCensus = usable.reduce((s, p) => s + p.census, 0);
for (const p of usable) {
  const capPop = (p.cap / totalCap) * totalCensus;
  p.pop = 0.75 * p.census + 0.25 * capPop;
  p.gap = Math.max(0, capPop - p.census); // unrealised capacity -> future growth
}
// Calibrate to official 2025 electors per ED
const edSum = {};
for (const p of usable) edSum[p.ed] = (edSum[p.ed] || 0) + p.pop;
for (const p of usable) p.electors = (p.pop * officialElectors[p.ed]) / edSum[p.ed];

// ---------------------------------------------------------------- atoms: subzone ∩ ED
log('intersecting subzones with constituencies...');
let atoms = [];
for (const ed of edIndex) {
  for (const sz of szIndex) {
    if (!bboxHit(ed.b, sz.b)) continue;
    let inter;
    try { inter = polyclip.intersection(polys(ed.f.geometry), polys(sz.f.geometry)); } catch { continue; }
    for (const poly of inter) {
      const a = m2([poly]);
      if (a < 50) continue;
      atoms.push({ ed: ed.name, sz: sz.name, pa: sz.f.properties.PLN_AREA_N, coords: [poly], area: a, bbox: bboxOf({ type: 'Polygon', coordinates: poly }) });
    }
  }
}
log('atoms', atoms.length);
// attach points to atoms
const atomsByKey = {};
for (const a of atoms) (atomsByKey[a.ed + '|' + a.sz] ||= []).push(a);
for (const a of atoms) a.pts = [];
for (const p of usable) {
  const cands = atomsByKey[p.ed + '|' + p.sz] || [];
  let hit = cands.length === 1 ? cands[0] : cands.find((a) => inBox(a.bbox, p.x, p.y) && booleanPointInPolygon([p.x, p.y], { type: 'Polygon', coordinates: a.coords[0] }));
  if (!hit && cands.length) hit = cands.reduce((m, a) => (a.area > m.area ? a : m));
  if (hit) hit.pts.push(p);
}

// ---------------------------------------------------------------- split dense atoms into ~5k-elector cells
const TARGET = 5000;
function kmeans(pts, k) {
  // deterministic weighted k-means (farthest-point init)
  const w = (p) => p.electors;
  let cents = [pts.reduce((m, p) => (w(p) > w(m) ? p : m))].map((p) => [p.x, p.y]);
  while (cents.length < k) {
    let best = null, bd = -1;
    for (const p of pts) {
      const d = Math.min(...cents.map((c) => (c[0] - p.x) ** 2 + (c[1] - p.y) ** 2)) * Math.sqrt(w(p) + 1);
      if (d > bd) { bd = d; best = p; }
    }
    cents.push([best.x, best.y]);
  }
  for (let it = 0; it < 30; it++) {
    const acc = cents.map(() => [0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      cents.forEach((c, i) => { const d = (c[0] - p.x) ** 2 + (c[1] - p.y) ** 2; if (d < bd) { bd = d; bi = i; } });
      acc[bi][0] += p.x * (w(p) + 1e-6); acc[bi][1] += p.y * (w(p) + 1e-6); acc[bi][2] += w(p) + 1e-6;
    }
    cents = cents.map((c, i) => (acc[i][2] ? [acc[i][0] / acc[i][2], acc[i][1] / acc[i][2]] : c));
  }
  return cents;
}
let units = [];
for (const a of atoms) {
  const elec = a.pts.reduce((s, p) => s + p.electors, 0);
  const k = Math.round(elec / TARGET);
  if (k < 2 || a.pts.length < k * 2) { units.push(a); continue; }
  const cents = kmeans(a.pts, k);
  const [x0, y0, x1, y1] = a.bbox;
  const vor = Delaunay.from(cents).voronoi([x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01]);
  const cellPts = cents.map(() => []);
  for (const p of a.pts) {
    let bi = 0, bd = Infinity;
    cents.forEach((c, i) => { const d = (c[0] - p.x) ** 2 + (c[1] - p.y) ** 2; if (d < bd) { bd = d; bi = i; } });
    cellPts[bi].push(p);
  }
  cents.forEach((_, i) => {
    const cell = vor.cellPolygon(i);
    if (!cell) return;
    let inter;
    try { inter = polyclip.intersection(a.coords, [[cell]]); } catch { return; }
    // keep all parts of the cell together; points were assigned by nearest centroid
    if (!inter.length) return;
    units.push({ ...a, coords: inter, area: m2(inter), pts: cellPts[i] });
  });
}
log('units after splitting', units.length);

// ---------------------------------------------------------------- merge slivers / tiny units
units.forEach((u, i) => { u.id = i; u.electors = u.pts.reduce((s, p) => s + p.electors, 0); });
function buildTopo(list) {
  const fc = { type: 'FeatureCollection', features: list.map((u) => ({ type: 'Feature', id: u.id, properties: { id: u.id }, geometry: { type: 'MultiPolygon', coordinates: u.coords } })) };
  return topology({ units: fc }, 1e6);
}
let topo = buildTopo(units);
let nb = neighbors(topo.objects.units.geometries);
// union-find
const parent = units.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const agg = units.map((u) => ({ electors: u.electors, area: u.area }));
const isSmall = (r) => agg[r].area < 40000 || (agg[r].electors < 800 && agg[r].area < 400000);
for (let pass = 0; pass < 4; pass++) {
  const order = units.map((_, i) => i).sort((a, b) => agg[find(a)].area - agg[find(b)].area);
  for (const i of order) {
    const r = find(i);
    if (!isSmall(r)) continue;
    // candidate neighbours in the same ED, prefer same subzone, then most electors
    const cand = new Set();
    for (let j = 0; j < units.length; j++) if (find(j) === r) for (const n of nb[j]) { const rn = find(n); if (rn !== r && units[n].ed === units[i].ed) cand.add(rn); }
    if (!cand.size) continue;
    const best = [...cand].sort((a, b) => (units[b].sz === units[i].sz) - (units[a].sz === units[i].sz) || agg[b].electors - agg[a].electors)[0];
    parent[r] = best;
    agg[best] = { electors: agg[best].electors + agg[r].electors, area: agg[best].area + agg[r].area };
  }
}
// uninhabited pieces of the same subzone & ED (e.g. island clusters) become one block
const emptyByKey = {};
units.forEach((u, i) => {
  const r = find(i);
  if (agg[r].electors < 1) (emptyByKey[u.ed + '|' + u.sz] ||= new Set()).add(r);
});
for (const roots of Object.values(emptyByKey)) {
  const [first, ...rest] = [...roots].map(find);
  for (const r of rest) if (find(r) !== find(first)) parent[find(r)] = find(first);
}
const groups = {};
units.forEach((u, i) => (groups[find(i)] ||= []).push(i));
log('blocks after merging', Object.keys(groups).length);

// ---------------------------------------------------------------- build final blocks
const edMeta = Object.fromEntries(edFeatures.map((f) => [f.properties.ED_DESC, f.properties]));
const blocks = [];
const blockFeatures = [];
for (const members of Object.values(groups)) {
  const geom = merge(topo, members.map((i) => topo.objects.units.geometries[i]));
  const us = members.map((i) => units[i]);
  const pts = us.flatMap((u) => u.pts);
  const main = us.reduce((m, u) => (u.area > m.area ? u : m));
  const elec = pts.reduce((s, p) => s + p.electors, 0);
  // demographics from the subzones weighted by electors
  const szW = {};
  for (const p of pts) szW[p.sz] = (szW[p.sz] || 0) + p.electors;
  if (!pts.length) szW[main.sz] = 1;
  const mix = (key, landedOverride) => {
    let out = null, tot = 0;
    for (const [sz, w] of Object.entries(szW)) {
      const c = census[sz]; if (!c || !c[key]) continue;
      const s = c[key].reduce((a, b) => a + b, 0) || 1;
      out ||= c[key].map(() => 0);
      c[key].forEach((v, i) => (out[i] += (v / s) * w));
      tot += w;
    }
    if (!out) return null;
    out = out.map((v) => v / (tot || 1));
    if (landedOverride !== undefined) {
      // actual landed share from the parcels in this block
      const rest = 1 - out[4];
      out = out.slice(0, 4).map((v) => (rest > 0 ? (v / rest) * (1 - landedOverride) : (1 - landedOverride) / 4)).concat([landedOverride]);
    }
    return out.map((v) => Math.round(v * 1000) / 1000);
  };
  const landedShare = elec > 0 ? pts.filter((p) => p.landed).reduce((s, p) => s + p.electors, 0) / elec : 0;
  const id = blocks.length;
  const [cx, cy] = (() => {
    if (pts.length) { let x = 0, y = 0, w = 0; for (const p of pts) { x += p.x * (p.electors + 1e-6); y += p.y * (p.electors + 1e-6); w += p.electors + 1e-6; } return [x / w, y / w]; }
    return ringCentroid(polys(geom)[0][0]);
  })();
  blocks.push({
    id,
    ed: main.ed,
    sz: main.sz,
    pa: main.pa,
    e25: elec,
    gap: pts.reduce((s, p) => s + p.gap, 0),
    area: Math.round(us.reduce((s, u) => s + u.area, 0)),
    c: [Math.round(cx * 1e5) / 1e5, Math.round(cy * 1e5) / 1e5],
    age: mix('age'),
    eth: mix('eth'),
    house: mix('dwelling', landedShare),
  });
  blockFeatures.push({ type: 'Feature', id, properties: {}, geometry: geom });
}

// integer electors that sum exactly to the official figure per ED (largest remainder)
for (const ed of Object.keys(officialElectors)) {
  const bs = blocks.filter((b) => b.ed === ed);
  const floors = bs.map((b) => Math.floor(b.e25));
  let rem = officialElectors[ed] - floors.reduce((a, b) => a + b, 0);
  const order = bs.map((b, i) => [b.e25 - floors[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rem; k++) floors[order[k % order.length][1]]++;
  bs.forEach((b, i) => (b.e25 = floors[i]));
}

// 2030 projection: national growth continues at 2020->2025 pace (~+4.2%), with the extra
// electors steered towards unrealised residential capacity (new BTO estates).
const total25 = blocks.reduce((s, b) => s + b.e25, 0);
const growth = Math.round(total25 * 0.042);
const gapSum = blocks.reduce((s, b) => s + b.gap, 0);
for (const b of blocks) {
  const organic = b.e25 * 0.012; // ageing-in of existing estates
  const steered = gapSum ? ((growth - total25 * 0.012) * b.gap) / gapSum : 0;
  b.e30 = Math.round(b.e25 + organic + steered);
  delete b.gap;
}

// ---------------------------------------------------------------- baseline vote shares
// Block PAP share = ED result + a modest demographic tilt, re-centred so each ED reproduces its real result.
const partyOf = (r) => (r.party === 'Independent' ? 'IND' : r.party);
const edResults = {};
for (const r of results) {
  const k = r.constituency.toUpperCase();
  (edResults[k] ||= []).push({ party: partyOf(r), votes: num(r.vote_count), share: num(r.vote_percentage), candidates: r.candidates.split('|').map((s) => s.trim()) });
}
const tilt = (b) => {
  const [young, , , senior] = b.age || [0.3, 0.3, 0.2, 0.2];
  const [small, , , condo, landed] = b.house || [0, 0, 0, 0, 0];
  return -0.25 * (young - 0.26) + 0.2 * (senior - 0.2) + 0.08 * (small - 0.25) - 0.04 * (condo - 0.15) + 0.05 * landed;
};
const MPBH_EST = 0.62; // notional PAP share for the walkover (Marine Parade GRC 2020: 57.8%, 2025 national swing ~+4)
for (const ed of Object.keys(officialElectors)) {
  const res = edResults[ed];
  const valid = res ? res.reduce((s, r) => s + r.votes, 0) : 0;
  const papShare = res ? (res.find((r) => r.party === 'PAP')?.votes || 0) / valid : MPBH_EST;
  const bs = blocks.filter((b) => b.ed === ed);
  const tot = bs.reduce((s, b) => s + b.e25, 0);
  const mean = bs.reduce((s, b) => s + tilt(b) * b.e25, 0) / tot;
  for (const b of bs) b.pap = Math.round(Math.min(0.97, Math.max(0.03, papShare + tilt(b) - mean)) * 10000) / 10000;
  // exact re-centring after clamping
  const got = bs.reduce((s, b) => s + b.pap * b.e25, 0) / tot;
  for (const b of bs) b.pap = Math.round((b.pap + papShare - got) * 10000) / 10000;
}

// ---------------------------------------------------------------- constituencies (GE2025)
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(\w)/g, (m) => m.toUpperCase());
const constituencies = edFeatures.map((f) => {
  const name = f.properties.ED_DESC;
  const type = /GRC$/.test(f.properties.ED_DESC_FU) ? 'GRC' : 'SMC';
  const res = edResults[name] || null;
  const seats = type === 'SMC' ? 1 : name === 'MARINE PARADE-BRADDELL HEIGHTS' ? 5 : res.find((r) => r.party === 'PAP').candidates.length;
  const valid = res ? res.reduce((s, r) => s + r.votes, 0) : 0;
  return {
    id: f.properties.NEW_ED || name.slice(0, 3),
    name: titleCase(name),
    key: name,
    type,
    seats,
    electors: officialElectors[name],
    walkover: !res,
    turnout: res ? Math.round(((valid + rejected[name]) / officialElectors[name]) * 10000) / 10000 : null,
    result: res ? res.map((r) => ({ party: r.party, votes: r.votes, share: Math.round((r.votes / valid) * 10000) / 10000, candidates: r.candidates })).sort((a, b) => b.votes - a.votes) : [{ party: 'PAP', votes: 0, share: 1, candidates: ['Seah Kian Peng', 'Muhammad Faishal Ibrahim', 'Tin Pei Ling', 'Goh Pei Ming', 'Diana Pang'] }],
  };
});
const idByKey = Object.fromEntries(constituencies.map((c) => [c.key, c.id]));
for (const b of blocks) b.ed = idByKey[b.ed];

// national GE2025 & GE2020 party performance
const partyVotes = {};
for (const r of results) partyVotes[partyOf(r)] = (partyVotes[partyOf(r)] || 0) + num(r.vote_count);
const allValid = Object.values(partyVotes).reduce((a, b) => a + b, 0);
// party strength: mean share where contested (used to split the opposition vote)
const strength = {};
for (const res of Object.values(edResults)) for (const r of res) (strength[r.party] ||= []).push(r.share);
const partyStats = Object.fromEntries(Object.entries(partyVotes).map(([p, v]) => [p, {
  votes: v,
  national: Math.round((v / allValid) * 10000) / 10000,
  avgContested: Math.round((strength[p].reduce((a, b) => a + b, 0) / strength[p].length) * 10000) / 10000,
  contested: strength[p].length,
}]));
const nat2020 = {};
for (const r of results2020) nat2020[partyOf(r)] = (nat2020[partyOf(r)] || 0) + num(r.vote_count);
const valid2020 = Object.values(nat2020).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- outputs
let blockTopo = topology({ blocks: { type: 'FeatureCollection', features: blockFeatures }, ge2025: { type: 'FeatureCollection', features: edFeatures.map((f) => ({ type: 'Feature', properties: { id: idByKey[f.properties.ED_DESC] }, geometry: f.geometry })) } }, 1e5);
// adjacency (before simplification so shared arcs are exact)
const adj = neighbors(blockTopo.objects.blocks.geometries);
blockTopo = presimplify(blockTopo);
blockTopo = simplify(blockTopo, quantile(blockTopo, 0.35));
for (const b of blocks) b.adj = adj[b.id];

fs.writeFileSync(path.join(OUT, 'blocks.topo.json'), JSON.stringify(blockTopo));
fs.writeFileSync(path.join(OUT, 'blocks.json'), JSON.stringify(blocks));
fs.writeFileSync(path.join(OUT, 'ge2025.json'), JSON.stringify({
  asOf: 'GE2025 (polling day 3 May 2025); electors: Registers of Electors certified for GE2025',
  totalElectors: Object.values(officialElectors).reduce((a, b) => a + b, 0),
  totalElectors2030: blocks.reduce((s, b) => s + b.e30, 0),
  seats: constituencies.reduce((s, c) => s + c.seats, 0),
  constituencies,
  parties: partyStats,
  national2020: Object.fromEntries(Object.entries(nat2020).map(([p, v]) => [p, Math.round((v / valid2020) * 10000) / 10000])),
}));

// ---------------------------------------------------------------- checks
let ok = true;
for (const c of constituencies) {
  const s = blocks.filter((b) => b.ed === c.id).reduce((a, b) => a + b.e25, 0);
  if (s !== c.electors) { ok = false; log('ELECTOR MISMATCH', c.name, s, c.electors); }
  if (c.result && !c.walkover) {
    const bs = blocks.filter((b) => b.ed === c.id);
    const pap = bs.reduce((a, b) => a + b.pap * b.e25, 0) / c.electors;
    const real = c.result.find((r) => r.party === 'PAP').share;
    if (Math.abs(pap - real) > 0.001) { ok = false; log('PAP MISMATCH', c.name, pap, real); }
  }
}
const sizes = blocks.map((b) => b.e25).sort((a, b) => a - b);
log('blocks', blocks.length, 'electors', sizes.reduce((a, b) => a + b, 0), 'median/block', sizes[sizes.length >> 1], 'max', sizes.at(-1), 'zero-elector blocks', sizes.filter((s) => s === 0).length);
log('2030 projected electors', blocks.reduce((s, b) => s + b.e30, 0));
log('seats', constituencies.reduce((s, c) => s + c.seats, 0));
log(ok ? 'ALL CHECKS PASSED' : 'CHECKS FAILED');
for (const f of ['blocks.topo.json', 'blocks.json', 'ge2025.json']) log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), 'KB');
