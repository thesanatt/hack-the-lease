// One home's week in full, and one trip drawn leg by leg: walk (dashed ink), wait (hollow), bus (route color and
// number from the GTFS feeds), with clock times at each change. Time after dusk is a navy band under the leg.
// Props: api, home, week (WeekResult), routineWeek, selectedIdx, onSelect(idx), dusk (seconds), legs (from tripLegs)
import { AutoStrip, readableOn } from '../../components/index.js';
import { clock, toSec, DAY_LABEL } from './routine.js';
import './calendar/parts.css';
import { shapesNow, rideCoords, streetWalk } from '../../engine/shapes.js';

// Legs for one WeekResult trip. Transit uses planner.legs (one single-origin scan from the trip's departure).
export function tripLegs(api, trip) {
  if (!trip || trip.depart == null || !trip.mode) return null;
  const P = api.planner;
  if (trip.mode === 'transit') {
    try { return P.legs(trip.day, trip.from, trip.to, trip.depart); } catch (e) { console.warn('legs failed', e); return null; }
  }
  return { depart: trip.depart, arrive: trip.arrive, legs: [{ type: trip.mode, dep: trip.depart, arr: trip.arrive, sec: trip.arrive - trip.depart }] };
}

const placeName = (api, id) => api.data.placeById?.get(id)?.label || api.data.homeById?.get(id)?.name || 'the door';

// Map lines for one trip. Bus legs follow the trip's own GTFS shape between the boarding and alighting
// stops (straight only when the shape is missing); walks follow the OSM street graph and are dashed.
// Each path also carries dep, arr and a label so MapView can play the trip back on the map.
export function tripPaths(api, trip, legs) {
  if (!trip || !trip.mode) return [];
  const P = api.planner, stops = api.tt.stops, trips = api.tt.trips || api.data.meta?.trips;
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  const pt = (id) => { const p = P.points.get(id); return p ? [p.lon, p.lat] : null; };
  const st = (i) => (i != null && stops[i] ? [stops[i].lon, stops[i].lat] : null);
  if (trip.mode === 'walk' || trip.mode === 'bike') {
    const c = safe(() => P.pathCoords(trip.from, trip.to, trip.mode));
    if (!c) return [];
    const coords = [pt(trip.from), ...c, pt(trip.to)].filter(Boolean);
    return [{ coords, color: '#1c1a16', width: trip.mode === 'bike' ? 3 : 4, dash: trip.mode === 'walk',
      dep: trip.depart, arr: trip.arrive, label: `${trip.mode === 'bike' ? 'Bike' : 'Walk'} to ${placeName(api, trip.to)}`, kind: trip.mode }];
  }
  if (!legs) return [];
  const index = shapesNow();
  const out = [];
  for (const l of legs.legs) {
    const time = { dep: l.dep, arr: l.arr };
    if (l.type === 'ride') {
      const shape = l.trip != null ? trips?.[l.trip]?.[2] : null;
      const fromLL = st(l.from), toLL = st(l.to);
      const r = rideCoords(index, shape, fromLL, toLL);
      out.push({ coords: r.coords, onShape: r.onShape, shape, fromLL, toLL, color: l.color || '#2a5c8f', width: 5, kind: 'ride',
        label: `Bus ${l.route || ''} to ${l.toName || 'stop'}`.replace(/\s+/g, ' '), ...time });
    } else if (l.type === 'walk') {
      const a = l.from != null ? pt(l.from) : st(l.fromStop);
      const b = l.to != null ? pt(l.to) : st(l.toStop);
      const street = safe(() => streetWalk(P, { fromPoint: l.from, toPoint: l.to, fromStop: l.fromStop, toStop: l.toStop }, stops));
      const coords = street && street.length > 1 ? street : [a, b].filter(Boolean);
      if (coords.length) out.push({ coords, color: '#1c1a16', width: 3, dash: true, kind: 'walk',
        label: `Walk to ${l.toName || placeName(api, l.to)}`, ...time });
    } else if (l.type === 'transfer') {
      const street = safe(() => streetWalk(P, { fromStop: l.from, toStop: l.to }, stops));
      const coords = street && street.length > 1 ? street : [st(l.from), st(l.to)].filter(Boolean);
      out.push({ coords, color: '#1c1a16', width: 3, dash: true, kind: 'walk', label: `Walk to ${l.toName || 'the next stop'}`, ...time });
    } else if (l.type === 'wait') {
      const at = st(l.at);
      if (at) out.push({ coords: [at], color: '#a8700d', kind: 'wait', label: `Wait at ${l.atName || 'the stop'}`, ...time });
    }
  }
  return out;
}

