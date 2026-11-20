// engine/explain.js on real data: the real TheRide and U-M timetables, OSM streets and places, the SYNTHETIC
// homes and the FICTIONAL personas in web/public/data. Values are the prior medians (what a student sees before
// any picks) and, where a test needs a stronger student, the persona's demo values.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
import { CONFIG } from '../engine/config.js';
import { PARAMS, PARAM_INFO, utility } from '../engine/model.js';
import { homeOption } from '../engine/decide.js';
import { evaluateWeek } from '../engine/week.js';
import { explainAll, explainHome, explainContext, compareHomes, pieces, PIECES, whyLine, fmtMoney, fmtMin } from '../engine/explain.js';

const get = nodeGetter();
let homes, personas, places, placeById, planner;
const weeks = new Map();
const MEDIAN = Object.fromEntries(PARAMS.map((k) => [k, PARAM_INFO[k].prior.median]));

const modal = (p) => ({ week: p.week.filter((e) => (e.p ?? 1) >= 0.5).map(({ p: _p, alt: _a, ...e }) => e), modes: p.modes });

before(async () => {
  ({ planner, places } = await loadAll(get));
  const hf = await get('homes.json');
  homes = hf.homes;
  const pf = await get('personas.json');
  personas = Array.isArray(pf) ? pf : pf.personas;
  for (const h of homes) planner.addPoint(h.id, h.lat, h.lon);
  for (const p of places) planner.addPoint(p.id, p.lat, p.lon);
  placeById = new Map(places.map((p) => [p.id, p]));
  for (const p of personas) weeks.set(p.id, evaluateWeek(planner, modal(p), homes.map((h) => h.id), { cfg: CONFIG }));
});

const args = (p, theta = MEDIAN) => ({ homes, weekMap: weeks.get(p.id), theta, cfg: CONFIG, places: placeById, modes: p.modes });
const allText = (n) => [n.headline, ...n.fits, ...n.watch].flatMap((r) => (typeof r === 'string' ? [r] : [r.label, r.text, r.trip?.text || '']));

test('pieces add up to model.utility for every home and persona', () => {
  for (const p of personas) {
    for (const h of homes) {
      const o = homeOption(h, weeks.get(p.id).get(h.id), MEDIAN, CONFIG);
      const pc = pieces(MEDIAN, o);
      const sum = PIECES.reduce((s, k) => s + pc[k], 0);
      assert.ok(Math.abs(sum - utility(MEDIAN, o)) < 1e-6, `${p.id} ${h.id}: ${sum} vs ${utility(MEDIAN, o)}`);
    }
  }
});

test('notes are deterministic and cover every home', () => {
  const p = personas[0];
  const a = explainAll(args(p)), b = explainAll(args(p));
  assert.equal(a.size, homes.length);
  for (const h of homes) assert.deepEqual(a.get(h.id), b.get(h.id));
  assert.deepEqual(explainHome({ home: homes[3], ...args(p) }), a.get(homes[3].id));
});

test('reasons are signed, ranked by dollar impact, at most three each, and add up against the middle home', () => {
  for (const p of personas) {
    const notes = explainAll(args(p));
    const { ctx } = notes;
    for (const n of notes.values()) {
      assert.ok(n.fits.length <= 3 && n.watch.length <= 3);
      for (const f of n.fits) assert.ok(f.dollars >= 3, `${n.homeId} fit ${f.key} ${f.dollars}`);
      for (let i = 1; i < n.fits.length; i++) assert.ok(n.fits[i - 1].dollars >= n.fits[i].dollars);
      const neg = n.watch.filter((w) => w.dollars < 0 && !w.absolute && !w.vs);
      for (let i = 1; i < neg.length; i++) assert.ok(neg[i - 1].dollars <= neg[i].dollars);
      // each reason's dollars is exactly this home's piece minus the middle piece
      const row = ctx.rows.get(n.homeId);
      for (const r of n.fits) assert.ok(Math.abs(r.dollars - (row.p[r.key] - ctx.mid[r.key])) < 1e-9);
      // the headline sign matches the total against the middle home
      assert.ok(n.headline.includes(n.vsMiddle > 0 ? 'better' : n.vsMiddle < 0 ? 'worse' : 'same') || Math.abs(n.vsMiddle) < 1);
    }
  }
});

