// Builds the past-election data used by the comparison views (GE2006-GE2025).
// Run after build.mjs: node pipeline/history.mjs   (inputs in pipeline/raw and public/data)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as polyclip from 'polyclip-ts';
import { topology } from 'topojson-server';
import { feature, merge, quantize } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import area from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(DIR, 'raw');
const OUT = path.join(DIR, '..', 'public', 'data');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const log = (...a) => console.log('[history]', ...a);

const YEARS = [2006, 2011, 2015, 2020, 2025];
const POLLING_DAY = { 2006: '6 May 2006', 2011: '7 May 2011', 2015: '11 September 2015', 2020: '10 July 2020', 2025: '3 May 2025' };
/** official totals, used as a check */
const SEATS = { 2006: 84, 2011: 87, 2015: 89, 2020: 93, 2025: 97 };

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
const num = (s) => (s === undefined || s === '-' || s === '' || s === 'na' ? 0 : Number(String(s).replace(/,/g, '')));
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z]/g, '');
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(\w)/g, (m) => m.toUpperCase());
const partyOf = (p) => (p === 'Independent' || p === 'INDP' ? 'IND' : p);
const round4 = (v) => Math.round(v * 10000) / 10000;

const resultRows = readCsv('results.csv');
const electorRows = readCsv('electors.csv');
const ge2025 = readJSON(path.join(OUT, 'ge2025.json'));
const blockTopo = readJSON(path.join(OUT, 'blocks.topo.json'));
const blockFc = feature(blockTopo, blockTopo.objects.blocks);
const blocks = readJSON(path.join(OUT, 'blocks.json'));
// the land covered by the building blocks: past boundaries are clipped to it so they line up with the map
// (outer rings only: slivers between blocks would otherwise become thousands of tiny holes)
const land = merge(blockTopo, blockTopo.objects.blocks.geometries).coordinates
  .map((p) => [p[0]]).filter((p) => area({ type: 'Polygon', coordinates: p }) > 50000);

/** Constituencies with official results for one year (GE2025 comes from ge2025.json, which includes the walkover). */
function constituenciesOf(year, edFeatures) {
  if (year === 2025) {
    const byKey = new Map(ge2025.constituencies.map((c) => [norm(c.key), c]));
    return edFeatures.map((f) => {
      const c = byKey.get(norm(f.properties.ED_DESC));
      if (!c) throw new Error(`2025: no result for ${f.properties.ED_DESC}`);
      return { ...c, key: undefined };
    });
  }
  const rows = resultRows.filter((r) => r.year === String(year));
  const elec = Object.fromEntries(electorRows.filter((r) => r.year === String(year)).map((r) => [norm(r.constituency), r]));
  const ids = new Set();
  return edFeatures.map((f) => {
    const raw = f.properties.ED_DESC.trim();
    const k = norm(raw);
    const res = rows.filter((r) => norm(r.constituency) === k);
    if (!res.length) throw new Error(`${year}: no result for ${raw}`);
    const er = elec[k];
    if (!er) throw new Error(`${year}: no electors for ${raw}`);
    const walkover = res.length === 1 && res[0].vote_count === 'na';
    const valid = res.reduce((s, r) => s + num(r.vote_count), 0);
    const electors = num(er.no_of_registered_electors);
    const type = res[0].constituency_type === 'GRC' ? 'GRC' : 'SMC';
    const result = res.map((r) => ({
      party: partyOf(r.party),
      votes: num(r.vote_count),
      share: walkover ? 1 : round4(num(r.vote_count) / valid),
      candidates: r.candidates.split('|').map((s) => s.trim()),
    })).sort((a, b) => b.votes - a.votes);
    let id = f.properties.ED_CODE?.trim() || k.slice(0, 3);
    while (ids.has(id)) id += '_';
    ids.add(id);
    return {
      id,
      name: titleCase(raw.replace(/\s*-\s*/g, '-')),
      type,
      seats: type === 'SMC' ? 1 : result[0].candidates.length,
      electors,
      walkover,
      turnout: walkover ? null : round4((valid + num(er.no_of_rejected_votes)) / electors),
      result,
    };
  });
}

