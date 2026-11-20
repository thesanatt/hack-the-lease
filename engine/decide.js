// Decisions under schedule uncertainty (Me mode) and house choice for a group (Group mode).
// docs/SYSTEM_DESIGN.md sections 3.4, 6 and 10. Money is dollars per month.
//
// Utility tensor U[m, s, h] = max over rooms r of U(theta_m; home h, room r, scenario week s)
//   m = posterior draws, s = scenario weeks, h = homes.
// A room's price in Me mode is its asking rent plus an equal share of the home's utilities.
// Regret Rg[m,s,h] = max_h' U[m,s,h'] - U[m,s,h]. Homes are sorted by expected regret; P(best) is shown beside
// it because a risky home can top P(best) by chance (Rucker and Schwarzer 2015).
// Scope cuts (section 10): no SUCRA, no minimax regret, no EVPPI, no scenarioSplit.

import { CONFIG } from './config.js';
import { roomValue, travelFeatures, travelCost, utility } from './model.js';
import * as fair from './fair.js';

const NEUTRAL_ROOM = { id: null, label: 'Whole unit', sqft: 120, bath: 'shared', light: 1 };

// Price of one room in Me mode: asking rent plus an equal share of utilities.
export function roomPrice(home, room) {
  const n = home.rooms?.length || 1;
  const base = room?.asking ?? (home.rent ?? 0) / n;
  return base + (home.utilities ?? 0) / n;
}

function roomsOf(home) {
  return home.rooms?.length ? home.rooms : [{ ...NEUTRAL_ROOM, id: `${home.id}`, asking: home.rent ?? 0 }];
}

// Type 7 quantile of a sorted array.
function quantileSorted(a, q) {
  if (!a.length) return NaN;
  const h = (a.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, a.length - 1);
  return a[lo] + (h - lo) * (a[hi] - a[lo]);
}

// Build the utility tensor. Homes missing from any scenario map are left out.
// Returns { U: Float64Array(M*K*H) indexed (m*K + s)*H + h, M, K, H, homeIds, homes, roomIdx: Int16Array(M*H) }.
export function buildTensor({ homes, weeksByScenario, thetas, cfg = CONFIG }) {
  const hs = homes.filter((h) => weeksByScenario.every((w) => w.has(h.id)));
  const H = hs.length, K = weeksByScenario.length, M = thetas.length;
  // Room part does not depend on the scenario: best (value - price) per draw and home.
  const R = new Float64Array(M * H);
  const roomIdx = new Int16Array(M * H);
  const rooms = hs.map(roomsOf);
  const prices = hs.map((h, i) => rooms[i].map((r) => roomPrice(h, r)));
  for (let m = 0; m < M; m++) {
    const th = thetas[m];
    for (let h = 0; h < H; h++) {
      let best = -Infinity, bi = 0;
      const rs = rooms[h];
      for (let r = 0; r < rs.length; r++) {
        const v = roomValue(th, rs[r]) - prices[h][r];
        if (v > best) { best = v; bi = r; }
      }
      R[m * H + h] = best; roomIdx[m * H + h] = bi;
    }
  }
  // Travel part per scenario and home.
  const F = new Float64Array(K * H * 3);
  for (let s = 0; s < K; s++) {
    for (let h = 0; h < H; h++) {
      const f = travelFeatures(weeksByScenario[s].get(hs[h].id), cfg);
      const o = (s * H + h) * 3;
      F[o] = f.hoursPerMonth; F[o + 1] = f.darkHoursPerMonth; F[o + 2] = f.strandedPerMonth;
    }
  }
  const U = new Float64Array(M * K * H);
  for (let m = 0; m < M; m++) {
    const { vTime, vDark, vStrand } = thetas[m];
    for (let s = 0; s < K; s++) {
      const base = (m * K + s) * H;
      for (let h = 0; h < H; h++) {
        const o = (s * H + h) * 3;
        U[base + h] = R[m * H + h] - (vTime * F[o] + vDark * F[o + 1] + vStrand * F[o + 2]);
      }
    }
  }
  return { U, M, K, H, homeIds: hs.map((h) => h.id), homes: hs, rooms, prices, roomIdx };
}

