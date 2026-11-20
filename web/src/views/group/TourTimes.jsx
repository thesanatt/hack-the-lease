// "Tour it together": half-hour tour times when every member can get to the chosen house and back to their
// next class on the real timetables, plus a plain-text draft to the listing contact. Engine: engine/tours.js.
// Only names, weeks and walking limits go to the engine. Caps and rents are never read here.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Pill, Label, Button, Pending, Note, modOf } from './kit.jsx';
import { modalRoutine } from './logic.js';
import { DAY_SHORT, DAY_LONG, clock12, memberLine, dayReason } from './tours/format.js';
import './tours/tours.css';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export default function TourTimes({ api, chosen, members, weeks, cfg, colors }) {
  const tours = modOf(api, 'tours');
  const planner = api?.planner;
  const house = chosen?.home || null;
  const places = api?.data?.places || [];
  const placeName = useMemo(() => {
    const byId = api?.data?.placeById || new Map(places.map((p) => [p.id, p]));
    return (id) => (id === house?.id ? house?.name : byId.get(id)?.label || id);
  }, [api, places, house]);

  // Only id, name and the most likely week (with walking limits) leave this component.
  const people = useMemo(
    () => (members || []).map((m) => ({ id: m.id, name: m.name, routine: modalRoutine(m) })),
    [members],
  );
  const [state, setState] = useState({ status: 'idle', result: null, error: null, houseId: null });

  useEffect(() => {
    if (!tours?.findTourSlots || !planner || !house || !people.length) return undefined;
    let live = true;
    setState((s) => ({ ...s, status: 'running' }));
    // Defer one tick so the split renders first; the search is one timetable scan per free half-hour.
    const id = setTimeout(() => {
      try {
        const result = tours.findTourSlots(planner, { house, members: people, places, cfg });
        if (live) setState({ status: 'done', result, error: null, houseId: house.id });
      } catch (e) {
        if (live) setState({ status: 'error', result: null, error: String(e.message || e), houseId: house.id });
      }
    }, 0);
    return () => { live = false; clearTimeout(id); };
  }, [tours, planner, house, people, places, cfg]);

  const kicker = 'Tour it together';
  if (!tours) return <Panel kicker={kicker} title="Tour times"><Pending what="engine/tours.js" /></Panel>;
  if (!house) return <Panel kicker={kicker} title="Tour times"><p className="qv-muted">Pick a house above first.</p></Panel>;

  const r = state.houseId === house.id ? state.result : null;
  const n = people.length;
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const colorOf = Object.fromEntries((members || []).map((m, i) => [m.id, colors?.[i]]));
  const right = r
    ? <Pill tone={r.slots.length ? 'good' : 'bad'}>{r.feasibleSlots} of {r.checked} weekday half-hours work</Pill>
    : null;

  return (
    <Panel kicker={kicker} title={`When all ${n} can see ${house.name}`} right={right}>
      {state.status === 'error' && state.houseId === house.id && <Note tone="bad">Tour search failed: {state.error}</Note>}
      {!r ? (
        <p className="qv-muted" aria-live="polite">Checking every weekday half-hour from 9:00 am to 7:00 pm against {n} weeks...</p>
      ) : (
        <div className="qt-grid">
          <div className="qt-main">
            {r.slots.length ? (
              <div className="qv-scroll">
                <table className="qv-table qt-table">
                  <thead>
                    <tr><th>Time</th><th>How each person gets there, and where they go next</th><th className="num">Group travel</th></tr>
                  </thead>
                  <tbody>
                    {r.slots.map((s) => (
                      <tr key={`${s.day}-${s.start}`}>
                        <td className="qt-when">
                          <div className="qt-day">{DAY_SHORT[s.day]}</div>
                          <div className="qv-mono">{clock12(s.start)}</div>
                          <div className="qv-mono qv-muted qv-small">to {clock12(s.end)}</div>
                        </td>
                        <td>
                          <ul className="qt-lines">
                            {s.members.map((m) => (
                              <li key={m.id}>
                                <span className="qv-swatch" style={{ background: colorOf[m.id] || 'var(--muted)' }} />
                                <b>{m.name}</b> {memberLine(m, placeName)}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="num">
                          {s.travelMin} min
                          {s.penaltyMin > 0 && <div className="qv-small qv-muted">+{s.penaltyMin} tight</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {r.slots.some((s) => s.sameDay) && (
              <Note tone="warn">
                Only {r.daysWithSlot.map((d) => DAY_LONG[d]).join(' and ')} {r.daysWithSlot.length === 1 ? 'has' : 'have'} a time
                for all {n}, so the other {r.slots.filter((s) => s.sameDay).length === 1 ? 'time is' : 'times are'} on the same day,
                at least {tours.TOUR_DEFAULTS?.gapMin ?? 60} minutes apart.
              </Note>
            )}
            {r.slots.length ? null : (
              <Note tone="bad">No weekday half-hour from 9:00 am to 7:00 pm works for all {n} at {house.name}.</Note>
            )}
            <table className="qv-table qt-days" aria-label="Why each weekday does or does not work">
              <tbody>
                {WEEKDAYS.map((d) => (
                  <tr key={d} className={r.byDay?.[d]?.feasible ? '' : 'dim'}>
                    <td className="qt-day">{DAY_LONG[d]}</td>
                    <td>{dayReason(r.byDay?.[d], names, n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="qv-small qv-muted" style={{ margin: 0 }}>
              From each person's most likely week (entries with a chance of 0.5 or more). A trip starts where they were just
              before the tour; on a day with nothing before it, at their first stop that day, or their usual place on a free day.
              Each trip is the fastest of walking, biking for those who bike, and the TheRide and U-M buses for the modeled week,
              under each person's walking limit. Score: group travel minutes plus {tours.TOUR_DEFAULTS?.tightWeight ?? 2} minutes for every minute a connection has
              under {tours.TOUR_DEFAULTS?.tightMin ?? 10} minutes to spare. Different days come first. Search took {Math.round(r.ms)} ms.
            </p>
          </div>
          <Draft house={house} n={n} slots={r.slots} tours={tours} />
        </div>
      )}
    </Panel>
  );
}

function Draft({ house, n, slots, tours }) {
  const text = useMemo(
    () => (slots.length ? tours.tourMessage({ houseName: house.name, groupSize: n, slots }) : ''),
    [house, n, slots, tours],
  );
  const ref = useRef(null);
  const [status, setStatus] = useState('');
  useEffect(() => { setStatus(''); }, [text]);

  const selectAll = () => {
    const el = ref.current;
    if (!el) return false;
    el.focus();
    el.select();
    try { return document.execCommand('copy'); } catch { return false; }
  };
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('Copied. Paste it into your own email or message.');
        return;
      }
    } catch { /* fall through to the select-text fallback */ }
    setStatus(selectAll() ? 'Copied. Paste it into your own email or message.' : 'Text selected. Press Ctrl+C to copy it.');
  };

  return (
    <div className="qt-draft">
      <div className="qt-draft-head">
        <div className="qv-kicker">Draft to the listing contact</div>
        <Label>SAMPLE contact</Label>
      </div>
      {slots.length ? (
        <>
          <div className="qt-to qv-small"><span className="qv-muted">To:</span> listing contact for {house.name}</div>
          <textarea ref={ref} className="qt-text" readOnly value={text} rows={Math.min(18, text.split('\n').length + 5)}
            aria-label="Draft message to the listing contact" onFocus={(e) => e.target.select()} />
          <div className="qv-row">
            <Button tone="primary" onClick={copy}>Copy message</Button>
            <span className="qv-small" role="status" aria-live="polite">{status}</span>
          </div>
          <p className="qv-small qv-muted" style={{ margin: 0 }}>
            The draft has the group size, the house and the times. It has no names, rents or caps.
          </p>
        </>
      ) : <p className="qv-muted qv-small">No time to propose yet.</p>}
      <Note>Quorum does not send anything. The listing contact is SAMPLE.</Note>
    </div>
  );
}
