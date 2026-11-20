// MapView: MapLibre GL on our own GeoJSON only (no remote tiles, no glyph server, no sprites; labels are HTML markers).
// Props:
//   homes          [{id, lat, lon, name?, short?}] drawn as squares with a mono label (short || id)
//   places         [{id, lat, lon, label}] drawn as small dots with italic labels (optional)
//   placeLabels    bool, show place labels (default true)
//   selectedHomeId id to highlight (optional)
//   labelIds       ids of homes that get an HTML label (default: every home); the selected home is always labeled
//   onHomeClick    (id) => void (optional)
//   paths          [{coords: [[lon,lat],...], color, width?, dash?: bool}] drawn on top, e.g. a trip's legs.
//                  Optional per path: dep, arr (seconds after midnight) and label feed the "Play this trip" dot;
//                  shape, fromLL, toLL (a bus leg) let the map re-cut the leg along its GTFS shape once shapes load.
//   showStreets    bool (default true)   streets.geojson from OSM
//   showRoutes     bool (default true)   shapes.geojson from the GTFS feeds, in route colors
//   height         px (default 420)
//   fit            'homes' | 'all' | 'paths' (default 'all'): what the camera frames on load and when paths change
//   playable       bool (default true): show "Play this trip" when the paths carry dep and arr
//   playMs         ms for one playback (default 6000)
// The map data loads once per page and is shared by every MapView.
// With prefers-reduced-motion the dot does not move: the control steps leg by leg instead.
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadShapes, resolveRide, buildTrack, positionAt, clockText } from '../engine/shapes.js';

let geoPromise = null;
function loadGeo() {
  if (!geoPromise) {
    const j = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    geoPromise = Promise.all([j('./data/streets/streets.geojson'), loadShapes()])
      .then(([streets, idx]) => ({ streets, shapes: idx?.geojson || null, shapeIndex: idx }));
  }
  return geoPromise;
}

const EMPTY = { type: 'FeatureCollection', features: [] };
const PAPER = '#f5f0e4';

const STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': PAPER } }],
};

function bbox(points) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lon, lat] of points) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

const fc = (features) => ({ type: 'FeatureCollection', features });
const pt = (lon, lat, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });

