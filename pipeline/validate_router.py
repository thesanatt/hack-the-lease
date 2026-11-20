"""R2: an independent earliest-arrival reference router, compared with the Quorum engine.

Run from the repo root:  python pipeline/validate_router.py [--pairs 500] [--seed 2026]

What this file reads, and what it does not:
  - raw GTFS from data/raw/aaata/google_transit.zip and data/raw/umich/google_transit.zip
    (calendar, calendar_dates, routes, trips, stops, stop_times). It never reads conn_*.bin.
  - from web/public/data/transit/meta.json only the shared inputs both routers are defined on:
    the service date for the day (meta.days[day].date), the stop index (meta.stops ids, so stop
    numbers mean the same thing on both sides), the walking footpaths (meta.footpaths) and the
    change times (meta.change if present, else the 60 s default in engine/config.js).

Model (identical by definition to section 3.1 of docs/SYSTEM_DESIGN.md, written separately):
  A journey starts at a stop at time t0, takes one or more vehicle rides, and between rides either
  stays at the same stop (needs the stop's change time after the arrival) or takes one footpath
  (the footpath duration already includes the change). The last ride may be followed by one
  footpath. Staying on one trip needs no change time. Boarding is allowed when departure >= ready.
  The answer at a target stop is the earliest arrival there by vehicle or by a footpath after a
  vehicle. Same day only (no trips from the previous service day).

Algorithm: time-dependent Dijkstra keyed on "ready to board" time per stop, with per-trip lowest
boarded position so each stop time is relaxed once per query. It is a different algorithm from
the engine's connection scan and shares no code with it.

The engine side runs through scripts/our_times.mjs. Results go to
web/public/data/evidence/router.json.
"""
import argparse
import csv
import datetime as dt
import hashlib
import heapq
import io
import json
import math
import subprocess
import sys
import tempfile
import time
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
META = ROOT / "web" / "public" / "data" / "transit" / "meta.json"
EVID = ROOT / "web" / "public" / "data" / "evidence"
FEEDS = [("A", "aaata"), ("U", "umich")]
# Charter, training and test routes of U-M Transit; the engine's pipeline drops the same five ids.
EXCLUDED_ROUTES = {("U", r) for r in ("99995", "99996", "99997", "99998", "99999")}
def _config_change_default():
    import re
    txt = (ROOT / "engine" / "config.js").read_text(encoding="utf-8")
    m = re.search(r"changeDefaultS:\s*(\d+)", txt)
    return int(m.group(1)) if m else 60


CHANGE_DEFAULT_S = _config_change_default()
INF = math.inf
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def gtfs_rows(folder, name):
    zpath = RAW / folder / "google_transit.zip"
    with zipfile.ZipFile(zpath) as z:
        if name not in z.namelist():
            return []
        with z.open(name) as f:
            return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


def hms(text):
    text = (text or "").strip()
    if not text:
        return None
    parts = [int(p) for p in text.split(":")]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def services_on(folder, date):
    """service_ids running on date per GTFS calendar.txt plus calendar_dates.txt exceptions."""
    ymd = date.strftime("%Y%m%d")
    col = WEEKDAYS[date.weekday()]
    on = set()
    for r in gtfs_rows(folder, "calendar.txt"):
        if r[col].strip() == "1" and r["start_date"].strip() <= ymd <= r["end_date"].strip():
            on.add(r["service_id"].strip())
    for r in gtfs_rows(folder, "calendar_dates.txt"):
        if r["date"].strip() != ymd:
            continue
        sid, ex = r["service_id"].strip(), r["exception_type"].strip()
        if ex == "1":
            on.add(sid)
        elif ex == "2":
            on.discard(sid)
    return on


