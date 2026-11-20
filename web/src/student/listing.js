// One flat record per home, built from the data (homes.json, the sample listing details, the router's week for
// this student), and a generic checker for requirements the local model writes against it. No phrase rules:
// the model turns "close to Hadley", "need in-unit laundry", "cats ok?" into { field, op, value }; this file only
// knows the fields.

// The fields the model may use, with what they mean. Sent to the model as its vocabulary.
export const FIELDS = {
  rent: 'number: monthly rent with utilities for the room ranked best for the student, dollars',
  rent_from: 'number: cheapest room with utilities, dollars',
  kind: 'text: "house" or "apartment"',
  area: 'text: neighborhood name',
  bedrooms: 'number of bedrooms in the home',
  max_room_sqft: 'number: largest bedroom, square feet',
  private_bath: 'yes/no: some bedroom has a private bathroom',
  bright_room: 'yes/no: some bedroom has the most daylight',
  basement_room: 'yes/no: the room ranked best for the student is in the basement',
  furnished: 'yes/no', laundry_free: 'yes/no: free washer and dryer in the unit or basement', laundry: 'text',
  parking_spots: 'number of off-street spots', pets_allowed: 'yes/no', pets: 'text, e.g. "Cats allowed, $300 pet deposit"',
  air_conditioning: 'yes/no', central_air: 'yes/no', dishwasher: 'yes/no', internet_included: 'yes/no',
  outdoor_space: 'yes/no: porch, yard, deck or balcony', quiet_street: 'yes/no',
  lease_months: 'number: 8 or 12', move_in: 'date YYYY-MM-DD', built_year: 'number', utilities_per_room: 'number, dollars a month',
  'walk_min_to:<place id>': 'number: minutes on foot from the home to that place, on real streets',
  'trip_min_to:<place id>': 'number: fastest door-to-door minutes to that place for the student (walk, bike or bus), from their week',
  late_trips_without_ride: 'number a week: trips home that no bus or walk within their limits covers',
  weekly_travel_hours: 'number: hours a week getting around for their week',
};
export const OPS = ['=', '!=', '<=', '>=', '<', '>', 'contains', 'not_contains'];

const yes = (v) => v === true;
export function listingRecord(api, home, item) {
  const d = api.data.detailsById?.get(home.id) || null;
  const rooms = home.rooms || [];
  const room = rooms.find((r) => r.id === item?.roomId) || rooms[0];
  const n = rooms.length || 1;
  const util = (home.utilities || 0) / n;
  const months = d ? Number(/^(\d+) months/.exec(d.lease)?.[1]) || null : null;
  const iso = d ? (() => { const t = new Date(`${d.available} 12:00`); return Number.isNaN(+t) ? null : t.toISOString().slice(0, 10); })() : null;
  const rec = {
    rent: item?.rent ?? (room ? room.asking + util : null),
    rent_from: Math.min(...rooms.map((r) => r.asking + util)),
    kind: home.kind, area: home.area, bedrooms: n,
    max_room_sqft: Math.max(...rooms.map((r) => r.sqft)),
    private_bath: rooms.some((r) => r.bath === 'private'),
    bright_room: rooms.some((r) => (r.light ?? 1) >= 2),
    basement_room: room?.floor === 'basement',
    utilities_per_room: Math.round(util),
    weekly_travel_hours: item?.week ? Math.round((item.week.weeklyMin / 60) * 10) / 10 : undefined,
    late_trips_without_ride: item?.week ? (item.week.stranded?.length || 0) : undefined,
  };
  if (d) Object.assign(rec, {
    furnished: yes(d.flags.furnished), laundry_free: yes(d.flags.laundryFree), laundry: d.laundry,
    parking_spots: Number(/^(\d+) driveway/.exec(d.parking)?.[1] || 0), pets_allowed: yes(d.flags.pets), pets: d.pets,
    air_conditioning: !/no air/i.test(d.heatCool), central_air: yes(d.flags.centralAir), dishwasher: yes(d.flags.dishwasher),
    internet_included: yes(d.flags.internet), outdoor_space: !/^No /.test(d.outdoor), quiet_street: yes(d.flags.quiet),
    lease_months: months, move_in: iso, built_year: d.built,
  });
  return rec;
}

