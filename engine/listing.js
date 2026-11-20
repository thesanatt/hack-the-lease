// Paste any post: read a sublet or room post a student pasted, find the rent, dates, beds and where it is,
// merge the same post seen twice, and draft a polite first message from a template (no language model).
// docs/LISTINGS.md part 3. Pure ES module, no DOM, no network.
//
// parsePost(text, { streets, places, centroid?, today? }) -> listing (shape in docs/LISTINGS.md)
//   streets   streets.geojson (FeatureCollection with properties.n), its features, or streetIndex(...)
//   places    places.json [{ id, label, lat, lon }]
//   centroid  { lat, lon } of the student's week; a street with no cross street is placed at its point nearest
//             this (default: the middle of the Central Campus places)
//   today     'YYYY-MM-DD' (default 2026-11-20); a date with no year is its next occurrence on or after today
// dedupeKey(listing) -> string
// draftMessage({ listing, facts, student }) -> string
// Also: redact(text), streetIndex(geojson), findStreet(index, phrase), shortName(listing), covers(listing, semester),
//       locate(listing, { streets, places, centroid }), fmtDay(iso), fmtRange(start, end)
//
// Contact details are never extracted or stored: contact is always null, and redact() strips emails, phone
// numbers, links, handles and self-introductions before a post is kept.

export const TODAY = '2026-11-20';

// ------------------------------------------------------------------ words

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numOf = (s) => {
  if (s == null) return null;
  const k = String(s).toLowerCase();
  if (k in NUM_WORDS) return NUM_WORDS[k];
  const n = Number(k);
  return Number.isFinite(n) ? n : null;
};

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MON_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept(?:ember)?|sep|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

// ------------------------------------------------------------------ dates

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayNum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;

export function fmtDay(s) {
  if (!s) return '';
  return `${MON_SHORT[+s.slice(5, 7)]} ${+s.slice(8, 10)}`;
}
export function fmtRange(start, end) {
  if (start && end) return `${fmtDay(start)} to ${fmtDay(end)}`;
  if (start) return `from ${fmtDay(start)}`;
  if (end) return `until ${fmtDay(end)}`;
  return '';
}

// One date as written: { m, d (or null for a whole month), y (or null) }
function dateParts(mon, day, year, num) {
  if (num) return { m: +num[0], d: +num[1], y: num[2] ? (num[2].length === 2 ? 2000 + +num[2] : +num[2]) : null };
  return { m: MONTHS[mon.toLowerCase().replace('.', '')], d: day ? +day : null, y: year ? +year : null };
}

// The next occurrence on or after today. A whole month that is the current month counts as now.
function resolveStart(p, today) {
  const ty = +today.slice(0, 4), tm = +today.slice(5, 7);
  const d = p.d ?? 1;
  if (p.y) return iso(p.y, p.m, Math.min(d, lastDay(p.y, p.m)));
  let y = ty;
  if (p.d == null ? p.m < tm : iso(ty, p.m, d) < today) y = ty + 1;
  return iso(y, p.m, Math.min(d, lastDay(y, p.m)));
}
function resolveEnd(p, startIso, today) {
  const base = startIso || today;
  let y = p.y || +base.slice(0, 4);
  const d = (yy) => (p.d == null ? lastDay(yy, p.m) : Math.min(p.d, lastDay(yy, p.m)));
  let out = iso(y, p.m, d(y));
  if (!p.y && out < base) { y += 1; out = iso(y, p.m, d(y)); }
  return out;
}

const ONE_DATE = `(?:${MONTH_RE}\\s*(?:(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?)?(?:,?\\s*(20\\d\\d)(?!\\d))?|(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?(?!\\d))`;
const RANGE_RE = new RegExp(`\\b${ONE_DATE}\\s*(?:-|to|through|thru|until|till|~)\\s*${ONE_DATE}`, 'gi');
const START_RE = new RegExp(`\\b(?:from|starting|start(?:s|ing)?(?: on)?|available|avail\\.?|move[- ]?in|beginning|begins)\\s*(?:on\\s*)?${ONE_DATE}`, 'gi');
const END_RE = new RegExp(`\\b(?:until|till|through|thru|ends?(?: on)?|ending|to)\\s*${ONE_DATE}`, 'gi');

function partsAt(m, k) {
  // groups: mon, day, year, nm, nd, ny starting at index k
  let p = null;
  if (m[k]) p = dateParts(m[k], m[k + 1], m[k + 2]);
  else if (m[k + 3]) p = dateParts(null, null, null, [m[k + 3], m[k + 4], m[k + 5]]);
  if (!p || !p.m || p.m > 12 || (p.d != null && (p.d < 1 || p.d > 31))) return null;
  return p;
}

// Guessed dates for a named term (these are labeled guesses, not U-M calendar dates).
function termDates(term, today) {
  const ty = +today.slice(0, 4);
  if (term === 'summer') { const y = iso(ty, 5, 1) >= today ? ty : ty + 1; return [iso(y, 5, 1), iso(y, 8, 15)]; }
  if (term === 'winter') { const y = iso(ty, 1, 1) >= today ? ty : ty + 1; return [iso(y, 1, 1), iso(y, 4, 30)]; }
  if (term === 'fall') { const y = iso(ty, 9, 1) >= today ? ty : ty + 1; return [iso(y, 9, 1), iso(y, 12, 31)]; }
  if (term === 'year') { const y = iso(ty, 9, 1) >= today ? ty : ty + 1; return [iso(y, 9, 1), iso(y + 1, 8, 31)]; }
  return [null, null];
}

