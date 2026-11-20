"""SYNTHETIC candidate homes for the demo, placed on real residential streets.

Every home, room, size and rent below is made up for the demo (labeled SYNTHETIC in the file and in the UI).
Only the location is real: each home sits on a vertex of a named OSM street with highway=residential
(k == "residential" in web/public/data/streets/streets.geojson) inside its neighborhood's box.
Names carry the street and the type, never a house number.

Per-room asking rents are not market data. They split the whole-house rent by a simple hedonic rule at
the prior medians in engine/model.js (private bath $60, half bath $30, $8 per 10 sq ft over 120, $20 per
daylight level), scaled by 0.8 and rounded to $5, then adjusted so the rooms sum to the house rent.

Run from the repo root:  python pipeline/build_homes.py
Output: web/public/data/homes.json
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STREETS = ROOT / "web" / "public" / "data" / "streets" / "streets.geojson"
OUT = ROOT / "web" / "public" / "data" / "homes.json"

# neighborhood boxes (south, west, north, east)
AREAS = {
    "South Central": (42.266, -83.745, 42.276, -83.733),
    "East University": (42.270, -83.736, 42.279, -83.725),
    "Kerrytown": (42.282, -83.750, 42.292, -83.743),
    "Old Fourth Ward": (42.280, -83.745, 42.288, -83.737),
    "Medical Campus": (42.280, -83.742, 42.290, -83.730),
    "North Campus": (42.293, -83.725, 42.306, -83.695),
    "Burns Park": (42.260, -83.735, 42.272, -83.715),
    "Old West Side": (42.272, -83.766, 42.283, -83.750),
    "Lower Town": (42.287, -83.750, 42.298, -83.733),
}

BATH = {"private": 1.0, "half": 0.5, "shared": 0.0}
MIN_SEP_M = 90  # no two homes closer than this


def R(label, sqft, bath, light, floor):
    return {"label": label, "sqft": sqft, "bath": bath, "light": light, "floor": floor}


# (street, kind, area, rent, utilities, irregular, pos along street, rooms)
HOMES = [
    # ---- houses with exactly five rooms (the group of five chooses among these) ----
    ("Church Street", "house", "South Central", 4650, 300, True, 0.5, [
        R("Attic room", 215, "shared", 1, "attic"), R("Front room", 160, "shared", 2, "2"),
        R("Back room", 130, "shared", 1, "2"), R("Parlor room", 145, "half", 1, "1"),
        R("Basement room", 115, "shared", 0, "basement")]),
    ("Lawrence Street", "house", "Old Fourth Ward", 4800, 320, True, 0.5, [
        R("Primary with bath", 190, "private", 2, "2"), R("Front room", 150, "shared", 2, "2"),
        R("Side room", 105, "shared", 1, "2"), R("Porch room", 140, "shared", 1, "1"),
        R("Basement room", 165, "shared", 0, "basement")]),
    ("Broadway Street", "house", "Lower Town", 4150, 290, True, 0.35, [
        R("Attic room", 180, "shared", 1, "attic"), R("Corner room", 155, "shared", 2, "2"),
        R("Small room", 100, "shared", 1, "2"), R("Garden room", 150, "half", 2, "1"),
        R("Basement room", 135, "shared", 0, "basement")]),
    ("Lincoln Avenue", "house", "Burns Park", 4500, 310, True, 0.5, [
        R("Primary with bath", 175, "private", 1, "2"), R("Sunroom", 125, "shared", 2, "1"),
        R("Front room", 160, "shared", 2, "2"), R("Back room", 140, "shared", 1, "2"),
        R("Attic room", 200, "shared", 1, "attic")]),
    ("Georgetown Boulevard", "house", "North Campus", 3950, 280, True, 0.5, [
        R("Primary with bath", 185, "private", 2, "2"), R("Front room", 145, "shared", 1, "2"),
        R("Back room", 135, "shared", 1, "2"), R("Den", 120, "half", 1, "1"),
        R("Basement room", 170, "shared", 0, "basement")]),
    ("Hill Street", "house", "East University", 4900, 300, False, 0.5, [
        R("Room 1", 140, "shared", 2, "2"), R("Room 2", 140, "shared", 1, "2"),
        R("Room 3", 135, "shared", 1, "2"), R("Room 4", 140, "shared", 1, "1"),
        R("Room 5", 135, "shared", 1, "1")]),
    # ---- other irregular houses (4 or 6 rooms) ----
    ("Third Street", "house", "Old West Side", 3300, 260, True, 0.5, [
        R("Attic room", 190, "shared", 1, "attic"), R("Front room", 150, "half", 2, "1"),
        R("Back room", 120, "shared", 1, "1"), R("Basement room", 140, "shared", 0, "basement")]),
    ("East Ann Street", "house", "Old Fourth Ward", 5850, 360, True, 0.6, [
        R("Primary with bath", 200, "private", 2, "2"), R("Front room", 165, "shared", 2, "2"),
        R("Middle room", 110, "shared", 1, "2"), R("Back room", 130, "shared", 1, "2"),
        R("Porch room", 145, "half", 1, "1"), R("Basement room", 150, "shared", 0, "basement")]),
    ("South Forest Avenue", "house", "South Central", 6100, 370, True, 0.3, [
        R("Primary with bath", 210, "private", 2, "2"), R("Attic room", 230, "shared", 1, "attic"),
        R("Front room", 150, "shared", 2, "2"), R("Small room", 95, "shared", 1, "2"),
        R("Parlor room", 155, "half", 1, "1"), R("Basement room", 125, "shared", 0, "basement")]),
    ("Catherine Street", "house", "Medical Campus", 3600, 270, True, 0.5, [
        R("Front room", 155, "shared", 2, "2"), R("Back room", 125, "shared", 1, "2"),
        R("Parlor room", 150, "half", 1, "1"), R("Basement room", 175, "shared", 0, "basement")]),
    # ---- regular houses ----
    ("Vaughn Street", "house", "South Central", 3800, 280, False, 0.5, [
        R("Room 1", 135, "shared", 1, "2"), R("Room 2", 135, "shared", 1, "2"),
        R("Room 3", 130, "shared", 1, "1"), R("Room 4", 130, "shared", 1, "1")]),
    ("Prospect Street", "house", "Burns Park", 2850, 240, False, 0.5, [
        R("Room 1", 140, "shared", 1, "2"), R("Room 2", 135, "shared", 1, "2"),
        R("Room 3", 135, "shared", 1, "1")]),
    ("West Washington Street", "house", "Old West Side", 2700, 230, False, 0.5, [
        R("Room 1", 140, "shared", 2, "2"), R("Room 2", 130, "shared", 1, "2"),
        R("Room 3", 130, "shared", 1, "1")]),
    ("Hiscock Street", "house", "Kerrytown", 3500, 260, False, 0.5, [
        R("Room 1", 135, "shared", 1, "2"), R("Room 2", 135, "shared", 1, "2"),
        R("Room 3", 135, "shared", 1, "1"), R("Room 4", 130, "shared", 1, "1")]),
    ("Kellogg Street", "house", "Lower Town", 2600, 230, False, 0.5, [
        R("Room 1", 140, "shared", 1, "2"), R("Room 2", 135, "shared", 1, "2"),
        R("Room 3", 130, "shared", 1, "1")]),
    # ---- apartments, 1 to 3 bedrooms ----
    ("South University Avenue", "apartment", "East University", 3050, 140, False, 0.5, [
        R("Bedroom 1", 130, "private", 2, "2"), R("Bedroom 2", 120, "private", 1, "2")]),
    ("Elm Street", "apartment", "East University", 1650, 100, False, 0.5, [
        R("Bedroom", 140, "private", 1, "2")]),
    ("Washtenaw Court", "apartment", "East University", 2700, 130, False, 0.5, [
        R("Bedroom 1", 125, "shared", 1, "2"), R("Bedroom 2", 120, "shared", 1, "2")]),
    ("Arch Street", "apartment", "South Central", 2450, 120, False, 0.5, [
        R("Bedroom 1", 130, "shared", 2, "2"), R("Bedroom 2", 115, "shared", 1, "2")]),
    ("Cambridge Road", "apartment", "Burns Park", 3150, 160, False, 0.5, [
        R("Bedroom 1", 140, "private", 1, "1"), R("Bedroom 2", 120, "shared", 1, "1"),
        R("Bedroom 3", 110, "shared", 1, "1")]),
    ("North Fifth Avenue", "apartment", "Kerrytown", 1550, 95, False, 0.5, [
        R("Bedroom", 135, "private", 2, "2")]),
    ("Detroit Street", "apartment", "Kerrytown", 2500, 120, False, 0.5, [
        R("Bedroom 1", 130, "shared", 2, "2"), R("Bedroom 2", 115, "shared", 1, "2")]),
    ("Plymouth Road", "apartment", "North Campus", 2050, 120, False, 0.5, [
        R("Bedroom 1", 135, "shared", 1, "2"), R("Bedroom 2", 130, "shared", 1, "2")]),
    ("Commonwealth Boulevard", "apartment", "North Campus", 2700, 150, False, 0.5, [
        R("Bedroom 1", 140, "private", 1, "2"), R("Bedroom 2", 125, "shared", 1, "2"),
        R("Bedroom 3", 120, "shared", 1, "2")]),
    ("Broadview Lane", "apartment", "North Campus", 1300, 90, False, 0.5, [
        R("Bedroom", 140, "private", 1, "1")]),
    ("Glen Court", "apartment", "Medical Campus", 1500, 95, False, 0.5, [
        R("Bedroom", 125, "private", 1, "2")]),
    ("North Ingalls Street", "apartment", "Medical Campus", 2400, 120, False, 0.5, [
        R("Bedroom 1", 130, "shared", 1, "2"), R("Bedroom 2", 120, "shared", 1, "2")]),
    ("Second Street", "apartment", "Old West Side", 1400, 90, False, 0.5, [
        R("Bedroom", 130, "private", 2, "1")]),
    ("Wright Street", "apartment", "Lower Town", 2100, 115, False, 0.5, [
        R("Bedroom 1", 130, "shared", 1, "2"), R("Bedroom 2", 120, "shared", 1, "2")]),
    ("Canal Street", "apartment", "Lower Town", 1350, 90, False, 0.5, [
        R("Bedroom", 135, "private", 1, "2")]),
]


def dist_m(a, b):
    dy = (a[1] - b[1]) * 111_320
    dx = (a[0] - b[0]) * 111_320 * math.cos(math.radians(42.28))
    return math.hypot(dx, dy)


def street_points(feats, street, area):
    s, w, n, e = AREAS[area]
    pts = set()
    for f in feats:
        p = f["properties"]
        if p.get("k") != "residential" or p.get("n") != street:
            continue
        for lon, lat in f["geometry"]["coordinates"]:
            if s <= lat <= n and w <= lon <= e:
                pts.add((lon, lat))
    # order along the street's main direction so `pos` means "fraction along the street inside the box"
    pts = sorted(pts)
    if pts:
        span_lon = pts[-1][0] - pts[0][0]
        span_lat = max(p[1] for p in pts) - min(p[1] for p in pts)
        if span_lat * 1.35 > span_lon:
            pts.sort(key=lambda p: (p[1], p[0]))
    return pts


def asking_split(rent, rooms):
    def hedonic(r):
        return 0.8 * (60 * BATH[r["bath"]] + 8 * (r["sqft"] - 120) / 10 + 20 * r["light"])
    vals = [hedonic(r) for r in rooms]
    mean = sum(vals) / len(vals)
    raw = [rent / len(rooms) + v - mean for v in vals]
    ask = [int(round(x / 5) * 5) for x in raw]
    ask[0] += rent - sum(ask)  # absorb rounding in the first room
    return ask


def main():
    feats = json.loads(STREETS.read_text(encoding="utf-8"))["features"]
    homes, placed, bad = [], [], []
    for i, (street, kind, area, rent, util, irregular, pos, rooms) in enumerate(HOMES, start=1):
        pts = street_points(feats, street, area)
        if not pts:
            bad.append(f"{street} ({area}): no residential vertex in the box")
            continue
        # start at pos, then walk outward until the point is far enough from every placed home
        order = sorted(range(len(pts)), key=lambda k: abs(k - pos * (len(pts) - 1)))
        pick = next((pts[k] for k in order if all(dist_m(pts[k], q) >= MIN_SEP_M for q in placed)), None)
        if pick is None:
            bad.append(f"{street} ({area}): every vertex is within {MIN_SEP_M} m of another home")
            continue
        placed.append(pick)
        hid = f"h{i}"
        short = street.replace(" Avenue", " Ave").replace(" Street", " St").replace(" Boulevard", " Blvd").replace(" Road", " Rd").replace(" Court", " Ct").replace(" Lane", " Ln")
        n = len(rooms)
        name = f"{short} {kind}, {n} bed"
        ask = asking_split(rent, rooms)
        homes.append({
            "id": hid, "name": name, "area": area, "kind": kind, "irregular": irregular,
            "lat": round(pick[1], 6), "lon": round(pick[0], 6), "street": street,
            "rent": rent, "utilities": util,
            "rooms": [{"id": f"{hid}r{j + 1}", **r, "asking": ask[j]} for j, r in enumerate(rooms)],
        })
    if bad:
        print("FAILED:\n  " + "\n  ".join(bad))
        sys.exit(1)
    names = [h["name"] for h in homes]
    assert len(set(names)) == len(names), "duplicate home names"
    doc = {
        "label": "SYNTHETIC: homes, rooms and rents are made up for the demo. Locations are real residential "
                 "streets from OpenStreetMap (no house numbers). Not listings.",
        "source": "pipeline/build_homes.py; street points from OSM via web/public/data/streets/streets.geojson",
        "homes": homes,
    }
    OUT.write_text(json.dumps(doc, indent=1), encoding="utf-8")
    five = sum(1 for h in homes if h["kind"] == "house" and len(h["rooms"]) == 5)
    irr = sum(1 for h in homes if h["irregular"])
    apts = sum(1 for h in homes if h["kind"] == "apartment")
    for h in homes:
        print(f"{h['id']:4s} {h['name']:36s} {h['area']:16s} {h['lat']:.5f},{h['lon']:.5f} ${h['rent']:5d} "
              f"asking {[r['asking'] for r in h['rooms']]}")
    print(f"{len(homes)} homes: {five} five-room houses, {irr} irregular, {apts} apartments -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
