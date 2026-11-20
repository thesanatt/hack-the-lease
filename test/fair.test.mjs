// Fair division tests (docs/SYSTEM_DESIGN.md section 5.2, section 10 item 5). Random instances are SYNTHETIC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveLP } from '../engine/simplex.js';
import { solveHouse, privateGap, rankHouses, checkSplit } from '../engine/fair.js';
import { rng } from '../engine/rng.js';
import { roomValue } from '../engine/model.js';
import { CONFIG, withOverrides } from '../engine/config.js';

const TOL = 1e-6;

function mk(R, vals, caps = null, extra = {}) {
  return {
    rent: R,
    rooms: vals[0].map((_, j) => ({ id: 'r' + j, asking: extra.asking ? extra.asking[j] : undefined })),
    members: vals.map((v, i) => ({ id: 'm' + i, values: v, cap: caps ? caps[i] : null, commute: extra.commute ? extra.commute[i] : 0 })),
    lease: extra.lease,
  };
}

function randomInstance(r, n, m = n, capMode = 'mixed') {
  const vals = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < m; j++) row.push(Math.round(500 * r()));
    vals.push(row);
  }
  const R = Math.round(n * (300 + 600 * r()));
  let caps = null;
  if (capMode === 'mixed') {
    caps = vals.map(() => (r() < 0.5 ? Math.round((R / n) * (0.8 + 0.6 * r())) : null));
  }
  return mk(R, vals, caps);
}

// Test-local verifier, written separately from fair.checkSplit.
function verify(problem, res, { normalize = true } = {}) {
  const n = problem.members.length;
  const R = problem.rent;
  const vt = problem.members.map((mem) => {
    const mean = mem.values.reduce((a, b) => a + b, 0) / mem.values.length;
    return mem.values.map((x) => (normalize ? x - mean + R / n : x));
  });
  let worst = 0;
  const a = res.assignment;
  const p = res.prices;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      if (i === k) continue;
      const e = (vt[i][a[i]] - p[a[i]]) - (vt[i][a[k]] - p[a[k]]);
      worst = Math.min(worst, e);
      assert.ok(Math.abs(e - res.envy[i][k]) < 1e-6, 'envy matrix entry matches');
    }
  }
  const sum = a.reduce((s, j) => s + p[j], 0);
  return { worstEnvy: worst, sumErr: Math.abs(sum - (problem.lease === 'room' ? sum : R)) };
}

// ---------- simplex ----------

test('simplex: textbook optimum, free variables, infeasible and unbounded', () => {
  const a = solveLP({ c: [3, 5], Aub: [[1, 0], [0, 2], [3, 2]], bub: [4, 12, 18] });
  assert.equal(a.status, 'optimal');
  assert.ok(Math.abs(a.obj - 36) < 1e-9);
  const b = solveLP({ c: [1, 1], Aub: [[1, 1]], bub: [1], Aeq: [[1, -1]], beq: [-3], lb: [null, 0] });
  assert.equal(b.status, 'optimal');
  assert.ok(Math.abs(b.x[0] + 1) < 1e-9 && Math.abs(b.x[1] - 2) < 1e-9);
  const c = solveLP({ c: [1], Aub: [[1]], bub: [-1] });
  assert.equal(c.status, 'infeasible');
  const d = solveLP({ c: [1, 0], Aub: [[-1, 1]], bub: [1] });
  assert.equal(d.status, 'unbounded');
  const e = solveLP({ c: [-1], lb: [null], ub: [5], Aub: [[-1]], bub: [3] }); // x >= -3, max -x
  assert.ok(Math.abs(e.x[0] + 3) < 1e-9);
  const f = solveLP({ c: [1, 1], lb: [1, 2], ub: [4, 3] });
  assert.ok(Math.abs(f.obj - 7) < 1e-9);
  // degenerate instance (Beale's cycling example) terminates under Bland's rule
  const g = solveLP({
    c: [0.75, -150, 0.02, -6],
    Aub: [[0.25, -60, -0.04, 9], [0.5, -90, -0.02, 3], [0, 0, 1, 0]],
    bub: [0, 0, 1],
  });
  assert.equal(g.status, 'optimal');
  assert.ok(Math.abs(g.obj - 0.05) < 1e-9);
});

