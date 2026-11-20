// listing.js: reading a pasted post (SAMPLE posts, made up), merging duplicates, and the template draft.
// Streets come from the real OSM streets.geojson; places from places.json.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parsePost, dedupeKey, draftMessage, redact, findStreet, streetIndex, shortName, covers, locate, TODAY,
} from '../engine/listing.js';

const DATA = new URL('../web/public/data/', import.meta.url);
let streets, places, posts, ctx;
const byId = {};

before(async () => {
  streets = JSON.parse(await readFile(new URL('streets/streets.geojson', DATA), 'utf8'));
  places = JSON.parse(await readFile(new URL('places.json', DATA), 'utf8'));
  const file = JSON.parse(await readFile(new URL('posts_sample.json', DATA), 'utf8'));
  posts = file.posts;
  ctx = { streets, places };
  for (const p of posts) byId[p.id] = parsePost(p.text, ctx);
  assert.match(file.label, /^SAMPLE/);
});

const ASCII = /^[\x20-\x7E\n]*$/;
const NEAR_AA = (loc) => loc.lat > 42.2 && loc.lat < 42.35 && loc.lon > -83.8 && loc.lon < -83.65;

test('sample file: 6 to 16 posts, ASCII, no emails, phone numbers or links', () => {
  assert.ok(posts.length >= 6 && posts.length <= 16);
  for (const p of posts) {
    assert.match(p.text, ASCII, p.id);
    assert.equal(redact(p.text), p.text, `${p.id} carries contact details`);
  }
});

test('s1: room on Hill St near Church, summer, $780 utilities included, 1 of 4, furnished', () => {
  const l = byId.s1;
  assert.equal(l.rent, 780);
  assert.equal(l.utilities, 'included');
  assert.equal(l.start, '2027-05-01');
  assert.equal(l.end, '2027-08-15');
  assert.equal(l.term, 'summer');
  assert.equal(l.beds, 1);
  assert.equal(l.bedsInUnit, 4);
  assert.equal(l.furnished, true);
  assert.equal(l.street, 'Hill Street');
  assert.equal(l.cross, 'Church Street');
  assert.equal(l.location.how, 'intersection');
  assert.ok(NEAR_AA(l.location));
  assert.equal(l.contact, null);
  assert.equal(l.confidence.rent, 'found');
  assert.ok(l.fields.some((f) => f.key === 'rent' && f.from === '$780/mo'));
});

test('s2: Winter semester on Catherine St, street only, plus utilities, Jan to Apr', () => {
  const l = byId.s2;
  assert.equal(l.rent, 925);
  assert.equal(l.utilities, 'extra');
  assert.equal(l.term, 'winter');
  assert.equal(l.start, '2027-01-01');
  assert.equal(l.end, '2027-04-30');
  assert.equal(l.furnished, false);
  assert.deepEqual([l.beds, l.bedsInUnit], [1, 3]);
  assert.equal(l.street, 'Catherine Street');
  assert.equal(l.cross, null);
  assert.equal(l.location.how, 'street');
  assert.match(l.location.note, /Drop a pin/);
});

test('s3: studio near the Union, $1,050, place location', () => {
  const l = byId.s3;
  assert.equal(l.rent, 1050);
  assert.equal(l.beds, 0);
  assert.equal(l.street, null);
  assert.equal(l.place.id, 'union');
  assert.equal(l.location.how, 'place');
  assert.equal(l.start, '2027-01-05');
  assert.equal(l.end, '2027-04-30');
  assert.equal(l.term, 'winter');
});

test('s4: a whole-house total split per person is divided by the bedrooms', () => {
  const l = byId.s4;
  assert.equal(l.rentWhole, 4500);
  assert.equal(l.rent, 900);
  assert.equal(l.confidence.rent, 'guessed');
  assert.deepEqual([l.beds, l.bedsInUnit], [2, 5]);
  assert.equal(l.start, '2027-09-01');
  assert.equal(l.end, '2028-08-31');
  assert.equal(l.term, 'year');
  assert.equal(l.location.how, 'intersection');
});

