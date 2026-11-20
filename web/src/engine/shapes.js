// Trip geometry for the map: bus legs along the real GTFS shapes, walks along the OSM street graph,
// and a time-indexed track for the "Play this trip" dot. Pure functions plus one cached file load.
//
//   loadShapes()                    -> Promise<{ geojson, byKey: Map shapeKey -> [[lon,lat],...] }> (one fetch per page)
//   shapesNow()                     the loaded index, or null while it is still loading
//   sliceShape(line, from, to)      the part of a shape polyline between the vertices nearest two stops, in order, or null
//   rideCoords(index, key, from, to) { coords, onShape } with a straight line only when the shape is missing or far off
//   resolveRide(path, index)        a ride path re-sliced once the shapes have loaded (returns the same object when nothing changes)
//   streetWalk(planner, ...)        street coordinates for point to stop, stop to point and stop to stop walks
//   buildTrack(paths)               { start, end, legs } for paths that carry dep and arr (seconds after midnight)
//   positionAt(track, t)            { lon, lat, color, label, leg } at time t
//   clockText(s)                    "1:05 PM" (rounded like views/me/routine.js clock, so the dot and the leg list agree)

const SHAPES_URL = './data/transit/shapes.geojson';
const MAX_SNAP_M = 250; // a stop further than this from its trip's shape is drawn straight

let shapesPromise = null;
let shapesIndex = null;

export function loadShapes() {
  if (!shapesPromise) {
    shapesPromise = fetch(SHAPES_URL)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((geojson) => {
        const byKey = new Map();
        for (const f of geojson?.features || []) {
          const k = f.properties?.shape;
          if (k && f.geometry?.type === 'LineString') byKey.set(k, f.geometry.coordinates);
        }
        shapesIndex = { geojson, byKey };
        return shapesIndex;
      });
  }
  return shapesPromise;
}

export const shapesNow = () => shapesIndex;

