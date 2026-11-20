"""Clip the Geofabrik Michigan extract to the Ann Arbor box for R5 (r5py needs an .osm.pbf).

Run from the repo root:  python validation/clip_osm.py
Input:  data/raw/osm/michigan-latest.osm.pbf  (https://download.geofabrik.de/north-america/us/michigan.html)
Output: data/raw/osm/ann_arbor.osm.pbf
Keeps every way with at least one node inside the box, plus all nodes those ways reference.
"""
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "raw" / "osm" / "michigan-latest.osm.pbf"
DST = ROOT / "data" / "raw" / "osm" / "ann_arbor.osm.pbf"
W, S, E, N = -83.82, 42.20, -83.64, 42.34  # slightly larger than the routing box


def inside(loc):
    return loc.valid() and W <= loc.lon <= E and S <= loc.lat <= N


def main():
    kept = 0
    fp = osmium.FileProcessor(str(SRC), osmium.osm.NODE | osmium.osm.WAY).with_locations()
    with osmium.BackReferenceWriter(str(DST), ref_src=str(SRC), overwrite=True) as writer:
        for obj in fp:
            if obj.is_way() and any(inside(n.location) for n in obj.nodes):
                writer.add_way(obj)
                kept += 1
    print(f"kept {kept} ways -> {DST} ({DST.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
