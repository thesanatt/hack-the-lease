// Fair division for a friend group renting one house: room assignment plus an envy-free maximin rent split.
//
// Method (docs/SYSTEM_DESIGN.md sections 3.5 and 10 item 5):
// - Every envy-free split uses a welfare-maximizing assignment (Svensson 1983). We enumerate all of them
//   (n <= cfg.maxMembers) and solve one small LP per assignment, so ties cannot hide a feasible split
//   [Procaccia2018, Example 1].
// - Core LP per assignment: maximize t (free) s.t. t <= u_i, envy-free rows, sum of rents = R, rent <= cap.
// - Caps infeasible: phase 1 minimizes the worst cap overrun z over every efficient assignment; phase 2
//   maximizes t over every efficient assignment whose z is within tolerance of z*.
// - Values are Spliddit-normalized: vt_ij = v_ij - mean_j(v_ij) + R/n. Commute compensation, when on, adds
//   -c_i to the maximin rows only; envy-free rows never see it.
// - Whole-house lease (default): the group pays all of R. Rooms left over are common space: not assigned,
//   priced 0, no envy against them, their cost is inside R. Per-room lease (problem.lease = 'room'): rooms left
//   over are priced at their `asking` rent, R' = R - their asking, members must not envy them at that price.
// - Certificate: envy matrix, per-pair margins, the maxislack LP (robustSlack, shown only above $1)
//   [Peters2022 Prop 3.1], the EF rate over posterior samples, and an independent checker.

import { CONFIG } from './config.js';
import { solveLP } from './simplex.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const TOL = 1e-6;

// ---------- helpers ----------

function normalizedValues(problem, normalize) {
  const n = problem.members.length;
  const R = problem.rent;
  return problem.members.map((mem) => {
    const v = mem.values.map(Number);
    if (!normalize) return v.slice();
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return v.map((x) => x - mean + R / n);
  });
}

// All injections of members into rooms, as arrays sigma[i] = room index.
function forEachInjection(n, m, fn) {
  const sigma = new Array(n);
  const used = new Uint8Array(m);
  const rec = (i) => {
    if (i === n) { fn(sigma); return; }
    for (let j = 0; j < m; j++) {
      if (used[j]) continue;
      used[j] = 1;
      sigma[i] = j;
      rec(i + 1);
      used[j] = 0;
    }
  };
  rec(0);
}

function efficientAssignments(values, m, cfg) {
  const n = values.length;
  let maxAbs = 0;
  for (const row of values) for (const x of row) maxAbs = Math.max(maxAbs, Math.abs(x));
  const tol = cfg.welfareTieTol * (1 + maxAbs);
  let best = -Infinity;
  forEachInjection(n, m, (s) => {
    let w = 0;
    for (let i = 0; i < n; i++) w += values[i][s[i]];
    if (w > best) best = w;
  });
  const out = [];
  forEachInjection(n, m, (s) => {
    let w = 0;
    for (let i = 0; i < n; i++) w += values[i][s[i]];
    if (w >= best - tol) out.push(s.slice());
  });
  return out;
}

function allInjections(n, m) {
  const out = [];
  forEachInjection(n, m, (s) => out.push(s.slice()));
  return out;
}

// Build the shared constraint block for one assignment. Variables: q_0..q_{n-1} (rent of member i's room)
// followed by `extra` extra variables (t, z or s). Returns rows in solveLP form.
function baseRows(ctx, sigma, extra) {
  const { n, vt, lease, unassignedOf, asking, rentAssigned } = ctx;
  const N = n + extra;
  const Aub = [];
  const bub = [];
  // envy-free between members: q_i - q_k <= vt_i,s(i) - vt_i,s(k)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const row = new Array(N).fill(0);
      row[i] = 1;
      row[k] = -1;
      Aub.push(row);
      bub.push(vt[i][sigma[i]] - vt[i][sigma[k]]);
    }
  }
  // per-room lease: no envy against an unassigned room at its asking rent
  if (lease === 'room') {
    for (const j of unassignedOf(sigma)) {
      for (let i = 0; i < n; i++) {
        const row = new Array(N).fill(0);
        row[i] = 1;
        Aub.push(row);
        bub.push(vt[i][sigma[i]] - vt[i][j] + asking[j]);
      }
    }
  }
  const eqRow = new Array(N).fill(0);
  for (let i = 0; i < n; i++) eqRow[i] = 1;
  const Aeq = [eqRow];
  const beq = [rentAssigned(sigma)];
  return { N, Aub, bub, Aeq, beq };
}

