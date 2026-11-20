// Calendar import: iCalendar (.ics) text and pasted plain schedule lines into week entries.
// Pure functions, no dependencies, no network. Runs in Node 22 and the browser.
//
// parseICS(text, places, opts)  -> { items, skipped, warnings }
// parseLines(text, places)      -> { items, skipped, warnings }
// matchPlace(location, places)  -> { place, via, alias? } or { place: null, candidates: [ids] }
// toWeekEntries(items, existingIds, resolve) -> editor entries for setEntries
//
// An item is { key, label, days: ['mon',..], start: 'HH:MM', end: 'HH:MM', location, place, via,
//              candidates, source: 'weekly'|'single'|'daily'|'line', notes: [] }.
// place is a places.json id, or null when the location did not match. Unmatched is never guessed.
// Times in the result are America/Detroit wall time (the zone of every home and place in Quorum).

export const LOCAL_TZ = 'America/Detroit';
export const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ICS_DAY = { MO: 'mon', TU: 'tue', WE: 'wed', TH: 'thu', FR: 'fri', SA: 'sat', SU: 'sun' };
const JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Common U-M names and abbreviations. Short all-caps codes match only as whole uppercase words.
// Every target is a real place in places.json.
export const PLACE_ALIASES = [
  // North Campus
  { id: 'beyster', names: ['bob and betty beyster', 'beyster building', 'beyster'], codes: ['BBB'] },
  { id: 'eecs', names: ['electrical engineering and computer science', 'eecs building', 'eecs'], codes: ['EECS'] },
  { id: 'dude', names: ['duderstadt center', 'duderstadt', 'the dude', 'dude'], codes: [] },
  { id: 'ggbrown', names: ['g g brown', 'gg brown', 'george granger brown', 'ggbl'], codes: ['GGBL'] },
  { id: 'fmcrb', names: ['ford motor company robotics', 'ford robotics', 'robotics building', 'fmcrb'], codes: ['FMCRB', 'FRB'] },
  { id: 'ncrb', names: ['north campus recreation', 'north campus rec', 'ncrb'], codes: ['NCRB'] },
  { id: 'music', names: ['earl v moore', 'moore building', 'school of music', 'moore'], codes: [] },
  { id: 'pierpont', names: ['pierpont commons', 'pierpont'], codes: [] },
  { id: 'kroger', names: ['kroger'], codes: [] },
  // Central Campus
  { id: 'ugli', names: ['shapiro undergraduate library', 'shapiro library', 'undergraduate library', 'shapiro', 'ugli'], codes: ['UGL'] },
  { id: 'hatcher', names: ['hatcher graduate library', 'graduate library', 'hatcher'], codes: [] },
  { id: 'angell', names: ['angell hall', 'angell'], codes: ['AH'] },
  { id: 'chem', names: ['chemistry building', 'chemistry', 'chem building', 'chem'], codes: ['CHEM'] },
  { id: 'ross', names: ['ross school of business', 'ross building', 'ross'], codes: [] },
  { id: 'union', names: ['michigan union', 'the union'], codes: [] },
  { id: 'league', names: ['michigan league', 'the league'], codes: [] },
  { id: 'hill', names: ['hill auditorium', 'hill aud'], codes: [] },
  { id: 'law', names: ['hutchins hall', 'law quad', 'law school'], codes: [] },
  { id: 'weiser', names: ['weiser hall', 'weiser', 'dennison building', 'dennison'], codes: ['WEIS', 'DENN'] },
  { id: 'easthall', names: ['east hall'], codes: ['EH'] },
  { id: 'mason', names: ['mason hall'], codes: ['MH'] },
  { id: 'mlb', names: ['modern languages building', 'modern languages', 'mlb'], codes: ['MLB'] },
  { id: 'ccrb', names: ['central campus recreation', 'central campus rec', 'hadley athletic center', 'hadley center', 'hadley', 'ccrb'], codes: ['CCRB'] },
  // South Campus
  { id: 'imsb', names: ['intramural sports building', 'intramural building', 'im building', 'imsb'], codes: ['IMSB', 'IM'] },
  { id: 'stadium', names: ['michigan stadium', 'the big house', 'big house'], codes: [] },
  // Medical Campus
  { id: 'uh', names: ['university hospital', 'u hospital'], codes: ['UH'] },
  { id: 'mott', names: ['c s mott', 'mott children', 'mott hospital', 'mott'], codes: [] },
  { id: 'nursing', names: ['school of nursing', '400 north ingalls', '400 n ingalls', 'north ingalls building', 'nursing'], codes: ['NIB'] },
  { id: 'thsl', names: ['taubman health sciences library', 'taubman library', 'thsl'], codes: ['THL', 'THSL'] },
  // Downtown and errands
  { id: 'aadl', names: ['ann arbor district library', 'downtown library', 'aadl'], codes: ['AADL'] },
  { id: 'btc', names: ['blake transit center', 'blake transit'], codes: ['BTC'] },
  { id: 'kerrytown', names: ['kerrytown'], codes: [] },
  { id: 'tj', names: ['trader joe'], codes: [] },
  { id: 'meijer', names: ['meijer'], codes: [] },
  { id: 'mainst', names: ['main street', 'main st'], codes: [] },
];

