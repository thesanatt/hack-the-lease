// Hand-written SVG charts for the How we know tab and the pitch. Every value comes from the evidence files
// (web/public/data/evidence/*.json) through the readers below; nothing is typed in.
import { useState } from 'react';

export const C = {
  ink: '#1A1A1A', gray: '#6B6B6B', line: '#DEDAD2', paper: '#F7F5F0',
  green: '#1F6F4A', mid: '#8F8A80', light: '#C2BCB0', bad: '#9A1F1F', navy: '#27305A',
};

const fmt = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '-');

// ---------- readers ----------

// r5.json: matrix rows are [origin, home, ours_min, r5_min]; null means that router found no trip.
export function r5Diffs(r5) {
  const m = Array.isArray(r5?.matrix) ? r5.matrix : null;
  if (!m) return null;
  const counts = new Map();
  let both = 0, onlyOurs = 0, onlyR5 = 0, within2 = 0;
  for (const row of m) {
    const q = row?.[2], r = row?.[3];
    const qa = Number.isFinite(q), ra = Number.isFinite(r);
    if (qa && ra) {
      const d = Math.round(q - r);
      counts.set(d, (counts.get(d) || 0) + 1);
      both++;
      if (Math.abs(d) <= 2) within2++;
    } else if (qa) onlyOurs++;
    else if (ra) onlyR5++;
  }
  if (!both) return null;
  const keys = [...counts.keys()];
  const lo = Math.min(...keys, -2), hi = Math.max(...keys, 2);
  const bins = [];
  for (let d = lo; d <= hi; d++) bins.push({ d, n: counts.get(d) || 0 });
  return { bins, both, onlyOurs, onlyR5, within2, pairs: m.length };
}

// recovery.json: results[] with perPick[] per policy, set (off-prior or prior) and answer noise.
export function regretSeries(rec, set = 'off-prior', tau = 1) {
  const res = Array.isArray(rec?.results) ? rec.results : null;
  if (!res) return null;
  const setOf = (r) => r.set || (r.offPrior ? 'off-prior' : 'prior');
  const pick = (policy) => res.find((r) => r.policy === policy && setOf(r) === set && r.tauScale === tau);
  const out = ['bald', 'random', 'fixed'].map((p) => {
    const r = pick(p);
    if (!r || !Array.isArray(r.perPick)) return null;
    return { policy: p, pts: r.perPick.filter((x) => Number.isFinite(x.pick) && Number.isFinite(x.regretMean)).map((x) => ({ pick: x.pick, v: x.regretMean, top1: x.top1 })) };
  }).filter(Boolean);
  return out.length ? out : null;
}

export function recoveryComparison(rec, set = 'off-prior', tau = 1, vs = 'random') {
  return (rec?.comparisons || []).find((c) => c.set === set && c.tauScale === tau && c.vs === vs) || null;
}

