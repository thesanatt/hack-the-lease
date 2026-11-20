// Evidence view: every validation file as written by the test scripts (missing ones say so), the
// preference recovery curves, the assumptions table from api.config and the verified sources.
import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Pill, Label, Pending, Note, Guard, Button, configOf } from './group/kit.jsx';
import { FILES, passOf, metaOf, partition, columnsOf, fmtVal, findSeries, metricsOf, defaultMetric, flattenConfig, isObj, summaryOf, recoveryCurves, RECOVERY_METRICS } from './evidence/report.js';
import { useConfigVersion } from '../engine/useConfig.js';
import { ASSUMPTIONS } from './evidence/assumptions.js';
import SOURCES from './evidence/sources.json';

const SERIES_COLORS = ['var(--accent, #b4441c)', 'var(--ink, #1d1a16)', 'var(--good, #2f6b3a)', 'var(--warn, #9a6a00)', 'var(--dark-walk, #2f4b6b)', 'var(--muted, #7a7266)'];
const DASH = ['', '5 3', '2 3', '8 3 2 3', '1 2', '10 4'];

export default function EvidenceView({ api }) {
  return (
    <div className="qv-view">
      <div className="qv-head">
        <h1>Evidence</h1>
        <p>What was tested, what it found, what is assumed, and where each method comes from. A test that did not run is shown as not run.</p>
        <Label>SAMPLE DATA: SYNTHETIC homes and population</Label>
      </div>
      <Guard name="Evidence view"><EvidenceBody api={api} /></Guard>
    </div>
  );
}

// Reads every evidence file fresh each time the view opens (and on Reload), so a test re-run during the
// event shows up without restarting the app. The copy loaded at startup is only a fallback.
function useEvidence(api) {
  const [state, setState] = useState({});
  const [readAt, setReadAt] = useState(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    const fromApi = api?.data?.evidence || {};
    (async () => {
      const out = {};
      await Promise.all(FILES.map(async (f) => {
        const camel = f.key.replace(/_(\w)/g, (_, c) => c.toUpperCase());
        const startup = fromApi[f.key] ?? fromApi[camel];
        try {
          const r = await fetch(`./data/evidence/${f.file}?t=${Date.now()}`, { cache: 'no-store' });
          const type = r.headers.get('content-type') || '';
          if (!r.ok || type.includes('text/html')) throw new Error('missing');
          out[f.key] = { status: 'ok', data: await r.json(), fresh: true };
        } catch {
          out[f.key] = startup ? { status: 'ok', data: startup, fresh: false } : { status: 'missing' };
        }
      }));
      if (live) { setState(out); setReadAt(new Date()); }
    })();
    return () => { live = false; };
  }, [api, nonce]);
  return { ev: state, readAt, reload: () => { setState({}); setNonce((n) => n + 1); } };
}

