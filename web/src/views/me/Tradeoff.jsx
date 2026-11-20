// Trade-offs: every home as a dot, all in $/month (x) against hours a week getting around (y), colored by fit.
// The top pick is ringed and the home with the cheapest rent is marked. Hand-written SVG, one axis each way.
// Props: api, rank (decide.meRank), weekMap, fitById ({homeId: 0..1, 1 = best}), selected, onSelect(id)
import { useMemo, useState } from 'react';
import { money } from './format.js';
import { hours } from './TopThree.jsx';
import { priceFrom } from './HomeList.jsx';
import { FIT_STOPS, fitColor } from '../../components/MapView.jsx';

// One fit scale for the map and this chart: the stops and color function come from MapView.
export const FIT_RAMP = FIT_STOPS;
export { fitColor };

const W = 1200, H = 250, M = { l: 44, r: 20, t: 24, b: 38 };

function niceStep(span, n) {
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || raw;
}

export default function Tradeoff({ api, rank, weekMap, fitById, selected, onSelect }) {
  const [hover, setHover] = useState(null);
  const pts = useMemo(() => (rank || []).map((r, i) => {
    const w = weekMap?.get(r.homeId);
    const h = api.data.homeById.get(r.homeId);
    // from = the home's cheapest room with utilities (the "From" column): what "cheapest rent" means on screen.
    return { id: r.homeId, i, x: -r.meanU, y: w ? w.weeklyMin / 60 : null, price: r.price, from: h ? priceFrom(h) : r.price, name: h?.name || r.homeId };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), [rank, weekMap, api]);
  if (!pts.length) return <div className="to-chart ghost" aria-busy="true" />;

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const xStep = niceStep(Math.max(...xs) - Math.min(...xs) || 100, 5);
  const x0 = Math.floor(Math.min(...xs) / xStep) * xStep, x1 = Math.ceil(Math.max(...xs) / xStep) * xStep;
  // The y axis starts near the data, not at 0: hours sit in a narrow band and a zero base leaves half the chart empty.
  const yStep = niceStep((Math.max(...ys) - Math.min(...ys)) || 1, 4);
  const y0 = Math.max(0, Math.floor(Math.min(...ys) / yStep) * yStep);
  const y1 = Math.ceil(Math.max(...ys) / yStep) * yStep || yStep;
  const X = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  const Y = (v) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
  const xt = [], yt = [];
  for (let v = x0; v <= x1 + 1e-9; v += xStep) xt.push(v);
  for (let v = y0; v <= y1 + 1e-9; v += yStep) yt.push(Math.round(v * 100) / 100);

  const top = pts.find((p) => p.i === 0);
  const cheap = pts.filter((p) => Number.isFinite(p.from)).reduce((a, b) => (b.from < a.from ? b : a), pts[0]);
  const hov = pts.find((p) => p.id === hover);
  let sentence;
  if (top && cheap) {
    if (cheap.id === top.id) sentence = `Your top pick also has the cheapest rent, rooms from ${money(cheap.from)} a month.`;
    else {
      // Lead with money: the point of the chart is that the lowest rent is not the lowest cost to you.
      const dCost = cheap.x - top.x;
      if (dCost >= 1) {
        sentence = `The cheapest rent, rooms from ${money(cheap.from)}, costs you ${money(dCost)} a month more than your top pick, once time and late nights count.`;
      } else {
        const d = cheap.y - top.y;
        sentence = `The cheapest rent costs you ${hours(cheap.y * 60)} hours a week, ${hours(Math.abs(d) * 60)} ${d >= 0 ? 'more' : 'fewer'} than your top pick.`;
      }
    }
  }

  return (
    <div className="to">
      {sentence && <p className="to-sentence">{sentence}</p>}
      <div className="to-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${pts.length} homes by cost to you a month and hours a week getting around. ${sentence || ''} The full ranking table is under Details.`}
          onMouseLeave={() => setHover(null)}>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className="to-grid" />
              <text className="to-tick" x={M.l - 8} y={Y(v) + 4} textAnchor="end">{v}</text>
            </g>
          ))}
          {xt.map((v) => <text key={`x${v}`} className="to-tick" x={X(v)} y={H - M.b + 18} textAnchor="middle">{money(v)}</text>)}
          <text className="to-axis" x={W - M.r} y={H - 6} textAnchor="end">Cost to you, per month</text>
          <text className="to-axis" x={M.l} y={10} textAnchor="start">Hours a week getting around</text>
          {pts.slice().reverse().map((p) => (
            <circle key={p.id} cx={X(p.x)} cy={Y(p.y)} r={p.id === hover ? 8 : 6.5} fill={fitColor(fitById?.[p.id])}
              stroke="#1A1A1A" strokeOpacity="0.55" strokeWidth="1" />
          ))}
          {top && <circle cx={X(top.x)} cy={Y(top.y)} r="10" fill="none" stroke="#1A1A1A" strokeWidth="2" />}
          {cheap && cheap.id !== top?.id && (
            <rect x={X(cheap.x) - 9} y={Y(cheap.y) - 9} width="18" height="18" fill="none" stroke="#1A1A1A" strokeWidth="1.5" />
          )}
          {selected && selected !== top?.id && pts.find((p) => p.id === selected) && (() => {
            const s = pts.find((p) => p.id === selected);
            return <circle cx={X(s.x)} cy={Y(s.y)} r="9" fill="none" stroke="#6B6B6B" strokeWidth="1.5" />;
          })()}
          {/* In a dense cloud any in-plot label covers dots, so the two marked homes are named in the key below. */}
          {pts.map((p) => (
            <circle key={`h${p.id}`} cx={X(p.x)} cy={Y(p.y)} r="11" fill="transparent" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(p.id)} onClick={() => onSelect?.(p.id)}>
              <title>{`${p.name}: ${money(p.x)} a month cost to you, ${money(p.price)} with utilities for the room picked for you, rooms from ${money(p.from)}, ${hours(p.y * 60)} h a week`}</title>
            </circle>
          ))}
        </svg>
        {hov && (
          <div className="to-tip" style={{ left: `${(X(hov.x) / W) * 100}%`, top: `${(Y(hov.y) / H) * 100}%` }}>
            <b>{hov.name}</b>
            <span>{money(hov.x)}/mo cost to you</span>
            <span>{money(hov.price)}/mo, the room picked for you</span>
            <span>rooms from {money(hov.from)}</span>
            <span>{hours(hov.y * 60)} h/wk</span>
          </div>
        )}
      </div>
      <div className="to-legend" aria-hidden="true">
        <span>Worse fit</span>
        {FIT_RAMP.map((c) => <i key={c} style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(26,26,26,0.35)' }} />)}
        <span>Best fit</span>
        <span className="to-key"><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="#1A1A1A" strokeWidth="2" /></svg>Top pick{top ? `, ${top.name}` : ''}</span>
        <span className="to-key"><svg width="16" height="16"><rect x="2" y="2" width="12" height="12" fill="none" stroke="#1A1A1A" strokeWidth="1.5" /></svg>Cheapest rent{cheap && cheap.id !== top?.id ? `, from ${money(cheap.from)}, ${cheap.name}` : ''}</span>
      </div>
    </div>
  );
}