// The value of a field for one home; walk and trip minutes are computed on demand.
export function fieldValue(api, rec, home, item, field) {
  const m = /^(walk_min_to|trip_min_to):([a-z0-9_]+)$/.exec(field || '');
  if (m) {
    const place = m[2];
    if (!api.data.placeById.has(place)) return undefined;
    if (m[1] === 'walk_min_to') { try { const s = api.planner.walkSec(home.id, place); return Number.isFinite(s) ? Math.round(s / 60) : undefined; } catch { return undefined; } }
    const t = (item?.week?.trips || []).filter((x) => x.place === place && x.sec).sort((a, b) => a.sec - b.sec)[0];
    if (t) return Math.round(t.sec / 60);
    try { const s = api.planner.walkSec(home.id, place); return Number.isFinite(s) ? Math.round(s / 60) : undefined; } catch { return undefined; }
  }
  return rec[field];
}

const toBool = (v) => (typeof v === 'boolean' ? v : /^(yes|true)$/i.test(String(v)) ? true : /^(no|false)$/i.test(String(v)) ? false : v);
// true, false, or null when the listing does not say
export function evaluate(value, op, target) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') {
    const t = toBool(target);
    if (typeof t !== 'boolean') return null;
    return op === '!=' ? value !== t : value === t;
  }
  if (typeof value === 'number' || (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) && /^\d{4}-\d{2}-\d{2}$/.test(String(target)))) {
    const a = typeof value === 'number' ? value : Date.parse(value), b = typeof value === 'number' ? Number(target) : Date.parse(target);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { '=': a === b, '!=': a !== b, '<=': a <= b, '>=': a >= b, '<': a < b, '>': a > b }[op] ?? null;
  }
  const s = String(value).toLowerCase(), t = String(target ?? '').toLowerCase();
  if (op === 'contains') return s.includes(t);
  if (op === 'not_contains') return !s.includes(t);
  if (op === '=') return s === t;
  if (op === '!=') return s !== t;
  return null;
}

const show = (v) => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? String(v) : String(v));
// Check every requirement on one home: { yes: [{key,text}], no: [...], unknown: [label], met, asked }
export function checkRequirements(api, home, item, reqs) {
  const rec = listingRecord(api, home, item);
  const out = { yes: [], no: [], unknown: [], met: 0, asked: 0 };
  for (const r of reqs || []) {
    const v = fieldValue(api, rec, home, item, r.field);
    const ok = evaluate(v, r.op, r.value);
    if (ok === null) { out.unknown.push(r.label); continue; }
    out.asked++;
    const detail = typeof v === 'boolean' ? '' : ` (${show(v)}${/min_to/.test(r.field) ? ' min' : /sqft/.test(r.field) ? ' sq ft' : ''})`;
    if (ok) { out.met++; out.yes.push({ key: `r-${r.label}`, text: `${r.label}${detail}` }); } else out.no.push({ key: `r-${r.label}`, text: `${r.label}${detail}` });
  }
  return out;
}

// Check a requirement the model wrote before keeping it: a known field, a known op, a usable value.
export function validRequirement(r, api) {
  if (!r || typeof r !== 'object') return 'not a requirement';
  const label = String(r.label || '').trim().slice(0, 60);
  if (!label) return 'no label';
  if (!OPS.includes(r.op)) return `unknown comparison "${r.op}"`;
  const m = /^(walk_min_to|trip_min_to):([a-z0-9_]+)$/.exec(r.field || '');
  if (m) return api.data.placeById.has(m[2]) ? null : `unknown place "${m[2]}"`;
  if (!(r.field in FIELDS)) return `unknown field "${r.field}"`;
  if (r.value === undefined || r.value === null || r.value === '') return 'no value';
  return null;
}
