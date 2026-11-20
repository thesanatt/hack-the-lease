// Router tests: R3 (backward/forward consistency), R4 (FIFO), R5 (sort order) from
// docs/SYSTEM_DESIGN.md section 5.1, the two-label fix on a hand-built timetable, per-stop change
// times, plan.breakdown(), and the smoke trips on the real TheRide and U-M timetables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
import { Timetable, RIDE, FOOT } from '../engine/transit.js';
import { rng } from '../engine/rng.js';
import { CONFIG } from '../engine/config.js';

const data = await loadAll(nodeGetter());
const { tt, planner, places } = data;
const P = Object.fromEntries(places.map((p) => [p.id, p]));
for (const id of ['ugli', 'pierpont', 'uh', 'dude', 'btc']) planner.addPoint(id, P[id].lat, P[id].lon);
const H = CONFIG.horizonS;

// A tiny timetable: stops S, B, C, D. Built in memory, connections sorted by (dep, arr, trip).
function tiny(conns, footpaths, change) {
  const stops = ['S', 'B', 'C', 'D', 'E'].map((name) => ({ id: name, name, lat: 0, lon: 0 }));
  const trips = [...new Set(conns.map((c) => c[4]))].map((k) => [0, `T${k}`, null]);
  const meta = { stops, routes: [{ short: 'X', long: 'X', color: '#777777', feed: 'A' }], trips,
    footpaths, change: change ?? stops.map(() => -1), stop_snap: stops.map(() => [0, 0]) };
  const sorted = [...conns].sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
  return new Timetable(meta, { tue: Int32Array.from(sorted.flat()).buffer });
}

test('two labels: a footpath arrival is kept when an earlier ride arrival plus change time is later', () => {
  // ride S->B arrives 100 (ready 160 with the 60 s change); ride S->C arrives 30, walk C->B 100 s (130);
  // trip 2 leaves B at 140. The single-label scan keeps only B=100 by ride and misses trip 2.
  const t = tiny([[0, 1, 10, 100, 0], [0, 2, 10, 30, 1], [1, 3, 140, 200, 2]], [[2, 1, 100]]);
  const f = t.forward('tue', [{ stop: 0, t: 0, tag: 7 }]);
  assert.equal(f.t[3], 200);
  assert.equal(f.t[1], 100);           // egress label at B is the ride arrival
  assert.equal(f.foot[1], 130);        // the foot label survives next to it
  const j = t.legsForward(f, 3);
  assert.deepEqual(j.legs.map((l) => l.type), ['ride', 'transfer', 'ride']);
  assert.equal(j.accessStop, 0); assert.equal(j.accessTag, 7);
  // backward mirror: be at D by 200, latest departure from S is 10 via C and the walk
  const b = t.backward('tue', [{ stop: 3, t: 200, tag: 3 }]);
  assert.equal(b.t[0], 10);
  const jb = t.legsBackward(b, 0);
  assert.deepEqual(jb.legs.map((l) => l.type), ['ride', 'transfer', 'ride']);
  assert.equal(jb.sinkStop, 3);
});

test('two labels: a seed does not hide a later ride arrival at the same stop, and seeds are not in t', () => {
  const t = tiny([[0, 1, 10, 50, 0]], []);
  const f = t.forward('tue', [{ stop: 0, t: 0 }, { stop: 1, t: 5 }]);
  assert.equal(f.t[1], 50);            // seeded at 5, but t reports the ride arrival
  assert.equal(f.kind[1], RIDE);
  assert.equal(f.t[0], Infinity);      // the seed stop itself has no ride
});

test('change time applies only after a ride, and per-stop change from meta.change', () => {
  const conns = [[0, 1, 10, 100, 0], [1, 3, 130, 200, 1]];
  assert.equal(tiny(conns, []).forward('tue', [{ stop: 0, t: 0 }]).t[3], Infinity); // 30 s < 60 s
  const t = tiny(conns, [], [-1, 20, -1, -1, -1]);
  assert.equal(t.forward('tue', [{ stop: 0, t: 0 }]).t[3], 200);                   // 30 s >= 20 s at B
  t.setChangeDefault(0);
  assert.equal(t.change[1], 20); assert.equal(t.change[0], 0);
  // seed at B at 130 boards with no change time
  assert.equal(tiny(conns, []).forward('tue', [{ stop: 1, t: 130 }]).t[3], 200);
});

test('meta.change carries transfers.txt same-stop times; the default comes from cfg', () => {
  const listed = [...tt.changeFeed].map((v, s) => [s, v]).filter(([, v]) => v >= 0);
  assert.ok(listed.length >= 1, 'at least one stop has a feed change time');
  for (const [s, v] of listed) assert.equal(tt.change[s], v);
  const other = [...tt.changeFeed].findIndex((v) => v < 0);
  assert.equal(tt.change[other], CONFIG.changeDefaultS);
  tt.setChangeDefault(180); assert.equal(tt.change[other], 180);
  tt.setChangeDefault(CONFIG.changeDefaultS);
});