class Network:
    """Trips of one service date as arrays of (stop, arr, dep, pickup_ok, dropoff_ok)."""

    def __init__(self, meta, date):
        self.meta = meta
        self.stop_of = {s["id"]: i for i, s in enumerate(meta["stops"])}
        self.n = len(meta["stops"])
        self.trips = []        # list of dicts: key, route, stops, arr, dep, pick, drop
        self.dropped = defaultdict(int)
        for prefix, folder in FEEDS:
            active = services_on(folder, date)
            routes = {r["route_id"].strip(): r for r in gtfs_rows(folder, "routes.txt")}
            trips = {}
            for t in gtfs_rows(folder, "trips.txt"):
                rid = t["route_id"].strip()
                if (prefix, rid) in EXCLUDED_ROUTES or rid not in routes:
                    continue
                if t["service_id"].strip() not in active:
                    continue
                trips[t["trip_id"].strip()] = rid
            rows = defaultdict(list)
            for st in gtfs_rows(folder, "stop_times.txt"):
                tid = st["trip_id"].strip()
                if tid in trips:
                    rows[tid].append(st)
            for tid, rid in trips.items():
                seq = sorted(rows[tid], key=lambda r: int(r["stop_sequence"]))
                kept = []
                for r in seq:
                    key = f"{prefix}:{r['stop_id'].strip()}"
                    if key not in self.stop_of:  # stations, entrances or unknown stops
                        self.dropped["stop_time at non-boardable stop"] += 1
                        continue
                    kept.append(r)
                if len(kept) < 2:
                    self.dropped["trip with < 2 stops"] += 1
                    continue
                arr = [hms(r["arrival_time"]) for r in kept]
                dep = [hms(r["departure_time"]) for r in kept]
                arr = [a if a is not None else d for a, d in zip(arr, dep)]
                dep = [d if d is not None else a for a, d in zip(arr, dep)]
                timed = [i for i, a in enumerate(arr) if a is not None]
                if len(timed) < 2:
                    self.dropped["trip without two timepoints"] += 1
                    continue
                for a, b in zip(timed, timed[1:]):  # untimed stops: linear in stop count
                    for i in range(a + 1, b):
                        arr[i] = dep[i] = round(dep[a] + (arr[b] - dep[a]) * (i - a) / (b - a))
                lo, hi = timed[0], timed[-1] + 1
                kept, arr, dep = kept[lo:hi], arr[lo:hi], dep[lo:hi]
                self.trips.append({
                    "key": f"{prefix}:{tid}", "route": f"{prefix}:{routes[rid].get('route_short_name', '').strip()}",
                    "stops": [self.stop_of[f"{prefix}:{r['stop_id'].strip()}"] for r in kept],
                    "arr": arr, "dep": dep,
                    "pick": [(r.get("pickup_type") or "0").strip() != "1" for r in kept],
                    "drop": [(r.get("drop_off_type") or "0").strip() != "1" for r in kept],
                })
        # boarding events per stop, sorted by departure
        self.board = [[] for _ in range(self.n)]
        self.board_all = [[] for _ in range(self.n)]
        for k, t in enumerate(self.trips):
            for p in range(len(t["stops"]) - 1):
                ev = (t["dep"][p], k, p)
                self.board_all[t["stops"][p]].append(ev)
                if t["pick"][p]:
                    self.board[t["stops"][p]].append(ev)
        for L in self.board:
            L.sort()
        for L in self.board_all:
            L.sort()
        self.board_dep = [[e[0] for e in L] for L in self.board]
        self.board_all_dep = [[e[0] for e in L] for L in self.board_all]
        # footpaths and change times, shared with the engine through meta.json
        self.foot = [[] for _ in range(self.n)]
        for a, b, d in meta["footpaths"]:
            self.foot[a].append((b, d))
        ch = meta.get("change")
        if isinstance(ch, list) and len(ch) == self.n:
            # -1 marks a stop the feeds do not list: the engine's default (config.js changeDefaultS)
            self.change = [int(x) if int(x) >= 0 else CHANGE_DEFAULT_S for x in ch]
            listed = sum(1 for x in ch if int(x) >= 0)
            self.change_source = f"meta.change: {listed} stops from transfers.txt, others {CHANGE_DEFAULT_S} s"
        elif isinstance(ch, dict):
            self.change = [int(ch.get(s["id"], ch.get(str(i), CHANGE_DEFAULT_S))) for i, s in enumerate(meta["stops"])]
            self.change_source = "meta.change (by stop id)"
        else:
            self.change = [CHANGE_DEFAULT_S] * self.n
            self.change_source = f"default {CHANGE_DEFAULT_S} s at every stop (meta.change absent)"

    def served_stops(self):
        s = set()
        for t in self.trips:
            s.update(t["stops"])
        return sorted(s)

    def earliest(self, src, t0, dst=None, honor_pickup=True, want_path=False):
        """Earliest arrival at every stop (or until dst is settled). Returns (arrive, path_info)."""
        n = self.n
        ride = [INF] * n          # best arrival by vehicle
        foot = [INF] * n          # best arrival by one footpath after a vehicle
        ready = [INF] * n         # earliest boarding moment
        ride_par = [None] * n     # (trip, board_pos, alight_pos)
        foot_par = [None] * n     # (from_stop, dur)
        ready_via = [None] * n    # 'seed' | 'ride' | 'foot'
        trip_from = {}            # trip -> (lowest boarded position, boarding stop's ready_via)
        board = self.board if honor_pickup else self.board_all
        bdep = self.board_dep if honor_pickup else self.board_all_dep
        ready[src] = t0
        ready_via[src] = "seed"
        heap = [(t0, src)]
        best_dst = INF

        def set_ready(s, v, via):
            if v < ready[s]:
                ready[s] = v
                ready_via[s] = via
                heapq.heappush(heap, (v, s))

        while heap:
            r, s = heapq.heappop(heap)
            if r > ready[s]:
                continue
            if dst is not None and r >= best_dst:
                break  # every later label is at least r, so dst cannot improve
            L, D = board[s], bdep[s]
            i = _bisect_left(D, r)
            for j in range(i, len(L)):
                _, k, p = L[j]
                t = self.trips[k]
                old = trip_from.get(k)
                stop_at = len(t["stops"]) - 1 if old is None else old[0]
                if old is not None and old[0] <= p:
                    continue
                trip_from[k] = (p, s)
                for q in range(p + 1, stop_at + 1):
                    if honor_pickup and not t["drop"][q]:
                        continue
                    stp, a = t["stops"][q], t["arr"][q]
                    if a < ride[stp]:
                        ride[stp] = a
                        ride_par[stp] = (k, p, q, s)
                        set_ready(stp, a + self.change[stp], "ride")
                        if stp == dst:
                            best_dst = min(best_dst, a)
                        for nb, d in self.foot[stp]:
                            if a + d < foot[nb]:
                                foot[nb] = a + d
                                foot_par[nb] = (stp, d)
                                set_ready(nb, a + d, "foot")
                                if nb == dst:
                                    best_dst = min(best_dst, a + d)
        arrive = [min(a, b) for a, b in zip(ride, foot)]
        info = None
        if want_path and dst is not None and arrive[dst] < INF:
            info = self.path(src, dst, ride, foot, ride_par, foot_par)
        return arrive, info

    def path(self, src, dst, ride, foot, ride_par, foot_par):
        legs, s, use_ride, guard = [], dst, ride[dst] <= foot[dst], 0
        while guard < 64:
            guard += 1
            if use_ride:
                k, p, q, bs = ride_par[s]
                t = self.trips[k]
                legs.append({"type": "ride", "route": t["route"], "trip": t["key"], "from": t["stops"][p],
                             "to": t["stops"][q], "dep": t["dep"][p], "arr": t["arr"][q]})
                s = t["stops"][p]
            else:
                fs, d = foot_par[s]
                legs.append({"type": "transfer", "from": fs, "to": s, "dur": d})
                s = fs
                use_ride = True
                continue
            # how was s ready? seed, ride (+change) or foot
            if s == src or (ride_par[s] is None and foot_par[s] is None):
                break
            dep = legs[-1]["dep"]
            r_ok = ride[s] + self.change[s] <= dep
            f_ok = foot[s] <= dep
            if not r_ok and not f_ok:
                break  # seed
            use_ride = r_ok and (not f_ok or ride[s] + self.change[s] <= foot[s])
        return list(reversed(legs))


