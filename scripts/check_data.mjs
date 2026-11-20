// Validate the data files (places, homes, personas) against the contracts and route every persona's week
// from every home on the real timetables. Run from the repo root:  node scripts/check_data.mjs
// Exit code 1 on any hard failure. Prints a summary with measured timings.

import { readFile } from 'node:fs/promises';
import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
import { PARAMS } from '../engine/model.js';

const t0 = performance.now();
const get = nodeGetter();
const fails = [];
const warns = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);

const { planner, places } = await loadAll(get);
const homesDoc = await get('homes.json');
const personas = await get('personas.json');
const tLoad = performance.now();

// ---------- schema and text checks ----------
const DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const BATHS = new Set(['shared', 'half', 'private']);
const FLOORS = new Set(['basement', '1', '2', 'attic']);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HYPE = /seamless|empower|unlock|revolutioni[sz]e|elevate|cutting-edge|robust/i;
const placeById = new Map(places.map((p) => [p.id, p]));

for (const file of ['places.json', 'homes.json', 'personas.json']) {
  const raw = await readFile(new URL(`../web/public/data/${file}`, import.meta.url), 'utf8');
  if (/[^\x00-\x7f]/.test(raw)) fail(`${file}: non-ASCII characters`);
  if (HYPE.test(raw)) fail(`${file}: hype word`);
}

if (placeById.size !== places.length) fail('places: duplicate id');
for (const p of places) {
  for (const k of ['id', 'label', 'area', 'kind', 'lat', 'lon', 'source']) if (p[k] === undefined) fail(`place ${p.id}: missing ${k}`);
  if (!(p.lat > 42.2 && p.lat < 42.35 && p.lon > -83.82 && p.lon < -83.64)) fail(`place ${p.id}: outside Ann Arbor`);
}

if (!/SYNTHETIC/.test(homesDoc.label ?? '')) fail('homes.json: label must say SYNTHETIC');
const homes = homesDoc.homes;
const homeIds = homes.map((h) => h.id);
if (new Set(homeIds).size !== homeIds.length) fail('homes: duplicate id');
for (const h of homes) {
  for (const k of ['id', 'name', 'area', 'kind', 'lat', 'lon', 'rent', 'utilities', 'rooms']) if (h[k] === undefined) fail(`home ${h.id}: missing ${k}`);
  if (!['house', 'apartment'].includes(h.kind)) fail(`home ${h.id}: bad kind`);
  if (/\d{2,}\s/.test(h.name.split(',')[0])) fail(`home ${h.id}: name looks like it has a house number`);
  let ask = 0;
  for (const r of h.rooms) {
    if (!r.id?.startsWith(h.id + 'r')) fail(`room ${r.id}: id should start with ${h.id}r`);
    if (!BATHS.has(r.bath)) fail(`room ${r.id}: bad bath ${r.bath}`);
    if (!FLOORS.has(r.floor)) fail(`room ${r.id}: bad floor ${r.floor}`);
    if (![0, 1, 2].includes(r.light)) fail(`room ${r.id}: bad light`);
    if (!(r.sqft >= 70 && r.sqft <= 300)) fail(`room ${r.id}: sqft ${r.sqft}`);
    ask += r.asking;
  }
  if (Math.abs(ask - h.rent) > 1) fail(`home ${h.id}: asking sums to ${ask}, rent ${h.rent}`);
}
const fiveRoom = homes.filter((h) => h.kind === 'house' && h.rooms.length === 5);
const irregular = homes.filter((h) => h.irregular);
if (fiveRoom.length < 4) fail(`only ${fiveRoom.length} five-room houses`);
if (irregular.length < 8 || irregular.length > 10) fail(`${irregular.length} irregular houses (want 8 to 10)`);

const personaIds = new Set();
for (const ps of personas) {
  if (personaIds.has(ps.id)) fail(`persona ${ps.id}: duplicate`);
  personaIds.add(ps.id);
  if (!/FICTIONAL/.test(ps.label ?? '')) fail(`persona ${ps.id}: label must say FICTIONAL`);
  for (const k of PARAMS) if (!(ps.theta?.[k] > 0)) fail(`persona ${ps.id}: theta.${k} missing or not positive`);
  if (!(ps.cap > 0)) fail(`persona ${ps.id}: cap`);
  for (const e of ps.week) {
    if (!placeById.has(e.place)) fail(`persona ${ps.id} entry ${e.id}: unknown place ${e.place}`);
    for (const a of e.alt ?? []) {
      if (!placeById.has(a.place)) fail(`persona ${ps.id} entry ${e.id}: unknown alt place ${a.place}`);
      if (!(a.p > 0 && a.p < 1)) fail(`persona ${ps.id} entry ${e.id}: alt p ${a.p}`);
    }
    for (const d of e.days) if (!DAYS.has(d)) fail(`persona ${ps.id} entry ${e.id}: bad day ${d}`);
    if (!HM.test(e.start) || !HM.test(e.end) || e.start >= e.end) fail(`persona ${ps.id} entry ${e.id}: bad times`);
    if (!(e.p > 0 && e.p <= 1)) fail(`persona ${ps.id} entry ${e.id}: p ${e.p}`);
  }
}
const groupPersonas = personas.filter((p) => p.group);
if (!personaIds.has('jordan')) fail('persona jordan missing (golden path)');
if (groupPersonas.length !== 5) fail(`group has ${groupPersonas.length} members, want 5`);
const tSchema = performance.now();

