"""Real places a student's week can include (U-M buildings, downtown, groceries), taken from
OpenStreetMap by element id out of the local Geofabrik Michigan extract (no network needed).

Why element ids and not a geocoder: Nominatim returned nothing for several campus buildings and once
matched "Main Street, Ann Arbor" to a point on the far north side; the public Overpass mirrors timed out
or failed TLS from this machine on Nov 19 2026. Looking up fixed OSM ids in the extract is exact and
reproducible. Every point is checked against a bounding box for its stated area; the build fails if any
point falls outside.

Run from the repo root:  python pipeline/build_places.py
Input:  data/raw/osm/michigan-latest.osm.pbf (Geofabrik)
Output: web/public/data/places.json
"""
import json
import sys
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
PBF = ROOT / "data" / "raw" / "osm" / "michigan-latest.osm.pbf"
OUT = ROOT / "web" / "public" / "data" / "places.json"

# Area bounding boxes (south, west, north, east). A place must lie inside its own area's box.
AREAS = {
    "Central": (42.268, -83.745, 42.282, -83.729),
    "North": (42.286, -83.726, 42.310, -83.700),
    "Medical": (42.279, -83.740, 42.290, -83.723),
    "Downtown": (42.274, -83.756, 42.290, -83.742),
    "South": (42.258, -83.756, 42.272, -83.735),
    "East": (42.250, -83.725, 42.268, -83.700),
    "Southwest": (42.230, -83.780, 42.250, -83.750),
}

# id, label, area, kind, OSM element ("w123", "r123", "n123") or ("x", street A, street B) for an intersection
PLACES = [
    ("ugli", "Shapiro Library (UgLi)", "Central", "study", "w99883665"),
    ("hatcher", "Hatcher Graduate Library", "Central", "study", "w99883675"),
    ("union", "Michigan Union", "Central", "campus", "w154203582"),
    ("angell", "Angell Hall", "Central", "class", "w300676078"),
    ("chem", "Chemistry Building", "Central", "class", "r1429039"),
    ("ross", "Ross School of Business", "Central", "class", "w154232149"),
    ("league", "Michigan League", "Central", "campus", "w154203580"),
    ("hill", "Hill Auditorium", "Central", "class", "w154203557"),
    ("law", "Law Quad (Hutchins Hall)", "Central", "class", "w154203693"),
    ("ccrb", "Central Campus Rec (Hadley Center)", "Central", "gym", "w1357847242"),
    ("imsb", "Intramural Sports Building", "South", "gym", "w154232135"),
    ("stadium", "Michigan Stadium", "South", "campus", "r1637002"),
    ("pierpont", "Pierpont Commons", "North", "campus", "w82245561"),
    ("dude", "Duderstadt Center", "North", "study", "r19797223"),
    ("beyster", "Beyster Building", "North", "class", "w82246736"),
    ("ggbrown", "G.G. Brown Building", "North", "class", "w82249280"),
    ("eecs", "EECS Building", "North", "class", "w242379149"),
    ("fmcrb", "Ford Robotics Building", "North", "class", "w905192719"),
    ("ncrb", "North Campus Rec Building", "North", "gym", "r17558946"),
    ("music", "Moore Building (Music)", "North", "class", "r16068956"),
    ("kroger", "Kroger (Plymouth Rd)", "North", "errand", "n2352859060"),
    ("uh", "University Hospital", "Medical", "work", "w302347135"),
    ("mott", "C.S. Mott Children's Hospital", "Medical", "work", "w300848288"),
    ("nursing", "School of Nursing", "Medical", "class", "w302435570"),
    ("thsl", "Taubman Health Sciences Library", "Medical", "study", "w302169787"),
    ("kerrytown", "Kerrytown Market", "Downtown", "work", "w193502051"),
    ("aadl", "Downtown Library (AADL)", "Downtown", "work", "w1131066501"),
    ("btc", "Blake Transit Center", "Downtown", "transit", "w333476734"),
    ("mainst", "Main St at Liberty", "Downtown", "work", ("x", "Main Street", "Liberty Street")),
    ("tj", "Trader Joe's", "East", "errand", "n2040508139"),
    ("meijer", "Meijer (Ann Arbor-Saline)", "Southwest", "errand", "w303682819"),
]


