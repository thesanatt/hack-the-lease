// Tolerant readers for the evidence JSON files. The files are written by other builders' scripts whose exact
// shapes may change, so nothing here assumes more than "JSON object".

export const FILES = [
  { key: 'router', file: 'router.json', title: 'Router checks', what: 'R2 to R5: independent reference router, backward and forward consistency, FIFO, sort order' },
  { key: 'router_labels', file: 'router_labels.json', title: 'Two-label scan', what: 'R1: old single-label scan vs the two-label scan' },
  { key: 'r5', file: 'r5.json', title: 'r5py comparison', what: 'R6: agreement with r5py over the same 10-minute window' },
  { key: 'lp', file: 'lp.json', title: 'Fair division LP tests', what: 'F1 to F9: envy-free checker, maximin optimality, published counterexamples, timing' },
  { key: 'recovery', file: 'recovery.json', title: 'Preference recovery', what: 'Recovery of known values from simulated picks' },
];

export function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

const PASS_KEYS = ['pass', 'passed', 'ok', 'success'];
export function passOf(x) {
  if (!isObj(x)) return null;
  for (const k of PASS_KEYS) if (typeof x[k] === 'boolean') return x[k];
  if (typeof x.status === 'string') {
    const s = x.status.toLowerCase();
    if (['pass', 'passed', 'ok', 'success'].includes(s)) return true;
    if (['fail', 'failed', 'error'].includes(s)) return false;
  }
  return null;
}

const META_KEYS = ['test', 'ranAt', 'ran_at', 'node', 'date', 'generated', 'generatedAt', 'createdAt', 'time', 'timestamp', 'seed', 'version', 'label', 'note', 'notes', 'description'];
export function metaOf(x) {
  if (!isObj(x)) return {};
  const out = {};
  for (const k of META_KEYS) if (x[k] != null && typeof x[k] !== 'object') out[k] = x[k];
  return out;
}

// Split an object into scalar fields, tables (arrays of objects), and nested sections.
export function partition(x) {
  const scalars = [], tables = [], nested = [], lists = [];
  if (!isObj(x)) return { scalars, tables, nested, lists };
  for (const [k, v] of Object.entries(x)) {
    if (META_KEYS.includes(k)) continue;
    if (v == null || typeof v !== 'object') scalars.push([k, v]);
    else if (Array.isArray(v)) {
      if (v.length && v.every(isObj)) tables.push([k, v]);
      else lists.push([k, v]);
    } else nested.push([k, v]);
  }
  return { scalars, tables, nested, lists };
}

export function columnsOf(rows, max = 10) {
  const cols = [];
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  return cols.filter((k) => rows.some((r) => r[k] == null || typeof r[k] !== 'object')).slice(0, max);
}

export function fmtVal(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    if (Number.isInteger(v)) return v.toLocaleString('en-US');
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(3) : v.toPrecision(3);
  }
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length <= 8 && v.every((x) => typeof x !== 'object') ? v.map(fmtVal).join(', ') : `[${v.length} items]`;
  return '{...}';
}

// Recovery curves: find every array of per-pick records in the file. A record is an object with numeric fields;
// the pick count is `pick`, `picks`, `k` or `n` when present, else the array index.
export function findSeries(root) {
  const series = [];
  const walk = (x, path) => {
    if (Array.isArray(x)) {
      if (x.length >= 2 && x.every(isObj) && x.some((r) => Object.values(r).some((v) => typeof v === 'number'))) {
        const pts = x.map((r, idx) => ({ pick: num(r.pick ?? r.picks ?? r.k ?? r.n ?? r.nPicks) ?? idx, rec: r }));
        if (pts.every((p) => Number.isFinite(p.pick))) series.push({ name: path.join(' / ') || 'series', pts });
        return;
      }
      if (x.length >= 2 && x.every((v) => typeof v === 'number')) {
        series.push({ name: path.join(' / ') || 'series', pts: x.map((v, idx) => ({ pick: idx, rec: { value: v } })) });
      }
      return;
    }
    if (isObj(x)) for (const [k, v] of Object.entries(x)) walk(v, [...path, k]);
  };
  walk(root, []);
  return series;
}

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

export function metricsOf(series) {
  const counts = new Map();
  for (const s of series) {
    const keys = new Set();
    for (const p of s.pts) for (const [k, v] of Object.entries(p.rec)) if (typeof v === 'number' && !['pick', 'picks', 'k', 'n', 'nPicks'].includes(k)) keys.add(k);
    for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

export const PREFERRED_METRICS = ['regretP50', 'regret', 'medianRegret', 'top1', 'coverage', 'maeLogVTime', 'regretP90', 'value'];
export function defaultMetric(metrics) {
  return PREFERRED_METRICS.find((m) => metrics.includes(m)) || metrics[0] || null;
}

// Flatten api.config into rows for the assumptions table.
export function flattenConfig(cfg, prefix = '') {
  const rows = [];
  for (const [k, v] of Object.entries(cfg || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) rows.push(...flattenConfig(v, key));
    else rows.push([key, v]);
  }
  return rows;
}
