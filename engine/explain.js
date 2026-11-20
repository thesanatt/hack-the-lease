// Plain-words pros and cons for one home and one student.
//
// Every number here comes from the shared utility model (model.js). Under one theta (the student's median
// values from the picks) a home's monthly value splits into seven pieces:
//   rent    -(asking rent + utilities share)            roomPrice, as in decide.js
//   time    -vTime   * generalized travel hours / month  travelFeatures
//   dark    -vDark   * dark hours / month
//   strand  -vStrand * trips with no allowed way / month
//   bath, size, light   the best room's value          roomValue
// The pieces add up to model.utility exactly. A reason is a piece where this home differs from the middle
// home (the median of each piece over every home); its dollar impact is that difference. Reasons are ranked by
// dollar impact. The best room per home is the one decide.homeOption picks under theta.
//
// explainAll({ homes, weekMap, theta, cfg, places, modes, roomIds? }) -> Map homeId -> Note
// explainHome({ home, ...same }) -> Note
// compareHomes(ctx, aId, bId) -> { gap, drivers, rentToFlip, flip }   (ctx = explainContext(...))
// Note = { homeId, roomId, roomLabel, rent, total, vsMiddle, rankUnder, headline, fits: [Reason], watch: [Reason],
//          bestAlt: { homeId, gap, drivers } | null, why: Reason | null }
// Reason = { key, label, dollars (+ good for this home, $/month), text, trip: TripNote | null, absolute?, vs? }
//   vs: dollars is the difference against that home (the best alternative), filled in when the middle home shows too little
//   absolute: dollars is this home's own cost for that piece, not a difference (stranded trips the middle home shares)
// TripNote = { lead, day, time, label, mode, routes, darkMin, walkMin, stranded, text }

import { CONFIG } from './config.js';
import { PARAMS, phi, roomFeatures, utility } from './model.js';
import { homeOption, roomPrice } from './decide.js';

export const PIECES = ['rent', 'time', 'dark', 'strand', 'bath', 'size', 'light'];

const DAY = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const MODE = { walk: 'walk', bike: 'bike', transit: 'bus' };
const MIN_DOLLARS = 3;        // a difference under $3 a month is not worth a line

// ---------------------------------------------------------------- formatting (ASCII only)

export function fmtMoney(v) {
  if (v == null || !Number.isFinite(v)) return '--';
  const r = Math.round(Math.abs(v));
  return `${v < 0 && r > 0 ? '-' : ''}$${r.toLocaleString('en-US')}`;
}