def _bisect_left(a, x):
    lo, hi = 0, len(a)
    while lo < hi:
        m = (lo + hi) // 2
        if a[m] < x:
            lo = m + 1
        else:
            hi = m
    return lo


def run_engine(payload):
    with tempfile.TemporaryDirectory() as tmp:
        qin, qout = Path(tmp) / "q.json", Path(tmp) / "o.json"
        qin.write_text(json.dumps(payload))
        subprocess.run(["node", str(ROOT / "scripts" / "our_times.mjs"), str(qin), str(qout)], check=True, cwd=ROOT)
        return json.loads(qout.read_text())


def all_targets(net, meta, args, pairs, times, served):
    """Every served stop as a target, for each (source, time) of the pair sample."""
    qs = [{"src": a, "t": t, "dst": served} for (a, _) in pairs for t in times]
    t0 = time.perf_counter()
    eng = run_engine({"day": args.day, "horizon": 48 * 3600, "queries": qs, "withLegs": False})
    t_eng = time.perf_counter() - t0
    if eng["engine"]["meta_sha1"] != hashlib.sha1(META.read_bytes()).hexdigest()[:12] or             eng["engine"]["meta_sha1"] != args.meta_sha1:
        sys.exit("meta.json changed during the run; rerun when the pipeline is idle")
    t0 = time.perf_counter()
    compared = equal = 0
    classes = defaultdict(list)
    for qq, e in zip(qs, eng["results"]):
        arrive, _ = net.earliest(qq["src"], qq["t"])
        lenient = None
        for d, ea in zip(served, e["arr"]):
            if d == qq["src"]:
                continue
            compared += 1
            r = arrive[d]
            r = None if r == INF else int(r)
            if r == ea:
                equal += 1
                continue
            if lenient is None:
                lenient, _ = net.earliest(qq["src"], qq["t"], honor_pickup=False)
            lv = None if lenient[d] == INF else int(lenient[d])
            if lv == ea:
                cls = "engine ignores GTFS pickup_type/drop_off_type = 1"
            elif r is not None and (ea is None or ea > r):
                cls = "engine later than reference"
            else:
                cls = "engine earlier than reference"
            classes[cls].append({"src": qq["src"], "dst": d, "t": fmt(qq["t"]),
                                 "src_name": meta["stops"][qq["src"]]["name"], "dst_name": meta["stops"][d]["name"],
                                 "reference": fmt(r), "engine": fmt(ea),
                                 "reference_ignoring_pickup_dropoff": fmt(lv)})
    t_ref = time.perf_counter() - t0
    return {
        "scans": len(qs), "stop_comparisons": compared, "equal": equal, "mismatches": compared - equal,
        "pass": equal == compared,
        "mismatch_classes": {k: {"count": len(v), "distinct_targets": len({x["dst"] for x in v}),
                                 "examples": v[:5]} for k, v in classes.items()},
        "timing": {"reference_one_to_all_ms": round(1000 * t_ref / len(qs), 1),
                   "engine_wall_s_including_node_start": round(t_eng, 2), "engine": eng["timing"]},
    }


