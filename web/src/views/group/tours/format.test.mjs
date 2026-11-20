// Formatting for the "Tour it together" panel. Fixtures are SAMPLE trips, not engine output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clock12, howOf, memberLine, dayReason } from './format.js';

const ascii = (s) => /^[\x20-\x7e]*$/.test(s);
const place = (id) => ({ eecs: 'EECS Building', h1: 'Sample house' }[id] || id);

test('clock12', () => {
  assert.equal(clock12(9 * 3600), '9:00 am');
  assert.equal(clock12(12 * 3600 + 1800), '12:30 pm');
  assert.equal(clock12(18 * 3600 + 1800), '6:30 pm');
  assert.equal(clock12(NaN), '');
});

test('memberLine names mode, routes, minutes, origin and the next stop', () => {
  const r = {
    id: 'a', name: 'A', origin: 'eecs', originKind: 'previous',
    to: { from: 'eecs', to: 'h1', mode: 'bus', min: 24, routes: ['DD'], depart: 16 * 3600 + 33 * 60 },
    back: { from: 'h1', to: 'eecs', mode: 'walk', min: 9, routes: [], nextLabel: 'Choir', bufferMin: 4 },
  };
  const line = memberLine(r, place);
  assert.equal(line, 'Bus DD, 24 min from EECS Building, leaves 4:33 pm; then walk, 9 min to Choir, 4 min to spare');
  assert.ok(ascii(line));
  assert.equal(howOf({ mode: 'bus', routes: ['4', '5'] }), 'bus 4 then 5');
  const usual = memberLine({ ...r, originKind: 'usual', back: null, to: { ...r.to, mode: 'bike', routes: [] } }, place);
  assert.ok(usual.startsWith('Bike, 24 min from EECS Building (usual place, free day)'));
});

test('dayReason explains a weekday in plain words', () => {
  const names = { a: 'Ana', b: 'Ben' };
  assert.equal(dayReason({ slots: 20, free: 0, feasible: 0, busy: { a: 20, b: 3 }, cannotReach: {} }, names, 2),
    'No half-hour when all 2 are free. Busiest: Ana and Ben.');
  assert.equal(dayReason({ slots: 20, free: 2, feasible: 0, busy: {}, cannotReach: { b: 2 } }, names, 2),
    'All 2 are free for 2 half-hours, but Ben cannot get there and back in time.');
  assert.equal(dayReason({ slots: 20, free: 5, feasible: 4, busy: {}, cannotReach: {} }, names, 2),
    '4 of 20 half-hours work for all 2.');
});
