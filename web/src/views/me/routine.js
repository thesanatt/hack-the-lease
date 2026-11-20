// Pure helpers for the Me view: editing a week, the most likely week, and the sensitivity toggles.
// No React here, so `node --test` can check them.

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export const toSec = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 3600 + (m || 0) * 60;
};

export const hhmm = (s) => {
  if (s == null || !Number.isFinite(s)) return '--:--';
  const t = Math.round(s / 60);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// 13:05 style for people: "1:05 PM"
export const clock = (s) => {
  if (s == null || !Number.isFinite(s)) return '';
  const t = Math.round(s / 60), h24 = Math.floor(t / 60) % 24, m = t % 60;
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

export const minutes = (sec) => Math.round(sec / 60);

// Editable copy of a persona week. `on` is the editor's toggle.
export function editableWeek(persona) {
  return (persona?.week || []).map((e) => ({ ...e, days: [...e.days], alt: (e.alt || []).map((a) => ({ ...a })), on: e.on !== false }));
}

// The single most likely week: entries that happen with p >= 0.5, at their most likely place.
// alt[].p is read as the chance the entry is at that place instead of the main one.
export function modalPlace(e) {
  const alts = e.alt || [];
  const altSum = alts.reduce((s, a) => s + (a.p || 0), 0);
  let best = { place: e.place, p: 1 - altSum };
  for (const a of alts) if ((a.p || 0) > best.p) best = a;
  return best.place;
}

export function strip(e, place = e.place) {
  return { id: e.id, label: e.label, days: e.days, place, start: e.start, end: e.end };
}

export function modalRoutine(entries, modes) {
  const week = entries.filter((e) => e.on !== false && (e.p ?? 1) >= 0.5).map((e) => strip(e, modalPlace(e)));
  return { week, modes };
}

// The routine handed to week.sampleWeeks: every enabled entry with its p and alt.
export function uncertainRoutine(entries, modes) {
  const week = entries.filter((e) => e.on !== false).map((e) => ({
    id: e.id, label: e.label, days: e.days, place: e.place, start: e.start, end: e.end, p: e.p ?? 1, alt: e.alt || [],
  }));
  return { week, modes };
}

// The late lab: the entry that ends latest in the evening (at or after 18:00), preferring North Campus places.
export function lateEntry(entries, placeById) {
  let best = null, bestScore = -Infinity;
  for (const e of entries) {
    if (e.on === false) continue;
    const end = toSec(e.end);
    if (end < 18 * 3600) continue;
    const north = placeById?.get(e.place)?.area === 'North';
    const score = end + (north ? 24 * 3600 : 0) + (/lab/i.test(e.label) ? 12 * 3600 : 0);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// Move that entry to Central campus: an alt that is on Central if it has one, else the given default place.
export function moveToCentral(entries, entryId, placeById, fallback = 'chem') {
  return entries.map((e) => {
    if (e.id !== entryId) return e;
    const alt = (e.alt || []).find((a) => placeById?.get(a.place)?.area === 'Central');
    const place = alt?.place || fallback;
    return { ...e, place, alt: (e.alt || []).filter((a) => a.place !== place), movedFrom: e.place };
  });
}

export const TERM_CHOICES = {
  lease: { label: 'Whole lease (6 dates)', dates: null },
  sep: { label: 'September', dates: [{ date: '2026-09-15', w: 1 }] },
  dec: { label: 'December', dates: [{ date: '2026-12-01', w: 1 }] },
};

export function newJob(n, place = 'mainst') {
  return { id: `job${n}`, label: 'Job', days: ['sat'], place, start: '10:00', end: '16:00', p: 1, alt: [], on: true, added: true };
}

// Seeded logit draw for the demo auto-answer: P(A) = sigmoid((U_A - U_B) / tau).
export function autoAnswer(uA, uB, tau, u01) {
  const pA = 1 / (1 + Math.exp(-(uA - uB) / tau));
  return { choice: u01 < pA ? 'A' : 'B', pA };
}