function priceBounds(ctx, sigma, N, nonneg, freeExtra) {
  const lb = new Array(N).fill(null);
  const ub = new Array(N).fill(null);
  for (let i = 0; i < ctx.n; i++) {
    let lo = nonneg ? 0 : null;
    let hi = null;
    const bd = ctx.bounds ? ctx.bounds[sigma[i]] : null;
    if (bd) {
      if (finiteNum(bd.lo)) lo = lo === null ? bd.lo : Math.max(lo, bd.lo);
      if (finiteNum(bd.hi)) hi = bd.hi;
    }
    lb[i] = lo;
    ub[i] = hi;
  }
  for (let k = ctx.n; k < N; k++) lb[k] = freeExtra[k - ctx.n] ? null : 0;
  return { lb, ub };
}

function finiteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function addCapRows(ctx, A, b, N, relax, zIndex = -1) {
  for (let i = 0; i < ctx.n; i++) {
    const cap = ctx.caps[i];
    if (!finiteNum(cap)) continue;
    const row = new Array(N).fill(0);
    row[i] = 1;
    if (zIndex >= 0) row[zIndex] = -1;
    A.push(row);
    b.push(cap + relax);
  }
}

// Core maximin LP. Returns { status, q, t }.
function coreLP(ctx, sigma, { nonneg, capRelax = 0, useCaps = true }) {
  const { N, Aub, bub, Aeq, beq } = baseRows(ctx, sigma, 1);
  const T = ctx.n;
  for (let i = 0; i < ctx.n; i++) {
    const row = new Array(N).fill(0);
    row[T] = 1;
    row[i] = 1;
    Aub.push(row);
    bub.push(ctx.vt[i][sigma[i]] - ctx.cc[i]);
  }
  if (useCaps) addCapRows(ctx, Aub, bub, N, capRelax);
  const { lb, ub } = priceBounds(ctx, sigma, N, nonneg, [true]);
  const c = new Array(N).fill(0);
  c[T] = 1;
  ctx.lpCount++;
  const r = solveLP({ c, Aub, bub, Aeq, beq, lb, ub });
  if (r.status !== 'optimal') return { status: r.status };
  return { status: 'optimal', q: r.x.slice(0, ctx.n), t: r.x[T] };
}

// Phase 1: minimize worst cap overrun z >= 0.
function phase1LP(ctx, sigma, { nonneg }) {
  const { N, Aub, bub, Aeq, beq } = baseRows(ctx, sigma, 1);
  const Z = ctx.n;
  addCapRows(ctx, Aub, bub, N, 0, Z);
  const { lb, ub } = priceBounds(ctx, sigma, N, nonneg, [false]);
  const c = new Array(N).fill(0);
  c[Z] = -1;
  ctx.lpCount++;
  const r = solveLP({ c, Aub, bub, Aeq, beq, lb, ub });
  if (r.status !== 'optimal') return { status: r.status };
  return { status: 'optimal', z: Math.max(0, r.x[Z]) };
}

