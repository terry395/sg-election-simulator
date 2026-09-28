// Downloads the raw public datasets used by build.mjs into pipeline/raw.
// Run: node pipeline/fetch.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), 'raw')
fs.mkdirSync(RAW, { recursive: true })

// data.gov.sg dataset ids
const DATASETS = {
  'ed2025.geojson': 'd_7ddf956dfc1c59080bf95bba1c58a5d2', // ELD Electoral Boundary 2025
  'ed2020.geojson': 'd_6077aa5ab73d447b32f451ea224221b6', // ELD Electoral Boundary 2020 (reference)
  'subzone2019.geojson': 'd_8594ae9ff96d0c708bc2af633048edfb', // URA MP2019 Subzone Boundary (No Sea)
  'landuse2019.geojson': 'd_90d86daa5bfaa371668b84fa5f01424f', // URA MP2019 Land Use (~170 MB)
  'age2020.csv': 'd_d95ae740c0f8961a0b10435836660ce0', // Census 2020: subzone x age x sex
  'dwelling2020.csv': 'd_7f243956483d5901f237e6f87b096636', // Census 2020: subzone x dwelling type
  'ethnic2020.csv': 'd_e7ae90176a68945837ad67892b898466', // Census 2020: subzone x ethnic group
  'results.csv': 'd_581a30bee57fa7d8383d6bc94739ad00', // ELD GE results by candidate 1955-2025
  'electors.csv': 'd_fdfb854fcb7428b29734d2e0c0674220', // ELD registered electors & rejected votes
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [file, id] of Object.entries(DATASETS)) {
  const dest = path.join(RAW, file)
  if (fs.existsSync(dest)) { console.log('have', file); continue }
  let url = null
  for (let attempt = 0; attempt < 6 && !url; attempt++) {
    const r = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${id}/poll-download`).then((r) => r.json())
    url = r.data?.url
    if (!url) await sleep(12000) // rate limited
  }
  if (!url) throw new Error(`could not get download url for ${file}`)
  const res = await fetch(url)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log('downloaded', file, fs.statSync(dest).size, 'bytes')
  await sleep(8000)
}