// ---------- histogram: our minutes minus R5 minutes ----------
export function DiffHistogram({ data, height = 260, compact = false }) {
  const [hover, setHover] = useState(null);
  if (!data) return null;
  const W = compact ? 420 : 640, H = height, L = compact ? 8 : 40, R = 8, T = compact ? 10 : 26, B = compact ? 26 : 46;
  const n = data.bins.length;
  const band = (W - L - R) / n;
  const barW = Math.min(24, band - 2);
  const max = Math.max(...data.bins.map((b) => b.n));
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const yTicks = niceTicks(max, compact ? 2 : 4);
  const bar = (b, i) => {
    const x = L + i * band + (band - barW) / 2, y = Y(b.n), h = H - B - y;
    const near = Math.abs(b.d) <= 2;
    const r = Math.min(4, h / 2, barW / 2);
    return (
      <g key={b.d} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
        <rect x={L + i * band} y={T} width={band} height={H - T - B} fill="transparent" />
        {b.n > 0 && <path d={roundTop(x, y, barW, h, r)} fill={near ? C.green : C.light} opacity={hover == null || hover === i ? 1 : 0.55} />}
      </g>
    );
  };
  const hb = hover != null ? data.bins[hover] : null;
  return (
    <svg className="hk-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`Difference in trip minutes, our router minus R5, over ${data.both} trips both reach. ${data.within2} of them within 2 minutes.`}>
      {!compact && yTicks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke={C.line} strokeWidth="1" />
          <text x={L - 6} y={Y(t) + 4} textAnchor="end" className="hk-tick">{fmt(t)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={C.ink} strokeWidth="1" />
      {data.bins.map(bar)}
      {data.bins.map((b, i) => (compact ? b.d % 2 === 0 : true) && (
        <text key={b.d} x={L + i * band + band / 2} y={H - B + 16} textAnchor="middle" className={`hk-tick${b.d === 0 ? ' hk-tick-strong' : ''}`}>{b.d > 0 ? `+${b.d}` : b.d}</text>
      ))}
      {!compact && <text x={L} y={H - 6} className="hk-axis">Ours faster</text>}
      {!compact && <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="hk-axis">minutes, ours minus R5</text>}
      {!compact && <text x={W - R} y={H - 6} textAnchor="end" className="hk-axis">R5 faster</text>}
      {hb && (() => {
        const i = hover, cx = L + i * band + band / 2;
        const label = `${fmt(hb.n)} trips at ${hb.d > 0 ? '+' : ''}${hb.d} min`;
        const w = label.length * 7.2 + 16;
        const x = Math.max(L, Math.min(W - R - w, cx - w / 2));
        const y = Math.max(2, Y(hb.n) - 30);
        return (
          <g pointerEvents="none">
            <rect x={x} y={y} width={w} height={22} rx="4" fill="#fff" stroke={C.line} />
            <text x={x + 8} y={y + 15} className="hk-tip">{label}</text>
          </g>
        );
      })()}
    </svg>
  );
}

// ---------- regret curves ----------
const POLICY = {
  bald: { name: 'Our questions', color: C.green, w: 2.5 },
  random: { name: 'Random pairs', color: C.mid, w: 2 },
  fixed: { name: 'Fixed list', color: C.light, w: 2 },
};

export function RegretCurves({ series, height = 300, compact = false }) {
  const [hover, setHover] = useState(null);
  if (!series?.length) return null;
  const W = compact ? 420 : 640, H = height, L = compact ? 40 : 48, R = compact ? 10 : 118, T = 16, B = compact ? 26 : 40;
  const all = series.flatMap((s) => s.pts);
  const x1 = Math.max(...all.map((p) => p.pick));
  const yMax = Math.max(...all.map((p) => p.v));
  const ticks = niceTicks(yMax, compact ? 2 : 4);
  const top = ticks[ticks.length - 1];
  const X = (x) => L + (x / (x1 || 1)) * (W - L - R);
  const Y = (v) => T + (1 - v / top) * (H - T - B);
  const order = [...series].sort((a, b) => (a.policy === 'bald' ? 1 : b.policy === 'bald' ? -1 : 0));
  // end labels: spread apart when they collide, with a short leader to the line end
  const ends = series.map((s) => ({ s, y: Y(s.pts[s.pts.length - 1].v) })).sort((a, b) => a.y - b.y);
  ends.forEach((e, k) => { e.ly = k ? Math.max(e.y, ends[k - 1].ly + 18) : e.y; });
  return (
    <svg className="hk-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`Average dollars a month lost to the wrong home, after each question. ${series.map((s) => `${POLICY[s.policy]?.name}: ${fmt(s.pts[0].v)} at start, ${fmt(s.pts[s.pts.length - 1].v)} after ${s.pts[s.pts.length - 1].pick}`).join('. ')}.`}
      onMouseLeave={() => setHover(null)}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? C.ink : C.line} strokeWidth="1" />
          <text x={L - 6} y={Y(t) + 4} textAnchor="end" className="hk-tick">${fmt(t)}</text>
        </g>
      ))}
      {Array.from({ length: x1 + 1 }, (_, k) => (
        <text key={k} x={X(k)} y={H - B + 16} textAnchor="middle" className="hk-tick">{k}</text>
      ))}
      {!compact && <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="hk-axis">questions answered</text>}
      {hover != null && <line x1={X(hover)} x2={X(hover)} y1={T} y2={H - B} stroke={C.gray} strokeWidth="1" />}
      {order.map((s) => {
        const p = POLICY[s.policy] || { color: C.mid, w: 2 };
        const d = s.pts.map((q, k) => `${k ? 'L' : 'M'}${X(q.pick).toFixed(1)},${Y(q.v).toFixed(1)}`).join(' ');
        const last = s.pts[s.pts.length - 1];
        return (
          <g key={s.policy}>
            <path d={d} fill="none" stroke={p.color} strokeWidth={p.w} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={X(last.pick)} cy={Y(last.v)} r="4.5" fill={p.color} stroke="#fff" strokeWidth="2" />
            {hover != null && s.pts.filter((q) => q.pick === hover).map((q) => <circle key="h" cx={X(q.pick)} cy={Y(q.v)} r="4" fill={p.color} stroke="#fff" strokeWidth="2" />)}
          </g>
        );
      })}
      {!compact && ends.map((e) => (
        <g key={e.s.policy}>
          {Math.abs(e.ly - e.y) > 2 && <line x1={W - R + 6} x2={W - R + 12} y1={e.y} y2={e.ly - 4} stroke={C.gray} strokeWidth="1" />}
          <text x={W - R + 14} y={e.ly} className={`hk-end${e.s.policy === 'bald' ? ' hk-end-strong' : ''}`}>{POLICY[e.s.policy]?.name}</text>
        </g>
      ))}
      {Array.from({ length: x1 + 1 }, (_, k) => (
        <rect key={k} x={X(k) - (W - L - R) / x1 / 2} y={T} width={(W - L - R) / (x1 || 1)} height={H - T - B} fill="transparent"
          onMouseEnter={() => setHover(k)} />
      ))}
      {hover != null && !compact && (() => {
        const rows = series.map((s) => ({ s, q: s.pts.find((q) => q.pick === hover) })).filter((r) => r.q);
        const w = 168, h = 22 + rows.length * 18;
        const x = X(hover) + 10 + w > W - 4 ? X(hover) - 10 - w : X(hover) + 10;
        return (
          <g pointerEvents="none">
            <rect x={x} y={T + 4} width={w} height={h} rx="4" fill="#fff" stroke={C.line} />
            <text x={x + 10} y={T + 20} className="hk-tip hk-tip-head">After {hover} question{hover === 1 ? '' : 's'}</text>
            {rows.map((r, k) => (
              <g key={r.s.policy}>
                <rect x={x + 10} y={T + 30 + k * 18} width="10" height="3" fill={POLICY[r.s.policy]?.color} />
                <text x={x + 26} y={T + 36 + k * 18} className="hk-tip">{POLICY[r.s.policy]?.name}</text>
                <text x={x + w - 10} y={T + 36 + k * 18} textAnchor="end" className="hk-tip">${fmt(r.q.v)}</text>
              </g>
            ))}
          </g>
        );
      })()}
    </svg>
  );
}