// Maxislack: maximize s (free) with every envy margin >= s, same rent, caps and bounds.
function maxislackLP(ctx, sigma, { nonneg, capRelax = 0 }) {
  const { n, vt } = ctx;
  if (n < 2 && !(ctx.lease === 'room' && ctx.unassignedOf(sigma).length)) return null;
  const N = n + 1;
  const S = n;
  const Aub = [];
  const bub = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const row = new Array(N).fill(0);
      row[i] = 1;
      row[k] = -1;
      row[S] = 1;
      Aub.push(row);
      bub.push(vt[i][sigma[i]] - vt[i][sigma[k]]);
    }
  }
  if (ctx.lease === 'room') {
    for (const j of ctx.unassignedOf(sigma)) {
      for (let i = 0; i < n; i++) {
        const row = new Array(N).fill(0);
        row[i] = 1;
        row[S] = 1;
        Aub.push(row);
        bub.push(vt[i][sigma[i]] - vt[i][j] + ctx.asking[j]);
      }
    }
  }
  addCapRows(ctx, Aub, bub, N, capRelax);
  const eqRow = new Array(N).fill(0);
  for (let i = 0; i < n; i++) eqRow[i] = 1;
  const { lb, ub } = priceBounds(ctx, sigma, N, nonneg, [true]);
  const c = new Array(N).fill(0);
  c[S] = 1;
  ctx.lpCount++;
  const r = solveLP({ c, Aub, bub, Aeq: [eqRow], beq: [ctx.rentAssigned(sigma)], lb, ub });
  if (r.status !== 'optimal') return null;
  return { s: r.x[S], q: r.x.slice(0, n) };
}

function makeContext(problem, o) {
  const n = problem.members.length;
  const m = problem.rooms.length;
  const lease = problem.lease === 'room' ? 'room' : 'house';
  const vt = normalizedValues(problem, o.normalize);
  const raw = problem.members.map((mem) => mem.values.map(Number));
  const caps = problem.members.map((mem) => (finiteNum(mem.cap) ? mem.cap : null));
  const cc = problem.members.map((mem) => (o.compensateCommute ? Number(mem.commute) || 0 : 0));
  const asking = problem.rooms.map((r) => (finiteNum(r?.asking) ? r.asking : 0));
  const unassignedOf = (sigma) => {
    const used = new Set(sigma);
    const out = [];
    for (let j = 0; j < m; j++) if (!used.has(j)) out.push(j);
    return out;
  };
  const rentAssigned = (sigma) => {
    if (lease === 'house') return problem.rent;
    let r = problem.rent;
    for (const j of unassignedOf(sigma)) r -= asking[j];
    return r;
  };
  return { n, m, lease, vt, raw, caps, cc, asking, unassignedOf, rentAssigned, bounds: o.bounds, lpCount: 0 };
}

function pickBest(list) {
  // list of { sigma, t, q }; highest t, ties keep enumeration order.
  let best = null;
  for (const r of list) if (!best || r.t > best.t + 1e-9) best = r;
  return best;
}

// ---------- public API ----------

/**
 * solveHouse({ rent, rooms, members: [{ id, values: number[], cap, commute }], lease?: 'house'|'room' }, opts)
 * opts: { normalize = true, compensateCommute = cfg.compensateCommute, nonneg = cfg.nonnegRents,
 *         bounds = null ([{lo, hi}] per room), samples = null (samples[i][k] = raw value vector), cfg }
 */
