// Group tour times: 30 minute slots when every member of a group can be at the chosen house together.
//
// findTourSlots(planner, { house, members, places, cfg, opts }) -> {
//   slots: [{ day, start, end, startHM, endHM, score, travelMin, penaltyMin, sameDay,
//             members: [{ id, name, origin, to: Trip, back: Trip | null }] }],
//   checked, freeSlots, feasibleSlots, daysWithSlot: [day], blockedBy: { memberId: count },
//   byDay: { day: { slots, free, feasible, busy: { memberId: slots busy }, cannotReach: { memberId: free slots they cannot make } } }, ms }
// Trip = { from, to, mode: 'walk' | 'bike' | 'bus', min, routes: [short names], depart, arrive, bufferMin }
//
// house:   { id, lat, lon, name? }   (added to the planner when it is not a point yet)
// members: [{ id, name, routine: { week: [{ days, place, start, end, label? }], modes } }]
//          Only id, name, the week and the walking limits are read. Caps and budgets are never read or returned.
// places:  optional [{ id, lat, lon }] to add missing planner points (same as week.js opts.places).
//
// Per weekday slot [s, s + 30 min] between 9:00 and 19:00 in 30 minute steps, a member can tour when:
//  1. no entry of their week overlaps the slot;
//  2. they get from where they are just before it to the house by s. "Where they are" is the place of their
//     last entry that day ending by s; with none, their first place that day; with no entry that day, the
//     place they go to most often. The trip uses planner.arriveBy(day, house, s, [origin]) and must leave
//     no earlier than that entry ends;
//  3. they reach their next entry that day on time: planner.arriveBy(day, nextPlace, nextStart, [house])
//     must leave the house no earlier than s + 30 min.
// Each trip takes the fastest allowed of walk, bike (if the member bikes) and bus. A walk-only trip, or any
// single walking leg of a bus trip, longer than maxWalkMin is not allowed (maxLateWalkMin after lateHour).
// Score = total travel minutes of the group + tightWeight x (tightMin - buffer) for every trip whose buffer
// (minutes between being free and having to leave) is under tightMin. Lower is better.
// The top slots are on different days; when fewer days have a slot, the rest are the next best slots on
// the days already used, at least `gapMin` apart from a chosen one, flagged sameDay.

import { CONFIG } from './config.js';
import { parseHM, fmtHM } from './week.js';

export const TOUR_DEFAULTS = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  from: '09:00',      // first slot start
  to: '19:00',        // last slot end
  slotMin: 30,
  stepMin: 30,
  top: 3,
  tightMin: 10,       // a buffer under this many minutes counts as a tight connection
  tightWeight: 2,     // penalty minutes per minute of buffer under tightMin
  gapMin: 60,         // same-day fallback slots stay at least this far from a chosen slot
};

const MODE_DEFAULTS = { bike: false, maxWalkMin: 30, lateHour: '22:00', maxLateWalkMin: 15 };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Per day, the entries sorted by start, with numeric times.
function dayEntries(routine, day) {
  const out = [];
  for (const e of routine?.week || []) {
    if (!(e.days || []).includes(day)) continue;
    out.push({ place: e.place, label: e.label || e.place, s: parseHM(e.start), t: parseHM(e.end) });
  }
  return out.sort((a, b) => a.s - b.s || a.t - b.t);
}

function usualPlace(routine) {
  const count = new Map();
  for (const e of routine?.week || []) count.set(e.place, (count.get(e.place) || 0) + (e.days?.length || 0));
  let best = null, n = -1;
  for (const [p, c] of count) if (c > n) { best = p; n = c; }
  return best;
}

// Longest continuous walk in a leg list (walk and transfer legs that touch are one walk).
function longestWalk(legs) {
  let best = 0, cur = 0, end = null;
  for (const l of legs) {
    const walking = (l.type === 'walk' || l.type === 'transfer') && l.sec > 0;
    if (walking) {
      cur = end != null && Math.abs(l.dep - end) <= 1 ? cur + l.sec : l.sec;
      end = l.arr;
      best = Math.max(best, cur);
    } else if (l.sec > 0) { cur = 0; end = null; }
  }
  return best;
}

