// The detailed editor for the week (shown on Edit): toggle an entry, change its place or times, add a job.
// The ranking samples fall weeks from each entry's chance.
// Props: entries, setEntries, places, placeById, lateId (id of the late entry, marked), movedId (entry moved by the toggle)
import { Button, Pill } from '../../components/index.js';
import { DAYS, DAY_LABEL, newJob } from './routine.js';

const AREA_ORDER = ['Central', 'North', 'Medical', 'South', 'Downtown', 'East'];

export default function WeekEditor({ entries, setEntries, places, placeById, lateId, movedId }) {
  const set = (id, patch) => setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const byArea = AREA_ORDER.map((a) => [a, places.filter((p) => p.area === a)])
    .concat([['Other', places.filter((p) => !AREA_ORDER.includes(p.area))]]).filter(([, ps]) => ps.length);
  const addJob = () => setEntries((es) => [...es, newJob(es.filter((e) => e.added).length + 1, placeById.has('mainst') ? 'mainst' : places[0].id)]);
  const toggleDay = (e, d) => {
    const days = e.days.includes(d) ? e.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || e.days.includes(x));
    if (days.length) set(e.id, { days });
  };
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tt">
          <thead>
            <tr>
              <th>On</th><th>What</th><th>Days</th><th>Where</th><th>From</th><th>To</th>
              <th className="num" title="Chance this happens next fall">Chance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={e.on === false ? 'off' : ''}>
                <td className="keep">
                  <input type="checkbox" checked={e.on !== false} aria-label={`Include ${e.label}`}
                    onChange={(ev) => set(e.id, { on: ev.target.checked })} />
                </td>
                <td className="keep">
                  <input type="text" value={e.label} size={10} aria-label="Label" onChange={(ev) => set(e.id, { label: ev.target.value })} />
                  {e.id === lateId && <> <Pill tone="warn" title="Ends after 6 PM; used by the late lab toggle">late</Pill></>}
                  {e.id === movedId && <> <Pill tone="accent">moved</Pill></>}
                </td>
                <td className="keep" style={{ whiteSpace: 'nowrap' }}>
                  {DAYS.map((d) => (
                    <button key={d} type="button" className="btn small" aria-pressed={e.days.includes(d)}
                      style={{ padding: '1px 3px', marginRight: 1, fontSize: 12, minWidth: 25 }} title={DAY_LABEL[d]}
                      onClick={() => toggleDay(e, d)}>{DAY_LABEL[d].slice(0, 2)}</button>
                  ))}
                </td>
                <td className="keep">
                  <select value={e.place} aria-label="Place" onChange={(ev) => set(e.id, { place: ev.target.value })} style={{ maxWidth: 190 }}>
                    {byArea.map(([a, ps]) => (
                      <optgroup key={a} label={a}>
                        {ps.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {(e.alt || []).length > 0 && (
                    <div className="small muted">
                      or {e.alt.map((a) => `${placeById.get(a.place)?.label || a.place} (${Math.round((a.p || 0) * 100)}%)`).join(', ')}
                    </div>
                  )}
                </td>
                <td className="keep"><input type="time" style={{ width: 118 }} value={e.start} aria-label="Start" onChange={(ev) => ev.target.value && set(e.id, { start: ev.target.value })} /></td>
                <td className="keep"><input type="time" style={{ width: 118 }} value={e.end} aria-label="End" onChange={(ev) => ev.target.value && set(e.id, { end: ev.target.value })} /></td>
                <td className="num keep">
                  <input type="number" min={0} max={1} step={0.1} value={e.p ?? 1} style={{ width: 58 }} aria-label="Chance"
                    onChange={(ev) => { const v = Number(ev.target.value); if (v >= 0 && v <= 1) set(e.id, { p: v }); }} />
                  {e.added && <Button variant="quiet" small onClick={() => setEntries((es) => es.filter((x) => x.id !== e.id))}>remove</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row-flex" style={{ marginTop: 8 }}>
        <Button small onClick={addJob}>Add a job</Button>
        <span className="small muted">Chance: how likely each entry is next fall.</span>
      </div>
    </div>
  );
}