export function solveHouse(problem, opts = {}) {
  const t0 = now();
  const cfg = opts.cfg ?? CONFIG;
  const o = {
    normalize: true,
    compensateCommute: cfg.compensateCommute,
    nonneg: cfg.nonnegRents,
    bounds: null,
    samples: null,
    ...opts,
  };
  const n = problem.members.length;
  const m = problem.rooms.length;
  const base = {
    feasible: false, status: 'no-split', assignment: [], prices: [], utilities: [], rawUtilities: [], envy: [],
    margins: [], minUtility: null, capRelaxation: null, slack: null, robustSlack: null, robustPrices: null,
    efRate: null, efSamples: 0, negativePrice: false, nonnegDropped: false,
    binding: { minMembers: [], capMembers: [] }, efficientAssignments: 0, lpCount: 0,
    common: [], unassigned: [], lease: problem.lease === 'room' ? 'room' : 'house',
    check: { ok: false, worst: Infinity, failures: [] }, ms: 0,
  };
  if (n === 0 || n > m) {
    return { ...base, status: n === 0 ? 'no-members' : 'too-few-rooms', ms: now() - t0 };
  }
  if (n > cfg.maxMembers) {
    return { ...base, status: 'too-many-members', ms: now() - t0 };
  }
  const ctx = makeContext(problem, o);
  const sigmas = ctx.lease === 'house' ? efficientAssignments(ctx.raw, m, cfg) : allInjections(n, m);

  const solveAll = (list, args) => {
    const out = [];
    for (const sigma of list) {
      const r = coreLP(ctx, sigma, args);
      if (r.status === 'optimal') out.push({ sigma, ...r });
    }
    return out;
  };

  let nonneg = !!o.nonneg;
  let nonnegDropped = false;
  let status = 'ok';
  let capRelaxation = null;
  let capRelax = 0;
  let chosen = pickBest(solveAll(sigmas, { nonneg }));

  if (!chosen && nonneg) {
    // Is nonnegativity alone the obstacle? (EF + rent + bounds, no caps.)
    const anyNoCaps = sigmas.some((s) => coreLP(ctx, s, { nonneg: true, useCaps: false }).status === 'optimal');
    if (!anyNoCaps) {
      nonneg = false;
      nonnegDropped = true;
      chosen = pickBest(solveAll(sigmas, { nonneg }));
    }
  }

  let zBySigma = null;
  if (!chosen) {
    const hasCaps = ctx.caps.some((c) => c !== null);
    if (hasCaps) {
      zBySigma = sigmas.map((s) => phase1LP(ctx, s, { nonneg }));
      let zStar = Infinity;
      for (const r of zBySigma) if (r.status === 'optimal') zStar = Math.min(zStar, r.z);
      if (Number.isFinite(zStar)) {
        const ztol = 1e-7 * (1 + Math.abs(zStar));
        const eligible = sigmas.filter((s, k) => zBySigma[k].status === 'optimal' && zBySigma[k].z <= zStar + ztol);
        capRelax = zStar + 1e-6;
        chosen = pickBest(solveAll(eligible, { nonneg, capRelax }));
        if (chosen) {
          status = 'caps-relaxed';
          const byMember = ctx.caps.map((cap, i) => (cap === null ? 0 : Math.max(0, chosen.q[i] - cap)));
          capRelaxation = {
            total: byMember.reduce((a, b) => a + b, 0),
            byMember,
            worst: zStar,
            eligibleAssignments: eligible.length,
          };
        }
      }
    }
  }

  if (!chosen) {
    return {
      ...base, status: 'no-split', nonnegDropped, efficientAssignments: sigmas.length, lpCount: ctx.lpCount,
      ms: now() - t0,
    };
  }

  // ---------- assemble the result ----------
  const { sigma, q, t } = chosen;
  const prices = new Array(m).fill(0);
  for (let i = 0; i < n; i++) prices[sigma[i]] = q[i];
  const left = ctx.unassignedOf(sigma);
  if (ctx.lease === 'room') for (const j of left) prices[j] = ctx.asking[j];
  const vt = ctx.vt;
  const utilities = [];
  const rawUtilities = [];
  for (let i = 0; i < n; i++) {
    utilities.push(vt[i][sigma[i]] - q[i] - ctx.cc[i]);
    rawUtilities.push(ctx.raw[i][sigma[i]] - q[i]);
  }
  const envy = [];
  const margins = [];
  let slack = Infinity;
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let k = 0; k < n; k++) {
      const e = k === i ? 0 : (vt[i][sigma[i]] - q[i]) - (vt[i][sigma[k]] - q[k]);
      row.push(e);
      if (k !== i) {
        margins.push({ i, j: k, from: problem.members[i].id, to: problem.members[k].id, dollars: e });
        slack = Math.min(slack, e);
      }
    }
    envy.push(row);
  }
  const outside = [];
  if (ctx.lease === 'room') {
    for (const j of left) {
      for (let i = 0; i < n; i++) {
        const e = (vt[i][sigma[i]] - q[i]) - (vt[i][j] - ctx.asking[j]);
        outside.push({ i, room: j, from: problem.members[i].id, dollars: e });
        slack = Math.min(slack, e);
      }
    }
  }
  margins.sort((a, b) => a.dollars - b.dollars);
  if (!Number.isFinite(slack)) slack = null;
  const minUtility = Math.min(...utilities);
  const binding = {
    minMembers: utilities.map((u, i) => (u <= minUtility + TOL ? i : -1)).filter((i) => i >= 0),
    capMembers: ctx.caps
      .map((cap, i) => (cap !== null && q[i] >= cap + capRelaxBy(capRelaxation, i) - TOL ? i : -1))
      .filter((i) => i >= 0),
  };

  // maxislack on the chosen assignment
  let robustSlack = null;
  let robustPrices = null;
  let maxSlack = null;
  const ms = maxislackLP(ctx, sigma, { nonneg, capRelax });
  if (ms) {
    maxSlack = ms.s;
    if (ms.s > 1) {
      robustSlack = ms.s;
      robustPrices = new Array(m).fill(0);
      for (let i = 0; i < n; i++) robustPrices[sigma[i]] = ms.q[i];
      if (ctx.lease === 'room') for (const j of left) robustPrices[j] = ctx.asking[j];
    }
  }

  // EF rate over posterior samples: share of samples in which the chosen prices stay envy-free.
  let efRate = null;
  let efSamples = 0;
  if (Array.isArray(o.samples) && o.samples.length === n) {
    const K = Math.min(...o.samples.map((s) => s.length));
    let ok = 0;
    for (let k = 0; k < K; k++) {
      let ef = true;
      for (let i = 0; i < n && ef; i++) {
        const v = o.samples[i][k];
        const own = v[sigma[i]] - q[i];
        for (let kk = 0; kk < n; kk++) {
          if (kk !== i && own < v[sigma[kk]] - q[kk] - cfg.efTol) { ef = false; break; }
        }
        if (ef && ctx.lease === 'room') {
          for (const j of left) if (own < v[j] - ctx.asking[j] - cfg.efTol) { ef = false; break; }
        }
      }
      if (ef) ok++;
    }
    efSamples = K;
    efRate = K > 0 ? ok / K : null;
  }

  const result = {
    feasible: status === 'ok',
    status,
    assignment: sigma.slice(),
    prices,
    utilities,
    rawUtilities,
    envy,
    margins,
    outsideMargins: outside,
    minUtility,
    t,
    capRelaxation,
    slack,
    maxSlack,
    robustSlack,
    robustPrices,
    efRate,
    efSamples,
    negativePrice: q.some((x) => x < -TOL),
    nonnegDropped,
    binding,
    efficientAssignments: sigmas.length,
    lpCount: ctx.lpCount,
    common: ctx.lease === 'house' ? left : [],
    unassigned: ctx.lease === 'room' ? left : [],
    lease: ctx.lease,
    normalized: !!o.normalize,
    compensateCommute: !!o.compensateCommute,
  };
  result.check = checkSplit(problem, result, { normalize: o.normalize, nonneg: !nonnegDropped && !!o.nonneg, bounds: o.bounds, cfg });
  result.ms = now() - t0;
  return result;
}

