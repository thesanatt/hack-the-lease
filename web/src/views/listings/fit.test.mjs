import test from 'node:test';
import assert from 'node:assert/strict';
import { scale, fitScores, datesScore, meanTheta, cleanEmail, mailtoHref } from './fit.js';

const row = (id, cost, rent, time, dark, strand, kind = 'home') => ({ id, kind, cost, dollars: { rent, time, dark, strand } });

test('scale is 100 at the lowest, 0 at the highest, linear between', () => {
  assert.equal(scale(100, 100, 200), 100);
  assert.equal(scale(200, 100, 200), 0);
  assert.equal(scale(150, 100, 200), 50);
  assert.equal(scale(5, 5, 5), 100);
  assert.equal(scale(NaN, 0, 1), null);
});

test('lowest cost to you gets Fit 100, highest gets 0, categories from their own dollars', () => {
  const rows = [
    row('a', 1284, 925, 60, 10, 0, 'post'),
    row('b', 1351, 923, 80, 20, 5),
    row('c', 1470, 1115, 70, 30, 0),
  ];
  const f = fitScores(rows);
  assert.equal(f.get('a').fit, 100);
  assert.equal(f.get('c').fit, 0);
  assert.equal(f.get('b').fit, Math.round((100 * (1470 - 1351)) / (1470 - 1284)));
  assert.equal(f.get('b').price, 100);            // lowest rent
  assert.equal(f.get('c').price, 0);
  assert.equal(f.get('a').around, 100);
  assert.equal(f.get('b').around, 0);
  assert.equal(f.get('a').nights, 100);           // dark + strand: 10, 25, 30
  assert.equal(f.get('c').nights, 0);
  assert.equal(f.get('b').nights, 25);
  for (const v of f.values()) assert.equal(v.dates, 100);
});

test('a post that misses the semester shows Fit 0 and does not set the scale', () => {
  const rows = [
    row('p2', 1284, 925, 60, 10, 0, 'post'),
    row('p1', 1319, 780, 90, 10, 0, 'post'),
    row('h1', 1351, 923, 80, 10, 0),
    row('h3', 1470, 1115, 70, 10, 0),
  ];
  const f = fitScores(rows, { dates: (r) => (r.id === 'p1' ? 0 : 100) });
  assert.equal(f.get('p1').fit, 0);
  assert.equal(f.get('p1').dates, 0);
  assert.equal(f.get('p1').price, 100);           // still the cheapest rent
  assert.equal(f.get('p2').fit, 100);
  assert.equal(f.get('h3').fit, 0);
  // When the cheapest place misses, the next one that fits becomes 100.
  const g = fitScores(rows, { dates: (r) => (r.id === 'p2' ? 0 : 100) });
  assert.equal(g.get('p2').fit, 0);
  assert.equal(g.get('p1').fit, 100);
});

test('fit order follows cost order', () => {
  const rows = [row('a', 900, 1, 1, 1, 0), row('b', 1000, 1, 1, 1, 0), row('c', 1100, 1, 1, 1, 0)];
  const f = fitScores(rows);
  assert.ok(f.get('a').fit > f.get('b').fit && f.get('b').fit > f.get('c').fit);
  assert.equal(fitScores([]).size, 0);
  assert.equal(fitScores([row('x', 1000, 900, 10, 0, 0)]).get('x').fit, 100);
});

test('datesScore: covers 100, misses 0, a guess or no dates 50, a sample home 100', () => {
  assert.equal(datesScore({ ok: true }, { start: 'found', end: 'found' }), 100);
  assert.equal(datesScore({ ok: false, note: 'ends Aug 15: summer only' }), 0);
  assert.equal(datesScore({ ok: true }, { start: 'found', end: 'guessed' }), 50);
  assert.equal(datesScore({ ok: null, note: 'no dates in the post' }), 50);
  assert.equal(datesScore(undefined), 100);
});

test('meanTheta averages each value', () => {
  assert.deepEqual(meanTheta([{ vTime: 10, vDark: 2 }, { vTime: 20, vDark: 4 }]), { vTime: 15, vDark: 3 });
  assert.deepEqual(meanTheta([]), {});
});

test('mailto link: subject "Your post: <title>", draft as body, optional To', () => {
  const body = 'Hi, I saw your post.\nThanks!';
  const h = mailtoHref({ title: 'Catherine St', body });
  assert.ok(h.startsWith('mailto:?subject='));
  const q = new URLSearchParams(h.slice(h.indexOf('?') + 1));
  assert.equal(q.get('subject'), 'Your post: Catherine St');
  assert.equal(q.get('body'), 'Hi, I saw your post.\r\nThanks!');
  assert.ok(!h.includes('+'), 'spaces are %20, not +');
  const t = mailtoHref({ to: ' sam@example.com ', title: 'Hill St', body: 'x' });
  assert.ok(t.startsWith('mailto:sam@example.com?subject='));
  assert.ok(mailtoHref({ to: 'not an email', title: 'a', body: 'b' }).startsWith('mailto:?'));
  assert.ok(mailtoHref({ to: 'a@b.com?cc=x@y.com', title: 'a', body: 'b' }).startsWith('mailto:?'));
});

test('cleanEmail accepts plain addresses only', () => {
  assert.equal(cleanEmail('a.b@umich.edu'), 'a.b@umich.edu');
  assert.equal(cleanEmail('a@b'), null);
  assert.equal(cleanEmail('a b@c.com'), null);
  assert.equal(cleanEmail(''), null);
});
