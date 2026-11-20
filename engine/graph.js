// Street graph: nearest-node lookup and Dijkstra on a CSR adjacency.
// Node ids are shared by the walk and bike graphs (see pipeline/build_walk.py).

export class Streets {
  constructor(nodesBuf, walkBuf, bikeBuf) {
    const nodes = new Float32Array(nodesBuf);
    this.n = nodes.length / 2;
    this.lat = new Float64Array(this.n);
    this.lon = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.lat[i] = nodes[2 * i];
      this.lon[i] = nodes[2 * i + 1];
    }
    this.walk = Streets.csr(walkBuf, this.n);
    this.bike = bikeBuf ? Streets.csr(bikeBuf, this.n) : null;
    this.grids = { walk: this.buildGrid(this.walk) };
    if (this.bike) this.grids.bike = this.buildGrid(this.bike);
  }

  static csr(buf, n) {
    const off = new Int32Array(buf, 0, n + 1);
    const m = off[n];
    const tgt = new Int32Array(buf, 4 * (n + 1), m);
    const len = new Float32Array(buf, 4 * (n + 1) + 4 * m, m);
    return { off, tgt, len };
  }

  // Uniform grid, about 150 m cells, over nodes that have at least one arc in graph g.
  buildGrid(g) {
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    const has = (i) => g.off[i + 1] > g.off[i];
    for (let i = 0; i < this.n; i++) {
      if (!has(i)) continue;
      minLat = Math.min(minLat, this.lat[i]); maxLat = Math.max(maxLat, this.lat[i]);
      minLon = Math.min(minLon, this.lon[i]); maxLon = Math.max(maxLon, this.lon[i]);
    }
    const cell = 0.0015;
    const cols = Math.ceil((maxLon - minLon) / cell) + 1;
    const buckets = new Map();
    for (let i = 0; i < this.n; i++) {
      if (!has(i)) continue;
      const k = Math.floor((this.lat[i] - minLat) / cell) * cols + Math.floor((this.lon[i] - minLon) / cell);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    }
    return { cell, cols, minLat, minLon, buckets };
  }

  // Nearest node of the walk (or bike) graph and its straight-line distance in meters.
  nearest(lat, lon, mode = 'walk') {
    const G = this.grids[mode];
    const r0 = Math.floor((lat - G.minLat) / G.cell);
    const c0 = Math.floor((lon - G.minLon) / G.cell);
    let best = -1, bestD = Infinity;
    for (let ring = 0; ring < 30 && (best < 0 || ring < 2); ring++) {
      for (let r = r0 - ring; r <= r0 + ring; r++) {
        for (let c = c0 - ring; c <= c0 + ring; c++) {
          if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring) continue;
          const b = G.buckets.get(r * G.cols + c);
          if (!b) continue;
          for (const i of b) {
            const d = haversine(lat, lon, this.lat[i], this.lon[i]);
            if (d < bestD) { bestD = d; best = i; }
          }
        }
      }
    }
    return { node: best, dist: bestD };
  }

  // Single-source Dijkstra. Returns Float64Array of meters (Infinity if unreached) and
  // a parent array for path reconstruction. maxDist prunes the search.
  dijkstra(source, mode = 'walk', maxDist = Infinity) {
    const g = mode === 'bike' ? this.bike : this.walk;
    const dist = new Float64Array(this.n).fill(Infinity);
    const parent = new Int32Array(this.n).fill(-1);
    const heap = new MinHeap(4096);
    dist[source] = 0;
    heap.push(0, source);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      if (d > maxDist) break;
      for (let e = g.off[u]; e < g.off[u + 1]; e++) {
        const v = g.tgt[e];
        const nd = d + g.len[e];
        if (nd < dist[v]) { dist[v] = nd; parent[v] = u; heap.push(nd, v); }
      }
    }
    return { dist, parent };
  }

  path(parent, target) {
    const out = [];
    for (let v = target; v >= 0; v = parent[v]) out.push([this.lon[v], this.lat[v]]);
    return out.reverse();
  }
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toR = Math.PI / 180;
  const dp = (lat2 - lat1) * toR, dl = (lon2 - lon1) * toR;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.size = 0; }
  push(key, val) {
    if (this.size === this.k.length) {
      const k = new Float64Array(this.k.length * 2); k.set(this.k); this.k = k;
      const v = new Int32Array(this.v.length * 2); v.set(this.v); this.v = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const topK = this.k[0], topV = this.v[0];
    const lastK = this.k[--this.size], lastV = this.v[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lastK) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = lastK; this.v[i] = lastV;
    return [topK, topV];
  }
}
