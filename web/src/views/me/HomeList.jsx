// Candidate homes with this week's travel, one timetable strip each.
// Props: homes, weekMap (Map homeId -> WeekResult), routineWeek (resolved entries), selected, onSelect(id),
//        sortKey 'genMin' | 'price' | 'dark', setSortKey, cfg, label (data label)
import { WeekStrip, Seg } from '../../components/index.js';
import { hm, money } from './format.js';

export const darkOf = (w, cfg) => (w ? w.darkWalkMin + cfg.darkBikeFactor * (w.darkBikeMin || 0) + (w.darkLongWaitMin || 0) : 0);
export const priceFrom = (h) => Math.min(...h.rooms.map((r) => (r.asking ?? h.rent / h.rooms.length) + (h.utilities || 0) / h.rooms.length));

export default function HomeList({ homes, weekMap, routineWeek, selected, onSelect, sortKey, setSortKey, cfg }) {
  const rows = homes.map((h) => ({ h, w: weekMap?.get(h.id) }));
  const key = {
    genMin: (r) => r.w?.genMin ?? Infinity,
    weeklyMin: (r) => r.w?.weeklyMin ?? Infinity,
    price: (r) => priceFrom(r.h),
    dark: (r) => darkOf(r.w, cfg),
  }[sortKey] || ((r) => 0);
  rows.sort((a, b) => key(a) - key(b));
  return (
    <div>
      <div className="row-flex" style={{ marginBottom: 6 }}>
        <span className="small muted">Sort by</span>
        <Seg value={sortKey} onChange={setSortKey} label="Sort homes" options={[
          { value: 'genMin', label: 'Weighted time', title: 'Walking and waiting minutes count more than riding (Wardman et al. 2016)' },
          { value: 'weeklyMin', label: 'Door to door' },
          { value: 'price', label: 'Rent' },
          { value: 'dark', label: 'After dark' },
        ]} />
        <span className="small muted">Most likely week. Click a home for its trips.</span>
      </div>
      <div className="scrolly">
        <table className="tt">
          <thead>
            <tr>
              <th>Home</th>
              <th className="num" title="Cheapest room: asking rent plus an equal share of utilities">From /mo</th>
              <th className="num" title="Door to door time per week">Door to door /wk</th>
              <th className="num" title="Generalized minutes: walking x1.45, waiting x1.5">Weighted /wk</th>
              <th className="num" title="Walking or biking minutes outside civil daylight, averaged over the lease dates">After dark /wk</th>
              <th className="num" title="Trips per week with no allowed way home or there">No ride /wk</th>
              <th style={{ width: '30%' }}>Week, Mon to Sun, 6 AM to 1 AM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ h, w }) => (
              <tr key={h.id} className={`click ${h.id === selected ? 'sel' : ''}`} onClick={() => onSelect(h.id)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{h.name}</div>
                  <div className="small muted">{h.area}, {h.kind}, {h.rooms.length} rooms</div>
                </td>
                <td className="num">{money(priceFrom(h))}</td>
                <td className="num">{w ? hm(w.weeklyMin) : '--'}</td>
                <td className="num">{w ? hm(w.genMin) : '--'}</td>
                <td className="num">{w ? `${Math.round(darkOf(w, cfg))} min` : '--'}</td>
                <td className="num" style={{ color: w?.stranded?.length ? 'var(--bad)' : undefined, fontWeight: w?.stranded?.length ? 600 : 400 }}>
                  {w ? w.stranded.length : '--'}
                </td>
                <td>{w && <WeekStrip compact width={360} trips={w.trips} entries={routineWeek} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="scroll-hint">{rows.length} homes. Scroll the list for the rest. Homes and rents are SYNTHETIC.</p>
    </div>
  );
}
