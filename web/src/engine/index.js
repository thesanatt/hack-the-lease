// The one door from the web app into the shared engine (app/engine/*.js).
//
//   const api = await createEngine({ onProgress })
//   api.data      { places, homes, homesLabel, personas, personasLabel, meta, routes, evidence: {recovery, router, lp}, operator, placeholder }
//   api.planner   plan.js Planner with every home and place already added as a point
//   api.has(name) true when engine/<name>.js exists and loaded (week, prefs, decide, fair, operator, solar, simplex)
//   api.mod(name) that module, or null
//   api.weekFor(routine, homeIds, opts) -> Map homeId -> WeekResult (week.evaluateWeek with cfg = api.config), or null
//   api.addPoint(id, lat, lon) add or move a routable point at runtime (pasted listings)
//   api.config    current config (engine/config.js CONFIG with the Assumptions drawer edits applied)
//   api.overrides the edits only
//   api.setConfig(partial)  merge edits, re-apply routing constants, notify subscribers
//   api.resetConfig()       back to CONFIG
//   api.subscribe(fn) -> unsubscribe; fn(api) runs after every config change
//   api.version   increments on every config change (use it as a memo dependency)
//   api.optionFor(home, room, week) -> { rent, travel, room, homeId, roomId } for prefs / decide / model.utility
//   api.timings   measured load times in ms
//
// import.meta.glob never fails for engine files that do not exist yet; views check api.has() and show a
// "not built yet" note instead of crashing.

import { loadAll, browserGetter } from '../../../engine/load.js';
import { CONFIG, withOverrides } from '../../../engine/config.js';
import { travelFeatures } from '../../../engine/model.js';
import { PLACEHOLDER_HOMES, PLACEHOLDER_PERSONAS } from './placeholder.js';

// node-load.js is Node-only (fs); it is excluded from the browser bundle.
const mods = import.meta.glob(['../../../engine/*.js', '!../../../engine/node-load.js']);
const baseName = (p) => p.split('/').pop().replace(/\.js$/, '');

const ROUTING_KEYS = ['walkMs', 'bikeMs', 'bikeOverheadS', 'maxAccessM', 'horizonS', 'changeDefaultS'];

