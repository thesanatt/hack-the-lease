// Tests for the ui-views logic (Group, Operator, Evidence), against the real engine/fair.js and model.js.
// Run: node --test web/src/views/group/views.test.mjs   (from app/)
// Fixtures below are FICTIONAL members and a SAMPLE house, used only for these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fair from '../../../../engine/fair.js';
import * as model from '../../../../engine/model.js';
import { CONFIG } from '../../../../engine/config.js';
import { rng } from '../../../../engine/rng.js';
import {
  pickGroup, modalRoutine, candidateHouses, solveAllHouses, checkCertificate, capThreshold, favoriteRoom,
  drawSampleThetas, efRate, rawUtilities,
} from './logic.js';
import { pickIrregular, drawGroups, roomPricingLocal, renovate, renovationDelta, canAddHalfBath } from '../operator/logic.js';
import { findSeries, metricsOf, defaultMetric, partition, passOf, flattenConfig } from '../evidence/report.js';

const room = (id, label, sqft, bath, light, floor, asking) => ({ id, label, sqft, bath, light, floor, asking });
const HOUSES = [
  { id: 't1', name: 'Test house A', area: 'A', kind: 'house', rent: 4500, utilities: 250, rooms: [
    room('a1', 'Front', 170, 'private', 2, '2', 1050), room('a2', 'Side', 125, 'shared', 1, '2', 850),
    room('a3', 'Back', 140, 'half', 1, '1', 900), room('a4', 'Attic', 110, 'shared', 2, 'attic', 820),
    room('a5', 'Basement', 160, 'shared', 0, 'basement', 780)] },
  { id: 't2', name: 'Test house B', area: 'B', kind: 'house', rent: 4200, utilities: 260, rooms: [
    room('b1', 'Big', 180, 'shared', 2, '1', 950), room('b2', 'Mid', 135, 'shared', 1, '1', 840),
    room('b3', 'Small', 105, 'shared', 1, '2', 780), room('b4', 'Bath room', 130, 'private', 1, '2', 900),
    room('b5', 'Low', 150, 'half', 0, 'basement', 760), room('b6', 'Den', 100, 'shared', 1, '1', 700)] },
  { id: 't3', name: 'Test flat', area: 'C', kind: 'apartment', rent: 2000, utilities: 100, rooms: [room('c1', 'One', 140, 'private', 1, '2', 1000)] },
];
const th = (vTime, wBath, wSize, wLight) => ({ vTime, vDark: 10, vStrand: 15, wBath, wSize, wLight });
const PEOPLE = [
  { id: 'jordan', name: 'Jordan', cap: 2000, theta: th(15, 60, 8, 20), week: [] },
  { id: 'm1', name: 'Ana', group: true, cap: 1000, theta: th(12, 120, 4, 10), week: [{ id: 'e1', days: ['mon'], place: 'angell', start: '09:00', end: '12:00', p: 1 }, { id: 'e2', days: ['fri'], place: 'ugli', start: '19:00', end: '22:00', p: 0.3 }] },
  { id: 'm2', name: 'Ben', group: true, cap: 1050, theta: th(20, 30, 14, 15), week: [] },
  { id: 'm3', name: 'Cy', group: true, cap: 950, theta: th(10, 50, 6, 45), week: [] },
  { id: 'm4', name: 'Dee', group: true, cap: 1100, theta: th(25, 80, 10, 5), week: [] },
  { id: 'm5', name: 'Eli', group: true, cap: 1000, theta: th(18, 20, 3, 30), week: [] },
];

function solveDemo(caps = {}) {
  const members = pickGroup(PEOPLE);
  const houses = candidateHouses(HOUSES, members.length);
  const sampleThetas = drawSampleThetas(members, rng(11), { k: 100, spread: 0.25 });
  return { members, houses, out: solveAllHouses({ fair, houses, members, weekByMember: null, model, cfg: CONFIG, caps, sampleThetas }) };
}

