// Profile reader: turns what a student writes or uploads (resume text, notes, a pasted class schedule, a
// calendar file, links) into the housing facts Quorum uses. Plain rules over real U-M place names, no
// language model, runs in the browser. Every fact keeps the sentence it came from, so the screen can say why.
//
//   readProfile(text, { places, personas }) -> Profile
//   Profile = {
//     program:  { id, label, area, why } | null          what they study, and where those classes usually are
//     entries:  [week entry]  (id, label, days, place, start, end, p, alt) plus { source: 'schedule'|'course'|'mention', why }
//               Only what the text says: a course or place written without days or times keeps days [] and
//               start/end null, and the screen asks for them. Nothing is guessed.
//     typical:  [week entry]  a FICTIONAL sample week for their program, offered on screen, never added on its own
//     modes:    { bike, maxWalkMin, lateHour, maxLateWalkMin }  with modesWhy { bike, late, walk }
//     budget, budgetWhy, wage, wageWhy
//     likes:    [{ key, label, why }]                     bath | light | size | dark (feed the prior)
//     notes:    [{ key, label, why }]                     things noted but not modeled (roommates, car, pet)
//     near:     [{ place, label, why }]                   "close to downtown", "near North Campus" (checked by walk time)
//     minSqft, minSqftWhy                                 "a room over 150 square feet"
//     groupSize                                           people moving in together, when they say so
//     courses:  ['EECS 482', ...], links: [{ url, host }], unplaced: [label]
//     kept:     { emails, phones }                        how many contact details were dropped (never stored)
//   }
//   priorOverrides(profile) -> { wage, overrides } for model.priorFor
//   redactContact(text) -> text with emails and phone numbers replaced (what the app stores)
//
// Demographics are never read: no age, gender, nationality or similar. Links are listed, never opened.

import { parseSchedule, toWeekEntries, PLACE_ALIASES as ICS_ALIASES } from './ics.js';

export const DEFAULT_MODES = { bike: false, maxWalkMin: 20, lateHour: '22:00', maxLateWalkMin: 12 };

// What they study -> where most of their classes are. persona: the FICTIONAL sample week whose class
// entries stand in for theirs until they add their own schedule.
export const PROGRAMS = [
  { id: 'nursing', label: 'Nursing', area: 'Medical', persona: 'maya', words: ['nursing', 'bsn', 'nurse'] },
  { id: 'music', label: 'Music, theatre or dance', area: 'North', persona: 'clara',
    words: ['music', 'smtd', 'violin', 'piano', 'cello', 'voice performance', 'music performance', 'composition', 'musical theatre', 'dance', 'orchestra'] },
  { id: 'engineering', label: 'Engineering or computer science', area: 'North', persona: 'jordan',
    words: ['computer science', 'computer engineering', 'electrical engineering', 'mechanical engineering', 'aerospace', 'robotics', 'industrial and operations', 'chemical engineering', 'civil engineering', 'materials science', 'engineering', 'cse', 'eecs'] },
  { id: 'business', label: 'Business', area: 'Central', persona: 'priya',
    words: ['ross school of business', 'business administration', 'bba', 'finance', 'marketing', 'accounting', 'business'] },
  { id: 'law', label: 'Law', area: 'Central', persona: 'noor', words: ['law school', 'juris doctor', 'j d', 'jd candidate', 'law'] },
  { id: 'premed', label: 'Pre-med or health sciences', area: 'Central and Medical', persona: 'amara',
    words: ['pre med', 'premed', 'pre medical', 'biochemistry', 'public health', 'neuroscience', 'mcat'] },
  { id: 'lsa', label: 'Arts and sciences (LSA)', area: 'Central', persona: 'leo',
    words: ['biology', 'psychology', 'economics', 'political science', 'lsa', 'literature', 'english', 'history', 'mathematics', 'statistics', 'chemistry', 'sociology', 'philosophy', 'data science', 'communications'] },
];

const NORTH_SUBJECTS = /^(EECS|ENGR|MECHENG|AEROSP|ROB|CEE|CHE|MATSCIE|IOE|BIOMEDE|NAVARCH|NERS|CLIMATE|MUSIC|THEORY|MUSICOL|PAT|ARCH|ART|DANCE|THTREMUS)$/;
const MEDICAL_SUBJECTS = /^(NURS|PNE|HS|PHARM|DENT|MOVESCI)$/;

