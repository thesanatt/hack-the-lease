// Quorum engine side of the router validation (docs/VALIDATION.md, tests R2 and R6).
//
//   node scripts/our_times.mjs <queries.json> <out.json>
//
// queries.json: { day: "tue", horizon: 172800, queries: [{ src, t, dst: [stop, ...] }] }
//   src and dst are stop indices into meta.stops; t is seconds after midnight.
//   Optional: "window": { start, end, step, dsts } runs one forward scan per step for R6.
// out.json: { engine, results: [{ arr: [sec | null per dst], legs: [legs | null per dst] }], timing }
//
// It loads the timetable exactly as engine/load.js does (meta.json plus the conn_<day>.bin files) and
// calls Timetable.forward with a single seed at the source stop. Nothing here re-implements routing.

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Timetable } from '../engine/transit.js';
import { nodeGetter } from '../engine/node-load.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/our_times.mjs <queries.json> <out.json>');
  process.exit(2);
}

const get = nodeGetter();
const tLoad0 = performance.now();
// Read meta.json bytes once so the hash names exactly what was routed on.
const metaBytes = await readFile(path.join(HERE, '..', 'web', 'public', 'data', 'transit', 'meta.json'));
const meta = JSON.parse(metaBytes.toString('utf8'));
const files = [...new Set(Object.values(meta.days).map((d) => d.file))];
const bufs = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await get(`transit/${f}`)])));
const connBuffers = Object.fromEntries(Object.entries(meta.days).map(([day, d]) => [day, bufs[d.file]]));
const tt = new Timetable(meta, connBuffers);
const tLoad = performance.now() - tLoad0;

const src = await readFile(path.join(HERE, '..', 'engine', 'transit.js'), 'utf8');
const q = JSON.parse(await readFile(inPath, 'utf8'));
const day = q.day ?? 'tue';
const horizon = q.horizon ?? 48 * 3600;

function compactLegs(snap, stop) {
  const r = tt.legsForward(snap, stop);
  if (!r) return null;
  return r.legs.map((l) => (l.type === 'ride'
    ? { type: 'ride', route: `${l.feed}:${l.route}`, from: l.from, to: l.to, dep: l.dep, arr: l.arr, trip: l.trip }
    : { type: l.type, from: l.from, to: l.to, dur: l.dur }));
}

// Probe one scan to learn the snapshot shape (one label or two labels per stop).
const probe = tt.forward(day, [{ stop: 0, t: 8 * 3600, tag: 0 }], horizon);
const engine = {
  transit_js_sha1: createHash('sha1').update(src).digest('hex').slice(0, 12),
  labels: probe.ride && probe.foot ? 'two (ride, foot)' : 'one (mixed)',
  change: tt.change ? 'per-stop Int32Array (meta.change)' : `scalar transferBuffer ${tt.transferBuffer} s`,
  meta_has_change: Array.isArray(meta.change) || (meta.change && typeof meta.change === 'object'),
  horizon,
  day,
  conn_file: meta.days[day].file,
  meta_sha1: createHash('sha1').update(metaBytes).digest('hex').slice(0, 12),
  conn_sha1: createHash('sha1').update(new Uint8Array(connBuffers[day])).digest('hex').slice(0, 12),
};

const results = [];
const tRun0 = performance.now();
let scans = 0;
for (const item of q.queries ?? []) {
  const snap = tt.forward(day, [{ stop: item.src, t: item.t, tag: 0 }], horizon);
  scans++;
  const arr = [], legs = [];
  for (const d of item.dst) {
    const v = snap.t[d];
    const ok = Number.isFinite(v) && d !== item.src;
    arr.push(ok ? v : null);
    legs.push(ok && q.withLegs !== false ? compactLegs(snap, d) : null);
  }
  results.push({ arr, legs });
}
const tRun = performance.now() - tRun0;

// R6: door to door, one planner.leaveAt per origin per departure minute (a forward scan from every
// access stop of the origin, read at every destination's access stops). Returns seconds per
// [origin][minute][destination] for transit (null when no ride reaches it) and walk-only seconds.
let window = null;
if (q.door) {
  const w = q.door, t0 = performance.now();
  const { Streets } = await import('../engine/graph.js');
  const { Planner } = await import('../engine/plan.js');
  const [nodes, walk, bike] = await Promise.all([
    get('streets/walk_nodes.bin'), get('streets/walk_csr.bin'), get('streets/bike_csr.bin')]);
  const planner = new Planner(new Streets(nodes, walk, bike), tt);
  const tPts = performance.now();
  for (const p of [...w.origins, ...w.dests]) planner.addPoint(p.id, p.lat, p.lon);
  const ptsMs = performance.now() - tPts;
  const destIds = w.dests.map((d) => d.id);
  const transit = [], walkSec = [], access = {};
  for (const p of [...w.origins, ...w.dests]) access[p.id] = planner.points.get(p.id).access.length;
  const tScan = performance.now();
  for (const o of w.origins) {
    const perMinute = [];
    let walkRow = null;
    for (let t = w.start; t < w.end; t += w.step) {
      const res = planner.leaveAt(day, o.id, t, destIds);
      scans++;
      perMinute.push(destIds.map((d) => (res.get(d).transit ? res.get(d).transit.sec : null)));
      if (!walkRow) walkRow = destIds.map((d) => (Number.isFinite(res.get(d).walk.sec) ? res.get(d).walk.sec : null));
    }
    transit.push(perMinute);
    walkSec.push(walkRow);
  }
  window = { transit, walk: walkSec, access, cfg: { maxAccessM: planner.o.maxAccessM, walkMs: planner.o.walkMs,
    horizonS: planner.o.horizonS }, points_ms: +ptsMs.toFixed(1),
    scan_ms_per_leaveAt: +((performance.now() - tScan) / Math.max(1, scans)).toFixed(3),
    ms: performance.now() - t0 };
}

await writeFile(outPath, JSON.stringify({
  engine, results, window,
  timing: { load_ms: +tLoad.toFixed(1), scans, query_ms: +tRun.toFixed(1),
    ms_per_scan: scans ? +((tRun + (window ? window.ms : 0)) / scans).toFixed(3) : null },
}));
const nq = (q.queries ?? []).length;
console.log(`our_times: ${scans} scans, engine labels ${engine.labels}, ${engine.change}` +
  (nq ? `, ${(tRun / nq).toFixed(3)} ms per stop scan` : '') +
  (window ? `, ${window.scan_ms_per_leaveAt} ms per door-to-door leaveAt` : ''));
