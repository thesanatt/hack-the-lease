// Property checks and timings for the fair-division LP. Writes web/public/data/evidence/lp.json.
// Every instance here is SYNTHETIC (seeded random values), except F4 to F6, which are published examples.
// Run: node scripts/lp_props.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveHouse, privateGap, checkSplit } from '../engine/fair.js';
import { rng } from '../engine/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../web/public/data/evidence/lp.json');
const TOL = 1e-6;
const t00 = performance.now();

function mk(R, vals, caps = null, extra = {}) {
  return {
    rent: R,
    rooms: vals[0].map((_, j) => ({ id: 'r' + j, asking: extra.asking ? extra.asking[j] : undefined })),
    members: vals.map((v, i) => ({ id: 'm' + i, values: v, cap: caps ? caps[i] : null, commute: extra.commute ? extra.commute[i] : 0 })),
    lease: extra.lease,
  };
}

function randomInstance(r, n, m = n, withCaps = true) {
  const vals = [...Array(n)].map(() => [...Array(m)].map(() => Math.round(500 * r())));
  const R = Math.round(n * (300 + 600 * r()));
  const caps = withCaps ? vals.map(() => (r() < 0.5 ? Math.round((R / n) * (0.8 + 0.6 * r())) : null)) : null;
  return mk(R, vals, caps);
}

const q = (arr, p) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const r3 = (x) => (x === null || x === undefined ? x : Math.round(x * 1000) / 1000);

// F1: certificate on 2000 seeded instances, n = 2..6
const f1 = { instances: 0, checkerOk: 0, envyFree: 0, rentSumOk: 0, feasible: 0, capsRelaxed: 0, capsRespectedWhenFeasible: 0,
  negativePrice: 0, worstEnvy: 0, worstRentErr: 0, byN: {} };
{
  const r = rng(101);
  for (let k = 0; k < 2000; k++) {
    const n = 2 + (k % 5);
    const pb = randomInstance(r, n);
    const res = solveHouse(pb);
    f1.instances++;
    const b = (f1.byN[n] ??= { instances: 0, feasible: 0, capsRelaxed: 0, ms: [] });
    b.instances++;
    b.ms.push(res.ms);
    if (res.check.ok) f1.checkerOk++;
    let worst = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) worst = Math.min(worst, res.envy[i][j]);
    f1.worstEnvy = Math.min(f1.worstEnvy, worst);
    if (worst >= -TOL) f1.envyFree++;
    const sum = res.assignment.reduce((s, j) => s + res.prices[j], 0);
    f1.worstRentErr = Math.max(f1.worstRentErr, Math.abs(sum - pb.rent));
    if (Math.abs(sum - pb.rent) < TOL) f1.rentSumOk++;
    if (res.negativePrice) f1.negativePrice++;
    if (res.feasible) {
      f1.feasible++;
      b.feasible++;
      const ok = pb.members.every((m, i) => m.cap === null || res.prices[res.assignment[i]] <= m.cap + TOL);
      if (ok) f1.capsRespectedWhenFeasible++;
    } else {
      f1.capsRelaxed++;
      b.capsRelaxed++;
    }
  }
  for (const b of Object.values(f1.byN)) {
    b.p50ms = r3(q(b.ms, 0.5));
    b.maxms = r3(Math.max(...b.ms));
    delete b.ms;
  }
}

