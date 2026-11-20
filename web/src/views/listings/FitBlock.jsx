// "Fit NN/100" with the four category bars small under it. Used on each post card and in the comparison table.
// Props: s ({ fit, price, around, nights, dates } from fit.fitScores), compact (table cell: number and bars only)
import { CATEGORIES, FIT_TITLE } from './fit.js';

export default function FitBlock({ s, compact = false }) {
  if (!s) return null;
  const all = CATEGORIES.map((c) => `${c.label} ${s[c.key] ?? '--'}`).join(', ');
  return (
    <div className={`lv-fit${compact ? ' compact' : ''}${s.fit === 0 ? ' zero' : ''}`} title={FIT_TITLE}
      aria-label={`Fit ${s.fit} out of 100. ${all}.`} role="group">
      <span className="lv-fit-n" aria-hidden="true">
        {!compact && <span className="lv-fit-k">Fit </span>}{s.fit}<span className="lv-fit-u">/100</span>
      </span>
      <span className="lv-fit-cats" aria-hidden="true">
        {CATEGORIES.map((c) => (
          <span key={c.key} className="lv-fit-c" title={`${c.label}: ${s[c.key] ?? '--'}/100. ${c.title}.`}>
            {!compact && <span className="lv-fit-l">{c.label}</span>}
            <span className="lv-fit-b"><i style={{ width: `${Math.max(0, Math.min(100, s[c.key] ?? 0))}%` }} /></span>
          </span>
        ))}
      </span>
    </div>
  );
}
