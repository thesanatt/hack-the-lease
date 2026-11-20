"""R6: door-to-door travel times from Quorum compared with R5 (through r5py), on the same inputs.

Run from the repo root:  python pipeline/r5_validate.py

Inputs: data/raw/osm/ann_arbor.osm.pbf, both GTFS zips (U-M charter/test routes 99995..99999 removed
in a temporary copy, as the Quorum pipeline does), Tue Dec 1 2026 08:00, departure_time_window
10 min, percentile 50, speed_walking 4.68 km/h (1.3 m/s), max_time_walking = Quorum's access
limit (maxAccessM / walkMs, rounded up to whole minutes), max_time = Quorum's horizon.

Origins: 24 real places from places.json (every place except the transit center 'btc').
Destinations: the first 30 homes of homes.json when it exists, otherwise 30 SAMPLE points drawn
uniformly (seed 2026) in a box over central Ann Arbor. Labeled in the output.

Quorum side (scripts/our_times.mjs, door mode): planner.leaveAt at every minute 08:00..08:09, travel
time = min(transit, walk-only when walk-only <= max_time_walking), unreachable minutes infinite,
then the same percentile rule R5 uses: sorted index ceil(p/100 * n) - 1 (R5 v7.5.1
TravelTimeReducer.findPercentileIndex, read with javap from the jar r5py ships; with n = 10 and
p = 50 it is the 5th smallest), and whole minutes by integer division (R5 convertToMinutes is
seconds / 60). Output: web/public/data/evidence/r5.json.
"""
import datetime as dt
import io
import json
import math
import os
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

JAVA_HOME = r"C:/Program Files/Eclipse Adoptium/jdk-21.0.13.9-hotspot"
os.environ.setdefault("JAVA_HOME", JAVA_HOME)

import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DATA = ROOT / "web" / "public" / "data"
EVID = DATA / "evidence"
PBF = RAW / "osm" / "ann_arbor.osm.pbf"
EXCLUDED_U_ROUTES = {"99995", "99996", "99997", "99998", "99999"}
DEPART = dt.datetime(2026, 12, 1, 8, 0)
WINDOW_MIN = 10
PERCENTILE = 50
SPEED_WALK_KMH = 4.68


def r5_index(n, p):
    # R5 v7.5.1 TravelTimeReducer.findPercentileIndex, read with javap from the r5py jar:
    # (int) (Math.ceil(p / 100.0 * n) - 1). With n = 10 and p = 50 it is index 4, the 5th smallest.
    return int(math.ceil(p / 100 * n) - 1)


def clean_zip(tmp, folder, drop_routes=frozenset()):
    """Copy of a feed that R5 accepts: tables with a header and no rows are left out (R5 rejects them
    with EmptyTableError), and the given route ids are removed with their trips and stop times."""
    import csv
    src = RAW / folder / "google_transit.zip"
    dst = Path(tmp) / f"{folder}.zip"
    removed = []
    with zipfile.ZipFile(src) as zi, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zo:
        trips_drop = set()
        for name in ["routes.txt", "trips.txt"] + [n for n in zi.namelist() if n not in ("routes.txt", "trips.txt")]:
            if name not in zi.namelist():
                continue
            raw = zi.read(name)
            text = raw.decode("utf-8-sig")
            if len([ln for ln in text.splitlines() if ln.strip()]) <= 1:
                removed.append(name)
                continue
            if drop_routes and name in ("routes.txt", "trips.txt", "stop_times.txt"):
                rows = list(csv.DictReader(io.StringIO(text)))
                if name == "routes.txt":
                    rows = [r for r in rows if r["route_id"].strip() not in drop_routes]
                elif name == "trips.txt":
                    trips_drop = {r["trip_id"] for r in rows if r["route_id"].strip() in drop_routes}
                    rows = [r for r in rows if r["trip_id"] not in trips_drop]
                else:
                    rows = [r for r in rows if r["trip_id"] not in trips_drop]
                out = io.StringIO()
                w = csv.DictWriter(out, fieldnames=list(rows[0].keys()), lineterminator="\n")
                w.writeheader()
                w.writerows(rows)
                zo.writestr(name, out.getvalue())
            else:
                zo.writestr(name, raw)
    return dst, removed


