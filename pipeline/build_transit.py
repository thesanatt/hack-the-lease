"""Build compact timetable artifacts from the TheRide (AAATA) and U-M Transit GTFS feeds.

Run from the repo root:  python pipeline/build_transit.py   (then python pipeline/build_walk.py)

Outputs in web/public/data/transit/:
  meta.json          stops, routes, trips, service days, feed versions, change times, footpaths
  conn_<day>.bin     connections sorted by departure time. Int32 little-endian,
                     5 values per connection: dep_stop, arr_stop, dep_s, arr_s, trip.
                     Times are seconds after midnight of the service day (can exceed 86400).
  shapes.geojson     one LineString per shape, for the map and trip animation

Connections are sorted by the explicit key (dep, arr, trip, seq) and the build asserts that each trip's
connections appear in stop_sequence order, so zero-duration hops inside a trip are scanned in order
(and in reverse order by the backward scan).
meta.change[stop] is the same-stop min_transfer_time from a feed's transfers.txt, or -1 for the engine
default (engine/config.js changeDefaultS). meta.transfers lists the other stop pairs a feed names as
[from, to, transfer_type, min_transfer_time]; footpaths between them take max(walk, min_transfer_time).
Every output is written to a temporary name and renamed, so concurrent readers never see half a file.
"""
import csv
import datetime as dt
import hashlib
import io
import json
import math
import os
import time
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data" / "transit"

# prefix, folder, display name
FEEDS = [("A", "aaata", "TheRide (AAATA)"), ("U", "umich", "U-M Transit")]

# The modeled week: Mon Nov 30 to Sun Dec 6 2026. It is a full week of fall-term classes,
# inside both feeds' windows (TheRide 2026-11-15..2027-01-23, U-M 2026-08-23..2027-01-02)
# and after Thanksgiving. Days with identical service share one file.
DAYS = {"mon": "2026-11-30", "tue": "2026-12-01", "wed": "2026-12-02", "thu": "2026-12-03",
        "fri": "2026-12-04", "sat": "2026-12-05", "sun": "2026-12-06"}

# U-M charter, training and test routes are not public service.
EXCLUDE_ROUTES = {"U": {"99995", "99996", "99997", "99998", "99999"}}

# Footpaths for named transfer pairs that have no street footpath (crow-fly fallback).
WALK_MS, DETOUR, NAMED_PAIR_MAX_M = 1.3, 1.25, 500.0


def atomic_write(path, data):
    """Write bytes or str to a temp file next to path, then rename over it (retrying on Windows locks)."""
    path = Path(path)
    tmp = path.with_name(path.name + ".tmp")
    if isinstance(data, str):
        data = data.encode("utf-8")
    with open(tmp, "wb") as f:
        f.write(data)
    for _ in range(100):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.1)
    raise PermissionError(f"could not replace {path}")


def read(folder, name):
    with zipfile.ZipFile(RAW / folder / "google_transit.zip") as z:
        if name not in z.namelist():
            return []
        with z.open(name) as f:
            return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