test('pickGroup uses group flags and modalRoutine drops unlikely entries', () => {
  const g = pickGroup(PEOPLE);
  assert.deepEqual(g.map((m) => m.id), ['m1', 'm2', 'm3', 'm4', 'm5']);
  const r = modalRoutine(PEOPLE[1], [{ id: 'late', days: ['sat'], place: 'meijer', start: '16:00', end: '23:30' }]);
  assert.deepEqual(r.week.map((e) => e.id), ['e1', 'late']);
  assert.ok(r.week.every((e) => !('p' in e) && !('alt' in e)));
  const fallback = pickGroup(PEOPLE.map(({ group, ...p }) => p));
  assert.equal(fallback.length, 5);
  assert.ok(!fallback.some((m) => m.id === 'jordan'));
});

test('candidateHouses keeps whole houses with a room per member', () => {
  assert.deepEqual(candidateHouses(HOUSES, 5).map((h) => h.id), ['t1', 't2']);
});

test('group of five: every house solves, certificate checks, shares sum to rent', () => {
  const t0 = performance.now();
  const { out } = solveDemo();
  const ms = performance.now() - t0;
  console.log(`  solveAllHouses, 2 houses x 5 members, EF samples 100: ${ms.toFixed(1)} ms`);
  assert.equal(out.rows.length, 2);
  for (const row of out.rows) {
    assert.ok(row.res, row.error);
    assert.ok(row.check.ok, row.check.issues.join('; '));
    const sum = row.res.prices.reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum - row.home.rent) < 1e-6);
    assert.ok(Number.isFinite(row.E) && Number.isFinite(row.W));
    assert.ok(row.res.efRate >= 0 && row.res.efRate <= 1);
  }
  // design test (section 10 item 5): nonzero off-diagonal envy entries, at least two different favorite rooms
  const top = out.rows[0];
  const off = top.check.envy.flatMap((r, i) => r.filter((_, j) => j !== i));
  assert.ok(off.some((e) => Math.abs(e) > 1e-6));
  const favs = new Set(top.problem.members.map((m) => favoriteRoom(m.values)));
  assert.ok(favs.size >= 2);
  // common space in the 6-room house is priced 0 and unassigned
  const b = out.rows.find((r) => r.home.id === 't2');
  const unassigned = b.home.rooms.map((_, j) => j).filter((j) => !b.res.assignment.includes(j));
  assert.equal(unassigned.length, 1);
  assert.ok(Math.abs(b.res.prices[unassigned[0]]) < 1e-6);
});

test('ranking puts feasible houses first, by worst-off utility', () => {
  const { out } = solveDemo();
  const feas = out.rows.filter((r) => r.feasible);
  for (let k = 1; k < feas.length; k++) assert.ok(feas[k - 1].E >= feas[k].E - 1e-9);
  const firstInf = out.rows.findIndex((r) => !r.feasible);
  if (firstInf >= 0) assert.ok(out.rows.slice(firstInf).every((r) => !r.feasible));
});

test('cap move: lowering one cap below its threshold makes the top house infeasible; gap is that member\'s', () => {
  const { members, out } = solveDemo({ m1: 5000, m2: 5000, m3: 5000, m4: 5000, m5: 5000 });
  const target = out.rows.find((r) => r.feasible);
  assert.ok(target, 'some house fits generous caps');
  const i = 2;
  const need = capThreshold(fair, target.problem, i, CONFIG);
  assert.ok(need > 1, `threshold ${need}`);
  const newCap = Math.floor((need - 1) / 10) * 10 - 20;
  const caps = { m1: 5000, m2: 5000, m3: 5000, m4: 5000, m5: 5000, [members[i].id]: newCap };
  const after = solveDemo(caps).out.rows.find((r) => r.home.id === target.home.id);
  assert.equal(after.feasible, false);
  const gap = fair.privateGap(after.problem, i, { cfg: CONFIG });
  assert.ok(gap > 0, `gap ${gap}`);
  assert.ok(Math.abs(gap - (need - newCap)) < 1e-3, `gap ${gap} vs ${need - newCap}`);
  for (let k = 0; k < members.length; k++) if (k !== i) assert.ok(fair.privateGap(after.problem, k, { cfg: CONFIG }) < 1e-6);
  assert.ok(after.check.ok, after.check.issues.join('; '));
});

