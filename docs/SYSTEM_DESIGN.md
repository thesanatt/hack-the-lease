# Quorum system design

Status: design of record for the Hack the Lease build, written Thu Nov 19 2026.
Scope: what the engine computes, why, how fast, what we may claim, and who builds what by 1:30 PM Fri Nov 20.
Companion files: `engine/CONTRACTS.md` (interfaces, amended in section 6), `PROMPT.md` (case sheet).

Citation rule. Sources are cited by key in square brackets, for example [Dibbelt2017CSA]. Keys marked
`(unverified)` were not opened from the primary text and are cited only for the origin of an idea, never for a
number. Every value not backed by a verified key is labeled "assumption" here and on screen.

Facts about the repo used below were read from the code and data on Nov 19:
- Weekday timetable: 70,325 connections (Mon to Thu share one file), Fri 70,413, Sat 34,864, Sun 27,864.
- 1,192 stops, 42 routes, 8,318 trips across the week, 7,100 stop-to-stop footpaths (OSM walk network, <= 500 m).
- Service on the modeled Tuesday runs from 05:10 to 26:35 (02:35 next morning).
- `scripts/smoke.mjs` on this laptop: load 52 ms, 5 points 83 ms (about 17 ms per point), one-to-all scan 0.16 ms.
- Neither feed ships headway-based trips (`frequencies.txt` is header only), so results are deterministic.
- TheRide `transfers.txt` gives `min_transfer_time` = 10 s (type 2) between Blake Transit Center stops
  101, 103, 108, 170 and 1338. The U-M `transfers.txt` is empty.
- Both feeds carry `block_id` (example: U-M route BB trip in block NX254), so vehicles interline across routes.
- `pipeline/build_walk.py` does not keep the OSM `lit` tag.

---

## 1. The decision we support, and for whom

The decision: which home (and which room, and with which friends) to sign for, months before the student knows
next fall's schedule, judged by the week the student will actually live there.

Why the timing matters. Under Ann Arbor ORD-24-03 a landlord may not show a leased unit or sign a different tenant
for the next term until 210 days into the current lease [AnnArborORD24-03]. For a Sept 1 lease that is about
March 30 (our arithmetic, not the ordinance's text). Fall class schedules are not set by then. In a 15,000+
student survey in the Toronto region, 48% said they choose courses around their commute (self-reported, news
release) [StudentMoveTO2022]. So housing and schedule depend on each other, and the student has to choose under
uncertainty about the week.

Why simulate the week instead of scoring distance. Person-based, schedule-constrained accessibility measures
capture differences between individuals that place-based gravity and cumulative measures miss, and the measure
chosen changes who looks well served [Kwan1998]. "10 minutes from campus" (the kickoff example) depends on which
campus, which mode, and what time of day. Quorum computes that per student on the real timetables.

### Users and modes

| Mode | User | Question answered | Output |
|---|---|---|---|
| Me | one student | Which home and room fits the week I will probably live, given what my time, dark walking, stranded late trips and room features are worth to me? | Ranked homes with expected monthly regret, P(best), 50-dot quantile plot over plausible fall weeks, trip-level explainer, break-even values, value of knowing the schedule |
| Group | a friend group renting one house | Which house, who gets which room, and who pays what, so nobody would swap and everyone stays under a private cap? | House ranking, room assignment, envy-free maximin rents, envy matrix certificate, cap feasibility, stability margin |
| Operator | a housing company with irregular, never-professionally-managed houses | What is each room's fair share of the house rent, what does a renovation change, and which kinds of student weeks does each house fit? | Per-room fair rent distribution (p10, p50, p90) over synthetic groups, renovation delta, demand map. Every screen labeled SYNTHETIC |

### Mapping to the case sheet's five must-demonstrate items (PROMPT.md section 07)

| # | Case item | Where Quorum shows it | Screen evidence |
|---|---|---|---|
| 1 | Define the housing decision | Section 1 above; opening slide with the ORD-24-03 timeline and the Kwan point | Me mode start screen: "Your week, in every home" |
| 2 | Working artifact | Browser app on real TheRide and U-M timetables and OSM streets, offline | Me ranking, Group split, Operator pricing, all computed live |
| 3 | Decision sensitivity | Four live toggles: move a lab from Central to North campus; switch term month (Sept vs Dec darkness); change one member's cap; drag value of time across the break-even line | Ranking and split update in under a second; "why it stays the same" note when the leader does not change |
| 4 | Explain the implementation | Evidence view lists every method, library and data source with version and date | Evidence view, this document |
| 5 | Defend the result | Trip explainer (every leg, wait and dark minute), posterior intervals with "mostly prior" flags, envy matrix, validation results, assumptions drawer | Evidence view, Assumptions drawer |

Data and privacy rules from the case sheet that bind the design: homes, personas and the operator population are
synthetic and labeled; we collect a week, mode limits, an optional wage and a private cap; no demographics, no
gender, no crime data, no location history. Caps never leave the solver.

---

## 2. Architecture

```
 PIPELINE (Python 3, run once on a networked machine)        STATIC ARTIFACTS  web/public/data/   (~15.7 MB now)
 +---------------------------------+                         +----------------------------------------------------+
 | build_transit.py                |  TheRide GTFS S1000304  | transit/conn_mon.bin 1.41 MB  (Mon-Thu, 70,325 x 20 B)|
 |   calendars -> Mon..Sun 11/30   |  (11/15/26 to 1/23/27)  | transit/conn_fri.bin 1.41 MB  conn_sat 0.70 conn_sun 0.56|
 |   stop_times -> connections     |  U-M GTFS S1000100      | transit/meta.json 0.65 MB (stops, trips, routes,      |
 |   + change times (amend, s.6)   |  (8/23/26 to 1/2/27)    |   footpaths, stop_snap, change[] (new))              |
 | build_walk.py (osmnx, networkx) |  OSM via Overpass,      | transit/shapes.geojson 1.92 MB                       |
 |   walk + bike CSR, footpaths    |  cached in data/raw/osm | streets/walk_nodes.bin 1.36 MB (169,589 nodes)       |
 | build_places.py                 |                         | streets/walk_csr.bin 3.48 MB (349,586 arcs)          |
 | validate_router.py (new)        |                         | streets/bike_csr.bin 2.11 MB (179,170 arcs)          |
 | r5_validate.py (optional)       |                         | streets/streets.geojson 2.06 MB                      |
 +---------------------------------+                         | places.json 5 KB (24 real OSM places)               |
                                                             | homes.json, personas.json  (SYNTHETIC, new, ~50 KB)  |
 NODE SCRIPTS (scripts/*.mjs, run before freeze)  ---------> | evidence/router.json, recovery.json, lp.json (new)  |
   recovery.mjs, lp_props.mjs, build_operator.mjs            | operator.json (new, ~200 KB)                         |
                                                             +----------------------------------------------------+
                                                                                    |
                                                    browser: fetch, same origin     |     Node: fs (node-load.js)
                                                                                    v
 ENGINE  app/engine/*.js   plain ES modules, zero dependencies, identical in Node 22 and the browser
 +--------------------------------------------------------------------------------------------------------------+
 | load.js --> graph.js   Streets: nearest(), dijkstra() on CSR                                                  |
 |        --> transit.js  Timetable: CSA forward() / backward(), two labels per stop (amend), leg rebuild         |
 |        --> plan.js     Planner: points, walk/bike seconds, arriveBy() / leaveAt() for all homes per scan      |
 | week.js + solar.js     WeekResult per (home, scenario week); civil twilight per date (NOAA equations)         |
 | config.js (new)        every constant in section 4, overridable at runtime                                     |
 | model.js               shared linear utility in dollars per month                                              |
 | prefs.js               particle posterior, BALD pick selection, stop rule, recovery test                       |
 | decide.js              utility tensor, expected regret, P(best), SUCRA, EVPI, break-even, scenario split       |
 | simplex.js + fair.js   dense two-phase simplex; envy-free maximin with caps; slack; EF rate                   |
 | operator.js            IPF population, synthetic groups, room pricing, renovation delta, demand map           |
 +--------------------------------------------------------------------------------------------------------------+
                                                                                    |
                                       web/src/engine/index.js adapter (import.meta.glob, missing modules = null)
                                                                                    v
 UI  web/  Vite 5 + React 18 (plain JS) + MapLibre GL JS 4 (circle/line layers on our GeoJSON, HTML labels)
 +--------------------------------------------------------------------------------------------------------------+
 |  rail: Me | Group | Operator | Evidence        top bar: SAMPLE DATA        footer: AAATA, U-M LTP, OSM ODbL  |
 |  Assumptions drawer (edits config.js values live)       Trip explainer       Envy matrix       Dotplots       |
 +--------------------------------------------------------------------------------------------------------------+
```

### Offline guarantees

1. No runtime network origin other than the page's own. Map uses only `streets.geojson` and `shapes.geojson`
   (no tiles, no glyph server, labels are HTML markers). Fonts come from `@fontsource` packages.
2. Enforced, not promised: the production `index.html` carries
   `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:;
   worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'">`. Any accidental remote call
   fails loudly in the console during rehearsal instead of silently on stage. Dev mode skips it (Vite HMR socket).
3. Rehearsal test: `npm run build`, serve `web/dist` with `npx vite preview`, turn off Wi-Fi, reload, run the
   whole demo path. Then `grep -rE "https?://" web/dist/assets | grep -v -E "openstreetmap|theride|umich"` must
   return nothing that the page fetches.
4. No API keys exist anywhere in the project. Nothing to leak, nothing to expire.
5. Presenters' laptops: the repo includes `web/public/data` (about 16 MB, under GitHub's per-file limit), so a
   clone plus `npm ci` (done the night before, on Wi-Fi) is enough. Fallback: a zipped `web/dist` on a USB stick.

### Memory and load budget (browser)

`addPoint` keeps a Float32 distance array and an Int32 parent array over 169,589 nodes: about 1.36 MB per point.
With about 30 homes and 24 places that is about 73 MB, plus the same again for lazily built bike trees. This is
acceptable in Chrome. If it shows pressure, `addPoint` keeps only distances to stop nodes and to other points'
nodes, and rebuilds parents on demand for the one path being drawn (owner: router builder, wave 3).
Load-time work: about 54 points x 17 ms = about 0.9 s walk trees, a similar amount for bike trees, then the
scenario weeks (section 3.2). Shown behind a progress line, once.

---

## 3. Engine modules

Notation used throughout. Money is dollars per month. `WPM = 52/12` weeks per month. h indexes homes, r rooms,
s scenario weeks, m posterior draws, i group members, j rooms in a house. `sigma(x) = 1/(1+exp(-x))`.
`H(p) = -p ln p - (1-p) ln(1-p)` in nats.

### 3.1 Routing (transit.js, plan.js, graph.js)

Method. Connection Scan Algorithm [Dibbelt2017CSA] over one array of connections per service day, sorted by
departure time. One-to-all earliest arrival (`forward`) from multiple sources, and the mirrored one-to-all latest
departure (`backward`) to multiple sinks. Access and egress walks are OSM Dijkstra trees from each point
(`graph.js`), which play the role ULTRA assigns to initial and final transfer searches [Baum2019ULTRA]. One scan
answers a trip for every candidate home at once, because every home reads the same stop labels.

Amendment: two labels per stop. The current code keeps one label per stop that mixes vehicle and foot arrivals and
adds the 60 s buffer only when the best label is a ride. A later foot arrival that is ready sooner than an earlier
ride arrival plus its change time can then be lost, and a seed (access) label can shadow a later ride arrival at
the same stop. The fix copies RAPTOR's split between round arrivals and footpath arrivals [Delling2012RAPTOR]:

