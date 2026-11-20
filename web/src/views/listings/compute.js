// Pure helpers for the Listings view: the student's week, the pasted listings as homes, the ranking with the
// You tab's starting values, and the facts that go into a draft. No React here.
import { editableWeek, modalRoutine, uncertainRoutine } from '../me/routine.js';
import { lateNights } from '../me/TopThree.jsx';
import { termOf } from '../../../../engine/listing.js';
import { meanTheta } from './fit.js';

// The semester the student needs the place for. Month-level spans; covers() allows 10 days of slack at each end.
export const SEMESTERS = {
  fall: { label: 'Fall 2027', start: '2027-09-01', end: '2027-12-15', title: 'About September 1 to mid December 2027' },
  winter: { label: 'Winter 2027', start: '2027-01-06', end: '2027-04-25', title: 'About early January to late April 2027' },
};

export const postPointId = (post) => `post-${post.id}`;

// The student's most likely week, exactly as the You tab builds it before any edit.
export function weekOf(persona) {
  return modalRoutine(editableWeek(persona), persona?.modes);
}

// Middle of the places in the student's most likely week, weighted by days there.
export function centroidOf(routine, placeById) {
  let w = 0, lat = 0, lon = 0;
  for (const e of routine?.week || []) {
    const p = placeById.get(e.place);
    if (!p) continue;
    const k = e.days?.length || 1;
    lat += p.lat * k; lon += p.lon * k; w += k;
  }
  return w ? { lat: lat / w, lon: lon / w } : null;
}

// Parsed listing plus the student's chip edits and pin.
export function effective(post, parsed) {
  if (!parsed) return null;
  const edits = post.edits || {};
  const l = { ...parsed, ...edits, confidence: { ...parsed.confidence } };
  for (const k of Object.keys(edits)) l.confidence[k] = 'edited';
  if ('start' in edits || 'end' in edits) l.term = termOf(l.start, l.end);
  if ('rent' in edits) l.rentWhole = null;
  if (post.pin) {
    l.location = { lat: post.pin.lat, lon: post.pin.lon, how: 'pin', note: 'Your pin' };
    l.confidence.location = 'edited';
  }
  return l;
}

export const routable = (l) => Number.isFinite(l?.location?.lat) && Number.isFinite(l?.location?.lon);

// A pasted listing as a home for decide.meRank: one room at the post's rent. Room features are unknown, so the
// room is the engine's neutral room (120 sq ft, shared bath, average light). Utilities marked extra are not added.
export function listingHome(post, l) {
  const id = postPointId(post);
  return {
    id, name: l.name, lat: l.location.lat, lon: l.location.lon, rent: l.rent, utilities: 0,
    rooms: [{ id: `${id}-r`, label: 'Room', sqft: 120, bath: 'shared', light: 1, asking: l.rent }],
  };
}

// The seed MeView uses for its scenario weeks; the same seed gives the same sampled weeks, so the same costs.
export const SCENARIO_SEED = 11;