test('s5: no street at all asks for a pin; "850/mo" and "May to August"', () => {
  const l = byId.s5;
  assert.equal(l.rent, 850);
  assert.equal(l.street, null);
  assert.equal(l.place, null);
  assert.equal(l.location.how, null);
  assert.equal(l.location.lat, null);
  assert.match(l.location.note, /Drop a pin/);
  assert.equal(l.start, '2027-05-01');
  assert.equal(l.end, '2027-08-31');
  assert.equal(shortName(l), null);
});

test('s7: Plymouth Rd near Huron Pkwy (North Campus), abbreviations expanded', () => {
  const l = byId.s7;
  assert.equal(l.street, 'Plymouth Road');
  assert.equal(l.cross, 'Huron Parkway');
  assert.equal(l.location.how, 'intersection');
  assert.equal(l.rent, 820);
  assert.equal(l.utilities, 'extra');
});

test('dedupe: the reworded duplicate (s6) has the same key as s1; every other pair differs', () => {
  const keys = posts.map((p) => dedupeKey(byId[p.id], p.text));
  assert.equal(dedupeKey(byId.s6, posts.find((p) => p.id === 's6').text), dedupeKey(byId.s1, posts.find((p) => p.id === 's1').text));
  assert.equal(new Set(keys).size, posts.length - 1);
});

test('dedupe: a different rent or start month is a different post', () => {
  const a = parsePost('Room on Hill St near Church, May 1 to Aug 15, $780/mo', ctx);
  const b = parsePost('Room on Hill St near Church, May 1 to Aug 15, $800/mo', ctx);
  const c = parsePost('Room on Hill St near Church, Jun 1 to Aug 15, $780/mo', ctx);
  assert.notEqual(dedupeKey(a), dedupeKey(b));
  assert.notEqual(dedupeKey(a), dedupeKey(c));
});

test('prices: "$1,050", "850/mo", "850 per month", "$850 a month", "rent is 900"; a deposit is not rent', () => {
  assert.equal(parsePost('Room, $1,050 a month', ctx).rent, 1050);
  assert.equal(parsePost('room 850/mo utilities extra', ctx).rent, 850);
  assert.equal(parsePost('850 per month, furnished', ctx).rent, 850);
  assert.equal(parsePost('$850 a month', ctx).rent, 850);
  assert.equal(parsePost('rent is 900 and parking free', ctx).rent, 900);
  assert.equal(parsePost('$500 deposit, then $725/mo', ctx).rent, 725);
  assert.equal(parsePost('Room in a 4 bed, no price yet, 2027 lease', ctx).rent, null);
});

test('a whole-unit total is kept whole unless the post says per person', () => {
  const l = parsePost('$4,200 for the whole 4br house on Geddes Ave, utilities extra', ctx);
  assert.equal(l.rent, 4200);
  assert.equal(l.rentWhole, 4200);
  assert.equal(l.bedsInUnit, 4);
  const p = parsePost('$4,200 for the whole 4br house, split per person', ctx);
  assert.equal(p.rent, 1050);
});

test('dates: next occurrence after today, ranges across the new year, named terms', () => {
  assert.equal(TODAY, '2026-11-20');
  const x = parsePost('Room Dec 20 - Jan 5, $600/mo', ctx);
  assert.deepEqual([x.start, x.end], ['2026-12-20', '2027-01-05']);
  const y = parsePost('Sublet Nov 1 to Dec 15', ctx);
  assert.deepEqual([y.start, y.end], ['2027-11-01', '2027-12-15']);
  const w = parsePost('Need someone for Winter semester, 850 per month', ctx);
  assert.deepEqual([w.start, w.end, w.term], ['2027-01-01', '2027-04-30', 'winter']);
  assert.equal(w.confidence.start, 'guessed');
  const j = parsePost('Jan-Apr sublet $700/mo', ctx);
  assert.deepEqual([j.start, j.end, j.term], ['2027-01-01', '2027-04-30', 'winter']);
  const n = parsePost('5/1 - 8/15, $700/month', ctx);
  assert.deepEqual([n.start, n.end], ['2027-05-01', '2027-08-15']);
  const s = parsePost('summer sublet, $650', ctx);
  assert.equal(s.term, 'summer');
  assert.equal(s.confidence.start, 'guessed');
  const a = parsePost('studio, available Jan 5', ctx);
  assert.deepEqual([a.start, a.end], ['2027-01-05', null]);
  const o = parsePost('Room on Plymouth Rd, Jan to Aug. 820/mo', ctx);
  assert.deepEqual([o.start, o.end, o.rent], ['2027-01-01', '2027-08-31', 820]);
});