// ---------- F1 ----------

test('F1 random instances n = 2..6, 2000 seeded cases: certificate holds for every output', () => {
  const r = rng(101);
  let solved = 0;
  let feasible = 0;
  let relaxed = 0;
  for (let k = 0; k < 2000; k++) {
    const n = 2 + (k % 5);
    const pb = randomInstance(r, n);
    const res = solveHouse(pb);
    assert.ok(res.status === 'ok' || res.status === 'caps-relaxed', `instance ${k} status ${res.status}`);
    solved++;
    assert.ok(res.check.ok, `checker failed on ${k}: ${res.check.failures.join('; ')}`);
    const v = verify(pb, res);
    assert.ok(v.worstEnvy >= -TOL, `envy ${v.worstEnvy} on ${k}`);
    assert.ok(v.sumErr < TOL, `rent sum off on ${k}`);
    if (res.feasible) {
      feasible++;
      pb.members.forEach((mem, i) => {
        if (mem.cap !== null) assert.ok(res.prices[res.assignment[i]] <= mem.cap + TOL, `cap on ${k}`);
      });
    } else {
      relaxed++;
      assert.ok(res.capRelaxation && res.capRelaxation.worst > 0);
    }
  }
  assert.equal(solved, 2000);
  assert.ok(feasible > 0 && relaxed > 0, `both branches exercised (feasible ${feasible}, relaxed ${relaxed})`);
});

// ---------- F2 ----------

test('F2 maximin optimality: n = 2 closed form', () => {
  const r = rng(202);
  for (let k = 0; k < 300; k++) {
    const pb = randomInstance(r, 2, 2, 'none');
    const res = solveHouse(pb, { nonneg: false });
    const R = pb.rent;
    const vt = pb.members.map((m) => {
      const mean = (m.values[0] + m.values[1]) / 2;
      return m.values.map((x) => x - mean + R / 2);
    });
    const v = pb.members.map((m) => m.values);
    const s = v[0][0] + v[1][1] >= v[0][1] + v[1][0] ? [0, 1] : [1, 0];
    const lo = vt[1][s[0]] - vt[1][s[1]];
    const hi = vt[0][s[0]] - vt[0][s[1]];
    const D = Math.min(hi, Math.max(lo, vt[0][s[0]] - vt[1][s[1]]));
    const u1 = vt[0][s[0]] - (R + D) / 2;
    const u2 = vt[1][s[1]] - (R - D) / 2;
    assert.ok(Math.abs(res.minUtility - Math.min(u1, u2)) < 1e-6, `closed form ${k}`);
  }
});

function gridBest(pb, step) {
  const n = pb.members.length;
  const R = pb.rent;
  const vt = pb.members.map((m) => {
    const mean = m.values.reduce((a, b) => a + b, 0) / n;
    return m.values.map((x) => x - mean + R / n);
  });
  const perms = [];
  const rec = (pre, rest) => {
    if (!rest.length) { perms.push(pre); return; }
    rest.forEach((x, i) => rec([...pre, x], rest.filter((_, k) => k !== i)));
  };
  rec([], [...Array(n).keys()]);
  let best = -Infinity;
  const p = new Array(n);
  const evalPoint = () => {
    for (const s of perms) {
      let ok = true;
      let mn = Infinity;
      for (let i = 0; i < n && ok; i++) {
        const own = vt[i][s[i]] - p[s[i]];
        mn = Math.min(mn, own);
        for (let j = 0; j < n; j++) if (vt[i][j] - p[j] > own + 1e-9) { ok = false; break; }
      }
      if (ok && mn > best) best = mn;
    }
  };
  const recP = (d, left) => {
    if (d === n - 1) {
      p[d] = left;
      if (left >= 0) evalPoint();
      return;
    }
    for (let x = 0; x <= left + 1e-9; x += step) { p[d] = x; recP(d + 1, left - x); }
  };
  recP(0, R);
  return best;
}

