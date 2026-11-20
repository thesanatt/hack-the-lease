// House diagram: floors stacked (attic on top, basement under the ground line), each room a rectangle whose width
// is its square feet, filled with the color of the member who gets it. The big one carries name and rent share;
// the mini one (small multiples) is shape and color only.
import React from 'react';

const FLOOR_ORDER = ['attic', '4', '3', '2', '1', 'basement'];
const FLOOR_NAME = { attic: 'Attic', 4: '4th', 3: '3rd', 2: '2nd', 1: '1st', basement: 'Basement' };

export function floorsOf(home) {
  const by = new Map();
  (home?.rooms || []).forEach((room, j) => {
    const f = String(room.floor ?? '1');
    if (!by.has(f)) by.set(f, []);
    by.get(f).push({ room, j });
  });
  const keys = [...by.keys()].sort((a, b) => rank(a) - rank(b));
  return keys.map((f) => ({ floor: f, rooms: by.get(f) }));
}
const rank = (f) => { const i = FLOOR_ORDER.indexOf(f); return i < 0 ? 2.5 : i; };

// Geometry shared by both sizes. Returns floors with x, y, w, h per room, house walls and the ground line.
export function layoutHouse(home, { width, labelW = 0, rowH, gap, roofH, pad = 8, kMax = Infinity }) {
  const floors = floorsOf(home);
  const avail = width - labelW - 2 * pad;
  let k = kMax;
  for (const f of floors) {
    const total = f.rooms.reduce((s, r) => s + (r.room.sqft || 100), 0);
    k = Math.min(k, (avail - gap * (f.rooms.length - 1)) / total);
  }
  const widthOf = (f) => f.rooms.reduce((s, r) => s + (r.room.sqft || 100) * k, 0) + gap * (f.rooms.length - 1);
  const houseW = Math.max(...floors.map(widthOf));
  const x0 = labelW + pad + (avail - houseW) / 2;
  let y = roofH;
  const groundGap = Math.max(4, gap * 2);
  const out = floors.map((f) => {
    if (f.floor === 'basement') y += groundGap;
    const fw = widthOf(f);
    let x = x0 + (houseW - fw) / 2;
    const rooms = f.rooms.map(({ room, j }) => {
      const w = (room.sqft || 100) * k;
      const r = { room, j, x, y, w, h: rowH };
      x += w + gap;
      return r;
    });
    const row = { floor: f.floor, y, rooms };
    y += rowH + gap;
    return row;
  });
  const above = out.filter((f) => f.floor !== 'basement');
  const hasBasement = out.some((f) => f.floor === 'basement');
  const lastAbove = above.length ? above[above.length - 1].y + rowH : roofH;
  const groundY = hasBasement ? lastAbove + (gap + groundGap) / 2 : lastAbove + Math.max(2, gap / 2);
  return { floors: out, x0, houseW, height: Math.max(y - gap, groundY + 2), groundY, k };
}

const tint = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#f3f1ec';
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(255 - (255 - c) * a);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
};

export default function HouseDiagram({ home, assignment, prices, members, colors, usd }) {
  if (!home) return null;
  const width = 760;
  const L = layoutHouse(home, { width, labelW: 64, rowH: 78, gap: 6, roofH: 40, kMax: 3 });
  const owner = new Map();
  (assignment || []).forEach((j, i) => owner.set(j, i));
  const roofPad = 10;
  const hx0 = L.x0 - roofPad, hx1 = L.x0 + L.houseW + roofPad;
  const label = members && assignment
    ? `${home.name}: ${members.map((m, i) => `${m.name} in the ${home.rooms[assignment[i]]?.label || 'room'} for ${usd(prices?.[assignment[i]])}`).join(', ')}`
    : home.name;
  return (
    <svg className="gv-diagram gv-fade" key={home.id} viewBox={`0 0 ${width} ${L.height + 14}`} role="img" aria-label={label}>
      <polygon points={`${hx0},${L.floors[0].y - 6} ${(hx0 + hx1) / 2},4 ${hx1},${L.floors[0].y - 6}`}
        fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1={Math.max(40, hx0 - 30)} x2={Math.min(width, hx1 + 30)} y1={L.groundY} y2={L.groundY} stroke="#1a1a1a" strokeWidth="1.5" />
      {L.floors.map((f) => (
        <g key={f.floor}>
          <text className="floor-label" x={0} y={f.y + f.rooms[0].h / 2 + 4}>{FLOOR_NAME[f.floor] || f.floor}</text>
          {f.rooms.map(({ room, j, x, y, w, h }) => {
            const i = owner.get(j);
            const m = i != null ? members?.[i] : null;
            const c = i != null ? colors?.[i] : null;
            const price = prices?.[j];
            const wide = w >= 150;
            return (
              <g key={room.id} className="gv-room">
                <title>{m ? `${m.name}: ${room.label}, ${room.sqft} sq ft, ${usd(price)} a month` : `${room.label}, shared space`}</title>
                <rect x={x} y={y} width={w} height={h} rx="3" fill={c ? tint(c, 0.13) : '#ffffff'}
                  stroke={c ? c : '#b9b3a7'} strokeWidth={c ? 1 : 1} strokeDasharray={c ? undefined : '4 3'} />
                {c && <rect x={x} y={y} width={5} height={h} rx="2" fill={c} />}
                {m ? (
                  <>
                    <text className="room-name" x={x + 14} y={y + 22}>{m.name}</text>
                    <text className="room-rent" x={x + 14} y={y + 46}>{usd(price)}</text>
                    <text className="room-meta" x={x + 14} y={y + 66}>{wide ? `${shortRoom(room.label)}, ${room.sqft} sq ft` : `${room.sqft} sq ft`}</text>
                  </>
                ) : (
                  <>
                    <text className="room-meta" x={x + 12} y={y + 22}>Shared</text>
                    <text className="room-meta" x={x + 12} y={y + 42}>{usd(price)}</text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

const shortRoom = (s) => String(s || '').replace(/\s+room$/i, '');

export function MiniHouse({ home, assignment, colors }) {
  const width = 200;
  const L = layoutHouse(home, { width, rowH: 15, gap: 2, roofH: 13, pad: 6 });
  const owner = new Map();
  (assignment || []).forEach((j, i) => owner.set(j, i));
  const hx0 = L.x0 - 4, hx1 = L.x0 + L.houseW + 4;
  return (
    <svg className="mini" viewBox={`0 0 ${width} ${Math.max(L.height + 4, 88)}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <polygon points={`${hx0},${L.floors[0].y - 2} ${(hx0 + hx1) / 2},1 ${hx1},${L.floors[0].y - 2}`} fill="none" stroke="#1a1a1a" strokeWidth="1" />
      <line x1={hx0 - 8} x2={hx1 + 8} y1={L.groundY} y2={L.groundY} stroke="#1a1a1a" strokeWidth="1" />
      {L.floors.map((f) => f.rooms.map(({ room, j, x, y, w, h }) => {
        const i = owner.get(j);
        const c = i != null ? colors?.[i] : null;
        return <rect key={room.id} x={x} y={y} width={w} height={h} rx="1.5" fill={c || '#ffffff'} stroke={c ? 'none' : '#b9b3a7'} strokeDasharray={c ? undefined : '2 2'} />;
      }))}
    </svg>
  );
}