// ---------- routing: every persona place from every home ----------
for (const p of places) planner.addPoint(p.id, p.lat, p.lon);
for (const h of homes) planner.addPoint(h.id, h.lat, h.lon);
const tPoints = performance.now();

const usedPlaces = new Set(personas.flatMap((ps) => ps.week.flatMap((e) => [e.place, ...(e.alt ?? []).map((a) => a.place)])));
for (const h of homes) {
  const pt = planner.points.get(h.id);
  if (pt.snapM > 120) warn(`home ${h.id} snaps ${pt.snapM.toFixed(0)} m to the walk graph`);
  if (pt.access.length === 0) warn(`home ${h.id}: no bus stop within walking range`);
  for (const pl of usedPlaces) {
    const w = planner.walkSec(h.id, pl);
    if (!Number.isFinite(w)) fail(`no walk path ${h.id} -> ${pl}`);
  }
}
for (const pl of usedPlaces) {
  const pt = planner.points.get(pl);
  if (pt.snapM > 150) warn(`place ${pl} snaps ${pt.snapM.toFixed(0)} m to the walk graph`);
  if (pt.access.length === 0) warn(`place ${pl}: no bus stop within walking range`);
}

let week = null;
try { week = await import('../engine/week.js'); } catch (e) { warn(`week.js not loadable (${e.message}); using plan.js direct trips only`); }

// resolve a routine: every entry at its written place, or with alt j for one entry
const resolve = (ps, altFor = null) => ({
  modes: ps.modes,
  week: ps.week.map(({ p, alt, ...e }) => (altFor && altFor.id === e.id ? { ...e, place: alt[altFor.j].place } : e)),
});

const summary = [];
const weekByPersona = new Map();
const tRoute0 = performance.now();
for (const ps of personas) {
  const variants = [{ name: 'as written', r: resolve(ps) }];
  for (const e of ps.week) (e.alt ?? []).forEach((a, j) => variants.push({ name: `${e.id} at ${a.place}`, r: resolve(ps, { id: e.id, j }) }));
  const row = { id: ps.id, variants: [] };
  for (const v of variants) {
    const t = performance.now();
    if (week) {
      let res;
      try { res = week.evaluateWeek(planner, v.r, homeIds, { places }); } catch (e) { fail(`${ps.id} ${v.name}: evaluateWeek threw ${e.message}`); continue; }
      if (v.name === 'as written') weekByPersona.set(ps.id, res);
      const mins = homeIds.map((h) => res.get(h).weeklyMin);
      const strand = homeIds.map((h) => res.get(h).stranded.length);
      const transitTrips = homeIds.reduce((s, h) => s + res.get(h).trips.filter((x) => x.mode === 'transit').length, 0);
      for (const h of homeIds) {
        const r = res.get(h);
        if (!Number.isFinite(r.weeklyMin) || r.trips.length === 0) fail(`${ps.id} ${v.name} from ${h}: no trips or bad minutes`);
      }
      const best = homeIds[mins.indexOf(Math.min(...mins))], worst = homeIds[mins.indexOf(Math.max(...mins))];
      row.variants.push({ name: v.name, ms: performance.now() - t, minMin: Math.min(...mins), maxMin: Math.max(...mins), best, worst,
        homesWithStranded: strand.filter((s) => s > 0).length, transitTrips });
    } else {
      // fallback: one arriveBy and one leaveAt per entry and day, all homes at once
      let trips = 0, noOption = 0;
      for (const e of v.r.week) for (const d of e.days) {
        const [sh, sm] = e.start.split(':').map(Number), [eh, em] = e.end.split(':').map(Number);
        for (const m of [planner.arriveBy(d, e.place, sh * 3600 + sm * 60, homeIds), planner.leaveAt(d, e.place, eh * 3600 + em * 60, homeIds)]) {
          for (const h of homeIds) { trips++; const r = m.get(h); if (!r.walk && !r.bike && !r.transit) noOption++; }
        }
      }
      if (noOption) fail(`${ps.id} ${v.name}: ${noOption} trips with no option`);
      row.variants.push({ name: v.name, ms: performance.now() - t, trips, noOption });
    }
  }
  summary.push(row);
}
const tRoute = performance.now();

