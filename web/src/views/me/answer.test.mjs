// Plain-words answers for simple mode: every clause must come from the note or the week.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortName, nightCounts, answerFor, plainReason, plainTradeoff } from './answer.js';

const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

test('shortName drops the kind of building and the bed count', () => {
  assert.equal(shortName('Broadway St house, 5 bed'), 'Broadway St');
  assert.equal(shortName('Washtenaw Ct apartment, 2 bed'), 'Washtenaw Ct');
  assert.equal(shortName(''), '');
});

test('nightCounts counts days, and a no-ride day is not also a dark day', () => {
  const week = { trips: [
    { day: 'tue', stranded: true, darkMin: 10 }, { day: 'tue', darkMin: 4 },
    { day: 'thu', darkMin: 6 }, { day: 'fri', darkMin: 0.2 }, { day: 'mon' },
  ] };
  assert.deepEqual(nightCounts(week), { noRide: 1, dark: 2, any: 2 });
  assert.deepEqual(nightCounts(null), { noRide: 0, dark: 0, any: 0 });
});

test('answer: a good reason and no dark nights', () => {
  const a = answerFor({ name: 'Broadway St house, 5 bed', note: { fits: [{ key: 'time', dollars: 30 }] }, week: { trips: [{ day: 'mon' }] } });
  assert.equal(a.lead, 'Live at Broadway St.');
  assert.equal(a.rest, 'Your trips are shorter than most, and you never walk in the dark.');
});

test('answer: dark nights are said, no-ride nights first', () => {
  const note = { fits: [{ key: 'rent', dollars: 178 }] };
  const dark = answerFor({ name: 'X St house', note, week: { trips: [{ day: 'tue', darkMin: 9 }, { day: 'thu', darkMin: 9 }] } });
  assert.equal(dark.rest, 'The rent is lower than most, but you walk in the dark two nights a week.');
  const stuck = answerFor({ name: 'X St house', note, week: { trips: [{ day: 'tue', stranded: true }] } });
  assert.equal(stuck.rest, 'The rent is lower than most, but you get stuck without a ride one night a week.');
});

test('answer: skips night reasons, relative-to-another-home reasons and bad ones', () => {
  const note = { fits: [{ key: 'dark', dollars: 50 }, { key: 'size', dollars: 5, vs: 'h2' }, { key: 'rent', dollars: -3 }] };
  const a = answerFor({ name: 'Y St apartment, 1 bed', note, week: { trips: [] } });
  assert.equal(a.rest, 'It fits your week best, and you never walk in the dark.');
  assert.equal(answerFor({ name: 'Y', note: null, week: null }).rest, 'It fits your week best.');
});

test('plain reasons and the trade-off sentence carry no number but the one that decides', () => {
  assert.equal(plainReason('rent', true, 'Lower rent'), 'Lower rent than a typical home');
  assert.equal(plainReason('bath', true, 'Private bathroom'), 'Private bathroom');
  const top = { id: 'a', name: 'Broadway St house, 5 bed', x: 1351, y: 4.4 };
  const cheap = { id: 'b', name: 'Georgetown Blvd house, 5 bed', x: 1538, y: 4.6 };
  assert.equal(plainTradeoff(top, cheap, money), 'The cheapest rent, at Georgetown Blvd, ends up costing you $187 a month more than Broadway St.');
  assert.equal(plainTradeoff(top, top, money), 'Broadway St also has the cheapest rent.');
  assert.match(plainTradeoff(top, { ...cheap, x: 1351.5, y: 5 }, money), /about the same as Broadway St, with longer trips/);
});
