// Local view kit shared by GroupView, OperatorView and EvidenceView (owned by ui-views).
// Built locally so these views do not depend on the props of src/components/* while ui-shell writes them.
import React from 'react';
import './kit.css';

export function Panel({ title, kicker, right, className = '', children }) {
  return (
    <section className={`qv-panel ${className}`}>
      {(title || kicker || right) && (
        <header>
          <div>
            {kicker && <div className="qv-kicker">{kicker}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {right && <div className="qv-row">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pill({ tone = '', children, title }) {
  return <span className={`qv-pill ${tone}`} title={title}>{children}</span>;
}

export function Label({ children = 'SAMPLE DATA' }) {
  return <span className="qv-label">{children}</span>;
}

export function Stat({ label, value, note }) {
  return (
    <div className="qv-stat">
      <div className="v">{value}</div>
      <div className="l">{label}{note ? <span> . {note}</span> : null}</div>
    </div>
  );
}

export function Button({ tone = '', children, ...rest }) {
  return <button type="button" className={`qv-btn ${tone}`} {...rest}>{children}</button>;
}

// Calm placeholder for a module or file that is not built yet.
export function Pending({ what, detail }) {
  return (
    <div className="qv-pending" role="note">
      <b>{what}</b> is not built yet. {detail || 'This panel fills in when it lands.'}
    </div>
  );
}

export function Note({ tone = '', children }) {
  return <div className={`qv-note ${tone}`}>{children}</div>;
}

// Error boundary so one failing panel never takes the view down.
export class Guard extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error('[ui-views]', this.props.name, err); }
  render() {
    if (this.state.err) {
      return (
        <Note tone="bad">
          {this.props.name || 'This panel'} hit an error and is shown empty: {String(this.state.err.message || this.state.err)}
        </Note>
      );
    }
    return this.props.children;
  }
}

// ---------- formatting ----------
export const usd = (x, digits = 0) => {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${x < -0.5 * 10 ** -digits ? '-' : ''}$${s}`;
};
export const signedUsd = (x, digits = 0) => {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const r = Number(x.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};
export const pct = (x, digits = 0) => (x == null || !Number.isFinite(x) ? 'n/a' : `${(100 * x).toFixed(digits)}%`);
export const ms = (x) => (x == null || !Number.isFinite(x) ? 'n/a' : x < 10 ? `${x.toFixed(1)} ms` : `${Math.round(x)} ms`);

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ---------- api access, tolerant of a partly built adapter ----------
export function modOf(api, name) {
  try {
    if (!api) return null;
    if (typeof api.has === 'function' && !api.has(name)) return null;
    return typeof api.mod === 'function' ? api.mod(name) : null;
  } catch { return null; }
}

export function homesOf(api) {
  const h = api?.data?.homes;
  if (!h) return null;
  return Array.isArray(h) ? h : Array.isArray(h.homes) ? h.homes : null;
}
export function homesLabel(api) {
  const h = api?.data?.homes;
  return (h && !Array.isArray(h) && h.label) || 'SYNTHETIC homes';
}
export function personasOf(api) {
  const p = api?.data?.personas;
  if (!p) return null;
  return Array.isArray(p) ? p : Array.isArray(p.personas) ? p.personas : null;
}
export function configOf(api) {
  if (api?.config) return api.config;
  const c = modOf(api, 'config');
  return c?.CONFIG || null;
}

// Small seeded generator (same algorithm as engine/rng.js), kept local so views do not import engine files.
export function seeded(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  next.normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
