// Plain words for the simple view of Listings (docs/SIMPLE.md). Pure, no React. Every sentence is built from
// numbers the tab already computes (fit.fitScores, listing.covers, the ranked rows); nothing here is invented.

const GOOD = { price: 'low rent', around: 'short trips', nights: 'easy trips home at night' };
const BAD = { price: 'high rent', around: 'long trips', nights: 'hard trips home at night' };
const KEYS = ['price', 'around', 'nights'];
const HI = 67;
const LO = 33;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// One plain line for a place, from its Fit entry ({ fit, price, around, nights, dates }) and, for a pasted post,
// its cover ({ ok, note } from listing.covers). Returns a short sentence or null.
export function fitLine(s, cover) {
  if (cover?.ok === false && cover.note) return `${cap(cover.note)}.`;
  if (!s) return null;
  if (s.dates === 0) return 'Misses the semester you need.';
  const scored = KEYS.filter((k) => Number.isFinite(s[k]));
  const good = scored.filter((k) => s[k] >= HI).sort((a, b) => s[b] - s[a]);
  const bad = scored.filter((k) => s[k] <= LO).sort((a, b) => s[a] - s[b]);
  let line;
  if (scored.length && good.length === scored.length) line = 'Good on every count here.';
  else if (good.length && bad.length) line = `${cap(GOOD[good[0]])}, but ${BAD[bad[0]]}.`;
  else if (good.length) line = `${cap(GOOD[good[0]])}, no big downside.`;
  else if (bad.length) line = `Watch out: ${BAD[bad[0]]}.`;
  else line = 'In the middle on rent and trips.';
  return s.dates === 50 ? `${line} Check the dates.` : line;
}

// The line for a post that has no Fit yet: what the student can do about it.
export function missingLine(l, routable) {
  if (!l) return null;
  const needRent = !Number.isFinite(l.rent);
  const needPin = !routable;
  if (needRent && needPin) return 'Add the rent and drop a pin to see its Fit.';
  if (needRent) return 'Add the rent to see its Fit.';
  if (needPin) return 'Drop a pin to see its Fit.';
  return null;
}

const monthOf = (iso) => (iso && /^\d{4}-\d{2}/.test(iso) ? MONTHS[+iso.slice(5, 7) - 1] : null);

// The answer above the comparison, one sentence. rows are the ranked rows (cost order, posts and sample homes);
// coverOf(row) -> { ok, note } for a post; endOf(row) -> the post's end date (ISO) or null; money formats dollars.
// The one number is the gap in cost to you a month between the best usable post and the best sample home.
export function answerSentence(rows, money, { coverOf = () => null, endOf = () => null, semLabel = 'that semester' } = {}) {
  const posts = (rows || []).filter((r) => r.kind === 'post');
  if (!posts.length) return null;
  const home = rows.find((r) => r.kind === 'home');
  const usable = posts.filter((r) => coverOf(r)?.ok !== false);
  if (!usable.length) {
    return home
      ? `None of your posts covers ${semLabel}, so ${home.name} is still your best bet.`
      : `None of your posts covers ${semLabel}.`;
  }
  const a = usable[0];
  if (!home || !Number.isFinite(a.cost) || !Number.isFinite(home.cost)) return `Your best find is ${a.name}.`;
  const d = Math.round(home.cost - a.cost);
  if (d < 0) return `Your best post is ${a.name}, but ${home.name} costs you ${money(-d)} a month less.`;
  const end = monthOf(endOf(a));
  const dateGuess = coverOf(a)?.ok == null;
  const tail = dateGuess ? ', but check its dates' : end ? `, but it ends in ${end}` : '';
  const gap = d === 0 ? 'it costs you the same as the best sample home' : `it costs you ${money(d)} a month less than the best sample home`;
  return `Your best find is ${a.name}: ${gap}${tail}.`;
}
