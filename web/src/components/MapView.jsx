// MapView: MapLibre GL on our own GeoJSON only (no remote tiles, no glyph server, no sprites; labels are HTML markers).
// Props:
//   homes          [{id, lat, lon, name?, short?}] drawn as dots
//   places         [{id, lat, lon, label, short?}] drawn as small hollow squares with a short label (optional)
//   placeLabels    bool, show place labels (default true)
//   selectedHomeId id to highlight: an enlarged dot with an ink ring and its name (optional)
//   labelIds       ids of homes that get a name label. Default: every home, or with rankById only the selected one.
//                  The selected home is always labeled.
//   onHomeClick    (id) => void (optional)
//   paths          [{coords: [[lon,lat],...], color, width?, dash?: bool}] drawn on top, e.g. a trip's legs.
//                  Bus legs keep their GTFS color at 3 to 4 px; dashed legs (walks) are drawn in ink.
//                  Optional per path: dep, arr (seconds after midnight) and label feed the "Play this trip" dot;
//                  shape, fromLL, toLL (a bus leg) let the map re-cut the leg along its GTFS shape once shapes load.
//   fitById        optional {homeId: 0..1} or Map: colors each home dot on the sequential fit scale (FIT_STOPS,
//                  light sand = worst to deep green = best). Homes without a value, or no prop, are drawn in ink.
//   rankById       optional {homeId: rank} or Map (1 = best): ranks 1, 2 and 3 are drawn as numbered markers.
//   showStreets    bool (default true)   streets.geojson from OSM
//   showRoutes     bool (default true)   shapes.geojson from the GTFS feeds, faint, in route colors
//   height         px or CSS length (default 420)
//   fit            'homes' | 'all' | 'paths' (default 'all'): what the camera frames on load and when paths change;
//                  'paths' also keeps ranks 1 to 3 in frame when rankById is given
//   playable       bool (default true): show "Play this trip" when the paths carry dep and arr
//   playMs         ms for one playback (default 6000)
// Named exports: FIT_STOPS (the five scale colors) and fitColor(f) so charts beside the map use the same scale.
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

