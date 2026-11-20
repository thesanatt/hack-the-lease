import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSec, hhmm, modalPlace, modalRoutine, uncertainRoutine, lateEntry, moveToCentral, autoAnswer, editableWeek } from './routine.js';

const places = new Map([
  ['ggbrown', { area: 'North' }], ['eecs', { area: 'North' }], ['chem', { area: 'Central' }], ['angell', { area: 'Central' }],
]);
const week = [
  { id: 'e1', label: 'Lecture', days: ['mon'], place: 'eecs', start: '10:30', end: '12:00', p: 1, alt: [] },
  { id: 'e3', label: 'Late lab', days: ['wed'], place: 'ggbrown', start: '19:00', end: '22:30', p: 0.8, alt: [{ place: 'chem', p: 0.3 }] },
  { id: 'e4', label: 'Maybe', days: ['tue'], place: 'angell', start: '13:00', end: '14:00', p: 0.4, alt: [] },
  { id: 'e5', label: 'Moved', days: ['thu'], place: 'eecs', start: '13:00', end: '14:00', p: 1, alt: [{ place: 'chem', p: 0.6 }] },
];

test('time helpers round trip', () => {
  assert.equal(toSec('19:05'), 19 * 3600 + 300);
  assert.equal(hhmm(toSec('07:45')), '07:45');
  assert.equal(hhmm(25 * 3600), '01:00');
});

test('modal week keeps likely entries at their likely place', () => {
  assert.equal(modalPlace(week[1]), 'ggbrown');
  assert.equal(modalPlace(week[3]), 'chem');
  const r = modalRoutine(editableWeek({ week }), { bike: false });
  assert.deepEqual(r.week.map((e) => e.id), ['e1', 'e3', 'e5']);
  assert.ok(r.week.every((e) => !('p' in e) && !('alt' in e)));
});

test('toggled-off entries leave both routines', () => {
  const ed = editableWeek({ week }).map((e) => (e.id === 'e1' ? { ...e, on: false } : e));
  assert.ok(!modalRoutine(ed, {}).week.some((e) => e.id === 'e1'));
  assert.ok(!uncertainRoutine(ed, {}).week.some((e) => e.id === 'e1'));
});

test('late lab is found and moves to Central', () => {
  const lab = lateEntry(week, places);
  assert.equal(lab.id, 'e3');
  const moved = moveToCentral(week, 'e3', places);
  const e = moved.find((x) => x.id === 'e3');
  assert.equal(e.place, 'chem');
  assert.equal(e.movedFrom, 'ggbrown');
  assert.equal(e.alt.length, 0);
});

test('auto answer follows the logit', () => {
  assert.equal(autoAnswer(100, 0, 25, 0.9).choice, 'A');
  assert.equal(autoAnswer(0, 100, 25, 0.1).choice, 'B');
  assert.ok(Math.abs(autoAnswer(5, 5, 25, 0.5).pA - 0.5) < 1e-12);
});
