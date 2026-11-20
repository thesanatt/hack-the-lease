# Quorum engine contracts

Every builder codes against this file. Do not change an interface here without telling the integrator.
All engine files are plain ES modules (no TypeScript, no runtime dependencies) so they run in Node 22
(`node --test test/`) and in the browser (imported by `web/`). Money is dollars per month unless noted.
Times inside the engine are seconds after midnight of the service day; routines use "HH:MM".

## Product

Quorum helps students choose where to live from the week they actually live.
- **Me** mode (one student): run their real week through every candidate home on the real TheRide and U-M
  timetables, learn what their time and room features are worth from about six pairwise picks, then rank
  homes by probability of being best across the fall weeks they might have.
- **Group** mode (a friend group renting one house): each member's real week and private rent cap, then the
  house, the room assignment and an envy-free maximin rent split, with an envy matrix as the certificate.
- **Operator** view: the same engine over a synthetic population, labeled synthetic: per-room fair rents for
  irregular houses, a renovation lever, and where each kind of student week fits.

## Existing modules (done; read them)

- `graph.js`  Streets: `nearest(lat, lon, mode)`, `dijkstra(source, mode, maxDist)`, `path(parent, node)`.
- `transit.js` Timetable: CSA `forward(day, sources)`, `backward(day, sinks)`, leg reconstruction.
- `plan.js`   Planner: `addPoint(id, lat, lon)`, `walkSec(a,b)`, `bikeSec(a,b)`,
  `arriveBy(day, placeId, deadlineS, homeIds)` and `leaveAt(day, placeId, tS, homeIds)` return
  `Map homeId -> {walk, bike, transit}` where each is `{depart, arrive, sec}` or null (one scan for all homes),
  `legs(day, fromId, toId, departS)` returns `{depart, arrive, legs:[{type: walk|wait|ride|transfer, dep, arr, sec, route?, headsign?, color?, fromName?, toName?}]}`,
  `pathCoords(fromId, toId, mode)` returns `[[lon,lat],...]`.
- `load.js`   `loadAll(get)` returns `{meta, streets, tt, planner, places}`. `node-load.js` gives `nodeGetter()`.
- `model.js`  the shared utility model: `PARAMS`, `PARAM_INFO`, `samplePrior(r)`, `travelFeatures(week)`,
  `roomFeatures(room)`, `roomValue(theta, room)`, `travelCost(theta, travel)`, `utility(theta, option)`, `phi(option)`.
- `rng.js`    `rng(seed)` returns a function with `.normal()`, `.int(n)`, `.pick(arr)`.

Day ids: `mon tue wed thu fri sat sun`. Modeled week: Mon Nov 30 to Sun Dec 6 2026 (fall term).

## Data files (web/public/data/)

`places.json`: `[{id, label, area, kind, lat, lon, source}]` real places from OSM.

`homes.json` (SYNTHETIC, labeled):
```
{ "label": "...", "homes": [
  { "id": "h1", "name": "Hill St house", "area": "South Central", "kind": "house" | "apartment",
    "lat": 42.27, "lon": -83.74, "rent": 4250, "utilities": 260,
    "rooms": [ { "id": "h1r1", "label": "Front room", "sqft": 150, "bath": "shared"|"half"|"private",
                 "light": 0|1|2, "floor": "basement"|"1"|"2"|"attic", "asking": 850 } ] } ] }
```
`rent` is the whole-house monthly rent; `asking` is the operator's per-room price used in Me mode.

`personas.json` (FICTIONAL, labeled):
```
[ { "id": "maya", "name": "Maya", "program": "Nursing", "color": "#hex",
    "cap": 900,                      // private monthly rent cap
    "modes": { "bike": true, "maxWalkMin": 25, "lateHour": "22:00", "maxLateWalkMin": 12 },
    "theta": { "vTime": .., "vDark": .., "vStrand": .., "wBath": .., "wSize": .., "wLight": .. },  // used only to auto-answer demo picks and for the recovery test
    "week": [ { "id": "e1", "label": "Clinical", "days": ["tue","thu"], "place": "uh",
                "start": "06:30", "end": "15:00",
                "p": 1,                                   // chance this entry happens next fall
                "alt": [ { "place": "nursing", "p": 0.3 } ] } ] } ]
```

## week.js (owner: week builder)

```
evaluateWeek(planner, routine, homeIds, opts) -> Map homeId -> WeekResult
  routine: { week: [...entries as above, already resolved: no p/alt], modes }
  opts: { date: "2026-12-01" (for darkness), homeBreakMin: 150 }
WeekResult = { homeId, weeklyMin, walkMin, bikeMin, rideMin, waitMin, darkWalkMin,
               stranded: [ {day, label, time, needed, bestOption} ],
               trips: [ {day, kind: "arriveBy"|"leaveAt", place, label, time, mode, depart, arrive, sec, darkMin, stranded} ] }
sampleWeeks(routine, k, seed) -> [resolvedRoutine]   // draws p and alt for each entry
dusk(dateStr), dawn(dateStr) -> seconds (civil twilight, Ann Arbor), from NOAA solar equations (solar.js)
```
Trips per day: home to the first entry (arrive by start), last entry to home (leave at end), and a
home break between entries when the gap is at least homeBreakMin and a round trip plus 30 minutes fits.
Mode choice per trip: the fastest allowed of walk, bike (if modes.bike), transit. Walking legs longer than
maxWalkMin are not allowed; after lateHour the cap is maxLateWalkMin. A trip with no allowed option is
stranded: it still counts the fastest disallowed option's minutes and is listed in `stranded`.
Dark minutes: walking or biking minutes outside civil daylight on opts.date.
One CSA scan per distinct (day, place, time, direction) serves all homes; cache scans across calls.

