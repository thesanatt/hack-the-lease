// Fit scores for the Listings tab (docs/ROUND3.md part 2) and the "Email it" link (part 3). Pure, no React.
//
// Every score comes from dollars a month in the app's one utility model (engine/explain.js pieces):
//   Price           rent (roomPrice: asking rent plus utilities share)
//   Getting around  the time piece: vTime * travel hours a month
//   Nights          the dark and strand pieces: vDark * dark hours + vStrand * trips with no ride, a month
//   Dates           100 when the post covers the chosen semester, 0 when it does not, 50 when a date is a guess
// A category is 100 for the place with the fewest dollars among the compared places and 0 for the most, a
// straight line in dollars between them. The overall Fit maps cost to you a month the same way (among the places
// that do not miss the semester) and is 0 when Dates is 0.

export const CATEGORIES = [
  { key: 'price', label: 'Price', title: 'Rent a month, against the other places here' },
  { key: 'around', label: 'Getting around', title: 'What your travel time costs you a month, against the other places here' },
  { key: 'nights', label: 'Nights', title: 'What dark walks and trips with no ride cost you a month, against the other places here' },
  { key: 'dates', label: 'Dates', title: 'Does the lease cover the semester you need it for' },
];

// 100 for lo, 0 for hi, linear between; every value 100 when they are all the same.
export function scale(v, lo, hi) {
  if (!Number.isFinite(v)) return null;
  if (!(hi - lo > 1e-9)) return 100;
  return Math.round(Math.max(0, Math.min(100, (100 * (hi - v)) / (hi - lo))));
}

const span = (xs) => {
  const f = xs.filter(Number.isFinite);
  return f.length ? [Math.min(...f), Math.max(...f)] : [0, 0];
};

// Dates score from listing.covers(listing, sem) ({ ok: true | false | null }) and the listing's confidence.
// A sample home (no cover) is a full-year lease: 100.
export function datesScore(cover, confidence = {}) {
  if (!cover) return 100;
  if (cover.ok === false) return 0;
  if (cover.ok == null) return 50;
  return confidence.start === 'guessed' || confidence.end === 'guessed' ? 50 : 100;
}

// rows: [{ id, cost, dollars: { rent, time, dark, strand } }]; dates(row) -> 0 | 50 | 100 (default 100).
// Returns Map id -> { fit, price, around, nights, dates }.
export function fitScores(rows, { dates = () => 100 } = {}) {
  const list = (rows || []).filter((r) => Number.isFinite(r?.cost));
  const out = new Map();
  if (!list.length) return out;
  const d = new Map(list.map((r) => [r.id, dates(r) ?? 100]));
  const night = (r) => (r.dollars ? (r.dollars.dark ?? 0) + (r.dollars.strand ?? 0) : NaN);
  const [pLo, pHi] = span(list.map((r) => r.dollars?.rent));
  const [aLo, aHi] = span(list.map((r) => r.dollars?.time));
  const [nLo, nHi] = span(list.map(night));
  const live = list.filter((r) => d.get(r.id) > 0);
  const [cLo, cHi] = span(live.map((r) => r.cost));
  for (const r of list) {
    const dt = d.get(r.id);
    out.set(r.id, {
      fit: dt === 0 ? 0 : scale(r.cost, cLo, cHi),
      price: scale(r.dollars?.rent, pLo, pHi),
      around: scale(r.dollars?.time, aLo, aHi),
      nights: scale(night(r), nLo, nHi),
      dates: dt,
    });
  }
  return out;
}

export const FIT_TITLE = 'Fit is 100 for the lowest cost to you a month among these places and 0 for the highest, '
  + 'a straight line in dollars, and 0 when the lease misses the semester.';

// The mean of each value over the draws (theta is linear in every piece, so the mean theta gives the mean pieces).
export function meanTheta(thetas) {
  const out = {};
  if (!thetas?.length) return out;
  for (const k of Object.keys(thetas[0])) {
    if (typeof thetas[0][k] !== 'number') continue;
    let s = 0;
    for (const t of thetas) s += t[k];
    out[k] = s / thetas.length;
  }
  return out;
}

// A plain email address the student typed, or null.
export function cleanEmail(s) {
  const t = String(s || '').trim();
  return /^[^\s@<>()",;:?&=/#%]+@[^\s@<>()",;:?&=/#%]+\.[A-Za-z]{2,}$/.test(t) ? t : null;
}

// mailto: link for a draft. Subject "Your post: <title>", the draft as the body, To from the optional field.
export function mailtoHref({ to = '', title = '', body = '' } = {}) {
  const enc = (s) => encodeURIComponent(s);
  const addr = cleanEmail(to);
  const subject = `Your post: ${String(title || 'your listing').trim()}`;
  const text = String(body || '').replace(/\r?\n/g, '\r\n');
  return `mailto:${addr ? enc(addr).replace(/%40/g, '@') : ''}?subject=${enc(subject)}&body=${enc(text)}`;
}
