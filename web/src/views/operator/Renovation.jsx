// Renovation lever: add a half bath to one room and see how each room's typical fair rent moves, at the same house
// rent. The chart shows only the change, as bars either side of $0. The private bath value is an assumption (slider).
import React from 'react';
import { usd, signedUsd } from '../group/kit.jsx';
import { niceTicks } from './viz.js';
import { useWidth, useTip } from './ui.jsx';

const OTHER = '#9A9384';
const MINE = '#1F6F4A';

export default function Renovation({ home, choices, renoIdx, onRoom, base, after, delta, wBath, onBath, busy }) {
  const [ref, W] = useWidth(560);
  const { wrap, el: tipEl, show, hide } = useTip();
  if (!choices.length) return <p className="ow-quiet">Every room here already has a bath of its own.</p>;
  const room = home.rooms[renoIdx];

  const labelW = 120;
  const x0 = labelW + 8;
  const x1 = W - 70;
  const rowH = 30;
  const top = 4;
  const ready = base && after;
  const ds = ready ? home.rooms.map((_, j) => after[j].p50 - base[j].p50) : [];
  const lo = Math.min(0, ...ds), hi = Math.max(0, ...ds);
  const pad = Math.max(4, (hi - lo) * 0.08);
  const ticks = niceTicks(lo - pad, hi + pad, 4);
  const d0 = Math.min(lo - pad, ticks[0]), d1 = Math.max(hi + pad, ticks[ticks.length - 1]);
  const sx = (v) => x0 + ((v - d0) / (d1 - d0 || 1)) * (x1 - x0);
  const H = top + home.rooms.length * rowH + 26;

  return (
    <div className="ow-reno">
      <div className="ow-reno-side">
        <label className="ow-field">
          <span>Room</span>
          <select value={renoIdx ?? ''} onChange={(e) => onRoom(Number(e.target.value))}>
            {choices.map(({ r, j }) => <option key={r.id} value={j}>{r.label}</option>)}
          </select>
        </label>
        <div className="ow-big">
          <span className="ow-num-44">{delta ? signedUsd(delta.roomP50) : '...'}</span>
          <span className="ow-unit">a month for {room?.label}</span>
        </div>
        <label className="ow-field ow-slider" htmlFor="op-bath">
          <span>A private bath is worth <b className="ow-t-num">{usd(wBath)}/mo</b> <em>assumed</em></span>
          <input id="op-bath" type="range" min={0} max={200} step={5} value={wBath} onChange={(e) => onBath(Number(e.target.value))} />
        </label>
      </div>
      <div className="ow-reno-chart" ref={(n) => { ref.current = n; wrap.current = n; }} style={{ opacity: busy ? 0.55 : 1 }}>
        <div className="ow-key" aria-hidden="true">
          <span className="ow-key-note">Change in typical fair rent per room. The house total stays {usd(home.rent)}.</span>
        </div>
        {ready && (
          <svg width={W} height={H} role="img"
            aria-label={home.rooms.map((r, j) => `${r.label}: ${usd(base[j].p50)} now, ${usd(after[j].p50)} with the half bath`).join('. ')}>
            {ticks.map((t) => <line key={`g${t}`} x1={sx(t)} x2={sx(t)} y1={top} y2={H - 22} stroke="#E9E5DC" />)}
            <line x1={sx(0)} x2={sx(0)} y1={top} y2={H - 22} stroke="#6B6B6B" />
            {home.rooms.map((r, j) => {
              const y = top + j * rowH;
              const b = base[j].p50, a = after[j].p50;
              const mine = j === renoIdx;
              const lines = [r.label, `Now ${usd(b)}`, `With the half bath ${usd(a)}`, `Change ${signedUsd(a - b)}`];
              const d = a - b;
              const bx = Math.min(sx(0), sx(d)), bw = Math.max(1, Math.abs(sx(d) - sx(0)));
              return (
                <g key={r.id} tabIndex={0} className="ow-room" aria-label={lines.join(', ')}
                  onMouseMove={(e) => show(e, lines)} onMouseLeave={hide} onFocus={(e) => show(e, lines)} onBlur={hide}>
                  <rect x={0} y={y} width={W} height={rowH} fill={mine ? '#F1EEE7' : 'transparent'} />
                  <text x={labelW} y={y + rowH / 2 + 5} textAnchor="end" className={mine ? 'ow-t-label ow-t-strong' : 'ow-t-label'}>{r.label}</text>
                  <rect x={bx} y={y + 8} width={bw} height={rowH - 16} rx={2} fill={mine ? MINE : OTHER} />
                  <text x={W - 4} y={y + rowH / 2 + 5} textAnchor="end" className={mine ? 'ow-t-label ow-t-num ow-t-strong' : 'ow-t-small ow-t-gray ow-t-num'}>{signedUsd(a - b)}</text>
                </g>
              );
            })}
            {ticks.map((t) => <text key={`a${t}`} x={sx(t)} y={H - 6} textAnchor="middle" className="ow-t-small ow-t-gray ow-t-num">{t === 0 ? '$0' : signedUsd(t)}</text>)}
          </svg>
        )}
        {tipEl}
      </div>
    </div>
  );
}
