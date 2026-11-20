import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readProfile, priorOverrides, redactContact, timesIn, daysIn, normalizeScheduleText } from '../engine/profile.js';

const places = JSON.parse(readFileSync(new URL('../web/public/data/places.json', import.meta.url)));
const personas = JSON.parse(readFileSync(new URL('../web/public/data/personas.json', import.meta.url)));
const read = (t) => readProfile(t, { places, personas });

test('profile: a paragraph gives places, days, times, modes, budget and wage', () => {
  const p = read("I'm studying Computer Science. I study late at the Duderstadt Center until midnight on Tuesdays and Thursdays. "
    + 'I work at a coffee shop in Kerrytown on weekends 9am-3pm, $16/hr. I don\'t bike. I don\'t like walking alone at night. '
    + 'Budget is around $950 a month.');
  assert.equal(p.program.id, 'engineering');
  const dude = p.entries.find((e) => e.place === 'dude');
  assert.deepEqual(dude.days, ['tue', 'thu']);
  assert.equal(dude.end, '23:59');
  assert.equal(dude.start, null, 'a start time that was not written is not guessed');
  const job = p.entries.find((e) => e.place === 'kerrytown');
  assert.deepEqual([job.days, job.start, job.end], [['sat', 'sun'], '09:00', '15:00']);
  assert.equal(p.modes.bike, false);
  assert.equal(p.modes.maxLateWalkMin, 6);
  assert.equal(p.budget, 950);
  assert.equal(p.wage, 16);
  assert.ok(!p.entries.some((e) => e.source === 'program'), 'the typical week is never added on its own');
  assert.ok(p.typical.length > 0, 'it is offered instead');
});

test('profile: schedule lines beat the typical week, and unknown rooms are listed, not guessed', () => {
  const p = read('Nursing student\nNURS 372 Mon 9:00-11:00 School of Nursing\nPNE 350 Tue Thu 6:30am-3:00pm University Hospital\nSTATS 250 Wed 1-2:30pm Room 1234');
  assert.equal(p.program.id, 'nursing');
  assert.ok(p.entries.some((e) => e.place === 'uh' && e.source === 'schedule' && e.start === '06:30'));
  assert.ok(!p.entries.some((e) => e.source === 'program'));
  assert.ok(p.unplaced.length >= 1);
});

test('profile: contact details are counted and dropped, links listed, demographics not read', () => {
  const t = 'Jamie, 20, from Ohio. jamie@umich.edu (734) 555-0100 https://github.com/jamie I bike everywhere.';
  const p = read(t);
  assert.deepEqual(p.kept, { emails: 1, phones: 1 });
  assert.equal(p.links[0].host, 'github.com');
  assert.equal(p.modes.bike, true);
  assert.ok(!redactContact(t).includes('umich.edu'));
  assert.ok(!('age' in p) && !('gender' in p));
});

test('profile: likes shift the prior; a wage sets the value of time', () => {
  const p = read('I want my own bathroom and lots of natural light. I tutor for $20/hour.');
  const { wage, overrides } = priorOverrides(p);
  assert.equal(wage, 20);
  assert.equal(overrides.wBath.median, 150);
  assert.equal(overrides.wLight.median, 50);
});

test('profile: time and day phrases', () => {
  assert.deepEqual(timesIn('6-10pm'), { start: '18:00', end: '22:00', explicit: true });
  assert.deepEqual(timesIn('from 7 to 11 pm'), { start: '19:00', end: '23:00', explicit: true });
  assert.equal(timesIn('until 1am')?.end, '01:00');
  assert.deepEqual(daysIn('MWF'), ['mon', 'wed', 'fri']);
  assert.deepEqual(daysIn('weekends'), ['sat', 'sun']);
  assert.deepEqual(read('').entries, []);
});

test('profile: where they want to live, room size and group size', () => {
  const p = read('Ross BBA student. I prefer living close to downtown, with a room over 150 square feet. Moving in with 2 friends.');
  assert.equal(p.program.id, 'business');
  assert.deepEqual(p.near.map((n) => n.place), ['mainst']);
  assert.equal(p.minSqft, 150);
  assert.equal(p.groupSize, 3);
  assert.equal(read('near North Campus please').near[0].place, 'pierpont');
  assert.equal(read('walking distance to the UgLi').near[0].place, 'ugli');
});

test('profile: courses become classes with only the days and times written', () => {
  const a = read('i take eecs280');
  assert.deepEqual(a.entries.map((e) => [e.label, e.place, e.days.length, e.start]), [['EECS 280', 'eecs', 0, null]]);
  const b = read('EECS 280 MW 10:30-12, physics 240 TTh 1-2:30pm, Math 214 MWF 9-10am at Angell Hall');
  assert.deepEqual(b.entries.map((e) => [e.label, e.days.join(''), e.start, e.end, e.placeGuessed]),
    [['EECS 280', 'monwed', '10:30', '12:00', true], ['PHYSICS 240', 'tuethu', '13:00', '14:30', true], ['MATH 214', 'monwedfri', '09:00', '10:00', false]]);
  const c = read('im a law student');
  assert.deepEqual(c.entries, []);
  assert.equal(c.program.id, 'law');
  assert.ok(c.typical.length > 0);
});

test('profile: a schedule screenshot, as text recognition reads it', () => {
  const ocr = ['My Class Schedule - Fall 2026', 'EECS 280 - Prog&Data Struct', 'Section Component Days & Times Room Instructor',
    '001 LEC MoWe 10:30AM - 12:00PM 1670 BBB Staff', '021 DIS Fr 1:30PM - 2:30PM 1005 EECS Staff',
    'PHYSICS 240 - General Physics I', 'Section Component Days & Times Room Instructor',
    '100 LEC MoWeFr 2:00PM - 3:00PM 170 DENN Staff', '12 LAB Th 6:00PM - 8:00PM 1416 CHEM Staff'].join('\n');
  const p = read(normalizeScheduleText(ocr));
  assert.deepEqual(p.entries.map((e) => [e.label, e.days.join(''), e.start, e.end, e.place]), [
    ['EECS 280', 'monwed', '10:30', '12:00', 'beyster'], ['EECS 280 discussion', 'fri', '13:30', '14:30', 'eecs'],
    ['PHYSICS 240', 'monwedfri', '14:00', '15:00', 'angell'], ['PHYSICS 240 lab', 'thu', '18:00', '20:00', 'chem']]);
});
