// Writes web/public/data/listing_details.json: SYNTHETIC landlord-style details for the 30 SYNTHETIC homes
// (description, move-in date, lease, deposit, utilities, laundry, parking, pets, heat and cooling, kitchen,
// outdoor space, furnishing). Made up for the demo, seeded, and consistent with each home's own rooms and kind.
// Run: node scripts/make_listing_details.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { rng } from '../engine/rng.js';

const homesFile = JSON.parse(readFileSync(new URL('../web/public/data/homes.json', import.meta.url)));
const homes = homesFile.homes;

const AREA_LINE = {
  'South Central': 'a few blocks south of the Diag, close to State Street shops and the IM Building',
  'Lower Town': 'in Lower Town by the Broadway bridge, between Kerrytown and North Campus',
  'North Campus': 'on North Campus, near the engineering buildings and the Commons',
  'East University': 'on the east side of Central Campus, a short walk to East Quad and South U',
  'Burns Park': 'in quiet, tree-lined Burns Park, near the park and the elementary school',
  'Old West Side': 'in the Old West Side, a short walk to Main Street restaurants',
  'Medical Campus': 'by the Medical Campus, a short walk to the hospital and Taubman Library',
  Kerrytown: 'in Kerrytown, around the corner from the Farmers Market',
  'Old Fourth Ward': 'in the Old Fourth Ward, between Kerrytown and Central Campus',
};

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