export function fmtMin(min) {
  if (min == null || !Number.isFinite(min)) return '--';
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function clock(sec) {
  if (sec == null || !Number.isFinite(sec)) return '';
  const t = Math.round(sec / 60), h24 = Math.floor(t / 60) % 24, m = t % 60;
  return `${((h24 + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function hmToSec(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null;
}

const plural = (n, one, many = one === 'min' ? 'min' : `${one}s`) => `${n} ${n === 1 ? one : many}`;

function median(xs) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const h = (a.length - 1) / 2;
  return (a[Math.floor(h)] + a[Math.ceil(h)]) / 2;
}

// ---------------------------------------------------------------- pieces

// Dollar pieces of one option under theta. Sum of pieces === model.utility(theta, option).
export function pieces(theta, option) {
  const f = roomFeatures(option.room);
  const t = option.travel;
  return {
    rent: -option.rent,
    time: -theta.vTime * t.hoursPerMonth,
    dark: -theta.vDark * t.darkHoursPerMonth,
    strand: -theta.vStrand * t.strandedPerMonth,
    bath: theta.wBath * f.bath,
    size: theta.wSize * f.sizeUnits,
    light: theta.wLight * f.light,
  };
}

const sumPieces = (p) => PIECES.reduce((s, k) => s + p[k], 0);

// ---------------------------------------------------------------- trips

function placeName(places, id) {
  if (!places || id == null) return id;
  if (typeof places === 'function') return places(id) ?? id;
  if (places instanceof Map) return places.get(id)?.label ?? places.get(id)?.name ?? id;
  const p = Array.isArray(places) ? places.find((x) => x.id === id) : null;
  return p?.label ?? id;
}

function tripWhere(trip, homeId, places) {
  const to = trip.to === homeId ? 'home' : placeName(places, trip.to);
  const from = trip.from === homeId ? 'home' : (trip.label || placeName(places, trip.from));
  return trip.from === homeId ? `home to ${trip.label || to}` : `${from} to ${to}`;
}

function routeColors(trip) {
  const out = {};
  for (const r of trip.rides || []) if (r.route != null && r.color) out[r.route] = r.color.startsWith('#') ? r.color : `#${r.color}`;
  return out;
}

function routesOf(trip) {
  const rs = trip.rides?.length ? trip.rides.map((r) => r.route) : (trip.routes || []);
  return [...new Set(rs.filter((r) => r != null && r !== ''))];
}

// A trip in plain words: "Tue 11:30 PM, Late lab to home: bus 23 and 9 min on foot after dark".
export function tripNote(trip, homeId, places, what = 'dark') {
  const t = trip.depart ?? hmToSec(trip.time);
  const when = `${DAY[trip.day] || trip.day} ${clock(t)}`;
  const where = tripWhere(trip, homeId, places);
  const routes = routesOf(trip);
  const how = trip.mode === 'transit'
    ? (routes.length ? `${routes.length > 1 ? 'buses' : 'bus'} ${routes.join(' then ')}` : 'bus')
    : (MODE[trip.mode] || 'no allowed way');
  let tail = '';
  if (what === 'dark') {
    const d = Math.round(trip.darkMin || 0);
    tail = `${how}, ${plural(d, 'min')} on foot or waiting after dark`;
  } else if (what === 'long') {
    tail = `${how}, ${fmtMin((trip.sec || 0) / 60)} door to door`;
    if (trip.mode !== 'walk' && trip.walkMin >= 1) tail += ` with ${plural(Math.round(trip.walkMin), 'min')} on foot`;
  } else {
    tail = how;
  }
  return {
    day: trip.day, time: clock(t), label: trip.label, mode: trip.mode, routes, routeColors: routeColors(trip),
    darkMin: trip.darkMin || 0, walkMin: trip.walkMin || 0, stranded: !!trip.stranded,
    text: `${when}, ${where}: ${tail}`,
  };
}

// A trip with no allowed way, in plain words. The cap is the walking limit that applied to it.
function strandNote(trip, homeId, places, capMin) {
  const t = trip.depart ?? hmToSec(trip.time);
  const when = `${DAY[trip.day] || trip.day} ${clock(t)}`;
  const where = tripWhere(trip, homeId, places);
  const toHome = trip.to === homeId;
  const routes = routesOf(trip);
  const lw = Math.round(trip.longestWalkMin ?? trip.walkMin ?? 0);
  let text;
  if (!trip.mode) text = `${when}, ${where}: no way at all in the timetable window`;
  else {
    const what = toHome ? 'no bus home' : 'no bus there';
    const best = trip.mode === 'transit' && routes.length ? `the best option, bus ${routes.join(' then ')}, still needs` : 'the best option needs';
    text = `${when}, ${where}: ${what} within your ${capMin ?? '--'} min walking limit; ${best} a walk of ${lw} min`;
  }
  return {
    lead: 'No way that fits', day: trip.day, time: clock(t), label: trip.label, mode: trip.mode, routes, routeColors: routeColors(trip),
    darkMin: trip.darkMin || 0, walkMin: trip.walkMin || 0, stranded: true, text,
  };
}

// ---------------------------------------------------------------- context

// The option for one home. By default the best room under theta (decide.homeOption). roomIds (Map or object,
// homeId -> roomId) pins the room, for example to the room the ranking picked, so every panel names one room.
function optionFor(home, week, theta, cfg, roomIds) {
  const o = homeOption(home, week, theta, cfg);
  const want = roomIds ? (typeof roomIds.get === 'function' ? roomIds.get(home.id) : roomIds[home.id]) : null;
  if (want == null || o.roomId === want) return o;
  const room = (home.rooms || []).find((r) => r.id === want);
  return room ? { ...o, roomId: room.id, room, rent: roomPrice(home, room) } : o;
}

// Everything needed to explain any home: options, pieces and the middle home, computed once.
export function explainContext({ homes, weekMap, theta, cfg = CONFIG, places = null, modes = null, roomIds = null }) {
  const rows = new Map();
  for (const home of homes) {
    const week = weekMap?.get(home.id);
    if (!week) continue;
    const option = optionFor(home, week, theta, cfg, roomIds);
    const p = pieces(theta, option);
    rows.set(home.id, { home, week, option, p, u: sumPieces(p) });
  }
  const list = [...rows.values()];
  const mid = {};
  for (const k of PIECES) mid[k] = median(list.map((r) => r.p[k]));
  const midU = median(list.map((r) => r.u));
  const raw = {
    rent: median(list.map((r) => r.option.rent)),
    weeklyMin: median(list.map((r) => r.week.weeklyMin)),
    darkMin: median(list.map((r) => darkWeekMin(r.week))),
    stranded: median(list.map((r) => r.week.stranded?.length ?? 0)),
    sqft: median(list.map((r) => r.option.room.sqft)),
    light: median(list.map((r) => r.option.room.light ?? 1)),
  };
  const order = [...list].sort((a, b) => b.u - a.u).map((r) => r.home.id);
  return { rows, mid, midU, raw, order, theta, cfg, places, modes, n: list.length };
}

// Weekly dark minutes as the model counts them: walking, plus biking at darkBikeFactor, plus long dark waits.
function darkWeekMin(w, cfg = CONFIG) {
  return (w.darkWalkMin ?? 0) + cfg.darkBikeFactor * (w.darkBikeMin ?? 0) + (w.darkLongWaitMin ?? 0);
}

// ---------------------------------------------------------------- reasons

function reasonFor(key, d, row, ctx) {
  const { option, week, home } = row;
  const { raw, theta, places, modes } = ctx;
  const good = d > 0;
  const room = option.room;
  const f = roomFeatures(room);
  let label, text, trip = null;
  if (key === 'rent') {
    label = good ? 'Lower rent' : 'Higher rent';
    text = `${fmtMoney(option.rent)} a month for the ${room.label || 'room'} with utilities, ${fmtMoney(Math.abs(option.rent - raw.rent))} ${good ? 'less' : 'more'} than the middle home (${fmtMoney(raw.rent)}).`;
  } else if (key === 'time') {
    const dm = week.weeklyMin - raw.weeklyMin;
    label = good ? 'Less time getting around' : 'More time getting around';
    const side = Math.abs(dm) >= 1 ? `${fmtMin(dm)} ${dm < 0 ? 'less' : 'more'} than the middle home` : 'about the same clock time as the middle home';
    text = `${fmtMin(week.weeklyMin)} door to door a week, ${side}. At your ${fmtMoney(theta.vTime)} an hour, with walking and waiting counted heavier, that is ${fmtMoney(Math.abs(d))} a month.`;
    const longest = [...(week.trips || [])].filter((t) => t.mode).sort((a, b) => (b.sec || 0) - (a.sec || 0))[0];
    if (longest) trip = { lead: 'Longest trip', ...tripNote(longest, home.id, places, 'long') };
  } else if (key === 'dark') {
    const dm = darkWeekMin(week, ctx.cfg);
    label = good ? 'Less time outside after dark' : 'More time outside after dark';
    text = `${plural(Math.round(dm), 'min')} a week on foot, on a bike or waiting after dark, against ${Math.round(raw.darkMin)} for the middle home. Averaged over the lease dates.`;
    const darkest = [...(week.trips || [])].sort((a, b) => (b.darkMin || 0) - (a.darkMin || 0))[0];
    if (darkest && darkest.darkMin >= 0.5) trip = { lead: 'Most time after dark', ...tripNote(darkest, home.id, places, 'dark') };
  } else if (key === 'strand') {
    const n = week.stranded?.length ?? 0;
    label = n ? 'Trips with no way that fits your limits' : 'Every trip has a way that fits your limits';
    text = n
      ? `${plural(n, 'trip')} a week ${n === 1 ? 'has' : 'have'} no bus, walk or bike within your walking limits, against ${raw.stranded} for the middle home.`
      : `No trip in your week breaks your walking limits. The middle home has ${plural(raw.stranded, 'trip')} like that.`;
    if (n) {
      const st = (week.trips || []).find((t) => t.stranded);
      const late = hmToSec(modes?.lateHour);
      const cap = week.stranded[0]?.capMin
        ?? (modes ? (st.arrive != null && late != null && st.arrive > late ? modes.maxLateWalkMin : modes.maxWalkMin) : null);
      if (st) trip = strandNote(st, home.id, places, cap);
    }
  } else if (key === 'bath') {
    label = f.bath >= 1 ? 'Private bathroom' : f.bath > 0 ? 'Half bathroom' : 'Shared bathroom';
    text = `The ${room.label || 'room'} has a ${room.bath || 'shared'} bathroom, worth ${fmtMoney(Math.abs(d))} a month ${good ? 'more' : 'less'} to you than the middle home's. You value a private one at about ${fmtMoney(theta.wBath)}.`;
  } else if (key === 'size') {
    label = good ? 'Bigger room' : 'Smaller room';
    text = `The ${room.label || 'room'} is ${room.sqft} sq ft, against ${Math.round(raw.sqft)} for the middle home.`;
  } else if (key === 'light') {
    label = good ? 'More daylight' : 'Less daylight';
    text = `Daylight level ${room.light ?? 1} of 2 in the ${room.label || 'room'}, against ${raw.light} for the middle home.`;
  }
  return { key, label, dollars: d, text, trip };
}

function bestAltRow(row, ctx) {
  let best = null;
  for (const r of ctx.rows.values()) if (r !== row && (!best || r.u > best.u)) best = r;
  return best;
}

function bestAltOf(row, ctx) {
  const best = bestAltRow(row, ctx);
  if (!best) return null;
  return { homeId: best.home.id, gap: row.u - best.u, drivers: drivers(row, best) };
}

// A piece where the best alternative beats this home (d < 0: this home is worse by |d| dollars a month).
function altReason(key, d, row, alt, ctx) {
  const an = alt.home.name || alt.home.id;
  const here = row.option, there = alt.option;
  let text;
  if (key === 'rent') text = `${an} costs ${fmtMoney(there.rent)} a month with utilities, ${fmtMoney(here.rent - there.rent)} less than here.`;
  else if (key === 'time') text = `${an} takes ${fmtMin(alt.week.weeklyMin)} door to door a week against ${fmtMin(row.week.weeklyMin)} here, worth ${fmtMoney(-d)} a month to you.`;
  else if (key === 'dark') text = `${an} has ${plural(Math.round(darkWeekMin(alt.week, ctx.cfg)), 'min')} a week outside after dark against ${Math.round(darkWeekMin(row.week, ctx.cfg))} here.`;
  else if (key === 'strand') text = `${an} has ${plural(alt.week.stranded?.length ?? 0, 'trip')} with no way that fits against ${row.week.stranded?.length ?? 0} here.`;
  else if (key === 'bath') text = `The best room at ${an} has a ${there.room.bath} bathroom; here it is ${here.room.bath}. Worth ${fmtMoney(-d)} a month to you.`;
  else if (key === 'size') text = `The best room at ${an} is ${there.room.sqft} sq ft against ${here.room.sqft} here.`;
  else text = `Daylight level ${there.room.light ?? 1} of 2 at ${an} against ${here.room.light ?? 1} here.`;
  const r = reasonFor(key, d, row, ctx);
  return { key, label: `${an} does better on ${PIECE_LABEL[key]}`, dollars: d, text, trip: key === 'time' || key === 'dark' ? r.trip : null, vs: alt.home.id };
}

// Pieces that separate two homes, biggest dollar difference first (+ means a is better).
function drivers(a, b) {
  return PIECES.map((k) => ({ key: k, dollars: a.p[k] - b.p[k] })).filter((x) => Math.abs(x.dollars) >= 0.5)
    .sort((x, y) => Math.abs(y.dollars) - Math.abs(x.dollars));
}

function noteFor(row, ctx) {
  const { mid, midU } = ctx;
  const deltas = PIECES.map((k) => ({ k, d: row.p[k] - mid[k] }));
  const fits = deltas.filter((x) => x.d >= MIN_DOLLARS).sort((a, b) => b.d - a.d).slice(0, 3).map((x) => reasonFor(x.k, x.d, row, ctx));
  const watch = deltas.filter((x) => x.d <= -MIN_DOLLARS).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => reasonFor(x.k, x.d, row, ctx));
  // A trip with no way home is worth a line even when the middle home has as many.
  const nStr = row.week.stranded?.length ?? 0;
  if (nStr && !watch.some((w) => w.key === 'strand') && watch.length < 3) {
    watch.push({ ...reasonFor('strand', row.p.strand, row, ctx), absolute: true });
  }
  // So is time outside after dark that still costs real money, even when the middle home has more.
  if (-row.p.dark >= MIN_DOLLARS && !watch.some((w) => w.key === 'dark') && watch.length < 3) {
    watch.push({ ...reasonFor('dark', row.p.dark, row, ctx), label: 'Still some time outside after dark', absolute: true });
  }
  // Then where the best alternative does better, so even the top home has an honest list.
  const alt = bestAltRow(row, ctx);
  if (alt && watch.length < 2) {
    const worse = PIECES.map((k) => ({ k, d: row.p[k] - alt.p[k] }))
      .filter((x) => x.d <= -1 && !watch.some((w) => w.key === x.k)).sort((a, b) => a.d - b.d);
    for (const x of worse) {
      if (watch.length >= 2) break;
      watch.push(altReason(x.k, x.d, row, alt, ctx));
    }
  }
  const vsMiddle = row.u - midU;
  const top = vsMiddle >= 0 ? fits[0] : watch[0];
  const rankUnder = ctx.order.indexOf(row.home.id) + 1;
  const lead = Math.abs(vsMiddle) < 1
    ? 'About the same as the middle home, all in'
    : `About ${fmtMoney(Math.abs(vsMiddle))} a month ${vsMiddle > 0 ? 'better' : 'worse'} than the middle home, all in`;
  const headline = top ? `${lead}, mostly from ${top.label.toLowerCase()}.` : `${lead}.`;
  const all = [...fits, ...watch].filter((r) => !r.absolute && !r.vs).sort((a, b) => Math.abs(b.dollars) - Math.abs(a.dollars));
  return {
    homeId: row.home.id, roomId: row.option.roomId, roomLabel: row.option.room.label ?? null, rent: row.option.rent,
    total: row.u, vsMiddle, rankUnder, n: ctx.n, headline, fits, watch: watch.slice(0, 3), bestAlt: bestAltOf(row, ctx),
    why: all[0] || null,
  };
}