test('F2 maximin optimality: grid search over prices for n = 3 and 4', () => {
  const r = rng(303);
  let compared = 0;
  for (const [n, step, count] of [[3, 1, 8], [4, 6, 4]]) {
    for (let k = 0; k < count; k++) {
      const vals = [];
      for (let i = 0; i < n; i++) vals.push([...Array(n)].map(() => Math.round(600 * r())));
      const R = 240 * n;
      const pb = mk(R, vals);
      const res = solveHouse(pb, { nonneg: true });
      const g = gridBest(pb, step);
      if (!Number.isFinite(g)) continue; // EF region missed by the grid
      compared++;
      assert.ok(res.minUtility >= g - 1e-6, `LP beaten by grid (n=${n}, ${res.minUtility} < ${g})`);
      assert.ok(res.minUtility - g <= n * step, `grid within step of LP (n=${n}, gap ${res.minUtility - g})`);
    }
  }
  assert.ok(compared >= 8, `compared ${compared} instances`);
});

// ---------- F3 ----------

test('F3 invariance: a constant added to one member leaves old prices envy-free', () => {
  const r = rng(404);
  for (let k = 0; k < 200; k++) {
    const n = 2 + (k % 5);
    const pb = randomInstance(r, n, n, 'none');
    const res = solveHouse(pb);
    const who = k % n;
    const shifted = { ...pb, members: pb.members.map((m, i) => (i === who ? { ...m, values: m.values.map((x) => x + 137.5) } : m)) };
    for (const normalize of [true, false]) {
      const c = checkSplit(shifted, { ...res, envy: null }, { normalize, nonneg: false });
      assert.ok(c.ok, `old prices not EF after shift (${k}): ${c.failures.join('; ')}`);
    }
    const res2 = solveHouse(shifted);
    assert.ok(res2.check.ok);
    assert.deepEqual(res2.assignment, res.assignment);
    for (let j = 0; j < n; j++) assert.ok(Math.abs(res2.prices[j] - res.prices[j]) < 1e-6, 'normalized prices unchanged');
  }
});

// ---------- F4, F5, F6 ----------

test('F4 published infeasibility example: caps 600, values (800, 200), z* = 200', () => {
  const pb = mk(1000, [[800, 200], [800, 200]], [600, 600]);
  const res = solveHouse(pb);
  assert.equal(res.feasible, false);
  assert.equal(res.status, 'caps-relaxed');
  assert.ok(Math.abs(res.capRelaxation.worst - 200) < 1e-6);
  assert.ok(Math.abs(res.capRelaxation.total - 200) < 1e-4);
  const sorted = res.prices.slice().sort((a, b) => b - a);
  assert.ok(Math.abs(sorted[0] - 800) < 1e-4 && Math.abs(sorted[1] - 200) < 1e-4);
  assert.ok(res.check.ok);
  assert.ok(Math.abs(privateGap(pb, 0) - 200) < 1e-6);
  assert.ok(Math.abs(privateGap(pb, 1) - 200) < 1e-6);
});

test('F5 tie trap: both efficient assignments are tried', () => {
  const pb = mk(1000, [[600, 400], [600, 400]], [450, 700]);
  const res = solveHouse(pb);
  assert.equal(res.feasible, true);
  assert.equal(res.efficientAssignments, 2);
  assert.deepEqual(res.assignment, [1, 0]); // A in room 2, B in room 1
  assert.ok(Math.abs(res.prices[1] - 400) < 1e-6 && Math.abs(res.prices[0] - 600) < 1e-6);
  assert.equal(privateGap(pb, 0), 0);
  assert.equal(privateGap(pb, 1), 0);
});

