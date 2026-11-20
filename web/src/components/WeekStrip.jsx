// WeekStrip: a week drawn like a transit ribbon. Each day is a thin row, time runs left to right.
// Your plans are light blocks. Each trip is a dashed ink line (walking and waiting) with the bus rides on top as
// bars in their real GTFS route color. Biking is a solid ink line. The evening after civil dusk is a navy band.
// Props (unchanged):
//   trips     WeekResult.trips from week.js: [{day, mode, depart, arrive, darkMin, stranded, label, place, kind, rides?}]
//   entries   resolved routine entries [{id, label, days, start:'HH:MM', end:'HH:MM'}] (optional)
//   days      day ids to show (default mon..sun)
//   fromHour, toHour  axis range (default 6 to 25, i.e. 1 AM)
//   compact   bool: the mini ribbon for cards and lists (thin rows, no labels)
//   dusk      seconds after midnight; draws the navy band from dusk to the end of the axis (optional)
//   selected  index into trips to ring (optional)
//   onSelect  (trip, index) => void; makes trips clickable (optional)
//   width     viewBox width (default 640); the SVG scales to its container
// New optional props:
//   legend    bool, draws the key under the ribbon (default: on when not compact)
//   tint      hex for plan blocks, e.g. a group member's color (optional; default a warm gray)
// Without `dusk`, a trip with minutes after dark gets a navy band behind it instead.

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const toSec = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 3600 + (m || 0) * 60; };
const hex = (c) => (!c ? null : c[0] === '#' ? c : `#${c}`);
const hourLabel = (hr) => { const h = hr % 24; return h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`; };
const clock = (s) => {
  if (s == null) return '';
  const m = Math.round(s / 60), h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const MODE_WORD = { walk: 'walk', bike: 'bike', transit: 'bus', ride: 'bus' };

export default function WeekStrip({
  trips = [], entries = [], days = ALL_DAYS, fromHour = 6, toHour = 25, compact = false, dusk, selected, onSelect,
  width = 640, legend, tint,
}) {
  const showLegend = legend ?? !compact;
  // Day letters only when the mini ribbon is wide enough to read them.
  const dayLetters = !compact || width >= 360;
  const labelW = compact ? (dayLetters ? 14 : 2) : 40;
  const rowH = compact ? 8 : 20;
  const gap = compact ? 2.5 : 8;
  const top = compact ? 1 : 20;
  const bodyH = top + days.length * (rowH + gap) - gap;
  const legendH = showLegend ? 30 : 0;
  const h = bodyH + legendH + (compact ? 1 : 2);
  const x0 = fromHour * 3600, x1 = toHour * 3600;
  const plotW = width - labelW - 2;
  const X = (s) => labelW + ((Math.min(Math.max(s, x0), x1) - x0) / (x1 - x0)) * plotW;
  const ticks = [];
  for (let hr = Math.ceil(fromHour / 3) * 3; hr <= toHour; hr += 3) ticks.push(hr);
  const rideH = compact ? 8 : 10;
  const lineW = compact ? 1.25 : 1.5;
  // Mini ribbons draw plans as a very light tint so the trips carry the picture.
  const blockFill = tint || 'var(--paper-2)';
  const blockOpacity = tint ? (compact ? 0.16 : 0.22) : compact ? 0.7 : 1;
  const routeColors = showLegend
    ? [...new Set(trips.flatMap((t) => (t.rides || []).map((r) => hex(r.color)).filter(Boolean)))].slice(0, 3)
    : [];
  const nDark = trips.filter((t) => t.darkMin > 0.5).length;
  const nStranded = trips.filter((t) => t.stranded).length;
  const aria = `Week ribbon: ${trips.length} trips${nDark ? `, ${nDark} with time outside after dark` : ''}${nStranded ? `, ${nStranded} with no allowed way` : ''}.`;

  return (
    <svg className={`weekstrip${compact ? ' mini' : ''}`} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={aria}>
      {/* the navy band: time after civil dusk, across every day */}
      {dusk != null && X(dusk) < X(x1) && (
        <g>
          <rect x={X(dusk)} y={top - (compact ? 1 : 4)} width={X(x1) - X(dusk)} height={bodyH - top + (compact ? 2 : 8)}
            fill="var(--night-band)" rx={compact ? 1 : 3} />
          {!compact && <text className="ws-dark" x={X(x1) - 4} y={11} textAnchor="end">after dark</text>}
        </g>
      )}

      {!compact && ticks.map((hr) => (
        <g key={hr}>
          <line x1={X(hr * 3600)} x2={X(hr * 3600)} y1={top - 4} y2={bodyH + 4} stroke="var(--line)" strokeWidth="1" />
          {!(dusk != null && Math.abs(X(hr * 3600) - (X(x1) - 30)) < 24) && (
            <text className="ws-tick" x={X(hr * 3600)} y={11} textAnchor="middle">{hourLabel(hr)}</text>
          )}
        </g>
      ))}

      {days.map((d, i) => {
        const y = top + i * (rowH + gap);
        const mid = y + rowH / 2;
        return (
          <g key={d}>
            {!compact
              ? <text className="ws-day" x={0} y={mid + 4.5}>{DAY_LABEL[d] || d}</text>
              : dayLetters && <text className="ws-day-mini" x={0} y={mid + 2.6}>{(DAY_LABEL[d] || d).slice(0, 1)}</text>}
            <line x1={labelW} x2={labelW + plotW} y1={mid} y2={mid} stroke="var(--line)" strokeWidth={compact ? 0.5 : 1} />
            {entries.filter((e) => e.days?.includes(d)).map((e) => {
              const xa = X(toSec(e.start)), xb = X(toSec(e.end));
              const w = Math.max(1, xb - xa);
              return (
                <g key={e.id}>
                  <rect x={xa} y={y} width={w} height={rowH} rx={compact ? 1 : 3}
                    fill={blockFill} opacity={blockOpacity} stroke={tint ? 'none' : 'var(--line-2)'} strokeWidth={compact ? 0 : 0.75} />
                  {!compact && w > 54 && (
                    <text className="ws-entry" x={xa + 5} y={mid + 4}>
                      {e.label.length > Math.floor(w / 6.4) ? `${e.label.slice(0, Math.max(3, Math.floor(w / 6.4) - 1))}.` : e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {trips.map((t, k) => {
        const i = days.indexOf(t.day);
        if (i < 0 || t.depart == null || t.arrive == null) return null;
        const y = top + i * (rowH + gap);
        const mid = y + rowH / 2;
        const xa = X(t.depart), xb = Math.max(X(t.arrive), xa + (compact ? 4 : 3));
        const sel = selected === k;
        const rides = Array.isArray(t.rides) ? t.rides.filter((r) => r.dep != null && r.arr != null) : [];
        const dark = dusk == null && t.darkMin > 0.5;
        const tip = `${DAY_LABEL[t.day] || t.day} ${clock(t.depart)}: ${t.kind === 'leaveAt' ? 'home from ' : 'to '}${t.label || t.place || 'a plan'}, `
          + `${t.stranded ? 'no allowed way' : MODE_WORD[t.mode] || t.mode}${t.routes?.length ? ` ${t.routes.join(' then ')}` : ''}, `
          + `${Math.round((t.arrive - t.depart) / 60)} min${t.darkMin > 0.5 ? `, ${Math.round(t.darkMin)} min outside after dark` : ''}`;
        return (
          <g key={k} className={onSelect ? 'ws-trip click' : 'ws-trip'} onClick={onSelect ? () => onSelect(t, k) : undefined}>
            <title>{tip}</title>
            {dark && (
              <rect x={xa - 2} y={mid - rideH / 2 - 3} width={xb - xa + 4} height={rideH + 6} rx={2} fill="var(--night)" opacity="0.85" />
            )}
            {sel && (
              <rect x={xa - 4} y={y - 3} width={xb - xa + 8} height={rowH + 6} rx={4} fill="none" stroke="var(--accent)" strokeWidth="2" />
            )}
            {t.mode === 'bike' ? (
              <line x1={xa} x2={xb} y1={mid} y2={mid} stroke={dark ? '#fff' : 'var(--bike)'} strokeWidth={compact ? 2 : 3} strokeLinecap="round" />
            ) : (
              compact
                ? <line x1={xa} x2={xb} y1={mid} y2={mid} stroke={t.stranded ? 'var(--bad)' : dark ? '#fff' : 'var(--walk)'}
                    strokeOpacity={t.stranded || dark ? 1 : 0.5} strokeWidth={t.stranded ? 4 : 2} />
                : <line x1={xa} x2={xb} y1={mid} y2={mid} stroke={t.stranded ? 'var(--bad)' : dark ? '#fff' : 'var(--walk)'}
                    strokeWidth={t.stranded ? lineW + 0.5 : lineW} strokeDasharray="3 2.5" />
            )}
            {(t.mode === 'transit' || t.mode === 'ride') && (rides.length ? rides.map((r, j) => {
              const ra = X(r.dep), rb = Math.max(X(r.arr), ra + (compact ? 3 : 1.5));
              return <rect key={j} x={ra} y={mid - rideH / 2} width={rb - ra} height={rideH} rx={compact ? 1 : 2}
                fill={hex(r.color) || 'var(--ride)'} stroke={dark ? '#fff' : 'none'} strokeWidth={dark ? 0.75 : 0} />;
            }) : (
              <rect x={xa} y={mid - rideH / 2} width={xb - xa} height={rideH} rx={compact ? 1 : 2} fill="var(--ride)" />
            ))}
            {t.stranded && !compact && (
              <g stroke="var(--bad)" strokeWidth="1.75" strokeLinecap="round">
                <line x1={xb + 3} x2={xb + 9} y1={mid - 3} y2={mid + 3} />
                <line x1={xb + 3} x2={xb + 9} y1={mid + 3} y2={mid - 3} />
              </g>
            )}
            {onSelect && <rect x={xa - 4} y={y - 3} width={xb - xa + 8} height={rowH + 6} fill="transparent" />}
          </g>
        );
      })}

      {showLegend && (
        <g className="ws-legend" transform={`translate(${labelW}, ${bodyH + 20})`}>
          {(routeColors.length ? routeColors : ['var(--ride)']).map((c, j, a) => (
            <rect key={c} x={(18 / a.length) * j} y={-7} width={18 / a.length} height={8} fill={c} />
          ))}
          <text x={24} y={0}>bus, in route color</text>
          <line x1={140} x2={162} y1={-3} y2={-3} stroke="var(--walk)" strokeWidth="1.5" strokeDasharray="3 2.5" />
          <text x={168} y={0}>walk or wait</text>
          <line x1={262} x2={284} y1={-3} y2={-3} stroke="var(--bike)" strokeWidth="3" strokeLinecap="round" />
          <text x={290} y={0}>bike</text>
          <rect x={334} y={-9} width={22} height={12} rx={2} fill={blockFill} opacity={blockOpacity} stroke={tint ? 'none' : 'var(--line-2)'} strokeWidth="0.75" />
          <text x={362} y={0}>your plans</text>
          <rect x={436} y={-9} width={22} height={12} rx={2} fill={dusk != null ? "var(--night-band)" : "var(--night)"} opacity={dusk != null ? 1 : 0.85} />
          <text x={464} y={0}>after dark</text>
        </g>
      )}
    </svg>
  );
}