export function explainAll(args) {
  const ctx = explainContext(args);
  const out = new Map();
  for (const row of ctx.rows.values()) out.set(row.home.id, noteFor(row, ctx));
  Object.defineProperty(out, 'ctx', { value: ctx, enumerable: false });
  return out;
}

export function explainHome({ home, ...rest }) {
  const all = explainAll(rest);
  return all.get(home.id ?? home) ?? null;
}

// ---------------------------------------------------------------- what would flip it

const FLIP_TEXT = {
  vTime: (dir, v, v0) => `your time were worth ${dir} than ${fmtMoney(v)} an hour (your median is ${fmtMoney(v0)})`,
  vDark: (dir, v, v0) => `an hour outside after dark cost you ${dir} than ${fmtMoney(v)} (your median is ${fmtMoney(v0)})`,
  vStrand: (dir, v, v0) => `a trip with no way home cost you ${dir} than ${fmtMoney(v)} (your median is ${fmtMoney(v0)})`,
  wBath: (dir, v, v0) => `a private bathroom were worth ${dir} than ${fmtMoney(v)} a month to you (your median is ${fmtMoney(v0)})`,
  wSize: (dir, v, v0) => `10 sq ft of room were worth ${dir} than ${fmtMoney(v)} a month to you (your median is ${fmtMoney(v0)})`,
  wLight: (dir, v, v0) => `one daylight level were worth ${dir} than ${fmtMoney(v)} a month to you (your median is ${fmtMoney(v0)})`,
};