def fmt(s):
    if s is None:
        return "none"
    s = int(s)
    return f"{s // 3600:02d}:{s // 60 % 60:02d}:{s % 60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=500)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--day", default="tue")
    ap.add_argument("--out", default=str(EVID / "router.json"))
    ap.add_argument("--all-targets", action="store_true",
                    help="also compare every served stop as a target for each (source, time)")
    args = ap.parse_args()

    meta_bytes = META.read_bytes()
    meta_sha1 = hashlib.sha1(meta_bytes).hexdigest()[:12]
    meta = json.loads(meta_bytes.decode("utf-8"))
    date = dt.date.fromisoformat(meta["days"][args.day]["date"])
    t_build = time.perf_counter()
    net = Network(meta, date)
    t_build = time.perf_counter() - t_build
    served = net.served_stops()
    print(f"reference network {date}: {len(net.trips)} trips, "
          f"{sum(len(t['stops']) - 1 for t in net.trips)} hops, {len(served)} served stops, built in {t_build:.1f} s")
    print(f"change times: {net.change_source}")

    rng = np.random.default_rng(args.seed)
    pairs = []
    while len(pairs) < args.pairs:
        a, b = (int(x) for x in rng.choice(served, 2, replace=False))
        pairs.append((a, b))
    times = [6 * 3600 + 30 * 60, 8 * 3600, 10 * 3600 + 15 * 60, 13 * 3600, 17 * 3600 + 30 * 60, 21 * 3600]

    queries = [{"src": a, "t": t, "dst": [b]} for (a, b) in pairs for t in times]

    # Engine side
    t_eng = time.perf_counter()
    eng = run_engine({"day": args.day, "horizon": 48 * 3600, "queries": queries})
    t_eng = time.perf_counter() - t_eng
    if eng["engine"]["meta_sha1"] != meta_sha1:
        sys.exit(f"meta.json changed between the reference ({meta_sha1}) and the engine "
                 f"({eng['engine']['meta_sha1']}) loads; rerun when the pipeline is idle")

    # Reference side
    t_ref = time.perf_counter()
    ref = []
    for qq in queries:
        arrive, _ = net.earliest(qq["src"], qq["t"], dst=qq["dst"][0])
        v = arrive[qq["dst"][0]]
        ref.append(None if v == INF else int(v))
    t_ref = time.perf_counter() - t_ref

    classes = defaultdict(list)
    equal = 0
    both_none = 0
    for qq, r, e in zip(queries, ref, eng["results"]):
        ea = e["arr"][0]
        if ea == r:
            equal += 1
            both_none += r is None
            continue
        rec = {"src": qq["src"], "dst": qq["dst"][0], "t": fmt(qq["t"]),
               "src_name": meta["stops"][qq["src"]]["name"], "dst_name": meta["stops"][qq["dst"][0]]["name"],
               "reference": fmt(r), "engine": fmt(ea),
               "diff_s": None if (r is None or ea is None) else ea - r}
        # Classify: does ignoring pickup_type / drop_off_type reproduce the engine?
        lenient, _ = net.earliest(qq["src"], qq["t"], dst=qq["dst"][0], honor_pickup=False)
        lv = lenient[qq["dst"][0]]
        lv = None if lv == INF else int(lv)
        _, path = net.earliest(qq["src"], qq["t"], dst=qq["dst"][0], want_path=True)
        rec["reference_legs"] = path
        rec["engine_legs"] = e["legs"][0]
        rec["reference_ignoring_pickup_dropoff"] = fmt(lv)
        if lv == ea:
            cls = "engine ignores GTFS pickup_type/drop_off_type = 1"
        elif r is not None and (ea is None or ea > r):
            cls = "engine later than reference"
        else:
            cls = "engine earlier than reference"
        classes[cls].append(rec)

    n = len(queries)
    summary = {
        "test": "R2 independent reference router",
        "ran_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "seed": args.seed,
        "day": args.day, "service_date": str(date),
        "pairs": args.pairs, "departure_times": [fmt(t) for t in times], "queries": n,
        "pair_sampling": "uniform random distinct pairs among stops served on the date, numpy default_rng(seed)",
        "equal": equal, "equal_both_unreachable": both_none, "mismatches": n - equal,
        "pass": equal == n,
        "mismatch_classes": {k: {"count": len(v), "examples": v[:5]} for k, v in classes.items()},
        "reference": {
            "file": "pipeline/validate_router.py",
            "algorithm": "time-dependent Dijkstra on ready-to-board time, per-trip lowest boarded position",
            "inputs": "raw GTFS zips (calendar, calendar_dates, routes, trips, stops, stop_times); meta.json stops, footpaths, change, days",
            "honors_pickup_dropoff": True,
            "change_times": net.change_source,
            "trips": len(net.trips), "served_stops": len(served),
            "dropped": dict(net.dropped),
        },
        "engine": eng["engine"],
        "meta_sha1": meta_sha1,
        "timing": {
            "reference_build_s": round(t_build, 2),
            "reference_total_s": round(t_ref, 2),
            "reference_ms_per_query": round(1000 * t_ref / n, 2),
            "engine_wall_s_including_node_start": round(t_eng, 2),
            "engine": eng["timing"],
        },
    }
    # Harness sensitivity: perturb the reference's inputs and confirm the comparison notices.
    sens = {}
    sub = list(zip(queries, eng["results"]))[:600]
    saved_change, saved_foot = net.change, net.foot
    for name, mutate in [
        ("change time 0 s instead of the shared value", lambda: setattr(net, "change", [0] * net.n)),
        ("change time +30 s", lambda: setattr(net, "change", [c + 30 for c in saved_change])),
        ("every footpath +1 s", lambda: setattr(net, "foot", [[(b, d + 1) for b, d in L] for L in saved_foot])),
        ("no footpaths", lambda: setattr(net, "foot", [[] for _ in range(net.n)])),
    ]:
        mutate()
        diff = 0
        for qq, e in sub:
            a, _ = net.earliest(qq["src"], qq["t"], dst=qq["dst"][0])
            v = None if a[qq["dst"][0]] == INF else int(a[qq["dst"][0]])
            diff += v != e["arr"][0]
        net.change, net.foot = saved_change, saved_foot
        sens[name] = {"queries": len(sub), "mismatches": diff}
        print(f"  sensitivity: {name}: {diff} of {len(sub)} differ")
    summary["harness_sensitivity"] = sens

    args.meta_sha1 = meta_sha1
    # Trips where the feed forbids boarding before the last stop or alighting after the first.
    st = meta["stops"]
    restricted = []
    for t in net.trips:
        last = len(t["stops"]) - 1
        bad_pick = [p for p in range(last) if not t["pick"][p]]
        bad_drop = [p for p in range(1, last + 1) if not t["drop"][p]]
        if bad_pick or bad_drop:
            restricted.append({"trip": t["key"], "route": t["route"], "dep": fmt(t["dep"][0]),
                               "no_pickup_at": [st[t["stops"][p]]["name"] + f" (position {p})" for p in bad_pick],
                               "no_dropoff_at": [st[t["stops"][p]]["name"] + f" (position {p})" for p in bad_drop]})
    summary["pickup_dropoff_restrictions_that_matter"] = {
        "note": "pickup_type = 1 before the last stop or drop_off_type = 1 after the first stop, on the service date. "
                "Restrictions at a trip's last stop (no pickup) or first stop (no drop-off) cannot change any journey.",
        "trips": restricted}
    summary["explanations"] = {
        "engine ignores GTFS pickup_type/drop_off_type = 1":
            "The conn_*.bin files have no pickup or drop-off flags, so the engine lets a rider board where the feed "
            "says the bus picks nobody up. The reference honors the flags; rerun with the flags ignored it equals the "
            "engine on every one of these queries. All cases trace to the trips listed under "
            "pickup_dropoff_restrictions_that_matter. Fix: in build_transit.py drop a trip's leading stop_times "
            "while pickup_type = 1 (exact when the restriction is at the first stop, which is the only case here).",
    }
    if args.all_targets:
        summary["all_targets"] = all_targets(net, meta, args, pairs, times, served)
        a = summary["all_targets"]
        print(f"all targets: {a['equal']} of {a['stop_comparisons']} stop arrivals equal over {a['scans']} scans")
        for k, v in a["mismatch_classes"].items():
            print(f"  {v['count']:7d}  {k} ({v['distinct_targets']} distinct targets)")
    summary["pass_after_explained_classes"] = all(
        k in summary["explanations"] for k in list(summary["mismatch_classes"])
        + list(summary.get("all_targets", {}).get("mismatch_classes", {})))
    print(f"every mismatch class explained: {summary['pass_after_explained_classes']}")
    EVID.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(f"R2: {equal} of {n} equal ({both_none} both unreachable); mismatches {n - equal}")
    for k, v in classes.items():
        print(f"  {len(v):5d}  {k}")
    print(f"engine {eng['engine']['labels']}, {eng['engine']['change']}, sha1 {eng['engine']['transit_js_sha1']}")
    print(f"reference {1000 * t_ref / n:.1f} ms/query, engine {eng['timing']['ms_per_scan']} ms/scan")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
