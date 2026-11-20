// Router smoke run: four real trips with their legs and time breakdown, plus scan timings.
//   node scripts/smoke.mjs         trips and timings
//   node scripts/smoke.mjs --r1    also test R1 (docs/SYSTEM_DESIGN.md 5.1): the old single-label scan
//                                  against the two-label scan, every stop as a source x 12 times on Tuesday,
//                                  written to web/public/data/evidence/router_labels.json
import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
import { CONFIG } from '../engine/config.js';

const t0 = performance.now();
const { planner, places, tt, meta } = await loadAll(nodeGetter());
const t1 = performance.now();
const P = Object.fromEntries(places.map((p) => [p.id, p]));
for (const id of ['ugli', 'pierpont', 'uh', 'dude', 'btc']) planner.addPoint(id, P[id].lat, P[id].lon);
const t2 = performance.now();
const hhmm = (s) => `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
const min = (s) => (s / 60).toFixed(1);
function show(day, from, to, t) {
  const j = planner.legs(day, from, to, t);
  console.log(`\n${day} ${from} -> ${to} leave ${hhmm(t)}: arrive ${j ? hhmm(j.arrive) : 'none'} (${j ? Math.round((j.arrive - t) / 60) : '-'} min)`);
  if (j) for (const l of j.legs) console.log(`   ${l.type.padEnd(8)} ${hhmm(l.dep)}-${hhmm(l.arr)} ${l.route ? l.route + ' ' + l.headsign : ''} ${l.fromName ?? ''} -> ${l.toName ?? ''}`);
  console.log(`   walk only: ${Math.round(planner.walkSec(from, to) / 60)} min, bike: ${Math.round(planner.bikeSec(from, to) / 60)} min`);
  const la = planner.leaveAt(day, from, t, [to]);
  const b = planner.breakdown(la, to);
  if (b) console.log(`   breakdown (leaveAt, from the scan snapshot): walk ${min(b.walkSec)} (transfer ${min(b.transferSec)}), wait ${min(b.waitSec)}, ride ${min(b.rideSec)} min`);
}
show('tue', 'ugli', 'pierpont', 10 * 3600);
show('tue', 'dude', 'ugli', 23.5 * 3600);
show('tue', 'ugli', 'uh', 6 * 3600);
show('sun', 'pierpont', 'btc', 9 * 3600);
{
  const ab = planner.arriveBy('tue', 'pierpont', 9 * 3600, ['ugli']);
  const j = planner.legsFor(ab, 'ugli'), b = planner.breakdown(ab, 'ugli');
  console.log(`\ntue ugli -> pierpont arrive by 09:00: leave ${hhmm(j.depart)}, arrive ${hhmm(j.arrive)}, slack ${min(b.slackSec)} min`);
  for (const l of j.legs) console.log(`   ${l.type.padEnd(8)} ${hhmm(l.dep)}-${hhmm(l.arr)} ${l.route ? l.route + ' ' + l.headsign : ''} ${l.fromName ?? ''} -> ${l.toName ?? ''}`);
}

function timeIt(fn, reps) {
  for (let i = 0; i < 20; i++) fn(i);
  const a = performance.now();
  for (let i = 0; i < reps; i++) fn(i);
  return (performance.now() - a) / reps;
}
const fwd = timeIt((i) => planner.leaveAt('tue', 'ugli', 8 * 3600 + (i % 60) * 600, ['pierpont', 'uh', 'dude']), 300);
const bwd = timeIt((i) => planner.arriveBy('tue', 'ugli', 9 * 3600 + (i % 60) * 600, ['pierpont', 'uh', 'dude']), 300);
console.log(`\nload ${(t1 - t0).toFixed(0)} ms, 5 points ${(t2 - t1).toFixed(0)} ms, leaveAt (forward scan + 3 homes) ${fwd.toFixed(3)} ms, arriveBy (backward) ${bwd.toFixed(3)} ms`);

if (process.argv.includes('--r1')) r1();

// The single-label scan this module used before Thu Nov 19 (kept here only for R1): one label per stop
// mixing vehicle and foot arrivals, a flat change buffer added only when the best label is a ride, and
// seeds stored in the same label.
function legacyForward(day, sources, buf, horizon = 3 * 3600) {
  const { c, n } = tt.days[day];
  const T = new Float64Array(tt.nStops).fill(Infinity), K = new Uint8Array(tt.nStops);
  const trip = new Int32Array(tt.nTrips).fill(-1), fo = tt.fpOut;
  let t0 = Infinity;
  for (const s of sources) { if (s.t < T[s.stop]) { T[s.stop] = s.t; K[s.stop] = 1; } t0 = Math.min(t0, s.t); }
  const tEnd = t0 + horizon;
  for (let i = tt.firstDepAtOrAfter(day, t0); i < n; i++) {
    const o = i * 5, dep = c[o + 2];
    if (dep > tEnd) break;
    const tr = c[o + 4], ds = c[o];
    if (trip[tr] < 0) {
      if (T[ds] + (K[ds] === 2 ? buf : 0) > dep) continue;
      trip[tr] = i;
    }
    const as = c[o + 1], arr = c[o + 3];
    if (arr < T[as]) {
      T[as] = arr; K[as] = 2;
      for (let e = fo.off[as]; e < fo.off[as + 1]; e++) {
        const to = fo.other[e], ta = arr + fo.dur[e];
        if (ta < T[to]) { T[to] = ta; K[to] = 3; }
      }
    }
  }
  return T;
}

function r1() {
  const times = Array.from({ length: 12 }, (_, k) => 6 * 3600 + k * 5400); // 06:00 to 22:30 every 90 min
  const runs = [
    { name: 'labels only (flat 60 s change at every stop in both scans)', feedChange: false },
    { name: 'labels plus transfers.txt change times', feedChange: true },
    { name: 'labels only, footpaths floored at 60 s in both scans (sensitivity)', feedChange: false, floorFoot: true },
  ];
  const durOut = tt.fpOut.dur.slice(), durIn = tt.fpIn.dur.slice();
  const saved = tt.changeFeed.slice();
  const started = performance.now();
  let tLegacy = 0, tNew = 0, scans = 0;
  for (const run of runs) {
    if (!run.feedChange) tt.changeFeed.fill(-1);
    if (run.floorFoot) for (const g of [tt.fpOut, tt.fpIn]) for (let e = 0; e < g.dur.length; e++) g.dur[e] = Math.max(g.dur[e], CONFIG.changeDefaultS);
    tt.setChangeDefault(CONFIG.changeDefaultS);
    let differ = 0, earlier = 0, later = 0, reachedOld = 0, reachedNew = 0, compared = 0;
    const stopsAffected = new Set(), queriesAffected = new Set();
    const gains = [];
    for (let s = 0; s < tt.nStops; s++) {
      for (const t of times) {
        const src = [{ stop: s, t }];
        let a = performance.now();
        const old = legacyForward('tue', src, CONFIG.changeDefaultS);
        tLegacy += performance.now() - a; a = performance.now();
        const snap = tt.forward('tue', src);
        tNew += performance.now() - a; scans++;
        for (let x = 0; x < tt.nStops; x++) {
          if (x === s) continue; // the source itself: old reports the seed, new reports rides only
          const o = old[x], v = snap.t[x];
          compared++;
          if (o < Infinity) reachedOld++;
          if (v < Infinity) reachedNew++;
          if (o !== v) {
            differ++; stopsAffected.add(x); queriesAffected.add(s * 100 + times.indexOf(t));
            if (v < o) { earlier++; if (o < Infinity) gains.push(o - v); } else later++;
          }
        }
      }
    }
    gains.sort((a, b) => a - b);
    run.result = {
      comparedStopArrivals: compared, differ, newEarlier: earlier, newLater: later,
      newlyReachable: earlier - gains.length, reachedOld, reachedNew,
      stopsWithAnyDifference: stopsAffected.size, queriesWithAnyDifference: queriesAffected.size,
      queries: tt.nStops * times.length,
      gainSec: gains.length ? { median: gains[gains.length >> 1], p90: gains[Math.floor(gains.length * 0.9)], max: gains[gains.length - 1] } : null,
    };
    tt.changeFeed.set(saved); tt.fpOut.dur.set(durOut); tt.fpIn.dur.set(durIn);
    tt.setChangeDefault(CONFIG.changeDefaultS);
    console.log(`R1 ${run.name}:`, JSON.stringify(run.result));
  }
  const out = {
    test: 'R1 old single-label scan vs two-label scan',
    ranAt: new Date().toISOString(),
    day: 'tue', date: meta.days.tue.date, sources: tt.nStops, times: times.map(hhmm),
    horizonS: CONFIG.horizonS, changeDefaultS: CONFIG.changeDefaultS,
    feedChangeStops: [...saved].filter((v) => v >= 0).length,
    footpaths: meta.footpaths.length, footpathSource: meta.footpath_source,
    footpathsUnder60s: meta.footpaths.filter((f) => f[2] < 60).length,
    pass: runs.every((r) => r.result.newLater === 0),
    passRule: 'the two-label scan is never later than the single-label scan at any stop (source stop excluded)',
    runs: runs.map((r) => ({ name: r.name, ...r.result })),
    timingMs: { legacyScanMean: +(tLegacy / scans).toFixed(4), twoLabelScanMean: +(tNew / scans).toFixed(4),
      totalWall: Math.round(performance.now() - started) },
    note: 'Times are seconds. newEarlier counts stop arrivals the two-label scan improves, including stops the old scan never reached (newlyReachable).',
  };
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'data', 'evidence');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'router_labels.json');
  writeFileSync(file + '.tmp', JSON.stringify(out, null, 2));
  renameSync(file + '.tmp', file);
  console.log(`wrote ${file} (${out.timingMs.totalWall} ms; legacy ${out.timingMs.legacyScanMean} ms/scan, two-label ${out.timingMs.twoLabelScanMean} ms/scan)`);
}