```
Forward scan, day d, seeds {(s, t_s)}, horizon T_h = 3 h
  seed[s]    = t_s for seed stops, +inf elsewhere      (walked from the origin, no ride yet)
  rideArr[s] = +inf                                     (best arrival by vehicle)
  footArr[s] = +inf                                     (best arrival by footpath after a vehicle)
  ready(s)   = min(rideArr[s] + chg(s), footArr[s], seed[s])     earliest moment a new boarding is possible
  tripIn[k]  = -1                                       (connection index where trip k was boarded)

  for c in connections with c.dep >= min t_s, in sorted order, until c.dep > min t_s + T_h:
      if tripIn[c.trip] < 0:
          if ready(c.from) > c.dep: continue
          tripIn[c.trip] = c; boardVia[c.trip] = argmin label at c.from (RIDE, FOOT or SEED)
      if c.arr < rideArr[c.to]:
          rideArr[c.to] = c.arr; rideParent[c.to] = (tripIn[c.trip], c)
          for each footpath (c.to -> q, dur) with dur <= 500 m / 1.3 m/s:
              if c.arr + dur < footArr[q]: footArr[q] = c.arr + dur; footParent[q] = (c.to, dur)

  Egress label exported as snapshot.t[s] = min(rideArr[s], footArr[s])   (a transit trip has at least one ride)
```

`chg(s)` is the minimum change time at stop s: `min_transfer_time` from `transfers.txt` where the feed gives one
(10 s at the five Blake Transit Center stops), otherwise 60 s (assumption). A footpath duration already includes
the change, so no buffer is added after a walk. Staying on the same trip needs no change time (the trip bit).
The relax-on-improve guard is correct here because footpaths are one hop from vehicle arrivals only, and network
shortest paths satisfy the triangle inequality, so chaining two footpaths within the radius is never faster than
the direct one. The paper's Figure 5 failure (limited walking with length-capped footpaths) needs foot-to-foot
chaining, which this scheme never does [Dibbelt2017CSA].

The backward scan is the exact mirror, scanning the same array in reverse:

```
Backward scan, sinks {(s, t_s)} meaning "be at stop s by t_s"
  seed[s] = t_s, rideDep[s] = -inf, footDep[s] = -inf
  latest(s) = max(rideDep[s] - chg(s), footDep[s], seed[s])     latest moment you may arrive at s and continue
  for c in reverse order with c.dep <= max t_s, until c.dep < max t_s - T_h:
      if tripOut[c.trip] < 0:
          if c.arr > latest(c.to): continue
          tripOut[c.trip] = c; alightVia[c.trip] = argmax label at c.to
      if c.dep > rideDep[c.from]:
          rideDep[c.from] = c.dep; rideParent[c.from] = (c, tripOut[c.trip])
          for each footpath (q -> c.from, dur): footDep[q] = max(footDep[q], c.dep - dur)
  Exported snapshot.t[s] = max(rideDep[s], footDep[s])
```

Sort order. The pipeline sorts by `(dep, arr, trip)` with Python's stable sort after inserting each trip's
connections in `stop_sequence` order, so zero-duration hops inside one trip keep their order, and the reverse
array has them in reverse order, which is what the backward scan needs. Across different trips, ties at the same
timestamp cannot chain because every change costs at least 10 s. Amendment: make the key explicit as
`(dep, arr, trip, seq)` and assert in the build that each trip's connection indices increase with `seq`.

Arrive-by ("be in class by 9:00"). Sinks are the destination's access stops with `t = deadline - egressWalk(stop)`.
Latest leave-home time per home = `max over access stops a of (snapshot.t[a] - accessWalk(home, a))`. The trip
shown to the user is rebuilt from the backward snapshot (`legsBackward`), and in tests a forward scan from that
leave time must arrive by the deadline (section 5.1). We never answer arrive-by by sweeping forward departures.

Door to door. For each trip the planner compares walk (`walkSec`), bike (`bikeSec`: bike graph at 4.2 m/s, walked
to the nearest bikeable street, plus 120 s to park and lock) and transit. Mode rules are in week.js (3.2).
Amendment: `plan.breakdown(result, homeId)` returns walk, wait, ride and slack seconds and the clock intervals of
every walk and wait, rebuilt from the same snapshot (no extra scan), because week.js needs them for generalized
time and darkness.

Interlining (wave 3, optional). Both feeds carry `block_id`. When trip k+1 follows trip k in the same block and
starts at k's last stop at or after k's arrival, set k+1's trip bit when k's last connection is reached (stay
seated, no change). Without this the router assumes a 60 s change at those stops, which is mildly pessimistic.

Complexity and runtime. One scan is O(|C| + footpath relaxations) with |C| <= 70,413 and 7,100 footpaths, after a
binary search to the first departure. Measured 0.16 ms in Node on this laptop. The two-label version touches two
more arrays per stop; expected under 0.3 ms (to be measured by the router test). Walk trees: about 17 ms per point.

Papers: [Dibbelt2017CSA], [Delling2012RAPTOR], [Bast2015Survey], [Baum2019ULTRA], [Witt2015TB], [Conway2017R5].

What we deliberately do not do, and why.
- No RAPTOR, Trip-Based routing or ULTRA. At about 1.4% of the London CSA instance's 4.85M connections, a plain
  scan is already sub-millisecond; Trip-Based needs a preprocessing phase (30 s on London) and ULTRA targets
  metropolitan to national networks with unlimited transfers [Witt2015TB, Baum2019ULTRA]. Their cost is code and
  load time we do not have.
- No transitive closure of footpaths. On London the closed transfer graph has 3.2M edges against 575k in the
  street transfer graph [Baum2019ULTRA]. Transfers longer than 500 m between stops are lost; R5 has the same kind
  of limit because it also precomputes transfers on the street network [Conway2017R5].
- No profile CSA or range queries. The product needs fixed-time trips (arrive by class start, leave at class end);
  validation needs per-minute scans, which are cheap at this size.
- No real-time data, no fares, no FlexRide. FlexRide Late Night is on demand and absent from GTFS [TheRideFY25],
  so "stranded" can overstate late stranding; shown as a caveat. Fares are not modeled (assumption: zero marginal
  fare); check the student fare policy before saying so on stage.
- No transfer-count criterion. It could enter utility later via a K-round CSA, not now.

Claims we may make on stage.
- "Every trip is computed on the published TheRide and U-M timetables for the week of Nov 30 2026, with walking
  and biking on OpenStreetMap streets."
- "One timetable scan answers a trip for all 30 homes at once; a scan takes about 0.16 milliseconds on this laptop."
- "Arrive-by is exact: we scan the timetable backward from the class start."
- After section 5.1 passes, and only then: "Our router matches an independent reference router on N of N stop
  pairs" and the r5py error numbers, if that test ran.
- Not to claim: real-time accuracy, fall-semester timetables (the feeds start Nov 15 and Aug 23 but the modeled
  week is a December proxy), or anything about FlexRide.

### 3.2 Week simulation and darkness (week.js, solar.js)

Method. A student's week is a chain of space-time prisms between fixed anchors (classes, shifts)
[Kwan1998; Hagerstrand1970 (unverified) for the concept; Miller1991 (unverified) for network prisms]. For each
day: home to the first entry (arrive by its start), entry to entry when the gap is short, a home break when the gap
is at least `homeBreakMin` (150 min) and a round trip plus 30 min fits, and the last entry to home (leave at its
end). Each distinct (day, place, time, direction) is one CSA scan shared by all homes and cached across scenarios.

Mode choice per trip: the fastest allowed of walk, bike (if `modes.bike`), transit. Walking legs longer than
`maxWalkMin` are not allowed; after `lateHour` the cap is `maxLateWalkMin`. Transit access and egress walks count
toward that cap. A trip with no allowed option is stranded: it is costed at the fastest disallowed option's
minutes and listed in `stranded`.

Generalized time (amendment to model.js, constants not learned):

```
genMin(h,s) = rideMin + slackMin + m_walk * walkMin + m_wait * waitMin + m_bike * bikeMin
  m_walk = 1.45   urban implied walk multiplier [Wardman2016]; 1.50 to 1.75 recommended range [Wardman2026]
  m_wait = 1.50   urban wait multiplier [Wardman2016]; SP-weighted 1.50 [Wardman2026];
                  riders report waits about 1.21x observed, >= 1.3x at no-amenity stops [Fan2016]
  m_bike = 1.00   assumption; bike time can carry intrinsic value for students [Whalen2013], so it is not
                  weighted like walking
  slackMin        minutes between arriving and the deadline on arrive-by trips, weight 1.0 (assumption: usable
                  time at the destination)
```

Darkness. A walk, bike or wait minute is dark if its clock time is before civil dawn or after civil dusk on the
evaluation date, computed offline by the NOAA solar equations at the Ann Arbor city-center coordinate
(42.2808 N, 83.7430 W). Civil twilight counts as daylight, which is the conservative cut.

```
darkMin(h,s,date) = darkWalkMin + k_bd * darkBikeMin + darkLongWaitMin
  k_bd = 0.67  assumption informed by [Uttley2017]: ln(1.38)/ln(1.62), the ratio of cyclist to pedestrian
               log odds ratios for daylight vs dark at the same clock hour. An analogy for relative scale only,
               not a dollar value.
  darkLongWaitMin = wait minutes beyond the 10th minute of one wait, after dusk. [Fan2016] finds the largest
               perception distortion for waits over 10 minutes in surroundings seen as insecure. Folded into
               darkness so it adds no parameter.
```

Term dates. The timetable is a fixed December proxy, but daylight is not. Default evaluation dates are Sep 15,
Oct 15, Nov 15 and Dec 1 2026 with equal weights (assumption; DST ends Nov 1 2026 and solar.js handles the local
offset). `darkHoursPerMonth` is the weighted mean. The term-month toggle (Sept vs Dec) is demo sensitivity item 3.
No new scans are needed per date: only the darkness tagging of the same walk and wait intervals changes.

Scenario weeks. `sampleWeeks(routine, K, seed)` draws each entry's occurrence (probability `p`) and location
(`alt`) independently. Default K = 24 (assumption). The scenario weights are the user's own `p` values and are
editable in the week editor, because P(best) is only as good as those weights.

Complexity and runtime. Per scenario week about 15 to 25 trips, most shared across scenarios; with caching the
24 scenarios need perhaps 40 to 80 distinct scans, about 15 ms, plus O(homes x access stops) label reads per scan
and O(legs) breakdown per (home, trip). Expected under 300 ms for 30 homes x 24 scenarios (to be measured).

Papers: [Kwan1998], [Wardman2016], [Wardman2026], [Fan2016], [Whalen2013], [Uttley2017], [Fotios2015],
[TheRideFY25], [Conway2017R5].

What we deliberately do not do.
- No street lighting data. Quorum has no lux data and `build_walk.py` drops the OSM `lit` tag. A lit/unlit split
  is the documented next step [Fotios2015]; until then every dark minute is weighted the same, and we never claim
  a street is well lit.
- No crime or neighborhood safety scores. They invite demographic inference, which the case sheet rules out, and
  no verified source ties them to student cost.
- No mean-based averaging of per-minute departures in the product. Trips are fixed-time; the median-with-infinity
  rule of [Conway2017R5] is used for validation and for any departure-window metric.
