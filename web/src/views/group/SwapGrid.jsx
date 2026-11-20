// Swap check as a heat grid: one row per member, one column per room. Each cell is how many dollars a month that
// member would lose by moving into that room at its rent, from their own room values. Darker green = a wider margin.
// Every cell at $0 or more means nobody would swap.
import React from 'react';

const BINS = [
  { max: 5, fill: '#efe8da', ink: '#1a1a1a', label: 'under $5' },
  { max: 25, fill: '#cfe0c9', ink: '#1a1a1a', label: '$5 to $25' },
  { max: 75, fill: '#9cc4a4', ink: '#1a1a1a', label: '$25 to $75' },
  { max: 150, fill: '#5e9c76', ink: '#ffffff', label: '$75 to $150' },
  { max: Infinity, fill: '#1f6f4a', ink: '#ffffff', label: 'over $150' },
];
const binOf = (v) => BINS.find((b) => v < b.max) || BINS[BINS.length - 1];

export function swapMargins(problem, res) {
  const a = res.assignment, p = res.prices;
  return problem.members.map((m, i) => {
    const own = m.values[a[i]] - p[a[i]];
    return problem.rooms.map((_, j) => (j === a[i] ? null : own - (m.values[j] - p[j])));
  });
}

export default function SwapGrid({ row, members, colors, usd }) {
  const { problem, res, home } = row;
  const M = swapMargins(problem, res);
  const owner = new Map(res.assignment.map((j, i) => [j, i]));
  const n = members.length, R = home.rooms.length;
  const labelW = 70, cw = 74, ch = 34, top = 44, g = 2;
  const width = labelW + R * (cw + g);
  const height = top + n * (ch + g);
  return (
    <div>
      <svg className="gv-heat" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label="Swap check: dollars a month each member would lose by moving into each room">
        {home.rooms.map((room, j) => {
          const i = owner.get(j);
          const x = labelW + j * (cw + g);
          return (
            <g key={room.id}>
              <text x={x + cw / 2} y={16} textAnchor="middle">{String(room.label).replace(/\s+room$/i, '')}</text>
              {i != null
                ? <circle cx={x + cw / 2} cy={30} r={5} fill={colors[i]} />
                : <text x={x + cw / 2} y={34} textAnchor="middle">shared</text>}
            </g>
          );
        })}
        {members.map((m, i) => (
          <g key={m.id}>
            <text className="row-name" x={0} y={top + i * (ch + g) + ch / 2 + 4}>{m.name}</text>
            {M[i].map((v, j) => {
              const x = labelW + j * (cw + g), y = top + i * (ch + g);
              if (v == null) {
                return (
                  <g key={j}>
                    <title>{`${m.name}'s own room`}</title>
                    <rect x={x + 1} y={y + 1} width={cw - 2} height={ch - 2} rx="3" fill="#fff" stroke={colors[i]} strokeWidth="2" />
                    <text x={x + cw / 2} y={y + ch / 2 + 4} textAnchor="middle">own</text>
                  </g>
                );
              }
              const fail = v < -1e-6;
              const b = binOf(Math.max(0, v));
              return (
                <g key={j}>
                  <title>{`${m.name} would ${fail ? 'gain' : 'lose'} ${usd(Math.abs(v))} a month moving to the ${home.rooms[j].label}`}</title>
                  <rect x={x} y={y} width={cw} height={ch} rx="3" fill={fail ? '#9a1f1f' : b.fill} />
                  <text className="cell-v" x={x + cw / 2} y={y + ch / 2 + 4} textAnchor="middle" style={{ fill: fail ? '#fff' : b.ink }}>
                    {usd(v)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="gv-legend" aria-hidden="true">
        {BINS.map((b) => <span key={b.label}><i className="gv-sw" style={{ background: b.fill }} />{b.label}</span>)}
      </div>
    </div>
  );
}