// Meters between two [lon, lat] points (equirectangular; fine at city scale).
export function meters(a, b) {
  const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  const dx = (b[0] - a[0]) * k * 111320, dy = (b[1] - a[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

// The stretch of `line` between the vertex nearest `from` and the vertex nearest `to` that comes after it.
// Minimizes the summed snap distance over ordered pairs (i <= j); on ties the later boarding vertex wins,
// so a loop route that passes the boarding stop twice rides the shorter stretch.
export function sliceShape(line, from, to, maxSnapM = MAX_SNAP_M) {
  if (!line || line.length < 2 || !from || !to) return null;
  const n = line.length;
  let bestI = 0, bestD = Infinity; // running best boarding vertex for i <= j
  let score = Infinity, si = -1, sj = -1;
  for (let j = 0; j < n; j++) {
    const db = meters(line[j], from);
    if (db <= bestD) { bestD = db; bestI = j; }
    const s = bestD + meters(line[j], to);
    if (s < score) { score = s; si = bestI; sj = j; }
  }
  if (si < 0 || meters(line[si], from) > maxSnapM || meters(line[sj], to) > maxSnapM) return null;
  if (sj - si < 1) return null;
  return [from, ...line.slice(si, sj + 1), to];
}

export function rideCoords(index, key, from, to) {
  const line = key && index?.byKey ? index.byKey.get(key) : null;
  const cut = line ? sliceShape(line, from, to) : null;
  if (cut) return { coords: cut, onShape: true };
  return { coords: [from, to].filter(Boolean), onShape: false };
}

export function resolveRide(path, index) {
  if (!path?.shape || path.onShape || !index || !path.fromLL || !path.toLL) return path;
  const r = rideCoords(index, path.shape, path.fromLL, path.toLL);
  return r.onShape ? { ...path, coords: r.coords, onShape: true } : path;
}

// Street geometry for one walk. Uses each point's own walk tree (computed when the point was added);
// stop to stop transfers run one short street search, cached per pair.
const transferCache = new Map();
export function streetWalk(planner, { fromPoint, toPoint, fromStop, toStop }, stops) {
  const S = planner?.S;
  if (!S) return null;
  const ll = (p) => [p.lon, p.lat];
  const stopLL = (i) => (stops?.[i] ? [stops[i].lon, stops[i].lat] : null);
  const tree = (p, node) => (p && Number.isFinite(p.walk?.[node]) ? S.path(p.walkParent, node) : null);
  if (fromPoint != null && toStop != null) {
    const p = planner.points.get(fromPoint), sLL = stopLL(toStop);
    const c = p && tree(p, planner.stopNode[toStop]);
    return c ? [ll(p), ...c, sLL].filter(Boolean) : null;
  }
  if (fromStop != null && toPoint != null) {
    const p = planner.points.get(toPoint), sLL = stopLL(fromStop);
    const c = p && tree(p, planner.stopNode[fromStop]);
    return c ? [sLL, ...c.reverse(), ll(p)].filter(Boolean) : null;
  }
  if (fromStop != null && toStop != null) {
    const key = `${fromStop}>${toStop}`;
    if (transferCache.has(key)) return transferCache.get(key);
    let out = null;
    try {
      const a = planner.stopNode[fromStop], b = planner.stopNode[toStop];
      const { dist, parent } = S.dijkstra(a, 'walk', 1500);
      if (Number.isFinite(dist[b])) out = [stopLL(fromStop), ...S.path(parent, b), stopLL(toStop)].filter(Boolean);
    } catch { out = null; }
    transferCache.set(key, out);
    return out;
  }
  return null;
}

// A track for the moving dot: every path with finite dep and arr, in time order, with cumulative lengths.
export function buildTrack(paths) {
  const legs = [];
  for (const p of paths || []) {
    if (!Number.isFinite(p?.dep) || !Number.isFinite(p?.arr) || !p.coords?.length) continue;
    const cum = [0];
    for (let i = 1; i < p.coords.length; i++) cum.push(cum[i - 1] + meters(p.coords[i - 1], p.coords[i]));
    legs.push({ coords: p.coords, cum, len: cum[cum.length - 1], dep: p.dep, arr: Math.max(p.arr, p.dep),
      color: p.color || '#1c1a16', label: p.label || '' });
  }
  if (!legs.length) return null;
  legs.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  const start = legs[0].dep, end = Math.max(...legs.map((l) => l.arr));
  return end > start ? { start, end, legs } : null;
}

function along(leg, f) {
  const c = leg.coords;
  if (c.length === 1 || leg.len <= 0) return c[f < 0.5 ? 0 : c.length - 1];
  const d = Math.min(Math.max(f, 0), 1) * leg.len;
  let lo = 0, hi = leg.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (leg.cum[mid] <= d) lo = mid; else hi = mid; }
  const seg = leg.cum[hi] - leg.cum[lo], u = seg > 0 ? (d - leg.cum[lo]) / seg : 0;
  return [c[lo][0] + (c[hi][0] - c[lo][0]) * u, c[lo][1] + (c[hi][1] - c[lo][1]) * u];
}

export function positionAt(track, t) {
  if (!track) return null;
  const L = track.legs;
  // the leg running at t (at a hand-off the leg that starts wins); a moving leg wins over a wait that overlaps it
  let leg = null, idx = -1;
  for (let i = 0; i < L.length; i++) {
    if (t >= L[i].dep && t < L[i].arr && (!leg || L[i].coords.length > leg.coords.length)) { leg = L[i]; idx = i; }
  }
  if (!leg && t >= track.end) { idx = L.length - 1; leg = L[idx]; }
  if (!leg) {
    // in a gap: hold at the end of the last leg that finished
    for (let i = L.length - 1; i >= 0; i--) if (L[i].arr <= t) { leg = L[i]; idx = i; break; }
    if (!leg) { leg = L[0]; idx = 0; }
    const at = t < leg.dep ? leg.coords[0] : leg.coords[leg.coords.length - 1];
    return { lon: at[0], lat: at[1], color: leg.color, label: leg.label, leg: idx };
  }
  const f = leg.arr > leg.dep ? (t - leg.dep) / (leg.arr - leg.dep) : 1;
  const [lon, lat] = along(leg, f);
  return { lon, lat, color: leg.color, label: leg.label, leg: idx };
}

export const clockText = (s) => {
  if (s == null || !Number.isFinite(s)) return '';
  const t = Math.round(s / 60), h24 = Math.floor(t / 60) % 24, m = t % 60;
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};