test('streets: "1234 S State St" gives the number and South State Street; names are normalized', () => {
  const l = parsePost('Room at 1234 S State St, $1,050 a month', ctx);
  assert.equal(l.number, '1234');
  assert.equal(l.street, 'South State Street');
  assert.equal(l.rent, 1050);
  assert.equal(l.location.how, 'street');
  const idx = streetIndex(streets);
  assert.equal(findStreet(idx, 'S. State St.').name, 'South State Street');
  assert.equal(findStreet(idx, 'state').name, 'South State Street');
  assert.equal(findStreet(idx, 'Washtenaw Ave').name, 'Washtenaw Avenue');
  assert.equal(findStreet(idx, 'Huron Pkwy').name, 'Huron Parkway');
  assert.equal(findStreet(idx, 'Nowhere Blvd'), null);
  const c = parsePost('Room on S. State St. near E. William, 5/1-8/15, $700/month', ctx);
  assert.equal(c.cross, 'East William Street');
  assert.equal(c.location.how, 'intersection');
});

test('no false streets from "central campus", "the Union" or plain words', () => {
  const l = parsePost('Room 10 min to central campus, near the bus stop, $700/mo', ctx);
  assert.equal(l.street, null);
  const u = parsePost('Room near the Union, $700/mo', ctx);
  assert.equal(u.street, null);
  assert.equal(u.place.id, 'union');
});

test('a street alone is placed at its point nearest the given centroid', () => {
  const north = { lat: 42.2925, lon: -83.7160 };
  const south = { lat: 42.2650, lon: -83.7480 };
  const a = locate({ street: 'South State Street' }, { streets, places, centroid: north });
  const b = locate({ street: 'South State Street' }, { streets, places, centroid: south });
  assert.equal(a.how, 'street');
  assert.ok(a.lat !== b.lat || a.lon !== b.lon);
});

test('beds and furniture words', () => {
  assert.deepEqual(['beds', 'bedsInUnit'].map((k) => parsePost('1 room in a 4 bed house', ctx)[k]), [1, 4]);
  assert.equal(parsePost('studio apartment', ctx).beds, 0);
  assert.equal(parsePost('unfurnished room', ctx).furnished, false);
  assert.equal(parsePost('fully furnished room', ctx).furnished, true);
  assert.equal(parsePost('room, utils incl', ctx).utilities, 'included');
  assert.equal(parsePost('room, + utilities', ctx).utilities, 'extra');
});

test('contact details are never extracted and redact() strips them', () => {
  const t = "Hi I'm Sarah! Room on Hill St, $650/mo. Text 734-555-0100 or sub@example.com, ig @sub.letter";
  const l = parsePost(t, ctx);
  assert.equal(l.contact, null);
  assert.ok(!JSON.stringify(l).includes('555'));
  const r = redact(t);
  assert.ok(!/Sarah|555|example|sub\.letter/.test(r), r);
  assert.match(r, /Hill St/);
  assert.equal(redact("I'm subletting my place"), "I'm subletting my place");
});