- No new parameter per multiplier. Six picks cannot identify walk vs wait differences that small (section 3.3).

Claims we may make on stage.
- "Darkness changes real behavior: at the same clock hour, Arlington counters saw 62% more pedestrians and 38%
  more cyclists in daylight than in darkness [Uttley2017]. We count your dark walking minutes; your picks decide
  what they cost you."
- "Waiting counts more than riding. The largest meta-analysis of European values puts urban waits about 1.5 times
  an in-vehicle minute [Wardman2016]."
- "December daylight is short. Switch to September and watch the dark minutes drop."
- Not to claim: a dollar value of darkness from the literature (none exists in our sources), safety of any street.

### 3.3 Preference model and active learning (model.js, prefs.js)

Utility (dollars per month), shared by every module:

```
U(theta; h, r, s) = wBath * bath_r + wSize * (sqft_r - 120)/10 + wLight * light_r
                    - (asking_r + utilities_h / rooms_h)
                    - vTime  * G(h,s)          G = genMin(h,s)/60 * WPM          (generalized hours per month)
                    - vDark  * D(h,s)          D = term-weighted darkMin/60 * WPM (extra, on top of vTime)
                    - vStrand* S(h,s)          S = |stranded(h,s)| * WPM          (stranded trips per month)

theta = (vTime $/h, vDark $/h, vStrand $/trip, wBath $/mo, wSize $/mo per 10 sq ft, wLight $/mo per level),
all > 0. Linear in theta: U = theta . phi(option) - price(option).
```

This is willingness-to-pay space: every weight is in dollars, so intervals read directly [Train2009].

Likelihood of one pick ("which week would you rather live?"):

```
P(A chosen | theta) = sigma( (U(theta; A) - U(theta; B)) / tau ),    tau = 25 $/month (assumption)
"Too close to call" records nothing (no likelihood term).
```

Prior: independent lognormals (model.js medians, all assumptions except where noted):
`vTime ~ LN(ln 15, 0.8^2)`; if the student enters an hourly wage w, the median becomes 0.5 w, because commute
value of time averages about half the gross wage, with unexplained heterogeneity several times the explained part
[Small2012]. `vDark ~ LN(ln 10, 1.0^2)` (sign fixed by [Uttley2017], size an assumption). `vStrand ~ LN(ln 15,
1.0^2)` (assumption; urban late time valued 3.1x in-vehicle time [Wardman2016] is an analogy only).
`wBath ~ LN(ln 60, 0.7^2)`, `wSize ~ LN(ln 8, 0.7^2)`, `wLight ~ LN(ln 20, 0.8^2)` (assumptions).

Posterior: weighted particles, static-parameter sequential Monte Carlo [Chopin2002].

```
init:   theta_k ~ prior, w_k = 1/N, N = 4000
update: w_k <- w_k * sigma( +/- (U(theta_k;A) - U(theta_k;B)) / tau ), renormalize
        ESS = 1 / sum_k w_k^2
        if ESS < N/2: systematic resample, then 2 random-walk Metropolis steps per particle in log theta,
                      proposal sd = 0.5 x weighted sd of log theta per dimension,
                      target = prior(theta) x product of all recorded pick likelihoods (at most 6 terms)
summary: weighted median and 80% interval per parameter
```

Amendment to CONTRACTS ("log-space jitter"): use the Metropolis move, which targets the exact posterior.
Liu-West shrinkage jitter [LiuWest2001 (unverified)] is the fallback only if the move step misbehaves.

Pick selection (BALD) [Houlsby2011]:

```
Candidates: all pairs of homes (best room per home under the posterior mean) in the student's modal scenario s0,
            plus within-home room pairs (isolate room features). About 435 + 60 pairs for 30 homes.
For each pair (A, B): p_k = sigma((U(theta_k;A) - U(theta_k;B))/tau)
            IG = H( sum_k w_k p_k ) - sum_k w_k H(p_k)
Ask argmax IG. Tie-break (within 0.01 nats): the pair whose answer most changes P(best) among the current top 3.
Explanation shown with the pick (from [SaureVielma2019]):
            mu  = E_w[ (U_A - U_B)/tau ]          near 0 means "you are close to 50/50"
            s2  = Var_w[ (U_A - U_B)/tau ]        large means "along the trade-off we know least"
```

[SaureVielma2019] show that under a normal posterior a question's expected D-error depends only on these two
numbers; we use them for the explanation line and as the Gaussian fallback, and compute BALD exactly because the
pool is small.

Stopping: at least 3 picks, at most 6. Stop early when the top home's P(best) >= 0.8 or the best IG < 0.05 nats
(both assumptions, shown in the UI).

Identification honesty. With at most 6 binary picks only 3 to 4 weights can be learned. For each parameter the UI
shows `ratio = posterior 80% width / prior 80% width` (in log space) and labels it "mostly prior" when
ratio > 0.7 (assumption). Prior-dominated weights are never shown with tight intervals.

Demo mode. Personas carry a hidden `theta` used only to auto-answer picks (logit draws at tau) and for the
recovery test. A live student answers by clicking.

Complexity and runtime. Update: O(N) = 4000 sigmoid evaluations, under 1 ms. BALD: O(pairs x N) = about 2M
sigmoid and entropy evaluations, expected 30 to 60 ms in JS (to be measured; if slower, prefilter to the 200
pairs with the largest `s2 - mu^2`, a heuristic). Move step: N x 2 x 6 likelihood evaluations, under 5 ms.

Papers: [Train2009], [Houlsby2011], [SaureVielma2019], [Chopin2002], [Small2012], [Wardman2016], [Wardman2026],
[AbrantesWardman2011], [Uttley2017]; related work only: [ToubiaHauserSimester2004 (unverified)],
[YuGoosVandebroek2011 (unverified)], [LiuWest2001 (unverified)].

What we deliberately do not do.
- No polyhedral updates: they degrade with high response error [SaureVielma2019], and picks between two weeks are
  noisy.
- No learning of walk and wait multipliers. The gap between them (1.45 vs 1.50) is far too small for six picks.
- No LLM in the loop. Everything must run offline and be explainable from the math on screen.
- No demographic priors (case sheet). The only optional personal input is an hourly wage.
- No reference-dependent (loss-averse) model. Picks framed against a current home may be biased [Small2012]; we
  show real candidate homes, not the student's current home.

Claims we may make on stage.
- "Six picks, each chosen to be the question you are closest to 50/50 on, along the trade-off we know least."
- "These are intervals, not point guesses. Weights your picks did not touch are labeled 'mostly prior'."
- "Stated choices tend to value time lower than observed behavior (about 18% lower for in-vehicle time and 31% for
  walk and wait, UK meta-analysis via [Small2012]); treat your learned value of time as a floor."
- After section 5.3 runs: the recovery curve (coverage, regret, top-1 accuracy vs number of picks, BALD vs random).

### 3.4 Decision under schedule uncertainty (decide.js)

Method. Monte Carlo over joint draws of (fall week scenario, preference weights). Each scenario week is a
plausible future; we pick homes that do well across them [Lempert2003] and report the full distribution, not one
number.

```
Utility tensor: U[m, s, h] = max over rooms r of U(theta_m; h, r, s)
                m = 1..M posterior draws (M = 200, weighted resample), s = 1..K scenarios (K = 24), h = homes
Best per draw:  B[m,s] = max_h U[m,s,h];   regret Rg[m,s,h] = B[m,s] - U[m,s,h]  (dollars per month, >= 0)

Expected regret       ER_h   = mean_{m,s} Rg[m,s,h]            (default sort key; equals sorting by expected
                                                                utility, since mean B is the same for all h)
Probability best      P_h    = mean_{m,s} 1[h = argmax_h' U[m,s,h']]
SUCRA                 SU_h   = (N_h - meanRank_h) / (N_h - 1)  (N_h = number of homes)
Cautious (minimax)    MR_h   = max_s ( max_h' Ubar[s,h'] - Ubar[s,h] ),  Ubar[s,h] = mean_m U[m,s,h]
Dotplot               50 quantiles of Rg[.,.,h] at levels (i + 0.5)/50
```

Why expected regret is the default sort and P(best) is shown beside it. P(best) favors high-variance options: the
option with the higher point estimate can win often even when intervals overlap heavily [Rucker2015]. A cheap home
far from North Campus can top P(best) and still carry the most regret. When the P(best) leader and the regret
leader differ, the UI flags both and says why. This is a deliberate amendment to the one-line product summary,
which says "ranked by probability of being best".

Value of knowing the schedule:

```
EVPI    = mean_s max_h Ubar[s,h] - max_h mean_s Ubar[s,h]                     (>= 0, dollars per month)
EVPPI_a = mean_{a-value v} [ max_h mean_{s | a = v} Ubar[s,h] ] - max_h mean_s Ubar[s,h]
          for each uncertain schedule attribute a (for example, lab on North vs Central campus)
Shown as: "Knowing where your lab will be is worth about $X per month" or "Your choice does not depend on it".
```

These are textbook decision-analysis definitions; no source for them was opened this session.

Scenario discovery (light version of [Lempert2003]): for the top two homes, split scenarios by each attribute and
report the conditional win rate, for example "Home B wins only if your lab is on North Campus after 6 PM".

Break-even (demo sensitivity item 3). With other weights at the posterior mean, write `U_X = c_X - vTime * G_X`.
Then `vTime* = (c_A - c_B) / (G_A - G_B)`, valid when `G_A != G_B` and `vTime* > 0`. Shown as "Home B wins if
your time is worth more than $X per hour". Same form for vDark and vStrand.

Uncertainty displays. Per home, a 50-dot quantile dotplot of monthly regret, with a CDF toggle. 50-outcome
quantile dotplots gave 97% of optimal payoff in an incentivized bus decision task, better than text or no
uncertainty [Fernandes2018], and reduced estimate variance relative to density plots [Kay2016]. A hypothetical
outcome plot animates one sampled week per 400 ms frame with the winning home highlighted and a running tally;
HOPs cut error on "which is largest" questions [Hullman2015]. HOPs are weak for means, so means are never read off
the animation. Animation respects prefers-reduced-motion (static tally instead). Text-only percentages are avoided
because textual uncertainty did worst [Fernandes2018].

Complexity and runtime. Tensor: M x K x H x rooms = 200 x 24 x 30 x up to 6 = 864k dot products of length 6,
about 10 ms. Ranks and quantiles: O(M K H log H), a few ms. EVPPI: one pass per attribute. Toggles recompute only
the affected scenario weeks (cached scans), so a sensitivity change should render in well under a second.

Papers: [Rucker2015], [Lempert2003], [Kay2016], [Fernandes2018], [Hullman2015], [AnnArborORD24-03],
[StudentMoveTO2022].

What we deliberately do not do.
- No CSA profile queries or rRAPTOR for scenario sweeps. Per-trip scans are already cheap [Dibbelt2017CSA].
- No optimization of scenario weights. They come from the student's own `p` values.
- No single-number verdict. The dotplot and both rankings are always shown together.
- No claim that the display results transfer from transit arrival to housing choice. The display studies used
  transit tasks [Kay2016, Fernandes2018]; the transfer is plausible, untested.

Claims we may make on stage.
- "You sign around March for a fall you cannot see yet. We rank homes across 24 plausible fall weeks, built from
  your own odds for each class and job."
- "We sort by expected regret in dollars per month and show the chance each home is best beside it, because a
  risky home can look best by chance [Rucker2015]."