function capRelaxBy(capRelaxation, i) {
  return capRelaxation ? capRelaxation.worst + 1e-6 : 0;
}

/**
 * Independent plain-JS checker. Recomputes values, envy, rent sum, caps and bounds from the problem and the
 * reported prices, at tolerance 1e-6. Shares no code with the LP path.
 * Returns { ok, worst (most negative slack found, as a violation amount >= 0), failures: [string] }.
 */
export function checkSplit(problem, result, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const normalize = opts.normalize ?? true;
  const failures = [];
  let worst = 0;
  const note = (amount, msg) => {
    if (amount > tol) failures.push(msg);
    worst = Math.max(worst, amount);
  };
  const n = problem.members.length;
  const m = problem.rooms.length;
  const R = problem.rent;
  const lease = problem.lease === 'room' ? 'room' : 'house';
  const a = result.assignment;
  const p = result.prices;
  if (!Array.isArray(a) || a.length !== n) return { ok: false, worst: Infinity, failures: ['assignment length'] };
  if (!Array.isArray(p) || p.length !== m) return { ok: false, worst: Infinity, failures: ['prices length'] };
  const seen = new Set();
  for (const j of a) {
    if (!(j >= 0 && j < m) || seen.has(j)) return { ok: false, worst: Infinity, failures: ['assignment not injective'] };
    seen.add(j);
  }
  const val = [];
  for (let i = 0; i < n; i++) {
    const v = problem.members[i].values;
    let mean = 0;
    for (let j = 0; j < m; j++) mean += v[j];
    mean /= m;
    const row = [];
    for (let j = 0; j < m; j++) row.push(normalize ? v[j] - mean + R / n : v[j]);
    val.push(row);
  }
  // rent sum
  let sum = 0;
  for (let j = 0; j < m; j++) {
    if (seen.has(j)) sum += p[j];
    else if (lease === 'room') {
      sum += p[j];
      const ask = Number.isFinite(problem.rooms[j]?.asking) ? problem.rooms[j].asking : 0;
      note(Math.abs(p[j] - ask), `room ${j} not at asking`);
    } else note(Math.abs(p[j]), `common room ${j} priced`);
  }
  note(Math.abs(sum - R), `rent sum ${sum} != ${R}`);
  // envy
  for (let i = 0; i < n; i++) {
    const own = val[i][a[i]] - p[a[i]];
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const other = val[i][a[k]] - p[a[k]];
      note(other - own, `member ${i} envies member ${k}`);
      if (result.envy && result.envy[i]) note(Math.abs(result.envy[i][k] - (own - other)), `envy[${i}][${k}] misreported`);
    }
    if (lease === 'room') {
      for (let j = 0; j < m; j++) if (!seen.has(j)) note((val[i][j] - p[j]) - own, `member ${i} envies open room ${j}`);
    }
  }
  // caps
  const relax = result.capRelaxation ? result.capRelaxation.worst + 2e-6 : 0;
  for (let i = 0; i < n; i++) {
    const cap = problem.members[i].cap;
    if (typeof cap === 'number' && Number.isFinite(cap)) note(p[a[i]] - cap - relax, `member ${i} over cap`);
  }
  if (result.feasible && result.capRelaxation) failures.push('feasible with relaxation');
  // nonnegative rents and bounds
  if (opts.nonneg) for (const j of a) note(-p[j], `room ${j} negative`);
  if (opts.bounds) {
    for (const j of a) {
      const b = opts.bounds[j];
      if (!b) continue;
      if (Number.isFinite(b.lo)) note(b.lo - p[j], `room ${j} below floor`);
      if (Number.isFinite(b.hi)) note(p[j] - b.hi, `room ${j} above ceiling`);
    }
  }
  return { ok: failures.length === 0, worst, failures };
}