// compareHomes(ctx, aId, bId): how far a is ahead of b at the median values and what would make b win.
//   gap         U_a - U_b, $/month (+ means a is ahead)
//   drivers     [{ key, dollars }] pieces that separate them, biggest first
//   rentToFlip  how much b's monthly rent would have to fall for b to tie (only when a is ahead)
//   flip        the single value change, smallest in relative terms, that makes b come first:
//               { param, value, current, dir: 'more'|'less', text } or null
// Utility is linear in each value (U = theta . phi - rent), so each break-even is exact.
export function compareHomes(ctx, aId, bId) {
  const A = ctx.rows.get(aId), B = ctx.rows.get(bId);
  if (!A || !B) return null;
  const gap = A.u - B.u;
  const pa = phi(A.option), pb = phi(B.option);
  let flip = null;
  for (const k of PARAMS) {
    const v0 = ctx.theta[k];
    const dphi = pb[k] - pa[k];         // how much faster B gains than A per unit of theta_k
    if (Math.abs(dphi) < 1e-9) continue;
    const v = v0 + gap / dphi;          // U_a - U_b = gap - (v - v0) * dphi = 0
    if (!(v > 0) || !Number.isFinite(v)) continue;
    const rel = Math.abs(Math.log(v / v0));
    const dir = dphi > 0 ? 'more' : 'less';
    if (gap > 0 && (!flip || rel < flip.rel)) flip = { param: k, value: v, current: v0, dir, rel, text: FLIP_TEXT[k](dir, v, v0) };
  }
  // Sanity: the flip must actually reorder the two homes.
  if (flip) {
    const th = { ...ctx.theta, [flip.param]: flip.value * (flip.dir === 'more' ? 1.01 : 0.99) };
    if (!(utility(th, B.option) > utility(th, A.option))) flip = null;
  }
  return { gap, drivers: drivers(A, B), rentToFlip: gap > 0 ? gap : 0, flip };
}

// One short line for a ranking row: the biggest plus or minus against the middle home.
export function whyLine(note) {
  const w = note?.why;
  if (!w) return 'Close to the middle home on every count.';
  return `${w.dollars > 0 ? '+' : '-'}${fmtMoney(Math.abs(w.dollars))}/mo ${w.label.toLowerCase()}`;
}

export const PIECE_LABEL = {
  rent: 'rent', time: 'travel time', dark: 'time outside after dark', strand: 'trips with no way that fits',
  bath: 'bathroom', size: 'room size', light: 'daylight',
};
