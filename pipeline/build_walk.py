"""Build walk and bike street graphs for Ann Arbor from OpenStreetMap, and street-network
transfer footpaths between bus stops.

Run from the repo root after build_transit.py:  python pipeline/build_walk.py

Outputs in web/public/data/streets/:
  walk_nodes.bin   Float32 pairs (lat, lon) per node
  walk_csr.bin     Int32 offsets (n+1), then Int32 targets, then Float32 lengths (m)
  bike_csr.bin     same layout over the same node ids, directed (one-ways respected)
  streets.geojson  simplified street lines for the offline basemap
Also rewrites transit/meta.json footpaths with network distances (footpaths_street), then applies the
transfers.txt rules (max(walk, min_transfer_time) for named pairs) to give footpaths.
Every output is written to a temporary name and renamed, so concurrent readers never see half a file.

Data: OpenStreetMap contributors, ODbL. Downloaded through osmnx (Overpass API).
"""
import json
import math
import sys
from pathlib import Path

import networkx as nx
import numpy as np
import osmnx as ox

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_transit import apply_transfers, atomic_write  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "raw" / "osm"
OUT = ROOT / "web" / "public" / "data" / "streets"
TRANSIT = ROOT / "web" / "public" / "data" / "transit" / "meta.json"

# west, south, east, north: Ann Arbor plus a margin around the TheRide core network
BBOX = (-83.800, 42.215, -83.660, 42.330)
WALK_MS = 1.3          # assumption, stated on the Assumptions page
FOOTPATH_MAX_M = 500   # network distance cap for stop-to-stop transfers

ox.settings.use_cache = True
ox.settings.cache_folder = str(CACHE / "cache")
ox.settings.log_console = False


def load(kind):
    path = CACHE / f"{kind}.graphml"
    if path.exists():
        return ox.load_graphml(path)
    g = ox.graph_from_bbox(BBOX, network_type=kind, simplify=False, retain_all=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    ox.save_graphml(g, path)
    return g


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    walk = load("walk")
    bike = load("bike")
    print(f"walk graph: {walk.number_of_nodes()} nodes, {walk.number_of_edges()} edges")
    print(f"bike graph: {bike.number_of_nodes()} nodes, {bike.number_of_edges()} edges")

    # One shared node id space: every node in either graph.
    ids = sorted(set(walk.nodes) | set(bike.nodes))
    idx = {n: i for i, n in enumerate(ids)}
    lat = np.array([walk.nodes[n]["y"] if n in walk.nodes else bike.nodes[n]["y"] for n in ids], dtype="<f4")
    lon = np.array([walk.nodes[n]["x"] if n in walk.nodes else bike.nodes[n]["x"] for n in ids], dtype="<f4")
    atomic_write(OUT / "walk_nodes.bin", np.stack([lat, lon], axis=1).astype("<f4").tobytes())

    def csr(g, undirected):
        adj = [dict() for _ in ids]
        for u, v, d in g.edges(data=True):
            a, b, w = idx[u], idx[v], float(d.get("length", 0.0))
            if b not in adj[a] or w < adj[a][b]:
                adj[a][b] = w
            if undirected and (a not in adj[b] or w < adj[b][a]):
                adj[b][a] = w
        off = np.zeros(len(ids) + 1, dtype="<i4")
        tgt, ln = [], []
        for i, nb in enumerate(adj):
            off[i + 1] = off[i] + len(nb)
            for j, w in nb.items():
                tgt.append(j); ln.append(w)
        return off, np.asarray(tgt, dtype="<i4"), np.asarray(ln, dtype="<f4")

    for name, g, und in (("walk_csr.bin", walk, True), ("bike_csr.bin", bike, False)):
        off, tgt, ln = csr(g, und)
        atomic_write(OUT / name, off.tobytes() + tgt.tobytes() + ln.tobytes())
        print(f"{name}: {len(tgt)} arcs")

    # Street-network transfer footpaths between stops.
    meta = json.loads(TRANSIT.read_text(encoding="utf-8"))
    stops = meta["stops"]
    snap_nodes, snap_d = ox.distance.nearest_nodes(walk, [s["lon"] for s in stops], [s["lat"] for s in stops], return_dist=True)
    ug = walk.to_undirected()
    by_node = {}
    for i, n in enumerate(snap_nodes):
        by_node.setdefault(n, []).append(i)
    foot = []
    MAX_SNAP_M = 300  # stops further than this from the street graph (outside the bbox) get no footpaths
    for i, n in enumerate(snap_nodes):
        if snap_d[i] > MAX_SNAP_M:
            continue
        dist = nx.single_source_dijkstra_path_length(ug, n, cutoff=FOOTPATH_MAX_M, weight="length")
        for m, d in dist.items():
            for j in by_node.get(m, []):
                if j != i and snap_d[j] <= MAX_SNAP_M:
                    total = snap_d[i] + d + snap_d[j]
                    foot.append([i, j, int(round(total / WALK_MS))])
    meta["footpaths_street"] = foot
    meta["footpaths"], added = apply_transfers(foot, meta.get("transfers", []), stops)
    meta["footpath_source"] = (f"OpenStreetMap walk network, <= {FOOTPATH_MAX_M} m, {WALK_MS} m/s; "
                               "max(walk, min_transfer_time) for pairs named in transfers.txt")
    meta["stop_snap"] = [[idx[n], round(float(d), 1)] for n, d in zip(snap_nodes, snap_d)]
    atomic_write(TRANSIT, json.dumps(meta, separators=(",", ":")))
    print(f"footpaths: {len(foot)} street, {len(meta['footpaths'])} after transfers.txt rules "
          f"({added} named pairs added); max stop snap {max(snap_d):.0f} m")

    # Basemap: simplified named streets only, rounded coordinates.
    simple = ox.simplify_graph(walk.copy()) if not walk.graph.get("simplified") else walk
    feats, seen = [], set()
    for u, v, d in simple.edges(data=True):
        hw = d.get("highway")
        hw = hw[0] if isinstance(hw, list) else hw
        if hw not in ("motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified",
                      "living_street", "pedestrian"):
            continue
        key = (min(u, v), max(u, v))
        if key in seen:
            continue
        seen.add(key)
        if "geometry" in d:
            coords = [[round(x, 5), round(y, 5)] for x, y in d["geometry"].coords]
        else:
            coords = [[round(simple.nodes[u]["x"], 5), round(simple.nodes[u]["y"], 5)],
                      [round(simple.nodes[v]["x"], 5), round(simple.nodes[v]["y"], 5)]]
        name = d.get("name")
        name = name[0] if isinstance(name, list) else name
        feats.append({"type": "Feature", "properties": {"k": hw, **({"n": name} if name else {})},
                      "geometry": {"type": "LineString", "coordinates": coords}})
    atomic_write(OUT / "streets.geojson", json.dumps({"type": "FeatureCollection", "features": feats},
                                                     separators=(",", ":")))
    for f in sorted(OUT.iterdir()):
        print(f"  {f.name}: {f.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
