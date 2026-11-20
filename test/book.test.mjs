// book.js: tour slot -> calendar invite and prefilled email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDate, slotDates, tourIcs, mailtoHref, slotLabel } from '../engine/book.js';

test('nextDate picks the next such weekday, never today', () => {
  // 2026-11-20 is a Friday
  assert.equal(nextDate('fri', '2026-11-20'), '2026-11-27');
  assert.equal(nextDate('mon', '2026-11-20'), '2026-11-23');
  assert.equal(nextDate('sat', '2026-11-20'), '2026-11-21');
  assert.equal(nextDate('wed', '2026-12-30'), '2027-01-06');
});

test('slotDates labels feed tourMessage', () => {
  assert.deepEqual(slotDates([{ day: 'tue', start: 0 }], '2026-11-20'), { tue: 'Nov 24' });
});

test('tourIcs is a valid single event at Ann Arbor local time', () => {
  const ics = tourIcs({ slot: { day: 'tue', start: 16 * 3600, end: 16.5 * 3600 }, houseName: 'Hill St, Room 2', today: '2026-11-20', attendees: ['Ana', 'Ben'] });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;TZID=America\/Detroit:20261124T160000/);
  assert.match(ics, /DTEND;TZID=America\/Detroit:20261124T163000/);
  assert.match(ics, /SUMMARY:Tour: Hill St\\, Room 2/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1);
  for (const line of ics.split('\r\n')) assert.ok(line.length <= 75, `line too long: ${line}`);
});

test('mailtoHref encodes subject and body, empty to by default', () => {
  const h = mailtoHref({ subject: 'Tour?', body: 'a & b\nc' });
  assert.equal(h, 'mailto:?subject=Tour%3F&body=a%20%26%20b%0Ac');
  assert.match(mailtoHref({ to: 'x@y.com', subject: 's' }), /^mailto:x@y\.com\?/);
});

test('slotLabel', () => {
  assert.equal(slotLabel({ day: 'mon', start: 9.5 * 3600 }, '2026-11-20'), 'Mon Nov 23, 9:30 AM');
});
