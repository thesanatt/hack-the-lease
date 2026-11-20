// Numbers for the pitch slides. Nothing here is typed in by hand: every figure is computed by the engine in
// this browser (campusExample, groupExample) or read from web/public/data/evidence/*.json (loadEvidence).
// Plain JS, no React, so `node` can run the same functions (see the check at the bottom of PitchView notes).
import { pickGroup, modalRoutine, candidateHouses, solveAllHouses } from '../group/logic.js';

export const DAY = 'tue';
export const DATE = '2026-12-01';
export const DATE_LABEL = 'Tue Dec 1 2026';
export const DEFAULT_HOME = 'h23';
export const CAMPUSES = [
  { id: 'ugli', campus: 'Central Campus' },
  { id: 'beyster', campus: 'North Campus' },
  { id: 'uh', campus: 'Medical Campus' },
];
export const TIMES = [
  { s: 14 * 3600, label: '2:00 PM' },
  { s: 23.5 * 3600, label: '11:30 PM' },
];

const minOf = (sec) => (Number.isFinite(sec) ? Math.round(sec / 60) : null);

// One home, three campus buildings, leaving campus at 2:00 PM and at 11:30 PM on the modeled Tuesday.
// Walk = walk-only minutes on OSM streets. Bus = door to door by TheRide or U-M bus with the walks at both
// ends, counted from the moment you leave the building, so the wait at the stop is included.
export function campusExample(api, homeId = DEFAULT_HOME) {
  const planner = api.planner;
  const placeById = api.data.placeById || new Map(api.data.places.map((p) => [p.id, p]));
  const rows = CAMPUSES.map((c) => ({ ...c, place: placeById.get(c.id)?.label || c.id, walk: null, bus: [] }));
  for (const t of TIMES) {
    rows.forEach((row) => {
      const res = planner.leaveAt(DAY, row.id, t.s, [homeId])?.get(homeId);
      if (row.walk == null && res?.walk) row.walk = minOf(res.walk.sec);
      row.bus.push(res?.transit ? minOf(res.transit.arrive - t.s) : null);
    });
  }
  const solar = api.mod?.('solar');
  const duskS = solar?.dusk ? solar.dusk(DATE, api.config) : null;
  return { homeId, home: api.data.homeById?.get(homeId) || api.data.homes.find((h) => h.id === homeId), rows, duskS };
}

// The demo group of five, as the Group tab solves it: each member's most likely week through every
// whole-house lease, then fair.solveHouse per house, ranked. Returns the top house and its split.
export async function groupExample(api) {
  const fair = api.mod('fair'), model = api.mod('model');
  if (!fair || !model || typeof api.weekFor !== 'function') return null;
  const members = pickGroup(api.data.personas).filter((m) => m.theta);
  const houses = candidateHouses(api.data.homes, members.length || 5);
  if (members.length < 2 || !houses.length) return null;
  const cfg = api.config;
  const ids = houses.map((h) => h.id);
  const weekByMember = new Map();
  for (const m of members) {
    const res = await Promise.resolve(api.weekFor(modalRoutine(m), ids, { cfg }));
    weekByMember.set(m.id, res instanceof Map ? res : new Map(Object.entries(res || {})));
    await new Promise((r) => setTimeout(r, 0));
  }
  const solved = solveAllHouses({ fair, houses, members, weekByMember, model, cfg, caps: {} });
  const top = solved.rows[0];
  if (!top?.res) return null;
  // Sensitivity: lower one member's private cap by $50 (Priya in the demo group) and solve again.
  let capMove = null;
  const who = members.find((m) => m.id === 'priya') || null;
  if (who && Number.isFinite(who.cap)) {
    const after = solveAllHouses({ fair, houses, members, weekByMember, model, cfg, caps: { [who.id]: who.cap - 50 } });
    const wasFeasibleThere = after.rows.find((r) => r.home.id === top.home.id)?.feasible;
    capMove = { name: who.name, delta: 50, topBefore: top.home, topAfter: after.rows[0]?.home, oldTopFeasible: !!wasFeasibleThere };
  }
  return {
    capMove,
    house: top.home,
    feasible: top.feasible,
    checked: top.check?.ok ?? top.check?.pass ?? null,
    split: members.map((m, i) => ({
      name: m.name, color: m.color,
      room: top.home.rooms[top.res.assignment[i]]?.label,
      price: top.res.prices[top.res.assignment[i]],
    })),
    houses: houses.length,
    ms: solved.totalMs,
  };
}

// Evidence files, read fresh. Missing files come back as null and the slide says "not run".
export const EVIDENCE_FILES = ['router', 'r5', 'lp', 'recovery'];
export async function loadEvidence(base = './data/evidence/') {
  const out = {};
  await Promise.all(EVIDENCE_FILES.map(async (k) => {
    try {
      const r = await fetch(`${base}${k}.json`, { cache: 'no-store' });
      out[k] = r.ok ? await r.json() : null;
    } catch { out[k] = null; }
  }));
  return out;
}

// Pull the few figures the evidence slide shows. Each value keeps the file and field it came from.
export function evidenceFigures(ev) {
  const f = {};
  const rt = ev.router;
  if (rt) {
    f.trips = { equal: rt.equal, total: rt.queries, date: rt.service_date, pass: rt.pass };
    if (rt.all_targets) f.arrivals = { equal: rt.all_targets.equal, total: rt.all_targets.stop_comparisons, pass: rt.all_targets.pass };
    f.msPerScan = rt.all_targets?.timing?.engine?.ms_per_scan ?? rt.timing?.engine?.ms_per_scan ?? null;
  }
  const r5 = ev.r5?.result;
  if (r5) {
    f.r5 = {
      pairs: r5.pairs, both: r5.both_reachable, median: r5.median_abs_error_min, within2: r5.share_within_2_min,
      onlyQuorum: r5.reachable_only_in_quorum, version: ev.r5.r5py_version,
    };
  }
  const lp = ev.lp;
  if (lp?.F1) {
    f.lp = {
      instances: lp.F1.instances, envyFree: lp.F1.envyFree, rentSumOk: lp.F1.rentSumOk, checkerOk: lp.F1.checkerOk,
      published: ['F4', 'F5', 'F6'].map((k) => ({ k, pass: !!lp[k]?.pass })),
      p50ms5: lp.F1.byN?.['5']?.p50ms ?? null,
    };
  }
  const rec = ev.recovery;
  if (rec?.comparisons) {
    const pick = (set, tau, vs) => rec.comparisons.find((c) => c.set === set && c.tauScale === tau && c.vs === vs);
    const main = pick('off-prior', 1, 'random');
    const vsRandom = rec.comparisons.filter((c) => c.vs === 'random');
    const vsFixedOff = rec.comparisons.filter((c) => c.vs === 'fixed' && c.set === 'off-prior');
    f.rec = {
      trials: rec.trials, picks: rec.picks,
      main: main && { diff: main.regretDiffMeanOverPicks, top1Bald: main.top1Bald, top1Random: main.top1Other },
      randomWins: vsRandom.filter((c) => c.verdict === 'bald lower regret').length, randomSettings: vsRandom.length,
      fixedOffLower: vsFixedOff.filter((c) => c.verdict === 'bald lower regret').length,
      fixedOffHigher: vsFixedOff.filter((c) => /higher/.test(c.verdict || '')).length, fixedOffSettings: vsFixedOff.length,
    };
  }
  return f;
}
