// What the picks taught, as at most three small range bars: the gray hairline is the starting guess (prior 80% range),
// the dark bar is the 80% range after the picks, the tick is the median. Log scale. Shows the three weights the
// picks narrowed most, in a fixed order.
// Props: summary (prefs.summary), prior ({param: {median, sigma}}), info (model.PARAM_INFO), truth (persona demo theta, optional, unused on screen)
const Z80 = 1.2815515655446004;
const fmt = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1));
export const fmtEstimate = (v) => (Number.isFinite(v) ? String(fmt(v)) : '--');

// Plain labels and units for people.
const PLAIN = {
  vTime: { label: 'An hour of your time', unit: 'an hour' },
  vDark: { label: 'An hour walking in the dark', unit: 'an hour' },
  vStrand: { label: 'A trip with no ride', unit: 'a trip' },
  wBath: { label: 'A private bathroom', unit: 'a month' },
  wSize: { label: '10 more square feet', unit: 'a month' },
  wLight: { label: 'A brighter room', unit: 'a month' },
};
const ORDER = ['vTime', 'vDark', 'vStrand', 'wBath', 'wSize', 'wLight'];

export default function Learned({ summary, prior, info }) {
  if (!summary) return null;
  const keys = ORDER.filter((k) => summary[k] && prior?.[k]).concat(Object.keys(summary).filter((k) => !ORDER.includes(k) && prior?.[k]));
  // How much each range narrowed against the prior's 80% range (log widths).
  const shrink = (k) => {
    const s = summary[k], p = prior[k];
    const w = Math.log(s.hi) - Math.log(s.lo), pw = 2 * Z80 * p.sigma;
    return pw > 0 ? 1 - w / pw : 0;
  };
  const top = [...keys].sort((a, b) => shrink(b) - shrink(a)).slice(0, 3);
  const shown = keys.filter((k) => top.includes(k));
  const W = 100;
  return (
    <div className="mp-learned">
      {shown.map((k) => {
        const s = summary[k], p = prior[k];
        const plo = p.median * Math.exp(-Z80 * p.sigma * 1.6), phi = p.median * Math.exp(Z80 * p.sigma * 1.6);
        const X = (v) => Math.max(0, Math.min(W, ((Math.log(v) - Math.log(plo)) / (Math.log(phi) - Math.log(plo))) * W));
        const prLo = p.median * Math.exp(-Z80 * p.sigma), prHi = p.median * Math.exp(Z80 * p.sigma);
        const plain = PLAIN[k] || { label: info?.[k]?.label || k, unit: info?.[k]?.unit || '' };
        const x0 = X(s.lo), x1 = X(s.hi);
        const tip = `${plain.label}: $${fmt(s.median)} ${plain.unit}, 80% range $${fmt(s.lo)} to $${fmt(s.hi)}. Starting guess $${fmt(prLo)} to $${fmt(prHi)}.`;
        return (
          <div key={k} className={`mp-lrow ${s.mostlyPrior ? 'prior' : ''}`} title={tip}>
            <span className="l">{plain.label}</span>
            <span className="bar" role="img" aria-label={tip}>
              <span className="pr" style={{ left: `${X(prLo)}%`, width: `${X(prHi) - X(prLo)}%` }} />
              <span className="po" style={{ left: `${x0}%`, width: `max(8px, ${x1 - x0}%)` }} />
              <span className="md" style={{ left: `${X(s.median)}%` }} />
            </span>
            <span className="v">${fmt(s.median)} <small>{plain.unit}</small></span>
          </div>
        );
      })}
    </div>
  );
}
