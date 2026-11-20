// "Your possible weeks": one dot strip per top-6 home (one dot per possible week's monthly cost, the 10th to
// 90th percentile as a band, the home that loses least in green), and where the classes would be by campus.
// Props: res, selected (homeId), onSelect(homeId)
import { useEffect, useRef, useState } from 'react';
import { AREA_COLOR, OTHER_COLOR } from '../me/calendar/areas.js';
import { money, pct } from './format.js';

const ROW = 30;
const PAD_L = 8, PAD_R = 12;

function useWidth(fallback = 720) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

function niceTicks(lo, hi, n = 5) {
  const span = Math.max(hi - lo, 1);
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

// deterministic vertical spread so dots at the same cost do not hide each other
const jitter = (i) => ((i * 0.6180339887) % 1) - 0.5;

export default function Weeks({ res, selected, onSelect }) {
  const [ref, width] = useWidth();
  const { costs, rank, homeById, campus } = res;
  const top = rank.slice(0, 6);
  const hIdx = new Map(costs.homeIds.map((id, i) => [id, i]));
  const rows = top.map((r, i) => {
    const h = hIdx.get(r.homeId);
    const vals = new Float64Array(costs.K);
    for (let s = 0; s < costs.K; s++) vals[s] = costs.cost[s * costs.H + h];
    const sorted = Float64Array.from(vals).sort();
    return { r, i, vals, p10: quantile(sorted, 0.1), p90: quantile(sorted, 0.9), mean: vals.reduce((a, b) => a + b, 0) / (vals.length || 1) };
  });
  let lo = Infinity, hi = -Infinity;
  for (const row of rows) for (const v of row.vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  const padV = Math.max(5, (hi - lo) * 0.04);
  lo -= padV; hi += padV;
  const plotW = Math.max(120, width - PAD_L - PAD_R);
  const x = (v) => PAD_L + ((v - lo) / (hi - lo)) * plotW;
  const ticks = niceTicks(lo, hi);
  const r = costs.K > 120 ? 2.4 : 3;

  return (
    <section className="you-sec nx-sec" aria-labelledby="nx-weeks">
      <h2 id="nx-weeks">Your possible weeks</h2>
      <div className="nx-weeks">
        <div className="nx-strips">
          {rows.map((row) => {
            const id = row.r.homeId;
            const safest = row.i === 0;
            const color = safest ? '#1F6F4A' : '#6B6B6B';
            return (
              <button key={id} type="button" className={`nx-strip${selected === id ? ' sel' : ''}`} onClick={() => onSelect(id)}
                title={`${homeById.get(id)?.name}: ${money(row.p10)} to ${money(row.p90)} a month, best in ${pct(row.r.pBest)}`}>
                <span className="nx-strip-l">
                  <span className={`nx-rank${safest ? ' first' : ''}`}>{row.i + 1}</span>
                  <span className="nx-strip-name">{homeById.get(id)?.name}</span>
                </span>
                <span className="nx-strip-plot" ref={row.i === 0 ? ref : undefined}>
                  <svg width={width} height={ROW} viewBox={`0 0 ${width} ${ROW}`} aria-hidden="true">
                    <rect x={x(row.p10)} y={4} width={Math.max(1, x(row.p90) - x(row.p10))} height={ROW - 8} rx={3}
                      fill={safest ? '#e3eee7' : '#efebe2'} />
                    {Array.from(row.vals, (v, s) => (
                      <circle key={s} cx={x(v)} cy={ROW / 2 + jitter(s) * (ROW - 12)} r={r} fill={color} fillOpacity={safest ? 0.7 : 0.45} />
                    ))}
                    <line x1={x(row.mean)} x2={x(row.mean)} y1={3} y2={ROW - 3} stroke="#1A1A1A" strokeWidth={1.5} />
                  </svg>
                </span>
              </button>
            );
          })}
          <div className="nx-axis">
            <span className="nx-strip-l" />
            <svg width={width} height={22} viewBox={`0 0 ${width} 22`} aria-hidden="true">
              <line x1={PAD_L} x2={PAD_L + plotW} y1={0.5} y2={0.5} stroke="#DEDAD2" />
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={x(t)} x2={x(t)} y1={0} y2={5} stroke="#DEDAD2" />
                  <text x={x(t)} y={18} textAnchor="middle" className="nx-tick">{money(t)}</text>
                </g>
              ))}
            </svg>
          </div>
          <p className="nx-cap">One dot per possible week, in dollars a month. The line is the average.</p>
        </div>
        <div className="nx-campus">
          <h3>Where your classes would be</h3>
          <div className="nx-stack" role="img"
            aria-label={campus.map((c) => `${c.area} ${pct(c.share)}`).join(', ')}>
            {campus.map((c) => (
              <span key={c.area} style={{ width: `${c.share * 100}%`, background: AREA_COLOR[c.area] || OTHER_COLOR }} />
            ))}
          </div>
          <ul className="nx-legend">
            {campus.map((c) => (
              <li key={c.area}><i style={{ background: AREA_COLOR[c.area] || OTHER_COLOR }} />{c.area} <b>{pct(c.share)}</b></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
