// Next semester compute: caching (settling never routes again), the cost matrix, campus shares and the sentence.
// Uses the real catalog, decide and prefs modules with a stand-in router so it runs in a second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as catalog from '../../../../engine/catalog.js';
import * as decide from '../../../../engine/decide.js';
import * as prefs from '../../../../engine/prefs.js';
import { CONFIG } from '../../../../engine/config.js';
import { runNextYear, costMatrix, campusShares, oddsKey, weekSignature, clearNextYearCache, regretByHome, bestRouting, NEXT_DEFAULT_PLAN } from './compute.js';
import { findOutSentence, money } from './format.js';

const places = JSON.parse(readFileSync(new URL('../../../public/data/places.json', import.meta.url), 'utf8'));
const placeById = new Map(places.map((p) => [p.id, p]));

const CSV = [
  'Term,Session,Acad Group,Class Nbr,Subject,Catalog Nbr,Section,Course Title,Component,Codes,M,T,W,TH,F,S,SU,Start Date,End Date,Time,Location,Instructor,Units',
  'Sample,Regular,ENG,1,EECS,482,001,Operating Systems,LEC,,M,,W,,,,,,,10-1130AM,1670 BBB,Sample,4',
  'Sample,Regular,ENG,2,EECS,482,002,Operating Systems,LEC,,M,,W,,,,,,,10-1130AM,1800 CHEM,Sample,4',
].join('\n');

const room = (id, asking) => ({ id, label: 'Room', sqft: 140, bath: 'shared', light: 1, floor: '1', asking });
const homes = [
  { id: 'hn', name: 'North home', rent: 900, utilities: 0, rooms: [room('hn1', 900)] },
  { id: 'hc', name: 'Central home', rent: 900, utilities: 0, rooms: [room('hc1', 900)] },
];

const plan = {
  id: 't', name: 'Test plan', personaId: 'p1',
  courses: [{ id: 'os', course: 'EECS 482', components: ['LEC'] }],
  choices: [],
  maybes: [{ id: 'job', label: 'Research lab job', odds: 0.5, days: ['tue'], place: 'fmcrb', start: '13:00', end: '17:00' }],
  fixed: [],
};

// Stand-in router: a home pays 60 minutes a week for each meeting on the other campus.
function makeApi() {
  const calls = { n: 0 };
  const area = (pid) => placeById.get(pid)?.area;
  const api = {
    version: 0, config: CONFIG,
    data: { homes, places, placeById, homeById: new Map(homes.map((h) => [h.id, h])), personas: [{ id: 'p1', modes: { bike: false, maxWalkMin: 20 } }] },
    mod: (n) => ({ catalog, decide, prefs }[n] || null),
    weekFor(routine, homeIds) {
      calls.n++;
      const out = new Map();
      for (const id of homeIds) {
        const far = routine.week.filter((e) => (id === 'hn' ? area(e.place) !== 'North' : area(e.place) === 'North')).length;
        // two trips per meeting day (there and back), so the routing count is easy to check
        const trips = routine.week.flatMap((e) => (e.days || []).flatMap(() => [{}, {}]));
        out.set(id, { homeId: id, rideMin: 60 * far, walkMin: 0, waitMin: 0, bikeMin: 0, slackMin: 0, stranded: [], trips });
      }
      return out;
    },
  };
  return { api, calls };
}

test('runNextYear routes each distinct week once and settling only filters', async () => {
  clearNextYearCache();
  const { api, calls } = makeApi();
  const sections = catalog.parseCatalogCSV(CSV, places).sections;
  assert.equal(sections.filter((s) => s.place).length, 2);
  const res = await runNextYear(api, { plan, sections, k: 40, seed: 3 });
  assert.equal(res.scenarios.length, 40);
  // two lecture sections times lab job yes or no: at most four distinct weeks
  assert.ok(calls.n <= 4, `routed ${calls.n} weeks`);
  assert.ok(res.voi.evpi.value >= 0);
  for (const f of res.voi.byFactor) assert.ok(f.value <= res.voi.evpi.value + 1e-6);
  assert.ok(res.safest && res.homeById.has(res.safest.homeId));
  assert.equal(res.costs.K, 40);
  assert.equal(res.factors.length, 2);

  const routed = calls.n;
  const lec = res.factors.find((f) => f.kind === 'section');
  const north = lec.options.find((o) => /North/.test(o.label) || o.campus === 'North');
  assert.ok(north, 'a North Campus lecture option');
  const settled = await runNextYear(api, { plan, sections, k: 40, seed: 3, settled: { [lec.id]: north.id } });
  assert.equal(calls.n, routed, 'settling must not route again');
  assert.ok(settled.scenarios.length > 0 && settled.scenarios.length < 40);
  assert.ok(settled.scenarios.every((s) => s.attrs[lec.id] === north.id));
  assert.equal(settled.safest.homeId, 'hn');
  assert.ok(!settled.voi.byFactor.some((f) => f.id === lec.id), 'a settled unknown has no bar');

  // odds change: new draw, same distinct weeks, so nothing new to route
  await runNextYear(api, { plan, sections, k: 40, seed: 3, odds: { job: 0.9 } });
  assert.equal(calls.n, routed);
});