## prefs.js (owner: prefs builder)

```
createPosterior({ n = 4000, seed = 7 }) -> Posterior     // particles from model.samplePrior
update(post, optA, optB, choseA)                         // option = {rent, travel, room}; logit, tau = 25 $/month
nextPair(post, candidates)  -> [i, j]                    // max expected information gain (BALD) over candidate option pairs
summary(post) -> { [param]: { mean, lo, hi } }           // 80% interval, weighted
draws(post, k, seed) -> [theta]                          // weighted resample
recoveryTest({ trials, picks, seed }) -> { coverage, medianIntervalWidth, picksNeeded, perTrial: [...] }
```
Particle filter with systematic resampling plus log-space jitter when effective sample size < n/2.

## fair.js (owner: fair builder)

```
solveHouse({ rent, rooms, members: [{ id, values: number[] (per room), cap: number|null, commute: number }] })
 -> { feasible, assignment: [roomIndex per member], prices: [per room], utilities: [per member],
      envy: number[][]  (envy[i][j] = (v_i(own) - p_own) - (v_i(room of j) - p_j); all >= -1e-6 means envy-free),
      minUtility, capRelaxation: { total, byMember: [...] } | null }
privateGap(problem, memberIndex) -> dollars that member's cap must rise for the house to become feasible (or 0)
rankHouses(problems) -> [{ index, feasible, minUtility, ... }]
```
Method: enumerate assignments (n <= 6), maximin LP (maximize t; u_i >= t; envy-free; sum p = rent; p_own(i) <= cap_i),
own dense simplex in simplex.js (no dependencies), slack LP when caps make it infeasible. If rooms > members,
unassigned rooms are priced at their `asking` rent and the rest of the rent is split. Utilities include `-commute`.

## web/ (owners: ui-shell builder and ui-views builder)

Vite + React 18, plain JavaScript, MapLibre GL JS. `vite.config.js` uses `base: './'` and
`server.fs.allow: ['..']` so `web/src` can import `../../engine/*.js`. Everything works offline: fonts are
bundled with @fontsource packages, the map uses only our GeoJSON (no remote tiles or glyphs; use circle and
line layers, and HTML markers for labels).

Engine access goes through one adapter, `web/src/engine/index.js` (ui-shell owns it):
```
const mods = import.meta.glob('../../../engine/*.js')   // never fails for files that do not exist yet
export async function createEngine() -> api
api = { data: { places, homes, personas, meta, evidence: {recovery?, router?}, operator? },
        planner, has(name) -> bool, mod(name) -> module or null,
        weekFor(routine, homeIds, opts) -> Map (week.js) }
```
Views must render a calm "not built yet" note when `api.has('fair')` etc. is false, never crash.
Nobody in web/ creates or edits files under engine/.

Files: ui-shell owns `web/package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`,
`src/styles/*`, `src/components/*`, `src/engine/*`, `src/views/MeView.jsx` (+ `src/views/me/*`).
ui-views owns `src/views/GroupView.jsx`, `src/views/OperatorView.jsx`, `src/views/EvidenceView.jsx`
(+ `src/views/group/*`, `src/views/operator/*`, `src/views/evidence/*`). Every view is
`export default function XView({ api })`. App.jsx renders a left rail (Me, Group, Operator, Evidence),
a top bar with the SAMPLE DATA label, and a footer with attribution:
"Transit scheduling, geographic, and real-time data provided by permission of AAATA/TheRide" ·
"U-M bus schedules: U-M Logistics, Transportation and Parking" · "Map data (c) OpenStreetMap contributors, ODbL".

Design tokens in `src/styles/tokens.css` (ui-shell writes them; ui-views uses only these names):
`--paper --paper-2 --ink --ink-2 --muted --line --accent --accent-ink --good --bad --warn --dark-walk`
`--font-display --font-body --font-mono --r (radius) --s1..--s6 (spacing)`. Shared components ui-views may
import from `src/components/`: `Panel`, `Stat`, `Pill`, `Button`, `WeekStrip`, `MapView`, `Matrix` (ui-shell
documents their props at the top of each file). Look: a printed transit timetable and a well-set newspaper
table, warm paper background, ink text, route colors from the GTFS feed. Not allowed: purple or indigo
gradients, gradient text, glassmorphism, neon, emoji icons, sparkle icons, a centered hero with two buttons
and three cards. Respect prefers-reduced-motion. Copy rules: ASCII only, no em or en dashes, no hype words.

## decide.js and operator.js (owner: decide builder)

```
meRank({ homes, weeksByScenario: [Map homeId->WeekResult], thetas: [theta] }) ->
  [{ homeId, roomId, pBest, meanU, lo, hi }]   (best room per home at its asking price; P(best) over thetas x scenarios)
breakEven(homeA, homeB, ...) -> { param: "vTime", value }   // where U_A = U_B along vTime, others at posterior mean
groupRank({ homes, members: [{ theta, cap, weekByHome: Map }] }) -> per house: fair.solveHouse result + rank
roomPricing({ home, groups, renovation? }) -> per room: fair rent distribution (p10, p50, p90), share of groups choosing the house
demandMap({ homes, population }) -> per home: top3Share, archetypes it wins, fitPremium
makePopulation({ n, seed }) -> synthetic students from archetypes (labeled SYNTHETIC)
```
