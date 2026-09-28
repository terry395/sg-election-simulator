# GE2030 Simulator — Singapore

An interactive web app for political enthusiasts: redraw Singapore's electoral boundaries, decide who contests each seat, set national / party / demographic / constituency swings, and play out a simulated election night.

**Live:** https://terry395.github.io/sg-election-simulator/ · **New to it?** Read the [beginner guide](https://terry395.github.io/sg-election-simulator/guide.html). It covers every step with screenshots and explains election terms in plain English.

## Features

1. **Draw boundaries**: start from the GE2025 map or a blank map. Paint, fill, lasso or erase ~700 building blocks (about polling-district size) into SMCs and GRCs of 3–6 MPs. Stats update live: electors, electors per MP, deviation from the quota, demographics, and the notional GE2025 result of the new shape. Rule checks cover unassigned areas, the ±30% quota, at least 8 SMCs, GRC size and contiguity. Map lenses show elector quota, GE2025 PAP vote, age, ethnicity, housing and density. You can toggle 2025 register or 2030 projected electors and show the GE2025 lines as an overlay.
2. **Contests**: set the party line-up per seat. Multi-cornered fights and walkovers are allowed. You can also:
   - add anchor-minister or star-candidate bonuses
   - adjust party strength
   - add your own party
3. **Swings & forecast**:
   - swings: national, per party, demographic (age / ethnicity / housing), per constituency, and turnout
   - preset scenarios
   - live projected Parliament and a closest-seats table
   - 2,000-run Monte Carlo in a Web Worker: majority and two-thirds probabilities, seat ranges and per-seat win probabilities
4. **Election night**: polls close at 8pm, then sample counts arrive (±4%). Declarations follow through the night, smaller SMCs first and big GRCs last, with recounts in close seats. The map fills in live alongside the seat tally, majority call, gains, popular vote vs GE2025 and NCMP allocation.

Maps, contests and swings autosave locally and can be shared as a link or exported/imported as JSON.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # model + data tests (incl. "GE2025 map with zero swing reproduces GE2025")
npm run build      # static site in dist/ — deploy to Netlify, Vercel, GitHub Pages...
```

## Beginner guide

`guide.html` is a standalone page (a second Vite entry) with screenshots in `public/guide/`. To refresh the screenshots after UI changes, start `npm run dev` (port 5317, or set `GUIDE_URL`) and run `npm run guide:shots`. It drives the app in headless Chromium (`npx playwright install chromium` once) using deterministic seeds, so the numbers quoted in the guide stay correct.

## Data pipeline

The processed data ships in `public/data/`. To rebuild it from source:

```bash
npm run fetch-data   # downloads ELD / URA / SingStat datasets from data.gov.sg into pipeline/raw (~180 MB)
npm run data         # builds public/data/*.json
```

How the building blocks are made (`pipeline/build.mjs`):
1. URA Master Plan 2019 subzones are intersected with the ELD 2025 electoral boundaries.
2. Census 2020 subzone residents aged 21+ are placed on residential land-use parcels, weighted by floor area (area × gross plot ratio). Landed residents go to landed parcels.
3. Dense pieces are split into ~5,000-elector cells (weighted k-means + Voronoi); slivers are merged.
4. Electors are scaled so every GE2025 constituency matches the official register exactly (2,758,846 electors, 97 seats).
5. Each block's GE2025 vote is its constituency result with a small demographic tilt, re-centred to reproduce the real result exactly.
6. The 2030 projection adds ~4% growth, steered towards residential capacity not yet occupied (new BTO estates).

Sources: Elections Department, Urban Redevelopment Authority, Singapore Department of Statistics (via data.gov.sg, Singapore Open Data Licence). Basemap © OpenFreeMap / OpenStreetMap contributors.

Block-level figures are modelled estimates. This is an unofficial fan project, for entertainment and analysis.