// meRank -> [{ homeId, roomId, expRegret, pBest, meanU, lo, hi, dots }] sorted by expRegret (ascending).
// lo and hi are the 10th and 90th percentiles of monthly utility; dots are cfg.dots quantiles of monthly regret.
// roomId is the room chosen most often across draws. Extra fields: roomLabel, price.
// The returned array also carries .tensor (for evpi), .regretLeader, .pBestLeader and .leadersDiffer.
export function meRank({ homes, weeksByScenario, thetas, cfg = CONFIG }) {
  const T = buildTensor({ homes, weeksByScenario, thetas, cfg });
  const { U, M, K, H } = T;
  const N = M * K;
  const regret = Array.from({ length: H }, () => new Float64Array(N));
  const util = Array.from({ length: H }, () => new Float64Array(N));
  const wins = new Float64Array(H);
  for (let ms = 0; ms < N; ms++) {
    const base = ms * H;
    let best = -Infinity;
    for (let h = 0; h < H; h++) if (U[base + h] > best) best = U[base + h];
    let nTie = 0;
    for (let h = 0; h < H; h++) if (best - U[base + h] <= 1e-9) nTie++;
    for (let h = 0; h < H; h++) {
      const u = U[base + h];
      util[h][ms] = u;
      regret[h][ms] = best - u;
      if (best - u <= 1e-9) wins[h] += 1 / nTie;
    }
  }
  const nDots = cfg.dots ?? 50;
  const rows = [];
  for (let h = 0; h < H; h++) {
    const counts = new Map();
    for (let m = 0; m < M; m++) { const r = T.roomIdx[m * H + h]; counts.set(r, (counts.get(r) ?? 0) + 1); }
    let ri = 0, rc = -1;
    for (const [r, c] of counts) if (c > rc || (c === rc && r < ri)) { ri = r; rc = c; }
    const room = T.rooms[h][ri];
    const rg = Float64Array.from(regret[h]).sort();
    const us = Float64Array.from(util[h]).sort();
    let sumR = 0, sumU = 0;
    for (let i = 0; i < N; i++) { sumR += rg[i]; sumU += us[i]; }
    const dots = [];
    for (let i = 0; i < nDots; i++) dots.push(quantileSorted(rg, (i + 0.5) / nDots));
    rows.push({
      homeId: T.homeIds[h], roomId: room.id ?? null,
      expRegret: sumR / N, pBest: wins[h] / N, meanU: sumU / N,
      lo: quantileSorted(us, 0.1), hi: quantileSorted(us, 0.9), dots,
      roomLabel: room.label ?? null, price: T.prices[h][ri],
    });
  }
  rows.sort((a, b) => a.expRegret - b.expRegret || b.pBest - a.pBest);
  const out = rows;
  const pLead = rows.reduce((a, b) => (b.pBest > a.pBest ? b : a), rows[0] ?? null);
  Object.defineProperties(out, {
    tensor: { value: T, enumerable: false },
    regretLeader: { value: rows[0]?.homeId ?? null, enumerable: false },
    pBestLeader: { value: pLead?.homeId ?? null, enumerable: false },
    leadersDiffer: { value: !!rows[0] && rows[0].homeId !== pLead.homeId, enumerable: false },
  });
  return out;
}

