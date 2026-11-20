// Tests for the operator fit and portfolio logic, on the shipped SYNTHETIC operator.json and the real engine.
// Run: node --test web/src/views/operator/fit.test.mjs   (from app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as op from '../../../../engine/operator.js';
import {
  keyOf, parseKey, clock, weekWords, winnerByKind, countKinds, kindGrid, winsSummary, firstRank,
  portfolioRow, actionFor, SORTS,
} from './fit.js';

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const OP = read('../../../public/data/operator.json');
const HOMES = read('../../../public/data/homes.json').homes;
const usd = (x) => `$${Math.round(x)}`;

test('fit: keys match the engine archetypeKey and parse back', () => {
  for (const campus of ['Central', 'North', 'Medical']) for (const job of ['none', 'downtown', 'campus'])
    for (const lateStudy of [false, true]) for (const gym of [false, true]) {
      const a = { campus, job, lateStudy, gym };
      assert.equal(keyOf(a), op.archetypeKey(a));
      assert.deepEqual(parseKey(keyOf(a)), a);
    }
  assert.equal(clock('17:30'), '5:30 pm');
  assert.equal(clock('07:00'), '7 am');
  assert.equal(clock('12:00'), '12 pm');
  const w = weekWords({ campus: 'North', job: 'downtown', lateStudy: true, gym: true }, op.POP_ASSUMPTIONS);
  assert.match(w, /^North Campus classes, evening job downtown 5:30 pm to 9 pm, library until 11:30 pm two nights, gym at 7 am$/);
  assert.ok(/^[\x20-\x7e]*$/.test(w), 'ASCII only');
});

test('fit: every kind of week in the population has one winner, and counts add to the population', () => {
  const pop = op.makePopulation({ n: OP.population.n, seed: OP.population.seed });
  const counts = countKinds(pop);
  const grid = kindGrid(OP.demand, counts);
  const cells = grid.flatMap((r) => r.cells);
  assert.equal(cells.length, 36);
  assert.equal(cells.reduce((t, c) => t + c.n, 0), OP.population.n);
  const win = winnerByKind(OP.demand);
  for (const c of cells) if (c.n > 0) assert.ok(win.has(c.key), `no winner for ${c.key}`);
  const winsTotal = OP.demand.homes.reduce((t, h) => t + h.wins.length, 0);
  assert.equal(winsTotal, win.size, 'each kind is won by exactly one home');
});

test('fit: wins summary counts are the wins list', () => {
  const h1 = OP.demand.homes.find((h) => h.homeId === 'h1');
  const s = winsSummary(h1.wins).join(' ');
  assert.match(s, new RegExp(`for ${h1.wins.length} of 36 kinds`));
  assert.match(winsSummary([]).join(' '), /not the most common first pick/);
  assert.ok(!/[–—‘’“”]/.test(s));
  const r = firstRank(OP.demand, 'h3');
  assert.equal(r.rank, 1);
});

test('portfolio: rows from shipped pricing, worst room and action words', () => {
  const rows = OP.homes.map((ph) => {
    const home = HOMES.find((h) => h.id === ph.homeId);
    return portfolioRow({ home, typical: ph.rooms.map((r) => r.p50), fit: OP.demand.homes.find((d) => d.homeId === ph.homeId), students: OP.demand.students });
  });
  assert.equal(rows.length, OP.homes.length);
  const h1 = rows.find((r) => r.homeId === 'h1');
  assert.equal(h1.askTotal, 4650);
  assert.equal(h1.worst.label, 'Attic room');
  assert.ok(h1.worst.d < 0);
  assert.match(actionFor(h1, usd), /^Raise Attic room by about \$37 and lower the other rooms/);
  assert.equal(h1.firstN, Math.round(OP.demand.homes[0].firstShare * 2000));
  const sorted = [...rows].sort(SORTS.off.fn);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].off >= sorted[i].off);
  const none = portfolioRow({ home: HOMES[0], typical: null, fit: null, students: 2000 });
  assert.equal(none.off, null);
});