// ---------- group of five: house ranking, and a tight cap ----------
let groupReport = null;
let fair = null, decide = null;
try { fair = await import('../engine/fair.js'); decide = await import('../engine/decide.js'); } catch (e) { warn(`fair/decide not loadable (${e.message})`); }
if (week && fair && decide && groupPersonas.length === 5) {
  const tg = performance.now();
  const members = (caps) => groupPersonas.map((ps) => ({ id: ps.id, theta: ps.theta, cap: caps[ps.id], weekByHome: weekByPersona.get(ps.id) }));
  const caps0 = Object.fromEntries(groupPersonas.map((p) => [p.id, p.cap]));
  const houses = homes.filter((h) => h.kind === 'house');
  const ranked = decide.groupRank({ homes: houses, members: members(caps0) });
  const top = ranked[0];
  const topHome = homes.find((h) => h.id === top.homeId);
  groupReport = { ranked: ranked.filter((r) => r.problem).slice(0, 6), top, topHome };
  if (!top.feasible) fail(`group: top house ${top.homeId} is not feasible at the stated caps`);
  // margins: what each member pays in the top house vs their cap
  groupReport.margins = top.members.map((m) => ({ id: m.id, room: topHome.rooms[m.roomIndex]?.label, rent: m.rent, cap: caps0[m.id], slack: caps0[m.id] - m.rent }));
  // privateGap on the top house for each member after a $50 cut of that member's cap
  const cut = 50;
  groupReport.cutTests = groupPersonas.map((ps, i) => {
    const prob = { ...top.problem, members: top.problem.members.map((m, k) => (k === i ? { ...m, cap: m.cap - cut } : m)) };
    const r = fair.solveHouse(prob);
    return { id: ps.id, feasibleAfterCut: !!r.feasible, status: r.status };
  });
  const tightId = groupPersonas.reduce((a, b) => (a.cap < b.cap ? a : b)).id;
  const tight = groupReport.cutTests.find((c) => c.id === tightId);
  if (!groupReport.cutTests.some((c) => !c.feasibleAfterCut)) fail('group: no $50 cap cut makes the top house infeasible');
  if (tight.feasibleAfterCut) warn(`group: a $50 cut of ${tightId}'s cap (lowest) keeps ${top.homeId} feasible`);
  // favorite rooms differ (section 10 item 5)
  const fav = groupPersonas.map((ps) => {
    const vals = topHome.rooms.map((r) => top.problem.members.find((m) => m.id === ps.id).values[topHome.rooms.indexOf(r)]);
    return vals.indexOf(Math.max(...vals));
  });
  groupReport.distinctFavorites = new Set(fav).size;
  if (groupReport.distinctFavorites < 2) fail('group: every member has the same favorite room');
  groupReport.ms = performance.now() - tg;
}

// ---------- print ----------
const f0 = (x) => Math.round(x);
console.log(`places ${places.length}, homes ${homes.length} (${fiveRoom.length} five-room houses, ${irregular.length} irregular, ` +
  `${homes.filter((h) => h.kind === 'apartment').length} apartments), personas ${personas.length} (group ${groupPersonas.map((p) => p.id).join(', ')})`);
for (const row of summary) {
  console.log(`\n${row.id}`);
  for (const v of row.variants) {
    if ('minMin' in v) console.log(`  ${v.name.padEnd(18)} week ${f0(v.minMin)} to ${f0(v.maxMin)} min (best ${v.best}, worst ${v.worst}); ` +
      `homes with a stranded trip ${v.homesWithStranded}/${homes.length}; transit trips ${v.transitTrips}; ${f0(v.ms)} ms`);
    else console.log(`  ${v.name.padEnd(18)} ${v.trips} trips, ${v.noOption} with no option; ${f0(v.ms)} ms`);
  }
}
if (groupReport) {
  console.log('\ngroup of five, houses ranked:');
  for (const r of groupReport.ranked) console.log(`  ${r.rank}. ${r.homeId} ${homes.find((h) => h.id === r.homeId).name.padEnd(30)} feasible ${r.feasible} minU ${r.minUtility?.toFixed(0)}`);
  console.log(`top ${groupReport.top.homeId}: ` + groupReport.margins.map((m) => `${m.id} ${m.room} $${m.rent?.toFixed(0)} (cap ${m.cap}, slack ${m.slack?.toFixed(0)})`).join('; '));
  console.log('$50 cap cut on the top house: ' + groupReport.cutTests.map((c) => `${c.id} ${c.feasibleAfterCut ? 'still feasible' : 'INFEASIBLE'}`).join(', '));
  console.log(`distinct favorite rooms in the top house: ${groupReport.distinctFavorites}; group solve ${f0(groupReport.ms)} ms`);
}
console.log(`\ntimings: load ${f0(tLoad - t0)} ms, schema ${f0(tSchema - tLoad)} ms, add ${places.length + homes.length} points ${f0(tPoints - tSchema)} ms, ` +
  `route all persona weeks and alts ${f0(tRoute - tRoute0)} ms, total ${f0(performance.now() - t0)} ms`);
if (warns.length) console.log(`\nwarnings (${warns.length}):\n  ` + warns.join('\n  '));
if (fails.length) { console.log(`\nFAILED (${fails.length}):\n  ` + fails.join('\n  ')); process.exit(1); }
console.log('\nOK: all data checks passed');
