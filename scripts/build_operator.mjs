// Precompute the Operator view: per-room envy-free rents for every multi-room home in homes.json over a
// SYNTHETIC population, plus a default renovation (private bath for the room without one, else one more
// window level) and the prior medians that drive the numbers. Writes web/public/data/operator.json.
//
//   node scripts/build_operator.mjs [--homes path] [--out path] [--n 2000] [--groups 200] [--seed 11]
//
// The browser rebuilds the same groups with operator.makePopulation({ n, seed }) and groupsFor({ home, population })
// for live renovation and slider changes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const homesPath = path.resolve(arg('homes', path.join(ROOT, 'web/public/data/homes.json')));
const outPath = path.resolve(arg('out', path.join(ROOT, 'web/public/data/operator.json')));

const need = [path.join(ROOT, 'engine/fair.js'), path.join(ROOT, 'engine/simplex.js'), homesPath].filter((p) => !existsSync(p));
if (need.length) {
  console.log(`build_operator: not run, missing ${need.map((p) => path.relative(ROOT, p)).join(', ')}`);
  process.exit(0);
}

const { CONFIG } = await import('../engine/config.js');
const { makePopulation, groupsFor, roomPricing, SYNTHETIC } = await import('../engine/operator.js');
const { roomFeatures } = await import('../engine/model.js');

const N = Number(arg('n', CONFIG.population));
const G = Number(arg('groups', CONFIG.operatorGroups));
const SEED = Number(arg('seed', 11));
const cfg = { ...CONFIG, operatorGroups: G };

const raw = JSON.parse(readFileSync(homesPath, 'utf8').replace(/^\uFEFF/, ''));
const homes = Array.isArray(raw) ? raw : raw.homes;

const t0 = performance.now();
const population = makePopulation({ n: N, seed: SEED, cfg });
const tPop = performance.now() - t0;

// Default renovation: add a private bath to the room with the least bath, else add a window level to the darkest.
function defaultRenovation(home) {
  const f = home.rooms.map((r) => roomFeatures(r));
  const minBath = Math.min(...f.map((x) => x.bath));
  if (minBath < 1) {
    const j = f.findIndex((x) => x.bath === minBath);
    return { roomId: home.rooms[j].id, bath: 'private', text: `Add a private bath to ${home.rooms[j].label ?? home.rooms[j].id}` };
  }
  const minLight = Math.min(...home.rooms.map((r) => r.light ?? 1));
  if (minLight < 2) {
    const j = home.rooms.findIndex((r) => (r.light ?? 1) === minLight);
    return { roomId: home.rooms[j].id, light: minLight + 1, text: `Add a window level to ${home.rooms[j].label ?? home.rooms[j].id}` };
  }
  return null;
}

const share = (f) => population.students.filter(f).length / population.students.length;
const out = {
  label: `${SYNTHETIC}: preference-based rents for a synthetic student population, not market rents`,
  method: 'For each home, groups of synthetic students (one per room) are drawn; each member values rooms by their own theta; '
    + 'fair.solveHouse finds the envy-free maximin split of the whole-house rent; rooms report p10, p50 and p90 across groups.',
  assumptions: 'Campus, job, late study and gym are drawn independently from the stated shares (no joint table). '
    + 'Room weights come from the model prior. Commute is the same for every room of a house, so it does not move room rents.',
  population: {
    n: N, seed: SEED, groupsPerHome: G, marginals: population.marginals,
    observed: {
      campus: Object.fromEntries(Object.keys(population.marginals.campus).map((k) => [k, share((s) => s.archetype.campus === k)])),
      job: Object.fromEntries(Object.keys(population.marginals.job).map((k) => [k, share((s) => s.archetype.job === k)])),
      lateStudy: share((s) => s.archetype.lateStudy),
      gym: share((s) => s.archetype.gym),
      bike: share((s) => s.archetype.bike),
    },
    priorMedians: Object.fromEntries(Object.entries(population.prior).map(([k, v]) => [k, v.median])),
  },
  homes: [],
  timings: {},
};

const tH = performance.now();
for (const home of homes) {
  if (!home.rooms || home.rooms.length < 2) continue;
  const h0 = performance.now();
  const groups = groupsFor({ home, population, cfg });
  const reno = defaultRenovation(home);
  const { text, ...renovation } = reno ?? {};
  const r = roomPricing({ home, groups, renovation: reno ? renovation : null, cfg, prior: population.prior });
  out.homes.push({
    homeId: home.id, name: home.name ?? home.id, area: home.area ?? null, kind: home.kind ?? null,
    rent: home.rent, utilities: home.utilities ?? 0, nRooms: home.rooms.length,
    rooms: r.rooms.map((x) => ({ ...x, p10: Math.round(x.p10), p50: Math.round(x.p50), p90: Math.round(x.p90) })),
    askingTotal: home.rooms.reduce((a, x) => a + (x.asking ?? 0), 0),
    feasibleShare: r.feasibleShare, negativeShare: r.negativeShare, groups: r.groups,
    renovation: reno ? { ...renovation, text, roomP50: Math.round(r.renovationDelta.roomP50), headroom: Math.round(r.renovationDelta.headroom),
      after: r.after.map((x) => ({ roomId: x.roomId, p50: Math.round(x.p50) })) } : null,
    priorMedians: r.priorMedians,
    ms: Math.round(performance.now() - h0),
  });
}
out.timings = { populationMs: Math.round(tPop), pricingMs: Math.round(performance.now() - tH), homes: out.homes.length };

// Demand map: needs week.js and the real timetable. Each synthetic student's week is evaluated at every home.
if (existsSync(path.join(ROOT, 'engine/week.js')) && !process.argv.includes('--no-demand')) {
  const { demandMap } = await import('../engine/operator.js');
  const { evaluateWeek } = await import('../engine/week.js');
  const { loadAll } = await import('../engine/load.js');
  const { nodeGetter } = await import('../engine/node-load.js');
  const d0 = performance.now();
  const { planner, places } = await loadAll(nodeGetter());
  for (const p of places) planner.addPoint(p.id, p.lat, p.lon);
  for (const h of homes) planner.addPoint(h.id, h.lat, h.lon);
  const d1 = performance.now();
  const homeIds = homes.map((h) => h.id);
  const nd = Math.min(Number(arg('demand-n', N)), population.students.length);
  const weeksByStudent = new Map();
  for (const s of population.students.slice(0, nd)) weeksByStudent.set(s.id, evaluateWeek(planner, s.routine, homeIds, { cfg }));
  const d2 = performance.now();
  const dm = demandMap({ homes, population, weeksByStudent, cfg });
  out.demand = {
    label: `${SYNTHETIC}: where each kind of synthetic student week fits; not a demand forecast`,
    students: dm.students,
    homes: dm.homes.map((x) => ({ ...x, top3Share: +x.top3Share.toFixed(4), firstShare: +x.firstShare.toFixed(4), fitPremium: x.fitPremium === null ? null : Math.round(x.fitPremium) })),
  };
  out.timings.demandLoadMs = Math.round(d1 - d0);
  out.timings.demandWeeksMs = Math.round(d2 - d1);
  out.timings.demandMapMs = Math.round(performance.now() - d2);
  console.log(`build_operator: demand map over ${dm.students} students; load ${out.timings.demandLoadMs} ms, weeks ${out.timings.demandWeeksMs} ms, map ${out.timings.demandMapMs} ms`);
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`build_operator: ${out.homes.length} homes, ${N} synthetic students, ${G} groups per home; population ${out.timings.populationMs} ms, pricing ${out.timings.pricingMs} ms -> ${path.relative(ROOT, outPath)}`);
