// Preview of a parsed calendar: one row per weekly entry, its matched place, and a dropdown for each
// location that did not match. Nothing here is applied until the parent's Replace or Add button.
// Props: items (engine/ics.js items), skipped, places, placeById, include {key: bool}, setInclude,
//        resolve {key: placeId}, setResolve
import { Pill } from '../../../components/index.js';
import { DAY_LABEL, clock, toSec } from '../routine.js';

const AREA_ORDER = ['North', 'Central', 'Medical', 'South', 'Downtown', 'East'];

function PlacePicker({ item, places, placeById, value, onChange }) {
  const named = (item.candidates || []).filter((id) => placeById.has(id));
  const groups = AREA_ORDER.map((a) => [a, places.filter((p) => p.area === a)])
    .concat([['Other', places.filter((p) => !AREA_ORDER.includes(p.area))]]).filter(([, ps]) => ps.length);
  return (
    <select value={value || ''} onChange={(ev) => onChange(ev.target.value)} style={{ maxWidth: 200 }}
      aria-label={`Place for ${item.label}`}>
      <option value="">Pick a place (or leave out)</option>
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
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tt">
          <thead>
            <tr><th>Use</th><th>What</th><th>Days</th><th>Time</th><th>Where it says</th><th>Place in Quorum</th></tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const on = include[it.key] !== false;
              const place = it.place || resolve[it.key];
              return (
                <tr key={it.key} className={on ? '' : 'off'}>
                  <td className="keep">
                    <input type="checkbox" checked={on} aria-label={`Use ${it.label}`}
                      onChange={(ev) => setInclude((x) => ({ ...x, [it.key]: ev.target.checked }))} />
                  </td>
                  <td className="keep">
                    {it.label}
                    {it.notes?.length > 0 && <div className="small muted">{it.notes.join(' ')}</div>}
                  </td>
                  <td className="keep" style={{ whiteSpace: 'nowrap' }}>{it.days.map((d) => DAY_LABEL[d]).join(' ')}</td>
                  <td className="keep num" style={{ whiteSpace: 'nowrap' }}>{clock(toSec(it.start))} to {clock(toSec(it.end))}</td>
                  <td className="keep small">{it.location || <span className="muted">none given</span>}</td>
                  <td className="keep">
                    {it.place ? (
                      <>
                        {placeById.get(it.place)?.label || it.place}
                        {it.via === 'alias' && <div className="small muted">from "{it.alias}"</div>}
                      </>
                    ) : (
                      <>
                        <PlacePicker item={it} places={places} placeById={placeById} value={resolve[it.key]}
                          onChange={(v) => setResolve((x) => ({ ...x, [it.key]: v }))} />
                        {!place && (
                          <div className="small">
                            <Pill tone="warn">no match</Pill>{' '}
                            <span className="muted">
                              {it.candidates?.length > 1 ? 'Names more than one building.' : 'Not a place Quorum knows.'}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {skipped.length > 0 && (
        <p className="small muted" style={{ marginTop: 6 }}>
          Left out: {skipped.map((s) => `${s.label} (${s.reason})`).join('; ')}.
        </p>
      )}
    </div>
  );
}