test('F6 negative price: EF forces (200, -100) and the output flags it', () => {
  const pb = mk(100, [[300, 0], [300, 0]]);
  const res = solveHouse(pb);
  assert.equal(res.negativePrice, true);
  assert.equal(res.nonnegDropped, true);
  const sorted = res.prices.slice().sort((a, b) => b - a);
  assert.ok(Math.abs(sorted[0] - 200) < 1e-6 && Math.abs(sorted[1] + 100) < 1e-6);
  assert.ok(res.check.ok);
  const strict = solveHouse({ ...pb, members: pb.members.map((m) => ({ ...m, values: [80, 0] })) });
  assert.equal(strict.negativePrice, false);
});

// ---------- F7 ----------

test('F7 slack proposition: values perturbed by L1 <= slack keep the split envy-free', () => {
  const r = rng(707);
  let tried = 0;
  for (let k = 0; k < 200; k++) {
    const n = 2 + (k % 4);
    const pb = randomInstance(r, n, n, 'none');
    const res = solveHouse(pb);
    for (const [s, prices] of [[res.slack, res.prices], [res.robustSlack, res.robustPrices]]) {
      if (!(s > 1e-3) || !prices) continue;
      tried++;
      const pert = pb.members.map((m) => {
        const d = m.values.map(() => r() - 0.5);
        const l1 = d.reduce((a, b) => a + Math.abs(b), 0);
        return { ...m, values: m.values.map((x, j) => x + (d[j] / l1) * s * 0.999) };
      });
      const c = checkSplit({ ...pb, members: pert }, { ...res, prices, envy: null }, { normalize: false, nonneg: false });
      assert.ok(c.ok, `perturbed split not EF: ${c.failures.join('; ')}`);
    }
  }
  assert.ok(tried > 100);
});

// ---------- F8 (common-space rule) ----------

test('F8 whole-house lease, 5 members and 6 rooms: the extra room is common space inside R', () => {
  const r = rng(808);
  for (let k = 0; k < 50; k++) {
    const pb = randomInstance(r, 5, 6, 'none');
    const res = solveHouse(pb);
    assert.equal(res.lease, 'house');
    assert.equal(res.common.length, 1);
    const c = res.common[0];
    assert.equal(res.prices[c], 0);
    assert.ok(!res.assignment.includes(c));
    const sum = res.assignment.reduce((s, j) => s + res.prices[j], 0);
    assert.ok(Math.abs(sum - pb.rent) < 1e-6, 'bedrooms carry all of R');
    assert.ok(res.check.ok, res.check.failures.join('; '));
    // the common room is the one a brute-force welfare maximum leaves out
    let best = -Infinity;
    let leftOut = new Set();
    const rec = (i, used, w) => {
      if (i === 5) {
        const out = [0, 1, 2, 3, 4, 5].find((j) => !used.includes(j));
        if (w > best + 1e-9) { best = w; leftOut = new Set([out]); } else if (Math.abs(w - best) <= 1e-9) leftOut.add(out);
        return;
      }
      for (let j = 0; j < 6; j++) if (!used.includes(j)) rec(i + 1, [...used, j], w + pb.members[i].values[j]);
    };
    rec(0, [], 0);
    assert.ok(leftOut.has(c));
  }
});

test('F8b per-room lease: the open room is priced at asking and nobody envies it', () => {
  const r = rng(809);
  let solved = 0;
  for (let k = 0; k < 30; k++) {
    const vals = [...Array(5)].map(() => [...Array(6)].map(() => Math.round(300 * r())));
    const asking = [...Array(6)].map(() => 700 + Math.round(200 * r()));
    const R = asking.reduce((a, b) => a + b, 0);
    const pb = mk(R, vals, null, { asking, lease: 'room' });
    const res = solveHouse(pb);
    if (res.status === 'no-split') continue;
    solved++;
    assert.equal(res.unassigned.length, 1);
    const u = res.unassigned[0];
    assert.equal(res.prices[u], asking[u]);
    for (const om of res.outsideMargins) assert.ok(om.dollars >= -1e-6);
    const sum = res.assignment.reduce((s, j) => s + res.prices[j], 0);
    assert.ok(Math.abs(sum - (R - asking[u])) < 1e-6);
    assert.ok(res.check.ok, res.check.failures.join('; '));
  }
  assert.ok(solved > 20);
});

