// Plain words for simple mode on the You tab. Every sentence here is built from numbers the view already has:
// the top home's explain note (engine/explain.js: fits and watch against the middle home) and its routed week.
// Nothing is invented: a clause appears only when the note or the week says so.

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
export const countWord = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const nights = (n) => `${countWord(n)} night${n === 1 ? '' : 's'} a week`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "Broadway St house, 5 bed" -> "Broadway St"
export function shortName(name) {
  if (!name) return '';
  return String(name).split(',')[0].replace(/\s+(house|apartment|apartments|duplex|condo|townhouse|flat|unit)$/i, '').trim();
}

// Days a week with a trip that has no way that fits the student's limits, and days with walking or biking after
// dusk. Same counting as lateNights in TopThree and PickCard.
export function nightCounts(week) {
  const noRide = new Set(), dark = new Set();
  for (const t of week?.trips || []) {
    if (t.stranded) noRide.add(t.day);
    else if ((t.darkMin || 0) > 0.5) dark.add(t.day);
  }
  const any = new Set([...noRide, ...dark]);
  return { noRide: noRide.size, dark: dark.size, any: any.size };
}

// A good reason from the note, as a clause that finishes "Live at X. ___".
const GOOD = {
  rent: 'the rent is lower than most',
  time: 'your trips are shorter than most',
  dark: 'you spend less time out after dark than most',
  strand: 'every trip has a ride',
  size: 'the room is bigger than most',
  light: 'the room gets more daylight than most',
};
function goodClause(r) {
  if (!r) return null;
  if (GOOD[r.key]) return GOOD[r.key];
  if (r.key === 'bath') return r.label === 'Private bathroom' ? 'you get your own bathroom' : null;
  return null;
}

// The answer for the top home: { lead: 'Live at Broadway St.', rest: '...' }.
// note: explain Note for that home (or null); week: its routed week (or null).
export function answerFor({ name, note, week }) {
  const lead = `Live at ${shortName(name)}.`;
  const c = nightCounts(week);
  // the night clause comes from the week itself, so skip note reasons that would say the same thing
  const skip = new Set(['dark', 'strand']);
  const good = (note?.fits || []).filter((r) => !r.absolute && !r.vs && r.dollars > 0 && !skip.has(r.key)).map(goodClause).find(Boolean) || null;
  let night;
  if (!week) night = null;
  else if (c.any === 0) night = 'you never walk in the dark';
  else if (c.noRide > 0) night = `you get stuck without a ride ${nights(c.noRide)}`;
  else night = `you walk in the dark ${nights(c.dark)}`;

  let rest;
  if (good && night) rest = `${cap(good)}, ${c.any === 0 ? 'and' : 'but'} ${night}.`;
  else if (good) rest = `${cap(good)}.`;
  else if (night && c.any === 0) rest = `It fits your week best, and ${night}.`;
  else if (night) rest = `It fits your week best, but ${night}.`;
  else rest = 'It fits your week best.';
  return { lead, rest };
}

// One plain reason for a top 3 card, from cardReasons' { key, good } (no number).
const PLAIN = {
  rent: (g) => (g ? 'Lower rent than a typical home' : 'Higher rent than a typical home'),
  time: (g) => (g ? 'Shorter trips than a typical home' : 'Longer trips than a typical home'),
  dark: (g) => (g ? 'Less time out after dark' : 'More time out after dark'),
  strand: (g) => (g ? 'A ride for every trip' : 'Some trips have no ride'),
  size: (g) => (g ? 'Bigger room than a typical home' : 'Smaller room than a typical home'),
  light: (g) => (g ? 'More daylight in the room' : 'Less daylight in the room'),
};
export const plainReason = (key, good, label) => (PLAIN[key] ? PLAIN[key](good) : label);

// The trade-off chart's sentence in plain words, from the same two points the chart marks.
// top, cheap: { name, x: cost to you a month, y: hours a week }; money: formatter.
export function plainTradeoff(top, cheap, money) {
  if (!top || !cheap) return null;
  if (cheap.id === top.id) return `${shortName(top.name)} also has the cheapest rent.`;
  const dCost = cheap.x - top.x;
  if (dCost >= 1) return `The cheapest rent, at ${shortName(cheap.name)}, ends up costing you ${money(dCost)} a month more than ${shortName(top.name)}.`;
  return `The cheapest rent, at ${shortName(cheap.name)}, costs you about the same as ${shortName(top.name)}, with ${cheap.y >= top.y ? 'longer' : 'shorter'} trips.`;
}
