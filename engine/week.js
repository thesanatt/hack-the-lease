// A student's week, run through every candidate home on the real timetables.
// docs/SYSTEM_DESIGN.md sections 3.2, 6 and 10 (items 2 and 3).
//
// Per day: home to the first entry (arrive by its start), entry to entry, a home break when the gap is at
// least homeBreakMin and the round trip plus homeBreakFitMin fits, and the last entry to home (leave at its end).
// Mode choice per trip: the allowed option with the fewest generalized minutes
//   gen = ride + slackWeight*slack + mWalk*walk + mWait*wait + mBike*bike.
// Walking (transit access, transfers and egress included) above maxWalkMin is not allowed; on a trip that ends
// after lateHour the cap is maxLateWalkMin. A trip with no allowed option is stranded: it is costed at the
// best disallowed option and listed in `stranded`.
// Darkness: walk, bike and long-wait minutes outside civil daylight, averaged over cfg.termDates. The December
// timetable is the proxy for every date; only the darkness tagging of the same intervals changes per date.
// One timetable scan per distinct (day, place, time, direction) serves all homes and is cached across calls.

import { CONFIG } from './config.js';
import { rng } from './rng.js';
import { dawn, dusk, sunset, sunrise } from './solar.js';

export { dawn, dusk, sunset, sunrise };

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const MODE_DEFAULTS = { bike: false, maxWalkMin: 30, lateHour: '22:00', maxLateWalkMin: 15 };

