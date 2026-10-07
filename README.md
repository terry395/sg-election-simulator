# GE2030 Simulator — Singapore

An interactive web app for political enthusiasts: redraw Singapore's electoral boundaries, decide who contests each seat, set national / party / demographic / constituency swings, and play out a simulated election night.

**Live:** https://terry395.github.io/sg-election-simulator/ · **New to it?** Read the [beginner guide](https://terry395.github.io/sg-election-simulator/guide.html). It covers every step with screenshots and explains election terms in plain English.

## Features

1. **Draw boundaries**: start from the GE2025 map or a blank map. Paint, fill, lasso or erase ~700 building blocks (about polling-district size) into SMCs and GRCs of 3–6 MPs. Stats update live: electors, electors per MP, deviation from the quota, demographics, and the notional GE2025 result of the new shape. Rule checks cover unassigned areas, the ±30% quota, at least 8 SMCs, GRC size and contiguity. **Auto-draw** redraws the whole map in seconds with a built-in redistricting algorithm (balanced seeding, region growing and simulated annealing), using one of four methods: EBRC-style minimal changes (with opposition-held seats left untouched, changed only if needed or redrawn freely, and an optional exact mix of SMCs and GRCs by size), fair & compact, a custom SMC/GRC mix such as all-SMCs, or educational gerrymanders (favour PAP, favour opposition, most competitive). Map lenses show elector quota, GE2025 PAP vote, age, ethnicity, housing and density. You can toggle 2025 register or 2030 projected electors and show the GE2025 lines as an overlay.
2. **Contests**: set the party line-up per seat. Multi-cornered fights and walkovers are allowed. You can also:
   - add anchor-minister or star-candidate bonuses
   - adjust party strength
   - add your own party
3. **Swings & forecast**:
   - swings: national, per party, demographic (age / ethnicity / housing), per constituency, and turnout
   - preset scenarios
   - live projected Parliament and a closest-seats table
   - 2,000-run Monte Carlo in a Web Worker: majority and two-thirds probabilities, seat ranges and per-seat win probabilities
4. **Election night**: polls close at 8pm, then sample counts arrive (±4%). Declarations follow through the night, smaller SMCs first and big GRCs last, with recounts in close seats. The map fills in live alongside the seat tally, majority call, gains, popular vote vs GE2025 and NCMP allocation. Occasional news flashes (first result, seats changing hands, photo finishes, majority and supermajority calls, final round-up) appear in the announcements feed and as a ticker over the map.

- **Election report:** when the count ends, an in-app report explains the night in plain, neutral English. It covers the boundary changes (unchanged / redrawn / new seats, voters moved, seat sizes, and who would have won on 2025 votes with the new lines), the contests (fights, party performance where they stood, leaders, line-up edits) and the swings (each setting in words, plus every seat's change split into "your settings" and "random surprises"). It then gives the final results (gains, closest seats, NCMPs, sample-count accuracy, rough tipping points), key points and a filterable table of every seat.
- **Mock EBRC report:** in the Draw step, "Generate EBRC report" writes a view-only mock of the Electoral Boundaries Review Committee's report for your map. It is laid out like the real White Paper, with a covering letter, numbered paragraphs, terms of reference, elector numbers, recommendations by region naming the neighbourhoods that move, a table of every division (Annex A), black-and-white boundary maps with the 2025 lines dashed (Annex B) and a list of changes to the 2025 divisions (Annex C). Like the real report, it says nothing about parties or votes. Every page is marked as a simulation, not an official document, and it can't be downloaded or printed.
- **Anchor leaders:** pick each party's team leader per seat from the real GE2025 candidates, or type any name. Well-known figures carry a suggested vote effect relative to the 2025 anchor. Suggested leaders never repeat across seats, even after a redraw, and a person picked for two seats is flagged. Switch "Pick anchor leaders" off to choose only the parties in each seat, with no leaders or leader effects.
- **Mock news article:** once every result is in, read a mock *Straits Times* write-up of your night (the count, the campaign and a voter analysis, with a results table and the new Parliament), or switch to a Mandarin *Lianhe Zaobao* version written natively in Chinese. All figures come from the election report. It quotes nobody and is marked as a simulation throughout. Pictures are drawn placeholders unless you choose to generate AI images, which sends generic scene descriptions to Pollinations.ai.
- **Coalition builder:** when no party wins a majority, suggested coalitions and a free-form builder rate each combination (Likely to Unlikely) with a transparent, point-by-point explanation based on ideology, number of partners, minimal-winning arithmetic, clashes in this election, documented party links, parliamentary experience and vote share. The chosen coalition can form the government. A "Hung parliament" forecast preset makes it easy to try.
- **Live parliament chart** that fills seat by seat on election night (NCMP seats shown as rings), also shown in the forecast.
- **Parties:** short, neutral beginner profiles of every party, from the top bar or any party badge.
- **Works on phones:** a full-screen map with a drag-up panel and a bottom tab bar. Drawing tools float on the map, you draw with one finger and pan or zoom with two, and tapping an area shows its details.
- Auto-draw names are always unique real place names, such as compass directions or URA neighbourhoods, never numbers.

Maps, contests and swings autosave locally and can be shared as a link or exported/imported as JSON. Every shared link and export carries a disclaimer that it is an individual's scenario, not a poll or official projection, and people opening a shared link see the same notice.

## Disclaimer

This simulator does not represent any real-life polling, survey or official projection. No user data is recorded: nothing you do is sent to a server, and your work is saved only in your own browser. The one exception is optional: if you turn on AI pictures in the mock news article, short generic scene descriptions (never your map or any personal data) are sent to the free image service Pollinations.ai. It is intended purely for entertainment and educational purposes, and is not affiliated with the Elections Department or any political party.

Icons: [Lucide](https://lucide.dev) (ISC licence).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # model + data tests (incl. "GE2025 map with zero swing reproduces GE2025")
npm run build      # static site in dist/ — deploy to Netlify, Vercel, GitHub Pages...
```

## Beginner guide

`guide.html` is a standalone page (a second Vite entry) with screenshots in `public/guide/`. To refresh the screenshots after UI changes, start `npm run dev` (port 5317, or set `GUIDE_URL`) and run `npm run guide:shots`. It drives the app in headless Chromium (`npx playwright install chromium` once) using deterministic seeds, so the numbers quoted in the guide stay correct. `npm run guide:video` re-records the one-minute demo video (`public/guide/demo.webm`) the same way; it uses the GPU and trims the page-load pre-roll with ffmpeg (from PATH, or the copy Playwright installs).

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