// Allowed options of one arriveBy result for one origin, fastest first.
function options(planner, res, originId, modes, deadline) {
  const r = res.get(originId);
  if (!r) return [];
  const lateS = parseHM(modes.lateHour);
  const capS = (arrive) => 60 * (arrive > lateS ? modes.maxLateWalkMin : modes.maxWalkMin);
  const out = [];
  if (r.walk && Number.isFinite(r.walk.sec) && r.walk.sec <= capS(deadline)) {
    out.push({ mode: 'walk', depart: r.walk.depart, arrive: r.walk.arrive, sec: r.walk.sec, routes: [] });
  }
  if (modes.bike) {
    const b = r.bike;
    if (b && Number.isFinite(b.sec)) out.push({ mode: 'bike', depart: b.depart, arrive: b.arrive, sec: b.sec, routes: [] });
  }
  if (r.transit) {
    let j = null;
    try { j = planner.legsFor(r, originId); } catch { j = null; }
    if (j && j.legs.some((l) => l.type === 'ride') && j.arrive <= deadline + 1 && longestWalk(j.legs) <= capS(j.arrive)) {
      const routes = [...new Set(j.legs.filter((l) => l.type === 'ride').map((l) => String(l.route ?? '')).filter(Boolean))];
      out.push({ mode: 'bus', depart: j.depart, arrive: j.arrive, sec: j.arrive - j.depart, routes });
    }
  }
  return out.sort((a, b) => a.sec - b.sec);
}

// The fastest allowed option that leaves no earlier than `earliest`; null when none does.
function pick(opts, earliest) {
  for (const o of opts) if (o.depart >= earliest - 1e-9) return o;
  return null;
}

function trip(o, from, to, earliest) {
  return {
    from, to, mode: o.mode, min: Math.round(o.sec / 60), routes: o.routes,
    depart: o.depart, arrive: o.arrive, departHM: fmtHM(o.depart), arriveHM: fmtHM(o.arrive),
    bufferMin: earliest == null ? null : Math.round((o.depart - earliest) / 60),
  };
}