// Place ids that are safe to read from a plain mention. Generic words that are also majors or names
// ("chemistry", "nursing", "Ross", "EECS") are left to the program rule and to schedule lines.
const SKIP_NAMES = new Set(['chemistry', 'chem', 'chem building', 'nursing', 'ross', 'eecs', 'moore', 'shapiro', 'the union', 'the league', 'law school']);

const DAY_WORDS = [
  [/\b(weekdays?|every ?day|daily)\b/i, ['mon', 'tue', 'wed', 'thu', 'fri']],
  [/\b(most nights|every night|nightly|most evenings|every evening)\b/i, ['mon', 'tue', 'wed', 'thu']],
  [/\b(?:Mo|Tu|We|Th|Fr|Sa|Su){2,7}\b/, 'pairs'],
  [/\b(?:Mo|Tu|We|Th|Fr|Sa|Su)(?=\s+\d{1,2}:\d{2})/, 'pairs'],
  [/\bweekends?\b/i, ['sat', 'sun']],
  [/\bMWF\b/, ['mon', 'wed', 'fri']],
  [/\bTT?h\b|\bTR\b|\bTuTh\b/, ['tue', 'thu']],
  [/\bMW\b/, ['mon', 'wed']],
  [/\bmon(day)?s?\b/i, ['mon']], [/\btue(s|sday)?s?\b/i, ['tue']], [/\bwed(nesday)?s?\b/i, ['wed']],
  [/\bthu(r|rs|rsday)?s?\b/i, ['thu']], [/\bfri(day)?s?\b/i, ['fri']], [/\bsat(urday)?s?\b/i, ['sat']], [/\bsun(day)?s?\b/i, ['sun']],
];
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAME = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const pad = (n) => String(n).padStart(2, '0');
const norm = (s) => ` ${String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9$]+/g, ' ').trim()} `;
const clip = (s, n = 90) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 3).trim()}...` : t; };

export function redactContact(text) {
  return String(text || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone]');
}

function sentences(text) {
  return String(text || '').replace(/\r\n?/g, '\n')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])|;\s*/)
    .map((s) => s.trim()).filter(Boolean);
}

export function daysIn(s) {
  const out = new Set();
  let rest = ` ${s} `;
  const PAIR = { Mo: 'mon', Tu: 'tue', We: 'wed', Th: 'thu', Fr: 'fri', Sa: 'sat', Su: 'sun' };
  for (const [re, days] of DAY_WORDS) {
    if (days === 'pairs') {
      const m = re.exec(rest);
      if (m) { (m[0].match(/Mo|Tu|We|Th|Fr|Sa|Su/g) || []).forEach((x) => out.add(PAIR[x])); rest = rest.replace(m[0], ' '); }
      continue;
    }
    if (re.test(rest)) { days.forEach((d) => out.add(d)); rest = rest.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`), ' '); }
  }
  return DAY_ORDER.filter((d) => out.has(d));
}

// "6-10pm", "from 7 to 11 pm", "9:30am to 1pm", "until 11pm", "till midnight", "after 10pm".
const T = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?';
function to24(h, m, ap, hintPm) {
  let H = Number(h); const M = Number(m || 0);
  const a = ap ? ap[0].toLowerCase() : null;
  if (a === 'p' && H < 12) H += 12;
  if (a === 'a' && H === 12) H = 0;
  if (!a && hintPm && H < 12 && H >= 1 && H <= 11) H += 12;
  return H * 60 + M;
}
const hm = (min) => `${pad(Math.floor(Math.min(min, 23 * 60 + 59) / 60))}:${pad(Math.min(min, 23 * 60 + 59) % 60)}`;

export function timesIn(s) {
  const txt = String(s);
  let m = new RegExp(`(?:from\\s+)?\\b${T}\\s*(?:-|to|until|till)\\s*${T}`, 'i').exec(txt);
  if (m && (m[2] || m[3] || m[5] || m[6])) {
    const endAp = m[6];
    let a = to24(m[1], m[2], m[3] || null, false);
    let b = to24(m[4], m[5], endAp, false);
    if (!m[3] && endAp) { // "6-10pm": the start shares the end's half of the day when that keeps it before the end
      const pm = to24(m[1], m[2], endAp, false);
      if (pm < b) a = pm;
    }
    if (b <= a && b < 12 * 60) b += 12 * 60;
    if (b > a && b - a <= 14 * 60) return { start: hm(a), end: hm(b), explicit: true };
  }
  if (/\b(until|till|til)\s+midnight\b/i.test(txt)) return { end: '23:59', explicit: true };
  m = new RegExp(`\\b(?:until|till|til|to)\\s+${T}`, 'i').exec(txt);
  if (m && (m[3] || m[2])) return { end: hm(to24(m[1], m[2], m[3], true)), explicit: true };
  m = new RegExp(`\\b(?:after|from|at|starting)\\s+${T}`, 'i').exec(txt);
  if (m && (m[3] || m[2])) return { start: hm(to24(m[1], m[2], m[3], true)), explicit: true };
  return null;
}

