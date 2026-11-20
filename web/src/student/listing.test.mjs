import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, validRequirement, checkRequirements, listingRecord } from './listing.js';

const data = (f) => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url)));
const places = data('places.json'), homes = data('homes.json').homes, details = data('listing_details.json').details;
const api = {
  data: { places, placeById: new Map(places.map((p) => [p.id, p])), detailsById: new Map(details.map((d) => [d.id, d])) },
  planner: { walkSec: (a, b) => (b === 'ccrb' ? (a === 'h1' ? 600 : 1800) : 900) },
};

test('requirements: values, comparisons and unknowns', () => {
  assert.equal(evaluate(true, '=', 'yes'), true);
  assert.equal(evaluate(false, '=', 'yes'), false);
  assert.equal(evaluate(12, '<=', '15'), true);
  assert.equal(evaluate('2027-08-25', '<=', '2027-08-20'), false);
  assert.equal(evaluate('Cats allowed, $300 pet deposit', 'contains', 'cat'), true);
  assert.equal(evaluate(undefined, '=', 'yes'), null);
});

test('requirements: the model cannot invent fields, places or comparisons', () => {
  assert.equal(validRequirement({ label: 'Near Hadley', field: 'walk_min_to:ccrb', op: '<=', value: '15' }, api), null);
  assert.match(validRequirement({ label: 'x', field: 'walk_min_to:mars', op: '<=', value: '1' }, api), /unknown place/);
  assert.match(validRequirement({ label: 'x', field: 'sunshine_hours', op: '>=', value: '5' }, api), /unknown field/);
  assert.match(validRequirement({ label: 'x', field: 'rent', op: '~', value: '5' }, api), /unknown comparison/);
});

test('requirements: checked against each home from the data', () => {
  const reqs = [{ label: 'Near Hadley', field: 'walk_min_to:ccrb', op: '<=', value: '15' }, { label: 'Pets ok', field: 'pets_allowed', op: '=', value: 'yes' }];
  const h1 = homes.find((h) => h.id === 'h1');
  const r = checkRequirements(api, h1, null, reqs);
  assert.equal(r.asked, 2);
  assert.ok(r.yes.some((x) => /Near Hadley \(10 min\)/.test(x.text)));
  assert.equal(listingRecord(api, h1, null).bedrooms, h1.rooms.length);
});
