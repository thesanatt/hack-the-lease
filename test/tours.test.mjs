// tours.js: tour slots for the demo group (FICTIONAL members, SYNTHETIC house) on the real timetables.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
import { parseHM } from '../engine/week.js';
import { findTourSlots, tourMessage, clock12, TOUR_DEFAULTS } from '../engine/tours.js';

const DATA = new URL('../web/public/data/', import.meta.url);
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Same rule as web/src/views/group/logic.js modalRoutine: entries with p >= 0.5 at their base place.
const modal = (p) => ({
  week: (p.week || []).filter((e) => (e.p ?? 1) >= 0.5).map(({ p: _p, alt: _a, ...rest }) => rest),
  modes: p.modes || {},
});

let planner, places, personas, house, members, result;

before(async () => {
  ({ planner, places } = await loadAll(nodeGetter()));
  const pf = JSON.parse(await readFile(new URL('personas.json', DATA), 'utf8'));
  personas = Array.isArray(pf) ? pf : pf.personas;
  const homes = JSON.parse(await readFile(new URL('homes.json', DATA), 'utf8')).homes;
  house = homes.find((h) => h.id === 'h1');
  const group = personas.filter((p) => p.group);
  // caps are passed in on purpose: the result must not carry them
  members = group.map((p) => ({ id: p.id, name: p.name, cap: p.cap, routine: modal(p) }));
  result = findTourSlots(planner, { house, members, places });
});

const entriesOn = (m, day) => m.routine.week.filter((e) => e.days.includes(day))
  .map((e) => ({ ...e, s: parseHM(e.start), t: parseHM(e.end) }));

test('demo group: slots exist, are weekday half-hours between 9:00 and 19:00, best first per day', () => {
  assert.ok(members.length >= 4, 'demo group has at least four members');
  assert.ok(result.slots.length >= 1 && result.slots.length <= TOUR_DEFAULTS.top);
  for (const s of result.slots) {
    assert.ok(WEEKDAYS.includes(s.day));
    assert.equal(s.end - s.start, 30 * 60);
    assert.ok(s.start >= 9 * 3600 && s.end <= 19 * 3600);
    assert.equal(s.start % 1800, 0);
    assert.equal(s.members.length, members.length);
  }
  const firstPerDay = result.slots.filter((s) => !s.sameDay);
  assert.equal(new Set(firstPerDay.map((s) => s.day)).size, firstPerDay.length, 'non-fallback slots are on different days');
  assert.deepEqual(new Set(firstPerDay.map((s) => s.day)), new Set(result.daysWithSlot.slice(0, firstPerDay.length)) );
  // same-day fallbacks only when fewer days than slots have a time
  if (result.slots.some((s) => s.sameDay)) assert.ok(result.daysWithSlot.length < TOUR_DEFAULTS.top);
});

test('every member is free, leaves after their previous entry and reaches their next one on time', () => {
  for (const s of result.slots) {
    for (const r of s.members) {
      const m = members.find((x) => x.id === r.id);
      const list = entriesOn(m, s.day);
      assert.ok(!list.some((e) => e.s < s.end && e.t > s.start), `${m.id} busy during ${s.day} ${s.startHM}`);
      const prev = list.filter((e) => e.t <= s.start).sort((a, b) => b.t - a.t)[0];
      const next = list.filter((e) => e.s >= s.end).sort((a, b) => a.s - b.s)[0];
      assert.equal(r.to.to, house.id);
      assert.ok(r.to.arrive <= s.start + 1, `${m.id} arrives by the slot`);
      if (prev) {
        assert.equal(r.to.from, prev.place, 'trip starts where the member just was');
        assert.ok(r.to.depart >= prev.t - 1, `${m.id} leaves after ${prev.label} ends`);
      } else {
        assert.ok(['first', 'usual'].includes(r.originKind));
      }
      if (next) {
        assert.ok(r.back, `${m.id} has a trip to ${next.label}`);
        assert.equal(r.back.from, house.id);
        assert.equal(r.back.to, next.place);
        assert.ok(r.back.depart >= s.end - 1 && r.back.arrive <= next.s + 1);
      } else {
        assert.equal(r.back, null);
      }
      for (const t of [r.to, r.back].filter(Boolean)) {
        assert.ok(['walk', 'bike', 'bus'].includes(t.mode));
        if (t.mode === 'walk') assert.ok(t.min <= (m.routine.modes.maxWalkMin ?? 30), 'walk under the walking limit');
        if (t.mode === 'bike') assert.ok(m.routine.modes.bike, 'only members who bike get a bike trip');
        if (t.mode === 'bus') assert.ok(t.routes.length >= 1, 'bus trips name their routes');
        assert.ok(t.min >= 0 && t.min < 120);
      }
    }
  }
});