const placeLabel = (api, id) => api.data.placeById.get(id)?.label || api.data.homeById.get(id)?.name || id;

const KIND = { walk: 'Walk', transfer: 'Walk', bike: 'Bike', wait: 'Wait', ride: 'Bus' };

function legTitle(api, l) {
  const span = `${clock(l.dep)} to ${clock(l.arr)}`;
  if (l.type === 'ride') return `Bus ${l.route || ''} ${l.routeName || ''} toward ${l.headsign || ''}, ${l.fromName || ''} to ${l.toName || ''}, ${span}`.replace(/\s+/g, ' ');
  if (l.type === 'wait') return `Wait at ${l.atName || 'the stop'}, ${span}`;
  if (l.type === 'bike') return `Bike, including ${Math.round(api.config.bikeOverheadS / 60)} min to unlock and park, ${span}`;
  if (l.type === 'transfer') return `Walk to change, ${l.fromName || ''} to ${l.toName || ''}, ${span}`;
  return `Walk${l.toName ? ` to ${l.toName}` : ''}, ${span}`;
}

function LegStrip({ api, legs, dusk }) {
  const shown = legs.legs.filter((l) => l.sec > 0 || l.type === 'ride');
  if (!shown.length) return null;
  return (
    <div className="mp-strip" role="list" aria-label="Trip, leg by leg">
      {shown.map((l, i) => {
        const min = Math.max(1, Math.round(l.sec / 60));
        const ride = l.type === 'ride';
        const color = ride ? l.color || '#2a5c8f' : null;
        const darkFrom = dusk != null && l.arr > dusk ? Math.max(0, (Math.max(l.dep, dusk) - l.dep) / Math.max(1, l.arr - l.dep)) : null;
        const kind = l.type === 'transfer' ? 'walk' : l.type;
        return (
          <div key={i} role="listitem" className={`leg ${kind}`} style={{ flexGrow: Math.max(60, l.sec) }} title={legTitle(api, l)}
            aria-label={legTitle(api, l)}>
            <span className="top">
              {ride ? <span className="route" style={{ background: color, color: readableOn(color) }}>{l.route}</span> : KIND[l.type]}
            </span>
            <span className="mark" style={ride ? { background: color } : undefined}>
              {darkFrom != null && <span className="dk" style={{ left: `${darkFrom * 100}%` }} />}
            </span>
            <span className="bot"><span className="clk">{clock(l.dep)}</span><span className="m">{min} min</span></span>
          </div>
        );
      })}
      <div className="leg end" role="listitem" aria-label={`Arrive ${clock(legs.arrive)}`}>
        <span className="top">&nbsp;</span>
        <span className="mark" />
        <span className="bot"><span className="clk">{clock(legs.arrive)}</span></span>
      </div>
    </div>
  );
}

export default function TripExplainer({ api, week, routineWeek, selectedIdx, onSelect, dusk, legs }) {
  if (!week) return null;
  const trip = week.trips[selectedIdx];
  const dur = trip?.mode ? Math.round((trip.arrive - trip.depart) / 60) : null;
  return (
    <div>
      <AutoStrip trips={week.trips} entries={routineWeek} selected={selectedIdx} onSelect={(t, i) => onSelect(i)} dusk={dusk} />
      {trip && (
        <div className="mp-trip">
          <div className="mp-trip-head">
            <span className="when">{DAY_LABEL[trip.day]} {trip.time ? clock(toSec(trip.time)) : clock(trip.depart)}</span>
            <span className="what">{placeLabel(api, trip.from)} to {placeLabel(api, trip.to)}</span>
            {dur != null && <span className="dur">{dur} min door to door</span>}
            {trip.mode && dusk != null && trip.arrive > dusk && <span className="dk">after dark</span>}
          </div>
          {!trip.mode ? (
            <div className="mp-strip none" role="img" aria-label="No ride fits your walking limits">
              <span className="hatch" />
              <span className="mp-trip-note">No ride fits your walking limits</span>
            </div>
          ) : legs ? (
            <LegStrip api={api} legs={legs} dusk={dusk} />
          ) : <p className="mp-gray">This trip could not be redrawn.</p>}
          {trip.mode && trip.stranded && <div className="mp-trip-note">Over your walking limit</div>}
        </div>
      )}
    </div>
  );
}
