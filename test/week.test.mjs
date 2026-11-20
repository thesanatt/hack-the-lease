// week.js and solar.js: darkness, stranded trips, home breaks, mode choice, caching, scenario weeks, timing.
// Homes are SAMPLE points (not listings); the routine is a SAMPLE week shaped like the Jordan persona.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
import { CONFIG, withOverrides } from '../engine/config.js';
import { rng } from '../engine/rng.js';
import { evaluateWeek, sampleWeeks, clearWeekCache, weekCacheStats, parseHM, fmtHM, dusk, dawn, sunset } from '../engine/week.js';
import { utcOffsetHours, sunrise } from '../engine/solar.js';

const HOMES = {
  northwood: [42.2990, -83.7150],
  kerrytown: [42.2846, -83.7457],
  southu: [42.2740, -83.7330],
  packard: [42.2660, -83.7330],
  oldwest: [42.2780, -83.7600],
  medical: [42.2830, -83.7300],
};
const HOME_IDS = Object.keys(HOMES);

// SAMPLE: a North Campus engineer with a late lab (golden-path shape of persona "jordan").
const JORDAN = {
  id: 'jordan',
  modes: { bike: false, maxWalkMin: 25, lateHour: '22:00', maxLateWalkMin: 12 },
  week: [
    { id: 'e1', label: 'EECS 482', days: ['mon', 'wed', 'fri'], place: 'eecs', start: '10:30', end: '12:00' },
    { id: 'e2', label: 'Design lecture', days: ['mon', 'wed', 'fri'], place: 'beyster', start: '13:30', end: '15:00' },
    { id: 'e3', label: 'Robotics lab', days: ['tue', 'thu'], place: 'fmcrb', start: '18:00', end: '22:30' },
    { id: 'e4', label: 'Project night', days: ['wed'], place: 'dude', start: '19:00', end: '23:00' },
    { id: 'e5', label: 'Gym', days: ['sat'], place: 'ncrb', start: '11:00', end: '12:30' },
    { id: 'e6', label: 'Study', days: ['sun'], place: 'ugli', start: '14:00', end: '18:00' },
    { id: 'e7', label: 'Club meeting', days: ['fri'], place: 'union', start: '17:00', end: '18:30' },
  ],
};

let planner, places;
before(async () => {
  ({ planner, places } = await loadAll(nodeGetter()));
  for (const [id, [lat, lon]] of Object.entries(HOMES)) planner.addPoint(id, lat, lon);
  for (const p of places) planner.addPoint(p.id, p.lat, p.lon);
});

const allFinite = (R) => {
  for (const k of ['weeklyMin', 'walkMin', 'bikeMin', 'rideMin', 'waitMin', 'slackMin', 'genMin', 'darkWalkMin', 'darkBikeMin', 'darkLongWaitMin']) {
    assert.ok(Number.isFinite(R[k]) && R[k] >= 0, `${R.homeId}.${k} = ${R[k]}`);
  }
  for (const v of Object.values(R.darkByDate)) assert.ok(Number.isFinite(v) && v >= 0);
};

test('solar: civil dusk on Dec 1 2026 and Sep 15 2026 (section 5.4)', () => {
  const ss = sunset('2026-12-01'), dk = dusk('2026-12-01');
  assert.ok(ss >= parseHM('16:50') && ss <= parseHM('17:15'), `sunset ${fmtHM(ss)}`);
  const gap = (dk - ss) / 60;
  assert.ok(gap >= 25 && gap <= 40, `dusk - sunset = ${gap} min`);
  assert.ok(dusk('2026-09-15') > parseHM('19:45'), `Sep 15 dusk ${fmtHM(dusk('2026-09-15'))}`);
  assert.ok(dawn('2026-12-01') < sunrise('2026-12-01'));
  console.log(`  Dec 1 2026: dawn ${fmtHM(dawn('2026-12-01'))} sunrise ${fmtHM(sunrise('2026-12-01'))} sunset ${fmtHM(ss)} dusk ${fmtHM(dk)}; Sep 15 dusk ${fmtHM(dusk('2026-09-15'))}`);
});

test('solar: local clock is EDT before Nov 1 2026 and from Mar 14 2027, EST between', () => {
  assert.equal(utcOffsetHours('2026-09-15'), -4);
  assert.equal(utcOffsetHours('2026-10-31'), -4);
  assert.equal(utcOffsetHours('2026-11-01'), -5);
  assert.equal(utcOffsetHours('2026-12-01'), -5);
  assert.equal(utcOffsetHours('2027-02-15'), -5);
  assert.equal(utcOffsetHours('2027-03-13'), -5);
  assert.equal(utcOffsetHours('2027-03-14'), -4);
  // the DST switch moves clock sunset back about an hour overnight
  const jump = (sunset('2026-10-31') - sunset('2026-11-01')) / 60;
  assert.ok(jump > 55 && jump < 65, `jump ${jump}`);
});