def secs(t):
    t = (t or "").strip()
    if not t:
        return None
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def active_services(cal, cal_dates, date):
    wd = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][date.weekday()]
    ds = date.strftime("%Y%m%d")
    active = {r["service_id"] for r in cal if r[wd] == "1" and r["start_date"] <= ds <= r["end_date"]}
    for r in cal_dates:
        if r["date"] == ds:
            if r["exception_type"].strip() == "1":
                active.add(r["service_id"])
            elif r["exception_type"].strip() == "2":
                active.discard(r["service_id"])
    return active


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def apply_transfers(foot, transfers, stops):
    """Footpath time between pairs a feed names: max(walk, min_transfer_time) for transfer_type 2,
    removed for type 3 (not possible). A named type-2 pair with no street footpath (for example the
    Ypsilanti Transit Center stops, outside the street-graph box) gets crow-fly x1.25 walking time,
    if within NAMED_PAIR_MAX_M. Shared with build_walk.py."""
    rules = {(i, j): (ttype, mtt) for i, j, ttype, mtt in transfers}
    out, seen = [], set()
    for f in foot:
        i, j, d = int(f[0]), int(f[1]), int(f[2])
        rule = rules.get((i, j))
        if rule and rule[0] == 3:
            continue
        if rule and rule[0] == 2 and rule[1] >= 0:
            d = max(d, rule[1])
        out.append([i, j, d])
        seen.add((i, j))
    added = 0
    for (i, j), (ttype, mtt) in sorted(rules.items()):
        if ttype == 2 and (i, j) not in seen:
            m = haversine_m(stops[i]["lat"], stops[i]["lon"], stops[j]["lat"], stops[j]["lon"]) * DETOUR
            if m <= NAMED_PAIR_MAX_M:
                out.append([i, j, max(int(round(m / WALK_MS)), max(mtt, 0))])
                added += 1
    return out, added


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stops, stop_index = [], {}
    routes, route_index = [], {}
    trips, trip_index = [], {}
    feeds_meta = []
    conns_by_day = defaultdict(list)
    shapes_used = {}
    raw_transfers = []  # (from_key, to_key, transfer_type, min_transfer_time or None)

    for prefix, folder, display in FEEDS:
        info = (read(folder, "feed_info.txt") or [{}])[0]
        feeds_meta.append({
            "prefix": prefix, "name": display,
            "version": info.get("feed_version"), "start": info.get("feed_start_date"), "end": info.get("feed_end_date"),
        })
        cal, cal_dates = read(folder, "calendar.txt"), read(folder, "calendar_dates.txt")

        for r in read(folder, "routes.txt"):
            if r["route_id"] in EXCLUDE_ROUTES.get(prefix, set()):
                continue
            key = f"{prefix}:{r['route_id']}"
            route_index[key] = len(routes)
            routes.append({
                "id": key, "feed": prefix, "short": r.get("route_short_name", "").strip(),
                "long": r.get("route_long_name", "").strip(), "color": "#" + (r.get("route_color") or "777777").strip().lower(),
            })

        for s in read(folder, "stops.txt"):
            if (s.get("location_type") or "0").strip() not in ("", "0"):
                continue
            key = f"{prefix}:{s['stop_id']}"
            stop_index[key] = len(stops)
            stops.append({"id": key, "name": s["stop_name"].strip(), "lat": round(float(s["stop_lat"]), 6),
                          "lon": round(float(s["stop_lon"]), 6), "feed": prefix})

        for r in read(folder, "transfers.txt"):
            mtt = (r.get("min_transfer_time") or "").strip()
            raw_transfers.append((f"{prefix}:{r['from_stop_id'].strip()}", f"{prefix}:{r['to_stop_id'].strip()}",
                                  (r.get("transfer_type") or "0").strip() or "0", int(mtt) if mtt else None))

        raw_trips = {t["trip_id"]: t for t in read(folder, "trips.txt")
                     if f"{prefix}:{t['route_id']}" in route_index}

        times = defaultdict(list)
        for st in read(folder, "stop_times.txt"):
            if st["trip_id"] in raw_trips:
                times[st["trip_id"]].append(st)

        day_services = {day: active_services(cal, cal_dates, dt.date.fromisoformat(d)) for day, d in DAYS.items()}

        for tid, t in raw_trips.items():
            days_on = [day for day, svc in day_services.items() if t["service_id"] in svc]
            if not days_on:
                continue
            seq = sorted(times[tid], key=lambda r: int(r["stop_sequence"]))
            seq = [r for r in seq if f"{prefix}:{r['stop_id']}" in stop_index]
            if len(seq) < 2:
                continue
            arr = [secs(r["arrival_time"]) for r in seq]
            dep = [secs(r["departure_time"]) for r in seq]
            for i in range(len(seq)):  # fill missing times from the other column
                if arr[i] is None:
                    arr[i] = dep[i]
                if dep[i] is None:
                    dep[i] = arr[i]
            known = [i for i in range(len(seq)) if arr[i] is not None]
            if len(known) < 2:
                continue
            for a, b in zip(known, known[1:]):  # linear interpolation between timepoints
                for i in range(a + 1, b):
                    v = round(dep[a] + (arr[b] - dep[a]) * (i - a) / (b - a))
                    arr[i] = dep[i] = v
            first, last = known[0], known[-1]
            seq, arr, dep = seq[first:last + 1], arr[first:last + 1], dep[first:last + 1]

            key = f"{prefix}:{tid}"
            trip_index[key] = len(trips)
            shape_key = f"{prefix}:{t['shape_id']}" if t.get("shape_id") else None
            if shape_key:
                shapes_used[shape_key] = route_index[f"{prefix}:{t['route_id']}"]
            trips.append([route_index[f"{prefix}:{t['route_id']}"], (t.get("trip_headsign") or "").strip(), shape_key])
            ti = trip_index[key]
            for i in range(len(seq) - 1):
                # (dep_stop, arr_stop, dep, arr, trip, seq) where seq is the hop index in stop order
                c = (stop_index[f"{prefix}:{seq[i]['stop_id']}"], stop_index[f"{prefix}:{seq[i + 1]['stop_id']}"],
                     dep[i], arr[i + 1], ti, i)
                if c[3] < c[2]:
                    raise ValueError(f"negative ride time in trip {key}")
                for day in days_on:
                    conns_by_day[day].append(c)

    days_meta, written = {}, {}
    for day, date in DAYS.items():
        rows = sorted(conns_by_day[day], key=lambda c: (c[2], c[3], c[4], c[5]))
        last = {}
        for c in rows:  # assertion: each trip's hops appear in stop order
            prev = last.get(c[4])
            assert prev is None or prev < c[5], f"{day}: trip {c[4]} hop {c[5]} sorted after hop {prev}"
            last[c[4]] = c[5]
        a = np.asarray([c[:5] for c in rows], dtype="<i4").reshape(-1, 5)
        h = hashlib.sha1(a.tobytes()).hexdigest()[:10]
        if h not in written:
            written[h] = f"conn_{day}.bin"
            atomic_write(OUT / written[h], a.tobytes())
        trips_on = len({c[4] for c in rows})
        days_meta[day] = {"date": date, "file": written[h], "connections": int(a.shape[0]), "trips": trips_on,
                          "first_dep": int(a[:, 2].min()), "last_arr": int(a[:, 3].max())}
        print(f"{day} {date}: {a.shape[0]} connections, {trips_on} trips, "
              f"{a[:, 2].min() / 3600:.2f}h to {a[:, 3].max() / 3600:.2f}h -> {written[h]} (stop order asserted)")

    # Change times and named transfer pairs from transfers.txt.
    change = [-1] * len(stops)
    transfers = []
    for fk, tk, ttype, mtt in raw_transfers:
        if fk not in stop_index or tk not in stop_index:
            continue
        i, j = stop_index[fk], stop_index[tk]
        if i == j:
            if ttype == "2" and mtt is not None:
                change[i] = mtt
        else:
            transfers.append([i, j, int(ttype), mtt if mtt is not None else -1])
    print(f"change times from transfers.txt: {sum(1 for c in change if c >= 0)} stops; named pairs {len(transfers)}")

    # Crow-fly transfer footpaths between nearby stops. pipeline/build_walk.py replaces these
    # with street-network distances once the OpenStreetMap graph exists.
    MAX_M = 400.0
    foot = []
    lat = np.array([s["lat"] for s in stops]); lon = np.array([s["lon"] for s in stops])
    for i, s in enumerate(stops):
        dlat = (lat - s["lat"]) * 111320.0
        dlon = (lon - s["lon"]) * 111320.0 * math.cos(math.radians(s["lat"]))
        d = np.sqrt(dlat ** 2 + dlon ** 2)
        for j in np.nonzero((d <= MAX_M) & (np.arange(len(stops)) != i))[0]:
            foot.append([i, int(j), int(round(d[j] * DETOUR / WALK_MS))])
    foot_source = "crow-fly x1.25 at 1.3 m/s (placeholder)"

    # If the stop list is unchanged, keep the street-network footpaths and stop snaps from the last
    # build_walk.py run, so readers stay valid until build_walk.py rewrites them.
    carried = {}
    old_path = OUT / "meta.json"
    if old_path.exists():
        try:
            old = json.loads(old_path.read_text(encoding="utf-8"))
            if "stop_snap" in old and [s["id"] for s in old.get("stops", [])] == [s["id"] for s in stops]:
                foot = old.get("footpaths_street", old["footpaths"])
                foot_source = old.get("footpath_source", foot_source)
                carried = {"stop_snap": old["stop_snap"], "footpaths_street": foot}
                print("stop list unchanged: kept street footpaths and stop snaps from the last walk build")
        except (ValueError, KeyError):
            pass
    foot, added = apply_transfers(foot, transfers, stops)
    print(f"footpaths {len(foot)} after transfers.txt rules ({added} named pairs added)")

    meta = {
        "feeds": feeds_meta, "days": days_meta,
        "stops": stops, "routes": routes, "trips": trips,
        "change": change,
        "change_source": "same-stop min_transfer_time from transfers.txt; -1 means the engine default",
        "transfers": transfers,
        "footpaths": foot, "footpath_source": foot_source, **carried,
        "attribution": [
            "Transit scheduling, geographic, and real-time data provided by permission of AAATA/TheRide",
            "U-M bus schedules: University of Michigan Logistics, Transportation and Parking",
        ],
    }

    features = []
    for prefix, folder, _ in FEEDS:
        pts = defaultdict(list)
        for r in read(folder, "shapes.txt"):
            key = f"{prefix}:{r['shape_id']}"
            if key in shapes_used:
                pts[key].append((int(r["shape_pt_sequence"]), round(float(r["shape_pt_lon"]), 5), round(float(r["shape_pt_lat"]), 5)))
        for key, p in pts.items():
            p.sort()
            ri = shapes_used[key]
            features.append({"type": "Feature", "properties": {"shape": key, "route": ri, "color": routes[ri]["color"]},
                             "geometry": {"type": "LineString", "coordinates": [[x, y] for _, x, y in p]}})
    atomic_write(OUT / "shapes.geojson", json.dumps({"type": "FeatureCollection", "features": features},
                                                    separators=(",", ":")))
    atomic_write(OUT / "meta.json", json.dumps(meta, separators=(",", ":")))
    for old in OUT.glob("conn_*.bin"):  # day files no longer referenced, removed after the new meta is in place
        if old.name not in written.values():
            old.unlink()

    print(f"stops {len(stops)}, routes {len(routes)}, trips {len(trips)}, footpaths {len(foot)}, shapes {len(features)}")
    for f in sorted(OUT.iterdir()):
        print(f"  {f.name}: {f.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
