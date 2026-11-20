// Dense two-phase simplex with Bland's rule (no cycling). No dependencies.
//
//   solveLP({ c, Aub, bub, Aeq, beq, lb, ub }) -> { status, x, obj, iterations }
//   maximize c . x  subject to  Aub x <= bub,  Aeq x = beq,  lb <= x <= ub
//
// Bounds: `lb` omitted means every variable is >= 0. An entry of null or -Infinity means no lower bound
// (a free variable is split as x = x+ - x-). `ub` omitted, or an entry of null or Infinity, means no upper bound.
// status is 'optimal', 'infeasible' or 'unbounded'. Sizes here are small (tens of rows), so a dense tableau is fine.

const PIVOT_EPS = 1e-9;

function finite(v) {
  return v !== null && v !== undefined && Number.isFinite(v);
}

export function solveLP({ c, Aub = [], bub = [], Aeq = [], beq = [], lb, ub } = {}, opts = {}) {
  const nx = c.length;
  const maxIter = opts.maxIter ?? 50000;

  // 1. Map each original variable to nonnegative columns: x_j = off_j + sum(coef * y_col).
  const map = []; // per original var: { off, cols: [[col, coef], ...] }
  let ny = 0;
  const boundRows = []; // extra rows y_col <= width
  for (let j = 0; j < nx; j++) {
    const lo = lb === undefined || lb === null ? 0 : lb[j];
    const hi = ub === undefined || ub === null ? null : ub[j];
    if (finite(lo)) {
      const col = ny++;
      map.push({ off: lo, cols: [[col, 1]] });
      if (finite(hi)) boundRows.push([col, hi - lo]);
    } else if (finite(hi)) {
      const col = ny++;
      map.push({ off: hi, cols: [[col, -1]] });
    } else {
      const a = ny++;
      const b = ny++;
      map.push({ off: 0, cols: [[a, 1], [b, -1]] });
    }
  }

  // 2. Rows in y space.
  const rows = []; // { a: Float64Array(ny), b, kind: 'ub'|'eq' }
  const toY = (arow, rhs, kind) => {
    const a = new Float64Array(ny);
    let b = rhs;
    for (let j = 0; j < nx; j++) {
      const v = arow[j] || 0;
      if (v === 0) continue;
      const m = map[j];
      b -= v * m.off;
      for (const [col, coef] of m.cols) a[col] += v * coef;
    }
    rows.push({ a, b, kind });
  };
  for (let i = 0; i < Aub.length; i++) toY(Aub[i], bub[i], 'ub');
  for (const [col, w] of boundRows) {
    const a = new Float64Array(ny);
    a[col] = 1;
    rows.push({ a, b: w, kind: 'ub' });
  }
  for (let i = 0; i < Aeq.length; i++) toY(Aeq[i], beq[i], 'eq');

  const m = rows.length;
  const cy = new Float64Array(ny);
  for (let j = 0; j < nx; j++) for (const [col, coef] of map[j].cols) cy[col] += (c[j] || 0) * coef;

  const back = (y) => {
    const x = new Array(nx);
    for (let j = 0; j < nx; j++) {
      let v = map[j].off;
      for (const [col, coef] of map[j].cols) v += coef * y[col];
      x[j] = v;
    }
    return x;
  };

  if (m === 0) {
    for (let k = 0; k < ny; k++) if (cy[k] > PIVOT_EPS) return { status: 'unbounded', x: null, obj: Infinity, iterations: 0 };
    const x = back(new Float64Array(ny));
    return { status: 'optimal', x, obj: dot(c, x), iterations: 0 };
  }

  // 3. Tableau columns: y (ny), slacks (one per ub row), artificials (as needed), rhs.
  const nSlack = rows.filter((r) => r.kind === 'ub').length;
  const needArt = rows.map((r) => r.kind === 'eq' || r.b < 0);
  const nArt = needArt.filter(Boolean).length;
  const W = ny + nSlack + nArt;
  const RHS = W;
  const T = [];
  const basis = new Int32Array(m);
  let s = ny;
  let art = ny + nSlack;
  let bmax = 1;
  for (let i = 0; i < m; i++) {
    const r = rows[i];
    const row = new Float64Array(W + 1);
    const sign = r.b < 0 ? -1 : 1;
    for (let k = 0; k < ny; k++) row[k] = sign * r.a[k];
    row[RHS] = sign * r.b;
    bmax = Math.max(bmax, Math.abs(r.b));
    if (r.kind === 'ub') {
      row[s] = sign;
      if (!needArt[i]) basis[i] = s;
      s++;
    }
    if (needArt[i]) {
      row[art] = 1;
      basis[i] = art;
      art++;
    }
    T.push(row);
  }
  const artStart = ny + nSlack;
  const feasTol = 1e-7 * bmax;
  let iterations = 0;

  const pivot = (pr, pc) => {
    const prow = T[pr];
    const pv = prow[pc];
    for (let k = 0; k <= W; k++) prow[k] /= pv;
    prow[pc] = 1;
    for (let i = 0; i < m; i++) {
      if (i === pr) continue;
      const row = T[i];
      const f = row[pc];
      if (f === 0) continue;
      for (let k = 0; k <= W; k++) row[k] -= f * prow[k];
      row[pc] = 0;
    }
    basis[pr] = pc;
  };

  // Simplex on objective `cost` (maximize), columns allowed by `allowed`. Bland: lowest index enters,
  // lowest basic index leaves on ratio ties.
  const run = (cost, allowed) => {
    const z = new Float64Array(W + 1);
    for (let k = 0; k <= W; k++) z[k] = k < W ? -cost[k] : 0;
    for (let i = 0; i < m; i++) {
      const cb = cost[basis[i]];
      if (cb === 0) continue;
      const row = T[i];
      for (let k = 0; k <= W; k++) z[k] += cb * row[k];
    }
    for (;;) {
      if (iterations++ > maxIter) return 'iterlimit';
      let pc = -1;
      for (let k = 0; k < W; k++) {
        if (allowed[k] && z[k] < -PIVOT_EPS) { pc = k; break; }
      }
      if (pc < 0) return 'optimal';
      let pr = -1;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][pc];
        if (a > PIVOT_EPS) {
          const ratio = T[i][RHS] / a;
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[pr])) {
            best = ratio;
            pr = i;
          }
        }
      }
      if (pr < 0) return 'unbounded';
      pivot(pr, pc);
      const f = z[pc];
      const prow = T[pr];
      for (let k = 0; k <= W; k++) z[k] -= f * prow[k];
      z[pc] = 0;
    }
  };

  // Phase 1: maximize -sum(artificials).
  if (nArt > 0) {
    const cost1 = new Float64Array(W);
    for (let k = artStart; k < W; k++) cost1[k] = -1;
    const all = new Uint8Array(W).fill(1);
    const st = run(cost1, all);
    if (st === 'iterlimit') return { status: 'infeasible', x: null, obj: NaN, iterations, note: 'iteration limit' };
    let artSum = 0;
    for (let i = 0; i < m; i++) if (basis[i] >= artStart) artSum += T[i][RHS];
    if (artSum > feasTol) return { status: 'infeasible', x: null, obj: NaN, iterations };
    // Drive artificials out of the basis where possible; rows that cannot pivot are redundant.
    for (let i = 0; i < m; i++) {
      if (basis[i] < artStart) continue;
      let pc = -1;
      for (let k = 0; k < artStart; k++) if (Math.abs(T[i][k]) > PIVOT_EPS) { pc = k; break; }
      if (pc >= 0) pivot(i, pc);
    }
  }

  // Phase 2.
  const cost2 = new Float64Array(W);
  for (let k = 0; k < ny; k++) cost2[k] = cy[k];
  const allowed = new Uint8Array(W);
  for (let k = 0; k < artStart; k++) allowed[k] = 1;
  const st2 = run(cost2, allowed);
  if (st2 === 'unbounded') return { status: 'unbounded', x: null, obj: Infinity, iterations };
  if (st2 === 'iterlimit') return { status: 'infeasible', x: null, obj: NaN, iterations, note: 'iteration limit' };

  const y = new Float64Array(ny);
  for (let i = 0; i < m; i++) if (basis[i] < ny) y[basis[i]] = T[i][RHS];
  const x = back(y);
  return { status: 'optimal', x, obj: dot(c, x), iterations };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] || 0) * b[i];
  return s;
}
