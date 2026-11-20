# Quorum

Quorum helps University of Michigan students choose where to live from the week they will actually live.
Built for Hack the Lease, Nov 19 to 20, 2026.

- **Saved, My profile, Browse** (the first three tabs): a student drops a resume or writes a few lines;
  `engine/profile.js` reads their week, limits, budget and values in the browser; Browse labels every home's fit
  and Saved ranks the hearted homes for that week, one sentence and two numbers per home.
- **Me** (now at `#me`, off the top bar): one student's week (classes, lab, job, gym) runs through every candidate home on the real TheRide and
  U-M bus timetables. A few "which week would you rather live?" picks learn what the student's time, dark walks
  and room features are worth. Homes are ranked by expected regret across the fall weeks the student might have.
- **Group**: five friends renting one house. Quorum picks the house, assigns rooms and splits the rent so nobody
  would rather swap, under each member's private cap. An envy matrix proves it.
- **Operator**: for a housing company with irregular houses, a fair rent per room over a synthetic population of
  students, and the dollar effect of a renovation.
- **Evidence**: how each model was checked, with the data sources.

All homes, rooms and rents are SYNTHETIC. All people are FICTIONAL personas. The bus timetables, streets and
places are real. Everything runs offline in the browser, with no API keys and no network calls.

## Run it on a clean laptop, no internet

The built app is in the repo (`web/dist`), so you need only Node 18 or newer, or Python 3.

```
git clone https://github.com/thesanatt/hack-the-lease.git
cd hack-the-lease
node web/dist/serve.mjs
```

Open http://localhost:4173. Wait for the footer to say "Loaded in ... ms".

No Node? Use Python instead:

```
cd web/dist
python -m http.server 4173
```

Then open http://localhost:4173. If port 4173 is busy: `node web/dist/serve.mjs web/dist 4174` and open
http://localhost:4174.

Clone over Wi-Fi beforehand; after that nothing needs the network.

The demo script is `docs/DEMO.md`. The judge Q&A cheat sheet is `docs/QA.md`.

## Check every demo number

```
node scripts/demo_numbers.mjs
```

It loads the engine in Node and prints every number the demo quotes (Jordan's ranking, the value of knowing the
schedule, the break-even, the sensitivity moves, the group split, Priya's cap, the operator house) plus the
validation results, in about 3 seconds. It uses the same seeds as the app, so the numbers match the screen.

## Rebuild the app

Needs internet once for `npm install`.

```
cd web
npm install
npm run build        # writes web/dist, copies serve.mjs into it
node dist/serve.mjs
```

For development with hot reload: `cd web && npm run dev`.

## Run the tests

```
npm test                 # from the repo root: engine tests in test/ (64 pass)
cd web && npm test       # view logic tests (15 pass)
node scripts/check_data.mjs   # data schema, labels, every persona week from every home, group caps
node scripts/smoke.mjs        # four real trips with their legs, and scan timings
```

All of these run in Node 22 with no network.

## Where things are

| Path | What |
|---|---|
| `engine/` | The engine, plain JavaScript modules with no dependencies. `engine/CONTRACTS.md` lists every function. |
| `engine/config.js` | Every constant, with its source. The app's Assumptions drawer edits these live. |
| `web/src/` | The React and MapLibre app. One view per file in `web/src/views/`. |
| `web/public/data/` | Timetables, streets, places, the SYNTHETIC homes, the FICTIONAL personas, the operator data. |
| `web/public/data/evidence/` | Validation results the Evidence view reads: `router.json` (independent reference router), `r5.json` (r5py comparison), `lp.json` (fair-division checks), `recovery.json` (preference learning), `router_labels.json` |
| `docs/SYSTEM_DESIGN.md` | Design of record. Section 10 is the final word; section 8 lists judge attacks; section 9 has references. |
| `docs/DATA.md` | Every data file: source, date, license, and exactly what is synthetic. |
| `docs/VALIDATION.md` | How the router was checked and how to reproduce it. |
| `pipeline/` | Python scripts that built the data files and ran the router checks. |
| `scripts/` | Node scripts: data checks, LP checks, preference recovery, operator data, demo numbers. |

Reproducing the router checks (`python pipeline/validate_router.py`, `python pipeline/r5_validate.py`) needs the
raw GTFS and OSM downloads in `data/raw/`, which are not in the repo, and Java 21 for r5py. See
`docs/VALIDATION.md`.

## Data and attributions

- Transit scheduling, geographic, and real-time data provided by permission of AAATA/TheRide. TheRide GTFS feed
  version S1000304, service Nov 15 2026 to Jan 23 2027, downloaded Nov 19 2026.
- U-M bus schedules: University of Michigan Logistics, Transportation and Parking. U-M Transit GTFS feed version
  S1000100, service Aug 23 2026 to Jan 2 2027, downloaded Nov 19 2026.
- Map data (c) OpenStreetMap contributors, ODbL 1.0. Streets through osmnx, places from the Geofabrik Michigan
  extract, both Nov 19 2026.
- Modeled week: Mon Nov 30 to Sun Dec 6 2026. The December timetable stands in for the whole lease.
- Homes, rooms and rents: SYNTHETIC, made up for the demo at real residential street locations. Not listings,
  not market estimates.
- Personas and the operator population: FICTIONAL and SYNTHETIC.
- Methods are cited in `docs/SYSTEM_DESIGN.md` section 9 and in the Evidence view.

Fonts: IBM Plex Sans, IBM Plex Mono and Source Serif 4, bundled through @fontsource. Libraries: React 18,
MapLibre GL JS 4, Vite 5.
