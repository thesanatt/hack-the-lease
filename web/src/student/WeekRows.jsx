// "Your week" on My profile. Each row is something the student wrote. A row without days or times says
// "Needs a time" and opens a small editor; only complete rows are routed. Nothing is filled in for them.
import { useState } from 'react';
import { Button } from '../components/index.js';
import { dayList } from '../../../engine/profile.js';
import { clock, toSec } from '../views/me/routine.js';

const DAYS = [['mon', 'M'], ['tue', 'T'], ['wed', 'W'], ['thu', 'Th'], ['fri', 'F'], ['sat', 'Sa'], ['sun', 'Su']];

function Editor({ e, places, onSave, onCancel }) {
  const [days, setDays] = useState(e.days || []);
  const [start, setStart] = useState(e.start || '');
  const [end, setEnd] = useState(e.end || '');
  const [place, setPlace] = useState(e.place || '');
  const ok = days.length && start && end && start < end;
  const flip = (d) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  return (
    <div className="pf-edit" onClick={(ev) => ev.stopPropagation()}>
      <div className="pf-edit-days" role="group" aria-label="Days">
        {DAYS.map(([d, l]) => <button key={d} type="button" className="pf-day" aria-pressed={days.includes(d)} onClick={() => flip(d)}>{l}</button>)}
      </div>
      <label className="pf-edit-t">From <input type="time" value={start} onChange={(ev) => setStart(ev.target.value)} /></label>
      <label className="pf-edit-t">to <input type="time" value={end} onChange={(ev) => setEnd(ev.target.value)} /></label>
      <select className="st-select" value={place} onChange={(ev) => setPlace(ev.target.value)} aria-label="Building">
        <option value="">No building (just block the time)</option>
        {places.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <Button variant="primary" small disabled={!ok} onClick={() => onSave({ days, start, end, place: place || null })}>Save</Button>
      <Button small onClick={onCancel}>Cancel</Button>
      {start && end && start >= end && <span className="pf-msg bad">End must be after start.</span>}
    </div>
  );
}

function when(e) {
  if (e.start && e.end) return `${clock(toSec(e.start))} to ${clock(toSec(e.end))}`;
  if (e.end) return `until ${clock(toSec(e.end))}`;
  if (e.start) return `from ${clock(toSec(e.start))}`;
  return 'Time?';
}

export default function WeekRows({ P, places, placeById }) {
  const p = P.profile;
  const [open, setOpen] = useState(null);
  const rows = p.allEntries;
  const waiting = p.waiting.length;
  return (
    <div className="st-card pf-sec">
      <h2>Your week <span className="st-sub">{p.scheduled.length} on your calendar{waiting ? `, ${waiting} need${waiting > 1 ? '' : 's'} a time` : ''}</span></h2>
      {rows.length ? (
        <div className="pf-rows">
          {rows.map((e) => {
            const off = p.off.has(e.id);
            const pl = placeById.get(e.place);
            const editing = open === e.id;
            const tag = e.source === 'program' ? <span className="st-pill typ">Typical (sample)</span>
              : !e.timed ? <span className="st-pill warn">Needs a time</span>
                : !e.place ? <span className="st-pill typ" title="On your calendar and blocks tour times. Add a building to count its trips.">Time only</span>
                : e.edited ? <span className="st-pill mine">Edited</span> : <span className="st-pill mine">Yours</span>;
            return (
              <div key={e.id} className={`pf-row-wrap${off ? ' off' : ''}`}>
                <div className="pf-row" title={e.why ? `From: "${e.why}"` : undefined}>
                  <span className="pf-days">{e.days?.length ? dayList(e.days) : 'Days?'}</span>
                  <span className="pf-time">{when(e)}</span>
                  <span className="pf-what">{e.label}<span className="pl">{pl ? `${pl.label}${e.placeGuessed ? ', building guessed' : ''}` : 'Where? Add a building to count its trips'}</span></span>
                  {tag}
                  <span className="pf-acts">
                    {!off && <button type="button" className="pf-x" onClick={() => setOpen(editing ? null : e.id)}>{!e.timed ? 'Add time' : !e.place ? 'Add building' : 'Edit'}</button>}
                    <button type="button" className="pf-x" onClick={() => P.toggleEntry(e.id)}>{off ? 'Add back' : 'Remove'}</button>
                  </span>
                </div>
                {editing && <Editor e={e} places={places} onCancel={() => setOpen(null)}
                  onSave={(v) => { P.fixEntry(e.id, v); setOpen(null); }} />}
              </div>
            );
          })}
        </div>
      ) : <p className="st-sub">Nothing with a place yet. Write where you go and when, like "EECS 280 MW 10:30-12" or "study at the UgLi Tue Thu 7-11pm", or attach your schedule.</p>}
      {waiting > 0 && <p className="st-sub" style={{ marginTop: 10 }}>Rows that need a time are not used yet. Quorum does not guess when you are somewhere.</p>}
      {p.unplaced.length > 0 && <p className="st-sub" style={{ marginTop: 8 }}>Could not place: {p.unplaced.join(', ')}. Add the building name to use them.</p>}
      {p.typical?.length > 0 && (
        <div className="pf-typ">
          {p.useTypical ? (
            <>
              <span className="st-sub">Using a typical {p.program.label.toLowerCase()} week (sample) until you add your classes.</span>
              <button type="button" className="pf-x" onClick={() => P.edit({ useTypical: false })}>Stop using it</button>
            </>
          ) : (
            <>
              <span className="st-sub">No classes with times yet. You can rank with a typical {p.program.label.toLowerCase()} week (sample) for now.</span>
              <Button small onClick={() => P.edit({ useTypical: true })}>Use a typical week</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