const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function bboxOf(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys(g)) for (const [x, y] of p[0]) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}
const bboxHit = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Share of each block's area in each of this year's constituencies (slivers under 2% dropped). */
function blockFractions(year, edFeatures) {
  if (year === 2025) {
    const idx = new Map(edFeatures.map((f, i) => [ge2025.constituencies.find((c) => norm(c.key) === norm(f.properties.ED_DESC)).id, i]));
    return blocks.map((b) => idx.get(b.ed));
  }
  const eds = edFeatures.map((f) => ({ f, b: bboxOf(f.geometry), p: polys(f.geometry) }));
  return blockFc.features.map((bf, i) => {
    const bb = bboxOf(bf.geometry);
    const hits = [];
    eds.forEach((ed, j) => {
      if (!bboxHit(bb, ed.b)) return;
      let inter;
      try { inter = polyclip.intersection(polys(bf.geometry), ed.p); } catch { return; }
      if (!inter.length) return;
      const a = area({ type: 'MultiPolygon', coordinates: inter });
      if (a > 0) hits.push([j, a]);
    });
    const tot = hits.reduce((s, h) => s + h[1], 0);
    let kept = hits.filter((h) => h[1] / tot >= 0.02);
    if (!kept.length) {
      // offshore or reclaimed since: nearest constituency by centroid
      const c = blocks[i].c;
      let best = 0, bd = Infinity;
      eds.forEach((ed, j) => {
        if (booleanPointInPolygon(c, ed.f)) { best = j; bd = -1; return; }
        const d = Math.hypot(c[0] - (ed.b[0] + ed.b[2]) / 2, c[1] - (ed.b[1] + ed.b[3]) / 2);
        if (bd >= 0 && d < bd) { bd = d; best = j; }
      });
      return best;
    }
    if (kept.length === 1) return kept[0][0];
    const kt = kept.reduce((s, h) => s + h[1], 0);
    kept = kept.sort((a, b) => b[1] - a[1]).map(([j, a]) => [j, Math.round((a / kt) * 1000) / 1000]);
    // make the rounded shares add up to exactly 1
    kept[0][1] = Math.round((1 - kept.slice(1).reduce((s, h) => s + h[1], 0)) * 1000) / 1000;
    return kept;
  });
}

const years = [];
const geo = {};
let ok = true;
for (const year of YEARS) {
  const edFeatures = readJSON(path.join(RAW, `ed${year}.geojson`)).features;
  const constituencies = constituenciesOf(year, edFeatures);
  const seats = constituencies.reduce((s, c) => s + c.seats, 0);
  if (seats !== SEATS[year]) { ok = false; log('SEAT MISMATCH', year, seats, SEATS[year]); }
  // national performance: share of all valid votes cast (contested seats only)
  const parties = {};
  let valid = 0;
  for (const c of constituencies) {
    if (!c.walkover) for (const r of c.result) {
      const p = (parties[r.party] ||= { votes: 0, share: 0, seats: 0, contested: 0 });
      p.votes += r.votes; p.contested++; valid += r.votes;
    }
    const w = (parties[c.result[0].party] ||= { votes: 0, share: 0, seats: 0, contested: 0 });
    w.seats += c.seats;
  }
  for (const p of Object.values(parties)) p.share = round4(p.votes / valid);
  const frac = blockFractions(year, edFeatures);
  for (const f of frac) if (Array.isArray(f) && Math.abs(f.reduce((s, h) => s + h[1], 0) - 1) > 1e-6) { ok = false; log('FRACTION SUM', year, f); }
  const totalElectors = constituencies.reduce((s, c) => s + c.electors, 0);
  years.push({ year, date: POLLING_DAY[year], totalElectors, seats, valid, constituencies, parties, frac });
  geo[`y${year}`] = { type: 'FeatureCollection', features: edFeatures.map((f, i) => {
    let coordinates = polys(f.geometry);
    try {
      // drop islets under 5 ha: they would add thousands of tiny shapes to the file
      const clipped = polyclip.intersection(coordinates, land).filter((p) => area({ type: 'Polygon', coordinates: p }) > 50000);
      if (clipped.length) coordinates = clipped;
    } catch { /* keep the official shape */ }
    return { type: 'Feature', properties: { i }, geometry: { type: 'MultiPolygon', coordinates } };
  }) };
  log(year, constituencies.length, 'constituencies', seats, 'seats', totalElectors, 'electors', 'walkovers', constituencies.filter((c) => c.walkover).length,
    'split blocks', frac.filter(Array.isArray).length, 'PAP', parties.PAP.share);
}

let topo = topology(geo, 1e4);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.05));
// simplifying drops the quantisation; put it back (~1 m precision, delta-encoded) to keep the file small
topo = quantize(topo, 1e5);
fs.writeFileSync(path.join(OUT, 'history.topo.json'), JSON.stringify(topo));
fs.writeFileSync(path.join(OUT, 'history.json'), JSON.stringify({ source: 'Elections Department (data.gov.sg): Electoral Boundary 2006-2025, GE results by candidate, registered electors', years }));
for (const f of ['history.json', 'history.topo.json']) log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), 'KB');
log(ok ? 'ALL CHECKS PASSED' : 'CHECKS FAILED');
if (!ok) process.exit(1);
