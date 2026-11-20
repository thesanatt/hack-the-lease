// The selected house as a cross-section: floors stacked top to bottom, one strip per room (strip height
// follows square feet). Each strip carries the room's fair rent range (p10 to p90 across sample groups) as a
// bar, the typical fair rent as a line inside it, and the asking rent as a tick. Rooms asking more than the
// range are tinted red, rooms asking less are tinted blue, and the gap is written in the right column.
import React from 'react';
import { usd } from '../group/kit.jsx';
import { floorsOf, roomState, outside, niceTicks, rentDomain } from './viz.js';
import { useWidth, useTip } from './ui.jsx';

const BATH = { private: 'private bath', half: 'half bath', shared: 'shared bath' };

export default function HouseRents({ home, fair, busy }) {
  const [ref, W] = useWidth(760);
  const { wrap, el: tipEl, show, hide } = useTip();
  const isHouse = home.kind === 'house';
  const floors = floorsOf(home.rooms);

  const roofH = isHouse ? 40 : 0;
  const top = roofH + 2;
  const floorLabelW = W < 520 ? 0 : 78;
  const wallL = floorLabelW;
  const wallR = W - 10;
  const labelW = Math.min(170, Math.max(120, W * 0.2));
  const gapW = 82;
  const x0 = wallL + labelW + 14;
  const x1 = wallR - gapW - 10;
  const [lo, hi] = rentDomain(home.rooms, fair);
  const sx = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const ticks = niceTicks(lo, hi, Math.max(3, Math.round((x1 - x0) / 110)));

  // Layout: rows per room, grouped by floor.
  let y = top;
  const rows = [];
  const floorBands = [];
  let groundY = null;
  floors.forEach((f) => {
    if (f.below && groundY == null) groundY = y;
    const y0 = y;
    f.rooms.forEach(({ room, j }) => {
      const h = Math.round(Math.min(64, Math.max(44, 26 + (room.sqft || 120) / 7)));
      rows.push({ room, j, y, h, below: f.below });
      y += h;
    });
    floorBands.push({ ...f, y0, y1: y });
  });
  const bottom = y;
  const H = bottom + 30;

  const states = home.rooms.map((r, j) => roomState(r.asking, fair?.[j]));
  const summary = home.rooms.map((r, j) => {
    const f = fair?.[j];
    return f ? `${r.label}: fair ${usd(f.p10)} to ${usd(f.p90)}, asking ${usd(r.asking)}` : r.label;
  }).join('. ');

  return (
    <div className="ow-house" ref={(n) => { ref.current = n; wrap.current = n; }} style={{ opacity: busy ? 0.55 : 1 }}>
      <svg width={W} height={H} role="img" aria-label={`Fair rent range and asking rent for each room of ${home.name}. ${summary}`}>
        {isHouse && (
          <path d={`M ${wallL - 6} ${top} L ${(wallL + wallR) / 2} ${top - roofH + 1} L ${wallR + 6} ${top}`}
            fill="none" stroke="#1A1A1A" strokeWidth="1.5" strokeLinejoin="round" />
        )}
        {/* below-ground fill */}
        
        {/* mispriced rows tinted */}
        {rows.map(({ room, j, y: ry, h }) => states[j] === 'over' || states[j] === 'under' ? (
          <rect key={`t${room.id}`} x={wallL + 1} y={ry} width={wallR - wallL - 2} height={h}
            fill={states[j] === 'over' ? '#FAE7E4' : '#E5EDF7'} />
        ) : null)}
        {/* gridlines */}
        {ticks.map((t) => <line key={`g${t}`} x1={sx(t)} x2={sx(t)} y1={top} y2={bottom} stroke="#E9E5DC" strokeWidth="1" />)}
        {/* room separators and floor lines */}
        {rows.map(({ room, y: ry }, i) => i > 0 ? <line key={`s${room.id}`} x1={wallL} x2={wallR} y1={ry} y2={ry} stroke="#DEDAD2" /> : null)}
        {floorBands.slice(1).map((f) => (
          <line key={`f${f.floor}`} x1={wallL} x2={wallR} y1={f.y0} y2={f.y0} stroke="#1A1A1A" strokeWidth={f.y0 === groundY ? 2 : 1} />
        ))}
        {groundY != null && <line x1={0} x2={W} y1={groundY} y2={groundY} stroke="#1A1A1A" strokeWidth="2" />}
        <rect x={wallL} y={top} width={wallR - wallL} height={bottom - top} fill="none" stroke="#1A1A1A" strokeWidth="1.5" />
        {/* floor names */}
        {floorLabelW > 0 && floorBands.map((f) => (
          <text key={`n${f.floor}`} x={wallL - 10} y={(f.y0 + f.y1) / 2} textAnchor="end" dominantBaseline="middle" className="ow-t-small ow-t-gray">{f.name}</text>
        ))}
        {/* rooms */}
        {rows.map(({ room, j, y: ry, h }) => {
          const f = fair?.[j];
          const st = states[j];
          const cy = ry + h / 2;
          const tickColor = st === 'over' ? '#B3261E' : st === 'under' ? '#1F5FA8' : '#1A1A1A';
          const off = outside(room.asking, f);
          const lines = f ? [room.label, `Fair range ${usd(f.p10)} to ${usd(f.p90)}`, `Typical ${usd(f.p50)}`, `Asking ${usd(room.asking)}`] : [room.label];
          return (
            <g key={room.id} className="ow-room" tabIndex={0}
              aria-label={lines.join(', ')}
              onMouseMove={(e) => show(e, lines)} onMouseLeave={hide} onFocus={(e) => show(e, lines)} onBlur={hide}>
              <rect x={wallL} y={ry} width={wallR - wallL} height={h} fill="transparent" />
              <text x={wallL + 12} y={cy - 7} className="ow-t-label">{room.label}</text>
              <text x={wallL + 12} y={cy + 11} className="ow-t-small ow-t-gray">{room.sqft} sq ft, {BATH[room.bath] || room.bath}</text>
              {f && (
                <>
                  <rect x={sx(f.p10)} y={cy - 6} width={Math.max(4, sx(f.p90) - sx(f.p10))} height={12} rx={6} fill="#A9C9B5" stroke="#1F6F4A" strokeWidth="1" />
                  <rect x={sx(f.p50) - 1} y={cy - 6} width={2} height={12} fill="#1F6F4A" />
                </>
              )}
              {Number.isFinite(room.asking) && (
                <rect x={sx(room.asking) - (st === 'fair' ? 1 : 1.5)} y={cy - 13} width={st === 'fair' ? 2 : 3} height={26} rx={1} fill={tickColor} />
              )}
              {(st === 'over' || st === 'under') && (
                <text x={wallR - 10} y={cy + 5} textAnchor="end" className="ow-t-label">{usd(off)} {st}</text>
              )}
            </g>
          );
        })}
        {/* axis */}
        {ticks.map((t) => (
          <text key={`a${t}`} x={sx(t)} y={bottom + 20} textAnchor="middle" className="ow-t-small ow-t-gray ow-t-num">{usd(t)}</text>
        ))}
      </svg>
      {tipEl}
    </div>
  );
}

export function RentKey() {
  return (
    <div className="ow-key" aria-hidden="true">
      <span><svg width="28" height="14"><rect x="0.5" y="1.5" width="27" height="11" rx="5.5" fill="#A9C9B5" stroke="#1F6F4A" strokeWidth="1" /><rect x="13" y="1" width="2" height="12" fill="#1F6F4A" /></svg>Fair range, typical</span>
      <span><svg width="6" height="18"><rect x="2" y="0" width="2" height="18" fill="#1A1A1A" /></svg>Asking rent</span>
      <span><svg width="14" height="14"><rect width="14" height="14" fill="#FAE7E4" /><rect x="5.5" y="0" width="3" height="14" fill="#B3261E" /></svg>Asks too much</span>
      <span><svg width="14" height="14"><rect width="14" height="14" fill="#E5EDF7" /><rect x="5.5" y="0" width="3" height="14" fill="#1F5FA8" /></svg>Asks too little</span>
    </div>
  );
}
