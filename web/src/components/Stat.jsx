// Stat: one big number with a small label under it.
// Props:
//   label  string, sentence case, under the number
//   value  string or number (already formatted)
//   unit   string after the value, e.g. "/mo" (optional)
//   note   small gray line under the label (optional)
//   tone   '' | 'good' | 'bad' | 'warn' colors the value
//   title  tooltip text (optional)
//   big    bool: the one number a card is about (44 px) (optional)
export default function Stat({ label, value, unit, note, tone = '', title, big = false }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}${big ? ' big' : ''}`} title={title}>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </span>
      {label && <span className="stat-label">{label}</span>}
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
