// The student's week as a calendar grid: Mon to Sun columns, 7 AM to 1 AM, one block per entry,
// colored by campus area. Late entries carry a navy band; entries switched off show as outlines.
// Props:
//   entries    the week entries MeView edits [{id, label, days, place, start, end, on?, p?}]
//   placeById  Map of places (for the area and the place name)
//   onEdit     open the editor (optional; shows an "Edit" text button and makes blocks clickable)
//   dusk       seconds after midnight (optional); time after it is shaded navy and entries ending after it are late
//   lateHour   'HH:MM' used when dusk is not given (optional, default '21:00')
//   onBlock    (entry) => void (optional; overrides onEdit for block clicks, e.g. the import preview)
//   pxPerHour  row height per hour (optional, default 22)
//   legend     show the area legend (optional, default true)
import { DAYS, DAY_LABEL, clock, toSec } from './routine.js';
import { areaColor, areaTint } from './calendar/areas.js';
import './calendar/parts.css';

const FROM = 7, TO = 25;

const endSec = (e) => {
  const s = toSec(e.start), t = toSec(e.end);
  return t <= s ? t + 24 * 3600 : t;
};

// Lay out one day's blocks: overlapping blocks share the column side by side.
function lanes(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.t - a.t);
  const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const ends = [];
    for (const it of cluster) {
      let k = ends.findIndex((x) => x <= it.s);
      if (k < 0) { k = ends.length; ends.push(0); }
      ends[k] = it.t;
      it.lane = k;
    }
    for (const it of cluster) { it.nLanes = ends.length; out.push(it); }
    cluster = []; clusterEnd = -1;
  };
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it); clusterEnd = Math.max(clusterEnd, it.t);
  }
  if (cluster.length) flush();
  return out;
}

const hourLabel = (h) => clock(h * 3600).replace(':00', '');

export default function WeekCalendar({ entries = [], placeById, onEdit, dusk, lateHour = '21:00', onBlock, pxPerHour = 22, legend = true }) {
  const lateS = dusk != null ? dusk : toSec(lateHour);
  const H = (TO - FROM) * pxPerHour;
  const Y = (s) => ((Math.min(Math.max(s, FROM * 3600), TO * 3600) - FROM * 3600) / 3600) * pxPerHour;
  const click = onBlock || (onEdit ? () => onEdit() : null);

  const areas = [];
  let anyLate = false;
  const byDay = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const e of entries) {
    const place = placeById?.get(e.place);
    const area = place?.area || 'Other';
    const s = toSec(e.start), t = endSec(e);
    const off = e.on === false;
    const late = !off && t > lateS;
    if (late) anyLate = true;
    if (!off && !areas.includes(area)) areas.push(area);
    for (const d of e.days || []) if (byDay[d]) byDay[d].push({ e, s, t, area, place, off, late });
  }

  const hours = [];
  for (let h = FROM; h <= TO; h++) hours.push(h);

  return (
    <div className="mp-cal">
      {(legend || onEdit) && (
        <div className="mp-cal-top">
          {legend && (
            <ul className="mp-legend" aria-label="Colors">
              {areas.map((a) => (
                <li key={a}><span className="sw" style={{ background: areaColor(a) }} />{a === 'Other' ? 'Elsewhere' : a}</li>
              ))}
              {anyLate && <li><span className="sw late" />{dusk != null ? 'After dark' : 'Late'}</li>}
            </ul>
          )}
          {onEdit && <button type="button" className="mp-text-btn" onClick={onEdit}>Edit</button>}
        </div>
      )}
      <div className="mp-cal-grid" style={{ '--cal-h': `${H}px` }}>
        <div className="mp-cal-head" aria-hidden="true">
          <span />
          {DAYS.map((d) => <span key={d}>{DAY_LABEL[d]}</span>)}
        </div>
        <div className="mp-cal-body">
          <div className="mp-cal-hours" aria-hidden="true">
            {hours.filter((h) => (h - FROM) % 3 === 0).map((h) => (
              <span key={h} style={{ top: Y(h * 3600) }}>{hourLabel(h)}</span>
            ))}
          </div>
          {DAYS.map((d) => (
            <div key={d} className="mp-cal-col" role="list" aria-label={DAY_LABEL[d]}>
              {hours.slice(1, -1).map((h) => (
                <span key={h} className={`hl ${(h - FROM) % 3 === 0 ? 'major' : ''}`} style={{ top: Y(h * 3600) }} />
              ))}
              {lateS < TO * 3600 && <span className="night" style={{ top: Y(lateS) }} />}
              {lanes(byDay[d]).map((b) => {
                const top = Y(b.s), h = Math.max(14, Y(b.t) - top);
                const where = b.place ? `${b.place.label}, ${b.area}` : 'no place';
                const label = `${b.e.label}, ${DAY_LABEL[d]} ${clock(b.s)} to ${clock(b.t)}, ${where}${b.off ? ', switched off' : ''}${b.late ? ', late' : ''}`;
                const style = {
                  top, height: h - 2,
                  left: `calc(${(b.lane / b.nLanes) * 100}% + 2px)`,
                  width: `calc(${100 / b.nLanes}% - 4px)`,
                  background: b.off ? 'transparent' : areaTint(b.area),
                  borderLeftColor: b.off ? 'var(--line)' : areaColor(b.area),
                };
                const body = (
                  <>
                    <span className="lbl">{b.e.label}</span>
                    {h >= 36 && <span className="tm">{clock(b.s).replace(':00', '')}</span>}
                    {b.late && <span className="lateband" />}
                  </>
                );
                return click ? (
                  <button key={`${b.e.id}-${d}`} type="button" role="listitem" className={`mp-blk ${b.off ? 'off' : ''}`}
                    style={style} title={label} aria-label={label} onClick={() => click(b.e)}>{body}</button>
                ) : (
                  <div key={`${b.e.id}-${d}`} role="listitem" className={`mp-blk ${b.off ? 'off' : ''}`}
                    style={style} title={label} aria-label={label}>{body}</div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
