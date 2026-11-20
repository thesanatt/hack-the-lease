// Tests for engine/decide.js and engine/operator.js.
// Uses small hand-made WeekResults. Tests that need a file another builder is still writing
// (fair.js, week.js, prefs.js, homes.json, personas.json) skip with a message naming the missing file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { utility, travelFeatures, roomValue, PARAMS } from '../engine/model.js';
import { CONFIG } from '../engine/config.js';
import { rng } from '../engine/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const has = (rel) => existsSync(path.join(ROOT, rel));
const missing = (...rels) => {
  const m = rels.filter((r) => !has(r));
  return m.length ? `skipped: ${m.join(', ')} not written yet` : false;
};
const readJSON = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

// decide.js and operator.js import fair.js, so nothing here can load until fair.js exists.
const NEED_FAIR = missing('engine/fair.js');
const D = NEED_FAIR ? null : await import('../engine/decide.js');
const O = NEED_FAIR ? null : await import('../engine/operator.js');

function wk(homeId, o = {}) {
  return {
    homeId, weeklyMin: 0, walkMin: 0, bikeMin: 0, rideMin: 0, waitMin: 0, slackMin: 0,
    darkWalkMin: 0, darkBikeMin: 0, darkLongWaitMin: 0, genMin: 0, stranded: [], trips: [], ...o,
  };
}
const room = (id, o = {}) => ({ id, label: id, sqft: 130, bath: 'shared', light: 1, asking: 800, ...o });
const THETA = { vTime: 15, vDark: 10, vStrand: 15, wBath: 60, wSize: 8, wLight: 20 };

// Three homes: near (pricey, short), far (cheap, long), mid. Two scenarios: Central-only week, North lab week.
const HOMES = [
  { id: 'near', rent: 2700, utilities: 150, rooms: [room('near1', { asking: 950 }), room('near2', { asking: 900, bath: 'private' }), room('near3', { asking: 850 })] },
  { id: 'far', rent: 1800, utilities: 150, rooms: [room('far1', { asking: 600 }), room('far2', { asking: 600 }), room('far3', { asking: 600 })] },
  { id: 'mid', rent: 2400, utilities: 150, rooms: [room('mid1', { asking: 800 }), room('mid2', { asking: 800 }), room('mid3', { asking: 800 })] },
];
const SCEN = [
  new Map([['near', wk('near', { walkMin: 120 })], ['far', wk('far', { rideMin: 400, waitMin: 120, walkMin: 150, darkWalkMin: 60 })], ['mid', wk('mid', { rideMin: 200, walkMin: 120, waitMin: 40 })]]),
  new Map([['near', wk('near', { walkMin: 120, rideMin: 300, waitMin: 90, darkWalkMin: 30 })], ['far', wk('far', { rideMin: 250, waitMin: 60, walkMin: 100 })], ['mid', wk('mid', { rideMin: 200, walkMin: 120, waitMin: 40 })]]),
];
function thetaDraws(k, seed) {
  const r = rng(seed);
  return Array.from({ length: k }, () => Object.fromEntries(PARAMS.map((p) => [p, THETA[p] * Math.exp(0.6 * r.normal())])));
}

test('meRank: one draw, one scenario matches model.utility on the best room', { skip: NEED_FAIR }, () => {
  const rows = D.meRank({ homes: HOMES, weeksByScenario: [SCEN[0]], thetas: [THETA] });
  for (const row of rows) {
    const h = HOMES.find((x) => x.id === row.homeId);
    const travel = travelFeatures(SCEN[0].get(h.id), CONFIG);
    const us = h.rooms.map((r) => utility(THETA, { rent: r.asking + h.utilities / h.rooms.length, travel, room: r }));
    const best = Math.max(...us);
    assert.ok(Math.abs(row.meanU - best) < 1e-9, `${h.id}: ${row.meanU} vs ${best}`);
    assert.equal(row.roomId, h.rooms[us.indexOf(best)].id);
    assert.equal(row.dots.length, CONFIG.dots);
  }
  // near: private bath room at 900 beats the shared rooms
  assert.equal(rows.find((r) => r.homeId === 'near').roomId, 'near2');
  assert.equal(rows[0].expRegret, 0);
  assert.equal(rows[0].pBest, 1);
});

