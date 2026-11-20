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

// ---------- curated summaries ----------
// Each summary only reads fields from the file; a missing field drops its line instead of showing a guess.
const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : null);
const pctOf = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${(100 * v).toFixed(1)}%` : null);
const of = (a, b) => (n0(a) != null && n0(b) != null ? `${n0(a)} of ${n0(b)}` : null);
const whenOf = (d) => {
  const raw = d.ran_at || d.ranAt || d.generated || d.date;
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? String(raw) : t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const keep = (rows) => rows.filter(([, v]) => v != null && v !== '');

export function summaryOf(key, d) {
  if (!isObj(d)) return null;
  if (key === 'router') {
    return {
      when: whenOf(d),
      lead: `An independent Python router (${get(d, 'reference.file') || 'reference'}) read the raw GTFS files and answered the same trips as our router${d.service_date ? ` on the ${d.service_date} timetable` : ''}.`,
      facts: keep([
        ['Stop-to-stop trips that match exactly', of(d.equal, d.queries)],
        ['Mismatches', n0(d.mismatches)],
        ['Arrival times at every stop that match', of(get(d, 'all_targets.equal'), get(d, 'all_targets.stop_comparisons'))],
        ['Departure times tested', Array.isArray(d.departure_times) ? d.departure_times.map((t) => String(t).slice(0, 5)).join(', ') : null],
        ['Our router, per trip', get(d, 'timing.engine.ms_per_scan') != null ? `${get(d, 'timing.engine.ms_per_scan')} ms` : null],
      ]),
      notes: [get(d, 'reference.algorithm') && `Reference method: ${get(d, 'reference.algorithm')}.`].filter(Boolean),
    };
  }
  if (key === 'router_labels') {
    const runs = Array.isArray(d.runs) ? d.runs : [];
    const r0 = runs[0] || {};
    return {
      when: whenOf(d),
      lead: d.passRule ? `Rule: ${d.passRule}.` : null,
      facts: keep([
        ['Stop arrivals compared', n0(r0.comparedStopArrivals)],
        ['Earlier with the two-label scan', n0(r0.newEarlier)],
        ['Later with the two-label scan', n0(r0.newLater)],
        ['Stops reached only by the two-label scan', n0(r0.newlyReachable)],
        ['Median gain where it improves', get(r0, 'gainSec.median') != null ? `${Math.round(get(r0, 'gainSec.median') / 60 * 10) / 10} min` : null],
        ['Source stops', n0(d.sources)],
      ]),
      notes: [r0.name && `First run shown: ${r0.name}. ${runs.length} runs in the file.`, d.footpathSource && `Footpaths: ${d.footpathSource}.`].filter(Boolean),
    };
  }
  if (key === 'r5') {
    const r = d.result || {};
    return {
      when: whenOf(d),
      lead: `Door-to-door times from our router against r5py ${d.r5py_version || ''} (Conveyal R5) on the same OpenStreetMap and GTFS files${get(d, 'settings.departure') ? `, departing ${String(get(d, 'settings.departure')).replace('T', ' ').slice(0, 16)}` : ''}.`,
      facts: keep([
        ['Place-to-home pairs', n0(r.pairs)],
        ['Pairs both routers reach', n0(r.both_reachable)],
        ['Median absolute difference', r.median_abs_error_min != null ? `${r.median_abs_error_min} min` : null],
        ['Within 2 minutes (of pairs both reach)', pctOf(r.share_within_2_min)],
        ['90th percentile difference', r.p90_abs_error_min != null ? `${r.p90_abs_error_min} min` : null],
        ['Mean signed difference, ours minus R5', r.mean_signed_error_min_quorum_minus_r5 != null ? `${r.mean_signed_error_min_quorum_minus_r5} min` : null],
        ['Reached only by our router', n0(r.reachable_only_in_quorum)],
      ]),
      notes: Array.isArray(d.known_model_differences) ? d.known_model_differences : [],
    };
  }
  if (key === 'lp') {
    const F1 = d.F1 || {};
    const fpass = ['F4', 'F5', 'F6'].filter((k) => d[k]?.pass === true);
    return {
      when: whenOf(d),
      lead: d.method || null,
      facts: keep([
        ['Random instances checked envy-free', of(F1.envyFree, F1.instances)],
        ['Rent sums exactly to the house rent', of(F1.rentSumOk, F1.instances)],
        ['Caps respected when a split under caps exists', of(F1.capsRespectedWhenFeasible, F1.feasible)],
        ['Negative rents in random instances', n0(F1.negativePrice)],
        ['Closed-form two-person cases matched', of(get(d, 'F2.closedForm.match'), get(d, 'F2.closedForm.instances'))],
        ['Published counterexamples reproduced', fpass.length ? `${fpass.join(', ')} (${fpass.length} of 3)` : null],
        ['Value errors within the slack s: split stays envy-free', of(get(d, 'F7.stayedEF'), get(d, 'F7.trials'))],
        ['Whole test run', d.totalSeconds != null ? `${d.totalSeconds} s` : null],
      ]),
      notes: [d.label].filter(Boolean),
    };
  }
  return null;
}

// ---------- recovery curves (scripts/recovery.mjs layout: results[].perPick) ----------
export const RECOVERY_METRICS = {
  regretMean: { label: 'Mean regret ($/month)', unit: '$/month', help: 'Regret is how much worse, in dollars a month, the recommended room is than the true best room for that student.' },
  regretP90: { label: '90th percentile regret ($/month)', unit: '$/month', help: 'The 90th percentile of regret across trials, in dollars a month.' },
  top1: { label: 'Share that got the true best home', unit: 'share of trials', help: 'Share of trials where the recommendation is the true best room.' },
  maeLogVTime: { label: 'Error in value of time (log scale)', unit: 'mean abs log error', help: 'Mean absolute error of the learned value of time, on a log scale (0.1 is about 10%).' },
};

export function recoveryCurves(d) {
  const results = Array.isArray(d?.results) ? d.results : null;
  if (!results || !results.length || !results.every((r) => Array.isArray(r.perPick))) return null;
  const setOf = (r) => (r.set ? r.set : r.offPrior ? 'off-prior' : 'prior');
  const series = results.map((r) => ({
    set: setOf(r), tauScale: r.tauScale, policy: r.policy,
    pts: r.perPick.filter((p) => typeof p.pick === 'number').map((p) => ({ pick: p.pick, rec: p })),
  }));
  const sets = [...new Set(series.map((x) => x.set))].sort((a, b) => (a === 'off-prior' ? -1 : b === 'off-prior' ? 1 : 0));
  const taus = [...new Set(series.map((x) => x.tauScale))].filter((t) => typeof t === 'number').sort((a, b) => a - b);
  return { series, sets, taus };
}
