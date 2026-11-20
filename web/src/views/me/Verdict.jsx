// Plain-words notes for each home, from engine/explain.js (the model.js utility pieces at the posterior median
// values) and the ranking (decide.meRank). Homes are sample listings.
// useNotes(args) -> Map homeId -> Note (or null); also publishes the notes for the Ranking table.
// Verdict (default): "Why" and "Watch out" for one home, plus the line on what would flip it. Lives in Details.
// Props: api, ranked, notes, homeId, homeById, persona
import { useEffect, useMemo } from 'react';
import { publishNotes } from './verdict/store.js';
import { money } from './format.js';
import './verdict/verdict.css';

const medians = (summary) => Object.fromEntries(Object.entries(summary).map(([k, s]) => [k, s.median]));
const FAR = Math.log(4); // a flip that needs a value 4x away from the median is not worth saying

export function useNotes({ api, homes, weekMap, ranked, summary, cfg, persona }) {
  const ex = api.mod('explain');
  const theta = useMemo(() => ranked?.mean || (summary ? medians(summary) : null), [ranked, summary]);
  const notes = useMemo(() => {
    if (!ex?.explainAll || !weekMap || !theta) return null;
    try {
      return ex.explainAll({ homes, weekMap, theta, cfg, places: api.data.placeById, modes: persona?.modes });
    } catch (e) { console.error(e); return null; }
  }, [ex, weekMap, theta, cfg, homes, persona]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { publishNotes(notes); }, [notes]);
  useEffect(() => () => publishNotes(null), []);
  return notes;
}

// One sentence from the note's biggest plus or minus against the middle home.
export function whySentence(note) {
  const w = note?.why;
  if (!w) return 'Close to the middle home on every count.';
  const amt = money(Math.abs(w.dollars));
  return `${w.label}: ${amt} a month ${w.dollars >= 0 ? 'better' : 'worse'} than the middle home.`;
}

function Item({ r }) {
  const good = r.dollars >= 0;
  const amt = r.absolute ? `${money(Math.abs(r.dollars))}/mo` : `${good ? '+' : '-'}${money(Math.abs(r.dollars))}/mo`;
  return (
    <li className={`vd-item ${good ? 'good' : 'bad'}`} title={r.trip ? `${r.trip.lead} ${r.trip.text}` : undefined}>
      <span className="lbl">{r.label}</span>
      <span className="amt">{amt}</span>
      <span className="txt">{r.text}</span>
    </li>
  );
}

export default function Verdict({ api, ranked, notes, homeId, homeById, persona }) {
  const ex = api.mod('explain');
  const rank = ranked?.rank;
  if (!ex?.compareHomes || !rank?.length || !notes) return null;
  const bestId = rank[0].homeId;
  const id = notes.has(homeId) ? homeId : bestId;
  const isBest = id === bestId;
  const note = notes.get(id);
  if (!note) return null;
  const nm = (h) => homeById.get(h)?.name || h;
  const otherId = isBest ? rank[1]?.homeId : bestId;
  const comp = otherId ? ex.compareHomes(notes.ctx, bestId, isBest ? otherId : id) : null;
  const flip = comp?.flip && comp.flip.rel <= FAR ? comp.flip : null;

  let compare = null;
  if (comp && otherId) {
    const who = isBest ? nm(otherId) : nm(id);
    compare = comp.gap > 0.5
      ? <>{who} comes first if its rent drops {money(comp.rentToFlip)}{flip ? <>, or if {flip.text}</> : ''}.</>
      : <>{nm(bestId)} ranks first because it holds up better across the {ranked.nScen} possible weeks.</>;
  }

  return (
    <div className="vd">
      <h3 className="vd-title">{nm(id)}{isBest ? '' : `, number ${rank.findIndex((r) => r.homeId === id) + 1}`}</h3>
      <div className="vd-cols">
        <div>
          <h4>Why</h4>
          {note.fits.length ? <ul className="vd-list">{note.fits.map((r) => <Item key={r.key} r={r} />)}</ul>
            : <p className="vd-empty">Nothing beats the middle home by $3 a month.</p>}
        </div>
        <div>
          <h4>Watch out</h4>
          {note.watch.length ? <ul className="vd-list">{note.watch.map((r) => <Item key={r.key} r={r} />)}</ul>
            : <p className="vd-empty">Nothing is worse than the middle home by $3 a month.</p>}
        </div>
      </div>
      {compare && <p className="vd-runner">{compare}</p>}
      <p className="vd-foot">Dollars a month against the middle of {note.n} homes, at {persona?.name || 'your'}{persona?.name ? "'s" : ''} median values.</p>
    </div>
  );
}
