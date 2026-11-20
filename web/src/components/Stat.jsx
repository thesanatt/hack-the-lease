// Stat: one number with its label, set in mono.
// Props:
//   label  string (small caps above)
//   value  string or number (already formatted)
//   unit   string after the value, e.g. "$/mo" (optional)
//   note   small line under the value (optional)
//   tone   '' | 'good' | 'bad' | 'warn' colors the value
//   title  tooltip text (optional)
export default function Stat({ label, value, unit, note, tone = '', title }) {
  return (
    <div className={`stat ${tone}`} title={title}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
