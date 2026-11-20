// Group mode logic, plain JS so it runs in Node tests and in the browser.
// Everything heavy is in engine/fair.js; this file builds the problems, ranks houses on raw utilities
// (SYSTEM_DESIGN 3.5 "Which house"), re-checks every certificate, and measures the EF rate.

export const EF_TOL = 1e-6;

// The demo group: personas flagged with `group`, else the first five that are not the Me-mode persona.
export function pickGroup(personas, n = 5) {
  if (!Array.isArray(personas)) return [];
  const flagged = personas.filter((p) => p.group || (Array.isArray(p.groups) && p.groups.length));
  if (flagged.length >= 2) return flagged.slice(0, 6);
  return personas.filter((p) => p.id !== 'jordan').slice(0, n);
}

// The most likely week: keep entries with p >= 0.5 at their base place; drop p and alt.
export function modalRoutine(persona, extra = []) {
  const week = [];
  for (const e of [...(persona.week || []), ...extra]) {
    if ((e.p ?? 1) < 0.5) continue;
    const { p, alt, ...rest } = e;
    week.push(rest);
  }
  return { week, modes: persona.modes || {} };
}

// Whole-house leases with at least one room per member.
export function candidateHouses(homes, n) {
  if (!Array.isArray(homes)) return [];
  const fits = homes.filter((h) => Array.isArray(h.rooms) && h.rooms.length >= n && Number.isFinite(h.rent));
  const houses = fits.filter((h) => h.kind === 'house');
  return houses.length ? houses : fits;
}

// weekByMember: Map memberId -> Map homeId -> WeekResult (or undefined when week.js is not built).
export function buildProblem({ home, members, weekByMember, model, cfg, caps }) {
  return {
    rent: home.rent,
    utilities: home.utilities ?? 0,
    rooms: home.rooms,
    members: members.map((m) => {
      const values = home.rooms.map((room) => model.roomValue(m.theta, room));
      const wr = weekByMember?.get(m.id)?.get(home.id);
      const commute = wr ? model.travelCost(m.theta, model.travelFeatures(wr, cfg)) : 0;
      const cap = caps && caps[m.id] !== undefined ? caps[m.id] : (Number.isFinite(m.cap) ? m.cap : null);
      return { id: m.id, values, cap, commute };
    }),
  };
}

export function solveOpts(cfg) {
  return {
    normalize: true,
    compensateCommute: !!cfg?.compensateCommute,
    nonneg: cfg?.nonnegRents !== false,
    cfg,
  };
}

// Raw utility U_i(h) = v_i,sigma(i) - p_sigma(i) - utilities_h / n - c_i(h). Comparable across houses.
export function rawUtilities(problem, res) {
  const n = problem.members.length;
  return problem.members.map((m, i) => {
    const r = res.assignment?.[i];
    if (r == null || r < 0) return NaN;
    return m.values[r] - res.prices[r] - (problem.utilities || 0) / n - m.commute;
  });
}

// Plain-JS checker (SYSTEM_DESIGN 3.5): re-verifies envy, sum and caps from the inputs, independent of fair.js.
export function checkCertificate(problem, res, tol = EF_TOL) {
  const n = problem.members.length;
  const issues = [];
  const a = res.assignment || [];
  const p = res.prices || [];
  if (a.length !== n) issues.push('assignment length does not match members');
  if (new Set(a).size !== a.length) issues.push('two members share a room');
  if (p.length !== problem.rooms.length) issues.push('price count does not match rooms');
  for (const x of p) if (!Number.isFinite(x)) issues.push('a price is not a finite number');
  const sum = p.reduce((s, x) => s + x, 0);
  const sumErr = Math.abs(sum - problem.rent);
  if (sumErr > 1e-6 * Math.max(1, problem.rent)) issues.push(`rents sum to ${sum.toFixed(4)}, not ${problem.rent}`);
  let worstEnvy = Infinity;
  let maxMismatch = 0;
  const envy = [];
  for (let i = 0; i < n; i++) {
    envy.push([]);
    const v = problem.members[i].values;
    for (let j = 0; j < n; j++) {
      if (i === j) { envy[i].push(null); continue; }
      const e = (v[a[i]] - p[a[i]]) - (v[a[j]] - p[a[j]]);
      envy[i].push(e);
      worstEnvy = Math.min(worstEnvy, e);
      const eng = res.envy?.[i]?.[j];
      if (Number.isFinite(eng)) maxMismatch = Math.max(maxMismatch, Math.abs(eng - e));
    }
  }
  if (worstEnvy < -tol) issues.push(`someone envies another room by ${(-worstEnvy).toFixed(2)} dollars`);
  if (maxMismatch > 1e-4) issues.push(`engine envy matrix differs from the recomputed one by ${maxMismatch.toFixed(4)}`);
  let capOk = true;
  for (let i = 0; i < n; i++) {
    const c = problem.members[i].cap;
    if (c != null && p[a[i]] > c + tol) capOk = false;
  }
  if (res.feasible && !capOk) issues.push('reported feasible but a rent is above a cap');
  return { ok: issues.length === 0, issues, envy, worstEnvy, sumErr, capOk };
}