export function findTourSlots(planner, { house, members, places = null, cfg = CONFIG, opts = {} } = {}) {
  const t0 = now();
  const o = { ...TOUR_DEFAULTS, ...opts };
  if (!planner || !house?.id) throw new Error('tours: need a planner and a house with an id');
  if (!planner.points.has(house.id)) {
    if (!Number.isFinite(house.lat) || !Number.isFinite(house.lon)) throw new Error(`tours: house "${house.id}" is not a planner point and has no lat/lon`);
    planner.addPoint(house.id, house.lat, house.lon);
  }
  const placeList = places ? (Array.isArray(places) ? places : [...places.values()]) : [];
  const placeById = new Map(placeList.map((p) => [p.id, p]));
  const ensure = (id) => {
    if (planner.points.has(id)) return true;
    const p = placeById.get(id);
    if (!p) return false;
    planner.addPoint(p.id, p.lat, p.lon);
    return true;
  };

  const people = (members || []).map((m) => ({
    id: m.id,
    name: m.name || m.id,
    modes: { ...MODE_DEFAULTS, ...(m.routine?.modes || m.modes || {}) },
    routine: m.routine || { week: m.week || [] },
  }));
  for (const m of people) {
    m.usual = usualPlace(m.routine);
    for (const e of m.routine.week || []) if (!ensure(e.place)) throw new Error(`tours: place "${e.place}" is not a planner point`);
  }

  const slotS = o.slotMin * 60, stepS = o.stepMin * 60;
  const fromS = parseHM(o.from), toS = parseHM(o.to);
  const backCache = new Map();   // `${day}|${place}|${t}` -> allowed options per member mode set
  const blockedBy = Object.fromEntries(people.map((m) => [m.id, 0]));
  const all = [];
  const byDay = {};
  let checked = 0, freeSlots = 0;

  for (const day of o.days) {
    const plans = people.map((m) => dayEntries(m.routine, day));
    const dayStat = { slots: 0, free: 0, feasible: 0,
      busy: Object.fromEntries(people.map((m) => [m.id, 0])), cannotReach: Object.fromEntries(people.map((m) => [m.id, 0])) };
    byDay[day] = dayStat;
    for (let s = fromS; s + slotS <= toS; s += stepS) {
      const e = s + slotS;
      checked++;
      dayStat.slots++;
      // 1. everyone free during the slot
      const ctx = [];
      let free = true;
      for (let i = 0; i < people.length; i++) {
        const list = plans[i];
        if (list.some((x) => x.s < e && x.t > s)) { free = false; blockedBy[people[i].id]++; dayStat.busy[people[i].id]++; continue; }
        let prev = null, next = null;
        for (const x of list) { if (x.t <= s) prev = x; if (!next && x.s >= e) next = x; }
        const origin = prev ? prev.place : list.length ? list[0].place : people[i].usual;
        ctx.push({ prev, next, origin, originKind: prev ? 'previous' : list.length ? 'first' : 'usual' });
      }
      if (!free) continue;
      freeSlots++;
      dayStat.free++;
      // 2. one scan to the house for every member's origin
      const origins = [...new Set(ctx.map((c) => c.origin).filter(Boolean))];
      const toRes = origins.length ? planner.arriveBy(day, house.id, s, origins) : new Map();
      const rows = [];
      let ok = true;
      for (let i = 0; i < people.length && ok; i++) {
        const m = people[i], c = ctx[i];
        if (!c.origin) { ok = false; break; }
        const earliest = c.prev ? c.prev.t : -Infinity;
        const go = pick(options(planner, toRes, c.origin, m.modes, s), earliest);
        if (!go) { ok = false; blockedBy[m.id]++; dayStat.cannotReach[m.id]++; break; }
        // 3. back to the next entry on time
        let back = null;
        if (c.next) {
          const key = `${day}|${c.next.place}|${c.next.s}|${m.modes.bike ? 1 : 0}|${m.modes.maxWalkMin}|${m.modes.maxLateWalkMin}|${m.modes.lateHour}`;
          let bo = backCache.get(key);
          if (!bo) {
            const res = planner.arriveBy(day, c.next.place, c.next.s, [house.id]);
            bo = options(planner, res, house.id, m.modes, c.next.s);
            backCache.set(key, bo);
          }
          const b = pick(bo, e);
          if (!b) { ok = false; blockedBy[m.id]++; dayStat.cannotReach[m.id]++; break; }
          back = trip(b, house.id, c.next.place, e);
          back.nextLabel = c.next.label;
          back.nextHM = fmtHM(c.next.s);
        }
        const to = trip(go, c.origin, house.id, c.prev ? c.prev.t : null);
        to.prevLabel = c.prev?.label ?? null;
        rows.push({ id: m.id, name: m.name, origin: c.origin, originKind: c.originKind, to, back });
      }
      if (!ok) continue;
      dayStat.feasible++;
      let travel = 0, penalty = 0;
      for (const r of rows) {
        for (const t of [r.to, r.back]) {
          if (!t) continue;
          travel += t.min;
          if (t.bufferMin != null && t.bufferMin < o.tightMin) penalty += o.tightWeight * (o.tightMin - t.bufferMin);
        }
      }
      all.push({
        day, start: s, end: e, startHM: fmtHM(s), endHM: fmtHM(e),
        score: travel + penalty, travelMin: travel, penaltyMin: penalty, members: rows,
      });
    }
  }

  all.sort((a, b) => a.score - b.score || o.days.indexOf(a.day) - o.days.indexOf(b.day) || a.start - b.start);
  const slots = [];
  const usedDays = new Set();
  for (const x of all) {
    if (slots.length >= o.top) break;
    if (usedDays.has(x.day)) continue;
    usedDays.add(x.day);
    slots.push({ ...x, sameDay: false });
  }
  for (const x of all) {
    if (slots.length >= o.top) break;
    if (slots.some((y) => y.day === x.day && y.start === x.start)) continue;
    if (slots.some((y) => y.day === x.day && Math.abs(y.start - x.start) < o.gapMin * 60)) continue;
    slots.push({ ...x, sameDay: true });
  }
  slots.sort((a, b) => o.days.indexOf(a.day) - o.days.indexOf(b.day) || a.start - b.start);

  return {
    slots,
    checked,
    freeSlots,
    feasibleSlots: all.length,
    daysWithSlot: o.days.filter((d) => all.some((x) => x.day === d)),
    blockedBy,
    byDay,
    ms: now() - t0,
  };
}

const DAY_LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export function clock12(sec) {
  const h = Math.floor(sec / 3600) % 24, m = Math.floor((sec % 3600) / 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// Plain-text draft to the listing contact. Only the group size, the house name and the times go in.
export function tourMessage({ houseName, groupSize, slots, dates = null }) {
  const lines = slots.map((x) => {
    const d = dates?.[x.day] ? `${DAY_LONG[x.day]} ${dates[x.day]}` : DAY_LONG[x.day];
    return `- ${d}, ${clock12(x.start)} to ${clock12(x.end)}`;
  });
  return [
    'Hello,',
    '',
    `We are a group of ${groupSize} students interested in ${houseName}. Could all ${groupSize} of us tour it together?`,
    slots.length === 1 ? 'This time works for everyone:' : 'Any one of these times works for everyone:',
    '',
    ...lines,
    '',
    'Please tell us which time suits you, or suggest another.',
    '',
    'Thank you.',
  ].join('\n');
}

export { DAY_LONG };