export function termOf(start, end) {
  if (!start || !end) return null;
  const span = dayNum(end) - dayNum(start);
  if (span >= 300) return 'year';
  const sm = +start.slice(5, 7), em = +end.slice(5, 7);
  if (sm >= 4 && sm <= 6 && em >= 6 && em <= 8 && span < 160) return 'summer';
  if ((sm === 12 || sm === 1) && em >= 4 && em <= 5 && span < 160) return 'winter';
  if ((sm === 8 || sm === 9) && (em === 12 || em === 1) && span < 160) return 'fall';
  return null;
}

function parseDates(text, today) {
  let m;
  RANGE_RE.lastIndex = 0;
  while ((m = RANGE_RE.exec(text))) {
    const a = partsAt(m, 1), b = partsAt(m, 7);
    if (!a || !b || !a.m || !b.m || a.m > 12 || b.m > 12) continue;
    // "May 1-15": the second part is a bare day of the same month
    const start = resolveStart(a, today);
    const end = resolveEnd(b, start, today);
    return { start, end, from: m[0].trim(), how: 'found' };
  }
  // "May 1-15" (bare day after a dash)
  const bare = new RegExp(`\\b${MONTH_RE}\\s*(\\d{1,2})\\s*-\\s*(\\d{1,2})\\b(?!\\s*(?:/|bed|br|bd))`, 'i').exec(text);
  if (bare) {
    const p = dateParts(bare[1], bare[2]);
    const start = resolveStart(p, today);
    const end = resolveEnd({ m: p.m, d: +bare[3], y: null }, start, today);
    return { start, end, from: bare[0], how: 'found' };
  }
  let start = null, end = null, from = [];
  START_RE.lastIndex = 0;
  if ((m = START_RE.exec(text))) {
    const p = partsAt(m, 1);
    if (p?.m && p.m <= 12) { start = resolveStart(p, today); from.push(m[0].trim()); }
  }
  END_RE.lastIndex = 0;
  while ((m = END_RE.exec(text))) {
    const p = partsAt(m, 1);
    if (p?.m && p.m <= 12) { end = resolveEnd(p, start, today); from.push(m[0].trim()); break; }
  }
  if (start || end) return { start, end, from: from.join(' ... '), how: 'found' };
  return null;
}

function parseTermWord(text) {
  const t = text.toLowerCase();
  const m = /\b(spring\s*\/\s*summer|spring and summer|summer|winter|fall|autumn)\s*(?:semester|term|sublet|sublease|20\d\d)?\b/.exec(t)
    || /\b(full year|whole year|school year|academic year|12[- ]month|twelve[- ]month|year[- ]long|year lease)\b/.exec(t);
  if (!m) return null;
  const w = m[1];
  const term = /summer/.test(w) ? 'summer' : /winter/.test(w) ? 'winter' : /fall|autumn/.test(w) ? 'fall' : 'year';
  return { term, from: text.slice(m.index, m.index + m[0].length) };
}

// ------------------------------------------------------------------ money

const MONEY_RE = /(\$\s?)?(\d{1,2},\d{3}|\d{3,5})(?:\.\d{2})?(?!\s*(?:sq|square|ft|feet|min|minutes|mi\b|miles|bed|br\b|bd\b|bath|[a-z]{0,3}\s+(?:st|ave|rd|street|avenue|road)\b))(\s*(?:\/\s*(?:mo|month|mon|m)\b|per\s+month|a\s+month|each\s+month|monthly|\/\s*person|per\s+person|pp\b|each\b))?/gi;

function parseRent(text, bedsInUnit) {
  const cands = [];
  let m;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text))) {
    const v = Number(m[2].replace(',', ''));
    const hasDollar = !!m[1];
    const suffix = (m[3] || '').toLowerCase();
    const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
    // a year, a house number or a zip code is not rent
    if (!hasDollar && !suffix && !/\brent\b[^.]{0,12}$/.test(before)) continue;
    if (/^\d{4}$/.test(m[2]) && +m[2] >= 1990 && +m[2] <= 2100 && !hasDollar) continue;
    if (/(deposit|fee|parking|application|security)\W*$/.test(before.slice(-14)) || /^\W*(deposit|fee|security|application|for parking|parking)/.test(after)) continue;
    if (/(utilit|utils)[^$]{0,16}$/.test(before) && v < 400) continue;
    if (v < 150 || v > 9000) continue;
    const perMonth = /mo|month|monthly|\/\s*m\b/.test(suffix);
    const perPerson = /person|pp|each/.test(suffix) || /^\s*(?:per person|each|a person|\/person|pp)\b/.test(after);
    const whole = /^\s*(?:\/\s*mo\w*\s*)?(?:total|in total|for the (?:whole|entire)|for all|whole|for the (?:house|unit|apartment|apt|place))/.test(after)
      || /(?:whole|entire)\s+(?:house|unit|apartment|apt|place)\s+(?:is|for|at)\s*$/.test(before);
    cands.push({ v, hasDollar, perMonth, perPerson, whole, from: m[0].trim(), index: m.index });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (b.perMonth - a.perMonth) || (b.perPerson - a.perPerson) || (b.hasDollar - a.hasDollar) || (a.index - b.index));
  const c = cands[0];
  if (c.whole) {
    const splitSaid = /\b(?:per person|split (?:evenly|equally|per person|\d|between|among)|each person|\/person|a person|split \w+ ways)\b/i.test(text);
    if (splitSaid && bedsInUnit > 0) return { rent: Math.round(c.v / bedsInUnit), whole: c.v, how: 'guessed', from: c.from };
    return { rent: c.v, whole: c.v, how: 'found', from: c.from };
  }
  return { rent: c.v, whole: null, how: 'found', from: c.from };
}

