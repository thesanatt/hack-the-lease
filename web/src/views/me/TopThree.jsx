// "Your top 3": one card per home with three big numbers, a mini week ribbon and one why sentence.
// Props: api, rank (decide.meRank), notes (Map homeId -> explain Note), weekMap, routineWeek, dusk, selected, onSelect(id)
import { AutoStrip } from '../../components/index.js';
import { money } from './format.js';

// Short labels for the one-line reason on each card.
const SHORT = {
  rent: (g) => (g ? 'Lower rent' : 'Higher rent'),
  time: (g) => (g ? 'Less time getting around' : 'More time getting around'),
  dark: (g) => (g ? 'Less walking after dark' : 'More walking after dark'),
  strand: (g) => (g ? 'A ride for every trip' : 'Trips with no ride'),
  size: (g) => (g ? 'Bigger room' : 'Smaller room'),
  light: (g) => (g ? 'More daylight' : 'Less daylight'),
};
// One reason per card, never the same kind of reason as a card above it.
export function cardReasons(notes, ids) {
  const used = new Set();
  return ids.map((id) => {
    const note = notes?.get(id);
    if (!note) return null;
    const pool = [...(note.fits || []), ...(note.watch || [])].filter((r) => !r.absolute && !r.vs && Number.isFinite(r.dollars));
    const r = pool.find((x) => !used.has(x.key)) || null;
    if (!r) return null;
    used.add(r.key);
    const good = r.dollars >= 0;
    const label = SHORT[r.key] ? SHORT[r.key](good) : r.label;
    return { good, label, amt: `${money(Math.abs(r.dollars))}/mo`, side: good ? 'better' : 'worse', title: r.text };
  });
}

// Nights a week with a trip that has no ride, or walks or bikes after dusk.
export function lateNights(week) {
  if (!week?.trips) return null;
  const days = new Set(week.trips.filter((t) => t.stranded || t.darkMin > 0).map((t) => t.day));
  return days.size;
}
export const hours = (min) => (Number.isFinite(min) ? (min / 60).toFixed(1) : '--');

function Num({ value, unit, label, title }) {
  return (
    <div className="t3-num" title={title}>
      <span className="v">{value}<span className="u">{unit}</span></span>
      <span className="l">{label}</span>
    </div>
  );
}

function Card({ api, i, row, note, reason, week, routineWeek, dusk, sel, onSelect }) {
  const home = api.data.homeById.get(row.homeId);
  const n = lateNights(week);
  const rent = row.price ?? note?.rent;
  return (
    <article className={`t3-card${i === 0 ? ' first' : ''}${sel ? ' sel' : ''}`} onClick={() => onSelect?.(row.homeId)}>
      <div className="t3-head">
        <span className="t3-rank" aria-hidden="true">{i + 1}</span>
        <h3 className="t3-name">
          <button type="button" aria-pressed={sel} title="Show this home's week on the map"
            onClick={(e) => { e.stopPropagation(); onSelect?.(row.homeId); }}>{home?.name}</button>
        </h3>
      </div>
      <div className="t3-sub">
        <span className="t3-room">{row.roomLabel || note?.roomLabel || ''}{rent != null ? `, ${money(rent)}/mo with utilities` : ''}</span>
        <span className="t3-sample">Sample listing</span>
      </div>
      <div className="t3-body">
        <div className="t3-nums">
          <Num value={money(-row.meanU)} unit="/mo" label="cost to you"
            title="Cost to you: rent and utilities plus what travel time, darkness and trips with no ride cost you, less what the room is worth to you. Averaged over the weeks you might have." />
          <Num value={hours(week?.weeklyMin)} unit="h/wk" label="getting around" title="Door to door, your most likely week" />
          <Num value={n ?? '--'} unit="/wk" label="late nights"
            title="Nights a week with a trip that has no ride, or walking or biking after dusk" />
        </div>
        <div className="t3-ribbon">
          {week && <AutoStrip compact trips={week.trips} entries={routineWeek} dusk={dusk} />}
        </div>
      </div>
      {reason && (
        <p className="t3-why" title={reason.title}>
          <span>{reason.label}:</span> <b className={reason.good ? 'good' : 'bad'}>{reason.amt}</b>
          <span className="t3-vs"> {reason.side} than a typical home</span>
        </p>
      )}
    </article>
  );
}

export default function TopThree({ api, rank, notes, weekMap, routineWeek, dusk, selected, onSelect }) {
  if (!rank?.length) {
    return (
      <div className="t3" aria-busy="true">
        {[0, 1, 2].map((i) => <div key={i} className={`t3-card ghost${i === 0 ? ' first' : ''}`} />)}
        <p className="t3-wait" role="status">Ranking every home for your week</p>
      </div>
    );
  }
  const top = rank.slice(0, 3);
  const reasons = cardReasons(notes, top.map((r) => r.homeId));
  return (
    <div className="t3">
      {top.map((row, i) => (
        <Card key={row.homeId} api={api} i={i} row={row} note={notes?.get(row.homeId)} reason={reasons[i]} week={weekMap?.get(row.homeId)}
          routineWeek={routineWeek} dusk={dusk} sel={selected === row.homeId} onSelect={onSelect} />
      ))}
    </div>
  );
}
