// Next year: possible weeks drawn from a class catalog, and what not knowing them costs.
// docs/NEXT_YEAR.md is the contract. Pure ES module, no DOM, no network. Runs in Node 22 and the browser.
//
// parseCatalogCSV(text, places)  -> { columns, sections, skipped, unmatched, warnings }
// sampleNextYear({ plan, sections, k, seed, priority, odds, modes }) -> { scenarios, factors, stats }
// conditionScenarios(scenarios, settled) -> the scenarios whose attrs match every settled factor
// withAreas(sections, plan, places) -> sections and plan maybes with their campus (place area)
// voi({ tensor, scenarios, factors, boot, seed }) -> { evpi, byFactor, homes }
//
// A scenario has the shape of week.sampleWeeks output ({ id, week, attrs, weight, modes? }), so
// evaluateWeek and api.weekFor take it unchanged. Money is dollars per month.

import { matchPlace } from './ics.js';
import { rng } from './rng.js';

export const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const COMPONENT_NAMES = {
  LEC: 'lecture', LAB: 'lab', DIS: 'discussion', REC: 'recitation', SEM: 'seminar', CLN: 'clinical', IND: 'independent study',
};
export const FULL_ODDS = { early: 0.05, normal: 0.2, late: 0.4 };

// ---------- CSV ----------

// RFC 4180 style: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCSVRows(text) {
  const s = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// Header names accepted for each field, lower case. First match wins.
const FIELDS = {
  subject: ['subject', 'subject code', 'subj'],
  catalog: ['catalog nbr', 'catalog number', 'catalog', 'catalog no', 'course number'],
  section: ['section', 'section nbr', 'sect'],
  title: ['course title', 'title', 'class title'],
  component: ['component', 'comp', 'type'],
  days: ['days', 'day', 'meeting days'],
  time: ['time', 'times', 'meeting time'],
  start: ['start time', 'begin time'],
  end: ['end time'],
  location: ['location', 'room', 'facility', 'building'],
  instructor: ['instructor', 'instructors'],
  classNbr: ['class nbr', 'class number'],
};
const FLAG_DAYS = [['m', 'mon'], ['t', 'tue'], ['w', 'wed'], ['th', 'thu'], ['f', 'fri'], ['s', 'sat'], ['su', 'sun']];

// "Electrical Engineering & Computer Sci (EECS)" -> "EECS"; " eecs " -> "EECS".
export function subjectCode(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/\(([A-Za-z&]{2,10})\)\s*$/);
  return (m ? m[1] : s).toUpperCase().replace(/\s+/g, '');
}

// "MW", "TuTh", "TTH", "MWF", "M W F", "Th" -> ['mon', ...] in week order.
export function parseDays(raw) {
  const s = String(raw || '').replace(/[\s,./]/g, '');
  if (!s) return [];
  const out = new Set();
  let i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2).toLowerCase();
    const map2 = { th: 'thu', tu: 'tue', su: 'sun', sa: 'sat', mo: 'mon', we: 'wed', fr: 'fri' };
    if (map2[two]) { out.add(map2[two]); i += 2; continue; }
    const one = s[i].toLowerCase();
    const map1 = { m: 'mon', t: 'tue', w: 'wed', r: 'thu', f: 'fri', s: 'sat', u: 'sun' };
    if (!map1[one]) return [];
    out.add(map1[one]); i++;
  }
  return DAY_IDS.filter((d) => out.has(d));
}

const pad = (n) => String(n).padStart(2, '0');
const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// "10" -> 600, "1130" -> 690, "10:30" -> 630, "130" -> 90 (minutes on a 12 hour face, before AM/PM).
function clockMin(tok) {
  const t = tok.trim();
  let h, m;
  if (t.includes(':')) { [h, m] = t.split(':').map(Number); }
  else if (t.length <= 2) { h = Number(t); m = 0; }
  else { h = Number(t.slice(0, -2)); m = Number(t.slice(-2)); }
  if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59 || h > 24) return null;
  return h * 60 + m;
}
const apply = (min, mer) => {
  const h = Math.floor(min / 60) % 12, m = min % 60;
  return (mer === 'PM' ? h + 12 : h) * 60 + m;
};

