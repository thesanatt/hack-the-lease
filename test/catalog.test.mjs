// Tests for engine/catalog.js: the catalog parser, the next-year sampler and the value of information.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCatalogCSV, parseTime, parseDays, subjectCode, sampleNextYear, conditionScenarios, voi } from '../engine/catalog.js';
import { evpi as decideEvpi } from '../engine/decide.js';
import { rng } from '../engine/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'web', 'public', 'data');
const read = (f) => readFileSync(path.join(DATA, f), 'utf8');
const places = JSON.parse(read('places.json'));
const plans = JSON.parse(read('plans_sample.json')).plans;
const parsed = parseCatalogCSV(read('catalog_sample.csv'), places);
const byKey = new Map(parsed.sections.map((s) => [s.key, s]));

// ---------- parsing ----------

test('sample catalog: columns, sections, times and places', () => {
  assert.equal(parsed.columns.subject, 'Subject');
  assert.equal(parsed.columns.catalog, 'Catalog Nbr');
  assert.equal(parsed.columns.time, 'Time');
  assert.equal(parsed.columns.location, 'Location');
  assert.deepEqual(parsed.columns.dayFlags, ['M', 'T', 'W', 'TH', 'F', 'S', 'SU']);
  assert.equal(parsed.sections.length, 75);
  assert.deepEqual(parsed.skipped, { arranged: 1, noTime: 0, noPlace: 0 });
  assert.deepEqual(parsed.unmatched, []);
  assert.deepEqual(parsed.warnings, []);
  const lec = byKey.get('EECS 482|LEC|001');
  assert.equal(lec.course, 'EECS 482');
  assert.equal(lec.title, 'Introduction to Operating Systems');
  assert.deepEqual(lec.days, ['mon', 'wed']);
  assert.equal(lec.start, '10:30'); assert.equal(lec.end, '12:00');
  assert.equal(lec.location, '1670 BBB'); assert.equal(lec.place, 'beyster'); assert.equal(lec.area, 'North');
  const cln = byKey.get('PNE 350|CLN|104');
  assert.deepEqual(cln.days, ['tue', 'thu']);
  assert.equal(cln.start, '14:00'); assert.equal(cln.end, '22:30'); assert.equal(cln.place, 'uh');
  assert.equal(byKey.get('PNE 350|CLN|103').days.join(), 'fri,sat');
  assert.equal(byKey.get('ECON 101|LEC|001').place, 'angell');
  assert.equal(byKey.get('NURS 372|LEC|001').place, 'nursing');
  for (const s of parsed.sections) assert.ok(s.place, `${s.key} has a place`);
});

test('time rules: the suffix belongs to the end, start takes the short reading', () => {
  const t = (s) => { const r = parseTime(s); return r && !r.arranged ? `${r.start}-${r.end}` : r; };
  assert.equal(t('10-1130AM'), '10:00-11:30');
  assert.equal(t('1130-1PM'), '11:30-13:00');
  assert.equal(t('4-530PM'), '16:00-17:30');
  assert.equal(t('6-9PM'), '18:00-21:00');
  assert.equal(t('12-130PM'), '12:00-13:30');
  assert.equal(t('9-12PM'), '09:00-12:00');
  assert.equal(t('630-3PM'), '06:30-15:00');
  assert.equal(t('2-1030PM'), '14:00-22:30');
  assert.equal(t('10:30AM - 12:00PM'), '10:30-12:00');
  assert.equal(t('1030AM-12PM'), '10:30-12:00');
  assert.equal(t('13:00-14:30'), '13:00-14:30');
  assert.deepEqual(parseTime('ARR'), { arranged: true });
  assert.deepEqual(parseTime('TBA'), { arranged: true });
  assert.equal(parseTime(''), null);
  assert.equal(parseTime('soon'), null);
});