const ROLE = {
  job: /\b(work|works|working|job|shift|shifts|barista|cashier|server|waiter|waitress|host|tutor|tutoring|part[- ]time|employed|staff|assistant)\b/i,
  late: /\b(late|night|nights|evening|evenings|until midnight|all[- ]nighter)\b/i,
  study: /\b(study|studying|library|homework|read|reading)\b/i,
  gym: /\b(gym|lift|lifting|workout|work out|run|running|swim|swimming|climb|climbing|yoga|practice|soccer|basketball)\b/i,
};

// The role of a place in a sentence (job, study, gym...). Only its label is used; times come from the text.
function defaultsFor(kind, s) {
  if (ROLE.job.test(s)) return { label: 'Job', days: ['mon', 'wed', 'fri'], start: '17:00', end: '21:00' };
  if (kind === 'study' || ROLE.study.test(s)) {
    return ROLE.late.test(s) ? { label: 'Late study', days: ['tue', 'thu'], start: '19:00', end: '23:30' }
      : { label: 'Study', days: ['mon', 'wed'], start: '18:00', end: '21:00' };
  }
  if (kind === 'gym' || ROLE.gym.test(s)) return { label: 'Gym', days: ['tue', 'thu', 'sat'], start: '17:00', end: '18:30' };
  if (kind === 'errand') return { label: 'Groceries', days: ['sat'], start: '10:00', end: '11:00' };
  if (kind === 'class') return { label: 'Classes', days: ['mon', 'wed', 'fri'], start: '10:00', end: '12:00' };
  if (kind === 'work') return ROLE.late.test(s) ? { label: 'Shift', days: ['tue', 'thu'], start: '18:00', end: '23:00' }
    : { label: 'Shift', days: ['mon', 'wed', 'fri'], start: '08:00', end: '16:00' };
  return null;
}

function placeMentions(s, places, PLACE_ALIASES) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const n = norm(s);
  const hits = new Map();
  for (const p of places) {
    const lab = norm(p.label.replace(/\s*\(.*?\)\s*/g, ' '));
    if (lab.trim().length >= 5 && n.includes(lab)) hits.set(p.id, lab.trim());
  }
  for (const a of PLACE_ALIASES) {
    if (!byId.has(a.id) || hits.has(a.id)) continue;
    for (const name of a.names) {
      if (SKIP_NAMES.has(name) || name.length < 4) continue;
      if (n.includes(` ${name} `)) { hits.set(a.id, name); break; }
    }
  }
  return [...hits.entries()].map(([id, alias]) => ({ id, alias, place: byId.get(id) }));
}

// "1670 BBB", "1311 EECS", "2260 AH": a room number then a building code from the U-M alias table.
function roomCode(seg, places, aliases) {
  const ids = new Set(places.map((p) => p.id));
  for (const m of String(seg).matchAll(/\b\d{3,4}[A-Z]?\s+([A-Z]{2,6})\b/g)) {
    const a = aliases.find((x) => ids.has(x.id) && x.codes.includes(m[1]));
    if (a) { const place = places.find((p) => p.id === a.id); return { id: a.id, alias: m[1], place }; }
  }
  return null;
}

