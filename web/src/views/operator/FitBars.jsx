// "Who it fits": how many sample students pick this home first, then one bar per kind of week it is the most
// common first pick for. Bar length is the number of students with that week (operator.json has no per-home
// counts by kind of week), and the subtitle says so.
import React from 'react';
import { fitBars, shortName } from './viz.js';
import { weekWords, parseKey } from './fit.js';
import { useTip, useWidth } from './ui.jsx';

const n0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : 'n/a');

export default function FitBars({ fit, all, homes, students, kindCounts, assumptions }) {
  const { wrap, el: tipEl, show, hide } = useTip();
  if (!fit) return <p className="ow-quiet">No fit data for this home.</p>;
  const firstN = Math.round(fit.firstShare * students);
  const bars = fitBars(fit.wins, kindCounts, 4);
  const max = Math.max(1, ...bars.map((b) => b.n || 0));
  // Parts every bar shares (for example the campus) move into the subtitle, so each label keeps only what differs.
  const parts = bars.map((b) => String(b.label).split(', '));
  const real = parts.filter((_, i) => !bars[i].other);
  const shared = real.length > 1 ? real[0].filter((t) => real.every((p) => p.includes(t))) : [];
  const shortLabel = (b, i) => {
    if (b.other) return b.label;
    const rest = parts[i].filter((t) => !shared.includes(t)).join(' + ');
    return rest || 'nothing else';
  };

  return (
    <div className="ow-fit">
      <div className="ow-big">
        <span className="ow-num-44">{n0(firstN)}</span>
        <span className="ow-unit">of {n0(students)} students pick it first</span>
      </div>
      {bars.length ? (
        <>
          <div className="ow-sub">The kinds of week it wins{shared.length ? `, all ${shared.join(', ')}` : ''}. Each bar: students with that week.</div>
          <div className="ow-bars" ref={wrap} role="list">
            {bars.map((b, i) => {
              const lines = b.other
                ? [b.label, `${n0(b.n)} students`]
                : [weekWords(parseKey(b.key), assumptions), `${n0(b.n)} students have this week`];
              return (
                <div key={b.key} className="ow-bar-row" role="listitem" tabIndex={0} aria-label={lines.join(', ')}
                  onMouseMove={(e) => show(e, lines)} onMouseLeave={hide} onFocus={(e) => show(e, lines)} onBlur={hide}>
                  <span className="ow-bar-label" title={b.label}>{shortLabel(b, i)}</span>
                  <span className="ow-bar-track">
                    {b.n != null && <span className={`ow-bar ${b.other ? 'other' : ''}`} style={{ width: `${(88 * b.n) / max}%` }} />}
                    <span className="ow-bar-val">{n0(b.n)}</span>
                  </span>
                </div>
              );
            })}
            {tipEl}
          </div>
        </>
      ) : (
        <p className="ow-quiet">No kind of week picks it most often.</p>
      )}
      {all?.length > 1 && <Strip fit={fit} all={all} homes={homes} students={students} />}
    </div>
  );
}

// Every home as a dot on one line by how many students pick it first; this home ringed and labeled.
function Strip({ fit, all, homes, students }) {
  const [ref, W] = useWidth(420);
  const { wrap, el: tipEl, show, hide } = useTip();
  const nameOf = new Map((homes || []).map((h) => [h.id, shortName(h.name)]));
  const counts = all.map((d) => ({ id: d.homeId, n: Math.round(d.firstShare * students) }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  const pad = 8;
  const sx = (v) => pad + (v / max) * (W - 2 * pad);
  const me = counts.find((c) => c.id === fit.homeId);
  const rank = 1 + counts.filter((c) => c.n > (me?.n ?? 0)).length;
  const H = 58;
  const cy = 30;
  const meX = me ? sx(me.n) : 0;
  const anchor = meX < 60 ? 'start' : meX > W - 60 ? 'end' : 'middle';
  return (
    <div className="ow-strip" ref={(n) => { ref.current = n; wrap.current = n; }}>
      <div className="ow-sub" style={{ marginTop: 0 }}>Picked first, against your other homes</div>
      <svg width={W} height={H} role="img" aria-label={`First picks for every home. This one: ${me?.n ?? 0}, rank ${rank} of ${counts.length}.`}>
        <line x1={pad} x2={W - pad} y1={cy} y2={cy} stroke="#DEDAD2" />
        {counts.filter((c) => c.id !== fit.homeId).map((c) => (
          <circle key={c.id} cx={sx(c.n)} cy={cy} r={4} fill="#B9B3A6" stroke="#fff" strokeWidth="2"
            onMouseMove={(e) => show(e, [nameOf.get(c.id) || c.id, `${c.n.toLocaleString('en-US')} pick it first`])} onMouseLeave={hide} />
        ))}
        {me && (
          <>
            <circle cx={meX} cy={cy} r={7} fill="#1F6F4A" stroke="#fff" strokeWidth="2" />
            <text x={meX} y={cy - 14} textAnchor={anchor} className="ow-t-label ow-t-strong">This one, #{rank} of {counts.length}</text>
          </>
        )}
        <text x={pad} y={H - 2} className="ow-t-small ow-t-gray ow-t-num">0</text>
        <text x={W - pad} y={H - 2} textAnchor="end" className="ow-t-small ow-t-gray ow-t-num">{max.toLocaleString('en-US')} students</text>
      </svg>
      {tipEl}
    </div>
  );
}