test('days, subjects and a Days-column file', () => {
  assert.deepEqual(parseDays('MW'), ['mon', 'wed']);
  assert.deepEqual(parseDays('TuTh'), ['tue', 'thu']);
  assert.deepEqual(parseDays('TTH'), ['tue', 'thu']);
  assert.deepEqual(parseDays('MWF'), ['mon', 'wed', 'fri']);
  assert.equal(subjectCode('Electrical Engineering & Computer Sci (EECS)'), 'EECS');
  assert.equal(subjectCode(' stats '), 'STATS');
  const csv = [
    'Schedule of Classes,,,,,,',
    'subject,CATALOG NBR,Section,Component,Days,Time,Location',
    'Statistics (STATS), 250,001,LEC,TuTh,"10:30AM - 12:00PM",1800 CHEM',
    'EECS,482,011,LAB,F,1-2PM,Somewhere Hall',
    'EECS,482,012,LAB,ARR,ARR,',
    'EECS,482,013,LAB,M,,1005 EECS',
  ].join('\r\n');
  const p = parseCatalogCSV(csv, places);
  assert.equal(p.columns.days, 'Days');
  assert.equal(p.sections.length, 2);
  assert.equal(p.sections[0].key, 'STATS 250|LEC|001');
  assert.deepEqual(p.sections[0].days, ['tue', 'thu']);
  assert.equal(p.sections[0].place, 'chem');
  assert.equal(p.sections[1].place, null);
  assert.deepEqual(p.skipped, { arranged: 1, noTime: 1, noPlace: 1 });
  assert.deepEqual(p.unmatched, ['Somewhere Hall']);
  assert.ok(parseCatalogCSV('a,b\n1,2', places).warnings.length > 0);
});

// ---------- sampling ----------

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const clash = (w) => w.some((a, i) => w.some((b, j) => j > i && a.days.some((d) => b.days.includes(d)) && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)));

test('sampler: deterministic, no unresolved conflicts on the sample plans, attrs for every factor', () => {
  for (const plan of plans) {
    const a = sampleNextYear({ plan, sections: parsed.sections, k: 120, seed: 4, places });
    const b = sampleNextYear({ plan, sections: parsed.sections, k: 120, seed: 4, places });
    const c = sampleNextYear({ plan, sections: parsed.sections, k: 120, seed: 5, places });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.notEqual(JSON.stringify(a.scenarios), JSON.stringify(c.scenarios));
    assert.deepEqual(a.stats.missingCourses, []);
    for (const priority of ['early', 'normal', 'late']) {
      for (const seed of [1, 2, 3]) {
        const r = sampleNextYear({ plan, sections: parsed.sections, k: 200, seed, priority, places });
        assert.equal(r.stats.conflictsUnresolved, 0, `${plan.id} ${priority} seed ${seed}`);
        assert.ok(!r.scenarios.some((s) => clash(s.week)));
      }
    }
    assert.equal(a.scenarios.length, 120);
    for (const s of a.scenarios) {
      assert.ok(Math.abs(s.weight - 1 / 120) < 1e-12);
      for (const f of a.factors) assert.ok(f.options.some((o) => o.id === s.attrs[f.id]), `${f.id} = ${s.attrs[f.id]}`);
      for (const e of s.week) for (const k of ['id', 'label', 'days', 'place', 'start', 'end']) assert.ok(e[k] != null);
    }
    assert.ok(a.factors.some((f) => f.kind === 'section'));
    assert.ok(a.factors.some((f) => f.kind === 'choice'));
    assert.ok(a.factors.some((f) => f.kind === 'maybe'));
  }
  const cs = sampleNextYear({ plan: plans[0], sections: parsed.sections, k: 50, seed: 1, places, modes: { bike: false } });
  const f = cs.factors.find((x) => x.id === 'EECS 482|LEC');
  assert.equal(f.label, 'EECS 482 lecture section');
  assert.equal(f.options[0].label, '001, North Campus, Mon 10:30 AM');
  assert.equal(f.options[0].campus, 'North');
  assert.deepEqual(cs.scenarios[0].modes, { bike: false });
  assert.equal(cs.factors.find((x) => x.id === 'labjob').options[0].campus, 'North');
});