test('meRank: sorted by expected regret, P(best) sums to 1, regret identity, dots sorted', { skip: NEED_FAIR }, () => {
  const thetas = thetaDraws(200, 3);
  const rows = D.meRank({ homes: HOMES, weeksByScenario: SCEN, thetas });
  assert.equal(rows.length, 3);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].expRegret <= rows[i].expRegret);
  const sumP = rows.reduce((a, r) => a + r.pBest, 0);
  assert.ok(Math.abs(sumP - 1) < 1e-9, `sum P(best) ${sumP}`);
  // E[regret_h] = E[max U] - E[U_h], so expRegret + meanU is the same for every home.
  const c = rows.map((r) => r.expRegret + r.meanU);
  for (const x of c) assert.ok(Math.abs(x - c[0]) < 1e-6);
  for (const r of rows) {
    assert.ok(r.lo <= r.meanU + 1e-9 || r.lo <= r.hi, 'interval');
    assert.ok(r.lo <= r.hi);
    for (let i = 1; i < r.dots.length; i++) assert.ok(r.dots[i] >= r.dots[i - 1] - 1e-12);
    assert.ok(r.dots[0] >= 0);
  }
  assert.ok(rows.tensor && rows.tensor.M === 200 && rows.tensor.K === 2 && rows.tensor.H === 3);
  assert.equal(rows.regretLeader, rows[0].homeId);
});

test('meRank: a home missing from a scenario is left out', { skip: NEED_FAIR }, () => {
  const s = [new Map(SCEN[0]), SCEN[1]];
  s[0].delete('mid');
  const rows = D.meRank({ homes: HOMES, weeksByScenario: s, thetas: [THETA] });
  assert.deepEqual(rows.map((r) => r.homeId).sort(), ['far', 'near']);
});

test('evpi: zero when one home wins every scenario, exact on a two-scenario switch', { skip: NEED_FAIR }, () => {
  // Hand tensor: M = 1, K = 2, H = 2. Scenario 0: A=10, B=0. Scenario 1: A=0, B=6.
  // perfect = (10 + 6)/2 = 8; now = max(5, 3) = 5; EVPI = 3.
  const T = { U: Float64Array.from([10, 0, 0, 6]), M: 1, K: 2, H: 2 };
  assert.ok(Math.abs(D.evpi(T).evpi - 3) < 1e-12);
  const T2 = { U: Float64Array.from([10, 0, 8, 6]), M: 1, K: 2, H: 2 };
  assert.equal(D.evpi(T2).evpi, 0);
  const rows = D.meRank({ homes: HOMES, weeksByScenario: SCEN, thetas: thetaDraws(50, 5) });
  assert.ok(D.evpi(rows.tensor).evpi >= 0);
});

test('breakEven: utilities are equal at the break-even value and the low-exposure home wins above it', { skip: NEED_FAIR }, () => {
  const A = D.homeOption(HOMES[0], [SCEN[0].get('near'), SCEN[1].get('near')], THETA);
  const B = D.homeOption(HOMES[1], [SCEN[0].get('far'), SCEN[1].get('far')], THETA);
  const be = D.breakEven(A, B, 'vTime', THETA);
  assert.equal(be.param, 'vTime');
  assert.ok(be.value > 0, JSON.stringify(be));
  const at = (v) => [utility({ ...THETA, vTime: v }, A), utility({ ...THETA, vTime: v }, B)];
  const [ua, ub] = at(be.value);
  assert.ok(Math.abs(ua - ub) < 1e-6);
  const [ua2, ub2] = at(be.value * 1.5);
  assert.equal(be.aboveWins, ua2 > ub2 ? 'A' : 'B');
  assert.equal(be.aboveWins, 'A'); // near home has less travel
  // {home, weeks} form gives the same answer
  const be2 = D.breakEven({ home: HOMES[0], weeks: [SCEN[0].get('near'), SCEN[1].get('near')] }, { home: HOMES[1], weeks: [SCEN[0].get('far'), SCEN[1].get('far')] }, 'vTime', THETA);
  assert.ok(Math.abs(be2.value - be.value) < 1e-9);
  // vStrand: neither home strands, so there is no break-even
  assert.equal(D.breakEven(A, B, 'vStrand', THETA).value, null);
  assert.throws(() => D.breakEven(A, B, 'wBath', THETA));
});

