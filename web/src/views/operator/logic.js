// Operator logic, plain JS (Node tests and browser). Per-room envy-free rents for typical SYNTHETIC groups:
// draw G groups of n students from the prior, solve the envy-free maximin LP at the house rent (caps off,
// commute off, as SYSTEM_DESIGN 3.6), and report each room's p10, p50, p90 across groups.

const BATH_ORDER = { shared: 0, half: 1, private: 2 };

export function irregularity(home) {
  const r = home.rooms || [];
  if (!r.length) return 0;
  const distinct = (f) => new Set(r.map(f)).size;
  const sq = r.map((x) => x.sqft);
  return distinct((x) => x.bath) + distinct((x) => x.floor) + distinct((x) => x.light) + (Math.max(...sq) - Math.min(...sq)) / 50;
}

export function pickIrregular(homes, preferId = null) {
  const houses = (homes || []).filter((h) => h.kind === 'house' && (h.rooms || []).length >= 3);
  const pool = houses.length ? houses : (homes || []).filter((h) => (h.rooms || []).length >= 2);
  if (preferId) {
    const hit = pool.find((h) => h.id === preferId);
    if (hit) return hit;
  }
  return [...pool].sort((a, b) => irregularity(b) - irregularity(a))[0] || null;
}

// Same seed for every slider position: common random numbers, so a change in a median moves every draw the same way.
export function drawGroups({ model, prior, n, G, r }) {
  const groups = [];
  for (let g = 0; g < G; g++) {
    const grp = [];
    for (let i = 0; i < n; i++) grp.push(model.samplePrior(r, prior));
    groups.push(grp);
  }
  return groups;
}

export function renovate(home, roomIndex, bath = 'half') {
  return { ...home, rooms: home.rooms.map((room, j) => (j === roomIndex ? { ...room, bath } : room)) };
}

export function canAddHalfBath(room) {
  return (BATH_ORDER[room.bath] ?? 0) < BATH_ORDER.half;
}

function q(sorted, p) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Returns { rooms: [{p10, p50, p90}], headroomP50, solved, failed, negative, ms }.
// headroom per group = sum_i v_i,sigma(i) - R on raw values; only its change under a renovation is meaningful.
export function roomPricingLocal({ fair, model, home, groups, cfg }) {
  const t0 = now();
  const nRooms = home.rooms.length;
  const per = Array.from({ length: nRooms }, () => []);
  const head = [];
  let failed = 0, negative = 0;
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const problem = {
      rent: home.rent,
      utilities: home.utilities ?? 0,
      rooms: home.rooms,
      members: grp.map((theta, i) => ({ id: `s${g}-${i}`, values: home.rooms.map((room) => model.roomValue(theta, room)), cap: null, commute: 0 })),
    };
    let res = null;
    try { res = fair.solveHouse(problem, { normalize: true, compensateCommute: false, nonneg: cfg?.nonnegRents !== false, cfg }); } catch { res = null; }
    if (!res || !Array.isArray(res.prices) || res.prices.some((x) => !Number.isFinite(x))) { failed++; continue; }
    if (res.negativePrice) negative++;
    for (let j = 0; j < nRooms; j++) per[j].push(res.prices[j]);
    let s = 0;
    for (let i = 0; i < grp.length; i++) s += problem.members[i].values[res.assignment[i]];
    head.push(s - home.rent);
  }
  const rooms = per.map((xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return { p10: q(s, 0.1), p50: q(s, 0.5), p90: q(s, 0.9) };
  });
  const hs = [...head].sort((a, b) => a - b);
  return { rooms, headroomP50: q(hs, 0.5), solved: groups.length - failed, failed, negative, ms: now() - t0 };
}

export function renovationDelta(base, after, roomIndex) {
  return {
    roomP50: after.rooms[roomIndex].p50 - base.rooms[roomIndex].p50,
    headroom: after.headroomP50 - base.headroomP50,
  };
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