// Registrar times. Returns { start: 'HH:MM', end: 'HH:MM' }, { arranged: true }, or null.
//   "10-1130AM" 10:00 to 11:30, "1130-1PM" 11:30 to 13:00, "4-530PM" 16:00 to 17:30, "6-9PM" 18:00 to 21:00.
//   The AM/PM suffix belongs to the end. The start takes the meridiem that puts it before the end with the
//   shortest meeting, which is the one at most 5 hours long whenever such a reading exists.
//   Also "10:30AM - 12:00PM", "1030AM-12PM" (each side its own suffix) and 24 hour "13:00-14:30".
export function parseTime(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\./g, '');
  if (!s) return null;
  if (/^(ARR|TBA|TBD)\b/.test(s)) return { arranged: true };
  const m = s.match(/^(\d{1,2}(?::\d{2})?|\d{3,4})\s*(AM|PM|A|P)?\s*-\s*(\d{1,2}(?::\d{2})?|\d{3,4})\s*(AM|PM|A|P)?$/);
  if (!m) return null;
  const merOf = (x) => (x ? (x[0] === 'A' ? 'AM' : 'PM') : null);
  const a = clockMin(m[1]), b = clockMin(m[3]);
  if (a == null || b == null) return null;
  const ma = merOf(m[2]), mb = merOf(m[4]);
  if (!mb) {
    // no suffix at all: a 24 hour clock
    if (ma || a >= b) return null;
    return { start: hm(a), end: hm(b) };
  }
  const end = apply(b, mb);
  if (ma) {
    const start = apply(a, ma);
    return start < end ? { start: hm(start), end: hm(end) } : null;
  }
  let best = null;
  for (const mer of ['AM', 'PM']) {
    const start = apply(a, mer);
    if (start < end && (best == null || end - start < end - best)) best = start;
  }
  return best == null ? null : { start: hm(best), end: hm(end) };
}

