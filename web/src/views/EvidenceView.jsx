// How we know: one chart per model, each against something built separately, read live from
// web/public/data/evidence/*.json. The test files, every constant and the references sit in one disclosure.
import React, { useEffect, useMemo, useState } from 'react';
import { FILES, passOf, partition, fmtVal, flattenConfig, isObj, summaryOf } from './evidence/report.js';
import { useConfigVersion } from '../engine/useConfig.js';
import { ASSUMPTIONS } from './evidence/assumptions.js';
import SOURCES from './evidence/sources.json';
import { DiffHistogram, RegretCurves, RegretLegend, CheckGrid, r5Diffs, regretSeries, recoveryComparison, C } from './evidence/charts.jsx';
import './evidence/evidence.css';

const int = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '-');
const pct0 = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '-');

export default function EvidenceView({ api }) {
  return (
    <div className="hk">
      <header className="hk-head">
        <h1>How we know</h1>
        <p>Each part of Quorum checked against something built separately.</p>
      </header>
      <Guard name="How we know"><EvidenceBody api={api} /></Guard>
    </div>
  );
}

class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error('[evidence]', this.props.name, err); }
  render() { return this.state.err ? <p className="hk-muted">{this.props.name} could not be drawn: {String(this.state.err.message || this.state.err)}</p> : this.props.children; }
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
          out[f.key] = { status: 'ok', data: await r.json() };
        } catch {
          out[f.key] = startup ? { status: 'ok', data: startup } : { status: 'missing' };
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
  const loading = !Object.keys(ev).length;
  const d = (k) => (ev[k]?.status === 'ok' ? ev[k].data : null);
  return (
    <>
      <Router router={d('router')} r5={d('r5')} loading={loading} />
      <Questions rec={d('recovery')} loading={loading} />
      <FairSplit lp={d('lp')} loading={loading} />
      <details className="hk-more">
        <summary>How we got this</summary>
        <div className="hk-more-body">
          <TestFiles ev={ev} loading={loading} readAt={readAt} reload={reload} />
          <h3>Every constant the engine uses</h3>
          {api?.config ? <AssumptionsTable cfg={api.config} /> : <p className="hk-muted">The config is not loaded yet.</p>}
          <h3>References and data</h3>
          <SourcesTable />
        </div>
      </details>
    </>
  );
}

function Big({ value, of, unit, label }) {
  return (
    <div className="hk-big">
      <div className="hk-big-v">{value}{of != null && <span className="hk-big-of"> of {of}</span>}{unit && <span className="hk-big-u"> {unit}</span>}</div>
      <div className="hk-big-l">{label}</div>
    </div>
  );
}

function NotRun({ file, loading }) {
  return <p className="hk-muted">{loading ? 'Reading the test files.' : `${file} has not been written on this build.`}</p>;
}

// ---------- trip times ----------
function Router({ router, r5, loading }) {
  const h = useMemo(() => r5Diffs(r5), [r5]);
  const share = h ? h.within2 / h.both : r5?.result?.share_within_2_min;
  return (
    <section className="hk-card">
      <div className="hk-card-head">
        <h2>Trip times</h2>
        <p>{h ? `Within 2 minutes of R5, a widely used transit router, on ${pct0(share)} of ${int(h.both)} trips.` : 'Compared with R5, a widely used transit router.'}</p>
      </div>
      <div className="hk-split">
        <figure className="hk-fig">
          {h ? (
            <>
              <DiffHistogram data={h} />
              <figcaption className="hk-key">
                <span><i style={{ background: C.green }} />within 2 minutes</span>
                <span><i style={{ background: C.light }} />further apart</span>
                {h.onlyOurs > 0 && <span className="hk-muted">{int(h.onlyOurs)} more trips only our router finds</span>}
              </figcaption>
            </>
          ) : <NotRun file="r5.json" loading={loading} />}
        </figure>
        <div className="hk-nums">
          {router ? (
            <>
              <Big value={int(router.equal)} of={int(router.queries)} label="trips equal to the second, against a second router written from the raw timetables" />
              {router.all_targets && <Big value={int(router.all_targets.equal)} of={int(router.all_targets.stop_comparisons)} label="arrival times at every stop, equal" />}
            </>
          ) : <NotRun file="router.json" loading={loading} />}
        </div>
      </div>
    </section>
  );
}

// ---------- the questions ----------
const SETS = [['off-prior', 'Unusual students'], ['prior', 'Typical students']];
const NOISE = [[0.5, 'Careful answers'], [1, 'As assumed'], [2, 'Noisy answers']];

function Questions({ rec, loading }) {
  const [set, setSet] = useState('off-prior');
  const [tau, setTau] = useState(1);
  const series = useMemo(() => regretSeries(rec, set, tau), [rec, set, tau]);
  const cmp = recoveryComparison(rec, set, tau, 'random');
  const vsRandom = (rec?.comparisons || []).filter((c) => c.vs === 'random');
  const wins = vsRandom.filter((c) => c.verdict === 'bald lower regret').length;
  const saved = cmp?.regretDiffMeanOverPicks?.mean;
  return (
    <section className="hk-card">
      <div className="hk-card-head">
        <h2>The questions</h2>
        <p>Our questions find the right home faster than random ones.</p>
      </div>
      {series ? (
        <div className="hk-split">
          <figure className="hk-fig">
            <div className="hk-toggles">
              <Seg options={SETS} value={set} onChange={setSet} label="Students" />
              <Seg options={NOISE} value={tau} onChange={setTau} label="Answers" />
            </div>
            <RegretCurves series={series} />
            <figcaption className="hk-key">
              <RegretLegend series={series} />
              <span className="hk-muted">Average $ a month lost to the wrong home, {int(rec.trials)} sample students</span>
            </figcaption>
          </figure>
          <div className="hk-nums">
            {Number.isFinite(saved) && <Big value={`$${int(-saved)}`} unit="a month" label="less lost than with random questions, averaged over the questions" />}
            {cmp && <Big value={pct0(cmp.top1Bald)} unit={`vs ${pct0(cmp.top1Other)}`} label={`find the true best home after ${rec.picks ?? 6} questions, ours vs random`} />}
            {vsRandom.length > 0 && <Big value={int(wins)} of={int(vsRandom.length)} label="test settings where ours loses less than random" />}
          </div>
        </div>
      ) : <NotRun file="recovery.json" loading={loading} />}
    </section>
  );
}