// ---------- F9 ----------

test('F9 timing: p50 and max solve time per house at n = 5 and 6 (and the all-tie worst case)', () => {
  const r = rng(909);
  const report = {};
  for (const n of [5, 6]) {
    const t = [];
    for (let k = 0; k < 200; k++) t.push(solveHouse(randomInstance(r, n)).ms);
    t.sort((a, b) => a - b);
    report[n] = { p50: t[100], max: t[t.length - 1] };
    assert.ok(t[100] < 20, `p50 at n=${n} is ${t[100]} ms`);
  }
  const tie = mk(3000, [...Array(6)].map(() => [500, 500, 500, 500, 500, 500]), [400, 600, 500, 700, 450, 550]);
  const res = solveHouse(tie);
  assert.equal(res.efficientAssignments, 720);
  assert.ok(res.check.ok);
  report.tie6 = res.ms;
  assert.ok(res.ms < 1000, `all-tie n=6 took ${res.ms} ms`);
  console.log('F9 timing ms', JSON.stringify(report));
});

// ---------- commute, negative t, posterior EF rate ----------

test('commute toggle: compensation changes prices when commutes differ; EF rows never see it', () => {
  const vals = [[420, 300, 180], [380, 330, 200], [250, 260, 390]];
  const off = solveHouse(mk(2400, vals, null, { commute: [10, 120, 40] }));
  const offNoCommute = solveHouse(mk(2400, vals));
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(off.prices[j] - offNoCommute.prices[j]) < 1e-6, 'off by default');
  const on = solveHouse(mk(2400, vals, null, { commute: [10, 120, 40] }), { compensateCommute: true });
  const diff = on.prices.reduce((s, p, j) => s + Math.abs(p - off.prices[j]), 0);
  assert.ok(diff > 1, `prices moved by ${diff}`);
  assert.ok(on.check.ok);
  // the long commuter pays less with compensation
  const longIdx = on.assignment[1];
  assert.ok(on.prices[longIdx] < off.prices[longIdx]);
  // the config switch does the same thing
  const viaCfg = solveHouse(mk(2400, vals, null, { commute: [10, 120, 40] }), { cfg: withOverrides({ compensateCommute: true }) });
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(viaCfg.prices[j] - on.prices[j]) < 1e-6);
});

test('negative t: t is a free variable', () => {
  const res = solveHouse(mk(2000, [[300, 100], [250, 120]]), { normalize: false });
  assert.ok(res.minUtility < 0);
  // closed form: s = (0,1), D = clamp(300 - 120, 130, 200) = 180, t = 300 - (2000 + 180)/2 = -790
  assert.ok(Math.abs(res.minUtility + 790) < 1e-6);
  assert.ok(res.check.ok);
  const comp = solveHouse(mk(900, [[500, 400], [450, 450]], null, { commute: [800, 0] }), { compensateCommute: true });
  assert.ok(comp.minUtility < 0);
});

test('EF rate over posterior samples, and robustSlack only above $1', () => {
  const pb = mk(1800, [[400, 250, 100], [300, 350, 150], [120, 200, 420]]);
  const exact = pb.members.map((m) => [...Array(100)].map(() => m.values));
  const res = solveHouse(pb, { samples: exact });
  assert.equal(res.efSamples, 100);
  assert.equal(res.efRate, 1);
  const r = rng(5);
  const noisy = pb.members.map((m) => [...Array(100)].map(() => m.values.map((x) => x + 150 * r.normal())));
  const res2 = solveHouse(pb, { samples: noisy });
  assert.ok(res2.efRate < 1 && res2.efRate >= 0);
  assert.ok(res.robustSlack > 1);
  const flat = solveHouse(mk(1000, [[500, 500], [500, 500]]));
  assert.equal(flat.robustSlack, null);
});

// ---------- privateGap, rankHouses, golden-path group ----------