// Text read from a schedule screenshot comes one table cell or row per line: the course on one line, its days,
// times and room on the next ones. Put each meeting on one line after its course, so the course reader sees
// "EECS 280 LEC MoWe 10:30AM - 12:00PM 1670 BBB". Lines that are not about a course stay as they are.
const COURSE_AT = /\b([A-Z]{2,8})[ -]?(\d{3})\b/;
const MEETS = /\d{1,2}:\d{2}\s*(?:AM|PM)?|\b(?:Mo|Tu|We|Th|Fr|Sa|Su){1,7}\b|\b(?:LEC|DIS|LAB|SEM|REC)\b/i;
export function normalizeScheduleText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim());
  const out = [];
  let course = null;
  for (const l of lines) {
    if (!l) continue;
    const m = COURSE_AT.exec(l);
    if (m) {
      course = `${m[1]} ${m[2]}`;
      if (/\d{1,2}:\d{2}/.test(l)) out.push(l); else out.push(l);
      continue;
    }
    if (course && /\d{1,2}:\d{2}|\bTBA\b/i.test(l) && MEETS.test(l)) { out.push(`${course} ${l}`); continue; }
    if (course && /\b(section|component|days|times|room|instructor|status|units|class nbr|meeting)\b/i.test(l) && !/\d{1,2}:\d{2}/.test(l)) continue;
    if (course && MEETS.test(l)) { out[out.length - 1] = `${out[out.length - 1]} ${l}`; continue; }
    course = null;
    out.push(l);
  }
  return out.join('\n');
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function readProfile(text, { places = [], personas = [], aliases = null } = {}) {
  const raw = String(text || '');
  const kept = {
    emails: (raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length,
    phones: (raw.match(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g) || []).length,
  };
  const src = redactContact(raw);
  const PLACE_ALIASES = aliases || ICS_ALIASES;
  const sent = sentences(src);
  const all = norm(src);

  // ---- links (listed, never fetched)
  const links = [...new Set((src.match(/\bhttps?:\/\/[^\s)<>"]+|\bwww\.[^\s)<>"]+|\b(?:linkedin|github)\.com\/[^\s)<>"]+/gi) || []))]
    .map((u) => u.replace(/[.,;]+$/, ''))
    .map((url) => ({ url, host: url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase() }));

  // ---- courses
  const courseHits = [...src.matchAll(/\b([A-Za-z]{2,8})[ -]?(\d{3})\b/g)]
    .filter((m) => (/^[A-Z]+$/.test(m[1]) || KNOWN_SUBJECTS.has(m[1].toUpperCase()))
      && !/^(GPA|SAT|ACT|USD|MAY|JUN|JAN|FEB|MAR|APR|JUL|AUG|SEP|OCT|NOV|DEC|PO|BOX|APT|STE|RM|ROOM|SUITE|CLASS|FALL|WINTER|SQ|FT|HR|MIN)$/i.test(m[1]))
    .map((m) => ({ code: `${m[1].toUpperCase()} ${m[2]}`, subject: m[1].toUpperCase(), index: m.index, end: m.index + m[0].length }));
  const courses = [...new Set(courseHits.map((c) => c.code))];

  // ---- program
  let program = null;
  {
    let best = null;
    for (const p of PROGRAMS) {
      for (const w of p.words) {
        if (all.includes(` ${w} `)) {
          const score = w.length + (p.id === 'lsa' ? 0 : 3);
          if (!best || score > best.score) {
            const s = sent.find((x) => norm(x).includes(` ${w} `));
            best = { ...p, score, why: s ? clip(s) : w };
          }
        }
      }
    }
    if (!best && courses.length) {
      const subj = courses.map((c) => c.split(' ')[0]);
      const north = subj.filter((x) => NORTH_SUBJECTS.test(x)).length, med = subj.filter((x) => MEDICAL_SUBJECTS.test(x)).length;
      const id = north > subj.length / 2 ? 'engineering' : med > subj.length / 2 ? 'nursing' : 'lsa';
      best = { ...PROGRAMS.find((p) => p.id === id), why: `Courses: ${courses.slice(0, 3).join(', ')}` };
    }
    if (best) program = { id: best.id, label: best.label, area: best.area, persona: best.persona, why: best.why };
  }

  // ---- schedule lines and calendar files (explicit days and times)
  const entries = [];
  const unplaced = [];
  const used = new Set();
  // Calendar files go in whole; otherwise only short lines that look like "EECS 482 MWF 10:30-12:00 BBB".
  const isCal = /BEGIN:VCALENDAR/i.test(src);
  // Registrar rows ("EECS 280 001 LEC MoWe ...") go to the course reader below, which knows course codes.
  const schedText = isCal ? src : src.split(/\r?\n/).filter((l) => !/\b(LEC|DIS|LAB|SEM|REC)\b/.test(l) && l.trim().length <= 90 && /\d{1,2}(:\d{2})?\s*(am|pm)?\s*(-|to)\s*\d{1,2}(:\d{2})?/i.test(l) && l.trim().split(/\s+/).length <= 14).join('\n');
  const sched = parseSchedule(schedText, places);
  const placedItems = sched.items.filter((it) => it.place);
  sched.items.filter((it) => !it.place).forEach((it) => unplaced.push(clip(it.label, 40)));
  for (const e of toWeekEntries(placedItems, [])) {
    const id = `s_${e.place}_${e.days.join('')}_${e.start.replace(':', '')}`;
    if (used.has(id)) continue;
    used.add(id);
    e.label = e.label.replace(/,?\s*\$\s?\d+(?:\.\d+)?\s*(?:\/|an?\s+|per\s+)?\s*(?:hr|hour|h)?\b/gi, '').replace(/[\s,]+$/, '') || 'Class';
    entries.push({ ...e, id, source: 'schedule', assumed: false, why: `${e.label}, ${e.days.map((d) => DAY_NAME[d]).join(' ')} ${e.start} to ${e.end}` });
  }
  // ---- the courses they named become classes: their department's building, with the days and times written
  // next to each course when given ("EECS 280 MW 10:30-12"), typical ones otherwise (tagged guessed).
  {
    const placeIds = new Set(places.map((p) => p.id));
    const scheduled = entries.map((e) => e.label.toUpperCase().replace(/[ -]/g, ''));
    const seen = new Set();
    courseHits.forEach((c, i) => {
      if (entries.filter((e) => e.source === 'course').length >= 12) return;
      if (scheduled.some((l) => l.includes(c.code.replace(' ', '')))) { seen.add(c.code); return; }
      const lineEnd = src.indexOf('\n', c.end) === -1 ? src.length : src.indexOf('\n', c.end);
      const next = courseHits[i + 1] && courseHits[i + 1].index < lineEnd ? courseHits[i + 1].index : lineEnd;
      const seg = src.slice(c.end, next);
      const d = daysIn(seg), t = timesIn(seg);
      const key = `${c.code}|${d.join('')}|${t?.start || ''}`;
      if (seen.has(key) || (seen.has(c.code) && !(d.length || t))) return;
      seen.add(key); seen.add(c.code);
      const comp = /\bDIS\b|discussion/i.test(seg) ? ' discussion' : /\bLAB\b/.test(seg) ? ' lab' : /\bSEM\b/.test(seg) ? ' seminar' : /\bREC\b/.test(seg) ? ' recitation' : '';
      const named = placeMentions(seg, places, PLACE_ALIASES)[0] || roomCode(seg, places, PLACE_ALIASES);
      const subjPlace = (SUBJECT_PLACE.find(([re]) => re.test(c.subject)) || [null, 'angell'])[1];
      const place = named?.id || (placeIds.has(subjPlace) ? subjPlace : 'angell');
      entries.push({
        id: `c_${c.code.replace(' ', '')}${comp ? `_${comp.trim()}` : ''}${d.length ? `_${d.join('')}` : ''}`, label: `${c.code}${comp}`, days: d, start: t?.start || null, end: t?.end || null,
        place, p: 1, alt: [], on: true, source: 'course', placeGuessed: !named,
        why: clip(src.slice(Math.max(0, src.lastIndexOf('\n', c.index) + 1), lineEnd)),
      });
    });
  }
  for (let k = entries.length - 1; k >= 0; k--) {
    const e = entries[k];
    if (e.source === 'course' && !e.days.length && !e.start && entries.some((x) => x !== e && x.source === 'course' && x.label.startsWith(e.label) && x.days.length)) entries.splice(k, 1);
  }
  const schedPlaces = new Set(entries.filter((e) => e.source === 'schedule').map((e) => e.place));

  // ---- places named in sentences (days and times read when given, typical ones otherwise).
  // A resume line like "Barista, cafe in Kerrytown. Saturdays 9am-2pm" splits into two sentences, so a sentence
  // with one place and no day or time borrows them from the rest of its line.
  const lineOf = new Map();
  for (const ln of src.replace(/\r\n?/g, '\n').split('\n')) for (const x of sentences(ln)) if (!lineOf.has(x)) lineOf.set(x, ln);
  for (const s of sent) {
    if (/BEGIN:VCALENDAR|DTSTART|RRULE/i.test(s)) continue;
    for (const { id, place } of placeMentions(s, places, PLACE_ALIASES)) {
      if (schedPlaces.has(id) || entries.some((e) => e.place === id && (e.source === 'mention' || e.source === 'course'))) continue;
      if (['campus', 'transit'].includes(place.kind) && !ROLE.job.test(s)) continue;
      const base = defaultsFor(place.kind, s);
      if (!base) continue;
      const line = lineOf.get(s) || s;
      const lonePlace = line !== s && placeMentions(line, places, PLACE_ALIASES).length === 1;
      let d = daysIn(s);
      let t = timesIn(s);
      if (lonePlace && !d.length) d = daysIn(line);
      if (lonePlace && !t) t = timesIn(line);
      const days = d;
      const start = t?.start || null, end = t?.end || null;
      // A resume line that opens with a job title ("Barista, cafe in Kerrytown") names the entry.
      const title = ROLE.job.test(line) ? /^([A-Z][A-Za-z/&' -]{2,40}?),\s/.exec(line)?.[1] : null;
      entries.push({
        id: `m_${id}`, label: title || base.label, days, place: id, start, end, p: 1, alt: [], on: true,
        source: 'mention', why: clip(lonePlace ? line : s),
      });
    }
  }

  // ---- typical classes for their program, when they gave none of their own
  const COURSE = /\b[A-Z]{2,8}\s?\d{3}\b|lecture|class|discussion|seminar|clinical|studio|recitation/i;
  const hasClasses = entries.some((e) => e.source === 'course' || (e.source === 'schedule' && COURSE.test(e.label)) || /^Classes/.test(e.label));
  const typical = [];
  if (program && !hasClasses) {
    const persona = personas.find((p) => p.id === program.persona);
    const kindOf = new Map(places.map((p) => [p.id, p.kind]));
    for (const e of persona?.week || []) {
      const classy = kindOf.get(e.place) === 'class' || /clinical|lecture|seminar|rehearsal|research/i.test(e.label);
      if (!classy || /shift|gym|job/i.test(e.label)) continue;
      if (entries.some((x) => x.place === e.place)) continue;
      typical.push({
        id: `t_${e.id}`, label: e.label, days: [...e.days], place: e.place, start: e.start, end: e.end, p: e.p ?? 1,
        alt: (e.alt || []).map((a) => ({ ...a })), on: true, source: 'program',
        why: `A typical ${program.label.toLowerCase()} week (sample), used only when you choose it.`,
      });
    }
  }

  // ---- getting around
  const modes = { ...DEFAULT_MODES };
  const modesWhy = {};
  const find = (re) => sent.find((s) => re.test(s));
  const noBike = find(/\b(don'?t|do not|can'?t|cannot|never|no)\s+(own\s+a\s+|have\s+a\s+)?(bike|bicycle|cycle)\b/i);
  const bike = find(/\b(bike|biking|bikes|bicycle|cycling|cycle|e-?scooter|scooter)\b/i);
  if (noBike) { modes.bike = false; modesWhy.bike = clip(noBike); }
  else if (bike) { modes.bike = true; modesWhy.bike = clip(bike); }
  const darkWorry = find(/\b(don'?t|do not|hate|avoid|not comfortable|uncomfortable|nervous|uneasy|unsafe|scared|afraid|safe)\b[^.]{0,40}\b(walk|walking|walks)\b[^.]{0,40}\b(night|dark|late)\b|\b(night|dark|late)\b[^.]{0,30}\b(walk|walking)\b[^.]{0,30}\b(unsafe|scary|nervous|not safe|uncomfortable)\b/i);
  const darkFine = find(/\b(don'?t mind|fine|okay|ok|comfortable)\b[^.]{0,20}\b(walking|walk)\b[^.]{0,30}\b(night|dark|late)\b/i);
  if (darkWorry && !/don'?t mind/i.test(darkWorry)) { modes.maxLateWalkMin = 6; modesWhy.late = clip(darkWorry); }
  else if (darkFine) { modes.maxLateWalkMin = 20; modesWhy.late = clip(darkFine); }
  const walkCap = /\bwalk(?:ing)?\b[^.]{0,30}?\b(?:up to|at most|max(?:imum)?|no more than|under)\s+(\d{1,2})\s*min/i.exec(src);
  if (walkCap) { modes.maxWalkMin = Math.max(5, Math.min(45, Number(walkCap[1]))); modesWhy.walk = clip(walkCap[0]); }

  // ---- budget and wage
  let budget = null, budgetWhy = null;
  for (const s of sent) {
    const money = [...s.matchAll(/\$\s?(\d{1,2},?\d{3}|\d{3,4})(?:\.\d{2})?(\s*(?:\/|a|per)\s*(?:mo|month|hr|hour|h)\b)?/gi)];
    const rentish = /\b(budget|rent|afford|spend|max|maximum|up to|under|below|at most|no more than|per month|a month|\/mo|\/month|cap)\b/i.test(s);
    for (const m of money) {
      if (/^\s*(?:\/|a|per)\s*(?:hr|hour|h)\b/i.test(m[2] || '')) continue;
      const v = Number(m[1].replace(',', ''));
      if (v >= 300 && v <= 5000 && (rentish || /mo|month/i.test(m[2] || ''))) { budget = v; budgetWhy = clip(s); break; }
    }
    if (budget) break;
    const bare = /\b(?:budget|rent|afford|spend)\b[^.$\d]{0,25}(\d{3,4})\b/i.exec(s);
    if (bare) { const v = Number(bare[1]); if (v >= 300 && v <= 5000) { budget = v; budgetWhy = clip(s); break; } }
  }
  let wage = null, wageWhy = null;
  const w = /\$\s?(\d{1,3}(?:\.\d{1,2})?)\s*(?:\/\s*|an?\s+|per\s+)(?:hr|hour)\b/i.exec(src);
  if (w) { const v = Number(w[1]); if (v >= 8 && v <= 200) { wage = v; wageWhy = clip(sent.find((s) => s.includes(w[0])) || w[0]); } }

  // ---- what they care about in a room (shift the prior) and notes (shown, not modeled)
  const likes = [];
  const like = (key, label, re) => { const s = find(re); if (s) likes.push({ key, label, why: clip(s) }); };
  like('bath', 'Private bathroom matters', /\b(own|private|ensuite|en-suite)\s+bath(room)?\b/i);
  like('light', 'Natural light matters', /\b(natural light|sunlight|sunny|bright|windows?)\b/i);
  like('size', 'Room size matters', /\b(big|bigger|large|larger|spacious)\s+(room|bedroom|space)\b/i);
  like('dark', 'Safety after dark matters', /\b(safe|safety|well[- ]lit)\b/i);
  if (modesWhy.late && modes.maxLateWalkMin <= 6 && !likes.some((l) => l.key === 'dark')) likes.push({ key: 'dark', label: 'Safety after dark matters', why: modesWhy.late });

  const notes = [];
  const note = (key, label, re) => { const s = find(re); if (s) notes.push({ key, label, why: clip(s) }); };
  const rm = /\b(\d|two|three|four|five)\s+(roommates|housemates|friends)\b/i.exec(src);
  if (rm) notes.push({ key: 'roommates', label: `Living with ${rm[1]} ${rm[2].toLowerCase()}`, why: clip(sent.find((s) => s.includes(rm[0])) || rm[0]) });
  else note('roommates', 'Wants roommates', /\b(roommates?|housemates?)\b/i);
  note('alone', 'Wants to live alone', /\b(live alone|living alone|my own place|studio)\b/i);
  note('car', 'Has a car (parking is not in the sample listings)', /\b(i have|i own|my)\s+(a\s+)?car\b/i);
  note('pet', 'Has a pet (pet rules are not in the sample listings)', /\b(my|a|our)\s+(dog|cat|pet)\b/i);
  note('quiet', 'Wants a quiet place', /\b(quiet|calm|no parties)\b/i);

  // ---- where they want to live, room size, group size
  const near = [];
  for (const x of sent) {
    const m = NEAR_RE.exec(x);
    if (!m) continue;
    const target = m[2].toLowerCase();
    let hit = NEAR_TARGETS.find((t) => t.re.test(target));
    if (!hit) {
      const pm = placeMentions(target, places, PLACE_ALIASES)[0];
      if (pm) hit = { place: pm.id, label: pm.place.label.replace(/\s*\(.*?\)\s*/g, '').trim() };
    }
    if (hit && !near.some((n) => n.place === hit.place)) near.push({ place: hit.place, label: hit.label, why: clip(x) });
  }
  let minSqft = null, minSqftWhy = null;
  const sq = /\b(?:over|at least|more than|minimum(?: of)?|min|bigger than|larger than)\s*(\d{2,3})\s*\+?\s*(?:square feet|square foot|sq\.?\s?ft\.?|sqft|sf)\b|\b(\d{2,3})\s*\+\s*(?:square feet|sq\.?\s?ft|sqft)\b|\b(\d{2,3})\s*(?:square feet|sq\.?\s?ft|sqft)\s*(?:or more|minimum|at least|or bigger|or larger)/i.exec(src);
  if (sq) { const v = Number(sq[1] || sq[2] || sq[3]); if (v >= 60 && v <= 600) { minSqft = v; minSqftWhy = clip(sent.find((x) => x.includes(sq[0])) || sq[0]); } }
  const WORDN = { two: 2, three: 3, four: 4, five: 5 };
  const groupSize = rm ? (WORDN[rm[1].toLowerCase()] || Number(rm[1])) + 1 : null;

  return { program, entries, typical, modes, modesWhy, budget, budgetWhy, wage, wageWhy, likes, notes, courses, links, unplaced, kept, near, minSqft, minSqftWhy, groupSize };
}

// "close to downtown", "near North Campus", "walking distance to Ross", "walkable to Kerrytown".
const NEAR_RE = /\b(close to|closer to|near|nearby|walking distance (?:to|from|of)|walkable to|next to|right by|within walking distance of|a short walk (?:to|from))\s+(?:the\s+)?([A-Za-z.' ]{3,40})/i;
const NEAR_TARGETS = [
  { re: /^down ?town|^main st/, place: 'mainst', label: 'Downtown (Main St)' },
  { re: /^kerrytown/, place: 'kerrytown', label: 'Kerrytown' },
  { re: /^north campus|^north/, place: 'pierpont', label: 'North Campus' },
  { re: /^medical|^the hospital|^hospital|^michigan medicine/, place: 'uh', label: 'Medical Campus' },
  { re: /^ross|^business school|^the business school/, place: 'ross', label: 'Ross School of Business' },
  { re: /^central campus|^central|^the diag|^diag|^campus/, place: 'angell', label: 'Central Campus' },
];

// Course subject -> the building its classes are most often in (one of the 31 places). Central Campus
// subjects without their own building in the list use Angell Hall; the screen marks the place as guessed.
const SUBJECT_PLACE = [
  [/^(EECS|CSE)$/, 'eecs'],
  [/^(ENGR|MECHENG|ME|AEROSP|CEE|IOE|CHE|MATSCIE|MSE|BIOMEDE|NAVARCH|NERS|CLIMATE|ENSCEN|TCHNCLCM)$/, 'ggbrown'],
  [/^ROB$/, 'fmcrb'],
  [/^(MUSIC|THEORY|MUSICOL|PAT|MUSPERF|COMP|DANCE|THTREMUS|PERF|MUSED|ENS)$/, 'music'],
  [/^(ARCH|ART|ARTDES|UARTS)$/, 'pierpont'],
  [/^NURS$/, 'nursing'],
  [/^(PNE|HS|PHARM|PHARMSCI|MOVESCI|EHS|DENT)$/, 'uh'],
  [/^(FIN|MKT|TO|BCOM|ACC|STRATEGY|BA|MO|BE|BIT|ES|LHC|TAX)$/, 'ross'],
  [/^LAW$/, 'law'],
  [/^(CHEM|BIOLCHEM)$/, 'chem'],
];
const KNOWN_SUBJECTS = new Set(['EECS', 'MATH', 'PHYSICS', 'CHEM', 'STATS', 'ECON', 'PSYCH', 'BIOLOGY', 'BIOLCHEM', 'ENGLISH', 'HISTORY',
  'SOC', 'POLSCI', 'COMM', 'PHIL', 'ENGR', 'MECHENG', 'AEROSP', 'NURS', 'FIN', 'MKT', 'ACC', 'MUSIC', 'THEORY', 'SPANISH', 'FRENCH',
  'ASIAN', 'ANTHRCUL', 'EEB', 'MCDB', 'NEURO', 'DATASCI', 'SI', 'IOE', 'CEE', 'ROB', 'ASTRO', 'EARTH', 'LING', 'WRITING']);
const COURSE_SLOTS = [
  { days: ['mon', 'wed'], start: '10:30', end: '12:00' },
  { days: ['tue', 'thu'], start: '10:30', end: '12:00' },
  { days: ['mon', 'wed'], start: '13:30', end: '15:00' },
  { days: ['tue', 'thu'], start: '13:30', end: '15:00' },
  { days: ['mon', 'wed', 'fri'], start: '09:00', end: '10:00' },
  { days: ['tue', 'thu'], start: '15:30', end: '17:00' },
];

function toMinutes(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }

// The prior the ranking starts from: a wage sets the value of time (model.priorFor), and each "matters"
// raises that weight's median 2.5 times. Picks on the You tab can still move all of them.
export function priorOverrides(profile) {
  const o = {};
  const keys = new Set((profile?.likes || []).map((l) => l.key));
  if (keys.has('bath')) o.wBath = { median: 150 };
  if (keys.has('light')) o.wLight = { median: 50 };
  if (keys.has('size')) o.wSize = { median: 20 };
  if (keys.has('dark')) o.vDark = { median: 25 };
  return { wage: profile?.wage || null, overrides: o };
}

export function dayList(days) {
  const s = DAY_ORDER.filter((d) => days.includes(d));
  const key = s.join(',');
  if (key === 'mon,tue,wed,thu,fri') return 'Weekdays';
  if (key === 'sat,sun') return 'Weekends';
  return s.map((d) => DAY_NAME[d]).join(' ');
}
export { capitalize };