test('checker catches a broken split', () => {
  const { out } = solveDemo();
  const row = out.rows[0];
  const bad = { ...row.res, prices: row.res.prices.map((p, j) => (j === row.res.assignment[0] ? p + 300 : p)), envy: null };
  const c = checkCertificate(row.problem, bad);
  assert.equal(c.ok, false);
});

test('local EF rate agrees with the solver within sampling noise', () => {
  const { members, out } = solveDemo();
  const row = out.rows[0];
  const local = efRate(row.problem, row.res, members.map((m) => m.theta), model, rng(5), { k: 400, spread: 0.25 });
  assert.ok(Math.abs(local.rate - row.res.efRate) < 0.15, `${local.rate} vs ${row.res.efRate}`);
  assert.ok(rawUtilities(row.problem, row.res).every(Number.isFinite));
});

test('operator: irregular house, local pricing sums, half-bath renovation raises that room', () => {
  const home = pickIrregular(HOUSES);
  assert.equal(home.id, 't1'); // three bath types, four floors, 60 sq ft spread
  const prior = model.priorFor({});
  const groups = drawGroups({ model, prior, n: home.rooms.length, G: 200, r: rng(2026) });
  const t0 = performance.now();
  const base = roomPricingLocal({ fair, model, home, groups, cfg: CONFIG });
  const j = home.rooms.findIndex((r) => r.id === 'a5');
  assert.ok(canAddHalfBath(home.rooms[j]));
  const after = roomPricingLocal({ fair, model, home: renovate(home, j, 'half'), groups, cfg: CONFIG });
  console.log(`  operator local pricing, 5 rooms, 2 x 200 groups: ${(performance.now() - t0).toFixed(0)} ms`);
  assert.equal(base.failed, 0);
  for (const r of base.rooms) assert.ok(r.p10 <= r.p50 && r.p50 <= r.p90);
  const d = renovationDelta(base, after, j);
  assert.ok(d.roomP50 > 0, `roomP50 ${d.roomP50}`);
  assert.ok(d.headroom >= 0, `headroom ${d.headroom}`);
});

test('evidence readers handle the shapes we expect and odd ones', () => {
  const rec = { seed: 7, policies: { bald: { perPick: [{ pick: 0, regretP50: 40 }, { pick: 1, regretP50: 30 }] }, random: { perPick: [{ pick: 0, regretP50: 40 }, { pick: 1, regretP50: 35 }] } } };
  const s = findSeries(rec);
  assert.equal(s.length, 2);
  assert.equal(defaultMetric(metricsOf(s)), 'regretP50');
  assert.equal(findSeries({ a: 1 }).length, 0);
  assert.equal(passOf({ pass: false }), false);
  assert.equal(passOf({ status: 'ok' }), true);
  const p = partition({ pass: true, n: 3, rows: [{ a: 1 }], sub: { b: 2 } });
  assert.equal(p.scalars.length, 2);
  assert.equal(p.tables.length, 1);
  assert.equal(p.nested.length, 1);
  const rows = flattenConfig(CONFIG);
  assert.ok(rows.some(([k]) => k === 'marginals.campus.North'));
});

// Evidence view readers against the real evidence files (written by the validation scripts).
test('evidence summaries read the real files', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { summaryOf, recoveryCurves } = await import('../evidence/report.js');
  const dir = new URL('../../../public/data/evidence/', import.meta.url);
  for (const key of ['router', 'router_labels', 'r5', 'lp']) {
    const f = new URL(`${key}.json`, dir);
    if (!existsSync(f)) continue;
    const s = summaryOf(key, JSON.parse(readFileSync(f, 'utf8')));
    assert.ok(s && s.facts.length >= 3, `${key} summary has facts`);
    for (const [label, value] of s.facts) assert.ok(label && value != null && value !== '', `${key}: ${label}`);
  }
  const rf = new URL('recovery.json', dir);
  if (existsSync(rf)) {
    const c = recoveryCurves(JSON.parse(readFileSync(rf, 'utf8')));
    assert.ok(c && c.series.length > 0 && c.series.every((x) => x.pts.length >= 2));
    assert.equal(c.sets[0], 'off-prior');
  }
});
