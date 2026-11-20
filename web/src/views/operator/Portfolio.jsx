// Every home with more than one room as one row of a sorted bar chart: how far its asking rents sit from the
// typical fair rents each month, split into rooms asking too little (blue, left of the line) and too much (red,
// right). Most off first. Click a row to open that home above.
import React from 'react';
import { usd } from '../group/kit.jsx';
import { gapTotal, shortName } from './viz.js';

const OVER = '#B3261E';
const UNDER = '#1F5FA8';

function split(rooms, fair) {
  if (!Array.isArray(fair) || fair.length !== (rooms || []).length) return null;
  let over = 0, under = 0;
  for (let j = 0; j < rooms.length; j++) {
    const p = fair[j]?.p50, a = rooms[j].asking;
    if (!Number.isFinite(p)) return null;
    if (!Number.isFinite(a)) continue;
    if (a > p) over += a - p; else under += p - a;
  }
  return { over, under };
}

export default function Portfolio({ homes, fairFor, selectedId, onPick, updating }) {
  const rows = homes.map((home) => {
    const fair = fairFor(home.id);
    return { home, gap: gapTotal(home.rooms, fair), s: split(home.rooms, fair) };
  }).sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1));
  const maxSide = Math.max(1, ...rows.map((r) => Math.max(r.s?.over || 0, r.s?.under || 0)));
  const half = Math.ceil(rows.length / 2);

  return (
    <div className="ow-port" style={{ opacity: updating ? 0.7 : 1, gridTemplateRows: `repeat(${half}, auto)` }}>
      {rows.map(({ home, gap, s }) => {
        const short = shortName(home.name);
        const sel = home.id === selectedId;
        return (
          <button key={home.id} type="button" className={`ow-prow${sel ? ' sel' : ''}`} aria-pressed={sel}
            aria-label={`${short}: ${gap == null ? 'no fair rents yet' : `${usd(gap)} a month off typical fair rent, ${usd(s?.over)} over and ${usd(s?.under)} under`}. Open`}
            title={s ? `${home.name}: ${usd(s.over)} over, ${usd(s.under)} under` : home.name}
            onClick={() => onPick(home.id)}>
            <span className="ow-prow-name">{short}</span>
            <span className="ow-prow-bars" aria-hidden="true">
              <span className="side l">{s && s.under > 0.5 && <i style={{ width: `${(100 * s.under) / maxSide}%`, background: UNDER }} />}</span>
              <span className="side r">{s && s.over > 0.5 && <i style={{ width: `${(100 * s.over) / maxSide}%`, background: OVER }} />}</span>
            </span>
            <span className="ow-prow-num">{gap == null ? 'n/a' : usd(gap)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PortfolioKey() {
  return (
    <span className="ow-port-key" aria-hidden="true">
      <span><i style={{ background: UNDER }} />asks too little</span>
      <span><i style={{ background: OVER }} />asks too much</span>
      <span>dollars a month off typical, most off first</span>
    </span>
  );
}