- "Knowing your lab location is worth about $X per month to you" (computed live; say it only for the shown case).

### 3.5 Fair division and group choice (fair.js, simplex.js)

Room values. Member i's value for room j uses i's posterior mean theta (from that member's own picks, or the
persona prior):

```
v_ij = wBath_i * bath_j + wSize_i * (sqft_j - 120)/10 + wLight_i * light_j           (raw, dollars per month)
Spliddit normalization (default):  vt_ij = v_ij - mean_j(v_ij) + R/n,  so sum_j vt_ij = R
```

Envy-freeness depends only on within-member differences, so per-member constants never change which splits are
envy-free; the maximin objective does depend on them [Gal2017]. Commute cost is constant across rooms of one house,
so by default it is left out of room values: including it would shift maximin rent toward the member with the
worst commute. A visible toggle "compensate long commutes" adds `-c_i(h)` back into utilities. Amendment: the
current CONTRACTS line "Utilities include -commute" becomes "off by default".

Assignment. Every envy-free allocation uses a welfare-maximizing assignment (Svensson 1983, as restated in
[Procaccia2018]). For n <= 6 members we enumerate all n! assignments and keep every one with welfare within
`1e-9 * (1 + max|v|)` of the maximum. Ties matter: solving on one arbitrary efficient assignment can wrongly report
infeasibility once caps exist [Procaccia2018, Example 1].

Core LP, one per efficient assignment sigma (rooms = members, n rooms, house rent R, caps b_i):

```
variables  p_1..p_n (room rents), t
maximize   t
subject to t <= vt_i,sigma(i) - p_sigma(i)                              for all i       (maximin)
           vt_i,sigma(i) - p_sigma(i) >= vt_ij - p_j                     for all i, j != sigma(i)   (envy-free)
           sum_j p_j = R                                                                (rent is covered)
           p_sigma(i) <= b_i                                             for members with a cap
           p_j >= 0                                                      first attempt; dropped and flagged
                                                                         "a room is paid to be taken" if infeasible
           L_j <= p_j <= U_j                                             optional room floors/ceilings (operator)
Return the best t over all efficient sigma.
```

Without caps this is the Gal et al. algorithm (max-weight assignment, then one LP over prices), correct because
envy-free rent division is a Walrasian equilibrium with unit-demand valuations [Gal2017]. With caps it is the
budget-constrained maximin solution of [Procaccia2018], computed by enumeration instead of their combinatorial
algorithm, which is exact for n <= 6.

Infeasible caps [Procaccia2018, Theorem 4 approach]:

```
Phase 1, per efficient sigma:  minimize z
           subject to envy-free rows, sum_j p_j = R, p_sigma(i) - b_i <= z for capped i, z >= 0
           z* = min over sigma
Phase 2, on the sigma attaining z*:  fix z = z* + 1e-6, maximize t as in the core LP
Report: feasible = false, capRelaxation.byMember[i] = max(0, p_sigma(i) - b_i), total = sum, worst = z*.
Example the UI must handle: R = $1000, both value rooms at 800 and 200, caps 600 each -> EF forces rents 800
and 200, so no split fits; z* = 200 [Procaccia2018].
```

Rooms > members (an apartment with a spare room). Unassigned rooms are priced at their `asking` rent; the solver
enumerates injections of members into rooms (at most 6!/(6-5)! = 720), sets `R' = R - sum of asking for unassigned
rooms`, and adds envy rows against each unassigned room at its asking price. All injections are solved (the
welfare-maximization shortcut is not used in this case).

Private gap: `privateGap(problem, i) = max(0, min over efficient sigma of [min p_sigma(i) s.t. envy-free,
sum p = R, all other caps] - b_i)`. Each member sees only their own gap ("your cap would need to rise by $X").
This reveals a little about others' caps in aggregate; stated in the privacy note.

Certificate (shown, not the LP):

```
envy[i][j] = (vt_i,sigma(i) - p_sigma(i)) - (vt_i,sigma(j) - p_sigma(j))    (CONTRACTS sign; >= -1e-6 is EF)
cap row    = b_i - p_sigma(i) >= 0                                           (visible only to member i)
slack      s = min_i min_{j != i} envy[i][j]
Stability: if every member's true room values differ from the inferred ones by at most s in L1 norm, the split
           stays envy-free [Peters2022, Proposition 3.1]. Shown as "still envy-free if anyone's room values are
           off by up to $s in total".
EF rate:   draw 100 posterior theta samples per member, recompute normalized values, report the share of samples
           in which the chosen prices stay envy-free [Peters2022 used m = 100 samples].
```

After every solve, a plain-JS checker re-verifies every envy, cap and sum constraint at tolerance 1e-6 before the
matrix renders. If the checker fails, the UI shows the failure, never a green matrix.

Optional (wave 3): "stable split" toggle, the expected-envy LP for the fixed efficient sigma
[Peters2022]: minimize `(1/100) sum_k e_k` s.t. `e_k >= 0`, `e_k >= (vt^k_ij - p_j) - (vt^k_i,sigma(i) -
p_sigma(i))` for all i, j, k; `sum p = R`; caps. For n = 5 that is about 2,500 rows, still small.

Which house. For each candidate house h:

```
U_i(h)   = v_i,sigma(i) - p_sigma(i) - utilities_h/n - c_i(h)     raw values, comparable across houses
           c_i(h) = vTime_i * G_i(h) + vDark_i * D_i(h) + vStrand_i * S_i(h), expected over i's scenarios
E_h      = min_i U_i(h)        egalitarian score, default rank (feasible houses first, then by z*)
W_h      = sum_i U_i(h)        utilitarian score, shown beside it
Flag "the group disagrees" when members' individual top houses differ.
```

Group recommender studies found the best aggregation rule depends on how much the group disagrees, and that
Fairness-style rules suit uniform and coalitional groups; textual explanations of the rule showed no benefit
[Barile2023]. So we show both scores and a checkable certificate, not prose about the rule. The formal model for
choosing among apartments is negotiated envy-freeness [ProcacciaSchifferZhang2024]; we cite it as the frontier
and do not implement it.

LP solver. `simplex.js`: dense two-phase simplex with Bland's rule (no cycling), free variables split as
`p = p+ - p-` when nonnegativity is dropped, tolerance 1e-9. Interface in section 6.

Complexity and runtime. Per LP at n = 6: 7 to 13 variables, about 43 rows. Usually one efficient assignment, so
one or two LPs per house; worst case 720 small LPs. Expected under 20 ms per house at n = 5 in the common case and
under 1 s in the worst case (to be measured by lp_props).

Papers: [Gal2017], [Procaccia2018], [Peters2022], [GoldmanProcaccia2014], [Barile2023],
[ProcacciaSchifferZhang2024], [Gangam2025], [ShapleyShubik1971], [DGS1986].

What we deliberately do not do.
- No lexislack: O(n^4) LPs [Peters2022] is build time we do not have.
- No negotiated envy-freeness for house choice; cited, not claimed.
- No strategy-proofness claim. No envy-free mechanism is strategy-proof [Gal2017, citing Green and Laffont 1979];
  any EF algorithm is manipulable [Procaccia2018, citing Alkan, Demange and Gale 1991]. Inferring values from week
  picks makes targeted manipulation harder, not impossible, and caps can be shaded.
- No Nash welfare rule (no verified source this session).

Claims we may make on stage.
- "Nobody would swap: every entry of this matrix is your own value of your room at its price minus room j at its
  price, by your inferred values."
- "Among envy-free splits we maximize the worst-off member. Spliddit has deployed this rule since 2015; on 1,358
  real instances it cut disparity by 9% of rent and raised the worst-off member by 4% of rent on average versus an
  arbitrary envy-free split, and in a 46-person study users rated it fairer (Wilcoxon p < 0.04) [Gal2017]."
- "With private caps we either find an envy-free split under every cap or show none exists and minimize the worst
  overrun [Procaccia2018]."
- "Still envy-free if anyone's room values are off by up to $s in total [Peters2022]."
- Not to claim: envy-free under members' true preferences, manipulation-proof, or that the Spliddit user study
  covered students or caps (it did not).

### 3.6 Operator analytics (operator.js)

Synthetic population (every screen labeled SYNTHETIC). Seed table of archetype weeks: campus (Central, North,
Medical) x job (none, downtown, Kerrytown-area place from places.json) x late study (yes, no) x gym (yes, no) x
class load (light, heavy). Iterative proportional fitting reweights the seed cells to stated marginals, then
students are drawn from the seed in those proportions [Beckman1996]:

```
IPF: w_c <- seed weight per cell c
     repeat: for each marginal attribute a with target shares T_a(v):
                 w_c <- w_c * T_a(v_c) / sum_{c': v_c' = v_c} w_c'     (after normalizing w)
     until max relative change < 1e-6
Draw n students multinomially from w; each student's theta ~ prior; week built per day as
pattern (class day / non-class day / home) -> tours (class, job, gym, study) -> times from U-M class blocks,
following the ActivitySim CDAP step order [ActivitySimCDAP].
```

Marginal shares are assumptions shown and editable on the Operator screen (defaults, all assumptions: Central 0.5,
North 0.3, Medical 0.2; job 0.4; late study 0.5; gym 0.4).

Per-room fair rent. For each house with n rooms, draw G = 200 synthetic groups of n students, compute each
group's normalized room values, solve the envy-free maximin LP at the house's asking total R (caps off), and report
each room's rent at p10, p50, p90 across groups. Envy-free prices are competitive equilibrium prices of the room
assignment market [Gal2017]; core outcomes of the assignment game are the dual LP solutions [ShapleyShubik1971];
an ascending auction among unit-demand bidders reaches the minimum equilibrium prices [DGS1986]. So the per-room
number has a market-clearing meaning: what this population of groups would settle on for that room, computed
without running an auction. Room floors and ceilings (for example a basement minimum) enter as `L_j <= p_j <= U_j`
[Gangam2025].

Renovation lever. Change one room feature (add a private bath, add a window level), recompute, and report:

```
Delta p50 of that room's fair share at fixed R
Delta headroom = Delta median over groups of ( sum_i v_i,sigma(i) - R )   (group surplus: room for a higher total rent)
```

We report re-solved allocations, not summed willingness to pay, because profit-based feature value can differ
greatly from WTP-based calculations [Allenby2014]. Implicit room-characteristic prices follow hedonic logic
[Rosen1974], but ours come from the preference model, not from a market rent regression; the screen says
"preference-based, synthetic, not market rents".

Demand map. For each home: share of synthetic students for whom it is top 3 in Me-mode ranking, the archetypes it
wins, and fit premium = median over students who rank it first of `U_first - U_second` (dollars per month a rent
rise would need to reach before they switch). Aggregates render only for cells with at least k = 10 students;
smaller cells merge into "other" [Sweeney2002].

Precompute vs live. `scripts/build_operator.mjs` runs the population (n = 2000, assumption), room pricing for every
house and the demand map in Node and writes `operator.json`. The browser recomputes only the renovation lever for
the selected house live (200 LPs).

Complexity and runtime. Population: 2000 students x scenario-free modal week, reusing cached scans by archetype
(the archetypes share places and times), seconds in Node. Room pricing: 200 groups x about 10 houses x 1 to 2 LPs,
about 1 s in Node. Renovation: 200 LPs, under 300 ms in the browser (to be measured).

Papers: [Beckman1996], [ActivitySimCDAP], [ShapleyShubik1971], [DGS1986], [Gal2017], [Gangam2025], [Rosen1974],
[Allenby2014], [Sweeney2002], [DworkRoth2014].