test('copy is ASCII, has no dashes, and every reason carries a number', () => {
  for (const p of personas) {
    for (const n of explainAll(args(p)).values()) {
      for (const s of allText(n)) {
        assert.ok(/^[\x20-\x7e]*$/.test(s), `non-ASCII in: ${s}`);
        assert.ok(!/[\u2013\u2014]/.test(s));
      }
      for (const r of [...n.fits, ...n.watch]) assert.ok(/\d/.test(r.text), `no number in ${r.key}: ${r.text}`);
    }
  }
});

test('the top home under these values is ahead of the middle and of its best alternative', () => {
  for (const p of personas) {
    const notes = explainAll(args(p));
    const top = notes.get(notes.ctx.order[0]);
    assert.ok(top.vsMiddle >= 0);
    assert.ok(top.bestAlt.gap >= 0);
    assert.equal(top.rankUnder, 1);
  }
});

test('a home with a stranded trip names the trip: day, time, route and the walking limit', () => {
  const p = personas.find((x) => x.id === 'jordan') || personas[0];
  const notes = explainAll(args(p));
  const w = weeks.get(p.id);
  const id = homes.map((h) => h.id).find((hid) => w.get(hid).stranded.length > 0);
  assert.ok(id, 'expected at least one home with a stranded trip on the Jordan week');
  const s = notes.get(id).watch.find((r) => r.key === 'strand');
  assert.ok(s, `strand reason missing for ${id}`);
  assert.ok(s.trip && s.trip.stranded);
  assert.match(s.trip.text, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}:\d{2} (AM|PM), /);
  assert.match(s.trip.text, /limit/);
  assert.ok(s.text.includes(String(w.get(id).stranded.length)));
});

test('compareHomes: the flip value and the rent gap really reorder the two homes', () => {
  for (const p of personas) {
    const ctx = explainContext(args(p));
    const [a, b] = ctx.order;
    const c = compareHomes(ctx, a, b);
    assert.ok(c.gap >= 0);
    assert.equal(c.rentToFlip, c.gap);
    const A = ctx.rows.get(a).option, B = ctx.rows.get(b).option;
    // b with its rent cut by the gap ties a
    assert.ok(Math.abs(utility(MEDIAN, { ...B, rent: B.rent - c.rentToFlip }) - utility(MEDIAN, A)) < 1e-6);
    if (c.flip) {
      const th = { ...MEDIAN, [c.flip.param]: c.flip.value * (c.flip.dir === 'more' ? 1.05 : 0.95) };
      assert.ok(utility(th, B) > utility(th, A), `${p.id}: flip on ${c.flip.param} does not reorder`);
      const back = { ...MEDIAN, [c.flip.param]: c.flip.value * (c.flip.dir === 'more' ? 0.95 : 1.05) };
      assert.ok(utility(back, A) > utility(back, B));
      assert.match(c.flip.text, /\$\d/);
    }
    // drivers sum to the gap
    assert.ok(Math.abs(c.drivers.reduce((s, d) => s + d.dollars, 0) - c.gap) < 1);
  }
});

test('time reasons scale with the value of time', () => {
  const p = personas[0];
  const base = explainAll(args(p));
  const strong = explainAll(args(p, { ...MEDIAN, vTime: MEDIAN.vTime * 4 }));
  for (const h of homes) {
    const t0 = [...base.get(h.id).fits, ...base.get(h.id).watch].find((r) => r.key === 'time');
    const t1 = [...strong.get(h.id).fits, ...strong.get(h.id).watch].find((r) => r.key === 'time');
    if (t0 && t1) assert.ok(Math.abs(t1.dollars - 4 * t0.dollars) < 1e-6, `${h.id}: time dollars scale with vTime`);
  }
});

test('whyLine and formatting helpers', () => {
  const p = personas[0];
  for (const n of explainAll(args(p)).values()) assert.match(whyLine(n), /^([+-]\$[\d,]+\/mo [a-z ]+|Close to the middle home on every count\.)$/);
  assert.equal(fmtMoney(1234.4), '$1,234');
  assert.equal(fmtMoney(-5), '-$5');
  assert.equal(fmtMin(45), '45 min');
  assert.equal(fmtMin(125), '2h 05m');
});