// Group of five with distinct room tastes.
const FIVE = [
  { id: 'a', theta: { ...THETA, wBath: 150, wSize: 3 }, cap: null },
  { id: 'b', theta: { ...THETA, wBath: 20, wSize: 20 }, cap: null },
  { id: 'c', theta: { ...THETA, wLight: 60, wBath: 30 }, cap: null },
  { id: 'd', theta: { ...THETA, vTime: 30 }, cap: null },
  { id: 'e', theta: { ...THETA, wSize: 12, wLight: 5 }, cap: null },
];
const HOUSES = [
  { id: 'h5', rent: 4250, utilities: 250, rooms: [room('h5a', { sqft: 180, bath: 'private', light: 2 }), room('h5b', { sqft: 110, light: 0, floor: 'basement' }), room('h5c', { sqft: 150, light: 2 }), room('h5d', { sqft: 130, bath: 'half' }), room('h5e', { sqft: 200, light: 1 })] },
  { id: 'h6', rent: 4600, utilities: 300, rooms: [room('h6a', { sqft: 160 }), room('h6b', { sqft: 140, bath: 'private' }), room('h6c'), room('h6d', { light: 2 }), room('h6e', { sqft: 120 }), room('h6f', { sqft: 100, light: 0 })] },
  { id: 'h4', rent: 3200, utilities: 200, rooms: [room('h4a'), room('h4b'), room('h4c'), room('h4d')] },
];
function groupMembers(members) {
  return members.map((m, i) => ({
    ...m,
    weekByHome: new Map(HOUSES.map((h, k) => [h.id, wk(h.id, { rideMin: 100 + 40 * k + 20 * i, walkMin: 80 + 10 * i })])),
  }));
}

test('groupRank: five members, envy-free splits that cover the rent, short house last', { skip: NEED_FAIR }, () => {
  const out = D.groupRank({ homes: HOUSES, members: groupMembers(FIVE) });
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.rank), [1, 2, 3]);
  const last = out[out.length - 1];
  assert.equal(last.homeId, 'h4');
  assert.equal(last.reason, 'rooms');
  for (const r of out.slice(0, 2)) {
    const home = HOUSES.find((h) => h.id === r.homeId);
    assert.ok(r.feasible, `${r.homeId} feasible`);
    const sum = r.prices.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - home.rent) < 1e-4, `${r.homeId} rent covered: ${sum}`);
    for (const row of r.envy) for (const e of row) assert.ok(e >= -1e-6, 'envy-free');
    assert.equal(r.members.length, 5);
    assert.equal(new Set(r.members.map((m) => m.roomId)).size, 5);
    for (const m of r.members) assert.ok(Number.isFinite(m.net) && m.commute > 0);
  }
});

test('groupRank: a tight cap makes the house infeasible or raises the capped member less', { skip: NEED_FAIR }, () => {
  const members = groupMembers(FIVE.map((m) => ({ ...m, cap: m.id === 'a' ? 300 : null })));
  const out = D.groupRank({ homes: HOUSES.slice(0, 1), members });
  const r = out[0];
  const ia = r.members.find((m) => m.id === 'a');
  if (r.feasible) assert.ok(ia.rent <= 300 + 1e-6);
  else assert.ok(r.capRelaxation && r.capRelaxation.total > 0);
});