What we deliberately do not do.
- No market hedonic regression: we have no rent dataset.
- No differential privacy noise: the population is synthetic, so noise would only hide the method. The k-floor
  shows the pattern a real deployment would start from; Laplace noise [DworkRoth2014] is the next step.
- No real tenant data, no listing scraping.

Claims we may make on stage.
- "For an irregular house, these are the rents a population of student groups would settle on room by room so that
  nobody would swap, and how wide that range is. Synthetic population, labeled."
- "Adding a bath to the basement room moves its fair share by $X and the group headroom by $Y," computed live.
- Not to claim: market rents, demand forecasts, or anything about real Ann Arbor tenants.

---

## 4. Priors and constants

Change paths: D = Assumptions drawer in the UI, applied live (engine functions read `config.js` values through an
`opts` override). C = edit `engine/config.js` and reload. P = edit the pipeline and rebuild data.

| Constant | Value | Source | Change |
|---|---|---|---|
| Walking speed | 1.3 m/s | assumption | D (re-derives access seconds from stored meters; footpaths need P) |
| Biking speed | 4.2 m/s (about 15 km/h) | assumption | D |
| Bike park and lock overhead | 120 s | assumption | D |
| Max walk to or from a stop | 1300 m | assumption | C |
| Dijkstra radius per point | 9000 m | assumption | C |
| Stop-to-stop footpath cap | 500 m network distance | assumption | P |
| Stop snap cutoff | 300 m | assumption | P |
| Minimum change time, default | 60 s | assumption; sensitivity at 0 and 180 s | D |
| Minimum change time, Blake Transit Center stops 101, 103, 108, 170, 1338 | 10 s | TheRide `transfers.txt` | P |
| Scan horizon | 3 h | assumption | C |
| Modeled week | Mon Nov 30 to Sun Dec 6 2026 | GTFS service windows (TheRide to Jan 23 2027, U-M to Jan 2 2027) | P |
| Home break threshold | 150 min gap, plus 30 min must fit | assumption (CONTRACTS) | D |
| Max walk per leg, late walk cap, late hour | per persona (for example 25 min, 12 min, 22:00) | user input | D (week editor) |
| m_walk | 1.45 | [Wardman2016] urban implied; [Wardman2026] range 1.50 to 1.75 | D |
| m_wait | 1.50 | [Wardman2016], [Wardman2026]; [Fan2016] 1.21 to 1.3 as perception reference | D |
| m_bike | 1.00 | assumption, informed by [Whalen2013] | D |
| Arrival slack weight | 1.00 | assumption | C |
| Dark bike factor k_bd | 0.67 | assumption, ratio ln(1.38)/ln(1.62) from [Uttley2017] | D |
| Long dark wait threshold | 10 min | [Fan2016] | C |
| Darkness cut | civil twilight, NOAA equations, 42.2808 N 83.7430 W | NOAA method; coordinate is the city center | C |
| Term evaluation dates | Sep 15, Oct 15, Nov 15, Dec 1 2026, equal weight | assumption | D (month toggle) |
| Weeks per month | 52/12 | arithmetic | none |
| vTime prior | LN median $15/h, log-sd 0.8; median 0.5 x wage if a wage is entered | median assumption; wage rule [Small2012] | D |
| vDark prior | LN median $10/h extra, log-sd 1.0 | assumption; sign [Uttley2017] | D |
| vStrand prior | LN median $15/trip, log-sd 1.0 | assumption; analogy to late time 3.1x IVT [Wardman2016] | D |
| wBath prior | LN median $60/mo, log-sd 0.7 | assumption | D |
| wSize prior | LN median $8/mo per 10 sq ft over 120 sq ft, log-sd 0.7 | assumption | D |
| wLight prior | LN median $20/mo per level, log-sd 0.8 | assumption | D |
| Bath coding | private 1, half 0.5, shared 0 | assumption (model.js) | C |
| Logit scale tau | $25/month | assumption; recovery test varies 0.5x to 2x | D |
| Particles N | 4000 | assumption; raise if min ESS < 400 in the recovery test | C |
| Resample trigger | ESS < N/2 | [Chopin2002] practice | C |
| Metropolis steps, proposal sd | 2 steps, 0.5 x weighted log-sd | assumption | C |
| Picks | min 3, max 6 | assumption (product) | D |
| Stop rule | top P(best) >= 0.8 or best IG < 0.05 nats | assumption | D |
| "Mostly prior" flag | posterior/prior 80% width ratio > 0.7 | assumption | C |
| Scenario weeks K | 24 | assumption | C |
| Posterior draws M for ranking | 200 | assumption | C |
| Dots per home | 50 | [Fernandes2018] | none |
| HOP frame | 400 ms | [Hullman2015] | C |
| Welfare tie tolerance | 1e-9 x (1 + max abs value) | assumption | C |
| EF check tolerance | 1e-6 dollars | assumption (CONTRACTS) | C |
| Max members for enumeration | 6 | 720 assignments; [Procaccia2018] approach | C |
| Posterior samples for EF rate | 100 | [Peters2022] used m = 100 | C |
| Commute compensation in rent split | off | design choice, [Gal2017] invariance argument | D (toggle) |
| Nonnegative rents | on, dropped and flagged if infeasible | [GoldmanProcaccia2014] | none |
| Operator groups per house | 200 | assumption | C |
| Operator population | 2000 students | assumption | C |
| Population marginals | Central 0.5, North 0.3, Medical 0.2; job 0.4; late study 0.5; gym 0.4 | assumption | D (Operator screen) |
| Aggregate floor k | 10 | assumption; method [Sweeney2002] | C |
| Homes and rooms | about 30 homes, rents and rooms | SYNTHETIC | file |

---

## 5. Validation plan

Each test writes a JSON summary to `web/public/data/evidence/` that the Evidence view renders with its date and
seed. A failed test is shown as failed. Nothing on stage claims a test that did not run.

### 5.1 Router

| Test | How | Pass condition | What it proves |
|---|---|---|---|
| R1 Old vs new labels | Current single-label scan vs two-label scan, all 1,192 source stops x 12 departure times, Tue | Report the count of stops with different arrivals; the new one is never later | Measures the size of the mixed-label issue on Ann Arbor data instead of guessing |
| R2 Independent reference | `pipeline/validate_router.py`: a separate Python earliest-arrival router (time-dependent Dijkstra over trips and the same footpaths and change times), written from raw GTFS, not from our bins. 500 random stop pairs x 6 times | Exact equality in seconds on all pairs, or every mismatch explained | Catches bugs in both the pipeline and the scan, since the code paths share nothing but the input |
| R3 Backward/forward consistency | Random (stop, deadline): latest departure LD from backward; forward from LD arrives by the deadline; forward from LD + 60 s does not | All pairs | Arrive-by is exact and has no off-by-one buffer asymmetry |
| R4 FIFO monotonicity | Later departure never gives earlier arrival; later deadline never gives earlier latest departure | All sampled pairs | Basic timetable sanity |
| R5 Sort order | For every trip, connection indices increase with stop_sequence | All trips | Zero-duration hops are scanned in order |
| R6 r5py (optional) | `pipeline/r5_validate.py`: 24 places x 30 homes, Tue Dec 1 2026 08:00, `departure_time_window` = 10 min passed explicitly, percentile 50, `speed_walking` = 4.68 km/h, `max_time_walking` and `max_time` set to ours. Quorum runs a forward scan at every minute of the window and takes the median with unreachable minutes as infinite | Report median absolute error, share within +/- 2 min, and agreement on unreachable pairs | External agreement with a widely used engine, compared fairly (median over the same window) [Conway2017R5, r5pyDocsTTM] |
| R7 Change-time sensitivity | Rerun one persona's ranking at chg = 0, 60, 180 s | Report whether the top 3 change | Shows how much the 60 s assumption matters |

R6 needs Java 21 and an OSM PBF extract, which the project does not have (`*.osm.pbf` is gitignored and absent).
It is wave 3 and is dropped first. R2 is the required external check.

### 5.2 Fair division (scripts/lp_props.mjs and test/fair.test.mjs)

| Test | Pass condition | What it proves |
|---|---|---|
| F1 Random instances n = 2..6, 2000 seeded cases | Checker: envy >= -1e-6, sum p = R within 1e-6, caps respected when feasible | The certificate is true for every output |
| F2 Maximin optimality | For n = 2, compare with the closed form; for n <= 4, compare with a fine grid search over prices | The LP finds the maximin, not just any EF split |
| F3 Invariance | Adding a constant to one member's values leaves the EF price set unchanged (check that the old prices stay EF) | Implements the [Gal2017] invariance the commute decision relies on |
| F4 AAAI infeasibility | R = 1000, values (800, 200) for both, caps 600 each: feasible = false, z* = 200 | Matches the published counterexample [Procaccia2018] |
| F5 Tie trap | R = 1000, two identical members valuing (600, 400), caps A = 450, B = 700: solver must return A in room 2 at 400 and B in room 1 at 600 | Enumerating all efficient assignments works; a one-assignment solver fails this |
| F6 Negative price | R = 100, both value (300, 0): EF forces (200, -100); output flags the negative price | Fallback path works and is visible |
| F7 Slack proposition | Perturb values by L1 <= s; prices stay EF | The stability sentence on screen is true [Peters2022] |
| F8 Spare room | 5 members, 6 rooms: unassigned room priced at asking, no member envies it | Apartment case is handled |
| F9 Timing | Report p50 and max solve time per house at n = 5 and 6 | Runtime claims are measured |

### 5.3 Preference recovery (scripts/recovery.mjs, writes evidence/recovery.json)