test('draftMessage: plain, under 90 words, only the post and the student facts', () => {
  const facts = { trip: { to: 'University Hospital', min: 14, mode: 'transit' }, tour: { day: 'Tuesday', time: '4:30 pm' } };
  for (const p of posts) {
    const l = byId[p.id];
    const d = draftMessage({ listing: l, facts, student: {} });
    assert.match(d, ASCII);
    assert.ok(d.split(/\s+/).length < 90, `${p.id}: ${d.split(/\s+/).length} words`);
    // the trip is stated only from a known point (a street corner or the student's pin)
    if (l.location.how === 'intersection') assert.match(d, /University Hospital is 14 minutes by bus\./);
    else assert.ok(!/minutes/.test(d), `${p.id}: ${d}`);
    assert.ok(!/works for my week/.test(d));
    assert.match(d, /Tuesday at 4:30 PM/);
    assert.ok(!/Sarah|Jordan|Maya/.test(d));
  }
  const d1 = draftMessage({ listing: byId.s1, facts, student: { firstName: 'Ana' } });
  assert.match(d1, /Hill Street near Church Street/);
  assert.match(d1, /May 1 to Aug 15/);
  assert.match(d1, /\$780 a month/);
  assert.match(d1, /Thanks, Ana$/);
  const d0 = draftMessage({ listing: byId.s5, facts: {}, student: { firstName: '  ' } });
  assert.match(d0, /Thanks!$/);
  assert.ok(!/minutes/.test(d0));
  // a pin makes the trip a fact about the house
  const pinned = { ...byId.s2, location: { lat: 42.28, lon: -83.74, how: 'pin', note: 'Your pin' } };
  assert.match(draftMessage({ listing: pinned, facts }), /14 minutes by bus/);
});

test('draftMessage: guessed dates are not stated as the post\'s dates', () => {
  const l = parsePost('Room on S State St, available Fall 2027, $850/mo', ctx);
  assert.equal(l.confidence.start, 'guessed');
  const d = draftMessage({ listing: l, facts: { trip: { to: 'Beyster Building', min: 15, mode: 'transit' } } });
  assert.match(d, /Is it still open for the fall at \$850 a month\?/);
  assert.ok(!/Sep 1|Dec 31|minutes/.test(d), d);
  const edited = { ...l, start: '2027-09-01', end: '2027-12-20', confidence: { ...l.confidence, start: 'edited', end: 'edited' } };
  assert.match(draftMessage({ listing: edited }), /for Sep 1 to Dec 20/);
});

test('a street the map does not have is kept, never swapped for the cross street', () => {
  const l = parsePost('$1,050 per person, 4 bed house on Packard near Hill, Sept 1 to Aug 31.', ctx);
  assert.equal(l.street, 'Packard');
  assert.equal(l.cross, 'Hill Street');
  assert.equal(shortName(l), 'Packard near Hill St');
  assert.equal(l.location.how, 'street');
  assert.match(l.location.note, /Packard is not on our street map/);
  assert.ok(NEAR_AA(l.location));
  assert.equal(l.confidence.location, 'guessed');
  assert.ok(!dedupeKey(l).startsWith('|hill street'));
  assert.match(draftMessage({ listing: l }), /on Packard near Hill Street/);
  const t = parsePost('Room on Packard St, $800/mo', ctx);
  assert.equal(t.street, 'Packard Street');
  assert.equal(t.location.how, null);
  // plain words after "on" are not streets
  assert.equal(parsePost('Room near the Union, ask on Monday and Hill is close, $700/mo', ctx).street !== 'Monday', true);
  assert.equal(parsePost('Posted on Facebook near State, $700/mo', ctx).street, 'South State Street');
  // known streets still work as before
  assert.equal(byId.s1.street, 'Hill Street');
});

test('covers: summer only for a fall student, a winter sublet covers winter', () => {
  const fall = { start: '2027-09-01', end: '2027-12-15', label: 'Fall 2027' };
  const winter = { start: '2027-01-06', end: '2027-04-25', label: 'Winter 2027' };
  assert.deepEqual(covers(byId.s1, fall), { ok: false, note: 'ends Aug 15: summer only' });
  assert.equal(covers(byId.s2, winter).ok, true);
  assert.equal(covers(byId.s3, winter).ok, true);
  assert.equal(covers(byId.s4, fall).ok, true);
  assert.equal(covers({ start: null, end: null }, fall).ok, null);
});

test('parsing every sample post takes under 50 ms each once the street index is built', () => {
  streetIndex(streets);
  for (const p of posts) {
    const t = performance.now();
    parsePost(p.text, ctx);
    assert.ok(performance.now() - t < 50, p.id);
  }
});
