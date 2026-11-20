// Controls for Next year: plan, catalog (sample or the student's own file, read in this browser only),
// one odds slider per maybe, and how early the student registers.
// Props: plans, planId, setPlanId, source, setSource, file, onFile(name, text), maybes, odds, setOdds,
//        priority, setPriority
import { useEffect, useRef, useState } from 'react';

const PRIORITY = [
  { id: 'early', label: 'Early', title: 'Each section is full 5% of the time' },
  { id: 'normal', label: 'Normal', title: 'Each section is full 20% of the time' },
  { id: 'late', label: 'Late', title: 'Each section is full 40% of the time' },
];

// Short chip names for the sample plans: "SAMPLE CS junior" reads as "CS junior".
const planLabel = (p) => String(p.name || p.id).replace(/^sample\s+/i, '');

function OddsChip({ m, value, onCommit }) {
  const [v, setV] = useState(value);
  const timer = useRef(null);
  useEffect(() => { setV(value); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (x) => {
    setV(x);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(x), 220);
  };
  const pctV = Math.round(v * 100);
  return (
    <label className="nx-odds" title={`${m.label}: chance it happens`}>
      <span className="nx-odds-l">{m.label}</span>
      <input type="range" min={0} max={100} step={5} value={pctV}
        aria-label={`${m.label}, chance it happens`}
        onChange={(e) => change(Number(e.target.value) / 100)} />
      <span className="nx-odds-v">{pctV}%</span>
    </label>
  );
}

export default function Controls({ plans, planId, setPlanId, source, setSource, file, onFile, maybes, odds, setOdds, priority, setPriority }) {
  const input = useRef(null);
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => onFile(f.name, String(r.result || ''));
    r.readAsText(f);
    e.target.value = '';
  };
  const p = file?.parsed;
  const placed = p ? p.sections.filter((s) => s.place).length : 0;

  return (
    <div className="nx-controls">
      <div className="you-who" role="group" aria-label="Plan">
        <span className="you-who-l">Plan</span>
        {plans.map((pl) => (
          <button key={pl.id} type="button" className="chip" aria-pressed={pl.id === planId} onClick={() => setPlanId(pl.id)}>
            {planLabel(pl)}
          </button>
        ))}
        <span className="chip-group" role="group" aria-label="Class catalog">
          <span className="you-who-l">Catalog</span>
          <button type="button" className="chip" aria-pressed={source === 'sample'} onClick={() => setSource('sample')}>Sample</button>
          {p && (
            <button type="button" className="chip" aria-pressed={source === 'file'} onClick={() => setSource('file')} title={file.name}>
              Your file
            </button>
          )}
        </span>
        <button type="button" className="btn quiet small" onClick={() => input.current?.click()}>Load my registrar file</button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={pick} data-testid="nx-file" />
        {p && <span className="nx-fileline">{p.sections.length} sections, {placed} placed on the map</span>}
        {file?.error && <span className="nx-fileline bad">That file did not read: {file.error}</span>}
        {source === 'sample' && <span className="nx-sample">Sample catalog</span>}
      </div>
      <div className="you-whatif" role="group" aria-label="What might change">
        {maybes.map((m) => (
          <OddsChip key={m.id} m={m} value={odds[m.id] ?? m.odds ?? 0.5}
            onCommit={(x) => setOdds((o) => ({ ...o, [m.id]: x }))} />
        ))}
        <span className="you-who-l nx-reg">Registration</span>
        <span className="chip-group nx-flat" role="group" aria-label="Registration">
          {PRIORITY.map((x) => (
            <button key={x.id} type="button" className="chip" aria-pressed={priority === x.id} title={x.title} onClick={() => setPriority(x.id)}>
              {x.label}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