def inside(area, lat, lon):
    s, w, n, e = AREAS[area]
    return s <= lat <= n and w <= lon <= e


def lookup_osm(wanted):
    """wanted: set of 'n123' / 'w123' / 'r123'. Returns {ref: (lat, lon, name)} (vertex-mean centroid)."""
    found = {}
    nodes = {int(r[1:]) for r in wanted if r[0] == "n"}
    ways = {int(r[1:]) for r in wanted if r[0] == "w"}
    rels = {int(r[1:]) for r in wanted if r[0] == "r"}
    fp = osmium.FileProcessor(str(PBF)).with_locations().with_filter(osmium.filter.KeyFilter("name"))
    for o in fp:
        if o.is_node() and o.id in nodes:
            found[f"n{o.id}"] = (o.location.lat, o.location.lon, o.tags.get("name"))
        elif o.is_way() and o.id in ways:
            pts = [(x.lat, x.lon) for x in o.nodes if x.location.valid()]
            found[f"w{o.id}"] = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), o.tags.get("name"))
    if rels:
        fp = (osmium.FileProcessor(str(PBF)).with_areas(osmium.filter.KeyFilter("name"))
              .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)))
        for o in fp:
            if o.from_way() or o.orig_id() not in rels:
                continue
            pts = [(n.lat, n.lon) for ring in o.outer_rings() for n in ring]
            found[f"r{o.orig_id()}"] = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), o.tags.get("name"))
    return found


def intersection(a, b, area):
    """Mean of the OSM nodes shared by highways whose names contain a and b, inside the area box."""
    pa, pb = {}, {}
    fp = osmium.FileProcessor(str(PBF)).with_locations().with_filter(osmium.filter.KeyFilter("highway"))
    for o in fp:
        if not o.is_way():
            continue
        n = (o.tags.get("name") or "").replace(chr(160), " ")
        for want, acc in ((a, pa), (b, pb)):
            if want in n:
                for x in o.nodes:
                    if x.location.valid():
                        acc[x.ref] = (x.lat, x.lon)
    hits = [pa[k] for k in pa.keys() & pb.keys() if inside(area, *pa[k])]
    if not hits:
        return None
    return sum(h[0] for h in hits) / len(hits), sum(h[1] for h in hits) / len(hits)


def main():
    header = osmium.io.Reader(str(PBF), osmium.osm.osm_entity_bits.NOTHING).header()
    stamp = header.get("osmosis_replication_timestamp", "unknown")
    wanted = {p[4] for p in PLACES if isinstance(p[4], str)}
    found = lookup_osm(wanted)
    out, bad = [], []
    for pid, label, area, kind, ref in PLACES:
        if isinstance(ref, tuple):
            hit = intersection(ref[1], ref[2], area)
            src = f"OSM intersection of {ref[1]} and {ref[2]} (shared nodes), Geofabrik extract {stamp}"
        else:
            hit = found.get(ref)
            src = None
            if hit:
                kindname = {"n": "node", "w": "way", "r": "relation"}[ref[0]]
                src = f"OSM {kindname} {ref[1:]} ({hit[2].replace(chr(160), ' ')}), Geofabrik extract {stamp}"
        if not hit:
            bad.append(f"{pid}: not found ({ref})")
            continue
        lat, lon = hit[0], hit[1]
        if not inside(area, lat, lon):
            bad.append(f"{pid}: {lat:.5f},{lon:.5f} is outside {area}")
            continue
        out.append({"id": pid, "label": label, "area": area, "kind": kind,
                    "lat": round(lat, 6), "lon": round(lon, 6), "source": src})
        print(f"ok   {pid:10s} {area:9s} {lat:.5f},{lon:.5f}  <- {src}")
    if bad:
        print("FAILED:\n  " + "\n  ".join(bad))
        sys.exit(1)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"{len(out)} places written to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