// Share of perturbed value draws under which the chosen prices stay envy-free.
// Demo members have one theta each (no learned posterior), so draws are log-normal around it with log-sd `spread`.
export function efRate(problem, res, thetas, model, r, { k = 100, spread = 0.25 } = {}) {
  const n = problem.members.length;
  const a = res.assignment, p = res.prices;
  const keys = Object.keys(thetas[0] || {});
  let ok = 0;
  for (let s = 0; s < k; s++) {
    let ef = true;
    for (let i = 0; i < n && ef; i++) {
      const th = {};
      for (const key of keys) th[key] = thetas[i][key] * Math.exp(spread * r.normal());
      const own = model.roomValue(th, problem.rooms[a[i]]) - p[a[i]];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (model.roomValue(th, problem.rooms[a[j]]) - p[a[j]] > own + EF_TOL) { ef = false; break; }
      }
    }
    if (ef) ok++;
  }
  return { rate: ok / k, k, spread };
}

// Rank: feasible houses first by E_h = min_i U_i (desc), then infeasible by worst cap overrun (asc).
export function rankRows(rows) {
  return [...rows].sort((x, y) => {
    if (x.feasible !== y.feasible) return x.feasible ? -1 : 1;
    if (x.feasible) return y.E - x.E;
    return (x.worst ?? Infinity) - (y.worst ?? Infinity);
  });
}

// sampleThetas[i] = k perturbed thetas for member i; passed to fair.solveHouse as samples[i][k] = raw values.
export function drawSampleThetas(members, r, { k = 100, spread = 0.25 } = {}) {
  return members.map((m) => {
    const out = [];
    for (let s = 0; s < k; s++) {
      const th = {};
      for (const key of Object.keys(m.theta)) th[key] = m.theta[key] * Math.exp(spread * r.normal());
      out.push(th);
    }
    return out;
  });
}

export function solveAllHouses({ fair, houses, members, weekByMember, model, cfg, caps, sampleThetas = null }) {
  const t0 = now();
  const rows = houses.map((home, index) => {
    const problem = buildProblem({ home, members, weekByMember, model, cfg, caps });
    const t1 = now();
    let res = null, error = null;
    const opts = solveOpts(cfg);
    if (sampleThetas) opts.samples = sampleThetas.map((list) => list.map((th) => home.rooms.map((room) => model.roomValue(th, room))));
    try { res = fair.solveHouse(problem, opts); } catch (e) { error = String(e.message || e); }
    const solveMs = now() - t1;
    if (!res) return { index, home, problem, res: null, error, feasible: false, E: NaN, W: NaN, worst: Infinity, solveMs };
    const U = rawUtilities(problem, res);
    const finite = U.filter(Number.isFinite);
    return {
      index, home, problem, res, U, solveMs,
      feasible: !!res.feasible,
      E: finite.length === U.length ? Math.min(...U) : NaN,
      W: finite.reduce((s, x) => s + x, 0),
      worst: res.capRelaxation?.worst ?? res.capRelaxation?.total ?? (res.feasible ? 0 : Infinity),
      check: checkCertificate(problem, res),
    };
  });
  // "the group disagrees": members' individual top houses differ (by own U_i, prices as solved).
  const ranked = rankRows(rows);
  const tops = members.map((_, i) => {
    let best = null;
    for (const row of rows) if (row.U && Number.isFinite(row.U[i]) && (!best || row.U[i] > best.U[i])) best = row;
    return best?.home.id ?? null;
  });
  return { rows: ranked, totalMs: now() - t0, disagree: new Set(tops.filter(Boolean)).size > 1, tops };
}

// Cap below which member i makes this house infeasible: their minimum envy-free rent given the others' caps.
export function capThreshold(fair, problem, i, cfg) {
  const probe = { ...problem, members: problem.members.map((m, k) => (k === i ? { ...m, cap: 0 } : m)) };
  return fair.privateGap(probe, i, solveOpts(cfg));
}

export function favoriteRoom(values) {
  let best = 0;
  for (let j = 1; j < values.length; j++) if (values[j] > values[best]) best = j;
  return best;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
