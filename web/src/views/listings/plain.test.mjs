import test from 'node:test';
import assert from 'node:assert/strict';
import { fitLine, missingLine, answerSentence } from './plain.js';

const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

test('fitLine names the strongest and the weakest category in words', () => {
  assert.equal(fitLine({ fit: 64, price: 100, around: 10, nights: 50, dates: 100 }), 'Low rent, but long trips.');
  assert.equal(fitLine({ fit: 100, price: 90, around: 80, nights: 100, dates: 100 }), 'Good on every count here.');
  assert.equal(fitLine({ fit: 50, price: 50, around: 50, nights: 50, dates: 100 }), 'In the middle on rent and trips.');
  assert.equal(fitLine({ fit: 40, price: 50, around: 50, nights: 0, dates: 100 }), 'Watch out: hard trips home at night.');
  assert.equal(fitLine({ fit: 70, price: 50, around: 90, nights: 50, dates: 50 }), 'Short trips, no big downside. Check the dates.');
});

test('fitLine uses the cover note when the dates miss the semester', () => {
  assert.equal(fitLine({ fit: 0, price: 100, around: 0, nights: 0, dates: 0 }, { ok: false, note: 'starts May 1: summer only' }),
    'Starts May 1: summer only.');
  assert.equal(fitLine(null, null), null);
  assert.equal(fitLine({ fit: 0, dates: 0 }), 'Misses the semester you need.');
});

test('missingLine says what to add', () => {
  assert.equal(missingLine({ rent: NaN }, true), 'Add the rent to see its Fit.');
  assert.equal(missingLine({ rent: 800 }, false), 'Drop a pin to see its Fit.');
  assert.equal(missingLine({ rent: 800 }, true), null);
});

test('answerSentence: best usable post against the best sample home', () => {
  const rows = [
    { kind: 'post', id: 'p2', name: 'Catherine St', cost: 1284 },
    { kind: 'post', id: 'p1', name: 'Hill St', cost: 1250 },
    { kind: 'home', id: 'h1', name: 'Broadway St house, 5 bed', cost: 1351 },
  ].sort((a, b) => a.cost - b.cost);
  const cover = { p1: { ok: false }, p2: { ok: true } };
  const end = { p2: '2027-04-30' };
  const opts = { coverOf: (r) => cover[r.id], endOf: (r) => end[r.id], semLabel: 'Winter 2027' };
  assert.equal(answerSentence(rows, money, opts),
    'Your best find is Catherine St: it costs you $67 a month less than the best sample home, but it ends in April.');
  const none = { ...opts, coverOf: () => ({ ok: false }), semLabel: 'Fall 2027' };
  assert.equal(answerSentence(rows, money, none), 'None of your posts covers Fall 2027, so Broadway St house, 5 bed is still your best bet.');
  const worse = [{ kind: 'home', id: 'h1', name: 'Broadway St house, 5 bed', cost: 1200 }, { kind: 'post', id: 'p2', name: 'Catherine St', cost: 1284 }];
  assert.equal(answerSentence(worse, money, opts), 'Your best post is Catherine St, but Broadway St house, 5 bed costs you $84 a month less.');
  assert.equal(answerSentence([{ kind: 'home', name: 'x', cost: 1 }], money, opts), null);
});
