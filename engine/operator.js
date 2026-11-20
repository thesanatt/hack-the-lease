// Operator analytics on a SYNTHETIC population (docs/SYSTEM_DESIGN.md sections 3.6, 6 and 10).
// Every number here comes from made-up students, not real tenants, and every output carries label: 'SYNTHETIC'.
//
// Per-room rents are "an envy-free split for typical synthetic groups": for each house with n rooms we draw
// groups of n synthetic students, compute each member's room values from their own theta (model.roomValue),
// solve the envy-free maximin split of the whole-house rent with fair.solveHouse (caps off, commute equal within
// a house so it is left out), and report each room's rent at p10, p50 and p90 across groups. These are
// preference-based and synthetic, not market rents. The prior medians that drive them are returned with them.

import { CONFIG } from './config.js';
import { PARAMS, priorFor, samplePrior, roomValue, travelCost, travelFeatures } from './model.js';
import { rng } from './rng.js';
import * as fair from './fair.js';

export const SYNTHETIC = 'SYNTHETIC';

// Week building blocks. Assumptions, stated here (not data). Place ids are from places.json.
// Integrator: move POP_ASSUMPTIONS into config.js if the Assumptions drawer should edit them.
export const POP_ASSUMPTIONS = {
  bikeShare: 0.3,                                       // share of students who will bike (assumption)
  classStarts: ['08:30', '10:00', '11:30', '13:00'],    // U-M style 90-minute blocks
  classHours: [3, 4.5, 6],                              // time on campus per class day
  classEndLatest: '17:00',
  places: {
    Central: { class: ['angell', 'chem', 'ross'], study: ['ugli', 'hatcher'], gym: 'imsb' },
    North: { class: ['beyster', 'eecs', 'ggbrown', 'fmcrb', 'music'], study: ['dude'], gym: 'ncrb' },
    Medical: { class: ['nursing', 'uh'], study: ['thsl'], gym: 'imsb' },
  },
  jobPlace: { downtown: 'btc', campus: 'union' },       // Blake Transit Center stands in for downtown jobs
  jobTime: ['17:30', '21:00'],
  lateStudyTime: ['19:00', '23:30'],
  gymTime: ['07:00', '08:00'],
};

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

function drawShare(r, shares) {
  const keys = Object.keys(shares);
  const tot = keys.reduce((a, k) => a + shares[k], 0);
  let u = r() * tot;
  for (const k of keys) { u -= shares[k]; if (u < 0) return k; }
  return keys[keys.length - 1];
}

// One synthetic week from an archetype. Entries are already resolved (no p or alt), as week.evaluateWeek expects.
function buildWeek(r, a, A) {
  const P = A.places[a.campus];
  const week = [];
  const latest = toMin(A.classEndLatest);
  // Two class patterns: Mon Wed Fri and Tue Thu, each with its own block.
  for (const [k, days] of [['a', ['mon', 'wed', 'fri']], ['b', ['tue', 'thu']]]) {
    const start = toMin(r.pick(A.classStarts));
    const end = Math.min(latest, start + 60 * r.pick(A.classHours));
    week.push({ id: `class_${k}`, label: 'Classes', days, place: r.pick(P.class), start: toHHMM(start), end: toHHMM(end) });
  }
  const evenings = r() < 0.5 ? [['mon', 'wed'], ['tue', 'thu']] : [['tue', 'thu'], ['mon', 'wed']];
  if (a.job !== 'none') {
    week.push({ id: 'job', label: 'Job', days: evenings[0], place: A.jobPlace[a.job], start: A.jobTime[0], end: A.jobTime[1] });
  }
  if (a.lateStudy) {
    week.push({ id: 'study', label: 'Late study', days: evenings[1], place: r.pick(P.study), start: A.lateStudyTime[0], end: A.lateStudyTime[1] });
  }
  if (a.gym) {
    week.push({ id: 'gym', label: 'Gym', days: ['tue', 'thu', 'sat'], place: P.gym, start: A.gymTime[0], end: A.gymTime[1] });
  }
  return week;
}