test('privateGap matches the smallest cap raise that makes the house feasible', () => {
  const r = rng(1111);
  let checked = 0;
  for (let k = 0; k < 120 && checked < 25; k++) {
    const n = 2 + (k % 3);
    const pb = randomInstance(r, n);
    const res = solveHouse(pb);
    if (res.feasible) continue;
    const i = pb.members.findIndex((m) => m.cap !== null);
    const gap = privateGap(pb, i);
    if (gap === null) continue;
    checked++;
    const raise = (d) => ({ ...pb, members: pb.members.map((m, k2) => (k2 === i ? { ...m, cap: m.cap + d } : m)) });
    const others = pb.members.every((m, k2) => k2 === i || m.cap === null);
    if (others) assert.ok(solveHouse(raise(gap + 1e-3)).feasible, 'raising by the gap is enough');
    if (gap > 1e-3) assert.ok(!solveHouse(raise(gap - 1e-3)).feasible || !others, 'less is not enough');
  }
  assert.ok(checked > 5);
});

test('rankHouses: feasible first by E_h, then by worst overrun; disagreement flag', () => {
  const g = (R, caps, commute, vals) => ({ ...mk(R, vals, caps, { commute }), utilities: 150 });
  const vals = [[400, 250, 100], [300, 350, 150], [120, 200, 420]];
  const problems = [
    g(2600, [700, 700, 700], [20, 20, 20], vals), // infeasible
    g(2100, [900, 900, 900], [30, 30, 30], vals),
    g(1900, [900, 900, 900], [60, 10, 200], vals),
  ];
  const ranked = rankHouses(problems);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[2].index, 0);
  assert.equal(ranked[2].feasible, false);
  assert.ok(ranked[0].feasible && ranked[1].feasible);
  assert.ok(ranked[0].minUtility >= ranked[1].minUtility);
  assert.equal(typeof ranked[0].disagree, 'boolean');
  for (const x of ranked) assert.ok(x.sumUtility >= x.minUtility * 3 - 1e-6);
});

test('golden path: a group of five with their own demo thetas gets a nonzero envy matrix', () => {
  // SAMPLE house and FICTIONAL demo thetas (values come from each member's own theta, never a shared prior).
  const rooms = [
    { id: 'a', sqft: 120, bath: 'private', light: 1 },
    { id: 'b', sqft: 190, bath: 'shared', light: 2 },
    { id: 'c', sqft: 140, bath: 'half', light: 2 },
    { id: 'd', sqft: 110, bath: 'shared', light: 0 },
    { id: 'e', sqft: 160, bath: 'shared', light: 1 },
  ];
  const thetas = [
    { wBath: 120, wSize: 4, wLight: 10 },
    { wBath: 20, wSize: 14, wLight: 15 },
    { wBath: 40, wSize: 5, wLight: 60 },
    { wBath: 60, wSize: 8, wLight: 20 },
    { wBath: 10, wSize: 3, wLight: 5 },
  ];
  const members = thetas.map((th, i) => ({
    id: 'p' + i, values: rooms.map((rm) => roomValue(th, rm)), cap: [1000, 900, 950, 1100, 820][i], commute: 40 * i,
  }));
  const pb = { rent: 4250, rooms, members };
  const res = solveHouse(pb);
  assert.ok(res.check.ok);
  const fav = members.map((m) => m.values.indexOf(Math.max(...m.values)));
  assert.ok(new Set(fav).size >= 2, 'favorite rooms differ');
  let nonzero = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (i !== j && Math.abs(res.envy[i][j]) > 1) nonzero++;
  assert.ok(nonzero > 0);
  assert.ok(res.ms < 50, `solve took ${res.ms} ms`);
});

test('fewer rooms than members, and cfg.maxMembers', () => {
  assert.equal(solveHouse(mk(1000, [[1], [2], [3]].map((x) => [x[0], 0]))).status, 'too-few-rooms');
  const small = withOverrides({ maxMembers: 2 });
  assert.equal(solveHouse(randomInstance(rng(1), 3), { cfg: small }).status, 'too-many-members');
  assert.equal(CONFIG.maxMembers, 6);
});