test('routing counts only weeks routed in this run, and reports the original cost when all are cached', async () => {
  clearNextYearCache();
  assert.equal(bestRouting(), null);
  const { api, calls } = makeApi();
  const sections = catalog.parseCatalogCSV(CSV, places).sections;
  const res = await runNextYear(api, { plan, sections, k: 40, seed: 3 });
  // every distinct week through both homes: two trips per meeting day
  let want = 0;
  const seen = new Set();
  for (const s of res.scenarios) {
    const sig = weekSignature(s.week, s.modes || api.data.personas[0].modes);
    if (seen.has(sig)) continue;
    seen.add(sig);
    want += 2 * homes.length * s.week.reduce((a, e) => a + (e.days?.length || 0), 0);
  }
  assert.equal(res.routing.weeks, calls.n);
  assert.equal(res.routing.trips, want);
  assert.equal(res.routing.cached, false);
  assert.ok(res.routing.ms >= 0);
  assert.deepEqual(bestRouting(), res.routing);

  // settling keeps the run's routing
  const lec = res.factors.find((f) => f.kind === 'section');
  const settled = await runNextYear(api, { plan, sections, k: 40, seed: 3, settled: { [lec.id]: lec.options[0].id } });
  assert.deepEqual(settled.routing, res.routing);

  // a new draw over the same distinct weeks routes nothing new: the cost of routing those weeks, marked cached
  const again = await runNextYear(api, { plan, sections, k: 40, seed: 3, odds: { job: 0.9 } });
  assert.equal(again.routing.cached, true);
  assert.ok(again.routing.trips > 0 && again.routing.trips <= res.routing.trips);
  assert.equal(bestRouting().trips, res.routing.trips);
});

test('settling to an option with no weeks returns an empty result, not a crash', async () => {
  clearNextYearCache();
  const { api } = makeApi();
  const sections = catalog.parseCatalogCSV(CSV, places).sections;
  const res = await runNextYear(api, { plan, sections, k: 20, seed: 1, settled: { job: 'nope' } });
  assert.equal(res.empty, true);
  assert.equal(res.scenarios.length, 0);
});

test('costMatrix is minus the mean over value draws', () => {
  // M = 2 draws, K = 2 scenarios, H = 2 homes
  const U = Float64Array.from([-10, -20, -30, -40, -12, -22, -32, -42]);
  const c = costMatrix({ U, M: 2, K: 2, H: 2, homeIds: ['a', 'b'] });
  assert.deepEqual(Array.from(c.cost), [11, 21, 31, 41]);
});

test('campusShares counts class hours by area and leaves out maybes and fixed entries', () => {
  const scen = [{ week: [
    { id: 'a', label: 'A', days: ['mon', 'wed'], place: 'beyster', start: '10:00', end: '11:30' },
    { id: 'b', label: 'B', days: ['tue'], place: 'chem', start: '09:00', end: '12:00' },
    { id: 'job', label: 'Research lab job', days: ['tue'], place: 'fmcrb', start: '13:00', end: '17:00' },
  ] }];
  const out = campusShares(scen, plan, placeById);
  assert.equal(out.length, 2);
  assert.equal(out[0].share, 0.5);
  assert.equal(out.reduce((a, b) => a + b.share, 0), 1);
});

test('keys are stable', () => {
  assert.equal(oddsKey({ b: 0.4, a: 0.25 }), oddsKey({ a: 0.25, b: 0.4 }));
  const w1 = [{ days: ['mon'], place: 'x', start: '10:00', end: '11:00' }, { days: ['tue'], place: 'y', start: '9:00', end: '10:00' }];
  assert.equal(weekSignature(w1, {}), weekSignature([...w1].reverse(), {}));
});

test('the find-out sentence is plain', () => {
  assert.equal(findOutSentence({ label: 'Research lab job', kind: 'maybe', value: 27.4 }),
    'Find out about the research lab job before you sign: it is worth $27 a month.');
  assert.equal(findOutSentence({ label: 'Which elective', kind: 'choice', value: 12 }),
    'Decide which elective before you sign: it is worth $12 a month.');
  assert.match(findOutSentence({ label: 'x', kind: 'maybe', value: 0.2 }), /^Nothing left/);
  assert.equal(money(1234.4), '$1,234');
});

test('the Details regret of the top home equals the price (EVPI)', async () => {
  clearNextYearCache();
  const { api } = makeApi();
  const sections = catalog.parseCatalogCSV(CSV, places).sections;
  const res = await runNextYear(api, { plan, sections, k: 40, seed: 3 });
  const reg = regretByHome(res.costs);
  assert.ok(Math.abs(reg.get(res.rank[0].homeId) - res.voi.evpi.value) < 1e-6);
  for (const r of res.rank) assert.ok(reg.get(r.homeId) >= reg.get(res.rank[0].homeId) - 1e-9);
  // by hand: 2 scenarios, 2 homes; best per week 10 and 5, so a: (10 + 9 - 15) / 2 = 2, b: (12 + 5 - 15) / 2 = 1
  const m = regretByHome({ cost: Float64Array.from([10, 12, 9, 5]), K: 2, H: 2, homeIds: ['a', 'b'] });
  assert.equal(m.get('a'), 2);
  assert.equal(m.get('b'), 1);
});

test('the tab and the pitch open on a plan that is in the sample', () => {
  const plans = JSON.parse(readFileSync(new URL('../../../public/data/plans_sample.json', import.meta.url), 'utf8')).plans;
  assert.ok(plans.some((p) => p.id === NEXT_DEFAULT_PLAN));
});