Setup: one persona's real routine, real WeekResults for all homes across K scenarios (precomputed once in Node).
300 synthetic students with true theta drawn from the prior, plus a stress set off the prior (vTime at 0.3x and 3x
the prior median, vDark at the prior's 95th percentile). Answers simulated by the logit at tau scaled 0.5x, 1x, 2x.
Policies: BALD, random pairs from the same pool, and a fixed non-adaptive set of 6. Seeded RNG.

Reported after 0 to 6 picks, per policy and noise level:
(a) coverage of 80% intervals for vTime, vDark, vStrand (target near 80%; report the number, do not tune to it);
(b) median absolute error of log vTime; (c) P(recommended home = true best home); (d) median and p90 regret in
dollars per month of the recommended home against the true best; (e) minimum ESS seen.

What it proves: the intervals are honest (coverage), the picks improve the decision (regret, top-1), adaptive
selection earns its complexity (BALD vs random), and the method survives noisier answers, where question-selection
methods can rank differently [SaureVielma2019]. The slide shows the regret curve. If BALD does not beat random, the
slide says so.

### 5.4 Sanity checks (test/*.test.mjs)

| Check | Pass condition |
|---|---|
| Civil dusk Dec 1 2026 | Sunset between 16:50 and 17:15 local, civil dusk 25 to 40 min after sunset; Sep 15 dusk after 19:45 (EDT) |
| Known trips | Smoke trips match the published route timetables by hand check (UgLi to Pierpont Tue 10:00: NX at 10:10, arrive 10:21) |
| Walk and bike | walkSec symmetric within 5% on undirected streets; bikeSec <= walkSec for trips over 1 km when a bike path exists |
| Rent monotonicity | Raising one home's rent by $50 never raises its P(best) or lowers its expected regret |
| vTime monotonicity | Raising vTime never lowers the rank of the home with the lowest G among two otherwise tied homes |
| Darkness monotonicity | Moving the term date from Dec 1 to Sep 15 never increases any home's dark minutes |
| Stranded | A trip after the last bus with walk above the late cap is stranded; FlexRide caveat text renders |
| Labels | SAMPLE DATA / SYNTHETIC labels are present on every view (DOM test or manual checklist) |
| Offline | Section 2 rehearsal test passes with Wi-Fi off |
| No NaN | Every rendered number is finite; engine throws on NaN in tests |

---

## 6. Interfaces: amendments to CONTRACTS.md

The integrator applies these to `engine/CONTRACTS.md` (this document does not edit it). "Confirm" means unchanged.

### graph.js
- `nearest`, `dijkstra`, `path`: confirm.

### transit.js
- `forward(day, sources, horizon)`, `backward(day, sinks, horizon)`: signatures confirm; semantics amended to two
  labels per stop (section 3.1). Snapshot keeps `{t, kind, pa, pb, day}` so plan.js needs no change, with
  `t[s] = min(rideArr, footArr)` (forward) or `max(rideDep, footDep)` (backward). Seeds no longer appear in `t`.
  New snapshot fields: `ride`, `foot` (Float64Array), `rideParent`, `footParent` (Int32Array pairs), and per trip
  `via` (RIDE, FOOT or SEED at the boarding stop) so `legsForward` and `legsBackward` can follow the right parent.
- `transferBuffer` (scalar) replaced by `change: Int32Array(nStops)` read from `meta.change`, default 60 s.
  `setChangeDefault(sec)` for the sensitivity toggle.
- New: `legsForward` / `legsBackward` return `null` only when no ride exists; `kind` of the egress stop is RIDE or
  FOOT, never ACCESS.
- Optional (wave 3): `meta.blockNext: Int32Array(nTrips)` for stay-seated interlining.

### pipeline/build_transit.py
- Sort key explicit `(dep, arr, trip, seq)`; assert per-trip index order.
- Emit `meta.change` from `transfers.txt` (`min_transfer_time` where `from_stop_id == to_stop_id`, else default)
  and apply `max(walk, min_transfer_time)` to footpaths between listed stop pairs (build_walk.py).
- Emit `meta.blockNext` (optional).

### plan.js
- `addPoint`, `walkSec`, `bikeSec`, `arriveBy`, `leaveAt`, `legs`, `pathCoords`: confirm.
- New: `breakdown(result, homeId) -> { walkSec, waitSec, rideSec, transferSec, slackSec, walks: [[t0,t1]],
  waits: [[t0,t1]] }`, rebuilt from `result.snap` without a new scan.
- `DEFAULTS` move to `config.js`; `Planner` reads them via `opts`.

### model.js
- `PARAMS`, `PARAM_INFO`, `samplePrior`, `roomFeatures`, `roomValue`, `utility`, `phi`: confirm.
- `travelFeatures(week, cfg)` amended: `hoursPerMonth` becomes generalized hours
  `(rideMin + slackMin + m_walk*walkMin + m_wait*waitMin + m_bike*bikeMin)/60 * WPM`; `darkHoursPerMonth` uses
  `darkWalkMin + k_bd*darkBikeMin + darkLongWaitMin`, term-weighted.
- `samplePrior(r, overrides)` accepts per-parameter median and sigma (wage rule, drawer edits).
- Option price: `rent` field means `asking + utilities/rooms` in Me mode. Documented, not computed in model.js.

### config.js (new, integrator)
- `export const CONFIG = {...}` with every constant in section 4; `withOverrides(partial) -> config`. Every engine
  function that uses a constant takes an optional `cfg`.

### week.js and solar.js
- `evaluateWeek(planner, routine, homeIds, opts)`: confirm signature. `opts.dates: [{date, w}]` replaces
  `opts.date` (default the four term dates). WeekResult adds `slackMin`, `darkBikeMin`, `darkLongWaitMin`,
  `genMin`, `darkByDate: {date: minutes}`; keeps `weeklyMin` (raw door-to-door minutes, for display).
- `sampleWeeks(routine, k, seed)`: confirm; each returned routine carries `attrs` (which `alt` was drawn per entry)
  for EVPPI and scenario discovery.
- `dusk(dateStr)`, `dawn(dateStr)`: confirm; add `sunset(dateStr)` for the sanity test.

### prefs.js
- `createPosterior({n, seed, prior})`: confirm, `prior` overrides added.
- `update(post, optA, optB, choice)`: `choice` is `'A' | 'B' | 'skip'` (was boolean `choseA`); `'skip'` records
  nothing. tau from cfg.
- `nextPair(post, candidates) -> { i, j, ig, mu, s2 }` (was `[i, j]`).
- `summary(post) -> { [param]: { median, lo, hi, priorRatio, mostlyPrior } }` (median replaces mean, plus the
  identification flag).
- `draws(post, k, seed)`: confirm.
- New: `shouldStop(post, nPicks, topPBest, bestIG, cfg) -> { stop, reason }`.
- `recoveryTest({ trials, picks, seed, policy: 'bald'|'random'|'fixed', tauScale, offPrior })` returns
  `{ coverage, medianIntervalWidth, maeLogVTime, top1, regretP50, regretP90, minESS, perPick: [...] }`.
- Rejuvenation: Metropolis move (amended from log-space jitter).

### fair.js and simplex.js
- `solveLP({ c, Aub, bub, Aeq, beq, lb, ub }) -> { status: 'optimal'|'infeasible'|'unbounded', x, obj }` in
  simplex.js; maximize `c . x`.
- `solveHouse(problem, opts)`: `opts = { normalize: true, compensateCommute: false, nonneg: true, bounds: null,
  samples: null }`. Output adds `slack`, `efRate` (when `samples` given), `negativePrice: bool`,
  `binding: { minMembers: [...], capMembers: [...] }`, `efficientAssignments: n`, `check: { ok, worst }`.
  `capRelaxation` adds `worst` (z*). Amended: commute excluded from utilities unless `compensateCommute`.
- `privateGap(problem, i)`: confirm.
- `rankHouses(problems) -> [{ index, feasible, minUtility (E_h), sumUtility (W_h), worstOverrun, disagree }]`.
- Envy sign: confirm the CONTRACTS sign (own minus other, >= -1e-6 is EF).

### decide.js
- `meRank(...)` returns per home `{ homeId, roomId, expRegret, pBest, sucra, maxRegret, meanU, lo, hi,
  dots: number[50] }`, sorted by `expRegret`; adds `flag` when the P(best) leader differs.
- `breakEven(homeA, homeB, param, thetaMean)`: confirm, generalized to any of vTime, vDark, vStrand.
- New: `evpi(tensor) -> { evpi, byAttr: { [attr]: dollars } }`, `scenarioSplit(tensor, homeA, homeB) ->
  [{ attr, value, winRateA }]`.
- `groupRank(...)`: confirm, uses `fair.rankHouses`.

### operator.js
- `makePopulation({ n, seed, marginals })`: `marginals` added, IPF inside.
- `roomPricing({ home, groups, renovation, bounds })`: output per room `{ p10, p50, p90 }` plus
  `renovationDelta: { roomP50, headroom }` when `renovation` given.
- `demandMap({ homes, population, k = 10 })`: adds the k-floor; cells below k merge into `other`.

### web adapter
- `api.data.evidence` gains `lp`. `api.data.operator` is loaded from `operator.json`.
- `api.config` and `api.setConfig(partial)` for the Assumptions drawer; views recompute on change.
- Compute stays on the main thread first. A Web Worker is wave 3, only if any interaction blocks over 200 ms.

---

## 7. Build plan

Roles are parallel Claude Code builders driven by one developer. Each role owns files exclusively; anyone needing a
change in another role's file asks the integrator. Clock times are Thu Nov 19 to Fri Nov 20, Eastern.

### File ownership

| Role | Owns |
|---|---|
| Integrator | `engine/CONTRACTS.md`, `engine/config.js`, `engine/model.js`, `package.json`, `README.md`, `STATUS.md`, demo script |
| Router | `engine/transit.js`, `engine/plan.js`, `engine/graph.js`, `pipeline/build_transit.py`, `pipeline/build_walk.py`, `pipeline/validate_router.py`, `pipeline/r5_validate.py`, `test/transit.test.mjs` |
| Data | `scripts/make_data.mjs` (or `pipeline/build_homes.py`), `web/public/data/homes.json`, `web/public/data/personas.json` |
| Week | `engine/week.js`, `engine/solar.js`, `test/week.test.mjs` |
| Prefs | `engine/prefs.js`, `scripts/recovery.mjs`, `test/prefs.test.mjs` |
| Fair | `engine/fair.js`, `engine/simplex.js`, `scripts/lp_props.mjs`, `test/fair.test.mjs` |
| Decide | `engine/decide.js`, `engine/operator.js`, `scripts/build_operator.mjs`, `test/decide.test.mjs` |
| ui-shell | as CONTRACTS (App, styles, components, adapter, MeView and `views/me/*`) |
| ui-views | as CONTRACTS (Group, Operator, Evidence views and their folders) |

### Waves, ordered by demo value

Wave 0, Thu 21:30 to 23:30 (unblocks everyone)
- Integrator: apply section 6 to CONTRACTS.md; write `config.js`; amend `model.js` travelFeatures.
- Router: two-label CSA, `meta.change`, explicit sort key and assertion, `breakdown()`; R3, R4, R5 tests.
- Data: `homes.json` (about 30 synthetic homes across South Central, Kerrytown, North Campus area, Burns Park,
  Old West Side, Lower Town; 8 to 10 irregular houses with 4 to 6 rooms; labeled SYNTHETIC) and `personas.json`
  (4 to 5 fictional personas: Central-only, North Campus engineer with late lab, Medical campus shift, Kerrytown
  job, a friend group of 5).
- ui-shell: app frame, map with streets and route shapes, adapter, tokens.

Wave 1, Thu 23:30 to Fri 05:00 (Me mode core)
- Week: `evaluateWeek`, `sampleWeeks`, `solar.js`, darkness by date, stranded rule, scan cache.
- Prefs: posterior, update, BALD `nextPair`, `summary`, `shouldStop`.
- Fair: `simplex.js`, `solveHouse` with enumeration, caps, phase 1 and 2, checker, F1 to F6.
- ui-shell: Me view: week editor, home list with week strips, trip explainer, pick card.

Wave 2, Fri 05:00 to 09:30 (decision and group)
- Decide: `meRank`, `breakEven`, `evpi`, `scenarioSplit`, `groupRank`.
- ui-shell: ranking with dotplots, P(best), regret, the four sensitivity toggles, Assumptions drawer.
- ui-views: Group view: members, private caps, house ranking, envy matrix, slack sentence, infeasible state.
- Prefs: `recovery.mjs` and `evidence/recovery.json`.
- Router: R1 and R2 (`validate_router.py`), `evidence/router.json`.
- Fair: F7 to F9, EF rate, `evidence/lp.json`.

Wave 3, Fri 09:30 to 12:30 (operator, evidence, polish)
- Decide: `operator.js`, `build_operator.mjs`, `operator.json`.
- ui-views: Operator view (room pricing, renovation lever, demand map), Evidence view.
- ui-shell: HOP animation, CDF toggle.
- Router (optional): interlining, R6 r5py, memory trim in `addPoint`.
- Fair (optional): stable-split LP toggle.

Cut line: Fri 11:00. Anything in wave 3 not merged and passing tests by 11:00 is dropped, in this order: r5py (R6),
interlining, Web Worker, stable-split LP, HOP animation, demand map, renovation lever. The operator per-room
pricing and the Evidence view stay if at all possible, because the housing-company judges and the 20-point
evidence criterion depend on them.

Freeze, Fri 12:30 to 13:30
- Integration pass, `node --test test/`, `npm run build`, offline rehearsal (section 2), every label check.
- Run the demo from a clean clone on a presenter's laptop. Update `STATUS.md` with run steps and known gaps.
- Demo path for the 5 minutes: (1) ORD-24-03 timeline and the question, 30 s; (2) Me mode: a North Campus
  engineer persona, week strip in two homes, four auto-answered picks, ranking with dotplots, 2 min; (3) toggle the
  lab to Central and the month to September, show what moves and what stays, 45 s; (4) Group: five friends, envy
  matrix, lower one cap until infeasible, 1 min; (5) Operator: one irregular house, room rents, add a bath, 30 s;
  (6) Evidence: router check, recovery curve, 15 s.
- 13:30: handoff to presenters. No code changes after handoff.

---

## 8. Risks and mitigations

### Engineering risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Two-label CSA introduces a regression | medium | R2 to R5 run before merge; old scan kept as `forwardLegacy` until R1 and R2 pass |
| LP numerics (degeneracy, cycling, ties) | medium | Bland's rule, tolerances, independent checker blocks a wrong matrix; F1 to F6 |
| Browser memory from per-point trees | low | 73 MB estimate; trim plan in section 2 |
| BALD slower than expected | low | prefilter to 200 pairs |
| Particle degeneracy | low | ESS shown in a debug panel; Metropolis move; recovery test reports min ESS |
| Wave 3 not ready | medium | cut line at 11:00, drop order fixed above |
| Presenters cannot run it | medium | clean-clone rehearsal at 12:30, `web/dist` zip fallback, STATUS.md run steps |
| Accidental remote call breaks offline demo | low | CSP meta tag, Wi-Fi-off rehearsal |

### What judges will attack, and the answer

| Attack | Answer |
|---|---|
| "The homes are fake." | Yes, labeled synthetic, as the case sheet allows. The timetables, streets and places are real; the method takes any listing file. |
| "Six clicks cannot learn six parameters." | Agreed. We learn the three travel weights mostly, label the rest "mostly prior", and show the recovery curve. |
| "December timetable, September lease." | The feeds' service windows start Nov 15 (TheRide) and cover the modeled week; we say the week is a proxy, and daylight is computed per term date. |
| "Probability of best is misleading." | We sort by expected regret and show P(best) beside it, for that reason [Rucker2015]. |
| "Why not Google Maps?" | Offline, no keys, exact arrive-by, and one scan prices a trip for every home; a per-request API cannot do that on a laptop with no network. |
| "Is the router right?" | R2 independent reference and, if it ran, r5py with the median-over-window comparison [Conway2017R5]. |
| "Envy-free by whose values?" | By each member's inferred values. The slack sentence and EF rate say how much error it tolerates [Peters2022]. |
| "Can a roommate game it?" | Every envy-free rule can be gamed [Gal2017, Procaccia2018]; we do not claim otherwise. |
| "Where does the darkness cost come from?" | Behavior evidence fixes the sign [Uttley2017]; the size comes from your own picks, with an interval. |
| "Students ride free, so why count transit?" | We count time, not fares; fares are not modeled. |
| "Late night there is FlexRide." | Correct, it is on demand and not in GTFS [TheRideFY25]; stranded counts carry that caveat. |
| Housing judges: "What do I get?" | Room-level rents for irregular houses that a group of students would accept without envy, the effect of a renovation in dollars, and which kinds of student weeks each house fits, from a synthetic population until real data exists. |
| YC judge: "Where is the AI?" | The adaptive question selection and Bayesian inference are the learning system; no LLM, on purpose, because it must run offline and every output must be traceable. |
| "What data do you collect?" | A week, mode limits, an optional wage, a private cap. No demographics. Caps never leave the solver. |

### Known limitations to state plainly
- Walking speed 1.3 m/s for everyone; no hills, no snow.
- Footpaths between stops capped at 500 m; longer transfers missed.
- No real-time delays; schedules are taken as exact.
- Stated-preference picks likely understate value of time [Small2012].
- European and UK meta-analyses are not US-specific; [Wardman2026] covers 52 countries but only its abstract was
  read.
- Fall weeks share a December timetable proxy.

---

## 9. References

Verified means the page or text was opened this session by the research agents. Unverified sources are cited only
for the origin of an idea.

Routing
- [Dibbelt2017CSA] Dibbelt, Pajor, Strasser, Wagner. Connection Scan Algorithm. arXiv:1703.05997, 2017. https://arxiv.org/abs/1703.05997 (verified)
- [Delling2012RAPTOR] Delling, Pajor, Werneck. Round-Based Public Transit Routing. ALENEX 2012; Transportation Science 2015. https://www.microsoft.com/en-us/research/publication/round-based-public-transit-routing/ (verified)
- [Witt2015TB] Witt. Trip-Based Public Transit Routing. ESA 2015, LNCS 9294. https://arxiv.org/abs/1504.07149 (verified)
- [Baum2019ULTRA] Baum, Buchhold, Sauer, Wagner, Zuendorf. UnLimited TRAnsfers for Multi-Modal Route Planning: An Efficient Solution. ESA 2019, LIPIcs 144. https://arxiv.org/abs/1906.04832 (verified)
- [Bast2015Survey] Bast et al. Route Planning in Transportation Networks. arXiv:1504.05140; LNCS 9220, 2016. https://arxiv.org/abs/1504.05140 (verified, abstract level)
- [Conway2017R5] Conway, Byrd, van der Linden. Evidence-Based Transit and Land Use Sketch Planning Using Interactive Accessibility Methods on Combined Schedule and Headway-Based Networks. TRR 2653, 2017. https://d1rbsgppyrdqq4.cloudfront.net/s3fs-public/c160/TRB_17-06602_TRR_manuscript_preprint.pdf (verified)
- [r5pyDocsTTM] r5py developers. r5py user manual: Travel-time matrices. https://r5py.readthedocs.io/stable/user-guide/user-manual/travel-time-matrices.html (verified)

Accessibility and time geography
- [Kwan1998] Kwan. Space-time and integral measures of individual accessibility: a comparative analysis using a point-based framework. Geographical Analysis 30(3), 1998. https://experts.illinois.edu/en/publications/space-time-and-integral-measures-of-individual-accessibility-a-co/ (verified, abstract)
- [Hansen1959] Hansen. How Accessibility Shapes Land Use. JAIP 25(2), 1959. https://doi.org/10.1080/01944365908978307 (unverified)
- [Hagerstrand1970] Hagerstrand. What about people in Regional Science? Papers of the RSA 24, 1970. https://link.springer.com/article/10.1007/BF01936872 (unverified)
- [Miller1991] Miller. Modelling accessibility using space-time prism concepts within geographical information systems. IJGIS 5(3), 1991. https://www.tandfonline.com/doi/abs/10.1080/02693799108927858 (unverified)

Preferences and values of time
- [Houlsby2011] Houlsby, Huszar, Ghahramani, Lengyel. Bayesian Active Learning for Classification and Preference Learning. arXiv:1112.5745. https://arxiv.org/abs/1112.5745 (verified)
- [SaureVielma2019] Saure, Vielma. Ellipsoidal Methods for Adaptive Choice-Based Conjoint Analysis. Operations Research 67(2), 2019. https://juan-pablo-vielma.github.io/publications/Ellipsoidal-Methods.pdf (verified)
- [Train2009] Train. Discrete Choice Methods with Simulation, 2nd ed. Cambridge University Press, 2009. https://eml.berkeley.edu/books/choice2.html (verified)
- [Small2012] Small. Valuation of Travel Time. Economics of Transportation 1(1-2), 2012. https://sites.socsci.uci.edu/~ksmall/VOT%20review.pdf (verified)
- [Wardman2016] Wardman, Chintakayala, de Jong. Values of travel time in Europe: Review and meta-analysis. TR Part A 94, 2016. https://eprints.whiterose.ac.uk/id/eprint/104595/1/European%20meta%20paper%20final%20accepted%20for%20publication.pdf (verified)
- [Wardman2026] Wardman, Murphy, Ojeda-Cabral, Mitrani, Neki, Humphreys. Value of time multipliers for walk time, wait time, service headway, displacement time, reliability and congested travel time: review and meta-analysis of worldwide evidence. TR Part A 207, 2026. https://eprints.whiterose.ac.uk/id/eprint/239301 (verified, abstract)
- [AbrantesWardman2011] Abrantes, Wardman. Meta-analysis of UK values of travel time: An update. TR Part A 45(1), 2011. https://www.worldtransitresearch.info/research/3749 (verified)
- [Wardman2004] Wardman. Public transport values of time. Transport Policy 11(4), 2004. https://eprints.whiterose.ac.uk/3393 (verified, abstract)
- [Wardman2013TRB] Wardman. Value of Time Multipliers: A Review and Meta-Analysis of European-Wide Evidence. TRB 92nd Annual Meeting, 2013. https://eprints.whiterose.ac.uk/id/eprint/225392 (verified, abstract)
- [Chopin2002] Chopin. A sequential particle filter method for static models. Biometrika 89(3), 2002. https://econpapers.repec.org/RePEc:oup:biomet:v:89:y:2002:i:3:p:539-552 (verified, abstract)
- [LiuWest2001] Liu, West. Combined Parameter and State Estimation in Simulation-Based Filtering. In Sequential Monte Carlo Methods in Practice, Springer, 2001. https://dx.doi.org/10.1007/978-1-4757-3437-9_10 (unverified)
- [ToubiaHauserSimester2004] Toubia, Hauser, Simester. Polyhedral Methods for Adaptive Choice-Based Conjoint Analysis. JMR, 2004. https://dspace.mit.edu/handle/1721.1/1832 (unverified)
- [YuGoosVandebroek2011] Yu, Goos, Vandebroek. Individually adapted sequential Bayesian conjoint-choice designs in the presence of consumer heterogeneity. IJRM 28(4), 2011. https://econpapers.repec.org/RePEc:eee:ijrema:v:28:y:2011:i:4:p:378-388 (unverified)

Fair division and group choice
- [Gal2017] Gal, Mash, Procaccia, Zick. Which Is the Fairest (Rent Division) of Them All? JACM 64(6), 2017; IJCAI 2017 extended abstract. https://procaccia.info/wp-content/uploads/2020/03/rent.pdf and https://www.ijcai.org/proceedings/2017/678.md (verified)
- [Procaccia2018] Procaccia, Velez, Yu. Fair Rent Division on a Budget. AAAI 2018. https://procaccia.info/wp-content/uploads/2020/03/rent-budget.pdf (verified)
- [Peters2022] Peters, Procaccia, Zhu. Robust Rent Division. NeurIPS 2022. https://papers.neurips.cc/paper_files/paper/2022/file/5a1a10c2c2c9b9af1514687bc24b8f3d-Paper-Conference.pdf (verified)
- [ProcacciaSchifferZhang2024] Procaccia, Schiffer, Zhang. Multi-Apartment Rent Division. arXiv:2403.08051. https://arxiv.org/abs/2403.08051 (verified, abstract)
- [Gangam2025] Gangam, Taherijam, Vazirani. Fair Rent Division: New Budget and Rent Constraints. arXiv:2510.05434. https://arxiv.org/abs/2510.05434 (verified, abstract)
- [ShapleyShubik1971] Shapley, Shubik. The Assignment Game I: The Core. RAND R-874; IJGT 1(1). https://www.rand.org/pubs/reports/R874.html (verified, abstract)
- [DGS1986] Demange, Gale, Sotomayor. Multi-Item Auctions. JPE 94(4), 1986. https://ideas.repec.org/a/ucp/jpolec/v94y1986i4p863-72.html (verified, abstract)
- [GoldmanProcaccia2014] Goldman, Procaccia. Spliddit: Unleashing Fair Division Algorithms. SIGecom Exchanges 13(2), 2014. https://procaccia.info/wp-content/uploads/2020/03/spliddit.pdf (verified)
- [Barile2023] Barile et al. Evaluating explainable social choice-based aggregation strategies for group recommendation. UMUAI 34, 2024. https://link.springer.com/content/pdf/10.1007/s11257-023-09363-0.pdf (verified)

Evidence for the model and the problem
- [Uttley2017] Uttley, Fotios. Using the daylight savings clock change to show ambient light conditions significantly influence active travel. J. Environmental Psychology 53, 2017. https://eprints.whiterose.ac.uk/140125/1/1-s2.0-S0272494417300762-main.pdf (verified)
- [Fotios2015] Fotios, Unwin, Farrall. Road lighting and pedestrian reassurance after dark: A review. Lighting Research and Technology 47(4), 2015. https://eprints.whiterose.ac.uk/id/eprint/87527 (verified, abstract)
- [Fan2016] Fan, Guthrie, Levinson. Waiting time perceptions at transit stops and stations: Effects of basic amenities, gender, and security. TR Part A 88, 2016. https://econpapers.repec.org/RePEc:eee:transa:v:88:y:2016:i:c:p:251-264 (verified, abstract)
- [Whalen2013] Whalen, Paez, Carrasco. Mode choice of university students commuting to school and the role of active travel. J. Transport Geography 31, 2013. https://ideas.repec.org/a/eee/jotrge/v31y2013icp132-142.html (verified, abstract)
- [Burzacchi2024] Burzacchi, Rossi, Agasisti, Paganoni, Vantini. Urban mobility and learning: analyzing the influence of commuting time on students' GPA at Politecnico di Milano. arXiv:2407.11893; Studies in Higher Education 2024. https://arxiv.org/abs/2407.11893 (verified, abstract; cited qualitatively, no numbers)
- [StudentMoveTO2022] Toronto Metropolitan University news. Research says your commute impacts your academic success. 7 June 2022. https://www.torontomu.ca/content/ryerson/news-events/news/2022/06/research-says-commute-impacts-your-academic-success/ (verified; news release on a self-reported survey)
- [AnnArborORD24-03] City of Ann Arbor. Ordinance ORD-24-03, Sections 8:530 and 8:531. Adopted 4 March 2024. https://a2gov.org/media/yp5mecxm/ord-24-03-approval-notice.pdf (verified; later amendments, if any, not read)
- [AnnArborORD22-15] City of Ann Arbor. Ordinance ORD-22-15, Right to Renew and Relocation Assistance. Adopted 3 October 2022. https://a2gov.org/media/lpijxcs2/elo-rtr.pdf (verified; superseded)
- [TheRideFY25] AAATA. TheRide FY25 Highlights (Citizen Report), March 2026. https://www.theride.org/sites/default/files/2026-03/FY25%20Citizen%20Report_3.10.26.pdf (verified)

Decision support, synthesis and privacy
- [Kay2016] Kay, Kola, Hullman, Munson. When(ish) is My Bus? User-centered Visualizations of Uncertainty in Everyday, Mobile Predictive Systems. CHI 2016. https://idl.uw.edu/papers/when-ish-is-my-bus (verified)
- [Fernandes2018] Fernandes, Walls, Munson, Hullman, Kay. Uncertainty Displays Using Quantile Dotplots or CDFs Improve Transit Decision-Making. CHI 2018. https://mucollective.northwestern.edu/project/uncertainty-bus (verified)
- [Hullman2015] Hullman, Resnick, Adar. Hypothetical Outcome Plots Outperform Error Bars and Violin Plots for Inferences about Reliability of Variable-Ordering. PLOS ONE 2015. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0142444 (verified)
- [Rucker2015] Rucker, Schwarzer. Ranking treatments in frequentist network meta-analysis works without resampling methods. BMC Med Res Methodol 15:58, 2015. https://pmc.ncbi.nlm.nih.gov/articles/PMC4521472 (verified)
- [Lempert2003] Lempert, Popper, Bankes. Shaping the Next One Hundred Years. RAND MR-1626-RPC, 2003. https://www.rand.org/pubs/monograph_reports/MR1626.html (verified, summary page; regret criterion not read)
- [Rosen1974] Rosen. Hedonic Prices and Implicit Markets: Product Differentiation in Pure Competition. JPE 82(1), 1974. https://econpapers.repec.org/RePEc:ucp:jpolec:v:82:y:1974:i:1:p:34-55 (verified, bibliographic record only)
- [Allenby2014] Allenby, Brazell, Howell, Rossi. Economic valuation of product features. QME 12(4), 2014. https://econpapers.repec.org/RePEc:kap:qmktec:v:12:y:2014:i:4:p:421-456 (verified, abstract)
- [Beckman1996] Beckman, Baggerly, McKay. Creating synthetic baseline populations. TR Part A 30(6), 1996. https://ideas.repec.org/a/eee/transa/v30y1996i6p415-429.html (verified, abstract)
- [ActivitySimCDAP] ActivitySim consortium. Coordinated Daily Activity Pattern, v1.3.1 developer guide. https://activitysim.github.io/activitysim/v1.3.1/dev-guide/components/cdap.html (verified)
- [Sweeney2002] Sweeney. k-Anonymity: a model for protecting privacy. IJUFKS 10(5), 2002. https://dataprivacylab.org/projects/kanonymity/ (verified)
- [DworkRoth2014] Dwork, Roth. The Algorithmic Foundations of Differential Privacy. FnT TCS, 2014. https://www.cis.upenn.edu/~aaroth/privacybook.html (verified, book page; mechanism details from general knowledge)

Cited only through other sources (not opened): Svensson 1983 and Velez 2015 (via [Procaccia2018]); Green and
Laffont 1979 (via [Gal2017]); Alkan, Demange and Gale 1991 (via [Procaccia2018]); Salanti et al. 2011 (via
[Rucker2015]); Masthoff 2004 (via [Barile2023]); Savage 1951 minimax regret and EVPI (textbook definitions, no
source opened).

Data sources (cited on screen with dates): TheRide (AAATA) GTFS feed version S1000304, service Nov 15 2026 to
Jan 23 2027; U-M Transit GTFS feed version S1000100, service Aug 23 2026 to Jan 2 2027; OpenStreetMap contributors
(ODbL), downloaded through osmnx and cached in `data/raw/osm`.

---

## 10. Final decisions after the critique (binding; overrides anything above)

Written Thu Nov 19 21:50 by the integrator after the adversarial review. Where this section and sections 1 to 9
disagree, this section wins.

Scope cuts (not built): SUCRA, minimax regret, EVPPI, scenario discovery and `scenarioSplit`; hypothetical outcome
plots and the CDF toggle; IPF (the population is drawn independently from stated shares, and we say so); the
demand-map k-floor (stated as a principle in Q&A instead); the stable-split LP; interlining (`blockNext`);
Metropolis moves (rejuvenation is systematic resampling plus log-space jitter, `cfg.jitterSd`); Web Worker.

Kept and fixed:
1. Router: two labels per stop, `meta.change` from TheRide `transfers.txt`, sort key (dep, arr, trip, seq) with a
   build assertion, `breakdown()`. Tests R3, R4, R5. R2 (independent Python reference router) is required. R6
   (r5py) is now possible: Java 21 is installed at `C:/Program Files/Eclipse Adoptium/jdk-21.0.13.9-hotspot`,
   r5py 1.1.7 imports, and `data/raw/osm/ann_arbor.osm.pbf` exists (5.8 MB). R6 runs after R2 passes.
2. Constants live in `engine/config.js`. Walk 1.45 and wait 1.50 cite Wardman2016 only. Mode choice per trip is by
   minimum generalized minutes, not raw minutes. vStrand's prior is a pure assumption (the 3.1x "late time" figure
   is late arrival, not late night, and is not cited for it).
