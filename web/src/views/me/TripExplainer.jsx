// One home's week in full, and one trip explained leg by leg with route names from the GTFS feeds.
// Props: api, home, week (WeekResult), routineWeek, selectedIdx, onSelect(idx), dusk (seconds), legs (from tripLegs)
import { WeekStrip, Pill } from '../../components/index.js';
import { clock, DAY_LABEL } from './routine.js';
import { MODE_LABEL } from './format.js';

// Legs for one WeekResult trip. Transit uses planner.legs (one single-origin scan from the trip's departure).
export function tripLegs(api, trip) {
  if (!trip || trip.depart == null || !trip.mode) return null;
  const P = api.planner;
  if (trip.mode === 'transit') {
    try { return P.legs(trip.day, trip.from, trip.to, trip.depart); } catch (e) { console.warn('legs failed', e); return null; }
  }
  return { depart: trip.depart, arrive: trip.arrive, legs: [{ type: trip.mode, dep: trip.depart, arr: trip.arrive, sec: trip.arrive - trip.depart }] };
}

// Map lines for one trip: walks and bikes on the street graph, rides stop to stop in the route color.
export function tripPaths(api, trip, legs) {
  if (!trip || !trip.mode) return [];
  const P = api.planner, stops = api.tt.stops;
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  if (trip.mode === 'walk' || trip.mode === 'bike') {
    const c = safe(() => P.pathCoords(trip.from, trip.to, trip.mode));
    return c ? [{ coords: c, color: trip.mode === 'bike' ? '#2d6a3e' : '#1c1a16', width: 4 }] : [];
  }
  if (!legs) return [];
  const pt = (id) => { const p = P.points.get(id); return p ? [p.lon, p.lat] : null; };
  const st = (i) => (i != null && stops[i] ? [stops[i].lon, stops[i].lat] : null);
  const out = [];
  for (const l of legs.legs) {
    if (l.type === 'ride') out.push({ coords: [st(l.from), st(l.to)].filter(Boolean), color: l.color || '#2a5c8f', width: 5 });
    else if (l.type === 'walk') {
      const a = l.from != null ? pt(l.from) : st(l.fromStop);
      const b = l.to != null ? pt(l.to) : st(l.toStop);
      if (a && b) out.push({ coords: [a, b], color: '#1c1a16', width: 2.5, dash: true });
    } else if (l.type === 'transfer') out.push({ coords: [st(l.from), st(l.to)].filter(Boolean), color: '#1c1a16', width: 2.5, dash: true });
  }
  return out;
}

const tripTitle = (api, t) => {
  const name = (id) => api.data.placeById.get(id)?.label || api.data.homeById.get(id)?.name || id;
  return `${name(t.from)} to ${name(t.to)}`;
};

export default function TripExplainer({ api, home, week, routineWeek, selectedIdx, onSelect, dusk, legs }) {
  if (!week) return null;
  const trip = week.trips[selectedIdx];
  const min = (s) => Math.round(s / 60);
  return (
    <div>
      <WeekStrip trips={week.trips} entries={routineWeek} selected={selectedIdx} onSelect={(t, i) => onSelect(i)} dusk={dusk} />
      <p className="small muted" style={{ marginTop: 4 }}>
        Bars are trips: <span style={{ color: 'var(--walk)' }}>walk</span>, <span style={{ color: 'var(--bike)' }}>bike</span>,{' '}
        <span style={{ color: 'var(--ride)' }}>bus</span>, <span style={{ color: 'var(--bad)' }}>hatched: no allowed way</span>.
        A navy underline marks minutes outside civil daylight; the shaded evening starts at civil dusk. Click a bar.
      </p>
      {trip && (
        <div style={{ marginTop: 8 }}>
          <h3 style={{ marginBottom: 2 }}>
            {DAY_LABEL[trip.day]} {trip.kind === 'arriveBy' ? `arrive by ${trip.time}` : `leave at ${trip.time}`}: {tripTitle(api, trip)}
          </h3>
          <div className="row-flex small" style={{ marginBottom: 6 }}>
            {trip.mode ? <Pill>{MODE_LABEL[trip.mode] || trip.mode}</Pill> : <Pill tone="bad">no allowed way</Pill>}
            {trip.stranded && trip.mode && <Pill tone="bad" title="Every allowed option breaks a walking limit; costed at the best option anyway">over the walking limit</Pill>}
            {trip.mode && <span className="mono">{clock(trip.depart)} to {clock(trip.arrive)}, {min(trip.arrive - trip.depart)} min</span>}
            {trip.darkMin > 0.5 && <span style={{ color: 'var(--dark-walk)' }}>{Math.round(trip.darkMin)} min after dark (lease average)</span>}
            {trip.slackMin > 0.5 && <span className="muted">{Math.round(trip.slackMin)} min early</span>}
          </div>
          {legs ? (
            <ul className="legs">
              {legs.legs.filter((l) => l.sec > 0 || l.type === 'ride').map((l, i) => (
                <li key={i}>
                  <span className="t">{clock(l.dep)}</span>
                  <span>
                    {l.type === 'ride'
                      ? <span className="glyph" style={{ background: l.color || 'var(--ride)', borderColor: l.color || 'var(--ride)' }} />
                      : <span className="glyph" style={{ background: l.type === 'wait' ? 'var(--paper)' : l.type === 'bike' ? 'var(--bike)' : 'var(--ink)', borderColor: l.type === 'bike' ? 'var(--bike)' : 'var(--ink)', borderRadius: l.type === 'wait' ? 0 : '50%' }} />}
                  </span>
                  <span>
                    {l.type === 'ride' && (
                      <>
                        <Pill tone="route" color={l.color}>{l.route}</Pill>{' '}
                        <strong>{l.routeName}</strong> toward {l.headsign}
                        <div className="small muted">{l.fromName} to {l.toName}{l.feed ? `, ${l.feed === 'A' ? 'TheRide' : 'U-M'}` : ''}</div>
                      </>
                    )}
                    {l.type === 'walk' && <>Walk {l.toName ? `to ${l.toName}` : l.fromName ? `from ${l.fromName}` : ''}</>}
                    {l.type === 'bike' && <>Bike, including {Math.round(api.config.bikeOverheadS / 60)} min to unlock and park</>}
                    {l.type === 'wait' && <>Wait at {l.atName}</>}
                    {l.type === 'transfer' && <>Walk to change: {l.fromName} to {l.toName}</>}
                  </span>
                  <span className="t">{min(l.sec)} min</span>
                </li>
              ))}
              <li><span className="t">{clock(legs.arrive)}</span><span /><span>Arrive</span><span /></li>
            </ul>
          ) : trip.mode === 'transit' ? <p className="small muted">The leg list for this trip could not be rebuilt.</p> : null}
          {!trip.mode && <p className="small">No walk, bike or bus option meets the walking limits for this trip.</p>}
        </div>
      )}
    </div>
  );
}