// Rank pasted listings and every sample home by cost to you a month, exactly as the You tab does before any pick:
// the cost is averaged over cfg.scenarios sampled weeks (week.sampleWeeks on the uncertain routine, seed 11),
// each routed on the term dates. Hours, late nights and the draft's trip use the most likely week.
// thetas: draws from a fresh posterior (createPosterior seed 7, draws seed 3), as the You tab uses before any pick.
// dollars: the explain.js pieces a month under the mean of the draws, travel averaged over the same sampled weeks
// (rent = the ranked room's price, time, dark, strand, each a positive cost); the fit scores read them.
// Returns { rows: [{ id, kind: 'post' | 'home', postId?, name, cost, hours, late, rent, week, dollars }], weekMap }.
export function rankAll({ api, persona, routine, items, thetas }) {
  const decide = api.mod('decide');
  const week = api.mod('week');
  const cfg = api.config;
  const homes = api.data.homes;
  // every placed post is routed (the draft needs its trip); only posts with a rent are ranked
  const placed = items.filter((it) => it.l && routable(it.l));
  for (const it of placed) api.addPoint(postPointId(it.post), it.l.location.lat, it.l.location.lon);
  const posts = placed.filter((it) => Number.isFinite(it.l.rent));
  const ids = [...homes.map((h) => h.id), ...placed.map((it) => postPointId(it.post))];
  const dates = cfg.termDates;
  const weekMap = api.weekFor(routine, ids, { dates });
  if (!weekMap || !decide?.meRank || !week?.sampleWeeks) return null;
  const scen = week.sampleWeeks(uncertainRoutine(editableWeek(persona), persona?.modes), cfg.scenarios, SCENARIO_SEED);
  const weeksByScenario = scen.map((s) => api.weekFor(s, ids, { dates }));
  const listingHomes = posts.map((it) => listingHome(it.post, it.l));
  const rank = decide.meRank({ homes: [...homes, ...listingHomes], weeksByScenario, thetas, cfg });
  const postById = new Map(posts.map((it) => [postPointId(it.post), it]));
  const explain = api.mod('explain');
  const homeById = new Map([...homes, ...listingHomes].map((h) => [h.id, h]));
  const mt = meanTheta(thetas);
  const dollarsOf = (r) => {
    const h = homeById.get(r.homeId);
    if (!h || !explain?.pieces || !decide.homeOption) return null;
    const p = explain.pieces(mt, decide.homeOption(h, weeksByScenario.map((m) => m.get(r.homeId)), mt, cfg));
    return { rent: r.price, time: -p.time, dark: -p.dark, strand: -p.strand };
  };
  const rows = rank.map((r) => {
    const it = postById.get(r.homeId);
    const w = weekMap.get(r.homeId);
    return {
      id: r.homeId, kind: it ? 'post' : 'home', postId: it?.post.id, n: it?.post.n,
      name: it ? it.l.name : api.data.homeById.get(r.homeId)?.name,
      cost: -r.meanU, hours: w ? w.weeklyMin / 60 : null, late: lateNights(w), rent: r.price,
      utilitiesExtra: it ? it.l.utilities === 'extra' : false, week: w, dollars: dollarsOf(r),
    };
  }).sort((a, b) => a.cost - b.cost);
  return { rows, weekMap };
}

// The pasted posts plus the three best sample homes, in cost order.
export function shownRows(rows, nHomes = 3) {
  let k = 0;
  return rows.filter((r) => r.kind === 'post' || k++ < nHomes);
}

// One sentence on the best pasted post. Only posts that cover the chosen semester (fits(row) is not false) can be
// named best; when none does, the sentence says so.
export function bestSentence(rows, money, { fits = () => true, semLabel = 'that semester' } = {}) {
  const all = rows.filter((r) => r.kind === 'post');
  if (!all.length) return null;
  const posts = all.filter((r) => fits(r) !== false);
  if (!posts.length) return `None of your pasted posts covers ${semLabel}.`;
  const [a, b] = posts;
  if (b) return `Best of your pasted posts: ${a.name}, ${money(b.cost - a.cost)} a month less than the next.`;
  const home = rows.find((r) => r.kind === 'home');
  if (!home) return null;
  const d = home.cost - a.cost;
  return `${a.name} costs you ${money(Math.abs(d))} a month ${d >= 0 ? 'less' : 'more'} than the best sample home.`;
}

const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const plainLabel = (p) => String(p?.label || p?.id || '').replace(/\s*\([^)]*\)/g, '').trim();

// "From your place my trip to X is N minutes by bus": the place the student goes to most often in the week.
export function tripFact(week, placeById) {
  const by = new Map();
  for (const t of week?.trips || []) {
    if (t.kind !== 'arriveBy' || t.stranded || !t.mode) continue;
    if (!by.has(t.place)) by.set(t.place, []);
    by.get(t.place).push(t);
  }
  let best = null;
  for (const [place, ts] of by) if (!best || ts.length > best.ts.length) best = { place, ts };
  if (!best) return null;
  const mins = best.ts.map((t) => (t.walkMin || 0) + (t.bikeMin || 0) + (t.rideMin || 0) + (t.waitMin || 0));
  const modes = new Map();
  for (const t of best.ts) modes.set(t.mode, (modes.get(t.mode) || 0) + 1);
  const mode = [...modes].sort((a, b) => b[1] - a[1])[0][0];
  return { to: plainLabel(placeById.get(best.place)), min: Math.max(1, Math.round(median(mins))), mode };
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// The earliest tour slot in the week that the student can make (tours.js with the student as a group of one).
export function tourFact(api, l, postId, routine) {
  const tours = api.mod('tours');
  if (!tours?.findTourSlots || !routable(l)) return null;
  try {
    const res = tours.findTourSlots(api.planner, {
      house: { id: postId, lat: l.location.lat, lon: l.location.lon },
      members: [{ id: 'you', name: 'You', routine }],
      places: api.data.places, cfg: api.config,
    });
    const s = [...(res.slots || [])].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start)[0];
    if (!s) return null;
    return { day: tours.DAY_LONG[s.day], time: tours.clock12(s.start) };
  } catch (e) {
    console.warn(e);
    return null;
  }
}
