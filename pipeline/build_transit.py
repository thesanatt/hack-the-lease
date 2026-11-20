"""Build compact timetable artifacts from the TheRide (AAATA) and U-M Transit GTFS feeds.

Run from the repo root:  python pipeline/build_transit.py

Outputs in web/public/data/transit/:
  meta.json          stops, routes, trips, service days, feed versions
  conn_<day>.bin     connections sorted by departure time. Int32 little-endian,
                     5 values per connection: dep_stop, arr_stop, dep_s, arr_s, trip.
                     Times are seconds after midnight of the service day (can exceed 86400).
  shapes.geojson     one LineString per shape, for the map and trip animation
"""
import csv
import datetime as dt
import io
import json
import math
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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stops, stop_index = [], {}
    routes, route_index = [], {}
    trips, trip_index = [], {}
    feeds_meta = []
    conns_by_day = defaultdict(list)
    shapes_used = {}

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
                c = (stop_index[f"{prefix}:{seq[i]['stop_id']}"], stop_index[f"{prefix}:{seq[i + 1]['stop_id']}"],
                     dep[i], arr[i + 1], ti)
                if c[3] < c[2]:
                    raise ValueError(f"negative ride time in trip {key}")
                for day in days_on:
                    conns_by_day[day].append(c)

    import hashlib
    for old in OUT.glob("conn_*.bin"):
        old.unlink()
    days_meta, written = {}, {}
    for day, date in DAYS.items():
        rows = sorted(conns_by_day[day], key=lambda c: (c[2], c[3], c[4]))
        a = np.asarray(rows, dtype="<i4").reshape(-1, 5)
        h = hashlib.sha1(a.tobytes()).hexdigest()[:10]
        if h not in written:
            written[h] = f"conn_{day}.bin"
            a.tofile(OUT / written[h])
        trips_on = len({c[4] for c in rows})
        days_meta[day] = {"date": date, "file": written[h], "connections": int(a.shape[0]), "trips": trips_on,
                          "first_dep": int(a[:, 2].min()), "last_arr": int(a[:, 3].max())}
        print(f"{day} {date}: {a.shape[0]} connections, {trips_on} trips, "
              f"{a[:, 2].min() / 3600:.2f}h to {a[:, 3].max() / 3600:.2f}h -> {written[h]}")

    # Crow-fly transfer footpaths between nearby stops. pipeline/build_walk.py replaces these
    # with street-network distances once the OpenStreetMap graph exists.
    WALK_MS, DETOUR, MAX_M = 1.3, 1.25, 400.0
    foot = []
    lat = np.array([s["lat"] for s in stops]); lon = np.array([s["lon"] for s in stops])
    for i, s in enumerate(stops):
        dlat = (lat - s["lat"]) * 111320.0
        dlon = (lon - s["lon"]) * 111320.0 * math.cos(math.radians(s["lat"]))
        d = np.sqrt(dlat ** 2 + dlon ** 2)
        for j in np.nonzero((d <= MAX_M) & (np.arange(len(stops)) != i))[0]:
            foot.append([i, int(j), int(round(d[j] * DETOUR / WALK_MS))])

    meta = {
        "feeds": feeds_meta, "days": days_meta,
        "stops": stops, "routes": routes, "trips": trips,
        "footpaths": foot, "footpath_source": "crow-fly x1.25 at 1.3 m/s (placeholder)",
        "attribution": [
            "Transit scheduling, geographic, and real-time data provided by permission of AAATA/TheRide",
            "U-M bus schedules: University of Michigan Logistics, Transportation and Parking",
        ],
    }
    (OUT / "meta.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")

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
    (OUT / "shapes.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                                   separators=(",", ":")), encoding="utf-8")

    print(f"stops {len(stops)}, routes {len(routes)}, trips {len(trips)}, footpaths {len(foot)}, shapes {len(features)}")
    for f in OUT.iterdir():
        print(f"  {f.name}: {f.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
