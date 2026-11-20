// Number formatting for the Me view. Plain ASCII.
export const money = (v, digits = 0) => {
  if (v == null || !Number.isFinite(v)) return '--';
  const s = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return `${v < 0 ? '-' : ''}$${s}`;
};
export const signedMoney = (v) => (v == null || !Number.isFinite(v) ? '--' : `${v >= 0 ? '+' : '-'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`);
export const hm = (min) => {
  if (min == null || !Number.isFinite(min)) return '--';
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
export const pct = (p) => (p == null || !Number.isFinite(p) ? '--' : `${Math.round(p * 100)}%`);
export const MODE_LABEL = { walk: 'Walk', bike: 'Bike', transit: 'Bus' };
