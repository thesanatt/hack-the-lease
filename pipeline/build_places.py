"""Geocode the real places a student's week can include (U-M buildings, downtown, groceries)
from OpenStreetMap via Nominatim (osmnx.geocode, 1 request per second, cached).

Run from the repo root:  python pipeline/build_places.py
Output: web/public/data/places.json
"""
import json
import time
from pathlib import Path

import osmnx as ox

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data" / "places.json"
ox.settings.use_cache = True
ox.settings.cache_folder = str(ROOT / "data" / "raw" / "osm" / "cache")
ox.settings.log_console = False

# id, label, area, query (first match wins), kind
PLACES = [
    ("ugli", "Shapiro Library (UgLi)", "Central", ["Shapiro Undergraduate Library, Ann Arbor"], "study"),
    ("hatcher", "Hatcher Graduate Library", "Central", ["Hatcher Graduate Library, Ann Arbor"], "study"),
    ("union", "Michigan Union", "Central", ["Michigan Union, Ann Arbor"], "campus"),
    ("angell", "Angell Hall", "Central", ["Angell Hall, Ann Arbor"], "class"),
    ("chem", "Chemistry Building", "Central", ["Chemistry Building, 930 North University Avenue, Ann Arbor", "Chemistry Building, Ann Arbor"], "class"),
    ("ross", "Ross School of Business", "Central", ["Stephen M. Ross School of Business, Ann Arbor", "Ross School of Business, Ann Arbor"], "class"),
    ("league", "Michigan League", "Central", ["Michigan League, Ann Arbor"], "campus"),
    ("law", "Law Quad", "Central", ["Law Quadrangle, Ann Arbor", "University of Michigan Law School, Ann Arbor"], "class"),
    ("imsb", "Intramural Sports Building", "South", ["Intramural Sports Building, Ann Arbor"], "gym"),
    ("ccrb", "Central Campus Rec Building", "Central", ["Central Campus Recreation Building, Ann Arbor"], "gym"),
    ("stadium", "Michigan Stadium", "South", ["Michigan Stadium, Ann Arbor"], "campus"),
    ("pierpont", "Pierpont Commons", "North", ["Pierpont Commons, Ann Arbor"], "campus"),
    ("dude", "Duderstadt Center", "North", ["James and Anne Duderstadt Center, Ann Arbor", "Duderstadt Center, Ann Arbor"], "study"),
    ("beyster", "Beyster Building", "North", ["Bob and Betty Beyster Building, Ann Arbor", "Beyster Building, Ann Arbor"], "class"),
    ("ggbrown", "G.G. Brown Lab", "North", ["G. G. Brown Laboratory, Ann Arbor", "GG Brown Laboratory, Ann Arbor"], "class"),
    ("eecs", "EECS Building", "North", ["Electrical Engineering and Computer Science Building, Ann Arbor"], "class"),
    ("fmcrb", "Ford Robotics Building", "North", ["Ford Motor Company Robotics Building, Ann Arbor", "Ford Robotics Building, Ann Arbor"], "class"),
    ("ncrb", "North Campus Rec Building", "North", ["North Campus Recreation Building, Ann Arbor"], "gym"),
    ("music", "Moore Building (Music)", "North", ["Earl V. Moore Building, Ann Arbor", "Moore Building, Ann Arbor"], "class"),
    ("uh", "University Hospital", "Medical", ["University Hospital, 1500 East Medical Center Drive, Ann Arbor", "University of Michigan Hospital, Ann Arbor"], "work"),
    ("mott", "C.S. Mott Children's Hospital", "Medical", ["C.S. Mott Children's Hospital, Ann Arbor"], "work"),
    ("nursing", "School of Nursing (NIB)", "Medical", ["400 North Ingalls Street, Ann Arbor", "North Ingalls Building, Ann Arbor"], "class"),
    ("thsl", "Taubman Health Sciences Library", "Medical", ["Taubman Health Sciences Library, Ann Arbor"], "study"),
    ("kerrytown", "Kerrytown Market", "Downtown", ["Kerrytown Shops, Ann Arbor", "Kerrytown Market & Shops, Ann Arbor"], "work"),
    ("btc", "Blake Transit Center", "Downtown", ["Blake Transit Center, Ann Arbor"], "transit"),
    ("mainst", "Main St at Liberty", "Downtown", ["East Liberty Street & South Main Street, Ann Arbor", "Main Street, Ann Arbor"], "work"),
    ("tj", "Trader Joe's", "East", ["Trader Joe's, 2398 East Stadium Boulevard, Ann Arbor", "Trader Joe's, Ann Arbor"], "errand"),
    ("meijer", "Meijer (Ann Arbor-Saline)", "South", ["Meijer, Ann Arbor-Saline Road, Ann Arbor", "Meijer, Ann Arbor"], "errand"),
    ("kroger", "Kroger (Packard)", "South", ["Kroger, Packard Street, Ann Arbor", "Kroger, Ann Arbor"], "errand"),
]

BBOX = (-83.80, 42.215, -83.66, 42.33)


def main():
    out, missing = [], []
    for pid, label, area, queries, kind in PLACES:
        hit = None
        for q in queries:
            try:
                lat, lon = ox.geocode(q)
            except Exception:
                time.sleep(1.1)
                continue
            time.sleep(1.1)
            if BBOX[1] <= lat <= BBOX[3] and BBOX[0] <= lon <= BBOX[2]:
                hit = (lat, lon, q)
                break
        if hit:
            out.append({"id": pid, "label": label, "area": area, "kind": kind,
                        "lat": round(hit[0], 6), "lon": round(hit[1], 6), "source": f"OSM Nominatim: {hit[2]}"})
            print(f"ok   {pid:10s} {hit[0]:.5f},{hit[1]:.5f}  <- {hit[2]}")
        else:
            missing.append(pid)
            print(f"MISS {pid}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"{len(out)} places, missing: {missing}")


if __name__ == "__main__":
    main()
