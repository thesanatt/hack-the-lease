// My calendar: the student's week as a Mon to Sun grid. Blocks are their own entries (classes, work, study),
// booked tours (green), and, while picking a tour time, every open 30 minute slot (dashed, clickable; the three
// best are numbered). Props:
//   entries  [{ id, label, days, start, end, place, source }]   tours  [{ id, day, start, end, label }]
//   options  [{ key, day, start, end, rank? }] open tour slots    chosen  key of the chosen option
//   onPick(option)   placeById  Map
import { clock, toSec } from '../views/me/routine.js';

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const PX = 34; // per hour

const kindOf = (e, placeById) => {
  if (/job|shift|barista|assistant|tutor|work/i.test(e.label)) return 'work';
  if (/study|library|homework/i.test(e.label) || placeById.get(e.place)?.kind === 'study') return 'study';
  if (/gym|rec|soccer|practice|groceries/i.test(e.label)) return 'other';
  return 'class';
};
const hour = (hm) => toSec(hm) / 3600;

export default function Calendar({ entries = [], tours = [], options = [], chosen = null, onPick, placeById }) {
  const all = [...entries.flatMap((e) => e.days.map((d) => ({ d, s: hour(e.start), t: hour(e.end) }))),
    ...tours.map((x) => ({ d: x.day, s: hour(x.start), t: hour(x.end) })), ...options.map((x) => ({ d: x.day, s: hour(x.start), t: hour(x.end) }))];
  const from = Math.max(6, Math.min(8, ...all.map((x) => Math.floor(x.s))));
  const to = Math.min(24, Math.max(19, ...all.map((x) => Math.ceil(x.t))));
  const H = (to - from) * PX;
  const showWeekend = all.some((x) => x.d === 'sat' || x.d === 'sun');
  const days = showWeekend ? DAYS : DAYS.slice(0, 5);
  const y = (h) => (h - from) * PX;
  const block = (s, t) => ({ top: y(s), height: Math.max(14, (t - s) * PX - 2) });

  return (
    <div className="cal" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
      <div />
      {days.map(([, l]) => <div key={l} className="cal-head">{l}</div>)}
      <div className="cal-hours" style={{ height: H }}>
        {Array.from({ length: to - from }, (_, i) => (
          <span key={i} style={{ top: i * PX }}>{clock((from + i) * 3600).replace(':00', '')}</span>
        ))}
      </div>
      {days.map(([d]) => (
        <div key={d} className="cal-col" style={{ height: H, backgroundSize: `100% ${PX}px` }}>
          {entries.filter((e) => e.days.includes(d)).map((e) => (
            <div key={e.id} className={`cal-b k-${kindOf(e, placeById)}`} style={block(hour(e.start), hour(e.end))}
              title={`${e.label}, ${clock(toSec(e.start))} to ${clock(toSec(e.end))}, ${placeById.get(e.place)?.label || ''}`}>
              <b>{e.label}</b><span>{clock(toSec(e.start))}</span>
            </div>
          ))}
          {tours.filter((x) => x.day === d).map((x) => (
            <div key={x.id} className="cal-b k-tour" style={block(hour(x.start), hour(x.end))} title={x.label}>
              <b>{x.label}</b><span>{clock(toSec(x.start))}</span>
            </div>
          ))}
          {options.filter((x) => x.day === d).map((x) => (
            <button key={x.key} type="button" className={`cal-opt${x.rank ? ' top' : ''}${chosen === x.key ? ' on' : ''}`}
              style={block(hour(x.start), hour(x.end))} onClick={() => onPick?.(x)}
              title={`Tour ${clock(toSec(x.start))} to ${clock(toSec(x.end))}`} aria-label={`Tour on ${d} at ${clock(toSec(x.start))}`}>
              {x.rank ? <i>{x.rank}</i> : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