test('makePopulation: SYNTHETIC, deterministic, shares near the stated marginals, real place ids', { skip: NEED_FAIR }, () => {
  const P = O.makePopulation({ n: 2000, seed: 11 });
  const Q = O.makePopulation({ n: 2000, seed: 11 });
  assert.equal(P.label, 'SYNTHETIC');
  assert.equal(P.students.length, 2000);
  assert.deepEqual(P.students[17], Q.students[17]);
  const share = (f) => P.students.filter(f).length / P.students.length;
  assert.ok(Math.abs(share((s) => s.archetype.campus === 'Central') - CONFIG.marginals.campus.Central) < 0.04);
  assert.ok(Math.abs(share((s) => s.archetype.campus === 'North') - CONFIG.marginals.campus.North) < 0.04);
  assert.ok(Math.abs(share((s) => s.archetype.job === 'none') - CONFIG.marginals.job.none) < 0.04);
  assert.ok(Math.abs(share((s) => s.archetype.lateStudy) - CONFIG.marginals.lateStudy) < 0.04);
  assert.ok(Math.abs(share((s) => s.archetype.gym) - CONFIG.marginals.gym) < 0.04);
  const places = new Set(readJSON('web/public/data/places.json').map((p) => p.id));
  for (const s of P.students.slice(0, 300)) {
    for (const e of s.routine.week) {
      assert.ok(places.has(e.place), `place ${e.place}`);
      assert.ok(e.start < e.end, `${e.start} < ${e.end}`);
    }
    for (const k of PARAMS) assert.ok(s.theta[k] > 0);
  }
  const N = O.makePopulation({ n: 1000, seed: 2, marginals: { campus: { Central: 0, North: 1, Medical: 0 } } });
  assert.ok(N.students.every((s) => s.archetype.campus === 'North'));
});

test('roomPricing: ordered quantiles, a private bath raises that room and the headroom', { skip: NEED_FAIR }, () => {
  const pop = O.makePopulation({ n: 600, seed: 4 });
  const home = HOUSES[0];
  const groups = O.groupsFor({ home, population: pop, count: 120 });
  assert.equal(groups.length, 120);
  assert.ok(groups.every((g) => g.length === 5 && new Set(g.map((s) => s.id)).size === 5));
  const t0 = performance.now();
  const r = O.roomPricing({ home, groups, renovation: { roomId: 'h5b', bath: 'private' }, prior: pop.prior });
  const ms = performance.now() - t0;
  assert.equal(r.label, 'SYNTHETIC');
  assert.equal(r.rooms.length, 5);
  for (const x of r.rooms) assert.ok(x.p10 <= x.p50 + 1e-9 && x.p50 <= x.p90 + 1e-9);
  // the big private-bath room should carry the highest median fair rent, the small dark basement the lowest
  const p50 = Object.fromEntries(r.rooms.map((x) => [x.roomId, x.p50]));
  assert.ok(p50.h5a > p50.h5b);
  assert.ok(r.renovationDelta.roomP50 > 0, JSON.stringify(r.renovationDelta));
  assert.ok(r.renovationDelta.headroom > 0);
  assert.equal(r.priorMedians.wBath, pop.prior.wBath.median);
  // a higher wBath median widens the gap between bath and shared rooms
  const r2 = O.roomPricing({ home, groups, medians: { wBath: 2 * pop.prior.wBath.median }, prior: pop.prior });
  const p50b = Object.fromEntries(r2.rooms.map((x) => [x.roomId, x.p50]));
  assert.ok(p50b.h5a - p50b.h5b > p50.h5a - p50.h5b);
  console.log(`roomPricing 120 groups x 5 rooms with renovation: ${ms.toFixed(0)} ms`);
});

test('demandMap: a home with a far shorter week wins, shares are consistent', { skip: NEED_FAIR }, () => {
  const pop = O.makePopulation({ n: 200, seed: 9 });
  const homes = HOUSES.slice(0, 2);
  const weeksByStudent = new Map(pop.students.map((s) => [s.id, new Map([
    ['h5', wk('h5', { walkMin: 60 })],
    ['h6', wk('h6', { rideMin: 900, waitMin: 300, darkWalkMin: 200 })],
  ])]));
  const dm = O.demandMap({ homes, population: pop, weeksByStudent });
  assert.equal(dm.label, 'SYNTHETIC');
  assert.equal(dm.students, 200);
  const h5 = dm.homes.find((h) => h.homeId === 'h5');
  assert.equal(h5.firstShare, 1);
  assert.ok(h5.fitPremium > 0 && h5.wins.length > 0);
  assert.ok(Math.abs(dm.homes.reduce((a, h) => a + h.firstShare, 0) - 1) < 1e-9);
});