function Seg({ options, value, onChange, label }) {
  return (
    <div className="hk-seg" role="group" aria-label={label}>
      {options.map(([v, name]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{name}</button>
      ))}
    </div>
  );
}

// ---------- fair split ----------
function FairSplit({ lp, loading }) {
  const F1 = lp?.F1;
  const hard = ['F4', 'F5', 'F6'].filter((k) => lp?.[k]);
  const hardOk = hard.filter((k) => lp[k].pass === true).length;
  return (
    <section className="hk-card">
      <div className="hk-card-head">
        <h2>Fair rent split</h2>
        <p>{F1 ? 'Every random house we tested ended with nobody wanting to swap rooms.' : 'Random houses, each split checked by separate code.'}</p>
      </div>
      {F1 ? (
        <div className="hk-split">
          <figure className="hk-fig">
            <CheckGrid lp={lp} />
            <figcaption className="hk-key">
              <span><i style={{ background: C.green }} />one random house: split envy-free, confirmed by a separate checker</span>
            </figcaption>
          </figure>
          <div className="hk-nums">
            <Big value={int(Math.min(F1.envyFree, F1.checkerOk))} of={int(F1.instances)} label="houses where nobody prefers another room at its price" />
            <Big value={int(F1.rentSumOk)} of={int(F1.instances)} label="splits that add up exactly to the house rent" />
            {hard.length > 0 && <Big value={int(hardOk)} of={int(hard.length)} label="hard cases from published papers, reproduced" />}
          </div>
        </div>
      ) : <NotRun file="lp.json" loading={loading} />}
    </section>
  );
}

// ---------- disclosure: the test files ----------
function TestFiles({ ev, loading, readAt, reload }) {
  return (
    <>
      <div className="hk-files-head">
        <h3>The test files</h3>
        <span className="hk-muted">{loading ? 'Reading' : readAt ? `Read at ${readAt.toLocaleTimeString('en-US')}` : ''}</span>
        <button type="button" className="hk-text-btn" onClick={reload} disabled={loading}>Reload</button>
      </div>
      <div className="hk-files">
        {FILES.map((f) => {
          const e = ev[f.key];
          const data = e?.status === 'ok' ? e.data : null;
          const pass = data ? passOf(data) : null;
          const sum = data ? summaryOf(f.key, data) : null;
          return (
            <div key={f.key} className="hk-file">
              <div className="hk-file-top">
                <b>{f.title}</b>
                <span className={`hk-state ${pass === true ? 'ok' : pass === false ? 'bad' : ''}`}>{loading ? 'reading' : !data ? 'not run yet' : pass === true ? 'passed' : pass === false ? 'failed' : 'measured'}</span>
              </div>
              <div className="hk-muted hk-mono">{f.file}</div>
              {sum ? (
                <>
                  {sum.lead && <p className="hk-small">{sum.lead}</p>}
                  <dl className="hk-facts">
                    {sum.facts.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}
                  </dl>
                  {sum.notes?.length > 0 && <ul className="hk-notes">{sum.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                </>
              ) : data ? <Flat data={data} /> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Plain field list for a file without a curated summary.
function Flat({ data }) {
  if (!isObj(data)) return null;
  const { scalars } = partition(data);
  return (
    <dl className="hk-facts">
      {scalars.slice(0, 14).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{fmtVal(v)}</dd></React.Fragment>)}
    </dl>
  );
}

function AssumptionsTable({ cfg }) {
  const rows = flattenConfig(cfg);
  return (
    <div className="hk-scroll">
      <table className="hk-table">
        <thead><tr><th>Constant</th><th>Meaning</th><th className="num">Value</th><th>Source</th></tr></thead>
        <tbody>
          {rows.map(([k, v]) => {
            const a = ASSUMPTIONS[k];
            const val = k === 'termDates' && Array.isArray(v) ? v.map((x) => x.date || x).join(', ') : fmtVal(v);
            return (
              <tr key={k}>
                <td className="hk-mono">{k}</td>
                <td>{a?.[0] || ''}</td>
                <td className="num hk-mono">{val}</td>
                <td className="hk-muted">{a?.[1] || 'see engine/config.js'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourcesTable() {
  const groups = [];
  for (const r of SOURCES.references) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) groups.push((g = { name: r.group, refs: [] }));
    g.refs.push(r);
  }
  return (
    <div className="hk-refs">
      {groups.map((g) => (
        <div key={g.name}>
          <h4>{g.name}</h4>
          <ul>
            {g.refs.map((r) => (
              <li key={r.key}>{r.cite} <a href={r.url} target="_blank" rel="noreferrer">link</a> <span className="hk-muted">{r.verified}</span></li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <h4>Data</h4>
        <ul>
          {SOURCES.data.map((x) => <li key={x.name}><b>{x.name}.</b> {x.detail} <span className="hk-muted">{x.license}</span></li>)}
        </ul>
      </div>
      <p className="hk-muted">Verified means the page was opened during the design work. "Abstract" means only the abstract was read.</p>
    </div>
  );
}
