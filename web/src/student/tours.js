// Tours for one student and one liked home: open 30 minute slots (engine/tours.js on the real timetables:
// free, can get there from where they are just before, and on to their next entry in time), the date the slot
// falls on next, a calendar file for it, and the message to the landlord. Quorum sends nothing unless the
// student presses Send (only shown when the server has an email key, see web/api.mjs).
import { useEffect, useState } from 'react';

const TKEY = 'quorum.tours.v1';
const EVT = 'quorum-store';
const read = () => { try { return JSON.parse(localStorage.getItem(TKEY)) || []; } catch { return mem; } };
let mem = [];
const write = (v) => { mem = v; try { localStorage.setItem(TKEY, JSON.stringify(v)); } catch { /* memory only */ } window.dispatchEvent(new Event(EVT)); };

export function useTours() {
  const [list, setList] = useState(read);
  useEffect(() => {
    const on = () => setList(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return {
    list,
    forHome: (id) => list.find((t) => t.homeId === id) || null,
    book: (t) => write([...read().filter((x) => x.homeId !== t.homeId), t]),
    cancel: (homeId) => write(read().filter((x) => x.homeId !== homeId)),
    replace: (list) => write(list),
  };
}

const toMinS = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (h * 60 + m) * 60; };
const DAY_IX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
// U-M breaks, inclusive ISO dates: no tours offered, the slot rolls to the same weekday the week after.
// Thanksgiving break 2026 is Wed Nov 25 to Sun Nov 29.
export const BREAKS = [{ name: 'Thanksgiving break', from: '2026-11-25', to: '2026-11-29' }];
const inBreak = (d) => { const s = iso(d); return BREAKS.some((b) => s >= b.from && s <= b.to); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The next date (after today) that falls on this weekday.
export function nextDate(day, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  for (let i = 0; i < 21; i++) {
    if (d.getDay() === DAY_IX[day] && !inBreak(d)) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}
export const dateLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const hm = (sec) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
export const clock12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// Open slots for one home. Booked tours of other homes count as busy.
export function tourOptions(api, profile, home, booked = []) {
  const tours = api.mod('tours');
  if (!tours?.findTourSlots || !profile?.entries?.length) return null;
  const busy = booked.filter((t) => t.homeId !== home.id).map((t) => ({ days: [t.day], place: t.homeId, start: t.start, end: t.end, label: t.label }));
  const routine = { week: [...profile.entries.map((e) => ({ days: e.days, place: e.place, start: e.start, end: e.end, label: e.label })), ...busy], modes: profile.modes };
  const members = [{ id: 'me', name: 'You', routine }];
  const args = { house: { id: home.id, lat: home.lat, lon: home.lon, name: home.name }, members, places: api.data.places, cfg: api.config };
  const best = tours.findTourSlots(api.planner, args);
  const all = tours.findTourSlots(api.planner, { ...args, opts: { top: 1000, gapMin: 0 } });
  const key = (x) => `${x.day}-${x.start}`;
  const rank = new Map(best.slots.filter((x) => !(profile.timeOnly || []).some((e) => e.days.includes(x.day) && toMinS(e.start) < x.end && toMinS(e.end) > x.start)).map((x, i) => [key(x), i + 1]));
  // time-only events (no building) still make the student busy
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const blocked = (day, s0, e0) => (profile.timeOnly || []).some((e) => e.days.includes(day) && toMin(e.start) < e0 && toMin(e.end) > s0);
  const options = all.slots.filter((x) => !blocked(x.day, x.start / 60, x.end / 60)).map((x) => ({
    key: key(x), day: x.day, start: hm(x.start), end: hm(x.end), rank: rank.get(key(x)) || null,
    to: x.members[0]?.to || null, back: x.members[0]?.back || null,
  }));
  return { options, best: options.filter((o) => o.rank).sort((a, b) => a.rank - b.rank), checked: all.checked };
}

const placeName = (api, id) => {
  const p = api.data.placeById.get(id); if (p) return p.label.replace(/\s*\(.*?\)\s*/g, '');
  return api.data.homeById.get(id)?.name || id;
};
// "Leave EECS Building at 4:37 PM, bus 23, there at 4:58 PM"
export function tripText(api, t, toHome) {
  if (!t) return null;
  const how = t.mode === 'bus' ? `bus ${t.routes.join(' then ')}` : t.mode === 'bike' ? 'by bike' : 'walk';
  return toHome
    ? `Leave ${placeName(api, t.from)} at ${clock12(t.departHM)}, ${how}, there at ${clock12(t.arriveHM)}`
    : `Then ${how} to ${placeName(api, t.to)}, there at ${clock12(t.arriveHM)}`;
}

// A one-event calendar file the student can open in their own calendar app.
export function tourIcs({ home, date, start, end, note }) {
  const d = iso(date).replace(/-/g, '');
  const t = (x) => `${x.replace(':', '')}00`;
  const esc = (s) => String(s).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Quorum//Tour//EN', 'BEGIN:VEVENT',
    `UID:tour-${home.id}-${d}@quorum.invalid`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;TZID=America/Detroit:${d}T${t(start)}`, `DTEND;TZID=America/Detroit:${d}T${t(end)}`,
    `SUMMARY:${esc(`Tour: ${home.name} (sample listing)`)}`, `LOCATION:${esc(home.street ? `${home.street}, Ann Arbor, MI` : home.name)}`,
    `DESCRIPTION:${esc(note || '')}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

export function download(name, text, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The first message to the landlord, from the profile: move-in, the questions that matter to this student, and
// the tour time when one is booked. Plain text; the student copies it or opens it in their own mail app.
export function landlordMessage({ home, details, profile, tour }) {
  const notes = new Set((profile?.notes || []).map((n) => n.key));
  const qs = [];
  if (details?.available) qs.push(`Is it still available for move-in on ${details.available.replace(/, \d{4}$/, '')}?`);
  if (profile?.budget) qs.push(`Is any room available for ${'$'}${profile.budget.toLocaleString('en-US')} a month or less, including utilities?`);
  if (notes.has('pet')) qs.push('Are pets allowed, and is there a pet deposit?');
  if (notes.has('car')) qs.push('Is there a parking spot I could rent?');
  if (notes.has('quiet')) qs.push('How quiet is the street in the evenings?');
  if (notes.has('roommates') || profile?.groupSize) qs.push(`Can ${profile?.groupSize ? `${profile.groupSize} of us` : 'a group'} rent it together?`);
  if (!qs.length) qs.push('What is included in the rent, and what is the deposit?');
  const when = tour ? `\nCould I tour it on ${dateLabel(new Date(tour.date))} at ${clock12(tour.start)}? Another time works too.\n` : '\nWhen could I come by for a tour?\n';
  return `Hello,\n\nI am a University of Michigan student and saw your listing for ${home.name.replace(/, \d+ bed$/, '')}.\n\n${qs.map((q) => `- ${q}`).join('\n')}\n${when}\nThank you!`;
}