// EVPI = mean_s max_h Ubar[s,h] - max_h mean_s Ubar[s,h], Ubar[s,h] = mean_m U[m,s,h]. Dollars per month, >= 0.
// Textbook decision-analysis definition. tensor: meRank(...).tensor or buildTensor(...).
export function evpi(tensor) {
  const { U, M, K, H } = tensor;
  if (!M || !K || !H) return { evpi: 0 };
  const Ubar = new Float64Array(K * H);
  for (let m = 0; m < M; m++) for (let s = 0; s < K; s++) {
    const base = (m * K + s) * H;
    for (let h = 0; h < H; h++) Ubar[s * H + h] += U[base + h] / M;
  }
  let perfect = 0;
  const colMean = new Float64Array(H);
  for (let s = 0; s < K; s++) {
    let best = -Infinity;
    for (let h = 0; h < H; h++) { const u = Ubar[s * H + h]; if (u > best) best = u; colMean[h] += u / K; }
    perfect += best / K;
  }
  let now = -Infinity;
  for (let h = 0; h < H; h++) if (colMean[h] > now) now = colMean[h];
  return { evpi: Math.max(0, perfect - now) };
}

// Expected option for one home: { homeId, roomId, rent, travel, room } with travel averaged over the given weeks
// (travel cost is linear in the features, so the mean option has the mean cost) and the best room under theta.
export function homeOption(home, weeks, theta, cfg = CONFIG) {
  const ws = Array.isArray(weeks) ? weeks : [weeks];
  const travel = { hoursPerMonth: 0, darkHoursPerMonth: 0, strandedPerMonth: 0 };
  for (const w of ws) {
    const f = travelFeatures(w, cfg);
    for (const k in travel) travel[k] += f[k] / ws.length;
  }
  let best = null;
  for (const room of roomsOf(home)) {
    const rent = roomPrice(home, room);
    const v = roomValue(theta, room) - rent;
    if (!best || v > best.v) best = { v, room, rent };
  }
  return { homeId: home.id, roomId: best.room.id ?? null, rent: best.rent, travel, room: best.room };
}

const FEATURE = { vTime: 'hoursPerMonth', vDark: 'darkHoursPerMonth', vStrand: 'strandedPerMonth' };

function asOption(x, theta, cfg) {
  if (x && x.travel && x.room) return x;
  if (x && x.home) return homeOption(x.home, x.weeks, theta, cfg);
  throw new Error('breakEven: pass an option {rent, travel, room} or {home, weeks}');
}

// Break-even value of one weight, others at the posterior mean: U_X(v) = c_X - v * G_X, so
// v* = (c_A - c_B) / (G_A - G_B), valid when G_A != G_B and v* > 0.
// Returns { param, value (null when there is no positive break-even), aboveWins, belowWins, current, winnerNow,
//   alwaysWins (only when value is null) }.
// aboveWins is the home that wins when the weight is above value ('A' or 'B').
export function breakEven(homeA, homeB, param, thetaMean, cfg = CONFIG) {
  const feat = FEATURE[param];
  if (!feat) throw new Error(`breakEven: param must be vTime, vDark or vStrand, got ${param}`);
  const A = asOption(homeA, thetaMean, cfg), B = asOption(homeB, thetaMean, cfg);
  const th0 = { ...thetaMean, [param]: 0 };
  const cA = utility(th0, A), cB = utility(th0, B);
  const gA = A.travel[feat], gB = B.travel[feat];
  const current = thetaMean[param];
  const uA = cA - current * gA, uB = cB - current * gB;
  const winnerNow = uA >= uB ? 'A' : 'B';
  const dG = gA - gB;
  // value null: the weight does not decide between the two; alwaysWins says which home wins at every value >= 0.
  if (Math.abs(dG) < 1e-9) return { param, value: null, aboveWins: null, belowWins: null, alwaysWins: winnerNow, current, winnerNow, reason: 'same exposure' };
  const v = (cA - cB) / dG;
  const aboveWins = gA < gB ? 'A' : 'B';
  const belowWins = aboveWins === 'A' ? 'B' : 'A';
  if (!(v > 0)) return { param, value: null, aboveWins: null, belowWins: null, alwaysWins: aboveWins, current, winnerNow: aboveWins, reason: 'no positive break-even' };
  return { param, value: v, aboveWins, belowWins, current, winnerNow };
}

