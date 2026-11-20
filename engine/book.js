// Book a tour: turn a tour slot from tours.js into a real calendar invite (.ics) and a prefilled email.
// Pure ES module, no DOM, no network. Quorum still sends nothing: the student opens the invite and hits send.
//
// nextDate(day, today)            -> 'YYYY-MM-DD', the first such weekday strictly after today
// slotDates(slots, today)         -> { day: 'Mon Nov 23' } labels, for tours.tourMessage({ dates })
// tourIcs({ slot, houseName, today, attendees?, description?, uid? }) -> iCalendar text (one VEVENT)
// mailtoHref({ to?, subject, body }) -> 'mailto:...' link (to is empty unless the student types one)
//
// Times are Ann Arbor local (TZID America/Detroit) with a VTIMEZONE block so calendar apps place them right.

import { TODAY } from './listing.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

const pad = (n) => String(n).padStart(2, '0');
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export function nextDate(day, today = TODAY) {
  const want = DAYS.indexOf(day);
  if (want < 0) throw new Error(`unknown day ${day}`);
  const t = parseISO(today);
  const ahead = ((want - t.getUTCDay() + 7) % 7) || 7;
  return iso(new Date(t.getTime() + ahead * 86400000));
}

export function slotDates(slots, today = TODAY) {
  const out = {};
  for (const s of slots || []) {
    const d = parseISO(nextDate(s.day, today));
    out[s.day] = `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  return out;
}

const stamp = (date, sec) => `${date.replace(/-/g, '')}T${pad(Math.floor(sec / 3600) % 24)}${pad(Math.floor((sec % 3600) / 60))}00`;

// RFC 5545 text escaping and 75-octet line folding.
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = [];
  let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ` ${s.slice(74)}`; }
  out.push(s);
  return out.join('\r\n');
}

const VTZ = [
  'BEGIN:VTIMEZONE', 'TZID:America/Detroit',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

export function tourIcs({ slot, houseName, today = TODAY, attendees = [], description = '', uid = null }) {
  if (!slot || !Number.isFinite(slot.start)) throw new Error('slot with start is required');
  const date = nextDate(slot.day, today);
  const end = Number.isFinite(slot.end) ? slot.end : slot.start + 1800;
  const who = attendees.length ? `With ${attendees.join(', ')}.` : '';
  const desc = [description, who, 'Made by Quorum. Nothing was sent for you.'].filter(Boolean).join('\n');
  const id = uid || `quorum-${slot.day}-${slot.start}-${String(houseName).toLowerCase().replace(/[^a-z0-9]+/g, '-')}@quorum.local`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Quorum//Hack the Lease//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...VTZ,
    'BEGIN:VEVENT',
    `UID:${id}`,
    `DTSTAMP:${today.replace(/-/g, '')}T000000Z`,
    `DTSTART;TZID=America/Detroit:${stamp(date, slot.start)}`,
    `DTEND;TZID=America/Detroit:${stamp(date, end)}`,
    `SUMMARY:${esc(`Tour: ${houseName}`)}`,
    `LOCATION:${esc(houseName)}`,
    `DESCRIPTION:${esc(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Tour in 30 minutes', 'TRIGGER:-PT30M', 'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function mailtoHref({ to = '', subject = '', body = '' }) {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${q}`;
}

export function slotLabel(slot, today = TODAY) {
  const d = parseISO(nextDate(slot.day, today));
  const h = Math.floor(slot.start / 3600), m = Math.floor((slot.start % 3600) / 60);
  return `${SHORT[slot.day]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
