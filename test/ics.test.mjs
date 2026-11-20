// ics.js: iCalendar parsing, time zones, weekly rules, place matching, pasted lines, editor entries.
// Calendar text here is SAMPLE text written for the tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  unfold, parseICS, parseLines, parseSchedule, matchPlace, toWeekEntries, PLACE_ALIASES, shortLabel, zonedToUtc,
} from '../engine/ics.js';

const places = JSON.parse(readFileSync(new URL('../web/public/data/places.json', import.meta.url), 'utf8'));
const placeIds = new Set(places.map((p) => p.id));

const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const vevent = (...props) => ['BEGIN:VEVENT', ...props, 'END:VEVENT'];
const one = (text) => {
  const r = parseICS(text, places);
  assert.equal(r.items.length, 1, JSON.stringify(r));
  return r.items[0];
};

test('unfold joins continuation lines and handles CRLF', () => {
  assert.deepEqual(unfold('A:one\r\n two\r\nB:x\n\tyz'), ['A:onetwo', 'B:xyz']);
});

test('weekly RRULE with BYDAY and TZID America/Detroit keeps wall time', () => {
  const it = one(cal(vevent(
    'DTSTART;TZID=America/Detroit:20260831T103000', 'DTEND;TZID=America/Detroit:20260831T120000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261210T045959Z', 'SUMMARY:EECS 482 lecture', 'LOCATION:1670 BBB',
  )));
  assert.deepEqual(it.days, ['mon', 'wed']);
  assert.equal(it.start, '10:30');
  assert.equal(it.end, '12:00');
  assert.equal(it.label, 'EECS 482 lecture');
  assert.equal(it.place, 'beyster');
  assert.equal(it.source, 'weekly');
});

test('UTC times convert to Ann Arbor time in daylight and standard time', () => {
  const edt = one(cal(vevent('DTSTART:20260901T170000Z', 'DTEND:20260901T210000Z', 'SUMMARY:Team', 'LOCATION:FMCRB')));
  assert.equal(edt.start, '13:00'); // UTC-4 in September
  assert.equal(edt.end, '17:00');
  assert.deepEqual(edt.days, ['tue']);
  const est = one(cal(vevent('DTSTART:20261201T140000Z', 'DTEND:20261201T153000Z', 'SUMMARY:Class', 'LOCATION:EECS')));
  assert.equal(est.start, '09:00'); // UTC-5 in December
  assert.equal(est.end, '10:30');
});

test('a UTC start that is the next day in UTC moves BYDAY back to the local day', () => {
  // 03:00Z Wednesday Dec 2 is 22:00 Tuesday Dec 1 in Ann Arbor
  const it = one(cal(vevent(
    'DTSTART:20261202T030000Z', 'DTEND:20261202T043000Z', 'RRULE:FREQ=WEEKLY;BYDAY=WE,FR', 'SUMMARY:Late lab', 'LOCATION:Duderstadt Center',
  )));
  assert.deepEqual(it.days, ['tue', 'thu']);
  assert.equal(it.start, '22:00');
  assert.equal(it.end, '23:30');
});

test('other time zones and Windows zone names convert', () => {
  const la = one(cal(vevent('DTSTART;TZID=America/Los_Angeles:20261201T070000', 'DTEND;TZID=America/Los_Angeles:20261201T080000', 'SUMMARY:Call', 'LOCATION:Dude')));
  assert.equal(la.start, '10:00');
  const win = one(cal(vevent('DTSTART;TZID="Eastern Standard Time":20261201T090000', 'DTEND;TZID="Eastern Standard Time":20261201T100000', 'SUMMARY:Class', 'LOCATION:Chem')));
  assert.equal(win.start, '09:00');
  assert.equal(win.place, 'chem');
  const unknown = one(cal(vevent('DTSTART;TZID=Mars/Olympus:20261201T090000', 'DTEND;TZID=Mars/Olympus:20261201T100000', 'SUMMARY:Class', 'LOCATION:Chem')));
  assert.equal(unknown.start, '09:00');
  assert.match(unknown.notes.join(' '), /Unknown time zone/);
});