function details(h, i) {
  const r = rng(1000 + i * 17);
  const n = h.rooms.length;
  const house = h.kind === 'house';
  const priv = h.rooms.filter((x) => x.bath === 'private').length;
  const half = h.rooms.filter((x) => x.bath === 'half').length;
  const sharedBaths = Math.max(1, Math.round((n - priv) / 2.5));
  const bright = h.rooms.filter((x) => (x.light ?? 1) >= 2).length;
  const big = Math.max(...h.rooms.map((x) => x.sqft));
  const year = house ? pick(r, [1912, 1924, 1928, 1936, 1948, 1955]) : pick(r, [1968, 1985, 1999, 2008, 2016]);
  const furnished = pick(r, house ? ['Unfurnished', 'Partly furnished (beds and desks)', 'Unfurnished'] : ['Furnished', 'Unfurnished', 'Partly furnished (beds and desks)']);
  const laundry = house ? pick(r, ['Washer and dryer in the basement, free', 'Washer and dryer in the basement, free', 'Coin laundry in the basement'])
    : pick(r, ['Washer and dryer in the unit', 'Shared laundry room on each floor', 'Washer and dryer in the unit']);
  const spots = house ? pick(r, [0, 1, 2, 2, 3]) : pick(r, [0, 1, 1, 2]);
  const parking = spots ? `${spots} driveway spot${spots > 1 ? 's' : ''}, ${money(pick(r, [40, 50, 60, 75]))}/mo each` : 'Street parking only (city permit)';
  const pets = pick(r, ['No pets', 'Cats allowed, $300 pet deposit', 'No pets', 'Cats and small dogs allowed, $40/mo pet rent']);
  const heat = house ? pick(r, ['Gas forced-air heat', 'Hot-water radiators', 'Gas forced-air heat']) : pick(r, ['Gas forced-air heat', 'Electric baseboard heat']);
  const cool = house ? pick(r, ['window AC units in each bedroom', 'no air conditioning', 'central air']) : pick(r, ['central air', 'central air', 'wall AC unit']);
  const dish = pick(r, [true, true, false]);
  const outdoor = house ? pick(r, ['Front porch and a small fenced yard', 'Back deck', 'Front porch', 'Shared backyard with a grill'])
    : pick(r, ['Small balcony', 'No private outdoor space', 'Shared courtyard']);
  const internet = pick(r, ['Internet included (fiber)', 'Internet not included', 'Internet included']);
  const moveIn = pick(r, ['Aug 22, 2027', 'Aug 25, 2027', 'Aug 29, 2027', 'Sep 1, 2027']);
  const sep = moveIn.startsWith('Sep');
  const lease = sep ? '12 months, Sep 2027 to Aug 2028'
    : pick(r, ['12 months, Aug 2027 to Jul 2028', '12 months, Aug 2027 to Jul 2028', '8 months, Aug 2027 to Apr 2028']);
  const perRoom = Math.round((h.utilities || 0) / n);
  const utilities = pick(r, ['gas, electric and water', 'gas and electric (water included in rent)', 'electric only (heat and water included)']);
  const quiet = house && h.area === 'Burns Park' ? 'Quiet residential street' : pick(r, ['Quiet street', 'Busy street, some traffic noise', 'Quiet street']);

  const features = [
    priv ? `${priv} private bathroom${priv > 1 ? 's' : ''}` : null,
    bright ? `${bright} sunny room${bright > 1 ? 's' : ''}` : null,
    dish ? 'dishwasher' : null,
    /unit|basement, free/.test(laundry) ? 'free laundry' : null,
    cool === 'central air' ? 'central air' : null,
  ].filter(Boolean);
  const intro = house
    ? `${pick(r, ['Classic', 'Updated', 'Roomy', 'Bright', 'Well-kept'])} ${n}-bedroom house built in ${year}, ${AREA_LINE[h.area] || `in ${h.area}`}.`
    : `${pick(r, ['Modern', 'Updated', 'Clean', 'Bright'])} ${n}-bedroom apartment${year >= 2000 ? ` in a ${year} building` : ''}, ${AREA_LINE[h.area] || `in ${h.area}`}.`;
  const middle = `Bedrooms run ${Math.min(...h.rooms.map((x) => x.sqft))} to ${big} sq ft${features.length ? `, with ${features.slice(0, 3).join(', ')}` : ''}.`;
  const close = pick(r, [
    'Rented by the room or as a whole house; groups welcome.',
    'Ideal for a group of friends. Tours on weekday evenings.',
    'Professionally managed, 24-hour maintenance line.',
    'Owner-managed. Snow removal and lawn care included.',
  ]);

  return {
    id: h.id,
    headline: house ? `${n}-bed house in ${h.area}` : `${n}-bed apartment in ${h.area}`,
    description: `${intro} ${middle} ${close}`,
    built: year,
    available: moveIn,
    lease,
    deposit: `One month's rent per room`,
    utilities: `About ${money(perRoom)} per room a month for ${utilities}`,
    internet,
    furnished,
    laundry,
    parking,
    pets,
    heatCool: `${heat}, ${cool}`,
    kitchen: `Full kitchen, ${dish ? 'dishwasher, ' : ''}gas range, fridge`,
    bathrooms: `${priv ? `${priv} private, ` : ''}${half ? `${half} half, ` : ''}${sharedBaths} shared`,
    outdoor,
    street: quiet,
    smoking: 'Smoke-free',
    // Fictional contact: example.com is reserved for examples, and 555-0100 to 555-0199 are fictional numbers.
    contact: { name: `${(h.street || h.area).replace(/ Street$/, ' St').replace(/ Avenue$/, ' Ave')} Leasing (sample)`, email: `leasing-${h.id}@example.com`, phone: `(734) 555-01${String(i).padStart(2, '0')}` },
    flags: {
      pets: !/^No pets/.test(pets), parking: spots > 0, furnished: /^Furnished|Partly/.test(furnished),
      laundryFree: /unit|basement, free/.test(laundry), centralAir: cool === 'central air', quiet: /^Quiet/.test(quiet),
      internet: /^Internet included/.test(internet), dishwasher: dish,
    },
  };
}

const out = {
  label: 'SYNTHETIC listing details, made up for the demo. Not real listings, landlords or prices.',
  details: homes.map(details),
};
writeFileSync(new URL('../web/public/data/listing_details.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${out.details.length} listing details`);
