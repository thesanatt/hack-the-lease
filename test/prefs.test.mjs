import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, withOverrides } from '../engine/config.js';
import { PARAMS, priorFor, utility } from '../engine/model.js';
import {
  createPosterior, update, nextPair, summary, draws, shouldStop, recoveryTest, buildCandidates,
  syntheticWorld, posteriorMean, pairMoments, pBestHomes, BALD_SUBSAMPLE,
} from '../engine/prefs.js';

const world = syntheticWorld(3);
const homes = world.homes.map((h) => ({ id: h.id, options: h.s0 }));
const travel = (h, d = 0, s = 0) => ({ hoursPerMonth: h, darkHoursPerMonth: d, strandedPerMonth: s });
const room = { sqft: 150, bath: 'shared', light: 1 };

test('createPosterior is deterministic and matches the prior medians', () => {
  const a = createPosterior({ seed: 3 });
  const b = createPosterior({ seed: 3 });
  assert.equal(a.n, CONFIG.particles);
  assert.deepEqual(Array.from(a.th.slice(0, 60)), Array.from(b.th.slice(0, 60)));
  const s = summary(a);
  const pr = priorFor();
  for (const k of PARAMS) {
    assert.ok(Math.abs(Math.log(s[k].median / pr[k].median)) < 0.1, `${k} median ${s[k].median}`);
    assert.ok(Math.abs(s[k].priorRatio - 1) < 0.1, `${k} priorRatio ${s[k].priorRatio}`);
    assert.equal(s[k].mostlyPrior, true);
    assert.ok(s[k].lo < s[k].median && s[k].median < s[k].hi);
  }
});

test('wage rule shifts the vTime prior', () => {
  const post = createPosterior({ seed: 1, prior: priorFor({ wage: 40 }) });
  const s = summary(post);
  assert.ok(Math.abs(Math.log(s.vTime.median / 20)) < 0.1, `vTime median ${s.vTime.median}`);
});

test('a pick moves vTime the right way; skip records nothing', () => {
  // A: $100 more rent, 10 fewer travel hours per month. Choosing A says vTime > $10/h.
  const A = { id: 'a', rent: 900, travel: travel(5), room };
  const B = { id: 'b', rent: 800, travel: travel(15), room };
  const post = createPosterior({ seed: 2 });
  const before = summary(post).vTime.median;
  const w0 = Float64Array.from(post.w);
  update(post, A, B, 'skip');
  assert.deepEqual(Array.from(post.w), Array.from(w0));
  assert.equal(post.nPicks, 0);
  update(post, A, B, 'A');
  const upA = summary(post).vTime.median;
  assert.ok(upA > before, `after A: ${upA} vs ${before}`);
  const post2 = createPosterior({ seed: 2 });
  update(post2, A, B, 'B');
  assert.ok(summary(post2).vTime.median < before);
  assert.throws(() => update(post2, A, B, 'C'));
});

test('weights stay normalized, ESS triggers resample plus jitter', () => {
  const post = createPosterior({ seed: 4, n: 2000 });
  const A = { id: 'a', rent: 1000, travel: travel(2), room };
  const B = { id: 'b', rent: 700, travel: travel(30), room };
  let resampled = 0;
  for (let i = 0; i < 6; i++) { update(post, A, B, 'B'); if (post.last.resampled) resampled++; }
  const sum = post.w.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(resampled >= 1, 'expected at least one resample');
  assert.ok(post.ess >= CONFIG.essFrac * post.n);
  for (const v of post.th) assert.ok(Number.isFinite(v) && v > 0);
  // after jitter the particles are not exact copies
  const s = new Set(Array.from(post.th.slice(0, 200)));
  assert.ok(s.size > 190);
});

test('nextPair returns BALD fields and prefers informative pairs', () => {
  const post = createPosterior({ seed: 5 });
  // identical options (zero information) versus a real time-for-money trade-off
  const same = { id: 'x', rent: 800, travel: travel(10), room };
  const same2 = { id: 'y', rent: 800, travel: travel(10), room };
  const fast = { id: 'f', rent: 950, travel: travel(4), room };
  const slow = { id: 's', rent: 800, travel: travel(14), room };
  const r = nextPair(post, { options: [same, same2, fast, slow], pairs: [[0, 1], [2, 3]] });
  assert.deepEqual([r.i, r.j], [2, 3]);
  assert.ok(r.ig > 0.1 && r.ig <= Math.log(2) + 1e-9, `ig ${r.ig}`);
  assert.ok(Number.isFinite(r.mu) && r.s2 > 0);
  const m = pairMoments(post, fast, slow);
  assert.ok(Math.abs(m.mu - r.mu) < 1e-12);
  // array form scores all pairs; asked pairs are skipped
  update(post, fast, slow, 'A');
  const r2 = nextPair(post, [same, same2, fast, slow]);
  assert.ok(!(r2.i === 2 && r2.j === 3));
});

