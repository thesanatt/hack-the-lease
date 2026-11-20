# Router validation (R2 and R6)

This file records exactly what was run to check the Quorum transit router, what came out, and why
every difference happened. The JSON summaries are in `web/public/data/evidence/router.json` (R2) and
`web/public/data/evidence/r5.json` (R6). Both carry their run time, seed, and the hashes of the engine
and data they compared.

Version compared: `engine/transit.js` sha1 `d2d787f207a9` (two labels per stop: ride and foot, per-stop
change times from `meta.change`), `meta.json` sha1 `c020ff30aee0`, `conn_mon.bin` (serves Tuesday) sha1
`8552208b8927`. Both runs were made on Thu Nov 19 2026 between 21:55 and 22:10 ET on the team laptop
(Windows 11, Node 22, Python 3.11).

## R2: independent reference router

### What was run

```
python pipeline/validate_router.py --pairs 500 --all-targets
```

- `pipeline/validate_router.py` is a separate earliest-arrival router in Python. It reads the raw GTFS
  zips (`data/raw/aaata/google_transit.zip`, `data/raw/umich/google_transit.zip`): calendar,
  calendar_dates, routes, trips, stops, stop_times. It never reads `conn_*.bin`.
- From `meta.json` it takes only the inputs both routers are defined on: the service date for the day
  (`days.tue.date` = 2026-12-01), the stop index (so stop numbers mean the same thing on both sides), the
  walking footpaths (`footpaths`) and the change times (`change`, with -1 meaning the 60 s default read
  from `engine/config.js`).
- Algorithm: time-dependent Dijkstra keyed on "ready to board" time per stop. A trip is boarded at the
  lowest position reached so far, so each stop time is relaxed once per query. It honors GTFS
  `pickup_type` and `drop_off_type`. The engine is a connection scan; the two share no code.
- Journey model (section 3.1 of SYSTEM_DESIGN.md): start at a stop at t0, one or more rides; between
  rides either stay at the stop (change time after the arrival) or take one footpath (its duration
  already includes the change); one footpath may follow the last ride. The answer is the earliest
  arrival by vehicle or by a footpath after a vehicle. Same service day only.
- Engine side: `scripts/our_times.mjs` loads `meta.json` and the conn files as `engine/load.js` does and
  calls `Timetable.forward('tue', [{stop, t}], 48 h)`. The 48 h horizon removes the product's 3 h scan
  cut so only routing is compared.
- Sample: 500 distinct stop pairs drawn uniformly from the 1,184 stops served on Tue Dec 1 2026
  (numpy `default_rng(2026)`), each at 06:30, 08:00, 10:15, 13:00, 17:30 and 21:00. That is 3,000
  queries. `--all-targets` also compares every served stop as a target for each of the 3,000
  (source, time) scans: 3,549,000 stop arrivals.
- The script refuses to compare if `meta.json` changes between the two loads (it did once during
  development, while the pipeline was rebuilding it, and produced a false alarm).

### Result

| Check | Equal | Mismatches |
|---|---|---|
| 500 pairs x 6 times | 2,996 of 3,000 (138 both unreachable) | 4 |
| every target, same 3,000 scans | 3,547,545 of 3,549,000 | 1,455 |

Equality is exact, in seconds. Every mismatch belongs to one class, explained below.

### Mismatch class: the engine ignores "no pickup" flags

Nine route 63 trips on Tuesday start at Geddes + CCTC with `pickup_type = 1`: the bus lets riders off
there but does not take new riders. The conn files carry no pickup or drop-off flags, so the engine lets
a rider board those buses at Geddes + CCTC. The reference does not. In every mismatch the engine is
earlier, and rerunning the reference with the flags ignored gives the engine's exact second.

Other flags in the feeds cannot change a journey: 485 stop times forbid pickup at a trip's last stop
and 273 forbid drop-off at its first stop. U-M Transit sets no flags.

Fix (for the pipeline owner): in `pipeline/build_transit.py`, drop a trip's leading stop times while
`pickup_type = 1`. It is exact here because the restriction only occurs at a first stop. R6 below shows
this matters door to door: UGLI and Hatcher trips that catch the 08:15 route 63 at CCTC are 7 minutes
faster in Quorum than in R5 for this reason.

### Harness sensitivity

To show the comparison can fail, the reference was rerun on the first 600 queries with perturbed inputs.
Each perturbation produced mismatches (router.json `harness_sensitivity`):

| Perturbation of the reference only | Mismatches of 600 |
|---|---|
| change time 0 s | 104 |
| change time +30 s | 3 |
| every footpath +1 s | 242 |
| no footpaths | 528 |

### What R2 cannot catch