test('golden path: SAMPLE Jordan week over 6 SAMPLE homes', () => {
  const res = evaluateWeek(planner, JORDAN, HOME_IDS, { places });
  assert.equal(res.size, 6);
  for (const R of res.values()) {
    allFinite(R);
    assert.ok(R.trips.length >= 18, `${R.homeId} trips ${R.trips.length}`);
    assert.ok(Math.abs(R.genMin - R.trips.reduce((s, t) => s + t.genMin, 0)) < 1e-6);
    for (const t of R.trips) {
      if (t.mode === null) continue;
      if (t.kind === 'arriveBy') assert.ok(t.arrive <= t.timeS + 1e-9, `${R.homeId} ${t.day} ${t.label} late`);
      else assert.ok(t.depart >= t.timeS - 1e-9);
      assert.ok(t.sec >= 0 && Number.isFinite(t.darkMin));
    }
  }
  // the North Campus home has the shortest week for a North Campus routine
  const nw = res.get('northwood'), ow = res.get('oldwest');
  for (const R of res.values()) assert.ok(nw.genMin <= R.genMin + 1e-9, `northwood ${nw.genMin} vs ${R.homeId} ${R.genMin}`);
  assert.ok(ow.genMin > nw.genMin);
  // the late lab ends after dusk on every term date, so every home has some dark minutes
  for (const R of res.values()) assert.ok(R.darkWalkMin + R.darkLongWaitMin > 0, R.homeId);
  console.log('  home        genMin  weekMin  walk  ride  wait slack  dark  stranded');
  for (const R of res.values()) {
    console.log(`  ${R.homeId.padEnd(10)} ${R.genMin.toFixed(0).padStart(7)} ${R.weeklyMin.toFixed(0).padStart(8)} ${R.walkMin.toFixed(0).padStart(5)} ${R.rideMin.toFixed(0).padStart(5)} ${R.waitMin.toFixed(0).padStart(5)} ${R.slackMin.toFixed(0).padStart(5)} ${(R.darkWalkMin + R.darkLongWaitMin).toFixed(0).padStart(5)} ${String(R.stranded.length).padStart(9)}`);
  }
});

test('darkness monotonicity: Sep 15 never has more dark minutes than Dec 1', () => {
  const dec = evaluateWeek(planner, JORDAN, HOME_IDS, { places, dates: [{ date: '2026-12-01', w: 1 }] });
  const sep = evaluateWeek(planner, JORDAN, HOME_IDS, { places, dates: [{ date: '2026-09-15', w: 1 }] });
  let strict = 0;
  for (const h of HOME_IDS) {
    const a = dec.get(h), b = sep.get(h);
    for (const k of ['darkWalkMin', 'darkBikeMin', 'darkLongWaitMin']) assert.ok(b[k] <= a[k] + 1e-9, `${h} ${k}`);
    if (b.darkWalkMin < a.darkWalkMin) strict++;
    assert.equal(a.genMin, b.genMin, 'dates change only darkness tagging, not routing');
  }
  assert.ok(strict > 0, 'the 18:00 lab trips are dark in December and light in September');
  // term average lies between the extremes
  const avg = evaluateWeek(planner, JORDAN, HOME_IDS, { places });
  for (const h of HOME_IDS) {
    const v = avg.get(h).darkWalkMin;
    assert.ok(v >= sep.get(h).darkWalkMin - 1e-9 && v <= dec.get(h).darkWalkMin + 1e-9);
    assert.deepEqual(Object.keys(avg.get(h).darkByDate), CONFIG.termDates.map((d) => d.date));
  }
});