test('R5 sort order: departures nondecreasing and every trip scanned in stop order', () => {
  for (const [day, { c, n }] of Object.entries(tt.days)) {
    const lastIdx = new Int32Array(tt.nTrips).fill(-1);
    for (let i = 0; i < n; i++) {
      const o = i * 5;
      if (i > 0) assert.ok(c[o + 2] >= c[o - 5 + 2], `${day}: dep order at ${i}`);
      const tr = c[o + 4], p = lastIdx[tr];
      if (p >= 0) {
        // the previous hop of this trip ends where this one starts, and not after it departs
        assert.equal(c[p * 5 + 1], c[o], `${day}: trip ${tr} hop at ${i} does not continue hop at ${p}`);
        assert.ok(c[p * 5 + 3] <= c[o + 2], `${day}: trip ${tr} arrives after its next departure`);
      }
      lastIdx[tr] = i;
    }
  }
});

test('R3 backward/forward consistency: forward from the latest departure arrives by the deadline, 1 s later does not', () => {
  const r = rng(31);
  let checked = 0, fails = [];
  for (let k = 0; k < 120; k++) {
    const z = r.int(tt.nStops), deadline = 7 * 3600 + r.int(15 * 3600);
    const b = tt.backward('tue', [{ stop: z, t: deadline, tag: z }]);
    const cands = [];
    for (let s = 0; s < tt.nStops; s++) if (s !== z && Number.isFinite(b.t[s])) cands.push(s);
    for (let q = 0; q < Math.min(6, cands.length); q++) {
      const s = cands[r.int(cands.length)], LD = b.t[s];
      // the backward scan may start with a footpath from s, so the forward seeds include them
      const seeds = (t0) => {
        const out = [{ stop: s, t: t0 }];
        for (let e = tt.fpOut.off[s]; e < tt.fpOut.off[s + 1]; e++) out.push({ stop: tt.fpOut.other[e], t: t0 + tt.fpOut.dur[e] });
        return out;
      };
      const ok = tt.forward('tue', seeds(LD)).ride[z];
      const late = tt.forward('tue', seeds(LD + 1)).ride[z];
      checked++;
      if (!(ok <= deadline) || !(late > deadline)) fails.push({ z, s, deadline, LD, ok, late });
    }
  }
  assert.ok(checked > 300, `checked ${checked}`);
  assert.deepEqual(fails.slice(0, 5), []);
});

test('R4 FIFO: later departure never arrives earlier; later deadline never departs earlier', () => {
  const r = rng(44);
  let pairs = 0;
  for (let k = 0; k < 80; k++) {
    const s = r.int(tt.nStops), t1 = 6 * 3600 + r.int(16 * 3600), t2 = t1 + 60 + r.int(1800);
    const a = tt.forward('tue', [{ stop: s, t: t1 }]), b = tt.forward('tue', [{ stop: s, t: t2 }]);
    for (let x = 0; x < tt.nStops; x++) {
      if (a.t[x] <= t1 + H) { pairs++; assert.ok(b.t[x] >= a.t[x], `forward FIFO at ${s}->${x}`); }
    }
    // c only scans departures after t2 - H, so compare where d departs inside that window
    const c = tt.backward('tue', [{ stop: s, t: t2 }]), d = tt.backward('tue', [{ stop: s, t: t1 }]);
    for (let x = 0; x < tt.nStops; x++) {
      if (d.t[x] >= t2 - H) { pairs++; assert.ok(c.t[x] >= d.t[x], `backward FIFO at ${x}->${s}`); }
    }
  }
  assert.ok(pairs > 1000, `pairs ${pairs}`);
});

test('legsForward and legsBackward follow the labels to the exported times', () => {
  const r = rng(5);
  for (let k = 0; k < 60; k++) {
    const s = r.int(tt.nStops), t0 = 7 * 3600 + r.int(12 * 3600);
    const f = tt.forward('tue', [{ stop: s, t: t0, tag: s }]);
    const b = tt.backward('tue', [{ stop: s, t: t0, tag: s }]);
    for (let x = 0; x < tt.nStops; x += 37) {
      if (Number.isFinite(f.t[x])) {
        const j = tt.legsForward(f, x);
        assert.ok(j && j.accessStop === s && j.legs.length > 0);
        const last = j.legs[j.legs.length - 1];
        assert.equal(last.type === 'ride' ? last.arr : f.foot[x], f.t[x]);
        assert.ok(j.legs[0].type === 'ride' && j.legs[0].dep >= t0);
      }
      if (Number.isFinite(b.t[x]) && x !== s) {
        const j = tt.legsBackward(b, x);
        assert.ok(j && j.sinkStop === s && j.legs.length > 0);
        const lastRide = j.legs.filter((l) => l.type === 'ride').pop();
        assert.ok(lastRide.arr <= t0);
        assert.equal(j.legs[0].type === 'ride' ? j.legs[0].dep : b.t[x], b.t[x]);
      }
    }
  }
});