// F2: maximin optimality, n = 2 closed form
const f2 = { closedForm: { instances: 0, match: 0, worstErr: 0 }, grid: { instances: 0, compared: 0, lpNotBeaten: 0, withinStep: 0 } };
{
  const r = rng(202);
  for (let k = 0; k < 500; k++) {
    const pb = randomInstance(r, 2, 2, false);
    const res = solveHouse(pb, { nonneg: false });
    const R = pb.rent;
    const vt = pb.members.map((m) => {
      const mean = (m.values[0] + m.values[1]) / 2;
      return m.values.map((x) => x - mean + R / 2);
    });
    const v = pb.members.map((m) => m.values);
    const s = v[0][0] + v[1][1] >= v[0][1] + v[1][0] ? [0, 1] : [1, 0];
    const D = Math.min(vt[0][s[0]] - vt[0][s[1]], Math.max(vt[1][s[0]] - vt[1][s[1]], vt[0][s[0]] - vt[1][s[1]]));
    const t = Math.min(vt[0][s[0]] - (R + D) / 2, vt[1][s[1]] - (R - D) / 2);
    const err = Math.abs(res.minUtility - t);
    f2.closedForm.instances++;
    f2.closedForm.worstErr = Math.max(f2.closedForm.worstErr, err);
    if (err < TOL) f2.closedForm.match++;
  }
}
{
  // grid search over prices, n = 3 (step $1) and n = 4 (step $6)
  const gridBest = (pb, step) => {
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
    const recP = (d, left) => {
      if (d === n - 1) {
        p[d] = left;
        if (left < 0) return;
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
        return;
      }
      for (let x = 0; x <= left + 1e-9; x += step) { p[d] = x; recP(d + 1, left - x); }
    };
    recP(0, R);
    return best;
  };
  const r = rng(303);
  for (const [n, step, count] of [[3, 1, 12], [4, 6, 6]]) {
    for (let k = 0; k < count; k++) {
      const vals = [...Array(n)].map(() => [...Array(n)].map(() => Math.round(600 * r())));
      const pb = mk(240 * n, vals);
      const res = solveHouse(pb, { nonneg: true });
      const g = gridBest(pb, step);
      f2.grid.instances++;
      if (!Number.isFinite(g)) continue;
      f2.grid.compared++;
      if (res.minUtility >= g - TOL) f2.grid.lpNotBeaten++;
      if (res.minUtility - g <= n * step) f2.grid.withinStep++;
    }
  }
}

// F3: invariance to a per-member constant
const f3 = { instances: 0, oldPricesStillEF: 0, pricesUnchanged: 0 };
{
  const r = rng(404);
  for (let k = 0; k < 500; k++) {
    const n = 2 + (k % 5);
    const pb = randomInstance(r, n, n, false);
    const res = solveHouse(pb);
    const who = k % n;
    const sh = { ...pb, members: pb.members.map((m, i) => (i === who ? { ...m, values: m.values.map((x) => x + 137.5) } : m)) };
    f3.instances++;
    if (checkSplit(sh, { ...res, envy: null }, { normalize: false, nonneg: false }).ok) f3.oldPricesStillEF++;
    const res2 = solveHouse(sh);
    if (res2.prices.every((p, j) => Math.abs(p - res.prices[j]) < TOL)) f3.pricesUnchanged++;
  }
}

// F4, F5, F6: published examples
const f4p = mk(1000, [[800, 200], [800, 200]], [600, 600]);
const f4r = solveHouse(f4p);
const f4 = { feasible: f4r.feasible, zStar: r3(f4r.capRelaxation?.worst), prices: f4r.prices.map(r3),
  privateGap: [privateGap(f4p, 0), privateGap(f4p, 1)].map(r3), pass: !f4r.feasible && Math.abs(f4r.capRelaxation.worst - 200) < TOL };
const f5r = solveHouse(mk(1000, [[600, 400], [600, 400]], [450, 700]));
const f5 = { feasible: f5r.feasible, efficientAssignments: f5r.efficientAssignments, assignment: f5r.assignment,
  prices: f5r.prices.map(r3), pass: f5r.feasible && f5r.assignment[0] === 1 && Math.abs(f5r.prices[1] - 400) < TOL };
const f6r = solveHouse(mk(100, [[300, 0], [300, 0]]));
const f6 = { negativePrice: f6r.negativePrice, prices: f6r.prices.map(r3),
  pass: f6r.negativePrice && f6r.prices.some((p) => Math.abs(p + 100) < TOL) };

// F7: slack proposition
const f7 = { trials: 0, stayedEF: 0 };
{
  const r = rng(707);
  for (let k = 0; k < 500; k++) {
    const n = 2 + (k % 5);
    const pb = randomInstance(r, n, n, false);
    const res = solveHouse(pb);
    for (const [s, prices] of [[res.slack, res.prices], [res.robustSlack, res.robustPrices]]) {
      if (!(s > 1e-3) || !prices) continue;
      f7.trials++;
      const pert = pb.members.map((m) => {
        const d = m.values.map(() => r() - 0.5);
        const l1 = d.reduce((a, b) => a + Math.abs(b), 0);
        return { ...m, values: m.values.map((x, j) => x + (d[j] / l1) * s * 0.999) };
      });
      if (checkSplit({ ...pb, members: pert }, { ...res, prices, envy: null }, { normalize: false, nonneg: false }).ok) f7.stayedEF++;
    }
  }
}

