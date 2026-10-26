# GE2030 Simulator — Singapore

An interactive web app for political enthusiasts: redraw Singapore's electoral boundaries, decide who contests each seat, set national / party / demographic / constituency swings, and play out a simulated election night. Compare your map and your results with every general election from GE2006 to GE2025.

> **Built entirely with [Claude Code](https://claude.com/claude-code).** Every part of this project was written by Claude Code, Anthropic's AI coding agent: the app, the data pipeline, the tests, the beginner guide and its screenshots, and this README. See [How it was built](#how-it-was-built).

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
5. **Compare with past elections** (GE2006, GE2011, GE2015, GE2020 and GE2025, the elections with official boundary maps):
   - **Boundaries:** in the Draw step, a swipe divider on the map shows a past election's real boundaries on the left and your map on the right, with a year slider. Alongside: constituencies, SMCs and GRCs by size, MPs, electors and electors per MP then and now; a similarity score; which of your seats are the same, redrawn or new; what happened to each old constituency (kept, redrawn, merged or split); and a chart of SMC and GRC seats over time. Each of your seats shows what the area was in that year, how it voted, and its history back to 2006.
   - **Results:** at the end of election night, the same swipe shows that year's winners against your results. You also get parliament charts side by side, every party's seats and vote share then and now, opposition seats, turnout, walkovers and closest seats, trend charts of the PAP vote and opposition MPs, and a table of your seats against the past election on the same boundaries (estimated), with swings and seats that flip.

- **Election report:** when the count ends, an in-app report explains the night in plain, neutral English. It covers the boundary changes (unchanged / redrawn / new seats, voters moved, seat sizes, and who would have won on 2025 votes with the new lines), the contests (fights, party performance where they stood, leaders, line-up edits) and the swings (each setting in words, plus every seat's change split into "your settings" and "random surprises"). It then gives the final results (gains, closest seats, NCMPs, sample-count accuracy, rough tipping points), key points and a filterable table of every seat.
- **Mock EBRC report:** in the Draw step, "Generate EBRC report" writes a view-only mock of the Electoral Boundaries Review Committee's report for your map. It is laid out like the real White Paper, with a covering letter, numbered paragraphs, terms of reference, elector numbers, recommendations by region naming the neighbourhoods that move, a table of every division (Annex A), black-and-white boundary maps with the 2025 lines dashed (Annex B) and a list of changes to the 2025 divisions (Annex C). Like the real report, it says nothing about parties or votes. Every page is marked as a simulation, not an official document, and it can't be downloaded or printed.
- **Anchor leaders:** pick each party's team leader per seat from the real GE2025 candidates, or type any name. Well-known figures carry a suggested vote effect relative to the 2025 anchor. Suggested leaders never repeat across seats, even after a redraw, and a person picked for two seats is flagged. Switch "Pick anchor leaders" off to choose only the parties in each seat, with no leaders or leader effects.
- **Mock news article:** once every result is in, read a mock *Straits Times* write-up of your night (the count, the campaign and a voter analysis, with a results table and the new Parliament), or switch to a Mandarin *Lianhe Zaobao* version written natively in Chinese. All figures come from the election report. It quotes nobody and is marked as a simulation throughout. Pictures are drawn placeholders unless you choose to generate AI images, which sends generic scene descriptions to Pollinations.ai.
- **Coalition builder:** when no party wins a majority, suggested coalitions and a free-form builder rate each combination (Likely to Unlikely) with a transparent, point-by-point explanation based on ideology, number of partners, minimal-winning arithmetic, clashes in this election, documented party links, parliamentary experience and vote share. The chosen coalition can form the government. A "Hung parliament" forecast preset makes it easy to try.
- **Live parliament chart** that fills seat by seat on election night (NCMP seats shown as rings), also shown in the forecast.
- **Parties:** short, neutral beginner profiles of every party, from the top bar or any party badge.
- **Works on phones:** a full-screen map with a drag-up panel and a bottom tab bar. Drawing tools float on the map, you draw with one finger and pan or zoom with two, and tapping an area shows its details.
- Auto-draw names are always unique real place names, such as compass directions or URA neighbourhoods, never numbers.

## National Planner

A second simulator, opened from the left sidebar (or the header switch on phones). You act as the government and write a national land use and redevelopment plan to 2050.

1. **Population**: the starting point is the latest official data (Population in Brief 2026: 6.21 million people, 3.68 million citizens, 0.55 million PRs, 1.98 million non-residents; resident TFR 0.87). A cohort-component projection to 2050 responds to fertility, immigration, non-resident growth and life expectancy settings, and shows the ageing population, the support ratio and the households that need homes.
2. **Plan & build**: about 14,500 land hexagons (~250 m across, ~5.4 ha) built from URA Master Plan 2019 land use, plus 7,300 near-shore sea hexagons. You plan in five phases (2026–30 … 2046–50) and paint, fill or lasso around 25 land uses onto the map. These include HDB towns at three densities, ECs, condos, landed housing, mixed-use centres, commercial, business parks, industry, data centres, ports and airports, parks, nature reserves, beaches, reservoirs, agri-tech farms, schools, hospitals, eldercare, community buildings, MRT stations and utilities, plus expressways, bridges, causeways and undersea tunnels that link islands across the sea. The rules:
   - Redeveloping a built-up site pays compensation and demolishes the existing homes, so residents must be rehoused.
   - Reclamation must grow out from the coast and stay within an approximate limit of Singapore waters.
   - Deeper water costs more and takes longer to settle.
   - Sand caps how much can be reclaimed per phase.
   - Nature reserves are protected.
   - Every phase has a budget.

   Ready-made big projects include Long Island, the Greater Southern Waterfront with Tuas Port, a Paya Lebar Air Base new town and a healthcare build-out.

   **Auto-plan** builds the whole plan for you instead of painting hexagons by hand. Pick a strategy:
   - Balanced growth
   - Compact city: redevelop older estates at high density around MRT, with no reclamation
   - Expand to the sea: new islands with towns on them, off the coasts you choose, either simply (by coast) or in detail (by planning area). It can also join offshore islands such as Pulau Ubin and Pulau Tekong to the main island with new land
   - City in nature: more parks, lower-rise homes
   - Jobs near homes: regional centres outside the city
   - Ageing-ready: extra hospitals and eldercare where seniors live

   You can then fine-tune where it may build (land bank, open greenery, redevelopment, reclamation), the public housing share, density, spare homes, targets for parks, MRT access, schools, hospitals and jobs, and how much of the budget it may use. Plan all phases, from the current phase on, or one phase, and either add to your plan or replace those phases. Phase by phase, a greedy, deterministic planner does the following:
   1. It simulates the plan so far and works out the shortfalls.
   2. It places hospitals, eldercare and utilities.
   3. It builds housing in clusters that form towns near MRT and existing homes.
   4. It puts schools, community buildings and parks within reach of the new homes.
   5. It adds MRT stations where the most homes are out of reach, then jobs.
   6. It reclaims land for later phases.

   It stops when the phase's budget runs out and reports any needs left unmet. New towns on islands with no link get a causeway, bridge or tunnel. After a run, the map outlines every hexagon it changed in the phase being viewed and fades the rest: yellow is ready by the end of the phase, pink is still being built. A **Where it was built** list groups the changes by area, and clicking one zooms to it. **Fix my plan** uses the same engine to add the cheapest projects that clear the plan checks. Both are undoable.
3. **Indicators** for each phase:
   - homes against households
   - parks per 1,000 residents
   - homes near MRT, parks, schools, healthcare and community facilities
   - school, hospital and utility capacity against demand
   - jobs per worker and jobs outside the Central Region
   - industrial land and spending

   They roll up into a liveability score, alongside a list of plan checks.
4. **Final report**: a mock White Paper of the plan, view-only and marked as a simulation on every page. When the plan joins an offshore island to the main island by new land or a fixed link, that becomes the centrepiece: it is named on the cover and gets a special feature page with a close-up map, the date, length and cost of the link. It covers the population outlook, land budget, housing programme, reclamation, green spaces, transport and services, jobs, financing, risks, a schedule of projects and land use maps for 2026, 2050 and each phase.

The planner is loaded only when it is first opened (a separate code chunk and data file), and it autosaves in the browser.

## How it was built

This project was built entirely by [Claude Code](https://claude.com/claude-code), Anthropic's agentic coding tool, working from plain-English feature requests. Claude Code wrote all of the TypeScript/React app, the redistricting and election models, the Node data pipeline that turns the government datasets into the map, the unit tests, the beginner guide (including the scripts that take its screenshots and record its demo video) and this README. No part of the code was written by hand.

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
npm run data:history # builds the past-election data (GE2006-GE2025) from the boundary, result and elector files
npm run data:planner # builds the National Planner's hexagon grid (public/data/planner.json)
```

How the planner grid is made (`pipeline/planner.mjs`):
1. URA Master Plan 2019 land use parcels are rasterised onto a 50 m lattice, then grouped into flat-top hexagons with rows 250 m apart. Each hexagon gets its main use, plot ratio, floor space and subzone. Residential hexagons are split into HDB, condo or landed using plot ratios and the subzone's Census dwelling mix.
2. Census 2020 subzone residents are spread over residential floor space. Each planning region and age band is then scaled to SingStat's end-June 2026 residents by planning region and age (4,231,520, matching Population in Brief 2026).
3. MRT stations come from LTA's station exits. Jobs are relative weights from floor space by use, calibrated in the app to the labour force.
4. Sea hexagons up to 3 km from shore and inside an approximate limit of Singapore waters (the Johor Strait midline, and short of the Singapore Strait shipping lanes; not a legal boundary) can be reclaimed. Nature reserves and the Central Catchment are protected.

How the building blocks are made (`pipeline/build.mjs`):
1. URA Master Plan 2019 subzones are intersected with the ELD 2025 electoral boundaries.
2. Census 2020 subzone residents aged 21+ are placed on residential land-use parcels, weighted by floor area (area × gross plot ratio). Landed residents go to landed parcels.
3. Dense pieces are split into ~5,000-elector cells (weighted k-means + Voronoi); slivers are merged.
4. Electors are scaled so every GE2025 constituency matches the official register exactly (2,758,846 electors, 97 seats).
5. Each block's GE2025 vote is its constituency result with a small demographic tilt, re-centred to reproduce the real result exactly.
6. The 2030 projection adds ~4% growth, steered towards residential capacity not yet occupied (new BTO estates).

How the past-election data is made (`pipeline/history.mjs`):
1. The ELD boundaries for 2006, 2011, 2015, 2020 and 2025 are clipped to the land covered by the building blocks.
2. Each building block is matched to the past constituencies it lay in, split by area where a past line crosses it.
3. Results and electors for every constituency come from the ELD results and electors tables. Checks confirm the official seat totals (84, 87, 89, 93 and 97 MPs).

Past results "on your boundaries" are estimates: each block takes the result of the constituency it was in that year, weighted by today's electors.

Sources: Elections Department (including Electoral Boundary 2006, 2011, 2015 and 2020), Urban Redevelopment Authority, Singapore Department of Statistics (via data.gov.sg, Singapore Open Data Licence). Basemap © OpenFreeMap / OpenStreetMap contributors.

Block-level figures are modelled estimates. This is an unofficial fan project, for entertainment and analysis.
