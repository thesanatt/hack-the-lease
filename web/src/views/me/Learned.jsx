// What the picks taught: each weight's median and 80% interval against the prior's 80% interval (log scale).
// Props: summary (prefs.summary), prior ({param: {median, sigma}}), info (model.PARAM_INFO), truth (persona demo theta, optional)
import { Pill } from '../../components/index.js';

const Z80 = 1.2815515655446004;
const fmt = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1));
export const fmtEstimate = (v) => (Number.isFinite(v) ? String(fmt(v)) : '--');

export default function Learned({ summary, prior, info, truth }) {
  if (!summary) return null;
  return (
    <div>
      {Object.entries(summary).map(([k, s]) => {
        const p = prior[k];
        const plo = p.median * Math.exp(-Z80 * p.sigma * 1.6), phi = p.median * Math.exp(Z80 * p.sigma * 1.6);
        const X = (v) => `${Math.max(0, Math.min(100, ((Math.log(v) - Math.log(plo)) / (Math.log(phi) - Math.log(plo))) * 100))}%`;
        const prLo = p.median * Math.exp(-Z80 * p.sigma), prHi = p.median * Math.exp(Z80 * p.sigma);
        return (
          <div key={k} className="interval">
            <span>{info[k]?.label || k}</span>
            <span style={{ position: 'relative', height: 14 }}>
              <span style={{ position: 'absolute', left: X(prLo), width: `calc(${X(prHi)} - ${X(prLo)})`, top: 6, height: 2, background: 'var(--line)' }} />
              <span style={{ position: 'absolute', left: X(s.lo), width: `calc(${X(s.hi)} - ${X(s.lo)})`, top: 3, height: 8, background: s.mostlyPrior ? 'var(--muted)' : 'var(--ink)' }} />
              <span style={{ position: 'absolute', left: X(s.median), top: 0, height: 14, width: 2, background: 'var(--accent)' }} />
              {truth?.[k] != null && <span title="Persona demo value" style={{ position: 'absolute', left: X(truth[k]), top: 0, height: 14, width: 0, borderLeft: '2px dotted var(--good)' }} />}
            </span>
            <span className="mono">
              {fmt(s.median)} <span className="muted">({fmt(s.lo)} to {fmt(s.hi)})</span>
              {s.mostlyPrior && <> <Pill tone="muted" title="The 80% interval is still more than 0.7 of the prior's width">mostly prior</Pill></>}
            </span>
          </div>
        );
      })}
      <p className="small muted" style={{ marginTop: 6 }}>
        Units: {Object.entries(info).map(([k, v]) => `${v.label.toLowerCase()} in ${v.unit}`).join('; ')}. Gray line: the
        prior's 80% range. Bar: 80% interval after the picks. Red tick: median.{truth ? ' Dotted green: the persona demo value.' : ''}
        {' '}Weights the picks did not touch are labeled mostly prior. Stated choices tend to value time lower than behavior does, so
        treat the learned value of time as a floor.
      </p>
    </div>
  );
}
