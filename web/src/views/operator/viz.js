// Pure helpers for the Owners charts (Node tests and browser). They only sort, classify and word the numbers
// the engine returned; nothing here makes a number up.
import { parseKey } from './fit.js';

const FLOOR_RANK = { attic: 0, 3: 1, 2: 2, 1: 3, basement: 4 };
const FLOOR_NAME = { attic: 'Attic', 3: '3rd floor', 2: '2nd floor', 1: '1st floor', basement: 'Basement' };

export const floorName = (f) => FLOOR_NAME[f] || `Floor ${f}`;

// Rooms grouped by floor, top of the house first. Each room keeps its index j into home.rooms.
export function floorsOf(rooms) {
  const by = new Map();
  (rooms || []).forEach((room, j) => {
    const k = String(room.floor);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push({ room, j });
  });
  return [...by.entries()]
    .sort((a, b) => (FLOOR_RANK[a[0]] ?? 2.5) - (FLOOR_RANK[b[0]] ?? 2.5))
    .map(([floor, list]) => ({ floor, name: floorName(floor), below: floor === 'basement', rooms: list }));
}

// Where the asking rent sits against the fair range (p10 to p90 across sample groups). By default any asking rent
// outside the drawn range counts as priced off, so the header count matches the chart; pass `near` (dollars a
// month) to require a margin outside the range instead.
export const NEAR = 0;
export function roomState(asking, fair, near = NEAR) {
  if (!Number.isFinite(asking) || !fair || !Number.isFinite(fair.p10) || !Number.isFinite(fair.p90)) return 'none';
  if (near > 0 ? asking >= fair.p90 + near : asking > fair.p90) return 'over';
  if (near > 0 ? asking <= fair.p10 - near : asking < fair.p10) return 'under';
  return 'fair';
}

// Dollars a month from asking rent to the nearest end of the fair range (0 inside it).
export function outside(asking, fair) {
  const s = roomState(asking, fair, 0);
  if (s === 'over') return asking - fair.p90;
  if (s === 'under') return fair.p10 - asking;
  return 0;
}

// Sum over rooms of |asking - typical fair rent|, or null when a room has no fair rent.
export function gapTotal(rooms, fair) {
  if (!Array.isArray(fair) || fair.length !== (rooms || []).length) return null;
  let t = 0;
  for (let j = 0; j < rooms.length; j++) {
    if (!Number.isFinite(fair[j]?.p50)) return null;
    if (Number.isFinite(rooms[j].asking)) t += Math.abs(rooms[j].asking - fair[j].p50);
  }
  return t;
}

// Clean axis ticks between lo and hi, about `count` of them.
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
  const step = steps.find((s) => s >= raw) || steps[steps.length - 1];
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

// Domain for a set of fair ranges and asking rents, padded a little on each side.
export function rentDomain(rooms, fair) {
  const xs = [];
  (fair || []).forEach((f) => { if (f) xs.push(f.p10, f.p90); });
  (rooms || []).forEach((r) => xs.push(r.asking));
  const v = xs.filter(Number.isFinite);
  if (!v.length) return [0, 1];
  const lo = Math.min(...v), hi = Math.max(...v);
  const pad = (hi - lo) * 0.06 || 10;
  return [lo - pad, hi + pad];
}

// "Church St house, 5 bed" -> "Church St"
export const shortName = (name) => String(name).split(',')[0].replace(/ (house|apartment)$/, '');

// "Central, no job, late study, gym" -> "Central, late library, early gym"
export function shortKind(key) {
  const a = parseKey(key);
  const parts = [a.campus];
  if (a.job === 'downtown') parts.push('job downtown');
  if (a.job === 'campus') parts.push('job on campus');
  if (a.lateStudy) parts.push('late library');
  if (a.gym) parts.push('early gym');
  if (parts.length === 1) parts.push('classes only');
  return parts.join(', ');
}

// Bars for "Who it fits": the kinds of week this home is the top pick for, biggest first, with the tail
// folded into one bar once there are more than `max`.
export function fitBars(wins, counts, max = 8) {
  const rows = (wins || []).map((k) => ({ key: k, label: shortKind(k), n: counts ? counts.get(k) || 0 : null }));
  rows.sort((a, b) => (b.n ?? 0) - (a.n ?? 0) || a.label.localeCompare(b.label));
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max - 1);
  const tail = rows.slice(max - 1);
  const n = counts ? tail.reduce((t, r) => t + (r.n || 0), 0) : null;
  return [...head, { key: 'other', label: `${tail.length} more kinds of week`, n, other: true }];
}