/**
 * privateGap(problem, i, opts) -> dollars member i's cap must rise for the house to become feasible (0 if it
 * already is, or if i has no cap). Minimizes i's own rent over every efficient assignment under the other caps.
 * Returns null when the other members' caps alone make the house infeasible (raising i's cap cannot fix it).
 */
export function privateGap(problem, memberIndex, opts = {}) {
  const cfg = opts.cfg ?? CONFIG;
  const o = { normalize: true, nonneg: cfg.nonnegRents, bounds: null, ...opts, compensateCommute: false };
  const cap = problem.members[memberIndex]?.cap;
  if (!finiteNum(cap)) return 0;
  const n = problem.members.length;
  const m = problem.rooms.length;
  if (n === 0 || n > m) return null;
  const ctx = makeContext(problem, o);
  const sigmas = ctx.lease === 'house' ? efficientAssignments(ctx.raw, m, cfg) : allInjections(n, m);
  const minOwn = (nonneg) => {
    let best = Infinity;
    for (const sigma of sigmas) {
      const { N, Aub, bub, Aeq, beq } = baseRows(ctx, sigma, 0);
      for (let i = 0; i < n; i++) {
        if (i === memberIndex || ctx.caps[i] === null) continue;
        const row = new Array(N).fill(0);
        row[i] = 1;
        Aub.push(row);
        bub.push(ctx.caps[i]);
      }
      const { lb, ub } = priceBounds(ctx, sigma, N, nonneg, []);
      const c = new Array(N).fill(0);
      c[memberIndex] = -1;
      const r = solveLP({ c, Aub, bub, Aeq, beq, lb, ub });
      if (r.status === 'optimal') best = Math.min(best, r.x[memberIndex]);
    }
    return best;
  };
  let best = minOwn(!!o.nonneg);
  if (!Number.isFinite(best) && o.nonneg) {
    // Same fallback as solveHouse: drop nonnegativity only if EF + rent alone need it.
    const plain = solveHouse({ ...problem, members: problem.members.map((x) => ({ ...x, cap: null })) }, { ...o, cfg, samples: null });
    if (plain.nonnegDropped) best = minOwn(false);
  }
  if (!Number.isFinite(best)) return null;
  const gap = best - cap;
  return gap > TOL ? gap : 0;
}