test('score is travel minutes plus the tight-connection penalty, and the first slot is the best', () => {
  for (const s of result.slots) {
    let travel = 0, pen = 0;
    for (const r of s.members) for (const t of [r.to, r.back].filter(Boolean)) {
      travel += t.min;
      if (t.bufferMin != null && t.bufferMin < TOUR_DEFAULTS.tightMin) pen += TOUR_DEFAULTS.tightWeight * (TOUR_DEFAULTS.tightMin - t.bufferMin);
    }
    assert.equal(s.travelMin, travel);
    assert.equal(s.penaltyMin, pen);
    assert.equal(s.score, travel + pen);
  }
  const best = Math.min(...result.slots.map((s) => s.score));
  assert.ok(result.slots.some((s) => !s.sameDay && s.score === best));
});

test('per-day counts agree with a brute-force free check', () => {
  let feasible = 0, free = 0;
  for (const day of WEEKDAYS) {
    const d = result.byDay[day];
    let f = 0;
    for (let s = 9 * 3600; s + 1800 <= 19 * 3600; s += 1800) {
      const ok = members.every((m) => !entriesOn(m, day).some((e) => e.s < s + 1800 && e.t > s));
      if (ok) f++;
    }
    assert.equal(d.free, f, `free half-hours on ${day}`);
    assert.ok(d.feasible <= d.free);
    feasible += d.feasible; free += d.free;
  }
  assert.equal(result.feasibleSlots, feasible);
  assert.equal(result.freeSlots, free);
  assert.deepEqual(result.daysWithSlot, WEEKDAYS.filter((d) => result.byDay[d].feasible > 0));
});

test('a new class over the best slot removes it (sensitivity)', () => {
  const best = result.slots.find((s) => !s.sameDay);
  const busy = members.map((m, i) => (i === 0 ? {
    ...m,
    routine: { ...m.routine, week: [...m.routine.week, { id: 'x', label: 'Office hours', days: [best.day], place: m.routine.week[0].place, start: best.startHM, end: best.endHM }] },
  } : m));
  const r2 = findTourSlots(planner, { house, members: busy, places });
  assert.ok(!r2.slots.some((s) => s.day === best.day && s.start === best.start));
  assert.ok(r2.byDay[best.day].free < result.byDay[best.day].free);
});

test('never returns caps or budgets', () => {
  const json = JSON.stringify(result);
  assert.ok(!/"cap"|budget|rent/i.test(json));
  for (const s of result.slots) for (const r of s.members) assert.deepEqual(
    Object.keys(r).sort(), ['back', 'id', 'name', 'origin', 'originKind', 'to'],
  );
});

test('draft message: ASCII, group size, house name, times, no money', () => {
  const msg = tourMessage({ houseName: house.name, groupSize: members.length, slots: result.slots });
  assert.ok(/^[\x09\x0a\x20-\x7e]*$/.test(msg), 'ASCII only');
  assert.ok(!/[$]/.test(msg));
  assert.ok(msg.includes(house.name));
  assert.ok(msg.includes(`group of ${members.length} students`));
  for (const s of result.slots) assert.ok(msg.includes(clock12(s.start)));
  for (const m of members) if (Number.isFinite(m.cap)) assert.ok(!msg.includes(String(m.cap)));
  assert.equal(clock12(17 * 3600), '5:00 pm');
  assert.equal(clock12(9 * 3600 + 1800), '9:30 am');
  assert.equal(clock12(12 * 3600), '12:00 pm');
});