3. A Sept to Aug lease spans fall and winter. Darkness is averaged over six dates (`cfg.termDates`, Sep 15 to
   Feb 15), with the December timetable as the proxy for both terms, stated on screen. Copy says the fall schedule
   is "not final when you sign", never "not set".
4. Prefs: stop when the best question's information gain is under `cfg.stopIG`, or when one home has P(best) of at
   least `cfg.stopPBest` on the single most likely week (not across scenarios), or at `cfg.picksMax`. Stage line:
   "each question is the one whose answer teaches the model the most". The recovery slide leads with the off-prior
   stress set and BALD vs random regret; prior-drawn coverage is described as a correctness check.
5. Fair division:
   - Members' room values come from each persona's own theta (labeled "demo values") or from their learned
     posterior, never from a shared prior. Test: the demo group's envy matrix has nonzero off-diagonal entries and
     at least two members whose favorite room differs.
   - Commute compensation adds -c_i(h) after Spliddit normalization, to the maximin objective rows only; the
     envy-free rows are unchanged. Test that it changes prices when commutes differ.
   - Whole-house lease: the group pays all of R. If a house has more rooms than members, the extra rooms are
     common space (value 0 to everyone, not assigned, still inside R). The "priced at asking" rule applies only
     to per-room leases.
   - Infeasible caps: phase 1 minimizes the worst cap overrun z over every efficient assignment; phase 2 maximizes
     t over every efficient assignment whose phase-1 z is within tolerance of z*. t is a free variable.
   - Certificate: the envy matrix shows per-pair margins in dollars. Add the maxislack LP (maximize s subject to
     envy[i][j] >= s for all pairs, sum p = R, caps): report "the most robust split tolerates value errors up to
     $s" only when s > $1 [Peters2022 Prop 3.1]. The EF rate over posterior samples is reported as measured.