test('sampler: odds override and priority', () => {
  const plan = plans[0];
  const yes = (r) => r.scenarios.filter((s) => s.attrs.labjob === 'yes').length;
  assert.equal(yes(sampleNextYear({ plan, sections: parsed.sections, k: 100, seed: 2, odds: { labjob: 1 } })), 100);
  assert.equal(yes(sampleNextYear({ plan, sections: parsed.sections, k: 100, seed: 2, odds: { labjob: 0 } })), 0);
  const mid = yes(sampleNextYear({ plan, sections: parsed.sections, k: 400, seed: 2 }));
  assert.ok(mid > 120 && mid < 200, `about 40% of 400, got ${mid}`);
  const missing = sampleNextYear({ plan: { id: 'x', courses: [{ id: 'a', course: 'EECS 999', components: ['LEC'] }] }, sections: parsed.sections, k: 3 });
  assert.deepEqual(missing.stats.missingCourses, ['EECS 999']);
});

test('conditionScenarios keeps the matching scenarios', () => {
  const r = sampleNextYear({ plan: plans[1], sections: parsed.sections, k: 100, seed: 3, places });
  const sub = conditionScenarios(r.scenarios, { 'PNE 350|CLN': '104' });
  assert.ok(sub.length > 0 && sub.length < 100);
  assert.ok(sub.every((s) => s.attrs['PNE 350|CLN'] === '104'));
  assert.equal(conditionScenarios(r.scenarios, {}).length, 100);
  const both = conditionScenarios(r.scenarios, { 'PNE 350|CLN': '104', downtownjob: 'yes' });
  assert.ok(both.every((s) => s.attrs.downtownjob === 'yes'));
});

// ---------- value of information ----------

// Tensor from per-draw utilities u[m][s][h].
function tensorOf(u) {
  const M = u.length, K = u[0].length, H = u[0][0].length;
  const U = new Float64Array(M * K * H);
  for (let m = 0; m < M; m++) for (let s = 0; s < K; s++) for (let h = 0; h < H; h++) U[(m * K + s) * H + h] = u[m][s][h];
  return { U, M, K, H, homeIds: Array.from({ length: H }, (_, h) => `h${h}`) };
}
const scen = (attrs) => attrs.map((a, i) => ({ id: `s${i}`, week: [], attrs: a, weight: 1 / attrs.length }));

test('hand-worked EVPI and EVPPI: 2 homes, 4 scenarios', () => {
  // Utilities (two value draws that average to these): s0 [10, 0], s1 [10, 0], s2 [0, 20], s3 [0, 20].
  // Mean per home: 5 and 10, so home 1 now (10). Perfect: (10 + 10 + 20 + 20) / 4 = 15. EVPI = 5.
  // A splits {s0,s1} | {s2,s3}: 0.5 * 10 + 0.5 * 20 - 10 = 5 (decides everything).
  // B splits {s0,s2} | {s1,s3}: each half has means 5 and 10: 10 - 10 = 0 (irrelevant).
  // C splits {s0} | {s1,s2,s3}: 0.25 * 10 + 0.75 * max(10/3, 40/3) - 10 = 2.5.
  const base = [[10, 0], [10, 0], [0, 20], [0, 20]];
  const t = tensorOf([base.map(([a, b]) => [a + 3, b - 1]), base.map(([a, b]) => [a - 3, b + 1])]);
  const scenarios = scen([{ A: 'x', B: 'p', C: 'c' }, { A: 'x', B: 'q', C: 'd' }, { A: 'y', B: 'p', C: 'd' }, { A: 'y', B: 'q', C: 'd' }]);
  const factors = ['A', 'B', 'C'].map((id) => ({ id, label: id }));
  const v = voi({ tensor: t, scenarios, factors, boot: 50, seed: 1 });
  assert.ok(Math.abs(v.evpi.value - 5) < 1e-9);
  assert.ok(Math.abs(v.evpi.value - decideEvpi(t).evpi) < 1e-9);
  const by = Object.fromEntries(v.byFactor.map((f) => [f.id, f]));
  assert.ok(Math.abs(by.A.value - 5) < 1e-9);
  assert.ok(Math.abs(by.B.value - 0) < 1e-9);
  assert.ok(Math.abs(by.C.value - 2.5) < 1e-9);
  assert.deepEqual(v.byFactor.map((f) => f.id), ['A', 'C', 'B']);
  assert.ok(v.evpi.se >= 0 && by.A.se >= 0);
  // homes: cost = -Ubar. Home 1 costs 0, 0, -20, -20 -> mean -10; best in half the scenarios.
  assert.equal(v.homes[0].homeId, 'h1');
  assert.ok(Math.abs(v.homes[0].meanCost + 10) < 1e-9);
  assert.ok(Math.abs(v.homes[0].pBest - 0.5) < 1e-9);
  assert.ok(Math.abs(v.homes[0].worst10 - 0) < 1e-9);
  assert.ok(Math.abs(v.homes[0].expRegret - 5) < 1e-9);
  assert.throws(() => voi({ tensor: t, scenarios: scenarios.slice(1), factors }));
});