test('zonedToUtc is exact across the fall DST change', () => {
  assert.equal(new Date(zonedToUtc(2026, 10, 31, 12, 0, 0, 'America/Detroit')).toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(new Date(zonedToUtc(2026, 11, 2, 12, 0, 0, 'America/Detroit')).toISOString(), '2026-11-02T17:00:00.000Z');
});

test('single events go to their weekday and repeats of one event merge', () => {
  const r = parseICS(cal(
    vevent('DTSTART:20260911T130000', 'DTEND:20260911T143000', 'SUMMARY:Office hours', 'LOCATION:GG Brown 1504'),
    vevent('DTSTART:20260915T130000', 'DTEND:20260915T143000', 'SUMMARY:Office hours', 'LOCATION:GG Brown 1504'),
    vevent('DTSTART:20260918T130000', 'DTEND:20260918T143000', 'SUMMARY:Office hours', 'LOCATION:GG Brown 1504'),
  ), places);
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.items[0].days, ['tue', 'fri']);
  assert.equal(r.items[0].source, 'single');
  assert.equal(r.items[0].place, 'ggbrown');
});

test('escaped text, DURATION, nested VALARM', () => {
  const it = one(cal(vevent(
    'DTSTART:20261201T190000', 'DURATION:PT2H30M', 'SUMMARY:Lab\\, part 2', 'LOCATION:Duderstadt Center (the Dude)\\, Room 1180',
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'SUMMARY:not this one', 'END:VALARM',
  )));
  assert.equal(it.label, 'Lab, part 2');
  assert.equal(it.end, '21:30');
  assert.equal(it.place, 'dude');
});

test('all-day, cancelled, monthly and past-midnight events are handled honestly', () => {
  const r = parseICS(cal(
    vevent('DTSTART;VALUE=DATE:20261019', 'DTEND;VALUE=DATE:20261020', 'SUMMARY:Break'),
    vevent('DTSTART:20261201T090000', 'DTEND:20261201T100000', 'STATUS:CANCELLED', 'SUMMARY:Gone'),
    vevent('DTSTART:20261201T090000', 'DTEND:20261201T100000', 'RRULE:FREQ=MONTHLY', 'SUMMARY:Club'),
    vevent('DTSTART:20261201T230000', 'DTEND:20261202T010000', 'SUMMARY:Night shift', 'LOCATION:UH'),
  ), places);
  assert.deepEqual(r.skipped.map((s) => s.label), ['Break', 'Gone', 'Club']);
  assert.match(r.skipped[0].reason, /all-day/);
  assert.match(r.skipped[2].reason, /monthly/);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].end, '23:59');
  assert.equal(r.items[0].place, 'uh');
  assert.match(r.items[0].notes.join(' '), /midnight/);
});

test('text that is not a calendar says so', () => {
  const r = parseICS('hello', places);
  assert.equal(r.items.length, 0);
  assert.match(r.warnings[0], /not an iCalendar/);
});

test('every alias points at a real place', () => {
  for (const a of PLACE_ALIASES) assert.ok(placeIds.has(a.id), a.id);
});

test('common U-M names and abbreviations match', () => {
  const cases = {
    'BBB 1670': 'beyster', '1500 EECS': 'eecs', 'Dude': 'dude', 'UgLi': 'ugli', 'Shapiro 2160': 'ugli',
    'Hatcher North': 'hatcher', 'Angell Hall Aud A': 'angell', 'G115 AH': 'angell', 'Chem 1800': 'chem',
    'Ross R2240': 'ross', 'NIB 1240': 'nursing', 'UH 2A': 'uh', 'Mott 7th floor': 'mott', 'NCRB': 'ncrb',
    'IMSB': 'imsb', 'Pierpont Commons': 'pierpont', 'GG Brown 1504': 'ggbrown', 'G.G. Brown': 'ggbrown',
    'FMCRB 2300': 'fmcrb', 'Moore 2033': 'music', 'Earl V. Moore Building': 'music', 'Michigan Union': 'union',
    'Hutchins Hall 100': 'law', 'Hill Aud': 'hill', 'CCRB': 'ccrb', 'Taubman Library': 'thsl', 'eecs': 'eecs',
  };
  for (const [loc, id] of Object.entries(cases)) assert.equal(matchPlace(loc, places).place, id, loc);
});

test('unknown or ambiguous locations are not guessed', () => {
  for (const loc of ['1013 Dow', 'Mason Hall', 'Zoom', '', 'Chrysler Center']) assert.equal(matchPlace(loc, places).place, null, loc);
  const amb = matchPlace('Angell or Chem', places);
  assert.equal(amb.place, null);
  assert.deepEqual(amb.candidates.sort(), ['angell', 'chem']);
  // lowercase "ah" or "uh" in a sentence is not a building code
  assert.equal(matchPlace('uh, somewhere', places).place, null);
});