// F8: whole-house lease with a spare room (common space), and the per-room lease variant
const f8 = { house: { instances: 0, oneCommonRoom: 0, commonPricedZero: 0, rentCovered: 0, checkerOk: 0 },
  room: { instances: 0, solved: 0, openRoomAtAsking: 0, noEnvyOfOpenRoom: 0, checkerOk: 0 } };
{
  const r = rng(808);
  for (let k = 0; k < 200; k++) {
    const pb = randomInstance(r, 5, 6, false);
    const res = solveHouse(pb);
    f8.house.instances++;
    if (res.common.length === 1) f8.house.oneCommonRoom++;
    if (res.common.every((j) => res.prices[j] === 0)) f8.house.commonPricedZero++;
    if (Math.abs(res.assignment.reduce((s, j) => s + res.prices[j], 0) - pb.rent) < TOL) f8.house.rentCovered++;
    if (res.check.ok) f8.house.checkerOk++;
  }
  for (let k = 0; k < 100; k++) {
    const vals = [...Array(5)].map(() => [...Array(6)].map(() => Math.round(300 * r())));
    const asking = [...Array(6)].map(() => 700 + Math.round(200 * r()));
    const pb = mk(asking.reduce((a, b) => a + b, 0), vals, null, { asking, lease: 'room' });
    const res = solveHouse(pb);
    f8.room.instances++;
    if (res.status === 'no-split') continue;
    f8.room.solved++;
    if (res.unassigned.every((j) => res.prices[j] === asking[j])) f8.room.openRoomAtAsking++;
    if (res.outsideMargins.every((m) => m.dollars >= -TOL)) f8.room.noEnvyOfOpenRoom++;
    if (res.check.ok) f8.room.checkerOk++;
  }
}

// F9: timing per house
const f9 = { byN: {}, worstCaseAllTie: {} };
{
  const r = rng(909);
  for (const n of [2, 3, 4, 5, 6]) {
    const ms = [];
    const lps = [];
    for (let k = 0; k < 500; k++) {
      const res = solveHouse(randomInstance(r, n));
      ms.push(res.ms);
      lps.push(res.lpCount);
    }
    f9.byN[n] = { instances: 500, p50ms: r3(q(ms, 0.5)), p90ms: r3(q(ms, 0.9)), maxms: r3(Math.max(...ms)), p50LPs: q(lps, 0.5), maxLPs: Math.max(...lps) };
  }
  for (const n of [5, 6]) {
    const vals = [...Array(n)].map(() => Array(n).fill(500));
    const caps = [...Array(n)].map((_, i) => 400 + 60 * i);
    const res = solveHouse(mk(500 * n, vals, caps));
    f9.worstCaseAllTie[n] = { efficientAssignments: res.efficientAssignments, lpCount: res.lpCount, ms: r3(res.ms), checkerOk: res.check.ok };
  }
}

// Commute toggle example
const vals = [[420, 300, 180], [380, 330, 200], [250, 260, 390]];
const cOff = solveHouse(mk(2400, vals, null, { commute: [10, 120, 40] }));
const cOn = solveHouse(mk(2400, vals, null, { commute: [10, 120, 40] }), { compensateCommute: true });
const commute = { commutes: [10, 120, 40], pricesOff: cOff.prices.map(r3), pricesOn: cOn.prices.map(r3),
  assignment: cOn.assignment, envyFreeBoth: cOff.check.ok && cOn.check.ok };

const out = {
  label: 'SYNTHETIC random instances (seeded) plus the published examples F4 to F6',
  generated: new Date().toISOString(),
  node: process.version,
  method: 'Enumerate every welfare-maximizing assignment, one maximin LP each (dense two-phase simplex, Bland rule). '
    + 'Caps infeasible: phase 1 minimizes the worst overrun, phase 2 maximizes the worst-off member within it.',
  tolerance: TOL,
  F1: f1, F2: f2, F3: f3, F4: f4, F5: f5, F6: f6, F7: f7, F8: f8, F9: f9, commute,
  totalSeconds: r3((performance.now() - t00) / 1000),
};
out.pass = f1.checkerOk === f1.instances && f1.envyFree === f1.instances && f1.rentSumOk === f1.instances
  && f1.capsRespectedWhenFeasible === f1.feasible
  && f2.closedForm.match === f2.closedForm.instances && f2.grid.lpNotBeaten === f2.grid.compared && f2.grid.withinStep === f2.grid.compared
  && f3.oldPricesStillEF === f3.instances && f4.pass && f5.pass && f6.pass && f7.stayedEF === f7.trials
  && f8.house.checkerOk === f8.house.instances && f8.room.checkerOk === f8.room.solved;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ pass: out.pass, F9: f9, totalSeconds: out.totalSeconds }, null, 1));
console.log('wrote', OUT);
