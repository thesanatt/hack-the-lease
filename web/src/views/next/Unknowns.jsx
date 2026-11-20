// "What to find out first": one bar per unknown (what knowing it is worth, $/month, with its error as a thin
// line under the bar), the
// options as chips under each bar. A chip settles that unknown; a settled chip with an x undoes it.
// Props: res, settled { factorId: optionId }, onSettle(fid, oid), onUnsettle(fid)
import { useState } from 'react';
import { money, findOutSentence } from './format.js';

function optionCounts(scenarios, fid) {
  const c = new Map();
  for (const s of scenarios) {
    const o = s.attrs?.[fid];
    if (o != null) c.set(o, (c.get(o) || 0) + 1);
  }
  return c;
}

const ALWAYS = 3; // bars always shown; the rest only when worth $1 a month or more

export default function Unknowns({ res, settled, onSettle, onUnsettle }) {
  const [all, setAll] = useState(false);
  const byId = new Map(res.factors.map((f) => [f.id, f]));
  const rows = (res.voi?.byFactor || []).map((b) => ({ ...byId.get(b.id), ...b, kind: byId.get(b.id)?.kind }));
  const done = res.factors.filter((f) => f.id in settled);
  const n = res.scenarios.length;
  const evpi = res.voi?.evpi?.value || 0;
  // One unknown can never be worth more than knowing everything, so the error line stops at that price.
  const max = Math.max(1, evpi, ...rows.map((r) => r.value));
  const span = (r) => [Math.max(0, r.value - 2 * (r.se || 0)), Math.min(Math.max(evpi, r.value), r.value + 2 * (r.se || 0))];
  const shown = all ? rows : rows.filter((r, i) => i < ALWAYS || r.value >= 1);
  const hidden = rows.length - shown.length;
  const x = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

  return (
    <section className="you-sec nx-sec" aria-labelledby="nx-first">
      <div className="you-sec-head">
        <h2 id="nx-first">What to find out first</h2>
        {done.map((f) => {
          const o = f.options.find((op) => op.id === settled[f.id]);
          return (
            <span key={f.id} className="nx-settled">
              <span className="nx-settled-l">{f.label}: {o?.label ?? settled[f.id]}</span>
              <button type="button" aria-label={`Undo ${f.label}`} title="Undo" onClick={() => onUnsettle(f.id)}>x</button>
            </span>
          );
        })}
      </div>
      <div className="nx-bars" role="list">
        {shown.map((r) => {
          const counts = optionCounts(res.scenarios, r.id);
          return (
            <div key={r.id} className="nx-bar-row" role="listitem">
              <span className="nx-bar-label">{r.label}</span>
              <span className="nx-track" aria-hidden="true">
                <span className="nx-fill" style={{ width: x(r.value) }} />
                {r.se > 0 && span(r)[1] > span(r)[0] && (
                  <span className="nx-err" title="About two standard errors"
                    style={{ left: x(span(r)[0]), width: `calc(${x(span(r)[1])} - ${x(span(r)[0])})` }} />
                )}
              </span>
              <span className="nx-bar-v">{money(r.value)}<span className="nx-unit">/mo</span></span>
              <span className="nx-opts" role="group" aria-label={`Settle ${r.label}`}>
                {(r.options || []).map((o) => {
                  const c = counts.get(o.id) || 0;
                  return (
                    <button key={o.id} type="button" className="chip nx-opt" disabled={!c}
                      title={c ? `${Math.round((100 * c) / n)}% of your possible weeks` : 'In none of your possible weeks'}
                      onClick={() => onSettle(r.id, o.id)}>
                      {o.label}
                    </button>
                  );
                })}
              </span>
            </div>
          );
        })}
        {!rows.length && <p className="nx-none">Nothing is left unknown.</p>}
        {(hidden > 0 || all) && rows.length > ALWAYS && (
          <button type="button" className="btn quiet small nx-more" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `${hidden} more, each under $1 a month`}
          </button>
        )}
      </div>
      <p className="nx-sentence">{findOutSentence(rows[0])}</p>
    </section>
  );
}