const PAPER = '#F7F5F0';
const INK = '#1A1A1A';
const GRAY = '#6B6B6B';
const HAIR = '#DEDAD2';
// Sequential fit scale: light sand (worst) to deep green (best), interpolated in OKLab, lightness monotone.
export const FIT_STOPS = ['#d8c69a', '#adb085', '#829a71', '#56855d', '#1f6f4a'];

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function fitColor(f) {
  if (!Number.isFinite(f)) return INK;
  const x = Math.min(Math.max(f, 0), 1) * (FIT_STOPS.length - 1);
  const i = Math.min(Math.floor(x), FIT_STOPS.length - 2), u = x - i;
  const a = hexRgb(FIT_STOPS[i]), b = hexRgb(FIT_STOPS[i + 1]);
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * u).toString(16).padStart(2, '0')).join('')}`;
}
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = hexRgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const lowContrast = (c) => isHex(c) && contrast(c, PAPER) < 2.2;

const EMPTY = { type: 'FeatureCollection', features: [] };
const STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': PAPER } }],
};

// Scoped styles, injected once, so the map looks the same whatever the page stylesheet says.
const CSS = `
.map.qmap { border: 1px solid ${HAIR}; border-radius: 8px; background: ${PAPER}; position: relative; overflow: hidden; width: 100%; }
.qmap .maplibregl-ctrl-attrib { display: none; }
.qmap .maplibregl-ctrl-group { box-shadow: none; border: 1px solid ${HAIR}; border-radius: 8px; overflow: hidden; }
.qmap .maplibregl-ctrl-group button { width: 28px; height: 28px; }
.qmap-card { background: #fff; border: 1px solid ${HAIR}; border-radius: 8px; font-family: 'IBM Plex Sans', 'Segoe UI', Arial, sans-serif; font-size: 13px; color: ${INK}; }
.qmap-legend { position: absolute; left: 8px; bottom: 8px; z-index: 2; padding: 6px 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; max-width: calc(100% - 140px); }
.qmap-legend .it { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.qmap-legend .sw { display: inline-flex; gap: 2px; }
.qmap-legend .sw i { width: 8px; height: 8px; border-radius: 4px; box-sizing: border-box; border: 1px solid ${GRAY}; }
.qmap-legend .ln { width: 18px; height: 0; border-top: 3px solid ${INK}; }
.qmap-legend .ln.dash { border-top: 2px dashed ${INK}; }
.qmap-legend .sq { width: 8px; height: 8px; border: 1.5px solid ${INK}; background: ${PAPER}; box-sizing: border-box; }
.qmap-legend .muted { color: ${GRAY}; }
.qmap-src { position: absolute; right: 8px; bottom: 6px; z-index: 2; font: 11px 'IBM Plex Sans', Arial, sans-serif; color: ${GRAY}; pointer-events: none; }
.qmap-rank { width: 22px; height: 22px; border-radius: 11px; border: 2px solid #fff; box-sizing: border-box; padding: 0; display: flex; align-items: center; justify-content: center;
  font: 600 13px/1 'IBM Plex Sans', Arial, sans-serif; cursor: pointer; }
.qmap-rank.sel { width: 28px; height: 28px; border-radius: 14px; font-size: 15px; outline: 2px solid ${INK}; outline-offset: 1px; }
.qmap-rank:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }
.qmap-namewrap { display: flex; }
.qmap-namewrap.flip .qmap-name { transform: translateX(calc(-100% - 2 * var(--off, 10px))); }
.qmap-name { font: 600 13px 'IBM Plex Sans', Arial, sans-serif; color: ${INK}; background: #fff; border: 1px solid ${HAIR}; border-radius: 6px; padding: 1px 6px; white-space: nowrap; cursor: pointer; }
.qmap-name.quiet { font-weight: 400; background: ${PAPER}; border-color: transparent; padding: 0 3px; }
.qmap-place { width: 8px; height: 8px; position: relative; pointer-events: none; }
.qmap-place i { position: absolute; inset: 0; border: 1.5px solid ${INK}; background: ${PAPER}; box-sizing: border-box; }
.qmap-place span { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); font: 13px 'IBM Plex Sans', Arial, sans-serif; color: ${GRAY}; white-space: nowrap; background: ${PAPER}cc; padding: 0 2px; border-radius: 3px; }
.qmap-place.flip span { left: auto; right: 11px; }
.qmap-play { position: absolute; left: 8px; top: 8px; z-index: 3; display: flex; align-items: center; gap: 10px; padding: 4px 12px 4px 4px; max-width: calc(100% - 64px); }
.qmap-play button { display: inline-flex; align-items: center; gap: 8px; border: 0; background: none; padding: 0 4px 0 0; cursor: pointer; font: 600 13px 'IBM Plex Sans', Arial, sans-serif; color: ${INK}; white-space: nowrap; }
.qmap-play button:disabled { opacity: 0.45; cursor: default; }
.qmap-play button:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; border-radius: 14px; }
.qmap-play .ic { width: 28px; height: 28px; border-radius: 14px; background: ${INK}; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.qmap-play .clk { font: 500 13px 'IBM Plex Sans', Arial, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
.qmap-play .leg { color: ${GRAY}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 420px; }
.qmap-tip { position: absolute; z-index: 4; pointer-events: none; padding: 4px 8px; transform: translate(-50%, calc(-100% - 12px)); white-space: nowrap; }
`;
let cssDone = false;
function injectCss() {
  if (cssDone || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.setAttribute('data-qmap', '');
  el.textContent = CSS;
  document.head.appendChild(el);
  cssDone = true;
}

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
const lookup = (src, id) => (src == null ? undefined : src instanceof Map ? src.get(id) : src[id]);

// A short place label: an acronym in brackets ("UgLi"), else the name without brackets or "Building", cut to about 19 chars.
const STOP = new Set(['of', 'at', 'the', 'and', '&']);
export function shortPlace(p) {
  if (p?.short) return p.short;
  const full = String(p?.label || p?.id || '');
  const br = full.match(/\(([^)]+)\)/);
  if (br && /^[A-Za-z]{2,6}$/.test(br[1]) && /[A-Z]/.test(br[1].slice(1))) return br[1];
  const words = full.replace(/\s*\([^)]*\)/g, '').replace(/\s+(Building|Center)$/, '').trim().split(/\s+/);
  let out = words[0] || '';
  for (const w of words.slice(1)) { if ((`${out} ${w}`).length > 19) break; out = `${out} ${w}`; }
  const parts = out.split(' ');
  while (parts.length > 1 && STOP.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return parts.join(' ');
}

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

// Hide labels that collide with a label or marker placed before them (priority order), so nothing overprints.
function declutter(boxEl, items, ranks = []) {
  if (!boxEl) return;
  // numbered markers that sit on top of each other: push the lower rank aside until they no longer touch
  const placed = [];
  for (const r of ranks) {
    r.mk.setOffset([0, 0]);
    const p = r.map ? r.map.project(r.mk.getLngLat()) : null;
    if (!p) continue;
    let dx = 0, dy = 0;
    for (let k = 0; k < 4; k++) {
      const near = placed.find((q) => Math.hypot(p.x + dx - q.x, p.y + dy - q.y) < 24);
      if (!near) break;
      const vx = p.x + dx - near.x, vy = p.y + dy - near.y, d = Math.hypot(vx, vy) || 1;
      const ux = d > 1 ? vx / d : 0.7, uy = d > 1 ? vy / d : 0.7;
      dx = near.x + ux * 24 - p.x; dy = near.y + uy * 24 - p.y;
    }
    if (dx || dy) r.mk.setOffset([dx, dy]);
    placed.push({ x: p.x + dx, y: p.y + dy });
  }
  const frame = boxEl.getBoundingClientRect();
  const taken = [];
  for (const sel of ['.qmap-play', '.qmap-legend', '.maplibregl-ctrl-top-right']) {
    const el = boxEl.parentElement?.querySelector(sel);
    if (el) taken.push(el.getBoundingClientRect());
  }
  const hit = (r) => taken.some((t) => r.left < t.right + 2 && r.right > t.left - 2 && r.top < t.bottom + 1 && r.bottom > t.top - 1);
  const bad = (r) => r.left < frame.left || r.right > frame.right || r.top < frame.top || r.bottom > frame.bottom || hit(r);
  for (const it of items) {
    const el = it.label || it.el;
    el.style.visibility = 'visible';
    if (it.flip) it.el.classList.remove('flip');
    let r = el.getBoundingClientRect();
    if (bad(r) && it.flip) {
      it.el.classList.add('flip');
      const r2 = el.getBoundingClientRect();
      if (bad(r2)) it.el.classList.remove('flip'); else r = r2;
    }
    if (!it.always && bad(r)) { el.style.visibility = 'hidden'; continue; }
    taken.push(r);
  }
}

export default function MapView({ homes = [], places = [], placeLabels = true, selectedHomeId, labelIds, onHomeClick, paths = [],
  fitById, rankById, showStreets = true, showRoutes = true, height = 420, fit = 'all', playable = true, playMs = 6000 }) {
  injectCss();
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const labelItems = useRef([]);
  const rankMarks = useRef([]);
  const clickRef = useRef(onHomeClick);
  const shapeIdx = useRef(null);
  const tipRef = useRef(null);
  const [ready, setReady] = useState(false);
  clickRef.current = onHomeClick;

  const showTip = (text, x, y) => {
    const t = tipRef.current;
    if (!t) return;
    if (!text) { t.style.display = 'none'; return; }
    t.textContent = text;
    t.style.left = `${x}px`; t.style.top = `${y}px`; t.style.display = 'block';
  };

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
      m.addSource('homes', { type: 'geojson', data: EMPTY });
      m.addSource('dot', { type: 'geojson', data: EMPTY });
      const major = ['in', ['get', 'k'], ['literal', ['primary', 'secondary', 'trunk', 'motorway', 'primary_link', 'secondary_link']]];
      const mid = ['==', ['get', 'k'], 'tertiary'];
      m.addLayer({ id: 'streets', type: 'line', source: 'streets', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
        'line-color': ['case', major, '#c9c3b8', mid, '#d6d1c7', '#e2ded5'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['case', major, 1.1, mid, 0.7, 0.35], 15, ['case', major, 3.2, mid, 2, 1.2]],
      } });
      m.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
        'line-color': ['coalesce', ['get', 'color'], GRAY], 'line-opacity': 0.22,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 15, 2],
      } });
      m.addLayer({ id: 'paths-casing', type: 'line', source: 'paths', filter: ['!=', ['get', 'dash'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PAPER, 'line-width': ['+', ['get', 'width'], 4] } });
      m.addLayer({ id: 'paths-edge', type: 'line', source: 'paths', filter: ['all', ['!=', ['get', 'dash'], true], ['==', ['get', 'lowc'], true]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': GRAY, 'line-width': ['+', ['get', 'width'], 1.5] } });
      m.addLayer({ id: 'paths-solid', type: 'line', source: 'paths', filter: ['!=', ['get', 'dash'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] } });
      m.addLayer({ id: 'paths-dash', type: 'line', source: 'paths', filter: ['==', ['get', 'dash'], true],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-dasharray': [1.6, 1.4] } });
      const sel = ['get', 'sel'];
      const fitExpr = ['case', ['>=', ['get', 'fit'], 0],
        ['interpolate', ['linear'], ['get', 'fit'], ...FIT_STOPS.flatMap((c, i) => [i / (FIT_STOPS.length - 1), c])], INK];
      m.addLayer({ id: 'homes-ring', type: 'circle', source: 'homes', filter: ['all', sel, ['!', ['get', 'top']]], paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 13], 'circle-opacity': 0,
        'circle-stroke-color': INK, 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'homes', type: 'circle', source: 'homes', filter: ['!', ['get', 'top']],
        layout: { 'circle-sort-key': ['+', ['get', 'fit'], ['case', sel, 10, 0]] },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['case', sel, 8, 6], 15, ['case', sel, 10, 8]],
          'circle-color': fitExpr,
          'circle-stroke-color': INK, 'circle-stroke-opacity': ['case', sel, 1, 0.6], 'circle-stroke-width': ['case', sel, 2, 1] } });
      m.addLayer({ id: 'homes-hit', type: 'circle', source: 'homes', filter: ['!', ['get', 'top']],
        paint: { 'circle-radius': 11, 'circle-opacity': 0 } });
      m.addLayer({ id: 'dot', type: 'circle', source: 'dot', paint: {
        'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': INK, 'circle-stroke-width': 2 } });
      m.on('click', 'homes-hit', (ev) => { const id = ev.features?.[0]?.properties?.id; if (id && clickRef.current) clickRef.current(id); });
      m.on('mousemove', 'homes-hit', (ev) => {
        m.getCanvas().style.cursor = clickRef.current ? 'pointer' : '';
        showTip(ev.features?.[0]?.properties?.name, ev.point.x, ev.point.y);
      });
      m.on('mouseleave', 'homes-hit', () => { m.getCanvas().style.cursor = ''; showTip(null); });
      m.on('moveend', () => declutter(box.current, labelItems.current, rankMarks.current));
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

  // homes, places and HTML markers
  const homesKey = homes.map((h) => h.id).join(',');
  const placesKey = places.map((p) => p.id).join(',');
  const labelKey = labelIds ? [...labelIds].join(',') : '*';
  const fitKey = fitById ? homes.map((h) => { const f = lookup(fitById, h.id); return Number.isFinite(f) ? f.toFixed(3) : '-'; }).join(',') : '';
  const rankKey = rankById ? homes.map((h) => lookup(rankById, h.id) ?? '-').join(',') : '';
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const rankOf = (id) => { const r = lookup(rankById, id); return Number.isFinite(r) && r >= 1 && r <= 3 ? r : 0; };
    const fitOf = (id) => { const f = lookup(fitById, id); return Number.isFinite(f) ? Math.min(Math.max(f, 0), 1) : -1; };
    m.getSource('homes').setData(fc(homes.map((h) => pt(h.lon, h.lat, {
      id: h.id, name: h.name || h.short || h.id, sel: h.id === selectedHomeId, fit: fitOf(h.id), top: rankOf(h.id) > 0 }))));
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const items = [];
    const add = (el, ll, opts) => { const mk = new maplibregl.Marker({ element: el, ...opts }).setLngLat(ll).addTo(m); markers.current.push(mk); return mk; };

    // the top three as numbered markers, best on top
    const top = homes.filter((h) => rankOf(h.id)).sort((a, b) => rankOf(b.id) - rankOf(a.id));
    const ranks = [];
    for (const h of top) {
      const r = rankOf(h.id), f = fitOf(h.id), fill = f >= 0 ? fitColor(f) : INK;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `qmap-rank${h.id === selectedHomeId ? ' sel' : ''}`;
      el.style.background = fill;
      el.style.color = contrast(fill, '#ffffff') >= contrast(fill, INK) ? '#ffffff' : INK;
      el.textContent = String(r);
      el.setAttribute('aria-label', `Pick ${r}: ${h.name || h.id}`);
      el.addEventListener('click', (e) => { e.stopPropagation(); clickRef.current?.(h.id); });
      el.addEventListener('mouseenter', () => { const p = m.project([h.lon, h.lat]); showTip(h.name || h.id, p.x, p.y - 6); });
      el.addEventListener('mouseleave', () => showTip(null));
      ranks.unshift({ mk: add(el, [h.lon, h.lat], {}), r, map: m });
      items.push({ el, always: true, prio: 0 });
    }
    rankMarks.current = ranks;

    // name labels: the selected home first, then the requested ones
    const labelSet = labelIds ? new Set(labelIds) : rankById ? new Set() : null;
    const named = homes.filter((h) => h.id === selectedHomeId || !labelSet || labelSet.has(h.id))
      .sort((a, b) => (b.id === selectedHomeId) - (a.id === selectedHomeId));
    for (const h of named) {
      const isSel = h.id === selectedHomeId;
      // The marker element is a bare wrapper; the visible pill is an inner span so it can flip to the left of its
      // dot near the right edge of the map (MapLibre owns the wrapper's transform).
      const el = document.createElement('div');
      el.className = 'qmap-namewrap';
      const tx = document.createElement('span');
      tx.className = `qmap-name${isSel ? '' : ' quiet'}`;
      tx.textContent = h.short || h.name || h.id;
      el.appendChild(tx);
      el.title = h.name || h.id;
      el.addEventListener('click', (e) => { e.stopPropagation(); clickRef.current?.(h.id); });
      const off = rankOf(h.id) ? (isSel ? 20 : 16) : (isSel ? 16 : 9);
      tx.style.setProperty('--off', `${off}px`);
      add(el, [h.lon, h.lat], { anchor: 'left', offset: [off, 0] });
      items.push({ el, label: tx, always: isSel, prio: isSel ? 0.2 : 3, flip: true });
    }

    // campus places: hollow squares, short labels
    for (const p of places) {
      const el = document.createElement('div');
      el.className = 'qmap-place';
      el.title = p.label || p.id;
      const sq = document.createElement('i');
      el.appendChild(sq);
      let label = null;
      if (placeLabels) {
        label = document.createElement('span');
        label.textContent = shortPlace(p);
        el.appendChild(label);
      }
      add(el, [p.lon, p.lat], {});
      items.push({ el: sq, always: true, prio: 0.5 });
      if (label) items.push({ el, label, prio: 2, flip: true });
    }
    items.sort((a, b) => a.prio - b.prio);
    labelItems.current = items;
    requestAnimationFrame(() => declutter(box.current, labelItems.current, rankMarks.current));
  }, [ready, homesKey, placesKey, selectedHomeId, placeLabels, labelKey, fitKey, rankKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // paths: bus legs re-cut along their GTFS shape when the caller built them before the shapes loaded
  const pathsKey = paths.map((p) => `${p.color}:${p.coords?.length}:${p.coords?.[0]}:${p.dep}`).join('|');
  const drawn = useMemo(() => paths.map((p) => resolveRide(p, shapeIdx.current)), [pathsKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.getSource('paths').setData(fc(drawn.filter((p) => p.coords?.length > 1).map((p) => {
      const dash = !!p.dash, color = dash ? INK : (p.color || INK);
      const width = dash ? 2.5 : Math.min(Math.max(p.width || 4, 3), 4);
      return { type: 'Feature', properties: { color, width, dash, lowc: !dash && lowContrast(color) },
        geometry: { type: 'LineString', coordinates: p.coords } };
    })));
    let pts;
    // framing a trip also keeps the numbered top three in view, so the hero never loses the answer
    if (fit === 'paths' && drawn.length) {
      pts = [...drawn.flatMap((p) => p.coords || []),
        ...homes.filter((h) => { const r = lookup(rankById, h.id); return r >= 1 && r <= 3; }).map((h) => [h.lon, h.lat])];
    }
    else if (fit === 'homes') pts = homes.map((h) => [h.lon, h.lat]);
    else pts = [...homes, ...places].map((p) => [p.lon, p.lat]);
    const b = bbox(pts);
    const W = box.current?.clientWidth || 600, H = box.current?.clientHeight || 400;
    const pad = { top: Math.min(60, H * 0.15), bottom: Math.min(64, H * 0.18), left: Math.min(40, W * 0.08), right: Math.min(56, W * 0.1) };
    if (b) m.fitBounds(b, { padding: pad, duration: 0, maxZoom: 15.5 });
    // with a trip on the map, the network fades back so the trip reads first
    m.setPaintProperty('routes', 'line-opacity', drawn.some((p) => p.coords?.length > 1) ? 0 : 0.22);
    requestAnimationFrame(() => declutter(box.current, labelItems.current, rankMarks.current));
  }, [ready, drawn, fit, homesKey, rankKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const shown = drawn.filter((p) => p.coords?.length > 1);
  const rides = shown.filter((p) => p.kind === 'ride' || (!p.dash && p.kind !== 'bike' && p.kind !== 'walk'));
  const rideColors = [...new Set(rides.map((p) => p.color || INK))].slice(0, 3);
  const anyDash = shown.some((p) => p.dash);
  const anyBike = shown.some((p) => p.kind === 'bike');
  const bikeColor = shown.find((p) => p.kind === 'bike')?.color || INK;
  const offShape = drawn.filter((p) => p.kind === 'ride' && !p.onShape).length;
  const hasFit = !!fitById && homes.some((h) => Number.isFinite(lookup(fitById, h.id)));
  const label = reduced
    ? (mode === 'step' ? (step + 1 >= stops.length ? 'Back to start' : 'Next step') : 'Step through this trip')
    : (mode === 'run' ? 'Stop' : mode === 'done' ? 'Play again' : 'Play this trip');
  const icon = mode === 'run'
    ? <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="#fff" /></svg>
    : reduced && mode === 'step'
      ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l5 4-5 4zM8 2h2v8H8z" fill="#fff" /></svg>
      : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5l8 4.5-8 4.5z" fill="#fff" /></svg>;

  return (
    <div className="map qmap" style={{ height }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {track && (
        <div className="qmap-play qmap-card">
          <button type="button" onClick={onPlay} disabled={!ready}>
            <span className="ic">{icon}</span>{label}
          </button>
          {mode === 'idle' ? (
            <span className="clk">{clockText(track.start)} to {clockText(track.end)}</span>
          ) : (
            <>
              <span ref={clockRef} className="clk" style={{ minWidth: '8ch' }} />
              <span className="leg" aria-live="polite">{legText}</span>
            </>
          )}
        </div>
      )}
      <div className="qmap-legend qmap-card" aria-label="Map key">
        {hasFit ? (
          <span className="it"><span className="muted">Worse</span>
            <span className="sw">{FIT_STOPS.map((c) => <i key={c} style={{ background: c }} />)}</span>
            <span className="muted">Better fit</span></span>
        ) : homes.length > 0 && (
          <span className="it"><span className="sw"><i style={{ background: INK, borderColor: INK }} /></span>Home</span>
        )}
        {places.length > 0 && <span className="it"><span className="sq" />Your places</span>}
        {rideColors.length > 0 && (
          <span className="it"><span style={{ display: 'inline-flex', gap: 2 }}>
            {rideColors.map((c) => <span key={c} className="ln" style={{ width: rideColors.length > 1 ? 10 : 18, borderTopColor: c }} />)}
          </span>Bus</span>
        )}
        {anyBike && <span className="it"><span className="ln" style={{ borderTopColor: bikeColor }} />Bike</span>}
        {anyDash && <span className="it"><span className="ln dash" />Walk</span>}
        {offShape > 0 && <span className="it muted">{offShape} bus leg{offShape > 1 ? 's' : ''} drawn straight</span>}
      </div>
      <div className="qmap-src">OpenStreetMap, GTFS</div>
      <div ref={tipRef} className="qmap-tip qmap-card" style={{ display: 'none' }} role="tooltip" />
    </div>
  );
}