export async function createEngine({ onProgress = () => {}, base = './data/' } = {}) {
  const timings = {};
  const t0 = performance.now();
  const get = browserGetter(base);
  const opt = async (path) => { try { return await get(path); } catch { return null; } };

  onProgress('Loading engine modules', 0.02);
  const loaded = {};
  await Promise.all(Object.entries(mods).map(async ([p, imp]) => {
    try { loaded[baseName(p)] = await imp(); } catch (e) { console.warn(`engine/${baseName(p)}.js failed to load`, e); }
  }));

  onProgress('Loading the TheRide and U-M timetables and the street graph', 0.08);
  const core = await loadAll(get);
  timings.coreLoad = performance.now() - t0;

  onProgress('Loading homes, personas and evidence', 0.5);
  const [homesFile, personasFile, recovery, router, lp, operator, detailsFile] = await Promise.all([
    opt('homes.json'), opt('personas.json'), opt('evidence/recovery.json'), opt('evidence/router.json'),
    opt('evidence/lp.json'), opt('operator.json'), opt('listing_details.json'),
  ]);
  const placeholder = { homes: !homesFile, personas: !personasFile };
  const hf = homesFile || PLACEHOLDER_HOMES;
  const homes = Array.isArray(hf) ? hf : hf.homes;
  const homesLabel = Array.isArray(hf) ? 'SYNTHETIC' : (hf.label || 'SYNTHETIC');
  const pf = personasFile || PLACEHOLDER_PERSONAS;
  let personas = Array.isArray(pf) ? pf : pf.personas;
  const personasLabel = Array.isArray(pf) ? 'People are FICTIONAL personas.' : (pf.label || 'People are FICTIONAL personas.');
  // golden path: jordan first
  personas = [...personas].sort((a, b) => (a.id === 'jordan' ? -1 : b.id === 'jordan' ? 1 : 0));

  const { planner, tt, meta, places } = core;
  const pts = [...homes.map((h) => [h.id, h.lat, h.lon]), ...places.map((p) => [p.id, p.lat, p.lon])];
  const t1 = performance.now();
  for (let i = 0; i < pts.length; i++) {
    planner.addPoint(...pts[i]);
    if (i % 6 === 5) {
      onProgress(`Walking trees: ${i + 1} of ${pts.length} homes and places`, 0.55 + 0.4 * (i / pts.length));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  timings.points = performance.now() - t1;
  timings.pointsCount = pts.length;
  timings.total = performance.now() - t0;

  const listeners = new Set();
  const api = {
    data: {
      places, homes, homesLabel, personas, personasLabel, meta, routes: meta.routes,
      evidence: { recovery, router, lp }, operator, placeholder,
      homeById: new Map(homes.map((h) => [h.id, h])),
      // SYNTHETIC landlord-style details per home (scripts/make_listing_details.mjs); empty if the file is missing.
      detailsById: new Map((detailsFile?.details || []).map((d) => [d.id, d])),
      placeById: new Map(places.map((p) => [p.id, p])),
    },
    planner, tt, timings,
    config: CONFIG,
    overrides: {},
    version: 0,
    has: (name) => !!loaded[name],
    mod: (name) => loaded[name] || null,
    weekFor(routine, homeIds, opts = {}) {
      const w = loaded.week;
      if (!w?.evaluateWeek) return null;
      return w.evaluateWeek(planner, routine, homeIds, { cfg: api.config, dates: api.config.termDates, ...opts });
    },
    // Add (or move) one routable point at runtime, e.g. a pasted listing. Moving drops the old walk tree;
    // week.js cache entries are keyed by lat/lon, so a moved point is routed again.
    addPoint(id, lat, lon) {
      const p = planner.points.get(id);
      if (p && (p.lat !== lat || p.lon !== lon)) planner.removePoint(id);
      return planner.addPoint(id, lat, lon);
    },
    optionFor(home, room, week) {
      const n = home.rooms?.length || 1;
      return {
        rent: (room.asking ?? home.rent / n) + (home.utilities || 0) / n,
        travel: travelFeatures(week, api.config),
        room, homeId: home.id, roomId: room.id,
      };
    },
    setConfig(partial) {
      api.overrides = { ...api.overrides, ...partial };
      for (const k of Object.keys(api.overrides)) if (api.overrides[k] === undefined) delete api.overrides[k];
      api.config = withOverrides(api.overrides, CONFIG);
      applyRouting(api);
      api.version++;
      for (const fn of listeners) fn(api);
    },
    resetConfig() { api.overrides = {}; api.setConfig({}); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  applyRouting(api);
  onProgress('Ready', 1);
  return api;
}

// Push routing constants into the live planner and timetable so drawer edits apply without a reload.
function applyRouting(api) {
  const { planner, tt, config: c } = api;
  const before = { ...planner.o };
  for (const k of ROUTING_KEYS) if (k in c && k !== 'changeDefaultS') planner.o[k] = c[k];
  if (typeof tt.setChangeDefault === 'function') tt.setChangeDefault(c.changeDefaultS);
  else tt.transferBuffer = c.changeDefaultS;
  if (before.walkMs !== planner.o.walkMs) {
    for (const p of planner.points.values()) for (const a of p.access) a.sec = Math.round(a.m / planner.o.walkMs);
  }
  // scans cached inside week.js are stale after a routing change
  const changed = ROUTING_KEYS.some((k) => before[k] !== undefined && before[k] !== planner.o[k]) || api._lastChange !== c.changeDefaultS;
  api._lastChange = c.changeDefaultS;
  if (changed) {
    const w = api.mod('week');
    if (w?.clearWeekCache) w.clearWeekCache(planner);
  }
}

export { ROUTING_KEYS };