// Mean travel cost of one member for one home. week: a WeekResult or an array of them (scenarios).
function memberCommute(theta, week, cfg) {
  const ws = Array.isArray(week) ? week : [week];
  let c = 0;
  for (const w of ws) c += travelCost(theta, travelFeatures(w, cfg)) / ws.length;
  return c;
}

function weekFor(member, homeId) {
  if (member.weekByHome) return member.weekByHome.get(homeId) ?? null;
  if (member.weeksByScenario) {
    const ws = member.weeksByScenario.map((m) => m.get(homeId)).filter(Boolean);
    return ws.length === member.weeksByScenario.length ? ws : null;
  }
  return null;
}

// groupRank({ homes, members: [{ id, theta, cap, weekByHome: Map homeId -> WeekResult | WeekResult[] }] })
//  -> per house, best first: { homeId, rank, problem, ...fair.solveHouse result, minUtility, sumUtility,
//       members: [{ id, roomIndex, roomId, rent, utilitiesShare, commute, net }], disagree }.
// Room values come from each member's own theta (model.roomValue); commute from model.travelFeatures.
// net = raw room value - rent - utilities / n - commute (comparable across houses, section 3.5).
// A house with fewer rooms than members is returned last with feasible: false, reason: 'rooms'.
// A member may give weeksByScenario: [Map] instead of weekByHome; commute is then the mean over scenarios.
export function groupRank({ homes, members, cfg = CONFIG }) {
  const n = members.length;
  const opts = { cfg };
  const cand = [], skipped = [];
  for (const home of homes) {
    const rooms = home.rooms ?? [];
    if (rooms.length < n) { skipped.push({ homeId: home.id, feasible: false, reason: 'rooms' }); continue; }
    const weeks = members.map((m) => weekFor(m, home.id));
    if (weeks.some((w) => !w)) { skipped.push({ homeId: home.id, feasible: false, reason: 'week' }); continue; }
    const problem = {
      rent: home.rent, rooms, utilities: home.utilities ?? 0, lease: home.lease === 'room' ? 'room' : 'house',
      members: members.map((m, i) => ({
        id: m.id, values: rooms.map((r) => roomValue(m.theta, r)), cap: m.cap ?? null,
        commute: memberCommute(m.theta, weeks[i], cfg),
      })),
    };
    cand.push({ home, problem });
  }
  // Solve each house once, then let fair.rankHouses order them with the precomputed result
  // (feasible by E_h high first, then infeasible by worst cap overrun, then houses with no split).
  for (const c of cand) c.problem.result = fair.solveHouse(c.problem, opts);
  const ranked = cand.length ? fair.rankHouses(cand.map((c) => c.problem), opts) : [];
  const topByMember = {};
  const out = ranked.map((r, k) => {
    const { home } = cand[r.index];
    const { result: res, ...problem } = cand[r.index].problem;
    const util = (home.utilities ?? 0) / n;
    const mem = problem.members.map((pm, i) => {
      const ri = res.assignment?.[i] ?? -1;
      const rent = ri >= 0 ? res.prices[ri] : null;
      const net = ri >= 0 ? pm.values[ri] - rent - util - pm.commute : null;
      return { id: pm.id, roomIndex: ri, roomId: ri >= 0 ? home.rooms[ri].id : null, rent, utilitiesShare: util, commute: pm.commute, net };
    });
    return {
      homeId: home.id, problem, ...res,
      splitMinUtility: res.minUtility,           // normalized, inside the split
      minUtility: r.minUtility, sumUtility: r.sumUtility, worstOverrun: r.worstOverrun,
      rank: k + 1, disagree: r.disagree, members: mem,
    };
  });
  // topByMember from fair is member id -> problem index; map it to home ids.
  const tb = ranked[0]?.topByMember ?? {};
  for (const [id, idx] of Object.entries(tb)) topByMember[id] = cand[idx]?.home.id ?? null;
  for (const o of out) o.topByMember = topByMember;
  for (const s of skipped) out.push({ ...s, rank: out.length + 1, disagree: ranked[0]?.disagree ?? false, topByMember });
  return out;
}
