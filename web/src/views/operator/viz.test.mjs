// Tests for the Owners chart helpers, on the shipped sample homes.json and operator.json.
// Run: node --test web/src/views/operator/viz.test.mjs   (from app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { floorsOf, roomState, outside, gapTotal, niceTicks, rentDomain, shortKind, shortName, fitBars } from './viz.js';

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const OP = read('../../../public/data/operator.json');
const HOMES = read('../../../public/data/homes.json').homes;

test('viz: floors run top of the house first and keep every room once', () => {
  for (const h of HOMES) {
    const fl = floorsOf(h.rooms);
    const js = fl.flatMap((f) => f.rooms.map((r) => r.j)).sort((a, b) => a - b);
    assert.deepEqual(js, h.rooms.map((_, j) => j));
    const names = fl.map((f) => f.name);
    if (names.includes('Attic')) assert.equal(names[0], 'Attic');
    if (names.includes('Basement')) assert.equal(names[names.length - 1], 'Basement');
  }
});

test('viz: room state counts any asking rent outside the fair range; near adds a margin', () => {
  const f = { p10: 900, p50: 950, p90: 1000 };
  assert.equal(roomState(1000, f), 'fair');
  assert.equal(roomState(1005, f), 'over');
  assert.equal(roomState(900, f), 'fair');
  assert.equal(roomState(895, f), 'under');
  assert.equal(roomState(1005, f, 10), 'fair');
  assert.equal(roomState(1010, f, 10), 'over');
  assert.equal(roomState(885, f, 10), 'under');
  assert.equal(roomState(NaN, f), 'none');
  assert.equal(outside(1012, f), 12);
  assert.equal(outside(880, f), 20);
  assert.equal(outside(950, f), 0);
});

test('viz: gap total matches the shipped room rents', () => {
  for (const ph of OP.homes) {
    const h = HOMES.find((x) => x.id === ph.homeId);
    const g = gapTotal(h.rooms, ph.rooms);
    const want = h.rooms.reduce((t, r, j) => t + Math.abs(r.asking - ph.rooms[j].p50), 0);
    assert.equal(g, want);
  }
  assert.equal(gapTotal([{ asking: 1 }], null), null);
});

test('viz: ticks and domain are clean and cover the data', () => {
  assert.deepEqual(niceTicks(830, 1120, 4), [900, 1000, 1100]);
  const h = HOMES[0];
  const ph = OP.homes.find((x) => x.homeId === h.id);
  const [lo, hi] = rentDomain(h.rooms, ph.rooms);
  for (const r of ph.rooms) assert.ok(r.p10 >= lo && r.p90 <= hi);
});

test('viz: words are short, plain and ASCII', () => {
  assert.equal(shortKind('Central, no job, late study, gym'), 'Central, late library, early gym');
  assert.equal(shortKind('North, no job'), 'North, classes only');
  assert.equal(shortKind('Medical, job downtown'), 'Medical, job downtown');
  assert.equal(shortName('Church St house, 5 bed'), 'Church St');
  const counts = new Map([['Central, no job', 50], ['North, no job', 80]]);
  const bars = fitBars(['Central, no job', 'North, no job'], counts);
  assert.deepEqual(bars.map((b) => b.n), [80, 50]);
  const many = Array.from({ length: 12 }, (_, i) => `Central, no job${i % 2 ? ', gym' : ''}${i}`);
  const folded = fitBars(many, new Map(many.map((k, i) => [k, i])), 8);
  assert.equal(folded.length, 8);
  assert.ok(folded[7].other);
  for (const b of folded) assert.ok(/^[\x20-\x7e]*$/.test(b.label));
});