6. Operator: per-room rents are "an envy-free split for typical synthetic groups", shown with the prior medians
   that drive them, plus live sliders for the wBath and wSize medians. No market-clearing claim on stage.
7. Delivery: `web/dist` ships with a zero-dependency server (`serve.mjs` for Node and the documented
   `python -m http.server` fallback). The offline check is a Wi-Fi-off run with the DevTools network tab, plus a
   Content-Security-Policy meta tag. No grep check.
8. Golden path first: one persona (Jordan, North Campus engineer with a late lab) and one group of five are wired
   end to end and tested before any extra feature.
9. Handoff kit (owner: integrator, Friday morning): `docs/DEMO.md` (a demo of about 4:15, Evidence moved to Q&A,
   Operator kept to one house), `docs/QA.md` (plain-words answers on CSA, BALD, the maximin LP, what is synthetic,
   what is assumed, the judge-attack table), a short slide set, a backup screen recording, and a presenter dry run
   before 13:30.

Timeline: Wave A (all builders in parallel) Thu 21:55 to about 23:30. Integration Thu 23:30 to Fri 00:50. Friday
morning: operator data, evidence JSON, polish, handoff kit. Hard feature cut Fri 09:30. Integration, a presenter
laptop run with Wi-Fi off, and rehearsal 10:00 to 13:30.