def points():
    places = json.loads((DATA / "places.json").read_text(encoding="utf-8"))
    origins = [{"id": p["id"], "lat": p["lat"], "lon": p["lon"], "label": p["label"]}
               for p in places if p["id"] != "btc"][:24]
    homes_path = DATA / "homes.json"
    if homes_path.exists():
        homes = json.loads(homes_path.read_text(encoding="utf-8"))["homes"][:30]
        dests = [{"id": h["id"], "lat": h["lat"], "lon": h["lon"], "label": h.get("name", h["id"])} for h in homes]
        dest_source = "homes.json (SYNTHETIC homes at real coordinates)"
    else:
        rng = np.random.default_rng(2026)
        lat = rng.uniform(42.255, 42.300, 30)
        lon = rng.uniform(-83.765, -83.700, 30)
        dests = [{"id": f"s{i + 1}", "lat": round(float(a), 6), "lon": round(float(b), 6), "label": f"SAMPLE point {i + 1}"}
                 for i, (a, b) in enumerate(zip(lat, lon))]
        dest_source = "SAMPLE: 30 uniform random points, seed 2026, lat 42.255..42.300, lon -83.765..-83.700"
    return origins, dests, dest_source


def quorum_side(origins, dests):
    payload = {"day": "tue", "queries": [], "door": {
        "origins": origins, "dests": dests,
        "start": DEPART.hour * 3600 + DEPART.minute * 60,
        "end": DEPART.hour * 3600 + DEPART.minute * 60 + WINDOW_MIN * 60, "step": 60}}
    with tempfile.TemporaryDirectory() as tmp:
        qi, qo = Path(tmp) / "q.json", Path(tmp) / "o.json"
        qi.write_text(json.dumps(payload))
        subprocess.run(["node", str(ROOT / "scripts" / "our_times.mjs"), str(qi), str(qo)], check=True, cwd=ROOT)
        return json.loads(qo.read_text())