function EvidenceBody({ api }) {
  useConfigVersion(api);
  const { ev, readAt, reload } = useEvidence(api);
  const cfg = configOf(api);
  const loading = !Object.keys(ev).length;
  const fileByKey = Object.fromEntries(FILES.map((f) => [f.key, f]));

  return (
    <div className="qv-grid">
      <div className="qv-span-12">
        <Panel kicker="Index" title="Validation files" right={(
          <span className="qv-row">
            <span className="qv-small qv-muted">{loading ? 'Reading the files' : readAt ? `Read from disk at ${readAt.toLocaleTimeString('en-US')}` : ''}</span>
            <Button tone="quiet" onClick={reload} disabled={loading}>Reload</Button>
          </span>
        )}>
          <table className="qv-table">
            <thead><tr><th>Check</th><th>File</th><th>What it shows</th><th>Status</th></tr></thead>
            <tbody>
              {FILES.map((f) => {
                const e = ev[f.key];
                const pass = e?.data ? passOf(e.data) : null;
                return (
                  <tr key={f.key}>
                    <td>{f.title}</td>
                    <td className="qv-mono qv-small">{f.file}</td>
                    <td className="qv-small">{f.what}</td>
                    <td>{loading ? <Pill>loading</Pill> : e?.status === 'ok'
                      ? <Pill tone={pass === false ? 'bad' : pass === true ? 'good' : ''}>{pass === false ? 'failed' : pass === true ? 'passed' : 'measured'}</Pill>
                      : <Pill>not run yet</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="qv-span-12">
        <Panel kicker="Preferences" title="Recovery curves" right={<Label>SIMULATED STUDENTS</Label>}>
          {ev.recovery?.status === 'ok' ? <Guard name="Recovery curves"><Recovery data={ev.recovery.data} /></Guard>
            : <Pending what="evidence/recovery.json" detail="scripts/recovery.mjs writes it. The curves appear here when it has run." />}
        </Panel>
      </div>

      {['router', 'router_labels', 'r5', 'lp'].map((k) => (
        <div className="qv-span-6" key={k}>
          <Panel kicker={k === 'lp' ? 'Fair division' : 'Routing'} title={fileByKey[k].title}>
            {ev[k]?.status === 'ok' ? (
              <Guard name={fileByKey[k].title}>
                <Summary data={ev[k].data} fileKey={k} />
                <details className="qv-raw qv-wrap" style={{ marginTop: 10 }}>
                  <summary>Every field in {fileByKey[k].file}</summary>
                  <Report data={ev[k].data} />
                </details>
              </Guard>
            ) : <Pending what={`evidence/${fileByKey[k].file}`} detail={loading ? 'Reading the file.' : 'The check has not written its result yet.'} />}
          </Panel>
        </div>
      ))}

      <div className="qv-span-12">
        <Panel kicker="Assumptions" title="Every constant the engine uses" right={<span className="qv-small qv-muted">live values from the running config</span>}>
          {cfg ? <AssumptionsTable cfg={cfg} /> : <Pending what="The config in the engine adapter (api.config)" />}
        </Panel>
      </div>

      <div className="qv-span-12">
        <Panel kicker="Sources" title="Verified references and data">
          <SourcesTable />
        </Panel>
      </div>
    </div>
  );
}

// ---------- curated summary: the few numbers a judge asks about, each with its plain meaning ----------
function Summary({ data, fileKey }) {
  const sum = summaryOf(fileKey, data);
  if (!sum) return <Report data={data} />;
  const pass = passOf(data);
  return (
    <div className="qv-stack">
      <div className="qv-row qv-small qv-muted">
        {pass != null && <Pill tone={pass ? 'good' : 'bad'}>{pass ? 'passed' : 'failed'}</Pill>}
        {sum.when && <span>Run {sum.when}</span>}
      </div>
      {sum.lead && <p style={{ margin: 0 }}>{sum.lead}</p>}
      <dl className="qv-facts">
        {sum.facts.map(([label, value]) => (
          <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>
        ))}
      </dl>
      {sum.notes?.length > 0 && (
        <ul className="qv-small qv-muted" style={{ margin: 0, paddingLeft: 18 }}>
          {sum.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---------- generic report ----------
function Report({ data, depth = 0 }) {
  if (!isObj(data)) {
    if (Array.isArray(data) && data.every(isObj)) return <RowsTable rows={data} />;
    return <p className="qv-mono qv-small">{fmtVal(data)}</p>;
  }
  const meta = metaOf(data);
  const pass = passOf(data);
  const { scalars, tables, nested, lists } = partition(data);
  return (
    <div className="qv-stack">
      {(Object.keys(meta).length > 0 || pass != null) && (
        <div className="qv-row qv-small qv-muted">
          {pass != null && <Pill tone={pass ? 'good' : 'bad'}>{pass ? 'passed' : 'failed'}</Pill>}
          {Object.entries(meta).map(([k, v]) => <span key={k}><span className="qv-kicker">{k}</span> {String(v)}</span>)}
        </div>
      )}
      {(scalars.length > 0 || lists.length > 0) && (
        <table className="qv-table">
          <tbody>
            {scalars.map(([k, v]) => (
              <tr key={k}>
                <td className="qv-small">{k}</td>
                <td className={typeof v === 'number' ? 'num' : 'qv-small'}>{typeof v === 'boolean' && PASSY.test(k) ? <Pill tone={v ? 'good' : 'bad'}>{v ? 'yes' : 'no'}</Pill> : fmtVal(v)}</td>
              </tr>
            ))}
            {lists.map(([k, v]) => <tr key={k}><td className="qv-small">{k}</td><td className="qv-small">{fmtVal(v)}</td></tr>)}
          </tbody>
        </table>
      )}
      {tables.map(([k, rows]) => (
        <div key={k}>
          <div className="qv-kicker" style={{ marginBottom: 4 }}>{k}</div>
          <RowsTable rows={rows} />
        </div>
      ))}
      {nested.map(([k, v]) => (
        depth < 2 ? (
          <div key={k} style={{ borderLeft: '2px solid var(--line, #d6cdbd)', paddingLeft: 10 }}>
            <div className="qv-kicker" style={{ marginBottom: 4 }}>{k}</div>
            <Report data={v} depth={depth + 1} />
          </div>
        ) : <p key={k} className="qv-small"><span className="qv-kicker">{k}</span> {fmtVal(v)}</p>
      ))}
    </div>
  );
}

const PASSY = /^(pass|passed|ok|success|exact|match|matches|consistent|monotone|sorted)$/i;

function RowsTable({ rows }) {
  const cols = columnsOf(rows);
  const shown = rows.slice(0, 40);
  return (
    <div className="qv-scroll">
      <table className="qv-table">
        <thead><tr>{cols.map((c) => <th key={c} className={typeof rows[0]?.[c] === 'number' ? 'num' : ''}>{c}</th>)}</tr></thead>
        <tbody>
          {shown.map((r, i) => {
            const p = passOf(r);
            return (
              <tr key={i}>
                {cols.map((c) => {
                  const v = r[c];
                  if (typeof v === 'boolean' && PASS_COL.test(c)) return <td key={c}><Pill tone={v ? 'good' : 'bad'}>{v ? 'pass' : 'fail'}</Pill></td>;
                  if (c === 'status' && p != null) return <td key={c}><Pill tone={p ? 'good' : 'bad'}>{String(v)}</Pill></td>;
                  return <td key={c} className={typeof v === 'number' ? 'num' : 'qv-small'}>{fmtVal(v)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > shown.length && <p className="qv-small qv-muted">First {shown.length} of {rows.length} rows.</p>}
    </div>
  );
}
const PASS_COL = /^(pass|passed|ok|success)$/i;

// ---------- recovery curves ----------
function Recovery({ data }) {
  const curated = useMemo(() => recoveryCurves(data), [data]);
  if (curated) return <RecoveryCurated data={data} curated={curated} />;
  return <RecoveryGeneric data={data} />;
}

const POLICY_NAME = { bald: 'most informative question (BALD)', random: 'random pair', fixed: 'fixed list of 6' };
const SET_NAME = { 'off-prior': 'Off-prior students (stress set)', prior: 'Students drawn from the prior (correctness check)' };

function RecoveryCurated({ data, curated }) {
  const [set, setSet] = useState(curated.sets[0]);
  const [tau, setTau] = useState(curated.taus.includes(1) ? 1 : curated.taus[0]);
  const [metric, setMetric] = useState('regretMean');
  const info = RECOVERY_METRICS[metric];
  const series = curated.series
    .filter((x) => x.set === set && x.tauScale === tau)
    .map((x) => ({ name: POLICY_NAME[x.policy] || x.policy, pts: x.pts }));
  const comps = (data.comparisons || []).filter((c) => c.set === set && c.tauScale === tau);
  const ci = (d) => (d && Number.isFinite(d.mean) ? `${d.mean.toFixed(1)} (${d.lo.toFixed(1)} to ${d.hi.toFixed(1)})` : 'n/a');
  return (
    <div className="qv-stack">
      {data.headline?.text && <Note tone={data.headline.baldBeatsRandom ? 'good' : ''}>{data.headline.text}</Note>}
      <div className="qv-row">
        <label htmlFor="rec-set">Students</label>
        <select id="rec-set" value={set} onChange={(e) => setSet(e.target.value)}>
          {curated.sets.map((k) => <option key={k} value={k}>{SET_NAME[k] || k}</option>)}
        </select>
        <label htmlFor="rec-tau">Answer noise</label>
        <select id="rec-tau" value={tau} onChange={(e) => setTau(Number(e.target.value))}>
          {curated.taus.map((t) => <option key={t} value={t}>{t === 1 ? 'as assumed (x1)' : `x${t}`}</option>)}
        </select>
        <label htmlFor="rec-metric">Measure</label>
        <select id="rec-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
          {Object.entries(RECOVERY_METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <LineChart series={series} metric={metric} yLabel={info.unit} />
      <div className="qv-legend">
        {series.map((x, i) => (
          <span key={x.name}>
            <svg width="26" height="10" aria-hidden="true"><line x1="0" y1="5" x2="26" y2="5" stroke={SERIES_COLORS[i]} strokeWidth="2" strokeDasharray={DASH[i]} /></svg>{' '}
            {x.name}
          </span>
        ))}
      </div>
      {comps.length > 0 && (
        <table className="qv-table">
          <thead><tr><th>BALD against</th><th className="num">Regret difference, mean over picks 1 to 6, $/mo (95% interval)</th><th>Verdict</th></tr></thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.vs}>
                <td>{POLICY_NAME[c.vs] || c.vs}</td>
                <td className="num">{ci(c.regretDiffMeanOverPicks)}</td>
                <td><Pill tone={/bald lower/.test(c.verdict) ? 'good' : /bald higher/.test(c.verdict) ? 'bad' : ''}>{c.verdict}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="qv-small qv-muted" style={{ margin: 0 }}>
        {info.help} SYNTHETIC students with known values answer picks through the logit model; {data.trials ?? 'n/a'} trials per
        line, seed {data.seed ?? 'n/a'}. A negative regret difference favors BALD. Values are as written by scripts/recovery.mjs
        ({data.date || 'date not recorded'}); nothing is smoothed or tuned here.
      </p>
    </div>
  );
}

function RecoveryGeneric({ data }) {
  const series = useMemo(() => findSeries(data), [data]);
  const metrics = useMemo(() => metricsOf(series), [series]);
  const [metric, setMetric] = useState(null);
  const m = metric && metrics.includes(metric) ? metric : defaultMetric(metrics);
  const meta = metaOf(data);
  if (!series.length || !m) {
    return (
      <div>
        <Note>recovery.json is present but has no per-pick curves this view can read. Its contents:</Note>
        <Report data={data} />
      </div>
    );
  }
  const shown = series.filter((x) => x.pts.some((p) => typeof p.rec[m] === 'number')).slice(0, 6);
  return (
    <div className="qv-stack">
      <div className="qv-row">
        <label htmlFor="rec-metric">Measure</label>
        <select id="rec-metric" value={m} onChange={(e) => setMetric(e.target.value)}>
          {metrics.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        {Object.entries(meta).map(([k, v]) => <span key={k} className="qv-small qv-muted"><span className="qv-kicker">{k}</span> {String(v)}</span>)}
      </div>
      <LineChart series={shown} metric={m} />
      <div className="qv-legend">
        {shown.map((x, i) => (
          <span key={x.name}>
            <svg width="26" height="10" aria-hidden="true"><line x1="0" y1="5" x2="26" y2="5" stroke={SERIES_COLORS[i]} strokeWidth="2" strokeDasharray={DASH[i]} /></svg>{' '}
            {x.name}
          </span>
        ))}
      </div>
      <p className="qv-small qv-muted" style={{ margin: 0 }}>
        Simulated students with known values answer picks through the logit model. The x axis is the number of picks
        answered. Values are as written by scripts/recovery.mjs; nothing is smoothed or tuned here.
      </p>
      {series.length > shown.length && <p className="qv-small qv-muted">{series.length - shown.length} more series in the file are not drawn.</p>}
    </div>
  );
}

function LineChart({ series, metric, yLabel }) {
  const W = 720, H = 270, L = 64, R = 16, T = 22, B = 36;
  const pts = series.flatMap((s) => s.pts.filter((p) => typeof p.rec[metric] === 'number' && Number.isFinite(p.rec[metric])));
  if (!pts.length) return <Note>No finite values for {metric}.</Note>;
  const xs = pts.map((p) => p.pick), ys = pts.map((p) => p.rec[metric]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
  if (y1 === y0) y1 = y0 + 1;
  const X = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const yt = ticks(y0, y1, 5);
  const xt = [];
  for (let x = Math.ceil(x0); x <= x1; x++) xt.push(x);
  return (
    <svg className="qv-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metric} by number of picks`}>
      {yt.map((t) => (
        <g key={t}>
          <line className="axis" x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} strokeWidth="1" />
          <text x={L - 6} y={Y(t) + 4} textAnchor="end">{fmtVal(t)}</text>
        </g>
      ))}
      {xt.map((t) => <text key={t} x={X(t)} y={H - B + 16} textAnchor="middle">{t}</text>)}
      <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle">picks answered</text>
      {yLabel && <text x={L} y={T - 8} textAnchor="start">{yLabel}</text>}
      {series.map((s, i) => {
        const p = s.pts.filter((q) => typeof q.rec[metric] === 'number' && Number.isFinite(q.rec[metric]));
        const d = p.map((q, k) => `${k ? 'L' : 'M'}${X(q.pick).toFixed(1)},${Y(q.rec[metric]).toFixed(1)}`).join(' ');
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={SERIES_COLORS[i]} strokeWidth="2" strokeDasharray={DASH[i]} />
            {p.map((q, k) => <circle key={k} cx={X(q.pick)} cy={Y(q.rec[metric])} r="2.5" fill={SERIES_COLORS[i]}><title>{`${s.name}: ${fmtVal(q.rec[metric])} after ${q.pick} picks`}</title></circle>)}
          </g>
        );
      })}
    </svg>
  );
}

function ticks(lo, hi, n) {
  const span = hi - lo;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Number(t.toPrecision(10)));
  return out;
}

// ---------- assumptions ----------
function AssumptionsTable({ cfg }) {
  const rows = flattenConfig(cfg);
  return (
    <div className="qv-scroll">
      <table className="qv-table">
        <thead><tr><th>Constant</th><th>Meaning</th><th className="num">Value</th><th>Source</th></tr></thead>
        <tbody>
          {rows.map(([k, v]) => {
            const a = ASSUMPTIONS[k];
            const val = k === 'termDates' && Array.isArray(v) ? v.map((d) => d.date || d).join(', ') : fmtVal(v);
            const src = a?.[1] || 'see engine/config.js';
            return (
              <tr key={k}>
                <td className="qv-mono qv-small">{k}</td>
                <td className="qv-small">{a?.[0] || ''}</td>
                <td className="num">{val}</td>
                <td className="qv-small">{/assumption/.test(src) ? <><Pill tone="warn">assumption</Pill> {src.replace(/^assumption;?\s*/, '')}</> : src}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- sources ----------
function SourcesTable() {
  const groups = [];
  for (const r of SOURCES.references) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) groups.push((g = { name: r.group, refs: [] }));
    g.refs.push(r);
  }
  return (
    <div className="qv-stack">
      {groups.map((g) => (
        <div key={g.name}>
          <div className="qv-kicker" style={{ marginBottom: 4 }}>{g.name}</div>
          <table className="qv-table">
            <tbody>
              {g.refs.map((r) => (
                <tr key={r.key}>
                  <td className="qv-mono qv-small" style={{ width: '17%' }}>{r.key}</td>
                  <td className="qv-small">{r.cite} <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #b4441c)' }}>link</a></td>
                  <td className="qv-small qv-muted" style={{ width: '18%' }}>{r.verified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div>
        <div className="qv-kicker" style={{ marginBottom: 4 }}>Data</div>
        <table className="qv-table">
          <tbody>
            {SOURCES.data.map((d) => (
              <tr key={d.name}><td className="qv-small" style={{ width: '17%' }}>{d.name}</td><td className="qv-small">{d.detail}</td><td className="qv-small qv-muted">{d.license}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="qv-small qv-muted" style={{ margin: 0 }}>
        Verified means the page or text was opened during the design work; "abstract" means only the abstract was read.
        Unverified references are left out of this table. Copied from docs/SYSTEM_DESIGN.md section 9.
      </p>
    </div>
  );
}