// Golden path on the real data, once every dependency exists.
const NEED_GOLDEN = NEED_FAIR || missing('engine/week.js', 'engine/prefs.js', 'web/public/data/homes.json', 'web/public/data/personas.json');

test('golden path: jordan ranked over 24 sampled fall weeks; group of five on homes.json', { skip: NEED_GOLDEN, timeout: 120000 }, async () => {
  const { loadAll } = await import('../engine/load.js');
  const { nodeGetter } = await import('../engine/node-load.js');
  const W = await import('../engine/week.js');
  const prefs = await import('../engine/prefs.js');
  const { homes } = readJSON('web/public/data/homes.json');
  const personas = readJSON('web/public/data/personas.json');
  const list = Array.isArray(personas) ? personas : personas.personas;
  const jordan = list.find((p) => p.id === 'jordan');
  assert.ok(jordan, 'persona jordan');
  const t0 = performance.now();
  const { planner, places } = await loadAll(nodeGetter());
  for (const p of places) planner.addPoint(p.id, p.lat, p.lon);
  for (const h of homes) planner.addPoint(h.id, h.lat, h.lon);
  const t1 = performance.now();
  const homeIds = homes.map((h) => h.id);
  const routines = W.sampleWeeks({ week: jordan.week, modes: jordan.modes }, CONFIG.scenarios, 1);
  const weeksByScenario = routines.map((r) => W.evaluateWeek(planner, r, homeIds, { cfg: CONFIG }));
  const t2 = performance.now();
  const post = prefs.createPosterior({ n: 2000, seed: 7 });
  const thetas = prefs.draws(post, CONFIG.posteriorDraws, 3);
  const rows = D.meRank({ homes, weeksByScenario, thetas });
  const t3 = performance.now();
  assert.equal(rows.length, homes.length);
  assert.ok(Math.abs(rows.reduce((a, r) => a + r.pBest, 0) - 1) < 1e-6);
  const ev = D.evpi(rows.tensor);
  assert.ok(ev.evpi >= 0);
  console.log(`jordan: load+points ${(t1 - t0).toFixed(0)} ms, 24 weeks x ${homes.length} homes ${(t2 - t1).toFixed(0)} ms, meRank ${(t3 - t2).toFixed(1)} ms; top ${rows[0].homeId} regret $${rows[0].expRegret.toFixed(0)} P(best) ${rows[0].pBest.toFixed(2)}, EVPI $${ev.evpi.toFixed(1)}`);

  // group of five: personas flagged as group members, else the five non-jordan personas or the first five
  const group = (personas.group ? personas.group.map((id) => list.find((p) => p.id === id)) : null)
    ?? list.filter((p) => p.group).slice(0, 5);
  const five = group.length === 5 ? group : list.slice(0, 5);
  if (five.length < 5) return;
  const g0 = performance.now();
  const members = five.map((p) => ({
    id: p.id, theta: p.theta, cap: p.cap ?? null,
    weekByHome: W.evaluateWeek(planner, W.sampleWeeks({ week: p.week, modes: p.modes }, 1, 2)[0], homeIds, { cfg: CONFIG }),
  }));
  const out = D.groupRank({ homes, members });
  const g1 = performance.now();
  const top = out[0];
  assert.ok(top.envy, 'top house solved');
  const off = top.envy.flatMap((row, i) => row.filter((_, j) => j !== i));
  assert.ok(off.some((e) => Math.abs(e) > 1e-6), 'nonzero off-diagonal envy');
  const fav = members.map((m) => { const hm = homes.find((h) => h.id === top.homeId); const v = hm.rooms.map((r) => roomValue(m.theta, r)); return v.indexOf(Math.max(...v)); });
  assert.ok(new Set(fav).size >= 2, 'at least two members prefer different rooms');
  console.log(`group of five: groupRank over ${homes.length} homes ${(g1 - g0).toFixed(0)} ms; top ${top.homeId} feasible ${top.feasible}`);
});
