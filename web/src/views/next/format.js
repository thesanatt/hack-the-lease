// Number formats for the Next semester tab. Dollars are per month and rounded to whole dollars.
export const money = (v) => (Number.isFinite(v) ? `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}` : '-');
export const moneyRange = (a, b) => `${money(a)} to ${money(b)}`;
export const pct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : '-');

const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

// The one sentence under "What to find out first". factor: { label, kind }, value: $/month.
export function findOutSentence(top) {
  if (!top || !(top.value >= 1)) return 'Nothing left to find out is worth $1 a month: sign the home that loses least.';
  const label = String(top.label || 'this');
  let what;
  if (top.kind === 'choice') what = `Decide ${lowerFirst(label)}`;
  else if (top.kind === 'maybe') what = `Find out about the ${lowerFirst(label)}`;
  else what = `Find out your ${label}`;
  return `${what} before you sign: it is worth ${money(top.value)} a month.`;
}

// Wall time for the routing line: tenths of a second from 0.1 s up, whole milliseconds below.
export const seconds = (ms) => (!Number.isFinite(ms) ? '-' : ms >= 95 ? `${(ms / 1000).toFixed(1)} s` : `${Math.max(1, Math.round(ms))} ms`);

// The one quiet line under the map: "113,790 door-to-door trips routed in 1.0 s, in this browser". routing comes
// from runNextYear; null when nothing was routed.
export function speedLine(routing) {
  if (!routing || !(routing.trips > 0)) return null;
  return `${Math.round(routing.trips).toLocaleString('en-US')} door-to-door trips routed in ${seconds(routing.ms)}, in this browser`;
}