export function parseHM(s) {
  if (typeof s === 'number') return s;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) throw new Error(`bad time: ${s}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

export function fmtHM(sec) {
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- scan cache

const MAX_KEYS = 1500;
const caches = new WeakMap();        // planner -> { map: Map key -> Map fromId -> OptionSet, order: [] }
const stats = { scans: 0, hits: 0, breakdown: 0, derived: 0, legs: 0 };

export function weekCacheStats() { return { ...stats }; }
export function clearWeekCache(planner) {
  if (planner) caches.delete(planner);
  for (const k of Object.keys(stats)) stats[k] = 0;
}

function routingKey(cfg) {
  return [cfg.walkMs, cfg.bikeMs, cfg.bikeOverheadS, cfg.maxAccessM, cfg.searchM, cfg.changeDefaultS, cfg.horizonS].join(',');
}

function cacheFor(planner) {
  let c = caches.get(planner);
  if (!c) { c = { map: new Map() }; caches.set(planner, c); }
  return c;
}

function pointOf(planner, id) {
  const p = planner.points.get(id);
  if (!p) throw new Error(`week: unknown point "${id}" (add it with planner.addPoint first, or pass opts.places)`);
  return p;
}

// OptionSet for each fromId: { walk, bike, transit } compact option records (no snapshots kept).
// dir 'arr': from each of `fromIds` to `place`, arriving by t. dir 'dep': from `place` at t to each of `fromIds`.
function query(planner, cfg, dir, day, placeId, t, fromIds) {
  const place = pointOf(planner, placeId);
  const key = `${routingKey(cfg)}|${dir}|${day}|${placeId}@${place.lat},${place.lon}|${t}`;
  const c = cacheFor(planner);
  let entry = c.map.get(key);
  if (!entry) {
    entry = new Map();
    c.map.set(key, entry);
    if (c.map.size > MAX_KEYS) c.map.delete(c.map.keys().next().value);
  }
  const missing = [];
  for (const h of fromIds) {
    const rec = entry.get(h);
    const p = pointOf(planner, h);
    if (rec && rec.lat === p.lat && rec.lon === p.lon) stats.hits++;
    else missing.push(h);
  }
  if (missing.length) {
    stats.scans++;
    const res = dir === 'arr' ? planner.arriveBy(day, placeId, t, missing) : planner.leaveAt(day, placeId, t, missing);
    for (const h of missing) {
      const r = res.get(h), p = pointOf(planner, h);
      entry.set(h, {
        lat: p.lat, lon: p.lon,
        walk: simpleOption('walk', r.walk),
        bike: simpleOption('bike', r.bike),
        transit: r.transit ? transitOption(planner, dir, day, placeId, h, t, r.transit) : null,
      });
    }
  }
  const out = new Map();
  for (const h of fromIds) out.set(h, entry.get(h));
  return out;
}

function simpleOption(mode, o) {
  if (!o || !Number.isFinite(o.sec)) return null;
  const iv = [[o.depart, o.arrive]];
  return {
    mode, depart: o.depart, arrive: o.arrive, sec: o.sec,
    walkSec: mode === 'walk' ? o.sec : 0, bikeSec: mode === 'bike' ? o.sec : 0, rideSec: 0, waitSec: 0, slackSec: 0,
    walks: mode === 'walk' ? iv : [], bikes: mode === 'bike' ? iv : [], waits: [], routes: [], rides: [],
  };
}

// Transit option record, rebuilt from the stored snapshot without a new scan. Order of preference:
// planner.legsFor (same reconstruction planner.breakdown uses, plus route names), planner.breakdown,
// transit.legsBackward / legsForward directly, and last planner.legs (one single-origin forward scan).
function transitOption(planner, dir, day, placeId, homeId, t, tr) {
  const deadline = dir === 'arr' ? t : null;
  if (typeof planner.legsFor === 'function') {
    let j = null;
    try { j = planner.legsFor(tr, homeId); } catch { j = null; }
    if (j && j.legs) {
      const rec = fromLegList(j.legs, j.depart, j.arrive, deadline);
      if (rec) { stats.breakdown++; return rec; }
    }
  }
  if (typeof planner.breakdown === 'function') {
    let b = null;
    try { b = planner.breakdown(tr, homeId); } catch { b = null; }
    if (b && Number.isFinite(b.walkSec) && Number.isFinite(b.rideSec)) {
      stats.breakdown++;
      // plan.js: walkSec already counts access, egress and transfer walking (transferSec is a part of it)
      const slackSec = Math.max(0, b.slackSec || 0);
      const arrive = dir === 'arr' ? deadline - slackSec : tr.arrive;
      return {
        mode: 'transit', depart: tr.depart, arrive, sec: arrive - tr.depart,
        walkSec: b.walkSec, bikeSec: 0, rideSec: b.rideSec, waitSec: b.waitSec || 0, slackSec,
        walks: b.walks || [], bikes: [], waits: b.waits || [], routes: [], rides: [],
      };
    }
  }
  const TT = planner.TT;
  const legsOk = dir === 'arr' ? typeof TT?.legsBackward === 'function' : typeof TT?.legsForward === 'function';
  if (legsOk && tr.snap) {
    let rec = null;
    try { rec = dir === 'arr' ? fromBackward(planner, placeId, tr, deadline) : fromForward(planner, placeId, tr, t); } catch { rec = null; }
    if (rec) { stats.derived++; return rec; }
  }
  const j = dir === 'arr' ? planner.legs(day, homeId, placeId, tr.depart) : planner.legs(day, placeId, homeId, t);
  if (!j) return null;
  stats.legs++;
  return fromLegList(j.legs, j.depart, j.arrive, deadline);
}

const compactRide = (l) => ({ route: l.route, color: l.color, headsign: l.headsign, fromName: l.fromName, toName: l.toName, dep: l.dep, arr: l.arr });

function accessSec(point, stop) {
  const a = point.access.find((x) => x.stop === stop);
  return a ? a.sec : null;
}

// Walk through a ride/transfer leg list starting at `clock`, collecting intervals.
function walkLegs(legs, clock, acc) {
  for (const leg of legs) {
    if (leg.type === 'ride') {
      if (leg.dep > clock) { acc.waits.push([clock, leg.dep]); acc.waitSec += leg.dep - clock; }
      acc.rideSec += leg.arr - leg.dep;
      if (leg.route != null) acc.routes.push(leg.route);
      acc.rides.push(compactRide(leg));
      clock = leg.arr;
    } else {
      const dur = leg.dur ?? leg.sec ?? 0;
      acc.walks.push([clock, clock + dur]); acc.walkSec += dur;
      clock += dur;
    }
  }
  return clock;
}

function fromBackward(planner, placeId, tr, deadline) {
  const j = planner.TT.legsBackward(tr.snap, tr.firstStop);
  if (!j || !j.legs.some((l) => l.type === 'ride')) return null;
  const egress = accessSec(planner.points.get(placeId), j.sinkStop);
  if (egress == null) return null;
  const acc = { walks: [[tr.depart, tr.depart + tr.accessSec]], waits: [], routes: [], rides: [], walkSec: tr.accessSec, waitSec: 0, rideSec: 0 };
  let clock = walkLegs(j.legs, tr.depart + tr.accessSec, acc);
  acc.walks.push([clock, clock + egress]); acc.walkSec += egress; clock += egress;
  const slackSec = Math.max(0, deadline - clock);
  return { mode: 'transit', depart: tr.depart, arrive: clock, sec: clock - tr.depart, bikeSec: 0, slackSec, bikes: [], ...acc };
}

function fromForward(planner, placeId, tr, t) {
  const j = planner.TT.legsForward(tr.snap, tr.lastStop);
  if (!j || !j.legs.some((l) => l.type === 'ride')) return null;
  const access = accessSec(planner.points.get(placeId), j.accessStop);
  if (access == null) return null;
  const acc = { walks: [[t, t + access]], waits: [], routes: [], rides: [], walkSec: access, waitSec: 0, rideSec: 0 };
  let clock = walkLegs(j.legs, t + access, acc);
  acc.walks.push([clock, clock + tr.egressSec]); acc.walkSec += tr.egressSec; clock += tr.egressSec;
  return { mode: 'transit', depart: t, arrive: clock, sec: clock - t, bikeSec: 0, slackSec: 0, bikes: [], ...acc };
}

// planner.legs output: [{type: walk|wait|ride|transfer, dep, arr, sec, route?}]
function fromLegList(legs, depart, arrive, deadline) {
  const acc = { walks: [], waits: [], routes: [], rides: [], walkSec: 0, waitSec: 0, rideSec: 0 };
  let nRide = 0;
  for (const l of legs) {
    if (!(l.sec > 0) && l.type !== 'ride') continue;
    if (l.type === 'walk' || l.type === 'transfer') { acc.walks.push([l.dep, l.arr]); acc.walkSec += l.sec; }
    else if (l.type === 'wait') { acc.waits.push([l.dep, l.arr]); acc.waitSec += l.sec; }
    else if (l.type === 'ride') {
      nRide++; acc.rideSec += l.sec;
      if (l.route != null) acc.routes.push(l.route);
      acc.rides.push(compactRide(l));
    }
  }
  if (!nRide) return null;
  if (deadline != null && arrive > deadline) return null; // the forward journey misses the deadline
  const slackSec = deadline != null ? deadline - arrive : 0;
  return { mode: 'transit', depart, arrive, sec: arrive - depart, bikeSec: 0, slackSec, bikes: [], ...acc };
}

// ---------------------------------------------------------------- darkness

const sunCache = new Map();
function sunTimes(date, cfg) {
  const k = `${date}|${cfg.lat}|${cfg.lon}`;
  let v = sunCache.get(k);
  if (!v) { v = { dawn: dawn(date, cfg), dusk: dusk(date, cfg) }; sunCache.set(k, v); }
  return v;
}

// Seconds of [t0, t1] outside civil daylight. Service-day seconds may pass midnight (dark until next dawn).
function darkSec(t0, t1, sun) {
  if (!(t1 > t0)) return 0;
  const ov = (a, b) => Math.max(0, Math.min(t1, b) - Math.max(t0, a));
  return ov(-Infinity, sun.dawn) + ov(sun.dusk, 86400 + sun.dawn) + ov(86400 + sun.dusk, Infinity);
}

function darkOf(opt, sun, longWaitS) {
  let w = 0, b = 0, lw = 0;
  for (const [a, z] of opt.walks) w += darkSec(a, z, sun);
  for (const [a, z] of opt.bikes) b += darkSec(a, z, sun);
  for (const [a, z] of opt.waits) if (z - a > longWaitS) lw += darkSec(a + longWaitS, z, sun);
  return { w, b, lw };
}

// ---------------------------------------------------------------- mode choice

function genSec(o, cfg) {
  return o.rideSec + cfg.slackWeight * o.slackSec + cfg.mWalk * o.walkSec + cfg.mWait * o.waitSec + cfg.mBike * o.bikeSec;
}

// Returns { opt, stranded, capMin } for one origin's OptionSet.
function choose(set, modes, cfg, filter) {
  const lateS = parseHM(modes.lateHour);
  const cands = [set.walk, modes.bike ? set.bike : null, set.transit].filter((o) => o && (!filter || filter(o)));
  let best = null, bestG = Infinity, anyBest = null, anyG = Infinity, anyCap = 0;
  for (const o of cands) {
    const g = genSec(o, cfg);
    const capMin = o.arrive > lateS ? modes.maxLateWalkMin : modes.maxWalkMin;
    const ok = o.walkSec <= capMin * 60 + 1e-9;
    if (ok && g < bestG) { best = o; bestG = g; }
    if (g < anyG) { anyBest = o; anyG = g; anyCap = capMin; }
  }
  if (best) return { opt: best, stranded: false };
  return { opt: anyBest, stranded: true, capMin: anyCap };
}

// ---------------------------------------------------------------- the week

function normModes(m) {
  return { ...MODE_DEFAULTS, ...(m || {}) };
}

function ensurePlaces(planner, routine, opts) {
  const list = opts.places ? (Array.isArray(opts.places) ? opts.places : [...opts.places.values()]) : [];
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const e of routine.week) {
    if (planner.points.has(e.place)) continue;
    const p = byId.get(e.place);
    if (!p) throw new Error(`week: place "${e.place}" is not a planner point and not in opts.places`);
    planner.addPoint(p.id, p.lat, p.lon);
  }
}

// Per day, the ordered list of entries with numeric times.
function dayPlan(routine) {
  const byDay = new Map(DAYS.map((d) => [d, []]));
  for (const e of routine.week) {
    for (const d of e.days || []) {
      if (!byDay.has(d)) throw new Error(`week: bad day "${d}" in entry ${e.id}`);
      byDay.get(d).push({ ...e, s: parseHM(e.start), t: parseHM(e.end) });
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.s - b.s || a.t - b.t);
  return byDay;
}

/**
 * evaluateWeek(planner, routine, homeIds, opts) -> Map homeId -> WeekResult
 * routine: { week: [{id, label, days, place, start, end}], modes }   (resolved: no p / alt)
 * opts: { cfg, dates: [{date, w}] (default cfg.termDates), date (single date, legacy), homeBreakMin, places }
 */
export function evaluateWeek(planner, routine, homeIds, opts = {}) {
  const cfg = opts.cfg || CONFIG;
  const modes = normModes(routine.modes);
  const dates = opts.dates || (opts.date ? [{ date: opts.date, w: 1 }] : cfg.termDates);
  const wSum = dates.reduce((s, d) => s + (d.w ?? 1), 0) || 1;
  const suns = dates.map((d) => ({ date: d.date, w: (d.w ?? 1) / wSum, sun: sunTimes(d.date, cfg) }));
  const longWaitS = cfg.longDarkWaitMin * 60;
  const breakS = (opts.homeBreakMin ?? cfg.homeBreakMin) * 60;
  const fitS = (cfg.homeBreakFitMin ?? 30) * 60;
  homeIds = [...homeIds];
  for (const h of homeIds) pointOf(planner, h);
  ensurePlaces(planner, routine, opts);

  const acc = new Map(homeIds.map((h) => [h, {
    homeId: h, weeklyMin: 0, walkMin: 0, bikeMin: 0, rideMin: 0, waitMin: 0, slackMin: 0, genMin: 0,
    darkWalkMin: 0, darkBikeMin: 0, darkLongWaitMin: 0,
    darkByDate: Object.fromEntries(dates.map((d) => [d.date, 0])),
    stranded: [], trips: [],
  }]));

  const record = (h, info, ch) => {
    const R = acc.get(h);
    const o = ch.opt;
    if (!o) {
      R.stranded.push({ day: info.day, label: info.label, time: fmtHM(info.timeS), place: info.place, kind: info.kind,
        needed: null, capMin: null, bestOption: null });
      R.trips.push({ ...info, time: fmtHM(info.timeS), mode: null, depart: null, arrive: null, sec: 0, darkMin: 0, genMin: 0, stranded: true });
      return;
    }
    let dW = 0, dB = 0, dL = 0, dMix = 0;
    for (const s of suns) {
      const d = darkOf(o, s.sun, longWaitS);
      const mix = (d.w + cfg.darkBikeFactor * d.b + d.lw) / 60;
      R.darkByDate[s.date] += mix;
      dW += s.w * d.w; dB += s.w * d.b; dL += s.w * d.lw; dMix += s.w * mix;
    }
    const g = genSec(o, cfg) / 60;
    R.weeklyMin += o.sec / 60; R.walkMin += o.walkSec / 60; R.bikeMin += o.bikeSec / 60; R.rideMin += o.rideSec / 60;
    R.waitMin += o.waitSec / 60; R.slackMin += o.slackSec / 60; R.genMin += g;
    R.darkWalkMin += dW / 60; R.darkBikeMin += dB / 60; R.darkLongWaitMin += dL / 60;
    const trip = {
      ...info, time: fmtHM(info.timeS), mode: o.mode, depart: o.depart, arrive: o.arrive, sec: o.sec,
      walkMin: o.walkSec / 60, bikeMin: o.bikeSec / 60, rideMin: o.rideSec / 60, waitMin: o.waitSec / 60,
      slackMin: o.slackSec / 60, genMin: g, darkMin: dMix, routes: o.routes, rides: o.rides, stranded: ch.stranded,
    };
    R.trips.push(trip);
    if (ch.stranded) {
      R.stranded.push({
        day: info.day, label: info.label, time: fmtHM(info.timeS), place: info.place, kind: info.kind,
        needed: o.walkSec / 60, capMin: ch.capMin,
        bestOption: { mode: o.mode, depart: o.depart, arrive: o.arrive, min: o.sec / 60, walkMin: o.walkSec / 60, routes: o.routes },
      });
    }
  };

  const plan = dayPlan(routine);
  for (const [day, list] of plan) {
    if (!list.length) continue;
    const first = list[0], last = list[list.length - 1];
    // home to the first entry
    const out = query(planner, cfg, 'arr', day, first.place, first.s, homeIds);
    for (const h of homeIds) {
      record(h, { day, kind: 'arriveBy', leg: 'toFirst', from: h, to: first.place, place: first.place, label: first.label,
        entryId: first.id, timeS: first.s }, choose(out.get(h), modes, cfg));
    }
    // between entries
    for (let i = 0; i + 1 < list.length; i++) {
      const A = list[i], B = list[i + 1];
      const gap = B.s - A.t;
      let between = null; // home-independent A -> B choice, computed lazily
      const betweenTrip = () => {
        if (between) return between;
        if (A.place === B.place) return (between = { none: true });
        if (gap > 0) {
          const s = query(planner, cfg, 'arr', day, B.place, B.s, [A.place]).get(A.place);
          const ch = choose(s, modes, cfg, (o) => o.depart >= A.t);
          if (ch.opt) return (between = { ch, info: { kind: 'arriveBy', timeS: B.s } });
        }
        const s = query(planner, cfg, 'dep', day, A.place, A.t, [B.place]).get(B.place);
        return (between = { ch: choose(s, modes, cfg), info: { kind: 'leaveAt', timeS: A.t, lateArrival: true } });
      };
      let toHome = null, back = null;
      if (gap >= breakS) {
        toHome = query(planner, cfg, 'dep', day, A.place, A.t, homeIds);
        back = query(planner, cfg, 'arr', day, B.place, B.s, homeIds);
      }
      for (const h of homeIds) {
        if (toHome) {
          const c1 = choose(toHome.get(h), modes, cfg), c2 = choose(back.get(h), modes, cfg);
          if (c1.opt && c2.opt && c1.opt.arrive + fitS <= c2.opt.depart) {
            record(h, { day, kind: 'leaveAt', leg: 'breakHome', from: A.place, to: h, place: A.place, label: A.label,
              entryId: A.id, timeS: A.t }, c1);
            record(h, { day, kind: 'arriveBy', leg: 'breakBack', from: h, to: B.place, place: B.place, label: B.label,
              entryId: B.id, timeS: B.s }, c2);
            continue;
          }
        }
        const bt = betweenTrip();
        if (bt.none) continue;
        record(h, { day, leg: 'between', from: A.place, to: B.place, place: B.place, label: B.label, entryId: B.id, ...bt.info }, bt.ch);
      }
    }
    // last entry to home
    const ret = query(planner, cfg, 'dep', day, last.place, last.t, homeIds);
    for (const h of homeIds) {
      record(h, { day, kind: 'leaveAt', leg: 'toHome', from: last.place, to: h, place: last.place, label: last.label,
        entryId: last.id, timeS: last.t }, choose(ret.get(h), modes, cfg));
    }
  }

  for (const R of acc.values()) {
    for (const k of ['weeklyMin', 'walkMin', 'bikeMin', 'rideMin', 'waitMin', 'slackMin', 'genMin', 'darkWalkMin', 'darkBikeMin', 'darkLongWaitMin']) {
      if (!Number.isFinite(R[k])) throw new Error(`week: non-finite ${k} for ${R.homeId}`);
    }
  }
  return acc;
}

// ---------------------------------------------------------------- scenario weeks

/**
 * sampleWeeks(routine, k, seed) -> [resolvedRoutine]
 * Each entry happens with probability p (default 1); when it happens, alt[j] replaces its fields (place, and
 * optionally start, end, days, label) with probability alt[j].p, else the entry stays as written.
 * Two uniforms are drawn per entry per week in a fixed order, so the same seed gives the same weeks.
 * Each routine carries attrs: { entryId: { on, alt (index or -1), place } }.
 */
export function sampleWeeks(routine, k, seed = 1) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < k; i++) {
    const week = [], attrs = {};
    for (const e of routine.week) {
      const u1 = r(), u2 = r();
      const p = e.p ?? 1;
      const on = u1 < p;
      let altIdx = -1, cum = 0;
      for (let j = 0; j < (e.alt || []).length; j++) {
        cum += e.alt[j].p ?? 0;
        if (u2 < cum) { altIdx = j; break; }
      }
      const { p: _p, alt: _alt, ...base } = e;
      let resolved = base;
      if (altIdx >= 0) {
        const { p: _ap, ...fields } = e.alt[altIdx];
        resolved = { ...base, ...fields };
      }
      attrs[e.id] = { on, alt: altIdx, place: resolved.place };
      if (on) week.push(resolved);
    }
    const { week: _w, ...rest } = routine;
    out.push({ ...rest, id: `${routine.id ?? 'week'}:s${i}`, week, attrs, weight: 1 / k });
  }
  return out;
}