function parseUtilities(text) {
  const extra = /(?:\+|plus|not including|excluding|excl\.?|w\/o|without)\s*(?:all\s+)?(?:utilities|utils|util)\b|(?:utilities|utils|util)\s*(?:are\s*|is\s*)?(?:not included|not incl\.?|extra|separate|on top|split|not covered|additional)/i.exec(text);
  if (extra) return { value: 'extra', from: extra[0] };
  const inc = /(?:utilities|utils|util)\s*(?:are\s*|is\s*)?(?:all\s+)?(?:included|incl\.?|inc\.?|covered|paid)|(?:incl\.?|including|includes|with|w\/|all)\s*(?:all\s+)?(?:utilities|utils|util)\b/i.exec(text);
  if (inc) return { value: 'included', from: inc[0] };
  return null;
}

function parseFurnished(text) {
  const no = /\b(?:unfurnished|not furnished|no furniture|without furniture)\b/i.exec(text);
  if (no) return { value: false, from: no[0] };
  const yes = /\b(?:fully |partly |partially |semi[- ])?furnished\b|\bfurniture included\b/i.exec(text);
  if (yes) return { value: true, from: yes[0] };
  return null;
}

// ------------------------------------------------------------------ beds

const N = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)';
const BED = '(?:-|\\s)?(?:bed(?:room)?s?|br|bd|b\\/r|bdrm)\\b';

function parseBeds(text) {
  const t = text;
  let m;
  if ((m = /\bstudio\b/i.exec(t))) return { beds: 0, bedsInUnit: 0, from: m[0], how: 'found' };
  if ((m = new RegExp(`\\b${N}\\s*(?:of|out of|/)\\s*${N}${BED}`, 'i').exec(t))) {
    return { beds: numOf(m[1]), bedsInUnit: numOf(m[2]), from: m[0], how: 'found' };
  }
  if ((m = new RegExp(`\\b${N}\\s+(?:private\\s+|open\\s+|furnished\\s+)?(?:rooms?|bedrooms?|beds?|spots?)\\b(?:\\s+(?:are\\s+)?(?:open|available|left|free))?\\s+(?:in|at|of)\\s+(?:a|an|the|my|our)?\\s*${N}${BED}`, 'i').exec(t))) {
    return { beds: numOf(m[1]), bedsInUnit: numOf(m[2]), from: m[0], how: 'found' };
  }
  if ((m = new RegExp(`\\b(?:(?:my|a|one|private|single)\\s+)?(?:private\\s+)?room\\s+(?:in|at|of)\\s+(?:a|an|the|my|our)?\\s*${N}${BED}`, 'i').exec(t))) {
    return { beds: 1, bedsInUnit: numOf(m[1]), from: m[0], how: 'found' };
  }
  const unit = new RegExp(`\\b${N}${BED}`, 'i').exec(t);
  const rooms = new RegExp(`\\b${N}\\s+(?:private\\s+|open\\s+)?rooms?\\s+(?:open|available|left|free|for)`, 'i').exec(t);
  const whole = /\b(?:whole|entire)\s+(?:\d+\s*(?:br|bd|bed\w*)\s+)?(?:house|unit|apartment|apt|place)\b/i.test(t) &&!/\b(?:my|a|one)\s+room\b/i.test(t);
  if (unit) {
    const u = numOf(unit[1]);
    if (rooms) return { beds: numOf(rooms[1]), bedsInUnit: u, from: `${rooms[0]} ... ${unit[0]}`, how: 'found' };
    if (whole) return { beds: u, bedsInUnit: u, from: unit[0], how: 'found' };
    if (/\b(?:my|a|one|private|single)\s+room\b|\broom\s+(?:in|for|available)\b/i.test(t)) return { beds: 1, bedsInUnit: u, from: unit[0], how: 'guessed' };
    return { beds: null, bedsInUnit: u, from: unit[0], how: 'found' };
  }
  if (rooms) return { beds: numOf(rooms[1]), bedsInUnit: null, from: rooms[0], how: 'found' };
  if ((m = /\b(?:my|a|one|private|single)\s+room\b/i.exec(t))) return { beds: 1, bedsInUnit: null, from: m[0], how: 'guessed' };
  return null;
}

// ------------------------------------------------------------------ streets

const TYPES = {
  st: 'street', str: 'street', street: 'street', ave: 'avenue', av: 'avenue', avenue: 'avenue', rd: 'road', road: 'road',
  dr: 'drive', drive: 'drive', blvd: 'boulevard', boulevard: 'boulevard', ct: 'court', court: 'court', pl: 'place',
  place: 'place', ln: 'lane', lane: 'lane', pkwy: 'parkway', parkway: 'parkway', way: 'way', cir: 'circle',
  circle: 'circle', ter: 'terrace', terr: 'terrace', terrace: 'terrace', hwy: 'highway', highway: 'highway',
};
const DIRS = { n: 'north', north: 'north', s: 'south', south: 'south', e: 'east', east: 'east', w: 'west', west: 'west' };
const TYPE_SHORT = { street: 'St', avenue: 'Ave', road: 'Rd', drive: 'Dr', boulevard: 'Blvd', court: 'Ct', place: 'Pl', lane: 'Ln', parkway: 'Pkwy', circle: 'Cir', terrace: 'Ter', highway: 'Hwy', way: 'Way' };
const DIR_SHORT = { north: 'N', south: 'S', east: 'E', west: 'W' };