export function RegretLegend({ series }) {
  if (!series?.length) return null;
  return (
    <div className="hk-legend">
      {series.map((s) => (
        <span key={s.policy}><i style={{ background: POLICY[s.policy]?.color }} />{POLICY[s.policy]?.name}</span>
      ))}
    </div>
  );
}

// ---------- check grid: one square per tested house, grouped by how many people share it ----------
// lp.json F1: instances, envyFree, checkerOk, and byN {n: {instances}}. A square is green when the house is
// counted envy-free; the failed count, if any, is drawn red at the end of the grid.
export function CheckGrid({ lp, cols = 20, cell = 6, gap = 1, showLabels = true }) {
  const F1 = lp?.F1;
  if (!F1 || !F1.byN) return null;
  const groups = Object.entries(F1.byN).map(([n, v]) => ({ n: Number(n), k: v.instances })).filter((g) => g.k > 0).sort((a, b) => a.n - b.n);
  const failed = Math.max(0, (F1.instances ?? 0) - Math.min(F1.envyFree ?? 0, F1.checkerOk ?? 0));
  let failLeft = failed;
  const blocks = groups.map((g) => ({ ...g, rows: Math.ceil(g.k / cols) }));
  const step = cell + gap;
  const bw = cols * step - gap;
  const H = Math.max(...blocks.map((b) => b.rows)) * step + (showLabels ? 22 : 0);
  const W = blocks.length * (bw + 16) - 16;
  const ty = Math.max(...blocks.map((b) => b.rows)) * step + 16;
  return (
    <svg className="hk-svg" viewBox={`0 0 ${W} ${H}`} width={W} style={{ maxWidth: '100%', height: 'auto' }} role="img"
      aria-label={`${fmt(F1.instances)} random houses, ${fmt(F1.envyFree)} envy-free, ${fmt(F1.checkerOk)} confirmed by a separate checker.`}>
      {blocks.map((b, bi) => {
        const ox = bi * (bw + 16);
        const cells = [];
        for (let i = 0; i < b.k; i++) {
          const fromEnd = blocks.slice(bi + 1).reduce((a, x) => a + x.k, 0) + (b.k - i);
          const bad = failLeft > 0 && fromEnd <= failed;
          cells.push(<rect key={i} x={ox + (i % cols) * step} y={Math.floor(i / cols) * step} width={cell} height={cell} fill={bad ? C.bad : C.green} />);
        }
        return (
          <g key={b.n}>
            {cells}
            {showLabels && <text x={ox} y={ty} className="hk-tick">{b.n} people</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- helpers ----------
function niceTicks(max, n) {
  if (!(max > 0)) return [0, 1];
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || 10 * mag;
  const out = [];
  for (let t = 0; t < max + step - 1e-9; t += step) out.push(Number(t.toPrecision(10)));
  return out;
}

// A bar with 4 px rounded top corners and a square foot on the baseline.
function roundTop(x, y, w, h, r) {
  if (h <= 0) return '';
  r = Math.max(0, Math.min(r, h));
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