test('stranded: a trip after the last bus with a walk above the late cap is stranded', () => {
  const routine = {
    modes: { bike: false, maxWalkMin: 25, lateHour: '22:00', maxLateWalkMin: 12 },
    week: [{ id: 'x', label: 'Late lab', days: ['sun'], place: 'beyster', start: '20:00', end: '23:00' }],
  };
  // precondition from the timetable: no ride from Beyster to the Old West Side at Sun 23:00
  const raw = planner.leaveAt('sun', 'beyster', parseHM('23:00'), ['oldwest']).get('oldwest');
  assert.equal(raw.transit, null);
  assert.ok(raw.walk.sec / 60 > 12);
  const res = evaluateWeek(planner, routine, ['oldwest', 'northwood'], { places });
  const ow = res.get('oldwest');
  const s = ow.stranded.find((x) => x.day === 'sun' && x.kind === 'leaveAt');
  assert.ok(s, 'late trip home is stranded');
  assert.equal(s.time, '23:00');
  assert.equal(s.capMin, 12);
  assert.equal(s.bestOption.mode, 'walk');
  assert.ok(s.needed > 12);
  const trip = ow.trips.find((t) => t.leg === 'toHome');
  assert.equal(trip.stranded, true);
  assert.ok(trip.genMin >= CONFIG.mWalk * s.needed - 1e-6, 'stranded trip is still costed');
  // Northwood is a short walk from Beyster: not stranded
  assert.equal(res.get('northwood').stranded.length, 0);
  // with a bike nothing is stranded
  const bike = evaluateWeek(planner, { ...routine, modes: { ...routine.modes, bike: true } }, ['oldwest'], { places });
  assert.equal(bike.get('oldwest').stranded.length, 0);
  assert.equal(bike.get('oldwest').trips.find((t) => t.leg === 'toHome').mode, 'bike');
  assert.ok(bike.get('oldwest').darkBikeMin > 0);
});

test('home break: taken when the gap is long and the round trip fits, else entry to entry', () => {
  const routine = {
    modes: { bike: false, maxWalkMin: 25, lateHour: '22:00', maxLateWalkMin: 12 },
    week: [
      { id: 'a', label: 'Morning class', days: ['tue'], place: 'eecs', start: '09:00', end: '10:00' },
      { id: 'b', label: 'Evening class', days: ['tue'], place: 'beyster', start: '16:00', end: '17:00' },
    ],
  };
  const res = evaluateWeek(planner, routine, ['northwood'], { places });
  const legs = res.get('northwood').trips.map((t) => t.leg);
  assert.deepEqual(legs, ['toFirst', 'breakHome', 'breakBack', 'toHome']);
  const noBreak = evaluateWeek(planner, routine, ['northwood'], { places, homeBreakMin: 600 });
  assert.deepEqual(noBreak.get('northwood').trips.map((t) => t.leg), ['toFirst', 'between', 'toHome']);
  // a short gap never triggers a break
  const short = { ...routine, week: [routine.week[0], { ...routine.week[1], start: '11:00', end: '12:00' }] };
  assert.deepEqual(evaluateWeek(planner, short, ['northwood'], { places }).get('northwood').trips.map((t) => t.leg),
    ['toFirst', 'between', 'toHome']);
});

test('mode choice by generalized minutes: a lighter walk weight never removes walking from a trip', () => {
  const homes = ['kerrytown', 'southu', 'packard', 'oldwest', 'medical'];
  const base = evaluateWeek(planner, JORDAN, homes, { places });
  const light = evaluateWeek(planner, JORDAN, homes, { places, cfg: withOverrides({ mWalk: 0.3 }) });
  let changed = 0;
  for (const h of homes) {
    const a = base.get(h).trips.filter((t) => t.leg === 'toFirst' || t.leg === 'toHome');
    const b = light.get(h).trips.filter((t) => t.leg === 'toFirst' || t.leg === 'toHome');
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.ok(b[i].walkMin >= a[i].walkMin - 1e-9, `${h} ${a[i].day} ${a[i].label}`);
      if (b[i].mode !== a[i].mode) changed++;
      // caps still bind whatever the weight; they apply to each walking leg (CONTRACTS)
      const cap = b[i].arrive > parseHM('22:00') ? 12 : 25;
      if (!b[i].stranded) assert.ok(b[i].longestWalkMin <= cap + 1e-9, `${h} ${b[i].day} longest walk ${b[i].longestWalkMin}`);
    }
  }
  assert.ok(changed > 0, 'some transit trips switch to walking when walking weighs 0.3x');
});

test('transit trips match planner.breakdown and carry route names', () => {
  const res = evaluateWeek(planner, JORDAN, ['southu'], { places });
  const t = res.get('southu').trips.find((x) => x.mode === 'transit' && x.kind === 'arriveBy');
  assert.ok(t, 'a transit arrive-by trip exists');
  const r = planner.arriveBy(t.day, t.to, t.timeS, ['southu']).get('southu');
  if (typeof planner.breakdown === 'function') {
    const b = planner.breakdown(r.transit, 'southu');
    assert.ok(Math.abs(b.walkSec / 60 - t.walkMin) < 1e-9);
    assert.ok(Math.abs(b.rideSec / 60 - t.rideMin) < 1e-9);
    assert.ok(Math.abs(b.waitSec / 60 - t.waitMin) < 1e-9);
    assert.ok(Math.abs(b.slackSec / 60 - t.slackMin) < 1e-9);
  }
  assert.ok(t.routes.length >= 1 && t.rides.length === t.routes.length);
  assert.ok(Math.abs(t.arrive + t.slackMin * 60 - t.timeS) < 1e-6);
});