def main():
    t_all = time.perf_counter()
    origins, dests, dest_source = points()
    t0 = time.perf_counter()
    q = quorum_side(origins, dests)
    t_quorum = time.perf_counter() - t0
    W = q["window"]
    walk_cap_s = math.ceil(W["cfg"]["maxAccessM"] / W["cfg"]["walkMs"] / 60) * 60
    max_time_min = int(W["cfg"]["horizonS"] // 60)
    idx = r5_index(WINDOW_MIN, PERCENTILE)

    ours, ours_frac, ours_nocap, ours_transit_only = {}, {}, {}, {}
    for i, o in enumerate(origins):
        for j, d in enumerate(dests):
            walk = W["walk"][i][j]
            vals, vals_nocap, vals_tr = [], [], []
            for m in range(WINDOW_MIN):
                tr = W["transit"][i][m][j]
                tr = math.inf if tr is None else tr
                w = math.inf if walk is None else walk
                vals.append(min(tr, w if w <= walk_cap_s else math.inf))
                vals_nocap.append(min(tr, w))
                vals_tr.append(tr)
            key = (o["id"], d["id"])
            for store, v in ((ours, vals), (ours_nocap, vals_nocap), (ours_transit_only, vals_tr)):
                v = sorted(v)[idx]
                store[key] = float(int(v) // 60) if v < math.inf else math.inf  # R5: seconds / 60
            v = sorted(vals)[idx]
            ours_frac[key] = v / 60 if v < math.inf else math.inf

    # R5 side
    import geopandas as gpd
    import shapely
    import r5py
    from r5py import TransportMode
    t0 = time.perf_counter()
    with tempfile.TemporaryDirectory() as tmp:
        aa, aa_removed = clean_zip(tmp, "aaata")
        um, um_removed = clean_zip(tmp, "umich", EXCLUDED_U_ROUTES)
        tn = r5py.TransportNetwork(str(PBF), [str(aa), str(um)])
        t_build = time.perf_counter() - t0
        og = gpd.GeoDataFrame({"id": [o["id"] for o in origins]},
                              geometry=[shapely.Point(o["lon"], o["lat"]) for o in origins], crs="EPSG:4326")
        dg = gpd.GeoDataFrame({"id": [d["id"] for d in dests]},
                              geometry=[shapely.Point(d["lon"], d["lat"]) for d in dests], crs="EPSG:4326")
        t1 = time.perf_counter()
        ttm = r5py.TravelTimeMatrix(
            tn, origins=og, destinations=dg, departure=DEPART,
            departure_time_window=dt.timedelta(minutes=WINDOW_MIN), percentiles=[PERCENTILE],
            transport_modes=[TransportMode.TRANSIT, TransportMode.WALK],
            speed_walking=SPEED_WALK_KMH, max_time=dt.timedelta(minutes=max_time_min),
            max_time_walking=dt.timedelta(seconds=walk_cap_s))
        t_ttm = time.perf_counter() - t1
        df = ttm if hasattr(ttm, "columns") else ttm.compute_travel_times()
        col = "travel_time" if "travel_time" in df.columns else [c for c in df.columns if c.startswith("travel_time")][0]
        r5 = {}
        for row in df.itertuples(index=False):
            v = getattr(row, col)
            r5[(row.from_id, row.to_id)] = math.inf if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)
        del tn

    def compare(our):
        both, err, agree_unreach, only_r5, only_ours = [], [], 0, 0, 0
        rows = []
        for key, rv in r5.items():
            ov = our.get(key, math.inf)
            if rv == math.inf and ov == math.inf:
                agree_unreach += 1
            elif rv == math.inf:
                only_ours += 1
            elif ov == math.inf:
                only_r5 += 1
            else:
                both.append(key)
                err.append(ov - rv)
            rows.append([key[0], key[1], None if ov == math.inf else round(ov, 2), None if rv == math.inf else rv])
        e = np.abs(np.array(err)) if err else np.array([np.nan])
        return {
            "pairs": len(r5), "both_reachable": len(both),
            "median_abs_error_min": round(float(np.median(e)), 2),
            "mean_abs_error_min": round(float(np.mean(e)), 2),
            "p90_abs_error_min": round(float(np.percentile(e, 90)), 2),
            "share_within_2_min": round(float(np.mean(e <= 2)), 3),
            "mean_signed_error_min_quorum_minus_r5": round(float(np.mean(err)), 2) if err else None,
            "unreachable_both": agree_unreach, "reachable_only_in_quorum": only_ours,
            "reachable_only_in_r5": only_r5,
            "unreachable_agreement": round((agree_unreach + len(both)) / max(1, len(r5)), 3),
        }, rows

    main_cmp, rows = compare(ours)
    nocap_cmp, _ = compare(ours_nocap)
    frac_cmp, _ = compare(ours_frac)
    tr_cmp, _ = compare(ours_transit_only)
    out_origins = [o["id"] for o in origins]
    worst = sorted([r for r in rows if r[2] is not None and r[3] is not None],
                   key=lambda r: -abs(r[2] - r[3]))[:10]
    out = {
        "test": "R6 r5py door-to-door comparison",
        "ran_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "r5py_version": r5py.__version__,
        "settings": {
            "osm": str(PBF.relative_to(ROOT)).replace("\\", "/"),
            "gtfs": [f"data/raw/aaata/google_transit.zip (empty tables left out: {', '.join(aa_removed) or 'none'})",
                     "data/raw/umich/google_transit.zip (routes 99995..99999 removed, as in the Quorum pipeline; "
                     f"empty tables left out: {', '.join(um_removed) or 'none'})"],
            "departure": DEPART.isoformat(), "departure_time_window_min": WINDOW_MIN, "percentile": PERCENTILE,
            "speed_walking_kmh": SPEED_WALK_KMH, "max_time_walking_s": walk_cap_s, "max_time_min": max_time_min,
            "transport_modes": ["TRANSIT", "WALK"],
            "quorum_rule": f"leaveAt every minute of the window, min(transit, walk-only <= {walk_cap_s} s), "
                           f"unreachable as infinite, sorted index {idx} of {WINDOW_MIN} (R5 percentile rule)",
        },
        "origins": [o["id"] for o in origins], "destinations": dest_source, "n_dest": len(dests),
        "result": main_cmp,
        "variants": {"fractional_minutes_not_floored": frac_cmp, "walk_only_uncapped": nocap_cmp, "transit_only_no_walk_only": tr_cmp},
        "unreachable_disagreements_by_origin": {o: n for o in out_origins if (n := sum(
            1 for r in rows if r[0] == o and (r[2] is None) != (r[3] is None)))},
        "largest_differences": [{"origin": r[0], "dest": r[1], "quorum_min": r[2], "r5_min": r[3]} for r in worst],
        "matrix": rows,
        "known_model_differences": [
            "R5 waits at least 60 s before every boarding, the first included (FastRaptorWorker.MINIMUM_BOARD_WAIT_SEC); Quorum has no wait before the first boarding and a change time between rides (60 s default, 10 s at the Blake Transit Center stops named in transfers.txt).",
            "R5 builds transfers on its own street graph up to 1000 m (TransitLayer.TRANSFER_DISTANCE_LIMIT_METERS); Quorum uses OSM street footpaths up to 500 m.",
            "R5 links points to streets within 1600 m and drops street islands under 40 edges (StreetLayer); Quorum snaps to the nearest OSM walk node.",
            "R5 reports whole minutes (seconds / 60, floored); the main result floors Quorum the same way, the fractional variant does not.",
        ],
        "timing": {"r5_network_build_s": round(t_build, 1), "r5_matrix_s": round(t_ttm, 2),
                   "quorum_wall_s_including_node_start": round(t_quorum, 2),
                   "quorum_points_ms": q["window"]["points_ms"],
                   "quorum_ms_per_leaveAt": q["window"]["scan_ms_per_leaveAt"],
                   "total_s": round(time.perf_counter() - t_all, 1)},
        "engine": q["engine"],
    }
    EVID.mkdir(parents=True, exist_ok=True)
    (EVID / "r5.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("result", "variants", "timing")}, indent=1))
    print("largest differences:", out["largest_differences"][:5])


if __name__ == "__main__":
    main()