/**
 * rankHouses(problems, opts) -> [{ index, rank, feasible, minUtility (E_h), sumUtility (W_h), worstOverrun,
 *   disagree, memberU, topByMember, result }]
 * problems[k] = { rent, rooms, members, utilities? (monthly bill), lease?, result? (precomputed solveHouse) }.
 * U_i(h) = v_i,s(i) - p_s(i) - utilities_h / n - commute_i (raw values, comparable across houses).
 * Order: feasible houses by E_h (high first), then infeasible by worst overrun (low first), then houses with no split.
 */
export function rankHouses(problems, opts = {}) {
  const rows = problems.map((pb, index) => {
    const result = pb.result ?? solveHouse(pb, opts);
    const n = pb.members.length;
    const solved = result.status === 'ok' || result.status === 'caps-relaxed';
    const memberU = solved
      ? result.rawUtilities.map((u, i) => u - (Number(pb.utilities) || 0) / n - (Number(pb.members[i].commute) || 0))
      : [];
    return {
      index,
      feasible: !!result.feasible,
      solved,
      minUtility: solved ? Math.min(...memberU) : null,
      sumUtility: solved ? memberU.reduce((a, b) => a + b, 0) : null,
      worstOverrun: result.capRelaxation ? result.capRelaxation.worst : (solved ? 0 : null),
      memberU,
      memberIds: pb.members.map((x) => x.id),
      result,
    };
  });
  // each member's own top house
  const top = {};
  for (const r of rows) {
    if (!r.solved) continue;
    r.memberIds.forEach((id, i) => {
      const u = r.memberU[i];
      if (!(id in top) || u > top[id].u + 1e-9) top[id] = { index: r.index, u };
    });
  }
  const topByMember = Object.fromEntries(Object.entries(top).map(([id, x]) => [id, x.index]));
  const disagree = new Set(Object.values(topByMember)).size > 1;
  const sorted = rows.slice().sort((a, b) => {
    const ga = a.feasible ? 0 : a.solved ? 1 : 2;
    const gb = b.feasible ? 0 : b.solved ? 1 : 2;
    if (ga !== gb) return ga - gb;
    if (ga === 1 && Math.abs(a.worstOverrun - b.worstOverrun) > 1e-9) return a.worstOverrun - b.worstOverrun;
    if (ga === 2) return a.index - b.index;
    if (Math.abs(a.minUtility - b.minUtility) > 1e-9) return b.minUtility - a.minUtility;
    return a.index - b.index;
  });
  return sorted.map((r, k) => {
    const { memberIds, solved, ...rest } = r;
    return { ...rest, rank: k + 1, disagree, topByMember };
  });
}