test('cache: one scan per distinct query, reused across calls; routing cfg changes the key', () => {
  clearWeekCache(planner);
  evaluateWeek(planner, JORDAN, HOME_IDS, { places });
  const first = weekCacheStats().scans;
  assert.ok(first > 0 && first <= 30, `scans ${first}`);
  evaluateWeek(planner, JORDAN, HOME_IDS, { places, cfg: withOverrides({ mWait: 2 }) });
  assert.equal(weekCacheStats().scans, first, 'no new scans for a non-routing cfg change');
  evaluateWeek(planner, JORDAN, HOME_IDS, { places, cfg: withOverrides({ maxAccessM: 1200 }) });
  assert.ok(weekCacheStats().scans > first, 'routing cfg is part of the key');
});

test('sampleWeeks: deterministic, draws p and alt, records attrs', () => {
  const routine = {
    id: 'm', modes: JORDAN.modes,
    week: [
      { id: 'c', label: 'Clinical', days: ['tue'], place: 'uh', start: '07:00', end: '15:00', p: 1, alt: [{ place: 'nursing', p: 0.3 }] },
      { id: 'j', label: 'Job', days: ['sat'], place: 'btc', start: '10:00', end: '14:00', p: 0.5 },
      { id: 'k', label: 'Class', days: ['mon'], place: 'angell', start: '10:00', end: '11:00' },
    ],
  };
  const a = sampleWeeks(routine, 2000, 11), b = sampleWeeks(routine, 2000, 11);
  assert.deepEqual(a, b);
  assert.notDeepEqual(sampleWeeks(routine, 50, 12), sampleWeeks(routine, 50, 11));
  const alt = a.filter((w) => w.attrs.c.place === 'nursing').length / a.length;
  const job = a.filter((w) => w.attrs.j.on).length / a.length;
  assert.ok(Math.abs(alt - 0.3) < 0.04, `alt ${alt}`);
  assert.ok(Math.abs(job - 0.5) < 0.04, `job ${job}`);
  for (const w of a.slice(0, 20)) {
    assert.ok(w.attrs.k.on);
    for (const e of w.week) { assert.equal(e.p, undefined); assert.equal(e.alt, undefined); }
    assert.equal(w.week.find((e) => e.id === 'c').place, w.attrs.c.place);
    assert.equal(w.week.some((e) => e.id === 'j'), w.attrs.j.on);
    assert.deepEqual(w.modes, routine.modes);
  }
  // scenarios run through evaluateWeek
  const res = evaluateWeek(planner, a[0], HOME_IDS, { places });
  for (const R of res.values()) allFinite(R);
});

test('timing: 30 homes x 20 trips', () => {
  const r = rng(5);
  const homes = [...HOME_IDS];
  for (let i = 0; i < 24; i++) {
    const id = `s${i}`;
    planner.addPoint(id, 42.262 + 0.04 * r(), -83.770 + 0.065 * r());
    homes.push(id);
  }
  clearWeekCache(planner);
  let t = performance.now();
  const res = evaluateWeek(planner, JORDAN, homes, { places });
  const cold = performance.now() - t;   // includes first-time bike trees for 24 new points
  const trips = res.get('northwood').trips.length;
  clearWeekCache(planner);
  t = performance.now();
  evaluateWeek(planner, JORDAN, homes, { places });
  const fresh = performance.now() - t;  // all scans and breakdowns redone, street trees warm
  const scans = weekCacheStats().scans;
  t = performance.now();
  evaluateWeek(planner, JORDAN, homes, { places });
  const cached = performance.now() - t; // scans cached (the scenario and re-run case)
  const weeks = sampleWeeks({ ...JORDAN, week: JORDAN.week.map((e) => ({ ...e, p: 0.8 })) }, 24, 3);
  t = performance.now();
  for (const w of weeks) evaluateWeek(planner, w, homes, { places });
  const scen = performance.now() - t;
  console.log(`  30 homes x ${trips} trips: cold ${cold.toFixed(1)} ms (new bike trees), fresh scans ${fresh.toFixed(1)} ms (${scans} scans), cached ${cached.toFixed(1)} ms; 24 scenario weeks ${scen.toFixed(1)} ms`);
  assert.ok(trips >= 20);
  assert.ok(fresh < 400, `fresh ${fresh} ms`);
});