// parseCatalogCSV(text, places) -> { columns, sections, skipped, unmatched, warnings }
// Header driven and case insensitive. One row is one meeting; rows with the same course, component and section
// merge into one section with several `meetings`. The section's own days/start/end/location/place are its first
// meeting's; `area` is the place's area in places.json (North, Central, Medical...). Rows with ARR or TBA times are skipped (arranged), rows with no readable time too (noTime).
// Sections whose location matches no place keep place null and are counted in noPlace; the sampler skips them.
export function parseCatalogCSV(text, places = []) {
  const warnings = [];
  const rows = parseCSVRows(text);
  const empty = { columns: {}, sections: [], skipped: { arranged: 0, noTime: 0, noPlace: 0 }, unmatched: [], warnings };
  // header: the first row with a subject and a section column (the real file may start with a title line)
  const hi = rows.findIndex((r) => {
    const low = r.map((x) => x.trim().toLowerCase());
    return FIELDS.subject.some((n) => low.includes(n)) && FIELDS.section.some((n) => low.includes(n));
  });
  if (hi < 0) { warnings.push('No header row with Subject and Section columns was found.'); return empty; }
  const header = rows[hi].map((x) => x.trim());
  const low = header.map((x) => x.toLowerCase());
  const col = {}, columns = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    for (const n of names) {
      const i = low.indexOf(n);
      if (i >= 0) { col[field] = i; columns[field] = header[i]; break; }
    }
  }
  const flagCols = [];
  for (const [name, day] of FLAG_DAYS) {
    const i = low.indexOf(name);
    if (i >= 0) flagCols.push([i, day, header[i]]);
  }
  if (flagCols.length) columns.dayFlags = flagCols.map((f) => f[2]);
  for (const need of ['subject', 'catalog', 'section', 'location']) {
    if (col[need] == null) warnings.push(`No ${need} column.`);
  }
  if (col.time == null && (col.start == null || col.end == null)) warnings.push('No time column.');
  if (!flagCols.length && col.days == null) warnings.push('No day columns (M, T, W, TH, F, S, SU) and no Days column.');
  if (col.subject == null || col.catalog == null || col.section == null) return { ...empty, columns };

  const get = (r, f) => (col[f] == null ? '' : String(r[col[f]] ?? '').trim());
  const byKey = new Map();
  const skipped = { arranged: 0, noTime: 0, noPlace: 0 };
  const unmatched = new Set();
  const placeCache = new Map();
  const areaById = new Map((places || []).map((p) => [p.id, p.area]));
  for (const r of rows.slice(hi + 1)) {
    const code = subjectCode(get(r, 'subject'));
    const nbr = get(r, 'catalog').replace(/\s+/g, '');
    if (!code || !nbr) continue;
    const course = `${code} ${nbr}`;
    const section = get(r, 'section');
    const component = (get(r, 'component') || 'LEC').toUpperCase();
    const rawTime = col.time != null ? get(r, 'time') : `${get(r, 'start')} - ${get(r, 'end')}`;
    const t = parseTime(rawTime);
    if (t?.arranged) { skipped.arranged++; continue; }
    let days = [];
    if (flagCols.length) days = flagCols.filter(([i]) => String(r[i] ?? '').trim() && String(r[i]).trim() !== '0').map((f) => f[1]);
    if (!days.length && col.days != null) days = parseDays(get(r, 'days'));
    if (!t || !days.length) {
      if (/^(ARR|TBA)/i.test(get(r, 'days'))) skipped.arranged++;
      else skipped.noTime++;
      continue;
    }
    days = DAY_IDS.filter((d) => days.includes(d));
    const location = get(r, 'location');
    if (!placeCache.has(location)) placeCache.set(location, matchPlace(location, places).place ?? null);
    const place = placeCache.get(location);
    const area = place ? areaById.get(place) ?? null : null;
    const meeting = { days, start: t.start, end: t.end, location, place, area };
    const key = `${course}|${component}|${section}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.meetings.push(meeting);
      if (!place) { skipped.noPlace++; if (location) unmatched.add(location); }
      if (!place) prev.place = null;
      continue;
    }
    if (!place) { skipped.noPlace++; if (location) unmatched.add(location); }
    byKey.set(key, {
      key, course, title: get(r, 'title'), section, component,
      days, start: t.start, end: t.end, location, place, area,
      meetings: [meeting],
      classNbr: get(r, 'classNbr') || null, instructor: get(r, 'instructor') || null,
    });
  }
  return { columns, sections: [...byKey.values()], skipped, unmatched: [...unmatched], warnings };
}

// ---------- sampling next year ----------

const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const clock12 = (s) => {
  const t = toMin(s); const h = Math.floor(t / 60), m = t % 60;
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
const campusLabel = (area) => (!area ? 'place not known' : ['Downtown'].includes(area) ? area : `${area} Campus`);
const compName = (c) => COMPONENT_NAMES[c] || c.toLowerCase();

// Two week entries overlap when they share a day and their times overlap (touching ends do not count).
function overlaps(a, b) {
  if (!a.days.some((d) => b.days.includes(d))) return false;
  return toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
}
function hasConflict(entries) {
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) if (overlaps(entries[i], entries[j])) return true;
  return false;
}

// sampleNextYear({ plan, sections, k = 200, seed = 1, priority = 'normal', odds = {}, modes })
//   -> { scenarios, factors, stats }
// Per scenario: each choice picks one of its courses uniformly (among those in the catalog); each maybe happens
// with its odds (odds[maybe.id] overrides). Then each course component draws one open section uniformly; a
// section is full with probability FULL_ODDS[priority], and if every section is full one random one stays open.
// Components are filled one at a time in a shuffled order, drawing among the open sections that do not clash
// with what is already held (all open ones if every one clashes). If two meetings still overlap, the sections are
// drawn again (choices and maybes stay, so their odds are kept), up to 30 tries; after that the scenario is kept
// and counted in conflictsUnresolved. Fixed entries are always there.
// `modes` (optional, the persona's walking limits) is copied onto every scenario for week.evaluateWeek.
// `places` (optional, places.json) gives a maybe's campus; sections carry `area` from parseCatalogCSV.
export function sampleNextYear({ plan, sections, k = 200, seed = 1, priority = 'normal', odds = {}, modes, places } = {}) {
  const r = rng(seed);
  const pFull = FULL_ODDS[priority] ?? FULL_ODDS.normal;
  const usable = (sections || []).filter((s) => s.place && (s.meetings?.length || s.days?.length));
  const byCourse = new Map();
  for (const s of usable) {
    if (!byCourse.has(s.course)) byCourse.set(s.course, new Map());
    const comps = byCourse.get(s.course);
    if (!comps.has(s.component)) comps.set(s.component, []);
    comps.get(s.component).push(s);
  }
  const missing = new Set();
  // components a course needs: the plan's list, or every component the catalog has for it
  const compsFor = (course, components) => {
    const have = byCourse.get(course);
    if (!have) { missing.add(course); return []; }
    const want = components?.length ? components : [...have.keys()];
    const out = [];
    for (const c of want) {
      if (have.has(c)) out.push(c); else missing.add(`${course} ${c}`);
    }
    return out;
  };

  const courses = (plan.courses || []).map((c) => ({ ...c, comps: compsFor(c.course, c.components) }));
  const choices = (plan.choices || []).map((ch) => {
    const opts = ch.of.filter((course) => byCourse.has(course));
    for (const course of ch.of) if (!byCourse.has(course)) missing.add(course);
    return { ...ch, opts, comps: Object.fromEntries(opts.map((course) => [course, compsFor(course, ch.components)])) };
  });
  const areaById = new Map((places || []).map((p) => [p.id, p.area]));
  for (const s of usable) if (!areaById.has(s.place) && s.area) areaById.set(s.place, s.area);
  const maybes = (plan.maybes || []).map((m) => ({ ...m, p: odds[m.id] ?? m.odds ?? 0.5, area: areaById.get(m.place) ?? m.area ?? null }));
  const fixed = (plan.fixed || []).map((f) => ({ id: f.id, label: f.label, days: f.days, place: f.place, start: f.start, end: f.end }));

  // ---- factors ----
  const factors = [];
  const sectionFactorIds = new Set();
  const areaOf = (s) => s.area ?? null;
  const addSectionFactor = (course, comp) => {
    const list = byCourse.get(course)?.get(comp) || [];
    const id = `${course}|${comp}`;
    if (list.length < 2 || sectionFactorIds.has(id)) return;
    sectionFactorIds.add(id);
    factors.push({
      id, label: `${course} ${compName(comp)} section`, kind: 'section', course, component: comp,
      options: list.map((s) => ({
        id: s.section,
        label: `${s.section}, ${campusLabel(areaOf(s))}, ${DAY_SHORT[s.days[0]]} ${clock12(s.start)}`,
        campus: areaOf(s),
      })),
    });
  };
  for (const c of courses) for (const comp of c.comps) addSectionFactor(c.course, comp);
  for (const ch of choices) {
    factors.push({
      id: ch.id, label: ch.label, kind: 'choice',
      options: ch.opts.map((course) => {
        const areas = new Set((byCourse.get(course)?.get(ch.comps[course][0]) || []).map(areaOf));
        return { id: course, label: course, campus: areas.size === 1 ? [...areas][0] : null };
      }),
    });
  }
  for (const ch of choices) for (const course of ch.opts) for (const comp of ch.comps[course]) addSectionFactor(course, comp);
  for (const m of maybes) {
    factors.push({
      id: m.id, label: m.label, kind: 'maybe',
      options: [{ id: 'yes', label: 'Yes', campus: m.area ?? null }, { id: 'no', label: 'No', campus: null }],
    });
  }

  const entriesOf = (s) => (s.meetings?.length ? s.meetings : [s]).filter((x) => x.place).map((mt, i) => ({
    id: `${s.course}-${s.component}-${s.section}${i ? `-${i}` : ''}`.replace(/\s+/g, ''),
    label: `${s.course} ${compName(s.component)}`,
    days: [...mt.days], place: mt.place, start: mt.start, end: mt.end,
  }));

  const scenarios = [];
  let conflictsUnresolved = 0;
  for (let i = 0; i < k; i++) {
    const attrs = {};
    // choices and maybes: once per scenario
    const need = courses.map((c) => ({ course: c.course, comps: c.comps }));
    for (const ch of choices) {
      if (!ch.opts.length) continue;
      const course = ch.opts[r.int(ch.opts.length)];
      attrs[ch.id] = course;
      need.push({ course, comps: ch.comps[course] });
    }
    const extra = [];
    for (const m of maybes) {
      const on = r() < m.p;
      attrs[m.id] = on ? 'yes' : 'no';
      if (on) extra.push({ id: m.id, label: m.label, days: [...m.days], place: m.place, start: m.start, end: m.end });
    }
    // sections: redraw on overlap
    let week = null, picks = null, ok = false;
    const slots = [];
    for (const n of need) for (const comp of n.comps) slots.push([n.course, comp]);
    for (let tries = 0; tries < 30 && !ok; tries++) {
      picks = {};
      const base = [...fixed.map((f) => ({ ...f, days: [...f.days] })), ...extra];
      const ent = [];
      // a student registers one component at a time and skips open sections that clash with what they hold;
      // the order is shuffled on every try so no course always goes first
      const order = slots.map((x) => [r(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      for (const [course, comp] of order) {
        const list = byCourse.get(course).get(comp);
        const open = list.filter(() => r() >= pFull);
        const pool = open.length ? open : [list[r.int(list.length)]];
        const held = [...base, ...ent];
        const fits = pool.filter((s) => !entriesOf(s).some((e) => held.some((h) => overlaps(e, h))));
        const pickFrom = fits.length ? fits : pool;
        const s = pickFrom[r.int(pickFrom.length)];
        picks[`${course}|${comp}`] = s.section;
        ent.push(...entriesOf(s));
      }
      week = [...base.slice(0, fixed.length), ...ent, ...extra];
      ok = !hasConflict(week);
    }
    if (!ok) conflictsUnresolved++;
    week.sort((a, b) => DAY_IDS.indexOf(a.days[0]) - DAY_IDS.indexOf(b.days[0]) || toMin(a.start) - toMin(b.start));
    for (const id of sectionFactorIds) attrs[id] = picks[id] ?? 'none';
    const sc = { id: `${plan.id}:s${i}`, week, attrs, weight: 1 / k, planId: plan.id, personaId: plan.personaId ?? null };
    if (modes) sc.modes = modes;
    scenarios.push(sc);
  }
  // a section factor for an elective that was not taken in some weeks gets a "Not taken" option
  for (const f of factors) {
    if (f.kind !== 'section') continue;
    if (scenarios.some((s) => s.attrs[f.id] === 'none')) f.options.push({ id: 'none', label: 'Not taken', campus: null });
  }
  return { scenarios, factors, stats: { k, conflictsUnresolved, missingCourses: [...missing] } };
}

// withAreas(sections, plan, places) -> { sections, plan } with `area` on every section and maybe (from places.json).
// parseCatalogCSV already sets section areas; this is for sections from elsewhere and for a plan's maybes.
export function withAreas(sections, plan, places) {
  const area = new Map((places || []).map((p) => [p.id, p.area]));
  const secs = (sections || []).map((s) => ({ ...s, area: s.area ?? area.get(s.place) ?? null }));
  const pl = plan ? { ...plan, maybes: (plan.maybes || []).map((m) => ({ ...m, area: m.area ?? area.get(m.place) ?? null })) } : plan;
  return { sections: secs, plan: pl };
}

// conditionScenarios(scenarios, settled) -> the scenarios where every settled factor has the settled option.
export function conditionScenarios(scenarios, settled = {}) {
  const keys = Object.keys(settled || {}).filter((key) => settled[key] != null);
  if (!keys.length) return scenarios;
  return scenarios.filter((s) => keys.every((key) => s.attrs?.[key] === settled[key]));
}

// ---------- value of information ----------

// Ubar[s * H + h] = mean over value draws m of U[(m * K + s) * H + h].
function meanOverDraws(tensor) {
  const { U, M, K, H } = tensor;
  const Ubar = new Float64Array(K * H);
  for (let m = 0; m < M; m++) for (let s = 0; s < K; s++) {
    const base = (m * K + s) * H;
    for (let h = 0; h < H; h++) Ubar[s * H + h] += U[base + h] / M;
  }
  return Ubar;
}

// EVPI and EVPPI for one list of scenario indices (with repeats for the bootstrap).
// groups[f] = Int32Array: option index of factor f in each scenario.
function valuesFor(Ubar, H, idx, groups, nOpts) {
  const n = idx.length;
  const col = new Float64Array(H);
  let perfect = 0;
  for (const s of idx) {
    let best = -Infinity;
    for (let h = 0; h < H; h++) { const u = Ubar[s * H + h]; col[h] += u; if (u > best) best = u; }
    perfect += best;
  }
  let now = -Infinity;
  for (let h = 0; h < H; h++) if (col[h] > now) now = col[h];
  now /= n; perfect /= n;
  const evppi = groups.map((g, f) => {
    const sums = Array.from({ length: nOpts[f] }, () => new Float64Array(H));
    const counts = new Float64Array(nOpts[f]);
    for (const s of idx) {
      const o = g[s]; counts[o]++;
      const row = sums[o];
      for (let h = 0; h < H; h++) row[h] += Ubar[s * H + h];
    }
    // sum_x P(x) max_h mean_{s: X=x} Ubar = (1/n) sum_x max_h sum_{s: X=x} Ubar
    let tot = 0;
    for (let o = 0; o < nOpts[f]; o++) {
      if (!counts[o]) continue;
      let b = -Infinity;
      for (let h = 0; h < H; h++) if (sums[o][h] > b) b = sums[o][h];
      tot += b;
    }
    return Math.max(0, tot / n - now);
  });
  return { evpi: Math.max(0, perfect - now), evppi };
}

const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (p - lo) * (sorted[hi] - sorted[lo]);
}

// voi({ tensor, scenarios, factors, boot = 100, seed = 1 }) -> { evpi, byFactor, homes }
// tensor is meRank(...).tensor (U indexed (m * K + s) * H + h). scenarios[s] must be the week behind tensor
// scenario s. With Ubar[s][h] the mean over value draws:
//   EVPI     = mean_s max_h Ubar - max_h mean_s Ubar                                  (= decide.evpi)
//   EVPPI(X) = sum_x P(x) max_h mean_{s: X=x} Ubar - max_h mean_s Ubar, P(x) = share of scenarios with X = x
// Standard errors: bootstrap over scenarios (boot resamples). EVPPI <= EVPI holds in every resample.
// homes: per home, monthly cost = -Ubar[s][h] (rent and room net of its value, plus travel at the drawn values):
//   meanCost, p10 and p90 across scenarios, worst10 (mean cost in the worst 10% of scenarios),
//   pBest (share of scenarios where it has the lowest cost, ties split), expRegret (mean over scenarios of its
//   cost minus the lowest cost). Sorted by meanCost, lowest first (the same order as lowest expected regret).
export function voi({ tensor, scenarios, factors = [], boot = 100, seed = 1 } = {}) {
  const { K, H } = tensor;
  const homeIds = tensor.homeIds || tensor.homes?.map((h) => h.id) || Array.from({ length: H }, (_, h) => h);
  if (!K || !H) return { evpi: { value: 0, se: 0 }, byFactor: factors.map((f) => ({ id: f.id, label: f.label, value: 0, se: 0 })), homes: [] };
  if (scenarios && scenarios.length !== K) throw new Error(`voi: ${scenarios.length} scenarios but the tensor has ${K}`);
  const Ubar = meanOverDraws(tensor);

  // option index of each factor in each scenario
  const nOpts = [];
  const groups = factors.map((f) => {
    const ids = new Map();
    const g = new Int32Array(K);
    for (let s = 0; s < K; s++) {
      const v = scenarios?.[s]?.attrs?.[f.id] ?? '__missing';
      if (!ids.has(v)) ids.set(v, ids.size);
      g[s] = ids.get(v);
    }
    nOpts.push(ids.size);
    return g;
  });

  const all = Int32Array.from({ length: K }, (_, s) => s);
  const point = valuesFor(Ubar, H, all, groups, nOpts);
  const r = rng(seed);
  const bE = [], bF = factors.map(() => []);
  const idx = new Int32Array(K);
  for (let b = 0; b < boot; b++) {
    for (let i = 0; i < K; i++) idx[i] = r.int(K);
    const v = valuesFor(Ubar, H, idx, groups, nOpts);
    bE.push(v.evpi);
    v.evppi.forEach((x, f) => bF[f].push(x));
  }
  const byFactor = factors.map((f, i) => ({ id: f.id, label: f.label, kind: f.kind, value: point.evppi[i], se: sd(bF[i]) }))
    .sort((a, b) => b.value - a.value);

  // homes
  const best = new Float64Array(K);
  const wins = new Float64Array(H);
  for (let s = 0; s < K; s++) {
    let b = -Infinity;
    for (let h = 0; h < H; h++) if (Ubar[s * H + h] > b) b = Ubar[s * H + h];
    best[s] = b;
    let nTie = 0;
    for (let h = 0; h < H; h++) if (b - Ubar[s * H + h] <= 1e-9) nTie++;
    for (let h = 0; h < H; h++) if (b - Ubar[s * H + h] <= 1e-9) wins[h] += 1 / nTie;
  }
  const homes = [];
  const nWorst = Math.max(1, Math.ceil(K * 0.1));
  for (let h = 0; h < H; h++) {
    const cost = new Float64Array(K);
    let sum = 0, reg = 0;
    for (let s = 0; s < K; s++) { cost[s] = -Ubar[s * H + h]; sum += cost[s]; reg += best[s] - Ubar[s * H + h]; }
    const sorted = Float64Array.from(cost).sort();
    let w = 0;
    for (let i = K - nWorst; i < K; i++) w += sorted[i];
    homes.push({
      homeId: homeIds[h], meanCost: sum / K, p10: quantile(sorted, 0.1), p90: quantile(sorted, 0.9),
      worst10: w / nWorst, pBest: wins[h] / K, expRegret: reg / K, costs: Array.from(cost),
    });
  }
  homes.sort((a, b) => a.meanCost - b.meanCost || b.pBest - a.pBest);
  return { evpi: { value: point.evpi, se: sd(bE) }, byFactor, homes };
}