test('pasted lines: days, times and places', () => {
  const r = parseLines([
    'Mon Wed Fri 9:00-10:30 EECS',
    'EECS 482 lecture, Mon Wed 10:30-12:00, BBB 1670',
    'TTh 1:30-3 Chem 1800',
    'Mon-Fri 8am-9am gym @ CCRB',
    'Gym Saturday 11-12:30pm NCRB',
    'Lab Tu Th 7pm-11:30pm Duderstadt Center',
    'MWF 10-11 Mason Hall',
    'this line has no time',
    'Wed 3pm-4pm',
  ].join('\n'), places);
  const by = Object.fromEntries(r.items.map((i) => [i.label, i]));
  assert.deepEqual(by.EECS.days, ['mon', 'wed', 'fri']);
  assert.equal(by.EECS.start, '09:00');
  assert.equal(by.EECS.end, '10:30');
  assert.equal(by.EECS.place, 'eecs');
  assert.equal(by['EECS 482 lecture'].place, 'beyster');
  assert.equal(by['Chem 1800'].start, '13:30');
  assert.equal(by['Chem 1800'].end, '15:00');
  assert.ok(by['Chem 1800'].notes.length, 'afternoon assumption is noted');
  assert.deepEqual(by.gym.days, ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.equal(by.gym.place, 'ccrb');
  assert.equal(by.Gym.start, '11:00');
  assert.equal(by.Gym.end, '12:30');
  assert.equal(by.Gym.place, 'ncrb');
  assert.deepEqual(by.Lab.days, ['tue', 'thu']);
  assert.equal(by.Lab.end, '23:30');
  assert.equal(by.Lab.place, 'dude');
  assert.equal(by['Mason Hall'].place, null);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /time range/);
  const noPlace = r.items.find((i) => i.start === '15:00');
  assert.equal(noPlace.place, null);
  assert.equal(noPlace.label, 'Class');
});

test('parseSchedule picks the right parser', () => {
  assert.equal(parseSchedule('Mon 9-10 EECS', places).items[0].source, 'line');
  assert.equal(parseSchedule(cal(vevent('DTSTART:20261201T090000', 'DTEND:20261201T100000', 'SUMMARY:x', 'LOCATION:EECS')), places).items[0].source, 'single');
});

test('toWeekEntries gives unique ids, drops unmatched, takes resolved places', () => {
  const { items } = parseLines('Mon 9-10 EECS\nTue 9-10 Mason Hall\nWed 9-10 Chem', places);
  const plain = toWeekEntries(items, ['cal1', 'j1']);
  assert.deepEqual(plain.map((e) => e.id), ['cal2', 'cal3']);
  assert.ok(plain.every((e) => e.p === 1 && e.on && e.added && placeIds.has(e.place)));
  const mason = items.find((i) => i.place === null);
  const resolved = toWeekEntries(items, [], new Map([[mason.key, 'angell']]));
  assert.equal(resolved.length, 3);
  assert.equal(resolved.find((e) => e.label === 'Mason Hall').place, 'angell');
  const some = toWeekEntries(items, [], new Map(), new Set([items[0].key]));
  assert.equal(some.length, 1);
});

test('shortLabel cuts long labels at a word', () => {
  assert.equal(shortLabel('Late lab block for EECS 482 projects (often runs late)'), 'Late lab block for EECS 482 projects');
  assert.equal(shortLabel('Gym'), 'Gym');
});

test('the SYNTHETIC sample file parses into a North Campus week with one place to resolve', () => {
  const text = readFileSync(new URL('../web/public/samples/sample_week.ics', import.meta.url), 'utf8');
  assert.match(text, /SYNTHETIC/);
  const r = parseICS(text, places);
  assert.equal(r.items.length, 7);
  assert.deepEqual(r.items.filter((i) => !i.place).map((i) => i.location), ['1013 Dow']);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['all-day event']);
  const lab = r.items.find((i) => i.label === 'Late lab');
  assert.deepEqual(lab.days, ['tue', 'thu']);
  assert.equal(lab.end, '23:30');
  assert.equal(lab.place, 'dude');
  const team = r.items.find((i) => i.label === 'Robotics project team');
  assert.equal(team.start, '13:00');
  for (const i of r.items) assert.ok(/^\d\d:\d\d$/.test(i.start) && /^\d\d:\d\d$/.test(i.end));
});
