// The verdict at the top of Me: the best home for this student's week, why it fits, what to watch out for,
// the runner-up and what would flip it. Every number comes from engine/explain.js (the model.js utility pieces
// at the posterior median values) and from the ranking (decide.meRank). Homes are SYNTHETIC.
// Props: api, homes, homeById, ranked, weekMap, summary, persona, cfg, entries, selected, onSelect(homeId)
import { useEffect, useMemo, useState } from 'react';
import { Panel, Pill, Button } from '../../components/index.js';
import { publishNotes } from './verdict/store.js';
import { money, hm, pct } from './format.js';
import './verdict/verdict.css';

const medians = (summary) => Object.fromEntries(Object.entries(summary).map(([k, s]) => [k, s.median]));
const FAR = Math.log(4); // a flip that needs a value 4x away from the median is not worth saying

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

function scrollToMap() {
  const h = [...document.querySelectorAll('.panel-head h2')].find((x) => x.textContent.trim() === 'Map');
  const sec = h?.closest('section');
  if (!sec) return;
  // leave room for the sticky jump bar above the panel
  const bar = document.querySelector('.jumpbar');
  const off = (bar ? bar.getBoundingClientRect().height : 0) + 12;
  const y = sec.getBoundingClientRect().top + window.scrollY - off;
  // Instant when the viewer asks for reduced motion (and as a fallback), smooth otherwise.
  window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function Item({ r }) {
  const tone = r.dollars >= 0 ? 'good' : 'bad';
  const amt = r.absolute
    ? `costs ${money(Math.abs(r.dollars))}/mo`
    : `${r.dollars >= 0 ? '+' : '-'}${money(Math.abs(r.dollars))}/mo`;
  return (
    <li className={`vd-item ${tone}`}>
      <span className="lbl">{r.label}</span>
      <span className="amt" title={r.absolute ? 'What these trips cost you each month at your median values' : 'Against the middle home, dollars per month at your median values'}>{amt}</span>
      <span className="txt">{r.text}</span>
      {r.trip && (
        <span className="vd-trip"><span className="lead">{r.trip.lead}</span>{r.trip.text}</span>
      )}
    </li>
  );
}

function Waiting({ name, homes, text }) {
  return (
    <Panel title={`Best for ${name}'s week`} kicker="Computing" className="vd" aside={<Pill tone="muted">SAMPLE</Pill>}>
      <p className="vd-wait">{text || `Running ${name}'s week through ${homes.length} homes on the real TheRide and U-M timetables, then across the fall weeks ${name} might have.`} <span className="dots">...</span></p>
    </Panel>
  );
}

export default function Verdict({ api, homes, homeById, ranked, weekMap, summary, persona, cfg, selected, onSelect }) {
  const ex = api.mod('explain');
  const name = persona?.name || 'You';
  const theta = useMemo(() => ranked?.mean || (summary ? medians(summary) : null), [ranked, summary]);
  const notes = useMemo(() => {
    if (!ex?.explainAll || !weekMap || !theta) return null;
    try {
      return ex.explainAll({ homes, weekMap, theta, cfg, places: api.data.placeById, modes: persona?.modes });
    } catch (e) { console.error(e); return null; }
  }, [ex, weekMap, theta, cfg, homes, persona]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { publishNotes(notes); }, [notes]);
  useEffect(() => () => publishNotes(null), []);

  const [viewId, setViewId] = useState(null);
  useEffect(() => { setViewId(null); }, [persona?.id]);

  if (!ex?.explainAll) return <Waiting name={name} homes={homes} text="The plain-words notes need engine/explain.js, which did not load." />;
  if (ranked?.error) return null; // the Ranking panel shows the error
  const rank = ranked?.rank;
  if (!rank?.length || !notes) return <Waiting name={name} homes={homes} />;

  const bestId = rank[0].homeId;
  const id = viewId && notes.has(viewId) ? viewId : bestId;
  const isBest = id === bestId;
  const pos = rank.findIndex((r) => r.homeId === id);
  const row = rank[pos];
  const note = notes.get(id);
  const week = weekMap?.get(id);
  const home = homeById.get(id);
  const nm = (h) => homeById.get(h)?.name || h;
  if (!note || !row) return <Waiting name={name} homes={homes} />;

  // The runner-up (when reading the best home) or the best home (when reading any other).
  const otherId = isBest ? rank[1]?.homeId : bestId;
  const comp = otherId ? (isBest ? ex.compareHomes(notes.ctx, bestId, otherId) : ex.compareHomes(notes.ctx, bestId, id)) : null;
  const lead = comp?.drivers.find((d) => d.dollars > 0);
  const flip = comp?.flip && comp.flip.rel <= FAR ? comp.flip : null;
  const loser = isBest ? otherId : id;

  let compare = null;
  if (comp && otherId) {
    if (comp.gap > 0.5) {
      compare = (
        <>
          <strong>{isBest ? `Runner-up: ${nm(otherId)}` : `Against ${nm(bestId)}`}</strong>, {money(comp.gap)} a month behind at
          your median values{lead ? `, mostly on ${ex.PIECE_LABEL[lead.key]}` : ''}. {isBest ? 'It' : nm(id)} would come first if
          its rent were <strong className="mono">{money(comp.rentToFlip)}</strong> lower{flip ? <>, or if {flip.text}</> : ''}.
        </>
      );
    } else {
      compare = (
        <>
          <strong>{isBest ? `Runner-up: ${nm(otherId)}` : `Against ${nm(bestId)}`}</strong>. On {name}'s most likely week at the
          median values, {nm(loser)} comes out {money(Math.abs(comp.gap))} a month ahead. {nm(bestId)} ranks first because it
          holds up better across the {ranked.nScen} possible fall weeks and the range of values the picks allow.
        </>
      );
    }
  }

  const prior = summary ? Object.values(summary).filter((s) => s.mostlyPrior).length : 0;
  const allIn = -row.meanU;

  return (
    <Panel className="vd"
      title={isBest ? `Best for ${name}'s week: ${home?.name}` : `${home?.name}: number ${pos + 1} of ${rank.length} for ${name}'s week`}
      kicker={isBest ? 'Plain-words verdict' : 'Notes for another home'}
      aside={<Pill tone="muted">SAMPLE</Pill>}>
      <div className="vd-facts">
        <span><b>{money(note.roomLabel && Number.isFinite(note.rent) ? note.rent : row.price)}</b>/mo rent and utilities, {note.roomLabel || row.roomLabel || 'best room'}</span>
        <span title="Rent plus the money value of travel time, darkness and trips with no way that fits, less the room's value; mean over possible weeks and value draws">
          <b>{money(allIn)}</b>/mo all in
        </span>
        <span><b>{hm(week?.weeklyMin)}</b> door to door a week</span>
        <span title={`Share of ${ranked.nScen} possible fall weeks x ${ranked.nDraws} value draws where this home is best`}>
          best in <b>{pct(row.pBest)}</b> of possible weeks
        </span>
      </div>
      <p className="vd-head">{note.headline}</p>
      <div className="vd-cols">
        <div>
          <h3>Why it fits</h3>
          {note.fits.length ? (
            <ul className="vd-list">{note.fits.map((r) => <Item key={r.key} r={r} />)}</ul>
          ) : <p className="vd-empty">Nothing beats the middle home by $3 a month or more.</p>}
        </div>
        <div>
          <h3>Watch out for</h3>
          {note.watch.length ? (
            <ul className="vd-list">{note.watch.map((r) => <Item key={r.key} r={r} />)}</ul>
          ) : <p className="vd-empty">Nothing is worse than the middle home by $3 a month or more.</p>}
        </div>
      </div>
      {compare && <p className="vd-runner">{compare}</p>}
      <div className="vd-bar">
        <label>
          <span className="small muted">Read the notes for</span>
          <select value={id} onChange={(e) => setViewId(e.target.value)} aria-label="Home to read notes for">
            {rank.map((r, i) => <option key={r.homeId} value={r.homeId}>{`${i + 1}. ${nm(r.homeId)}`}</option>)}
          </select>
        </label>
        <Button small variant={selected === id ? 'default' : 'primary'} onClick={() => { onSelect?.(id); scrollToMap(); }}
          title="Select this home on the map and in the trip view">
          Show on map
        </Button>
        {!isBest && <Button small variant="quiet" onClick={() => setViewId(null)}>Back to the best home</Button>}
      </div>
      <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
        Dollars per month against the middle of the {note.n} homes, at {name}'s median values from the picks, on the
        most likely week. Homes and rents are SYNTHETIC; buses and streets are real.
        {prior > 3 ? ' Most values are still close to the starting guesses. Answer a few picks below to make them yours.' : ''}
      </p>
    </Panel>
  );
}
