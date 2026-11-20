// Number formats for the Next semester tab. Dollars are per month and rounded to whole dollars.
export const money = (v) => (Number.isFinite(v) ? `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}` : '-');
export const moneyRange = (a, b) => `${money(a)} to ${money(b)}`;
export const pct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : '-');

const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

// The one sentence under "What to find out first". factor: { label, kind }, value: $/month.
export function findOutSentence(top) {
  if (!top || !(top.value >= 1)) return 'Nothing left to find out is worth $1 a month: sign the home that loses least.';
  return `${findOutWhat(top)} before you sign: it is worth ${money(top.value)} a month.`;
}

// "Find out your PNE 350 clinical section", "Find out about the part-time job downtown", "Decide which elective".
export function findOutWhat(top) {
  const label = String(top?.label || 'this');
  if (top?.kind === 'choice') return `Decide ${lowerFirst(label)}`;
  if (top?.kind === 'maybe') return `Find out about the ${lowerFirst(label)}`;
  return `Find out your ${label}`;
}

// The answer at the top of the tab, in two short sentences built from the numbers the tab already shows.
// evpi: $/month of not knowing; top: the unknown worth most ({ label, kind, value }); settledAny: something is settled.
// Under 50 cents the price card says "Under $1", so the answer says sign now. Returns { parts: [a, b], bold }:
// the full answer is a + ' ' + b, and parts[bold] is the part to act on.
export function answerSentences(evpi, top, settledAny = false) {
  if (!(evpi >= 0.5)) return { parts: ['Sign now:', 'nothing about your schedule is worth finding out first.'], bold: 0 };
  const lead = `Not knowing ${settledAny ? 'the rest of ' : ''}your schedule costs you about ${money(evpi)} a month.`;
  if (top && top.value >= 1) return { parts: [lead, `${findOutWhat(top)} before you sign.`], bold: 1 };
  return { parts: [lead, 'No one thing is worth finding out first, so sign the safe pick.'], bold: 1 };
}

// One plain line for the safe home, from its chance of being the best home across the possible weeks.
export function safeLine(pBest) {
  if (pBest >= 0.9) return 'It is the best home for you in almost every week you could end up with.';
  if (pBest >= 0.5) return 'It is the best home for you in most of the weeks you could end up with.';
  return 'It costs you the least on average, whatever your schedule turns out to be.';
}

// Wall time for the routing line: tenths of a second from 0.1 s up, whole milliseconds below.
export const seconds = (ms) => (!Number.isFinite(ms) ? '-' : ms >= 95 ? `${(ms / 1000).toFixed(1)} s` : `${Math.max(1, Math.round(ms))} ms`);

// The one quiet line under the map: "113,790 door-to-door trips routed in 1.0 s, in this browser". routing comes
// from runNextYear; null when nothing was routed.
export function speedLine(routing) {
  if (!routing || !(routing.trips > 0)) return null;
  return `${Math.round(routing.trips).toLocaleString('en-US')} door-to-door trips routed in ${seconds(routing.ms)}, in this browser`;
}
