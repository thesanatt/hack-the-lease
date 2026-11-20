// Candidate homes with this week's travel: price, hours, minutes after dark, trips with no ride, and the week ribbon.
// Click a column head to sort; click a row to select the home.
// Props: homes, weekMap (Map homeId -> WeekResult), routineWeek (resolved entries), selected, onSelect(id),
//        sortKey 'genMin' | 'weeklyMin' | 'price' | 'dark', setSortKey, cfg, label (data label, unused)
import { WeekStrip } from '../../components/index.js';
import { money } from './format.js';
import './calendar/parts.css';

export const darkOf = (w, cfg) => (w ? w.darkWalkMin + cfg.darkBikeFactor * (w.darkBikeMin || 0) + (w.darkLongWaitMin || 0) : 0);
export const priceFrom = (h) => Math.min(...h.rooms.map((r) => (r.asking ?? h.rent / h.rooms.length) + (h.utilities || 0) / h.rooms.length));

const COLS = [
  { key: 'price', label: 'From', title: 'Cheapest room: asking rent plus an equal share of utilities, a month' },
  { key: 'weeklyMin', label: 'Hours a week', title: 'Door to door, every trip in the most likely week' },
  { key: 'dark', label: 'Min after dark', title: 'Walking or biking minutes after civil dusk a week, lease average' },
  { key: 'stranded', label: 'No ride', title: 'Trips a week with no allowed way there or home' },
];

export default function HomeList({ homes, weekMap, routineWeek, selected, onSelect, sortKey, setSortKey, cfg }) {
  const rows = homes.map((h) => ({ h, w: weekMap?.get(h.id) }));
  const key = {
    genMin: (r) => r.w?.genMin ?? Infinity,
    weeklyMin: (r) => r.w?.weeklyMin ?? Infinity,
    price: (r) => priceFrom(r.h),
    dark: (r) => darkOf(r.w, cfg),
    stranded: (r) => r.w?.stranded?.length ?? Infinity,
  }[sortKey] || (() => 0);
  rows.sort((a, b) => key(a) - key(b));
  return (
    <div className="mp-homes-wrap">
      <table className="mp-homes">
        <thead>
          <tr>
            <th scope="col">Home</th>
            {COLS.map((c) => (
              <th key={c.key} scope="col" title={c.title} aria-sort={sortKey === c.key ? 'ascending' : 'none'}>
                <button type="button" aria-pressed={sortKey === c.key} onClick={() => setSortKey(c.key)}>{c.label}</button>
              </th>
            ))}
            <th scope="col">Week</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ h, w }) => (
            <tr key={h.id} className={h.id === selected ? 'sel' : ''} onClick={() => onSelect(h.id)}
              tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(h.id); } }}
              aria-selected={h.id === selected}>
              <td><span className="nm">{h.name}</span><div className="mp-gray">{h.area}</div></td>
              <td>{money(priceFrom(h))}</td>
              <td>{w ? (w.weeklyMin / 60).toFixed(1) : '--'}</td>
              <td>{w ? Math.round(darkOf(w, cfg)) : '--'}</td>
              <td className={w?.stranded?.length ? 'bad' : ''}>{w ? w.stranded.length : '--'}</td>
              <td>{w && <WeekStrip compact width={360} trips={w.trips} entries={routineWeek} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
