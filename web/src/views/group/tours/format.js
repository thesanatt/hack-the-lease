// Plain-words formatting for the "Tour it together" panel. Pure functions, tested in format.test.mjs.

export const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const DAY_LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export function clock12(sec) {
  if (!Number.isFinite(sec)) return '';
  const h = Math.floor(sec / 3600) % 24, m = Math.floor((sec % 3600) / 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// "bus DD" | "walk" | "bike"
export function howOf(t) {
  if (!t) return '';
  return t.mode === 'bus' && t.routes?.length ? `bus ${t.routes.join(' then ')}` : t.mode;
}

// One line per member: "Bus DD, 24 min from EECS Building (leaves 4:33 pm); then walk, 9 min to Choir"
export function memberLine(r, placeName) {
  const how = howOf(r.to);
  let line = `${how[0].toUpperCase()}${how.slice(1)}, ${r.to.min} min from ${placeName(r.origin)}`;
  if (r.originKind === 'usual') line += ' (usual place, free day)';
  else if (r.originKind === 'first') line += ' (first stop that day)';
  line += `, leaves ${clock12(r.to.depart)}`;
  if (r.back) {
    line += `; then ${howOf(r.back)}, ${r.back.min} min to ${r.back.nextLabel || placeName(r.back.to)}`;
    if (Number.isFinite(r.back.bufferMin) && r.back.bufferMin < 10) line += `, ${r.back.bufferMin} min to spare`;
  }
  return line;
}

// Why a weekday has no slot, from findTourSlots byDay. names: id -> display name.
export function dayReason(stat, names, n) {
  if (!stat) return '';
  if (stat.feasible > 0) return `${stat.feasible} of ${stat.slots} half-hours work for all ${n}.`;
  if (stat.free === 0) {
    const busiest = Object.entries(stat.busy || {}).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    return `No half-hour when all ${n} are free.${busiest.length ? ` Busiest: ${busiest.slice(0, 2).map(([id]) => names[id] || id).join(' and ')}.` : ''}`;
  }
  const late = Object.entries(stat.cannotReach || {}).filter(([, c]) => c > 0).map(([id]) => names[id] || id);
  const half = stat.free === 1 ? 'half-hour' : 'half-hours';
  return `All ${n} are free for ${stat.free} ${half}, but ${late.length ? late.join(' and ') : 'someone'} cannot get there and back in time.`;
}