test('breakdown(): parts add up to the trip, and forward from the arrive-by departure arrives in time', () => {
  const homes = ['ugli', 'dude', 'uh', 'btc'];
  const ab = planner.arriveBy('tue', 'pierpont', 9 * 3600, homes);
  let n = 0;
  for (const h of homes) {
    const tr = ab.get(h).transit;
    if (!tr) continue;
    n++;
    const bd = planner.breakdown(ab, h);
    assert.equal(bd.walkSec + bd.waitSec + bd.rideSec + bd.slackSec, tr.sec, h);
    assert.ok(bd.transferSec <= bd.walkSec && bd.slackSec >= 0 && bd.rideSec > 0);
    for (const [a, b] of [...bd.walks, ...bd.waits]) assert.ok(b > a);
    assert.deepEqual(planner.breakdown(ab.get(h), h), bd);   // per-home entry works too
    const fwd = planner.legs('tue', h, 'pierpont', tr.depart);
    assert.ok(fwd && fwd.arrive <= 9 * 3600 + 2, `${h}: forward arrives ${fwd && fwd.arrive}`); // 2 s rounding
  }
  const la = planner.leaveAt('tue', 'pierpont', 17 * 3600, homes);
  for (const h of homes) {
    const tr = la.get(h).transit;
    if (!tr) continue;
    n++;
    const bd = planner.breakdown(la, h);
    assert.equal(bd.walkSec + bd.waitSec + bd.rideSec, tr.sec, h);
    assert.equal(bd.slackSec, 0);
    assert.equal(planner.legsFor(la, h).arrive, tr.arrive);
  }
  assert.ok(n >= 4);
  const w = planner.breakdown(ab, 'ugli', 'walk');
  assert.equal(w.walkSec, ab.get('ugli').walk.sec);
});

test('smoke trips on the real timetable', () => {
  const trips = [['tue', 'ugli', 'pierpont', 10 * 3600], ['tue', 'dude', 'ugli', 23.5 * 3600],
    ['tue', 'ugli', 'uh', 6 * 3600], ['sun', 'pierpont', 'btc', 9 * 3600]];
  for (const [day, a, b, t] of trips) {
    const j = planner.legs(day, a, b, t);
    assert.ok(j, `${day} ${a}->${b}`);
    assert.ok(j.arrive > t && j.arrive - t < 60 * 60, `${a}->${b} takes ${(j.arrive - t) / 60} min`);
    assert.ok(j.legs.some((l) => l.type === 'ride'));
    assert.ok(j.arrive - t <= planner.walkSec(a, b), 'transit beats walking on these trips');
  }
});

test('every reconstructed journey is feasible: change time after a ride, footpath time after a walk', () => {
  const r = rng(77);
  let journeys = 0, ridesChecked = 0;
  for (let k = 0; k < 150; k++) {
    const s = r.int(tt.nStops), t0 = 6 * 3600 + r.int(16 * 3600);
    const f = tt.forward('tue', [{ stop: s, t: t0 }]);
    for (let x = 0; x < tt.nStops; x += 11) {
      if (!Number.isFinite(f.t[x])) continue;
      const j = tt.legsForward(f, x);
      assert.ok(j, `no legs for ${s}->${x}`);
      let clock = t0, at = s, prev = 'seed';
      for (const l of j.legs) {
        if (l.type === 'ride') {
          const a = tt.conn('tue', l.enter), b = tt.conn('tue', l.exit);
          assert.equal(a.trip, b.trip); assert.ok(l.enter <= l.exit);
          assert.equal(l.from, at);
          const need = clock + (prev === 'ride' ? tt.change[at] : 0);
          assert.ok(l.dep >= need, `boarding at ${at} at ${l.dep} before ${need}`);
          clock = l.arr; at = l.to; prev = 'ride'; ridesChecked++;
        } else {
          assert.equal(prev, 'ride'); assert.equal(l.from, at);
          let ok = false;
          for (let e = tt.fpOut.off[at]; e < tt.fpOut.off[at + 1]; e++) if (tt.fpOut.other[e] === l.to && tt.fpOut.dur[e] === l.dur) ok = true;
          assert.ok(ok, 'transfer is a listed footpath');
          clock += l.dur; at = l.to; prev = 'foot';
        }
      }
      assert.equal(at, x); assert.equal(clock, f.t[x]);
      journeys++;
    }
  }
  assert.ok(journeys > 1000 && ridesChecked > journeys, `${journeys} journeys`);
});