R2 shares the footpaths, change times and stop list with the engine by design. An error in
`build_walk.py` (a wrong walk time between two stops) would show up in both. Two input facts worth
knowing: 291 stops (mostly Ypsilanti) are more than 300 m from the street graph and get no street
footpaths, and footpaths stop at 500 m. R6 is the check on those inputs.

### Timing

Engine: 0.345 ms per one-to-all scan (3,000 scans, Node 22). Reference: 13.88 ms per one-to-one
query and 21.4 ms per one-to-all query in Python. Full run with all targets: about 2 minutes.

## R6: r5py door to door

### What was run

```
set JAVA_HOME=C:/Program Files/Eclipse Adoptium/jdk-21.0.13.9-hotspot
python pipeline/r5_validate.py
```

- R5 v7.5.1 through r5py 1.1.7, network from `data/raw/osm/ann_arbor.osm.pbf` and both GTFS zips.
  R5 rejects GTFS tables that have a header and no rows, so the script hands it copies without those
  tables (TheRide: fare_attributes, fare_rules, frequencies; U-M: fare_rules, frequencies, transfers).
  The U-M copy also drops routes 99995 to 99999 (charter, training, test), as our pipeline does.
- Origins: 24 real places from `places.json` (all but the Blake Transit Center point). Destinations:
  the first 30 homes of `homes.json` (SYNTHETIC homes at real coordinates). 720 pairs.
- R5 request: departure Tue Dec 1 2026 08:00, `departure_time_window` 10 min, `percentiles=[50]`,
  modes TRANSIT and WALK, `speed_walking` 4.68 km/h (1.3 m/s, our walk speed), `max_time_walking`
  17 min (our 1,300 m access limit at 1.3 m/s, rounded up to a whole minute), `max_time` 180 min (our
  scan horizon).
- Quorum side (`scripts/our_times.mjs`, door mode): `planner.leaveAt` at every minute 08:00 to 08:09.
  Each minute's time is the faster of transit and walking only (walking only counts when it is within
  17 min, as in R5). Unreachable minutes are infinite. Then R5's own reduction: the sorted index
  `ceil(p/100 * n) - 1`, the 5th fastest of 10, and whole minutes by integer division. Both rules were
  read from the R5 jar with `javap` (`TravelTimeReducer.findPercentileIndex` and `convertToMinutes`),
  not assumed.

### Result

| Measure | Value |
|---|---|
| pairs | 720 |
| reachable in both | 690 |
| median absolute error | 1.0 min |
| share within 2 min | 87.5% (604 of the 690 trips both reach) |
| mean absolute error | 1.14 min |
| mean signed error, Quorum minus R5 | -0.84 min |
| agreement on reachable or not | 95.8% (30 pairs reachable only in Quorum, 0 only in R5) |

These are the numbers in `evidence/r5.json` from the run at 2026-11-19 22:15 ET, after the pickup-type fix in
`build_transit.py`. An earlier run, before that fix, gave 86.5% within 2 min and -0.89 min mean signed error.
Variants in r5.json: without flooring Quorum's minutes, median absolute error 0.68 min and 86.1% within
2 min; walking-only trips uncapped, median 1.0 min and 85.8% within 2 min.

### Why the differences happen

1. Minimum boarding wait. R5 waits at least 60 s before every boarding, the first one and the one after
   a walking transfer included (`FastRaptorWorker.MINIMUM_BOARD_WAIT_SEC = 60`). Quorum has no wait
   before the first boarding and treats a footpath's duration as the whole change. Near a departure the
   median minute can then fall on a later bus in R5. Example: CCRB to h13. Quorum walks a 3 min 50 s
   transfer and boards route 31 ten seconds later; R5 cannot, and its median is 29 min against 20 min.
   This is why Quorum is faster on average.
2. The route 63 pickup flag (the R2 class above). UGLI and Hatcher to h3, h15 and h29: Quorum boards
   route 63 at Geddes + CCTC at 08:15, which the feed forbids, and is 7 min faster than R5.
3. Linking. R5 finds no route from the Michigan Stadium point, even walking only with a 60 min limit.
   A probe with points 100 m east of it gives the same; a point on Main St near the stadium routes
   normally (16 min to UGLI). R5 links the point to a path inside the bowl that it treats as cut off.
   Quorum snaps it 111 m to the nearest walk node. This explains all 30 reachability disagreements.
4. Transfers. R5 builds walking transfers up to 1,000 m on its own street graph; Quorum's footpaths stop
   at 500 m.

### Timing

R5 network build 11.9 s, R5 matrix 0.43 s. Quorum: 869.9 ms to add the 54 points (street
Dijkstra), 1.243 ms per door-to-door `leaveAt` (240 of them).

## Reproduce

```
node --version            # 22
python pipeline/validate_router.py --pairs 500 --all-targets    # about 2 min
python pipeline/r5_validate.py                                  # about 25 s, needs JAVA_HOME (set in the script)
```