// ---------- small helpers ----------

const pad2 = (n) => String(n).padStart(2, '0');
const hm = (h, m) => `${pad2(h)}:${pad2(m)}`;
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const norm = (s) => ` ${String(s || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
const sortDays = (days) => DAY_IDS.filter((d) => days.includes(d));

// RFC 5545 line unfolding: a line that starts with a space or tab continues the previous one.
export function unfold(text) {
  return String(text || '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

export function unescapeText(v) {
  return String(v || '').replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? ' ' : c)).trim();
}

// "DTSTART;TZID=America/Detroit:20260831T090000" -> { name, params: {TZID}, value }
export function parseLine(line) {
  let i = 0, inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const parts = head.split(';');
  const params = {};
  for (const p of parts.slice(1)) {
    const k = p.indexOf('=');
    if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

// ---------- time zones ----------

// A few Windows zone names that Outlook writes into TZID.
const WINDOWS_TZ = {
  'eastern standard time': 'America/New_York', 'us eastern standard time': 'America/Indianapolis',
  'central standard time': 'America/Chicago', 'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles', 'gmt standard time': 'Europe/London',
  'utc': 'UTC', 'coordinated universal time': 'UTC', 'india standard time': 'Asia/Kolkata',
};

function ianaZone(tzid) {
  if (!tzid) return null;
  let z = tzid.replace(/^\/+/, '');
  const m = /([A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/.exec(z); // "/mozilla.org/.../America/Detroit"
  if (WINDOWS_TZ[z.toLowerCase()]) return WINDOWS_TZ[z.toLowerCase()];
  if (m) z = m[1];
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return z; } catch { return null; }
}

const fmtCache = new Map();
function wallParts(utcMs, zone) {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(zone, f);
  }
  const o = {};
  for (const p of f.formatToParts(new Date(utcMs))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  if (o.hour === 24) o.hour = 0;
  return o;
}

// Wall time in `zone` to a UTC instant (two passes handle the offset change at DST).
export function zonedToUtc(y, mo, d, h, mi, s, zone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess;
  for (let k = 0; k < 2; k++) {
    const w = wallParts(t, zone);
    const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    t = t - (asUtc - guess);
  }
  return t;
}

// A DTSTART or DTEND property to Detroit wall time. Returns { allDay } or { day, hm, min, ymd, srcDay, shift, note }.
export function toLocal(prop, defaultZone = null) {
  if (!prop) return null;
  const v = prop.value.trim();
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) return { allDay: true };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((x) => Number(x || 0));
  const srcDay = JS_DAY[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  let utc, note = null;
  if (m[7]) utc = Date.UTC(y, mo - 1, d, h, mi, s);
  else {
    const tzid = prop.params.TZID;
    const zone = tzid ? ianaZone(tzid) : defaultZone;
    if (tzid && !zone) note = `Unknown time zone "${tzid}", read as Ann Arbor time.`;
    if (!zone || zone === LOCAL_TZ) {
      return { day: srcDay, srcDay, shift: 0, hm: hm(h, mi), min: h * 60 + mi, ymd: `${m[1]}-${m[2]}-${m[3]}`, note };
    }
    utc = zonedToUtc(y, mo, d, h, mi, s, zone);
  }
  const w = wallParts(utc, LOCAL_TZ);
  const day = JS_DAY[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()];
  const shift = Math.round((Date.UTC(w.year, w.month - 1, w.day) - Date.UTC(y, mo - 1, d)) / 86400000);
  return { day, srcDay, shift, hm: hm(w.hour, w.minute), min: w.hour * 60 + w.minute, ymd: `${w.year}-${pad2(w.month)}-${pad2(w.day)}`, note };
}

function shiftDay(day, n) {
  const i = DAY_IDS.indexOf(day);
  return DAY_IDS[(((i + n) % 7) + 7) % 7];
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
  if (!m) return null;
  const [, sign, w, d, h, mi] = m;
  const min = (Number(w || 0) * 7 * 24 + Number(d || 0) * 24 + Number(h || 0)) * 60 + Number(mi || 0);
  return sign === '-' ? -min : min;
}

// ---------- places ----------

// Remove the first case-insensitive occurrence of a phrase (words joined by any punctuation).
export function removePhrase(text, phrase) {
  const words = String(phrase).trim().split(/\s+/).map(escapeRe);
  const re = new RegExp(`(^|[^A-Za-z0-9])${words.join('[^A-Za-z0-9]+')}(?=[^A-Za-z0-9]|$)`, 'i');
  return String(text).replace(re, '$1').replace(/\s+/g, ' ').replace(/^[\s,;|:()-]+|[\s,;|:()-]+$/g, '').trim();
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function matchPlace(location, places) {
  const raw = String(location || '').trim();
  if (!raw) return { place: null, candidates: [] };
  const byId = new Map((places || []).map((p) => [p.id, p]));
  const n = norm(raw);
  // 1. the place id itself
  const idHit = (places || []).find((p) => n === ` ${p.id} `);
  if (idHit) return { place: idHit.id, via: 'id' };
  // 2. a places.json label, whole or without its parenthetical
  let best = null;
  for (const p of places || []) {
    for (const lab of [p.label, p.label.replace(/\s*\(.*?\)\s*/g, ' ')]) {
      const l = norm(lab);
      if (l.trim().length >= 4 && n.includes(l) && (!best || l.length > best.len)) best = { id: p.id, len: l.length, text: l.trim() };
    }
  }
  if (best) return { place: best.id, via: 'label', alias: best.text };
  // 3. aliases: any number of names for one place match; names for two places stay unmatched
  const hits = [];
  for (const a of PLACE_ALIASES) {
    if (!byId.has(a.id)) continue;
    for (const name of a.names) if (n.includes(` ${name} `)) hits.push({ id: a.id, alias: name, len: name.length });
    for (const code of a.codes) if (new RegExp(`(^|[^A-Za-z])${escapeRe(code)}([^A-Za-z]|$)`).test(raw)) hits.push({ id: a.id, alias: code, len: code.length });
  }
  if (!hits.length) return { place: null, candidates: [] };
  hits.sort((x, y) => y.len - x.len);
  const ids = [...new Set(hits.map((h) => h.id))];
  // two different buildings named in one location: ask, do not pick
  if (ids.length > 1) return { place: null, candidates: ids };
  return { place: hits[0].id, via: 'alias', alias: hits[0].alias };
}

// ---------- merging ----------

function addItem(map, it, places) {
  const key = `${it.label.toLowerCase()}|${it.location.toLowerCase()}|${it.start}|${it.end}`;
  const prev = map.get(key);
  if (prev) {
    prev.days = sortDays([...new Set([...prev.days, ...it.days])]);
    for (const nt of it.notes) if (!prev.notes.includes(nt)) prev.notes.push(nt);
    if (prev.source !== it.source) prev.source = 'weekly';
    return;
  }
  const m = matchPlace(it.location, places);
  map.set(key, { key, ...it, days: sortDays(it.days), place: m.place, via: m.via || null, alias: m.alias || null, candidates: m.candidates || [] });
}

// ---------- iCalendar ----------

export function parseICS(text, places, opts = {}) {
  const lines = unfold(text);
  const out = new Map(), skipped = [], warnings = [];
  if (!lines.some((l) => /^BEGIN:VCALENDAR/i.test(l))) {
    return { items: [], skipped: [], warnings: ['This is not an iCalendar file (no BEGIN:VCALENDAR line).'] };
  }
  let calZone = null, ev = null, depth = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const p = parseLine(line);
    if (p.name === 'X-WR-TIMEZONE' && !ev) calZone = ianaZone(p.value.trim());
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') { ev = {}; depth = 0; continue; }
    if (!ev) continue;
    if (p.name === 'BEGIN') { depth++; continue; } // VALARM inside an event
    if (p.name === 'END' && depth > 0) { depth--; continue; }
    if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT') {
      handleEvent(ev, calZone || opts.defaultZone || null, out, skipped, places);
      ev = null; continue;
    }
    if (depth === 0 && !(p.name in ev)) ev[p.name] = p;
  }
  const items = [...out.values()];
  if (!items.length && !skipped.length) warnings.push('No events were found in this file.');
  return { items, skipped, warnings };
}

function handleEvent(ev, zone, out, skipped, places) {
  const label = unescapeText(ev.SUMMARY?.value) || 'Event';
  const location = unescapeText(ev.LOCATION?.value);
  const skip = (reason) => skipped.push({ label, reason });
  if ((ev.STATUS?.value || '').toUpperCase() === 'CANCELLED') return skip('cancelled');
  if (ev['RECURRENCE-ID']) return skip('a change to one date of a repeating event');
  const s = toLocal(ev.DTSTART, zone);
  if (!s) return skip('no start time');
  if (s.allDay) return skip('all-day event');
  let e = ev.DTEND ? toLocal(ev.DTEND, zone) : null;
  const notes = [];
  if (s.note) notes.push(s.note);
  let endMin;
  if (e && !e.allDay) endMin = e.ymd === s.ymd ? e.min : e.min + 24 * 60;
  else if (ev.DURATION) { const d = parseDuration(ev.DURATION.value); if (d != null) endMin = s.min + d; }
  if (endMin == null) return skip('no end time');
  if (endMin <= s.min) return skip('ends before it starts');
  if (endMin > 24 * 60 - 1) { endMin = 24 * 60 - 1; notes.push('Runs past midnight; cut at 11:59 PM.'); }
  const end = hm(Math.floor(endMin / 60), endMin % 60);

  let days, source = 'single';
  const rr = ev.RRULE ? Object.fromEntries(ev.RRULE.value.split(';').map((kv) => { const [k, v] = kv.split('='); return [k.toUpperCase(), v || '']; })) : null;
  if (rr) {
    const freq = (rr.FREQ || '').toUpperCase();
    const by = (rr.BYDAY || '').split(',').map((x) => ICS_DAY[x.trim().slice(-2).toUpperCase()]).filter(Boolean);
    if (freq === 'WEEKLY') {
      source = 'weekly';
      if (Number(rr.INTERVAL || 1) > 1) notes.push(`Repeats every ${rr.INTERVAL} weeks; counted as every week.`);
      days = by.length ? by.map((d) => shiftDay(d, s.shift)) : [s.day];
    } else if (freq === 'DAILY') {
      source = 'daily';
      days = by.length ? by.map((d) => shiftDay(d, s.shift)) : [...DAY_IDS];
    } else {
      return skip(`repeats ${freq ? freq.toLowerCase() : 'in an unknown way'}, not weekly`);
    }
  } else days = [s.day];
  addItem(out, { label, location, days, start: s.hm, end, source, notes }, places);
}

// ---------- pasted lines ----------

const DAY_WORDS = {
  mon: 'mon', monday: 'mon', mo: 'mon', m: 'mon',
  tue: 'tue', tues: 'tue', tuesday: 'tue', tu: 'tue', t: 'tue',
  wed: 'wed', weds: 'wed', wednesday: 'wed', we: 'wed', w: 'wed',
  thu: 'thu', thur: 'thu', thurs: 'thu', thursday: 'thu', th: 'thu', r: 'thu',
  fri: 'fri', friday: 'fri', fr: 'fri', f: 'fri',
  sat: 'sat', saturday: 'sat', sa: 'sat',
  sun: 'sun', sunday: 'sun', su: 'sun',
};
const DAY_GROUPS = { daily: DAY_IDS, everyday: DAY_IDS, weekdays: DAY_IDS.slice(0, 5), weekends: ['sat', 'sun'], weekend: ['sat', 'sun'] };

// "Mon", "Monday", "Mon/Wed", "MWF", "TTh", "TuTh". Single letters only inside a compact code or as M W F.
function dayToken(tok) {
  const t = tok.replace(/[.,;]+$/, '');
  if (!t) return null;
  const low = t.toLowerCase();
  if (DAY_GROUPS[low]) return DAY_GROUPS[low];
  if (low.length > 1 && DAY_WORDS[low] && !/^(m|t|w|r|f)$/.test(low)) {
    if (low.length === 2 && t !== t[0].toUpperCase() + t[1].toLowerCase() && t !== t.toUpperCase()) return null;
    return [DAY_WORDS[low]];
  }
  if (t.includes('/') || t.includes('-')) {
    const parts = t.split(/[/-]/).filter(Boolean).map(dayToken);
    if (parts.length < 2 || !parts.every(Boolean)) return null;
    // "Mon-Fri" is a range; "Mon/Wed" is a list
    if (t.includes('-') && parts.length === 2 && parts[0].length === 1 && parts[1].length === 1) {
      const a = DAY_IDS.indexOf(parts[0][0]), b = DAY_IDS.indexOf(parts[1][0]);
      if (a <= b) return DAY_IDS.slice(a, b + 1);
    }
    return parts.flat();
  }
  // compact codes: must start with a capital, letters only from the day set
  if (/^[MTWRFS]/.test(t)) {
    const re = /Th|Tu|Sa|Su|M|T|W|R|F/g;
    const got = t.match(re) || [];
    if (got.join('') === t) return got.map((g) => DAY_WORDS[g.toLowerCase()]);
  }
  return null;
}

const TIME_RE = /(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/i;

function readTimes(str) {
  const m = TIME_RE.exec(str);
  if (!m) return null;
  let [, h1, m1, a1, h2, m2, a2] = m;
  h1 = Number(h1); h2 = Number(h2); m1 = Number(m1 || 0); m2 = Number(m2 || 0);
  if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  const notes = [];
  const mer = (x) => (x ? (x[0].toLowerCase() === 'p' ? 'pm' : 'am') : null);
  a1 = mer(a1); a2 = mer(a2);
  const apply = (h, a) => (a === 'pm' ? (h % 12) + 12 : a === 'am' ? h % 12 : h);
  let e = apply(h2, a2);
  let s;
  if (a1) s = apply(h1, a1);
  else if (a2) {
    // "1-2:30pm" is 1 PM; "11-12:30pm" is 11 AM
    const same = apply(h1, a2);
    s = same * 60 + m1 < e * 60 + m2 ? same : apply(h1, a2 === 'pm' ? 'am' : 'pm');
  } else s = h1;
  if (!a1 && !a2) {
    // no AM or PM: hours 1 to 6 are read as afternoon (classes do not start at 3 AM)
    if (s >= 1 && s <= 6) { s += 12; notes.push('No AM or PM given; read as afternoon.'); }
    if (e * 60 + m2 <= s * 60 + m1 && e < 12) e += 12;
  }
  if (e === 24) { e = 23; m2 = 59; }
  if (e * 60 + m2 <= s * 60 + m1) return null;
  return { start: hm(s, m1), end: hm(e, m2), index: m.index, length: m[0].length, notes };
}

export function parseLines(text, places) {
  const out = new Map(), skipped = [], warnings = [];
  const lines = String(text || '').replace(/\r\n|\r/g, '\n').split('\n');
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const t = readTimes(line);
    if (!t) { skipped.push({ label: line, line: i + 1, reason: 'no time range like 9:00-10:30' }); return; }
    const rest = (line.slice(0, t.index) + ' ' + line.slice(t.index + t.length)).trim();
    const tokens = rest.split(/\s+/).filter(Boolean);
    const days = [];
    const keep = [];
    // day tokens are taken from the start of the line or right next to the time range
    tokens.forEach((tok, k) => {
      const d = dayToken(tok);
      if (d) days.push(...d); else keep.push({ tok, k });
    });
    if (!days.length) { skipped.push({ label: line, line: i + 1, reason: 'no days like Mon Wed Fri' }); return; }
    let restText = keep.map((x) => x.tok).join(' ').replace(/^[\s,;|:-]+|[\s,;|:-]+$/g, '');
    let label = restText, location = restText;
    const at = /\s(?:@|at)\s/i.exec(` ${restText} `);
    const sep = /\s*[|;,\t]\s*|\s+-\s+/;
    if (at) {
      const padded = ` ${restText} `;
      label = padded.slice(0, at.index).trim();
      location = padded.slice(at.index + at[0].length).trim();
    } else if (sep.test(restText)) {
      const parts = restText.split(sep).map((x) => x.trim()).filter(Boolean);
      const li = parts.findIndex((x, k) => k > 0 && matchPlace(x, places).place);
      const locIdx = li >= 0 ? li : parts.length - 1;
      location = parts[locIdx];
      label = parts.filter((_, k) => k !== locIdx).join(', ') || location;
    } else {
      // "Gym NCRB": the place name is the location, the words left over are the label
      const m = matchPlace(restText, places);
      const left = m.alias ? removePhrase(restText, m.alias) : '';
      if (left && /[A-Za-z]{2,}/.test(left)) label = left;
    }
    if (!label) label = 'Class';
    addItem(out, { label, location, days: [...new Set(days)], start: t.start, end: t.end, source: 'line', notes: t.notes, line: i + 1 }, places);
  });
  return { items: [...out.values()], skipped, warnings };
}

// Auto-detect: iCalendar text or plain lines.
export function parseSchedule(text, places) {
  return /BEGIN:VCALENDAR/i.test(String(text || '')) ? parseICS(text, places) : parseLines(text, places);
}

// ---------- to editor entries ----------

// Labels longer than 40 characters are cut at a word break.
export function shortLabel(label, max = 40) {
  const s = String(label || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1).lastIndexOf(' ');
  return s.slice(0, cut > 10 ? cut : max).replace(/[\s,;:(-]+$/, '');
}

// items: parsed items; existingIds: ids already in the week; resolve: Map key -> place id for unmatched ones;
// include: optional Set of keys to keep. Items without a place are left out.
export function toWeekEntries(items, existingIds = [], resolve = new Map(), include = null) {
  const used = new Set(existingIds);
  let n = 1;
  const out = [];
  for (const it of items) {
    if (include && !include.has(it.key)) continue;
    const place = it.place || resolve.get(it.key) || null;
    if (!place) continue;
    while (used.has(`cal${n}`)) n++;
    const id = `cal${n}`;
    used.add(id);
    out.push({ id, label: shortLabel(it.label), days: [...it.days], place, start: it.start, end: it.end, p: 1, alt: [], on: true, added: true, imported: true });
  }
  return out;
}

export const minutesBetween = (a, b) => toMin(b) - toMin(a);
