// Preview of a parsed calendar, drawn as week calendar blocks. Click a block to leave it out. Locations that did
// not match a known place get one picker each. Nothing here is applied until the parent's Replace or Add button.
// Props: items (engine/ics.js items), skipped, places, placeById, include {key: bool}, setInclude,
//        resolve {key: placeId}, setResolve
import { useMemo } from 'react';
import WeekCalendar from '../WeekCalendar.jsx';
import { DAY_LABEL, clock, toSec } from '../routine.js';

const AREA_ORDER = ['North', 'Central', 'Medical', 'South', 'Downtown', 'East'];

function PlacePicker({ item, places, placeById, value, onChange }) {
  const named = (item.candidates || []).filter((id) => placeById.has(id));
  const groups = AREA_ORDER.map((a) => [a, places.filter((p) => p.area === a)])
    .concat([['Other', places.filter((p) => !AREA_ORDER.includes(p.area))]]).filter(([, ps]) => ps.length);
  return (
    <select value={value || ''} onChange={(ev) => onChange(ev.target.value)} aria-label={`Place for ${item.label}`}>
      <option value="">Pick a place</option>
      {named.length > 0 && (
        <optgroup label="Named in the file">
          {named.map((id) => <option key={`n-${id}`} value={id}>{placeById.get(id).label}</option>)}
        </optgroup>
      )}
      {groups.map(([a, ps]) => (
        <optgroup key={a} label={a}>
          {ps.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function ImportPreview({ items, skipped, places, placeById, include, setInclude, resolve, setResolve }) {
  const asEntries = useMemo(() => items.map((it) => ({
    id: it.key, label: it.label, days: it.days, start: it.start, end: it.end,
    place: it.place || resolve[it.key] || null, on: include[it.key] !== false,
  })), [items, include, resolve]);
  const unmatched = items.filter((it) => !it.place && include[it.key] !== false);
  return (
    <div>
      <WeekCalendar entries={asEntries} placeById={placeById} pxPerHour={15}
        onBlock={(e) => setInclude((x) => ({ ...x, [e.id]: x[e.id] === false }))} />
      {unmatched.length > 0 && (
        <ul className="mp-unmatched" aria-label="Classes that need a place">
          {unmatched.map((it) => (
            <li key={it.key}>
              <span className="nm">{it.label}</span>
              <span className="mp-gray">{it.days.map((d) => DAY_LABEL[d]).join(' ')} {clock(toSec(it.start))}{it.location ? `, "${it.location}"` : ''}</span>
              <PlacePicker item={it} places={places} placeById={placeById} value={resolve[it.key]}
                onChange={(v) => setResolve((x) => ({ ...x, [it.key]: v }))} />
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 && (
        <p className="mp-gray" style={{ marginTop: 6, marginBottom: 0 }} title={skipped.map((s) => `${s.label} (${s.reason})`).join('; ')}>
          {skipped.length} {skipped.length === 1 ? 'line' : 'lines'} left out: {skipped.map((s) => s.reason).filter((r, i, a) => a.indexOf(r) === i).join('; ')}
        </p>
      )}
    </div>
  );
}