test('exact BALD on the subsample is close to BALD on all particles', () => {
  const post = createPosterior({ seed: 6 });
  const cand = buildCandidates(post, homes);
  const a = nextPair(post, cand);
  const b = nextPair(post, cand, { subsample: post.n });
  assert.equal(a.subsample, BALD_SUBSAMPLE);
  assert.ok(Math.abs(a.ig - b.ig) < 0.05, `${a.ig} vs ${b.ig}`);
});

test('draws are weighted, seeded, and positive', () => {
  const post = createPosterior({ seed: 8 });
  update(post, { id: 'a', rent: 900, travel: travel(5), room }, { id: 'b', rent: 800, travel: travel(15), room }, 'A');
  const d1 = draws(post, 200, 3), d2 = draws(post, 200, 3);
  assert.equal(d1.length, 200);
  assert.deepEqual(d1[0], d2[0]);
  for (const t of d1) for (const k of PARAMS) assert.ok(t[k] > 0);
  const mean = d1.reduce((s, t) => s + t.vTime, 0) / d1.length;
  const pm = posteriorMean(post).vTime;
  assert.ok(Math.abs(Math.log(mean / pm)) < 0.25, `${mean} vs ${pm}`);
});

test('shouldStop follows section 10 item 4', () => {
  const post = createPosterior({ seed: 1, n: 100 });
  assert.equal(shouldStop(post, 0, 0.99, 0.01).stop, false);           // below picksMin
  assert.equal(shouldStop(post, 2, 0.99, 0.01).stop, false);
  assert.equal(shouldStop(post, 3, 0.85, 0.3).reason, 'pbest');
  assert.equal(shouldStop(post, 3, 0.5, 0.01).reason, 'ig');
  assert.equal(shouldStop(post, 4, 0.5, 0.3).stop, false);
  assert.equal(shouldStop(post, 6, 0.1, 0.6).reason, 'max');
  const cfg = withOverrides({ picksMax: 4 });
  assert.equal(shouldStop(post, 4, 0.1, 0.6, cfg).reason, 'max');
});

test('pBestHomes sums to one', () => {
  const post = createPosterior({ seed: 2 });
  const pb = pBestHomes(post, homes);
  const s = pb.reduce((a, b) => a + b.pBest, 0);
  assert.ok(Math.abs(s - 1) < 1e-9);
});

test('synthetic world has realistic ranges and is labeled', () => {
  assert.match(world.label, /SYNTHETIC/);
  assert.equal(world.homes.length, 30);
  for (const h of world.homes) {
    for (const o of h.s0) {
      assert.ok(o.travel.hoursPerMonth >= 4 && o.travel.hoursPerMonth <= 60, `${o.travel.hoursPerMonth}`);
      assert.ok(o.travel.darkHoursPerMonth >= 0 && o.travel.darkHoursPerMonth <= 15);
      assert.ok(o.rent >= 600 && o.rent <= 1600);
      assert.ok(Number.isFinite(utility(posteriorMean(createPosterior({ n: 50 })), o)));
    }
  }
});

test('timing: update under 5 ms, nextPair over 500 pairs under 80 ms (warm)', () => {
  const post = createPosterior({ seed: 9 });
  const cand = buildCandidates(post, homes);
  assert.ok(cand.pairs.length >= 500);
  const c500 = { options: cand.options, pairs: cand.pairs.slice(0, 500) };
  nextPair(post, c500); // warm
  let t = performance.now();
  const reps = 5;
  for (let i = 0; i < reps; i++) nextPair(post, c500);
  const npMs = (performance.now() - t) / reps;
  const A = cand.options[0], B = cand.options[cand.options.length - 1];
  update(post, A, B, 'A'); // warm
  t = performance.now();
  for (let i = 0; i < 20; i++) update(post, A, B, i % 2 ? 'A' : 'B');
  const upMs = (performance.now() - t) / 20;
  console.log(`# nextPair 500 pairs: ${npMs.toFixed(1)} ms (subsample ${BALD_SUBSAMPLE}); update: ${upMs.toFixed(2)} ms (${post.n} particles)`);
  assert.ok(upMs < 5, `update ${upMs} ms`);
  assert.ok(npMs < 80, `nextPair ${npMs} ms`);
});

test('recoveryTest runs and BALD picks reduce regret (small run)', () => {
  const r = recoveryTest({ trials: 12, picks: 4, seed: 2, policy: 'bald', n: 1500 });
  assert.equal(r.perPick.length, 5);
  for (const k of ['coverage', 'medianIntervalWidth', 'maeLogVTime', 'top1', 'regretP50', 'regretP90', 'minESS']) {
    assert.ok(k in r, k);
  }
  assert.ok(r.perPick[4].regretMean <= r.perPick[0].regretMean, `${r.perPick[4].regretMean} vs ${r.perPick[0].regretMean}`);
  assert.ok(r.perPick[4].maeLogVTime < r.perPick[0].maeLogVTime);
  const rr = recoveryTest({ trials: 4, picks: 3, seed: 2, policy: 'random', n: 800, offPrior: true });
  const rf = recoveryTest({ trials: 4, picks: 3, seed: 2, policy: 'fixed', n: 800, tauScale: 2 });
  assert.equal(rr.perPick.length, 4);
  assert.equal(rf.perPick.length, 4);
});
