// WeekStrip: a week drawn like a printed timetable. One row per day, time runs left to right.
// Activities are pale blocks; each trip is a bar from departure to arrival colored by mode.
// Props:
//   trips     WeekResult.trips from week.js: [{day, mode, depart, arrive, darkMin, stranded, label, place, kind}]
//   entries   resolved routine entries [{id, label, days, start:'HH:MM', end:'HH:MM'}] (optional)
//   days      day ids to show (default mon..sun)
//   fromHour, toHour  axis range (default 6 to 25, i.e. 1 AM)
//   compact   bool: thin rows, no labels on activities (for lists)
//   dusk      seconds after midnight; shades the evening after civil dusk (optional)
//   selected  index into trips to outline (optional)
//   onSelect  (trip, index) => void; makes trips clickable (optional)
//   width     viewBox width (default 640); the SVG scales to its container
// Mode colors: walk ink, bike green, transit blue, stranded red with hatching. A dark-navy tick under a bar means
// some of that trip's walking or biking is after civil dusk.
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MODE_COLOR = { walk: 'var(--walk)', bike: 'var(--bike)', transit: 'var(--ride)', ride: 'var(--ride)' };
const toSec = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 3600 + (m || 0) * 60; };

export default function WeekStrip({ trips = [], entries = [], days = ALL_DAYS, fromHour = 6, toHour = 25, compact = false, dusk, selected, onSelect, width = 640 }) {
  const labelW = 34, rowH = compact ? 10 : 22, gap = compact ? 2 : 4, top = compact ? 0 : 14;
  const h = top + days.length * (rowH + gap);
  const x0 = fromHour * 3600, x1 = toHour * 3600;
  const X = (s) => labelW + ((Math.min(Math.max(s, x0), x1) - x0) / (x1 - x0)) * (width - labelW - 2);
  const ticks = [];
  for (let hr = Math.ceil(fromHour / 3) * 3; hr <= toHour; hr += 3) ticks.push(hr);
  return (
    <svg className="weekstrip" viewBox={`0 0 ${width} ${h}`} role="img"
      aria-label={`Week of ${trips.length} trips`}>
      <defs>
        <pattern id="qhatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="var(--paper)" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--bad)" strokeWidth="2.2" />
        </pattern>
      </defs>
      {!compact && ticks.map((hr) => (
        <g key={hr}>
          <line x1={X(hr * 3600)} x2={X(hr * 3600)} y1={top - 3} y2={h} stroke="var(--line)" strokeDasharray="1 2" />
          <text x={X(hr * 3600)} y={10} textAnchor="middle">{String(hr % 24).padStart(2, '0')}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const y = top + i * (rowH + gap);
        return (
          <g key={d}>
            <text className="day" x={0} y={y + rowH / 2 + 3.5} style={{ fontSize: compact ? 8 : 10 }}>{d.slice(0, 2)}</text>
            <rect x={labelW} y={y} width={width - labelW - 2} height={rowH} fill="none" stroke="var(--line)" strokeWidth="0.5" />
            {dusk != null && <rect x={X(dusk)} y={y} width={X(x1) - X(dusk)} height={rowH} fill="var(--dark-walk)" opacity="0.07" />}
            {entries.filter((e) => e.days.includes(d)).map((e) => (
              <g key={e.id}>
                <rect x={X(toSec(e.start))} y={y + 1} width={Math.max(1, X(toSec(e.end)) - X(toSec(e.start)))} height={rowH - 2}
                  fill="var(--paper-2)" stroke="var(--muted)" strokeWidth="0.5" />
                {!compact && (X(toSec(e.end)) - X(toSec(e.start)) > 40) && (
                  <text x={X(toSec(e.start)) + 3} y={y + rowH / 2 + 3.5} style={{ fill: 'var(--ink-2)', fontFamily: 'var(--font-body)' }}>
                    {e.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        );
      })}
      {trips.map((t, k) => {
        const i = days.indexOf(t.day);
        if (i < 0 || t.depart == null || t.arrive == null) return null;
        const y = top + i * (rowH + gap);
        const xa = X(t.depart), xb = Math.max(X(t.arrive), xa + 2);
        const fill = t.stranded ? 'url(#qhatch)' : MODE_COLOR[t.mode] || 'var(--ink)';
        const sel = selected === k;
        return (
          <g key={k} onClick={onSelect ? () => onSelect(t, k) : undefined} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            <title>{`${t.label || t.place || ''} ${t.kind === 'leaveAt' ? 'home' : 'trip'}: ${t.mode}${t.stranded ? ', stranded' : ''}, ${Math.round((t.arrive - t.depart) / 60)} min${t.darkMin ? `, ${Math.round(t.darkMin)} min after dusk` : ''}`}</title>
            <rect x={xa} y={y + (compact ? 1 : 4)} width={xb - xa} height={rowH - (compact ? 2 : 8)} fill={fill}
              stroke={t.stranded ? 'var(--bad)' : sel ? 'var(--accent)' : 'none'} strokeWidth={sel ? 2 : 1} />
            {t.darkMin > 0 && <rect x={xa} y={y + rowH - (compact ? 1.5 : 3)} width={xb - xa} height={compact ? 1.5 : 3} fill="var(--dark-walk)" />}
            {onSelect && !compact && <rect x={xa - 3} y={y} width={xb - xa + 6} height={rowH} fill="transparent" />}
          </g>
        );
      })}
    </svg>
  );
}