// makePopulation({ n, seed, marginals }) -> { label: 'SYNTHETIC', n, seed, marginals, prior, students }
// Each attribute (campus, job, late study, gym) is drawn independently from its stated share in cfg.marginals.
// This is an assumption: real attributes are correlated (for example North Campus and late labs), and we do not
// fit a joint table (IPF was cut, section 10). theta ~ model prior (priorFor(), optional prior overrides).
// student = { id, label, archetype: {campus, job, lateStudy, gym, bike}, theta, routine: { week, modes } }
export function makePopulation({ n, seed = 11, marginals, prior = null, cfg = CONFIG } = {}) {
  const N = n ?? cfg.population ?? 2000;
  const M = { ...cfg.marginals, ...(marginals || {}) };
  const A = POP_ASSUMPTIONS;
  const pr = prior ?? priorFor();
  const r = rng(seed);
  const students = [];
  for (let i = 0; i < N; i++) {
    const archetype = {
      campus: drawShare(r, M.campus),
      job: drawShare(r, M.job),
      lateStudy: r() < M.lateStudy,
      gym: r() < M.gym,
      bike: r() < (M.bike ?? A.bikeShare),
    };
    const week = buildWeek(r, archetype, A);
    const theta = samplePrior(r, pr);
    students.push({
      id: `s${String(i + 1).padStart(4, '0')}`, label: SYNTHETIC, archetype, theta,
      routine: { week, modes: { bike: archetype.bike, maxWalkMin: 25, lateHour: '22:00', maxLateWalkMin: 12 } },
    });
  }
  return { label: SYNTHETIC, n: N, seed, marginals: M, prior: pr, students };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Groups of `size` distinct students drawn uniformly from the population. Deterministic per (seed, homeId),
// so the browser can rebuild the same groups that build_operator.mjs used.
export function makeGroups({ population, size, count, seed = 1, homeId = '' }) {
  const S = population.students ?? population;
  const r = rng((seed ^ hashStr(String(homeId))) >>> 0);
  const k = Math.min(size, S.length);
  const groups = [];
  for (let g = 0; g < count; g++) {
    const picked = new Set();
    while (picked.size < k) picked.add(r.int(S.length));
    groups.push([...picked].map((i) => S[i]));
  }
  return groups;
}

// The groups used for one home: size = number of rooms, count = cfg.operatorGroups.
export function groupsFor({ home, population, cfg = CONFIG, count }) {
  return makeGroups({ population, size: home.rooms.length, count: count ?? cfg.operatorGroups ?? 200, seed: population.seed ?? 1, homeId: home.id });
}

function quantile(arr, q) {
  const a = Float64Array.from(arr).sort();
  if (!a.length) return NaN;
  const h = (a.length - 1) * q, lo = Math.floor(h), hi = Math.min(lo + 1, a.length - 1);
  return a[lo] + (h - lo) * (a[hi] - a[lo]);
}

// Rescale room weights to new prior medians: theta_k = median_k * exp(sigma_k z), so a new median multiplies
// each draw by newMedian / oldMedian. Used by the wBath and wSize sliders.
function scaleTheta(theta, ratios) {
  if (!ratios) return theta;
  const t = { ...theta };
  for (const k in ratios) t[k] *= ratios[k];
  return t;
}

function applyRenovation(rooms, renovation) {
  if (!renovation) return rooms;
  const { roomId, ...change } = renovation;
  if (!rooms.some((r) => r.id === roomId)) throw new Error(`roomPricing: no room ${roomId}`);
  return rooms.map((r) => (r.id === roomId ? { ...r, ...change } : r));
}

function priceRooms(home, rooms, thetaGroups, opts) {
  const n = rooms.length;
  const prices = rooms.map(() => []);
  const welfare = [];
  let feasible = 0, negative = 0;
  for (const thetas of thetaGroups) {
    const members = thetas.slice(0, n).map((th, i) => ({ id: `m${i}`, values: rooms.map((rm) => roomValue(th, rm)), cap: null, commute: 0 }));
    const res = fair.solveHouse({ rent: home.rent, rooms, members }, opts);
    if (!res || !res.prices) continue;
    if (res.feasible) feasible++;
    if (res.negativePrice) negative++;
    res.prices.forEach((p, j) => prices[j].push(p));
    let w = 0;
    members.forEach((m, i) => { const j = res.assignment[i]; if (j >= 0) w += m.values[j]; });
    welfare.push(w);
  }
  const out = rooms.map((rm, j) => ({
    roomId: rm.id, label: rm.label ?? rm.id, asking: rm.asking ?? null,
    p10: quantile(prices[j], 0.1), p50: quantile(prices[j], 0.5), p90: quantile(prices[j], 0.9),
  }));
  return { rooms: out, welfareP50: quantile(welfare, 0.5), solved: welfare.length, feasible, negative };
}

// roomPricing({ home, groups, renovation, cfg, medians, prior, bounds })
//   groups: arrays of students (or thetas), each of size = number of rooms (see groupsFor)
//   renovation: { roomId, bath?, light?, sqft? } new feature values for one room
//   medians: optional new prior medians for room weights, e.g. { wBath: 90, wSize: 6 } (slider values)
//   prior: the prior the groups were drawn from (population.prior); default priorFor()
// -> { homeId, label: 'SYNTHETIC', rooms: [{ roomId, label, asking, p10, p50, p90 }], renovationDelta, priorMedians,
//      groups, feasibleShare, negativeShare, after? }
// renovationDelta = { roomId, roomP50: change in that room's median fair rent at the same total rent,
//                     headroom: change in the median over groups of the assigned room values (sum_i v_i) }.
export function roomPricing({ home, groups, renovation = null, cfg = CONFIG, medians = null, prior = null, bounds = null }) {
  const pr = prior ?? priorFor();
  const ratios = medians ? Object.fromEntries(Object.entries(medians).filter(([k]) => PARAMS.includes(k)).map(([k, v]) => [k, v / pr[k].median])) : null;
  const thetaGroups = groups.map((g) => g.map((s) => scaleTheta(s.theta ?? s, ratios)));
  const opts = { cfg, nonneg: cfg.nonnegRents ?? true, compensateCommute: false, ...(bounds ? { bounds } : {}) };
  const base = priceRooms(home, home.rooms, thetaGroups, opts);
  const priorMedians = {};
  for (const k of ['wBath', 'wSize', 'wLight']) priorMedians[k] = medians?.[k] ?? pr[k].median;
  const res = {
    homeId: home.id, label: SYNTHETIC, rooms: base.rooms, renovationDelta: null, priorMedians,
    groups: base.solved, feasibleShare: base.solved ? base.feasible / base.solved : 0,
    negativeShare: base.solved ? base.negative / base.solved : 0,
  };
  if (renovation) {
    const after = priceRooms(home, applyRenovation(home.rooms, renovation), thetaGroups, opts);
    const j = home.rooms.findIndex((r) => r.id === renovation.roomId);
    res.after = after.rooms;
    res.renovationDelta = {
      roomId: renovation.roomId,
      roomP50: after.rooms[j].p50 - base.rooms[j].p50,
      headroom: after.welfareP50 - base.welfareP50,
    };
  }
  return res;
}

// Archetype key used to group students in the demand map, e.g. "North, job downtown, late study, gym".
export function archetypeKey(a) {
  const parts = [a.campus, a.job === 'none' ? 'no job' : `job ${a.job}`];
  if (a.lateStudy) parts.push('late study');
  if (a.gym) parts.push('gym');
  return parts.join(', ');
}

// demandMap({ homes, population, weeksByStudent, cfg }) -> { label, students, homes: [{ homeId, top3Share,
//   firstShare, wins: [archetype keys where this home is the most common first choice], fitPremium }] }
// weeksByStudent: Map studentId -> Map homeId -> WeekResult (week.evaluateWeek on the student's routine).
// Each student values a home at its best room, priced at asking plus a utilities share (Me mode), minus travel.
// fitPremium = median over students who rank the home first of (U_first - U_second), dollars per month:
// how far that home's rent could rise before they would switch. The k-floor for small cells was cut (section 10).
export function demandMap({ homes, population, weeksByStudent, cfg = CONFIG }) {
  const S = (population.students ?? population).filter((s) => weeksByStudent.has(s.id));
  const H = homes.length;
  const top3 = new Float64Array(H), first = new Float64Array(H);
  const prem = homes.map(() => []);
  const cells = new Map(); // key -> Float64Array(H) first-choice counts
  for (const s of S) {
    const wk = weeksByStudent.get(s.id);
    const u = new Float64Array(H);
    for (let h = 0; h < H; h++) {
      const home = homes[h];
      const w = wk.get(home.id);
      if (!w) { u[h] = -Infinity; continue; }
      const n = home.rooms?.length || 1;
      let best = -Infinity;
      for (const r of home.rooms ?? []) best = Math.max(best, roomValue(s.theta, r) - ((r.asking ?? home.rent / n) + (home.utilities ?? 0) / n));
      if (!Number.isFinite(best)) best = -(home.rent + (home.utilities ?? 0));
      u[h] = best - travelCost(s.theta, travelFeatures(w, cfg));
    }
    const order = Array.from(u.keys()).sort((a, b) => u[b] - u[a]);
    for (let k = 0; k < Math.min(3, H); k++) top3[order[k]]++;
    first[order[0]]++;
    if (H > 1 && Number.isFinite(u[order[1]])) prem[order[0]].push(u[order[0]] - u[order[1]]);
    const key = archetypeKey(s.archetype);
    if (!cells.has(key)) cells.set(key, new Float64Array(H));
    cells.get(key)[order[0]]++;
  }
  const wins = homes.map(() => []);
  const size = (c) => c.reduce((a, b) => a + b, 0);
  const sorted = [...cells].sort((a, b) => size(b[1]) - size(a[1])); // largest archetype cells first
  for (const [key, c] of sorted) {
    let bi = 0;
    for (let h = 1; h < H; h++) if (c[h] > c[bi]) bi = h;
    if (c[bi] > 0) wins[bi].push(key);
  }
  const n = S.length || 1;
  return {
    label: SYNTHETIC, students: S.length,
    homes: homes.map((home, h) => ({
      homeId: home.id, top3Share: top3[h] / n, firstShare: first[h] / n, wins: wins[h],
      fitPremium: prem[h].length ? quantile(prem[h], 0.5) : null,
    })),
  };
}