test('EVPPI is between 0 and EVPI on random tensors, and matches the definition', () => {
  const r = rng(11);
  for (let trial = 0; trial < 20; trial++) {
    const M = 3, K = 30, H = 5;
    const u = Array.from({ length: M }, () => Array.from({ length: K }, () => Array.from({ length: H }, () => 50 * r.normal())));
    const attrs = Array.from({ length: K }, () => ({ f1: String(r.int(2)), f2: String(r.int(3)), f3: String(r.int(5)) }));
    const t = tensorOf(u);
    const v = voi({ tensor: t, scenarios: scen(attrs), factors: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }], boot: 20, seed: trial });
    assert.ok(Math.abs(v.evpi.value - decideEvpi(t).evpi) < 1e-9);
    // naive EVPPI
    const ubar = (s, h) => u.reduce((a, m) => a + m[s][h], 0) / M;
    const now = Math.max(...Array.from({ length: H }, (_, h) => Array.from({ length: K }, (_, s) => ubar(s, h)).reduce((a, b) => a + b) / K));
    for (const f of v.byFactor) {
      assert.ok(f.value >= 0 && f.value <= v.evpi.value + 1e-9, `${f.id} ${f.value} <= ${v.evpi.value}`);
      const opts = [...new Set(attrs.map((a) => a[f.id]))];
      let tot = 0;
      for (const o of opts) {
        const ss = attrs.map((a, s) => (a[f.id] === o ? s : -1)).filter((s) => s >= 0);
        tot += (ss.length / K) * Math.max(...Array.from({ length: H }, (_, h) => ss.reduce((a, s) => a + ubar(s, h), 0) / ss.length));
      }
      assert.ok(Math.abs(f.value - Math.max(0, tot - now)) < 1e-9);
    }
  }
});

test('EVPPI equals EVPI when one factor decides the week, and 0 for an irrelevant factor', () => {
  const r = rng(3);
  const K = 40, H = 4;
  const attrs = Array.from({ length: K }, () => ({ key: String(r.int(4)), noise: String(r.int(3)) }));
  // the utility depends only on `key`
  const u = [attrs.map((a) => Array.from({ length: H }, (_, h) => (Number(a.key) === h ? 100 : 0) + 10 * h))];
  const v = voi({ tensor: tensorOf(u), scenarios: scen(attrs), factors: [{ id: 'key' }, { id: 'noise' }, { id: 'absent' }], boot: 10 });
  const by = Object.fromEntries(v.byFactor.map((f) => [f.id, f.value]));
  assert.ok(v.evpi.value > 1);
  assert.ok(Math.abs(by.key - v.evpi.value) < 1e-9);
  assert.ok(Math.abs(by.absent) < 1e-9);
  assert.ok(by.noise <= v.evpi.value);
  // a factor independent of the utility in every scenario (constant utility) is worth nothing
  const flat = voi({ tensor: tensorOf([attrs.map(() => [1, 2, 3, 4])]), scenarios: scen(attrs), factors: [{ id: 'noise' }] });
  assert.equal(flat.evpi.value, 0);
  assert.equal(flat.byFactor[0].value, 0);
});