const words = (s) => String(s).toLowerCase().replace(/['.]/g, '').split(/[^a-z0-9]+/).filter(Boolean);

// Split a phrase into { dir, base, type } with abbreviations expanded.
function splitName(phrase) {
  const w = words(phrase);
  let dir = null, type = null;
  if (w.length > 1 && DIRS[w[0]]) dir = DIRS[w.shift()];
  if (w.length > 1 && TYPES[w[w.length - 1]]) type = TYPES[w.pop()];
  return { dir, base: w.join(' '), type };
}

const indexCache = new WeakMap();

// streetIndex(geojson | features | index) -> { byName, byBase: Map base -> [entry] } with entry
// { name, dir, base, type, coords: [[lon, lat], ...] }. Cached per input object.
export function streetIndex(streets) {
  if (!streets) return { byName: new Map(), byBase: new Map() };
  if (streets.byBase) return streets;
  if (indexCache.has(streets)) return indexCache.get(streets);
  const feats = Array.isArray(streets) ? streets : streets.features || [];
  const byName = new Map();
  for (const f of feats) {
    const n = f?.properties?.n;
    if (!n || f.geometry?.type !== 'LineString') continue;
    let e = byName.get(n);
    if (!e) { e = { name: n, ...splitName(n), coords: [], segs: 0 }; byName.set(n, e); }
    for (const c of f.geometry.coordinates) e.coords.push(c);
    e.segs++;
  }
  const byBase = new Map();
  for (const e of byName.values()) {
    if (!byBase.has(e.base)) byBase.set(e.base, []);
    byBase.get(e.base).push(e);
  }
  for (const list of byBase.values()) list.sort((a, b) => b.segs - a.segs);
  const idx = { byName, byBase };
  indexCache.set(streets, idx);
  return idx;
}

// findStreet(index, 'S. State St') -> entry or null. A direction or type that is given must match;
// otherwise the street with the most segments wins ("State" is South State Street, not State Circle).
export function findStreet(index, phrase) {
  const idx = streetIndex(index);
  const p = splitName(phrase);
  if (!p.base) return null;
  const list = idx.byBase.get(p.base);
  if (!list) return null;
  const ok = list.filter((e) => (!p.dir || e.dir === p.dir) && (!p.type || e.type === p.type));
  if (ok.length) return ok[0];
  // "State St" when the data has "South State Street" and "North State Street": the direction was left out
  if (p.type && !p.dir) return list.find((e) => e.type === p.type) || null;
  return null;
}

const NOT_STREET = new Set(['the', 'a', 'an', 'my', 'our', 'your', 'campus', 'central', 'north', 'south', 'east', 'west', 'downtown',
  'it', 'this', 'that', 'here', 'there', 'me', 'us', 'them', 'bus', 'busses', 'buses', 'stop', 'and', 'or', 'of', 'in', 'on', 'at', 'to',
  'near', 'by', 'from', 'with', 'for', 'house', 'apartment', 'apt', 'room', 'rooms', 'unit', 'place', 'lease', 'sublet', 'summer',
  'winter', 'fall', 'month', 'mo', 'utilities', 'parking', 'laundry', 'street', 'st', 'ave', 'avenue', 'road', 'rd', 'way', 'main']);
const LINK = /^(?:near|at|by|off|and|&|\/|x|corner|cross|crossing|between)$/i;

// Tokens with character offsets.
function tokens(text) {
  const out = [];
  const re = /[A-Za-z0-9][A-Za-z0-9'.]*|&|\//g;
  let m;
  while ((m = re.exec(text))) out.push({ w: m[0].replace(/\.$/, ''), i: m.index, j: m.index + m[0].length });
  return out;
}

// Street mentions in order: [{ entry, number, ti (first token), tj (after last), from }]
function streetMentions(text, idx) {
  const tk = tokens(text);
  const out = [];
  const lower = (k) => (tk[k] ? tk[k].w.toLowerCase().replace(/\./g, '') : '');
  let k = 0;
  while (k < tk.length) {
    let found = null;
    // typed: [number] [dir] name{1,3} type
    for (let len = 3; len >= 1 && !found; len--) {
      let a = k;
      let number = null;
      if (/^\d{1,5}[a-z]?$/i.test(tk[a]?.w) && !/^\d{1,5}[a-z]?$/i.test(tk[a + 1]?.w || '')) { number = tk[a].w; a++; }
      let dir = DIRS[lower(a)] && tk[a + 1] ? lower(a) : null;
      const nameStart = dir ? a + 1 : a;
      const typeAt = nameStart + len;
      if (!TYPES[lower(typeAt)] || typeAt >= tk.length) continue;
      const nameWords = tk.slice(nameStart, typeAt).map((t) => t.w);
      if (nameWords.some((w) => /^\d+$/.test(w) && !/^\d+(st|nd|rd|th)$/i.test(w))) continue;
      const phrase = `${dir ? `${dir} ` : ''}${nameWords.join(' ')} ${lower(typeAt)}`;
      let entry = findStreet(idx, phrase);
      if (!entry && dir) { entry = findStreet(idx, `${nameWords.join(' ')} ${lower(typeAt)}`); }
      if (entry) {
        if (number && !/^\d{1,5}$/.test(number)) number = null;
        found = { entry, number, ti: number ? k : (dir ? nameStart - 1 : nameStart), tj: typeAt + 1 };
        if (!number && k < nameStart - (dir ? 1 : 0)) found.ti = k;
      }
    }
    // untyped, only after a cue word: "on Hill", "Hill near State", "corner of Hill and State"
    if (!found) {
      const prev = lower(k - 1), prev2 = lower(k - 2);
      const cue = ['on', 'off'].includes(prev) || (prev === 'of' && prev2 === 'corner') || LINK.test(prev)
        || (out.length && LINK.test(prev));
      if (cue) {
        for (let len = 2; len >= 1 && !found; len--) {
          let a = k;
          const dir = DIRS[lower(a)] && tk[a + 1] && !LINK.test(lower(a + 1)) ? lower(a) : null;
          const ns = dir ? a + 1 : a;
          const nameTok = tk.slice(ns, ns + len);
          if (nameTok.length < len) continue;
          const nw = nameTok.map((t) => t.w.toLowerCase());
          if (nw.some((w) => NOT_STREET.has(w) || /^\d/.test(w))) continue;
          if (lower(ns + len) === 'campus') continue;
          const entry = findStreet(idx, `${dir ? `${dir} ` : ''}${nw.join(' ')}`);
          if (entry) found = { entry, number: null, ti: k, tj: ns + len };
        }
      }
    }
    if (found) {
      found.from = text.slice(tk[found.ti].i, tk[found.tj - 1].j);
      found.linkBefore = LINK.test(lower(found.ti - 1)) || (lower(found.ti - 1) === 'of' && lower(found.ti - 2) === 'corner');
      found.gap = out.length ? found.ti - out[out.length - 1].tj : null;
      found.between = out.length ? tk.slice(out[out.length - 1].tj, found.ti).map((t) => t.w.toLowerCase()) : [];
      out.push(found);
      k = found.tj;
    } else k++;
  }
  return out;
}

const DAY_WORDS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'tues',
  'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun', 'weekdays', 'weekends', 'campus', 'facebook', 'reddit', 'craigslist']);
const titleCase = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

// A street name the map does not have, after "on" or "off": "on Packard near Hill", "on Oakland Ave".
// Returns { name, from, cross (a mention from streetMentions or null), ti, tj } or null. Only a capitalized word that
// is not a known street, month, day or common word counts, and it must be followed by a street type or by a link
// word and a known street, so "on Monday" or "on Facebook" is never read as a street.
function unknownMain(text, idx, ms) {
  const tk = tokens(text);
  const lower = (k) => (tk[k] ? tk[k].w.toLowerCase().replace(/\./g, '') : '');
  for (let k = 1; k < tk.length; k++) {
    if (!['on', 'off'].includes(lower(k - 1))) continue;
    if (ms.some((m) => m.ti <= k && k < m.tj)) continue;
    let a = k;
    const dir = DIRS[lower(a)] && /^[A-Z]/.test(tk[a + 1]?.w || '') ? DIRS[lower(a)] : null;
    if (dir) a++;
    const name = [];
    while (name.length < 2 && tk[a] && /^[A-Z][A-Za-z']+$/.test(tk[a].w) && !TYPES[lower(a)] && !LINK.test(lower(a))) {
      const w = lower(a);
      if (NOT_STREET.has(w) || DAY_WORDS.has(w) || MONTHS[w] || idx.byBase.has(w)) break;
      name.push(tk[a].w); a++;
    }
    if (!name.length) continue;
    const type = TYPES[lower(a)] ? TYPES[lower(a)] : null;
    if (type) a++;
    if (findStreet(idx, `${dir ? `${dir} ` : ''}${name.join(' ')}${type ? ` ${type}` : ''}`)) continue;
    let b = a;
    if (lower(b) === 'corner' && lower(b + 1) === 'of') b += 2;
    const linked = LINK.test(lower(b)) ? ms.find((m) => m.ti === b + 1 || m.ti === b) : null;
    if (!linked && !type) continue;
    const full = `${dir ? `${titleCase(dir)} ` : ''}${name.map(titleCase).join(' ')}${type ? ` ${titleCase(type)}` : ''}`;
    return { name: full, from: text.slice(tk[k].i, tk[a - 1].j), cross: linked || null, ti: k, tj: a };
  }
  return null;
}

// ------------------------------------------------------------------ places

const PLACE_STOP = new Set(['building', 'center', 'library', 'school', 'of', 'the', 'and', 'hall', 'market', 'commons', 'rec', 'st', 'at']);

function placeAliases(places, idx) {
  const out = [];
  for (const p of places || []) {
    const label = String(p.label || '');
    const plain = label.replace(/\s*\([^)]*\)/g, '').trim();
    const al = new Set([plain.toLowerCase(), p.id.toLowerCase()]);
    const br = label.match(/\(([^)]+)\)/);
    if (br) al.add(br[1].toLowerCase());
    if (/^Michigan\s+/.test(plain)) al.add(plain.replace(/^Michigan\s+/, '').toLowerCase());
    const first = plain.split(/\s+/)[0]?.toLowerCase().replace(/[.']/g, '');
    if (first && first.length > 3 && !PLACE_STOP.has(first) && !idx.byBase.has(first) && plain.split(/\s+/).length > 1) al.add(first);
    for (const a of al) if (a.length >= 3 && !idx.byBase.has(a)) out.push({ alias: a, place: p });
  }
  return out.sort((a, b) => b.alias.length - a.alias.length);
}

function findPlace(text, places, idx) {
  const t = text.toLowerCase();
  for (const { alias, place } of placeAliases(places, idx)) {
    const re = new RegExp(`\\b(near|by|next to|close to|across from|behind|beside|walk(?:ing)? to|min(?:ute)?s? (?:walk )?(?:to|from)|steps from|from|to)\\s+(?:the\\s+)?${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const m = re.exec(t);
    if (m) return { place, from: text.slice(m.index, m.index + m[0].length) };
  }
  return null;
}

// ------------------------------------------------------------------ geometry

const COS = Math.cos((42.28 * Math.PI) / 180);
const distM = (a, b) => Math.hypot((a[0] - b[0]) * COS * 111320, (a[1] - b[1]) * 110540);

function nearestVertex(entry, ll) {
  let best = null, bd = Infinity;
  for (const c of entry.coords) { const d = distM(c, ll); if (d < bd) { bd = d; best = c; } }
  return best ? { ll: best, d: bd } : null;
}

function meetPoint(a, b) {
  let bd = Infinity, pa = null, pb = null;
  for (const x of a.coords) for (const y of b.coords) { const d = distM(x, y); if (d < bd) { bd = d; pa = x; pb = y; } }
  return pa ? { ll: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], d: bd } : null;
}

const MEET_M = 60;

function centralCentroid(places) {
  const c = (places || []).filter((p) => p.area === 'Central');
  if (!c.length) return { lat: 42.2766, lon: -83.7382 };
  return { lat: c.reduce((s, p) => s + p.lat, 0) / c.length, lon: c.reduce((s, p) => s + p.lon, 0) / c.length };
}

const round5 = (v) => Math.round(v * 1e5) / 1e5;

// locate(listing, ctx) -> { lat, lon, how, note }. Uses listing.street, cross, place (an object with id, label,
// lat, lon). Intersection first, then a street near the named place, then the street near the student's week,
// then the place itself.
export function locate(listing, { streets, places, centroid } = {}) {
  const idx = streetIndex(streets);
  const st = listing.street ? idx.byName.get(listing.street) : null;
  const cr = listing.cross ? idx.byName.get(listing.cross) : null;
  const pl = listing.place || null;
  const ctr = centroid && Number.isFinite(centroid.lat) ? centroid : centralCentroid(places);
  const at = (ll, how, note) => ({ lat: round5(ll[1]), lon: round5(ll[0]), how, note });
  if (!st && listing.street && cr) {
    const nv = pl ? nearestVertex(cr, [pl.lon, pl.lat]) : nearestVertex(cr, [ctr.lon, ctr.lat]);
    if (nv) return at(nv.ll, 'street', `${listing.street} is not on our street map, so this is a spot on ${cr.name} near your week. Drop a pin for the house.`);
  }
  if (st && cr) {
    const mp = meetPoint(st, cr);
    if (mp && mp.d <= MEET_M) return at(mp.ll, 'intersection', `${st.name} at ${cr.name}`);
    const nv = mp ? nearestVertex(st, mp.ll) : null;
    if (nv) return at(nv.ll, 'street', `${st.name} and ${cr.name} do not meet on the map. Drop a pin for the house.`);
  }
  if (st && pl) {
    const nv = nearestVertex(st, [pl.lon, pl.lat]);
    if (nv) return at(nv.ll, 'street', `On ${st.name}, the point nearest ${pl.label}. Drop a pin for the house.`);
  }
  if (st) {
    const nv = nearestVertex(st, [ctr.lon, ctr.lat]);
    if (nv) return at(nv.ll, 'street', `Somewhere on ${st.name}; shown nearest your week. Drop a pin for the house.`);
  }
  if (pl) return { lat: pl.lat, lon: pl.lon, how: 'place', note: `Near ${pl.label}. Drop a pin for the house.` };
  return { lat: null, lon: null, how: null, note: 'No street or place in the post. Drop a pin.' };
}

// ------------------------------------------------------------------ redaction

// Strip contact details before a post is kept: emails, phone numbers, links, handles and names after
// "I'm", "my name is", "this is", or a sign-off.
export function redact(text) {
  return String(text || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]')
    .replace(/\b[a-z0-9-]+\.(?:com|net|org|io|me|co|edu|ly)(?:\/\S*)?/gi, '[link]')
    .replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone]')
    .replace(/\b\d{10}\b/g, '[phone]')
    .replace(/(^|\s)@[A-Za-z0-9_.]{2,}/g, '$1[handle]')
    .replace(/\b([Mm]y name is|MY NAME IS|I'?m|I am|[Tt]his is)\s+([A-Z][a-z]+)(?=[\s,.!]|$)(?!\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Pl|Place)\b)/g, (m0, a, n) => (/^(Subletting|Leaving|Looking|Moving|Graduating|Studying|Going|Selling|Renting|Not|Also|So|The|A|An|In|At|On|Off|Here|Back|Away|Open|Interested|Available|Done|Out|Just|Still|Only|Happy|Sure|Free)$/.test(n) ? m0 : `${a} [name]`))
    .replace(/\b(thanks|thank you|cheers|best|regards|text|dm|message|call|contact|email|venmo|reach)(,|\s)\s*([A-Z][a-z]+)(\s*[.!]?\s*)$/gi, (m0, a, sep, n, tail) => (/^(Me|Us|Here|If|For|With|Me\.)$/i.test(n) ? m0 : `${a}${sep} [name]${tail}`))
    .replace(/(\n|^)\s*[-~]\s*[A-Z][a-z]+\s*$/g, '$1');
}

// ------------------------------------------------------------------ parse

const conf = (v, how = 'found') => (v == null ? 'missing' : how);

export function parsePost(text, { streets = null, places = [], centroid = null, today = TODAY } = {}) {
  const raw = String(text || '');
  const clean = raw.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-');
  const idx = streetIndex(streets);
  const fields = [];
  const confidence = {};
  const add = (key, value, from) => { if (value != null && from) fields.push({ key, value, from: String(from).trim() }); };

  // beds first: a whole-unit total needs the unit size
  const bd = parseBeds(clean);
  const beds = bd?.beds ?? null, bedsInUnit = bd?.bedsInUnit ?? null;
  confidence.beds = conf(beds, bd?.how); confidence.bedsInUnit = conf(bedsInUnit, 'found');
  add('beds', beds === 0 ? 'studio' : bedsInUnit != null && beds != null ? `${beds} of ${bedsInUnit}` : beds ?? bedsInUnit, bd?.from);

  const rt = parseRent(clean, bedsInUnit);
  const rent = rt?.rent ?? null;
  confidence.rent = conf(rent, rt?.how);
  add('rent', rent, rt?.from);

  const ut = parseUtilities(clean);
  confidence.utilities = conf(ut?.value ?? null);
  add('utilities', ut?.value ?? null, ut?.from);

  const fu = parseFurnished(clean);
  confidence.furnished = conf(fu?.value ?? null);
  add('furnished', fu?.value ?? null, fu?.from);

  // dates and term
  const dt = parseDates(clean, today);
  const tw = parseTermWord(clean);
  let start = dt?.start ?? null, end = dt?.end ?? null, dHow = 'found';
  if (dt) add('dates', fmtRange(start, end), dt.from);
  if (!start && !end && tw) {
    [start, end] = termDates(tw.term, today);
    dHow = 'guessed';
    add('dates', fmtRange(start, end), tw.from);
  }
  confidence.start = conf(start, dHow); confidence.end = conf(end, dHow);
  let term = termOf(start, end);
  let tHow = 'found';
  if (!term && tw && !(start && end)) { term = tw.term; tHow = 'guessed'; }
  if (tw && term === tw.term) tHow = dHow === 'found' ? 'found' : 'guessed';
  if (term && !tw) tHow = 'guessed';
  confidence.term = conf(term, tHow);
  if (term) add('term', term, tw?.from || dt?.from);

  // street, cross street, number, place
  const ms = streetMentions(clean, idx);
  let street = null, cross = null, number = null, sFrom = null, cFrom = null;
  const withNum = ms.find((x) => x.number);
  // "on Packard near Hill" with no Packard on the map: keep Packard as the street; never promote the cross street
  const unk = withNum ? null : unknownMain(clean, idx, ms);
  const main = unk ? null : withNum || ms[0] || null;
  if (unk) {
    street = unk.name; sFrom = unk.from;
    if (unk.cross) { cross = unk.cross.entry.name; cFrom = unk.cross.from; }
  }
  if (main) {
    street = main.entry.name; number = main.number || null; sFrom = main.from;
    const k = ms.indexOf(main);
    const nxt = ms[k + 1];
    const prv = ms[k - 1];
    const linked = (x) => x && x.entry.name !== street && (x.gap != null && x.gap <= 3) && (x.linkBefore || x.between.some((w) => LINK.test(w)));
    if (linked(nxt)) { cross = nxt.entry.name; cFrom = nxt.from; }
    else if (prv && main.linkBefore && main.gap != null && main.gap <= 3 && prv.entry.name !== street) { cross = prv.entry.name; cFrom = prv.from; }
  }
  confidence.street = conf(street); confidence.cross = conf(cross); confidence.number = conf(number);
  add('street', street, sFrom); add('cross', cross, cFrom); if (number) add('number', number, sFrom);

  const fp = findPlace(clean, places, idx);
  const place = fp ? { id: fp.place.id, label: fp.place.label, lat: fp.place.lat, lon: fp.place.lon } : null;
  if (fp) add('place', fp.place.label, fp.from);

  const location = locate({ street, cross, place }, { streets: idx, places, centroid });
  confidence.location = location.how === 'intersection' ? 'found' : location.how ? 'guessed' : 'missing';

  return {
    rent, rentWhole: rt?.whole ?? null,
    utilities: ut?.value ?? null,
    start, end, term,
    beds, bedsInUnit,
    furnished: fu?.value ?? null,
    street, cross, number,
    place,
    location,
    contact: null,
    confidence,
    fields,
  };
}

// ------------------------------------------------------------------ dedupe

const keyPart = (s) => (s == null ? '' : String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Same street and house number (or the same pair of streets in either order), same rent, same start month.
// A post with no street falls back to its place, then to its words.
export function dedupeKey(listing, text = '') {
  let where;
  if (listing.street) {
    const other = listing.number ? `#${listing.number}` : listing.cross ? keyPart(listing.cross) : '';
    const pair = listing.number ? [keyPart(listing.street), other] : [keyPart(listing.street), other].sort();
    where = pair.join('|');
  } else if (listing.place?.id) where = `place:${listing.place.id}`;
  else where = `text:${hash(keyPart(text))}`;
  return `${where}|${listing.rent ?? ''}|${listing.start ? listing.start.slice(0, 7) : ''}`;
}

// ------------------------------------------------------------------ names and semesters

const shortStreet = (name) => {
  if (!name) return '';
  const p = splitName(name);
  const base = name.split(/\s+/).filter((w, i, a) => !(i === 0 && p.dir && DIRS[w.toLowerCase()]) && !(i === a.length - 1 && p.type && TYPES[w.toLowerCase()])).join(' ');
  return `${p.dir ? `${DIR_SHORT[p.dir]} ` : ''}${base}${p.type ? ` ${TYPE_SHORT[p.type] || ''}` : ''}`.trim();
};

// "Hill St near Church St", "1234 S State St", "Near Michigan Union", or null.
export function shortName(listing) {
  if (listing.street) {
    if (listing.number) return `${listing.number} ${shortStreet(listing.street)}`;
    if (listing.cross) return `${shortStreet(listing.street)} near ${shortStreet(listing.cross)}`;
    return shortStreet(listing.street);
  }
  if (listing.place?.label) return `Near ${listing.place.label.replace(/\s*\([^)]*\)/g, '')}`;
  return null;
}
export { shortStreet };

// covers(listing, { start, end, label }) -> { ok, note }. A few days of slack at each end.
export function covers(listing, sem, slackDays = 10) {
  const { start, end, term } = listing;
  if (!start && !end) return { ok: null, note: 'no dates in the post' };
  const s0 = dayNum(sem.start), s1 = dayNum(sem.end);
  if (end && dayNum(end) < s1 - slackDays) {
    const why = term === 'summer' ? 'summer only' : term === 'winter' ? 'winter only' : `not all of ${sem.label}`;
    return { ok: false, note: `ends ${fmtDay(end)}: ${why}` };
  }
  if (start && dayNum(start) > s0 + slackDays) {
    const why = term === 'summer' ? 'summer only' : `not all of ${sem.label}`;
    return { ok: false, note: `starts ${fmtDay(start)}: ${why}` };
  }
  if (!end) return { ok: null, note: 'no end date in the post' };
  return { ok: true, note: null };
}

// ------------------------------------------------------------------ draft

const MODE_WORDS = { transit: 'by bus', bus: 'by bus', walk: 'on foot', bike: 'by bike' };

// draftMessage({ listing, facts, student }) -> plain text under 90 words.
//   listing  parsed (and edited) listing
//   facts    { trip: { to, min, mode }, tour: { day: 'Tuesday', time: '4:30 pm' } } computed by the app (optional);
//            the trip goes in only when listing.location.how is 'intersection' or 'pin', and the time is written 4:30 PM
//   student  { firstName } typed by the student (optional; no name when empty)
export function draftMessage({ listing, facts = {}, student = {} } = {}) {
  const l = listing || {};
  const name = String(student?.firstName || '').trim().replace(/[^A-Za-z' -]/g, '').slice(0, 30);
  const what = l.beds === 0 ? 'studio' : l.bedsInUnit && l.beds && l.beds === l.bedsInUnit ? 'place' : 'room';
  let where = '';
  if (l.street) {
    if (l.number) where = ` at ${l.number} ${l.street}`;
    else if (l.cross) where = ` on ${l.street} near ${l.cross}`;
    else where = ` on ${l.street}`;
  } else if (l.place?.label) where = ` near ${l.place.label.replace(/\s*\([^)]*\)/g, '')}`;
  const parts = [`Hi, I saw your post about the ${what}${where}.`];
  // dates go in only when the post gave them (or the student typed them); a guessed span becomes the term word
  const sure = (k) => ['found', 'edited'].includes(l.confidence?.[k] ?? 'found');
  const TERM_WORDS = { summer: 'the summer', fall: 'the fall', winter: 'the winter semester', year: 'the year' };
  let when = '';
  if (l.start && l.end && sure('start') && sure('end')) when = ` for ${fmtRange(l.start, l.end)}`;
  else if (l.start && sure('start')) when = ` from ${fmtDay(l.start)}`;
  else if (l.term && TERM_WORDS[l.term]) when = ` for ${TERM_WORDS[l.term]}`;
  const price = Number.isFinite(l.rent) ? ` at $${Math.round(l.rent).toLocaleString('en-US')} a month` : '';
  parts.push(`Is it still open${when}${price}?`);
  if (name) parts.push(`I am ${name}, a U-M student.`);
  else parts.push('I am a U-M student.');
  // the trip is a fact about the house only when the house point is known: a street corner or the student's pin
  const tr = facts?.trip;
  const pointKnown = ['intersection', 'pin'].includes(l.location?.how);
  if (pointKnown && tr && tr.to && Number.isFinite(tr.min)) {
    parts.push(`${`From your place my trip to ${tr.to} is ${Math.round(tr.min)} minutes ${MODE_WORDS[tr.mode] || ''}`.trim()}.`);
  }
  const tour = facts?.tour;
  const time = tour?.time ? String(tour.time).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase()) : null;
  if (tour && tour.day && time) parts.push(`Could I see it on ${tour.day} at ${time}? Another time works too.`);
  else parts.push('Could I come see it this week?');
  parts.push(name ? `Thanks, ${name}` : 'Thanks!');
  return parts.join(' ');
}