function useReducedMotion() {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [reduced, setReduced] = useState(() => !!q?.matches);
  useEffect(() => {
    if (!q) return undefined;
    const on = () => setReduced(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return reduced;
}

export default function MapView({ homes = [], places = [], placeLabels = true, selectedHomeId, labelIds, onHomeClick, paths = [],
  showStreets = true, showRoutes = true, height = 420, fit = 'all', playable = true, playMs = 6000 }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const clickRef = useRef(onHomeClick);
  const shapeIdx = useRef(null);
  const [ready, setReady] = useState(false);
  clickRef.current = onHomeClick;

  useEffect(() => {
    let cancelled = false;
    const m = new maplibregl.Map({
      container: box.current, style: STYLE, center: [-83.735, 42.283], zoom: 12.4,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, maxZoom: 17, minZoom: 10,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = m;
    m.on('load', async () => {
      const { streets, shapes, shapeIndex } = await loadGeo();
      if (cancelled) return;
      shapeIdx.current = shapeIndex;
      m.addSource('streets', { type: 'geojson', data: streets || EMPTY });
      m.addSource('routes', { type: 'geojson', data: shapes || EMPTY });
      m.addSource('paths', { type: 'geojson', data: EMPTY });
      m.addSource('places', { type: 'geojson', data: EMPTY });
      m.addSource('homes', { type: 'geojson', data: EMPTY });
      m.addSource('dot', { type: 'geojson', data: EMPTY });
      const major = ['in', ['get', 'k'], ['literal', ['primary', 'secondary', 'trunk', 'motorway', 'primary_link', 'secondary_link']]];
      m.addLayer({ id: 'streets', type: 'line', source: 'streets', paint: {
        'line-color': ['case', major, '#a99f8a', '#cbc1ab'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['case', major, 1.2, 0.4], 15, ['case', major, 3, 1.2]],
      } });
      m.addLayer({ id: 'routes', type: 'line', source: 'routes', paint: {
        'line-color': ['coalesce', ['get', 'color'], '#2a5c8f'], 'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 15, 3],
      } });
      m.addLayer({ id: 'paths-casing', type: 'line', source: 'paths', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PAPER, 'line-width': ['+', ['coalesce', ['get', 'width'], 4], 3] } });
      m.addLayer({ id: 'paths-solid', type: 'line', source: 'paths', filter: ['!=', ['get', 'dash'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['coalesce', ['get', 'width'], 4] } });
      m.addLayer({ id: 'paths-dash', type: 'line', source: 'paths', filter: ['==', ['get', 'dash'], true],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['coalesce', ['get', 'width'], 3], 'line-dasharray': [1, 1.5] } });
      m.addLayer({ id: 'places', type: 'circle', source: 'places', paint: {
        'circle-radius': 3.5, 'circle-color': PAPER, 'circle-stroke-color': '#3d3830', 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'homes', type: 'circle', source: 'homes', paint: {
        'circle-radius': ['case', ['get', 'sel'], 7, 5],
        'circle-color': ['case', ['get', 'sel'], '#b23a1c', '#1c1a16'],
        'circle-stroke-color': PAPER, 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'dot', type: 'circle', source: 'dot', paint: {
        'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#1c1a16', 'circle-stroke-width': 2 } });
      m.on('click', 'homes', (ev) => { const id = ev.features?.[0]?.properties?.id; if (id && clickRef.current) clickRef.current(id); });
      m.on('mouseenter', 'homes', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'homes', () => { m.getCanvas().style.cursor = ''; });
      setReady(true);
    });
    return () => { cancelled = true; markers.current.forEach((mk) => mk.remove()); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setLayoutProperty('streets', 'visibility', showStreets ? 'visible' : 'none');
    m.setLayoutProperty('routes', 'visibility', showRoutes ? 'visible' : 'none');
  }, [ready, showStreets, showRoutes]);

  // homes, places and HTML labels
  const homesKey = homes.map((h) => h.id).join(',');
  const placesKey = places.map((p) => p.id).join(',');
  const labelKey = labelIds ? [...labelIds].join(',') : '*';
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.getSource('homes').setData(fc(homes.map((h) => pt(h.lon, h.lat, { id: h.id, sel: h.id === selectedHomeId }))));
    m.getSource('places').setData(fc(places.map((p) => pt(p.lon, p.lat, { id: p.id }))));
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const labelSet = labelIds ? new Set(labelIds) : null;
    for (const h of homes) {
      if (labelSet && !labelSet.has(h.id) && h.id !== selectedHomeId) continue;
      const el = document.createElement('div');
      el.className = `map-label home${h.id === selectedHomeId ? ' sel' : ''}`;
      el.textContent = h.short || h.id;
      el.title = h.name || h.id;
      el.addEventListener('click', (e) => { e.stopPropagation(); clickRef.current?.(h.id); });
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'left', offset: [8, 0] }).setLngLat([h.lon, h.lat]).addTo(m));
    }
    if (placeLabels) {
      for (const p of places) {
        const el = document.createElement('div');
        el.className = 'map-label place';
        el.textContent = p.label;
        markers.current.push(new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 4] }).setLngLat([p.lon, p.lat]).addTo(m));
      }
    }
  }, [ready, homesKey, placesKey, selectedHomeId, placeLabels, labelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // paths: bus legs re-cut along their GTFS shape when the caller built them before the shapes loaded
  const pathsKey = paths.map((p) => `${p.color}:${p.coords?.length}:${p.coords?.[0]}:${p.dep}`).join('|');
  const drawn = useMemo(() => paths.map((p) => resolveRide(p, shapeIdx.current)), [pathsKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.getSource('paths').setData(fc(drawn.filter((p) => p.coords?.length > 1).map((p) => ({
      type: 'Feature', properties: { color: p.color || '#1c1a16', width: p.width || 4, dash: !!p.dash },
      geometry: { type: 'LineString', coordinates: p.coords },
    }))));
    let pts;
    if (fit === 'paths' && drawn.length) pts = drawn.flatMap((p) => p.coords || []);
    else if (fit === 'homes') pts = homes.map((h) => [h.lon, h.lat]);
    else pts = [...homes, ...places].map((p) => [p.lon, p.lat]);
    const b = bbox(pts);
    if (b) m.fitBounds(b, { padding: { top: 52, bottom: 52, left: 40, right: 56 }, duration: 0, maxZoom: 15.5 });
    // with a trip on the map, the network fades back so the trip reads first
    m.setPaintProperty('routes', 'line-opacity', drawn.some((p) => p.coords?.length > 1) ? 0.22 : 0.55);
  }, [ready, drawn, fit, homesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // playback
  const reduced = useReducedMotion();
  const track = useMemo(() => (playable ? buildTrack(drawn) : null), [drawn, playable]);
  const [mode, setMode] = useState('idle'); // idle | run | done | step
  const [step, setStep] = useState(0);
  const [legText, setLegText] = useState('');
  const raf = useRef(0);
  const clockEl = useRef(null);
  const lastLeg = useRef(-1);
  const lastT = useRef(null);
  const clockRef = (el) => { clockEl.current = el; if (el) el.textContent = clockText(lastT.current); };

  const showAt = (t, text) => {
    const m = map.current, p = positionAt(track, t);
    if (!m || !p || !m.getSource('dot')) return;
    lastT.current = t;
    m.getSource('dot').setData(fc([pt(p.lon, p.lat, { color: p.color })]));
    if (clockEl.current) clockEl.current.textContent = clockText(t);
    if (text != null) { lastLeg.current = -1; setLegText(text); }
    else if (p.leg !== lastLeg.current) { lastLeg.current = p.leg; setLegText(p.label); }
  };
  const stop = () => { cancelAnimationFrame(raf.current); raf.current = 0; };
  const clear = () => {
    stop();
    lastLeg.current = -1;
    setMode('idle'); setStep(0); setLegText('');
    map.current?.getSource('dot')?.setData(EMPTY);
  };
  useEffect(() => { clear(); return stop; }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  // what the stepper visits: the start of each leg that takes time, then the arrival
  const stops = useMemo(() => (track ? [...track.legs.filter((l) => l.arr > l.dep).map((l) => ({ t: l.dep, text: l.label })),
    { t: track.end, text: 'Arrived' }] : []), [track]);

  const onPlay = () => {
    if (!track || !ready) return;
    if (reduced) {
      const next = mode === 'step' ? step + 1 : 0;
      if (next >= stops.length) { clear(); return; }
      setMode('step'); setStep(next); showAt(stops[next].t, stops[next].text);
      return;
    }
    if (mode === 'run') { stop(); setMode('done'); return; }
    stop();
    lastLeg.current = -1;
    setMode('run');
    const t0 = performance.now(), span = track.end - track.start;
    const tick = (now) => {
      const f = Math.min((now - t0) / playMs, 1);
      if (f < 1) { showAt(track.start + f * span); raf.current = requestAnimationFrame(tick); }
      else { showAt(track.end, 'Arrived'); raf.current = 0; setMode('done'); }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const anyDash = drawn.some((p) => p.dash && p.coords?.length > 1);
  const anyRide = drawn.some((p) => p.kind === 'ride');
  const offShape = drawn.filter((p) => p.kind === 'ride' && !p.onShape).length;
  const label = reduced
    ? (mode === 'step' ? (step + 1 >= stops.length ? 'Back to start' : 'Next step') : 'Step through this trip')
    : (mode === 'run' ? 'Stop' : mode === 'done' ? 'Play again' : 'Play this trip');

  return (
    <div className="map" style={{ height }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {track && (
        <div className="map-play" style={{ position: 'absolute', left: 8, top: 8, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--paper)', border: '1px solid var(--ink)', padding: '4px 8px 4px 4px', maxWidth: 'calc(100% - 64px)', fontSize: 13 }}>
          <button type="button" className="btn small" onClick={onPlay} disabled={!ready}
            style={{ whiteSpace: 'nowrap' }}>{label}</button>
          {mode === 'idle' ? (
            <span className="mono" style={{ whiteSpace: 'nowrap' }}>{clockText(track.start)} to {clockText(track.end)}</span>
          ) : (
            <>
              <span ref={clockRef} className="mono" style={{ fontWeight: 600, minWidth: '8ch', fontVariantNumeric: 'tabular-nums' }} />
              <span aria-live="polite" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{legText}</span>
            </>
          )}
        </div>
      )}
      <div className="map-legend">
        <i style={{ background: '#1c1a16', height: 8, width: 8, borderRadius: 4 }} />home
        <i style={{ background: '#2a5c8f' }} />bus route (GTFS color)
        <i style={{ background: '#cbc1ab' }} />street (OSM)
        {anyDash && <><i style={{ background: 'none', height: 0, borderTop: '2px dashed #1c1a16' }} />walk on OSM streets</>}
        {anyRide && offShape > 0 && <span className="muted"> ({offShape} bus leg{offShape > 1 ? 's' : ''} drawn straight: no shape)</span>}
      </div>
    </div>
  );
}
