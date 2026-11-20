// The pitch slides. Each slide is one picture and one sentence. Every number is computed live by the engine
// (slides 1 to 3, see data.js) or read from web/public/data/evidence/*.json (slide 5). Nothing numeric is typed
// in here except labels and the published method names. The detail lives in the presenter notes (press N).
import { useEffect, useMemo, useState } from 'react';
import { campusExample, studentExample, groupExample, evidenceFigures, DATE_LABEL, TIMES, DEFAULT_HOME } from './data.js';
import { DiffHistogram, RegretCurves, CheckGrid, r5Diffs, regretSeries, C } from '../evidence/charts.jsx';

const int = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '-');
const usd = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString('en-US')}` : '-');
const one = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const clock = (sec) => {
  if (!Number.isFinite(sec)) return '';
  const t = Math.round(sec / 60), h24 = Math.floor(t / 60) % 24, m = t % 60;
  return `${((h24 + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};
const hex = (c) => (!c ? C.ink : c.startsWith('#') ? c : `#${c}`);

function Slide({ title, children, foot, aside }) {
  return (
    <>
      <div className="pd-headrow">
        <h1 className="pd-title">{title}</h1>
        {aside}
      </div>
      <div className="pd-visual">{children}</div>
      {foot && <p className="pd-foot">{foot}</p>}
    </>
  );
}
const Wait = ({ what }) => <p className="pd-wait">{what}</p>;

// 1. The problem: one home, three campuses, walk or bus, two hours.
function Problem({ api }) {
  const homes = api.data.homes;
  const [homeId, setHomeId] = useState(() => (api.data.homeById?.has(DEFAULT_HOME) ? DEFAULT_HOME : homes[0]?.id));
  const ex = useMemo(() => { try { return campusExample(api, homeId); } catch (e) { console.warn(e); return null; } }, [api, homeId, api.version]);
  const picker = (
    <label className="pd-picker">
      <span className="pd-sr">Home</span>
      <select value={homeId} onChange={(e) => { setHomeId(e.target.value); e.target.blur(); /* arrows go back to the slides */ }}>
        {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>
    </label>
  );
  return (
    <Slide
      title={'"10 minutes from campus." Which campus, which way, what hour?'}
      aside={picker}
      foot={`Sample listing on real streets. Live on TheRide and U-M timetables for ${DATE_LABEL}.${ex?.duskS ? ` Dark after ${clock(ex.duskS)}.` : ''}`}
    >
      {ex ? <TripChart ex={ex} /> : <Wait what="The router did not return a result for this home." />}
    </Slide>
  );
}

function TripChart({ ex }) {
  const lanes = [];
  ex.rows.forEach((r) => {
    lanes.push({ row: r, kind: 'walk', min: r.walk, legs: null });
    TIMES.forEach((t, i) => lanes.push({ row: r, kind: i === 1 ? 'late' : 'day', min: r.bus[i], legs: r.legs?.[i] || null, label: t.label, t0: t.s }));
  });
  const vals = lanes.map((l) => l.min).filter(Number.isFinite);
  const firstRide = lanes.flatMap((l) => l.legs || []).find((l) => l.type === 'ride');
  const rideColor = firstRide ? hex(firstRide.color) : C.mid;
  const maxMin = Math.max(10, Math.ceil(Math.max(...vals, 0) / 10) * 10);
  const W = 1200, LW = 250, X0 = LW + 90, X1 = W - 110, laneH = 36, groupGap = 22, top = 34;
  const X = (m) => X0 + (m / maxMin) * (X1 - X0);
  const H = top + ex.rows.length * (3 * laneH + groupGap) + 6;
  const ticks = []; for (let m = 0; m <= maxMin; m += 10) ticks.push(m);
  return (
    <div className="pd-tripwrap">
    <svg className="pd-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`Minutes home from three campus buildings to ${ex.home?.name}: ${ex.rows.map((r) => `${r.campus}, walk ${r.walk ?? 'none'}, bus at ${TIMES[0].label} ${r.bus[0] ?? 'none'}, bus at ${TIMES[1].label} ${r.bus[1] ?? 'none'}`).join('; ')}.`}>
      {ticks.map((m) => (
        <g key={m}>
          <line x1={X(m)} x2={X(m)} y1={top - 8} y2={H - 4} stroke={C.line} strokeWidth="1" />
          <text x={X(m)} y={top - 14} textAnchor="middle" className="pd-tick">{m === maxMin ? `${m} min` : m}</text>
        </g>
      ))}
      {ex.rows.map((r, gi) => {
        const gy = top + gi * (3 * laneH + groupGap);
        return (
          <g key={r.id}>
            <text x={0} y={gy + laneH * 1.5 - 4} className="pd-lane-h">{r.campus}</text>
            <text x={0} y={gy + laneH * 1.5 + 18} className="pd-lane-s">{r.place}</text>
            {[0, 1, 2].map((k) => {
              const ln = lanes[gi * 3 + k];
              const y = gy + k * laneH + laneH / 2;
              const name = ln.kind === 'walk' ? 'Walk' : `Bus, ${ln.label}`;
              return (
                <g key={k}>
                  {ln.kind === 'late' && Number.isFinite(ln.min) && <rect x={X(0)} y={y - laneH / 2 + 3} width={X(ln.min) - X(0)} height={laneH - 6} rx="4" fill="#D3D8EC" />}
                  <text x={X0 - 14} y={y + 5} textAnchor="end" className="pd-lane-k">{name}</text>
                  {!Number.isFinite(ln.min) ? (
                    <text x={X0} y={y + 5} className="pd-lane-k">{ln.kind === 'walk' ? 'no route' : 'no bus'}</text>
                  ) : ln.kind === 'walk' || !ln.legs ? (
                    <line x1={X(0)} x2={X(ln.min)} y1={y} y2={y} stroke={ln.kind === 'walk' ? C.ink : C.mid} strokeWidth={ln.kind === 'walk' ? 2.5 : 6} strokeDasharray={ln.kind === 'walk' ? '6 5' : undefined} strokeLinecap="round" />
                  ) : <Legs legs={ln.legs} t0={ln.t0} X={X} y={y} />}
                  {Number.isFinite(ln.min) && (
                    <text x={X(ln.min) + 12} y={y + 7} className="pd-lane-v">{ln.min}<tspan className="pd-lane-u"> min</tspan></text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
    <div className="pd-key" aria-hidden="true">
      <span><svg width="28" height="10"><line x1="1" x2="27" y1="5" y2="5" stroke={C.ink} strokeWidth="2.5" strokeDasharray="6 5" /></svg>Walk</span>
      <span><svg width="28" height="10"><line x1="1" x2="27" y1="5" y2="5" stroke={C.light} strokeWidth="2" /></svg>Wait at the stop</span>
      <span><svg width="28" height="10"><rect x="1" y="0" width="26" height="10" rx="3" fill={rideColor} /></svg>Bus, in its route color</span>
      <span><svg width="28" height="14"><rect x="0" y="0" width="28" height="14" rx="4" fill="#D3D8EC" /></svg>After dark</span>
    </div>
    </div>
  );
}

// Light route colors (for example pale pink) vanish on paper or on the after-dark band, so they get a thin ink edge.
function isLight(c) {
  const v = String(c || '').replace('#', '');
  if (v.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

function Legs({ legs, t0, X, y }) {
  const m = (s) => (s - t0) / 60;
  return (
    <g>
      {legs.map((l, i) => {
        const a = X(m(l.dep)), b = X(m(l.arr));
        if (!(b > a)) return null;
        if (l.type === 'ride') {
          return (
            <g key={i}>
              <rect x={a} y={y - 5} width={b - a} height={10} rx="3" fill={hex(l.color)}
                stroke={isLight(hex(l.color)) ? C.ink : 'none'} strokeOpacity="0.7" strokeWidth="1" />
              {b - a > 10 && <text x={(a + b) / 2} y={y - 10} textAnchor="middle" className="pd-route-t">{l.route}</text>}
            </g>
          );
        }
        if (l.type === 'wait') return <line key={i} x1={a} x2={b} y1={y} y2={y} stroke={C.light} strokeWidth="2" />;
        return <line key={i} x1={a} x2={b} y1={y} y2={y} stroke={C.ink} strokeWidth="2.5" strokeDasharray="6 5" />;
      })}
    </g>
  );
}

// 2. What one student sees: every home, cost to Jordan a month against hours a week, colored by fit for Jordan's week.
const FIT = ['#D9CBA8', '#B5BE94', '#87A57F', '#55896A', '#1F6F4A'];
function Student({ api }) {
  const [st, setSt] = useState({ status: 'running' });
  useEffect(() => {
    let live = true;
    setSt({ status: 'running' });
    studentExample(api).then((r) => live && setSt({ status: r ? 'done' : 'missing', r }))
      .catch((e) => { console.warn(e); if (live) setSt({ status: 'error' }); });
    return () => { live = false; };
  }, [api, api.version]);
  const r = st.r;
  const same = r && r.best.home.id === r.cheapest.home.id;
  return (
    <Slide
      title="The cheapest rent is not the cheapest home."
      foot={r ? `${r.persona.name}'s week, a sample student, through all ${r.n} sample listings on the real timetables, at starting values before any picks: the You tab's first screen. Rents include utilities.` : null}
    >
      {st.status === 'running' && <Wait what="Running the week through every home now." />}
      {(st.status === 'missing' || st.status === 'error') && <Wait what="The week or ranking module is not in this build." />}
      {st.status === 'done' && r && (
        <div className="pd-two">
          <div>
            <RentScatter r={r} />
            <div className="pd-pair">
              <PairKey x={r.cheapest} ring={C.ink} tag="Lowest rent" price={`from ${usd(r.cheapest.from)}`} />
              {!same && <PairKey x={r.best} ring={C.green} tag={`Best for ${r.persona.name}`} price={usd(r.best.rent)} room={r.best.roomLabel} />}
            </div>
          </div>
          <div className="pd-hero">
            {same ? (
              <><div className="pd-hero-v">Same home</div><div className="pd-hero-l">The lowest rent is also the best home for this week.</div></>
            ) : (
              <>
                <div className="pd-hero-v">{usd(r.gap)}<span> a month</span></div>
                <div className="pd-hero-l">more for {r.persona.name} at the lowest rent than at the best home, once time, dark walks and trips with no ride count</div>
              </>
            )}
          </div>
        </div>
      )}
    </Slide>
  );
}

function PairKey({ x, ring, tag, price, room }) {
  return (
    <div className="pd-pairkey">
      <svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke={ring} strokeWidth="2.5" /></svg>
      <div>
        <b>{tag}</b> <span className="pd-gray">{x.home.name}</span>
        <div className="pd-pair-n"><span>{price}<small>/mo{room ? `, ${room}` : ''}</small></span><span>{x.weekHours.toFixed(1)}<small> h/wk</small></span><span>{int(x.stranded)}<small> trips a week with no ride</small></span></div>
      </div>
    </div>
  );
}

// Same axes as the You tab's trade-off chart: cost to the student a month across, hours a week getting around up.
function RentScatter({ r }) {
  const [hover, setHover] = useState(null);
  const rows = r.rows || [r.cheapest, r.best];
  const W = 760, H = 390, L = 56, R = 16, T = 34, B = 46;
  const xs = rows.map((d) => d.cost), ys = rows.map((d) => d.weekHours);
  const xStep = (Math.max(...xs) - Math.min(...xs)) > 1000 ? 500 : 250;
  const x0 = Math.floor(Math.min(...xs) / xStep) * xStep, x1 = Math.ceil(Math.max(...xs) / xStep) * xStep;
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1), y1 = Math.ceil(Math.max(...ys)) + 1;
  const X = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - T - B);
  const xt = []; for (let v = x0; v <= x1; v += xStep) xt.push(v);
  const yStep = (y1 - y0) > 8 ? 2 : 1;
  const yt = []; for (let v = y0; v <= y1; v += yStep) yt.push(v);
  const n = rows.length;
  const fill = (d) => FIT[Math.min(FIT.length - 1, Math.floor(((n - d.rank) / Math.max(1, n - 1)) * FIT.length))];
  const special = (d) => d.home.id === r.best.home.id ? C.green : d.home.id === r.cheapest.home.id ? C.ink : null;
  const sorted = [...rows].sort((a, b) => (special(a) ? 1 : 0) - (special(b) ? 1 : 0));
  const hv = hover && rows.find((d) => d.home.id === hover);
  return (
    <svg className="pd-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`${n} homes by cost to the student a month and hours a week getting around. Lowest rent ${r.cheapest.home.name}, ${usd(r.cheapest.rent)} rent, ${usd(r.cheapest.cost)} cost. Best for this week ${r.best.home.name}, ${usd(r.best.rent)} rent, ${usd(r.best.cost)} cost.`}>
      {yt.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C.ink : C.line} strokeWidth="1" />
          <text x={L - 8} y={Y(v) + 4} textAnchor="end" className="pd-tick">{v}</text>
        </g>
      ))}
      {xt.map((v) => <text key={v} x={X(v)} y={H - B + 18} textAnchor="middle" className="pd-tick">${v.toLocaleString('en-US')}</text>)}
      <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="pd-axis">Cost to {r.persona.name} a month: rent plus time, dark walks and trips with no ride</text>
      <text x={L - 40} y={12} className="pd-axis">Hours a week getting around</text>
      <g transform={`translate(${W - R - 236}, 0)`}>
        <text x={0} y={12} className="pd-axis">Worse fit</text>
        {FIT.map((c, i) => <circle key={c} cx={84 + i * 18} cy={7} r="6" fill={c} />)}
        <text x={84 + FIT.length * 18} y={12} className="pd-axis">Better</text>
      </g>
      {sorted.map((d) => {
        const s = special(d);
        return (
          <g key={d.home.id} onMouseEnter={() => setHover(d.home.id)} onMouseLeave={() => setHover(null)}>
            <circle cx={X(d.cost)} cy={Y(d.weekHours)} r="14" fill="transparent" />
            <circle cx={X(d.cost)} cy={Y(d.weekHours)} r={s ? 8 : 6.5} fill={fill(d)} stroke="#fff" strokeWidth="2" />
            {s && <circle cx={X(d.cost)} cy={Y(d.weekHours)} r="13" fill="none" stroke={s} strokeWidth="2.5" />}
          </g>
        );
      })}
      {hv && (() => {
        const label = `${hv.home.name}: ${usd(hv.cost)} cost, ${usd(hv.rent)} rent, ${hv.weekHours.toFixed(1)} h/wk`;
        const w = label.length * 7.4 + 18;
        const x = Math.max(L, Math.min(W - R - w, X(hv.cost) - w / 2));
        const y = Y(hv.weekHours) - 44 < T ? Y(hv.weekHours) + 20 : Y(hv.weekHours) - 44;
        return <g pointerEvents="none"><rect x={x} y={y} width={w} height={26} rx="4" fill="#fff" stroke={C.line} /><text x={x + 9} y={y + 17} className="pd-tip">{label}</text></g>;
      })()}
    </svg>
  );
}

// 3. What a group gets: the house, floor by floor, each room with its person and rent.
const FLOOR_ORDER = ['attic', '4', '3', '2', '1', 'basement'];
const FLOOR_NAME = { attic: 'Attic', 4: '4th floor', 3: '3rd floor', 2: '2nd floor', 1: '1st floor', basement: 'Basement' };
function Group({ api }) {
  const [g, setG] = useState({ status: 'running' });
  useEffect(() => {
    let live = true;
    setG({ status: 'running' });
    groupExample(api).then((r) => live && setG({ status: r ? 'done' : 'missing', r }))
      .catch((e) => { console.warn(e); if (live) setG({ status: 'error' }); });
    return () => { live = false; };
  }, [api, api.version]);
  const r = g.r;
  const total = r ? r.split.reduce((a, s) => a + (Number.isFinite(s.price) ? s.price : 0), 0) : null;
  return (
    <Slide
      title="One house, one room each, a split nobody wants to swap."
      foot={r ? `Five sample friends, top of ${r.houses} sample houses, solved now in this browser${Number.isFinite(r.ms) ? ` in ${int(r.ms)} ms` : ''}. Caps stay private.` : null}
    >
      {g.status === 'running' && <Wait what="Solving the group now." />}
      {(g.status === 'missing' || g.status === 'error') && <Wait what="The group solver is not in this build." />}
      {g.status === 'done' && r && (
        <div className="pd-two">
          <HouseDiagram r={r} />
          <div className="pd-hero">
            <div className="pd-hero-v">{usd(total)}<span> a month</span></div>
            <div className="pd-hero-l">{r.house.name}{Number.isFinite(r.house.rent) && Math.round(total) === Math.round(r.house.rent) ? ', every dollar of the rent covered' : ''}</div>
            <ul className="pd-checks">
              <li className={r.checked === true ? 'ok' : ''}><Tick ok={r.checked === true} />{r.checked === true ? 'Nobody would swap' : r.checked === false ? 'Swap check failed' : 'Not checked'}</li>
              <li className={r.feasible ? 'ok' : ''}><Tick ok={!!r.feasible} />{r.feasible ? 'Every cap met' : 'Not every cap met'}</li>
            </ul>
            {r.capMove && (
              <p className="pd-gray pd-capmove">
                If {r.capMove.name}'s cap drops ${r.capMove.delta}: {r.capMove.topAfter?.id === r.house.id ? `${r.house.name} stays on top.` : `the group moves to ${r.capMove.topAfter?.name}.`}
              </p>
            )}
          </div>
        </div>
      )}
    </Slide>
  );
}

const Tick = ({ ok }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <circle cx="11" cy="11" r="10" fill={ok ? C.green : C.light} />
    {ok ? <path d="M6.5 11.5 L9.6 14.5 L15.5 8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M7 11 H15" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />}
  </svg>
);

function HouseDiagram({ r }) {
  const placed = r.split.map((s) => ({ ...s, floor: String(s.roomInfo?.floor ?? '1'), sqft: s.roomInfo?.sqft || 120 }));
  const floors = FLOOR_ORDER.filter((f) => placed.some((p) => p.floor === f));
  placed.forEach((p) => { if (!floors.includes(p.floor)) floors.push(p.floor); });
  const W = 760, L = 112, R = 8, roof = 46, fh = 92, gap = 0;
  const H = roof + floors.length * (fh + gap) + 4;
  const inner = W - L - R;
  const maxFloor = Math.max(...floors.map((f) => placed.filter((p) => p.floor === f).reduce((a, p) => a + p.sqft, 0)));
  return (
    <svg className="pd-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`${r.house.name}: ${r.split.map((s) => `${s.name}, ${s.room}, ${usd(s.price)}`).join('; ')}.`}>
      <path d={`M${L - 10},${roof} L${L + inner / 2},4 L${W - R + 10 - 10},${roof}`} fill="none" stroke={C.ink} strokeWidth="2" strokeLinejoin="round" />
      {floors.map((f, fi) => {
        const y = roof + fi * (fh + gap);
        const rooms = placed.filter((p) => p.floor === f);
        const sum = rooms.reduce((a, p) => a + p.sqft, 0);
        const span = inner * (sum / maxFloor);
        const x0 = L + (inner - span) / 2;
        let x = x0;
        return (
          <g key={f}>
            <text x={0} y={y + fh / 2 + 5} className="pd-lane-k">{FLOOR_NAME[f] || `Floor ${f}`}</text>
            {f === 'basement' && <line x1={L - 10} x2={W - R} y1={y} y2={y} stroke={C.gray} strokeWidth="1" />}
            {rooms.map((p) => {
              const w = span * (p.sqft / sum);
              const rx = x; x += w;
              return (
                <g key={p.name}>
                  <rect x={rx + 3} y={y + 3} width={w - 6} height={fh - 6} rx="8" fill="#fff" stroke={C.line} />
                  <rect x={rx + 3} y={y + 3} width={w - 6} height="8" rx="4" fill={p.color || C.ink} />
                  <text x={rx + 16} y={y + 36} className="pd-room-n">{p.name}</text>
                  <text x={rx + 16} y={y + 64} className="pd-room-v">{usd(p.price)}</text>
                  {w > 190 && <text x={rx + w - 14} y={y + 64} textAnchor="end" className="pd-room-s">{p.room}</text>}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// 4. How it works, drawn as a route line: each stage is a stop, ending in two terminals.
function HowItWorks({ api, ev }) {
  const f = ev ? evidenceFigures(ev) : {};
  const c = api.config || {};
  const stops = [
    { k: 'Timetables, streets', m: 'TheRide, U-M, OpenStreetMap', real: true },
    { k: 'Router', m: `Connection Scan${f.msPerScan ? `, ${Number(f.msPerScan).toFixed(2)} ms` : ''}` },
    { k: 'Your week', m: 'Every trip, from every home' },
    { k: 'Picks', m: `${c.picksMin ?? 3} to ${c.picksMax ?? 6} questions` },
  ];
  const ends = [
    { k: 'Your best home', m: 'Ranked in dollars a month' },
    { k: 'Fair split', m: 'Envy-free, private caps' },
  ];
  const W = 1200, H = 360, y = 150, xs = [60, 360, 620, 860], fx = 1000, ey = [70, 250];
  return (
    <Slide title="Six stops, all in the browser, offline." foot="No API keys and no language model. Every number traces back to a timetable row or a linear program.">
      <svg className="pd-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Pipeline: ${stops.map((s) => s.k).join(', ')}, then ${ends.map((e) => e.k).join(' and ')}.`}>
        <line x1={xs[0]} x2={xs[3]} y1={y} y2={y} stroke={C.green} strokeWidth="8" strokeLinecap="round" />
        {ey.map((e) => <path key={e} d={`M${xs[3]},${y} C${xs[3] + 110},${y} ${fx - 110},${e} ${fx},${e}`} fill="none" stroke={C.green} strokeWidth="8" strokeLinecap="round" />)}
        {stops.map((s, i) => (
          <g key={s.k}>
            <circle cx={xs[i]} cy={y} r="15" fill={s.real ? C.ink : '#fff'} stroke={C.ink} strokeWidth="4" />
            <text x={xs[i]} y={y + 50} textAnchor={i === 0 ? 'start' : 'middle'} dx={i === 0 ? -14 : 0} className="pd-stop-k">{s.k}</text>
            <text x={xs[i]} y={y + 76} textAnchor={i === 0 ? 'start' : 'middle'} dx={i === 0 ? -14 : 0} className="pd-stop-m">{s.m}</text>
          </g>
        ))}
        {ends.map((e, i) => (
          <g key={e.k}>
            <rect x={fx - 16} y={ey[i] - 16} width="32" height="32" rx="8" fill="#fff" stroke={C.ink} strokeWidth="4" />
            <text x={fx + 32} y={ey[i] - 2} className="pd-stop-k">{e.k}</text>
            <text x={fx + 32} y={ey[i] + 24} className="pd-stop-m">{e.m}</text>
          </g>
        ))}
        <text x={xs[0] - 14} y={y - 40} className="pd-stop-m">Real data</text>
      </svg>
    </Slide>
  );
}

// 5. Evidence: three checks, each a small chart and one number.
function Evidence({ ev }) {
  if (!ev) return <Slide title="Each model checked against something independent."><Wait what="Reading the evidence files." /></Slide>;
  const f = evidenceFigures(ev);
  const h = r5Diffs(ev.r5);
  const series = regretSeries(ev.recovery)?.filter((x) => x.policy !== 'fixed');
  return (
    <Slide title="Each model checked against something independent." foot="Read live from the test files. Details in the How we know tab.">
      <div className="pd-three">
        <section>
          {f.trips ? <div className="pd-ev-v">{int(f.trips.equal)}<span> of {int(f.trips.total)}</span></div> : <Wait what="router.json not run." />}
          <div className="pd-ev-l">trips equal to the second against a separate router</div>
          {h && <div className="pd-ev-chart"><DiffHistogram data={h} compact height={190} /><div className="pd-ev-c">Against R5: minutes apart, green within 2</div></div>}
        </section>
        <section>
          {f.rec?.main ? <div className="pd-ev-v">{usd(-f.rec.main.diff.mean)}<span> a month</span></div> : <Wait what="recovery.json not run." />}
          <div className="pd-ev-l">less lost to the wrong home than random questions</div>
          {series && <div className="pd-ev-chart"><RegretCurves series={series} compact height={190} /><div className="pd-ev-c">After each question: <b className="pd-green">ours</b> vs random</div></div>}
        </section>
        <section>
          {f.lp ? <div className="pd-ev-v">{int(Math.min(f.lp.envyFree, f.lp.checkerOk))}<span> of {int(f.lp.instances)}</span></div> : <Wait what="lp.json not run." />}
          <div className="pd-ev-l">random houses split with nobody wanting to swap</div>
          {ev.lp && <div className="pd-ev-chart"><CheckGrid lp={ev.lp} cols={20} cell={3} gap={1} showLabels={false} /><div className="pd-ev-c">One square per house</div></div>}
        </section>
      </div>
    </Slide>
  );
}

// 6. The business, as a hypothesis.
function Business({ api }) {
  const W = 1200, H = 300;
  const colors = (api?.data?.personas || []).map((p) => p.color).filter(Boolean).slice(0, 5);
  return (
    <Slide title="The group is the user. The operator would pay." aside={<span className="pd-chip">Hypothesis, not tested</span>}
      foot="No market size, price or revenue figure: we have not measured one.">
      <svg className="pd-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Groups of friends use it free and arrive agreed; operators of one-of-a-kind houses would pay, we think.">
        <defs><marker id="pd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={C.ink} /></marker></defs>
        <g>
          <rect x="20" y="40" width="380" height="170" rx="8" fill="#fff" stroke={C.line} />
          {colors.map((c, i) => <circle key={c} cx={64 + i * 34} cy="86" r="13" fill={c} stroke="#fff" strokeWidth="2" />)}
          <text x="50" y="146" className="pd-node-k">Groups of friends</text>
          <text x="50" y="180" className="pd-node-m">Free</text>
        </g>
        <line x1="420" x2="776" y1="125" y2="125" stroke={C.ink} strokeWidth="3" markerEnd="url(#pd-arrow)" />
        <text x="598" y="106" textAnchor="middle" className="pd-stop-m">arrive agreed, with a fair rent per room</text>
        <g>
          <rect x="800" y="40" width="380" height="170" rx="8" fill="#fff" stroke={C.ink} strokeWidth="2" />
          <path d="M836,98 L866,72 L896,98 L896,104 L836,104 Z M842,104 L842,132 L890,132 L890,104" fill="none" stroke={C.ink} strokeWidth="2.5" strokeLinejoin="round" />
          <text x="830" y="166" className="pd-node-k">Operators of odd houses</text>
          <text x="830" y="196" className="pd-node-m">Would pay, we think</text>
        </g>
        <text x="50" y="262" className="pd-stop-m">Test: do groups that use it agree faster?</text>
        <text x="830" y="262" className="pd-stop-m">Test: one operator, one leasing season</text>
      </svg>
    </Slide>
  );
}

// 7. Next (optional): the line, extended with dashed stops not built yet.
function Next() {
  const stops = ['Real listings', 'Real students', 'Fall timetables', 'Night, weather', 'Stop limits'];
  const W = 1200, H = 260, y = 110, x0 = 60, step = 212;
  return (
    <Slide title="Make it true for a real house and a real group.">
      <svg className="pd-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Next: ${stops.join(', ')}.`}>
        <line x1={x0} x2={x0 + 60} y1={y} y2={y} stroke={C.green} strokeWidth="8" strokeLinecap="round" />
        <line x1={x0 + 60} x2={x0 + 170 + (stops.length - 1) * step} y1={y} y2={y} stroke={C.green} strokeWidth="4" strokeDasharray="10 9" />
        <circle cx={x0} cy={y} r="15" fill={C.ink} />
        <text x={x0 - 14} y={y - 34} className="pd-stop-m">Today</text>
        {stops.map((s, i) => {
          const x = x0 + 170 + i * step;
          return (
            <g key={s}>
              <circle cx={x} cy={y} r="14" fill="#fff" stroke={C.ink} strokeWidth="3" strokeDasharray="5 4" />
              <text x={x} y={y + 52} textAnchor="middle" className="pd-stop-k">{s}</text>
            </g>
          );
        })}
      </svg>
    </Slide>
  );
}

export const SLIDES = [
  {
    id: 'problem', title: 'The problem', Comp: Problem,
    notes: [
      'Read the title. This is the example from the case sheet.',
      'Point at the lines: same home, three campuses, walk or bus, 2:00 PM or 11:30 PM. The minutes are computed live, not typed in.',
      'Bus lines are drawn in each route\'s real color. Dashed is walking, gray is waiting at the stop. The navy band is a trip after dark.',
      'The 11:30 PM bus: fewer buses, so longer waits, and the walk is in the dark.',
      'Second problem: in Ann Arbor you sign months before you know your fall schedule. Ann Arbor\'s ORD-24-03 lets a landlord sign next year\'s tenant 210 days into the current lease.',
      'Bus minutes run from leaving the building to the front door, wait at the stop included. Walking is 1.3 m/s on OpenStreetMap streets.',
      'If asked: you can switch the home in the menu at the top right.',
    ],
  },
  {
    id: 'student', title: 'What a student sees', Comp: Student,
    notes: [
      'One fictional student, Jordan, a North Campus engineer with a late lab.',
      'Each dot is a home: cost to Jordan a month across (rent plus time, dark walks and trips with no ride), hours a week getting around up. Darker green fits Jordan\'s week better.',
      'Same numbers as the You tab before any pick: starting values over 24 possible weeks. The picks then learn Jordan\'s own values.',
      'Black ring: the home with the cheapest room. Green ring: Quorum\'s top pick for Jordan\'s week.',
      'Read the dollar gap on the right. It is computed now from the real timetables, not typed in.',
      'Say this out loud: the cheap home loses on the trips with no ride home and the time getting around. A real student sets what those are worth with the picks.',
      'Then switch to the You tab and show the picks and the ranking.',
    ],
  },
  {
    id: 'group', title: 'What a group gets', Comp: Group,
    notes: [
      'Five fictional friends. Each enters a week and a private cap.',
      'Read the house: one room each, floor by floor, rooms drawn to size. The rents add up to the house rent, and nobody would rather swap.',
      'Read the cap line: one friend lowers a private cap a little and the whole group may move house.',
      'Method: envy-free maximin rents (Gal, Mash, Procaccia, Zick 2017) with private caps (Procaccia, Velez, Yu 2018).',
      'Then switch to the Your group tab.',
    ],
  },
  {
    id: 'how', title: 'How it works', Comp: HowItWorks,
    notes: [
      'Read the line left to right like a bus route: real timetables and streets, our router, the week, the picks, then the two outputs, the best home and the fair split.',
      'Router: Connection Scan Algorithm (Dibbelt et al. 2017), a published method for timetable routing.',
      'Your week: every trip of your week from every home. Walk, wait, ride and minutes after dusk, with dusk from the NOAA solar equations.',
      'Picks: each question is chosen to teach the model the most (BALD, Houlsby et al. 2011, with a particle filter). That is the AI part. No language model, on purpose: it runs offline and every number can be traced.',
      'Ranking: expected regret in $ a month over many possible fall weeks and many draws of your values (Monte Carlo).',
      'Fair split: the envy-free rent method behind Spliddit, with private caps, solved as a linear program.',
    ],
  },
  {
    id: 'evidence', title: 'Evidence', Comp: Evidence,
    notes: [
      'Router: a second router, written separately in Python, gets the same answer on every trip.',
      'R5 is a widely used transit engine. It differs by design (it waits at least 60 s before each boarding), so small gaps are expected.',
      'Fair split: thousands of random houses, every split envy-free and checked by separate code. Read the number off the slide.',
      'Picks: tested on SYNTHETIC students. Read the regret number exactly as the slide states it. The How we know tab shows every setting, including the fixed list of questions.',
    ],
  },
  {
    id: 'business', title: 'The business', Comp: Business,
    notes: [
      'Say "hypothesis" out loud. We have not tested it with an operator.',
      'Groups use it free. The operator of irregular houses gets agreed groups and a fair rent per room. That is the Owners tab.',
      'Each side ends in a test we have not run yet: do groups agree faster, and one operator over one leasing season, time to sign and empty rooms.',
      'Be clear about what is synthetic: homes, rents, rooms, people. Timetables, streets and places are real.',
    ],
  },
  {
    id: 'next', title: 'Next', Comp: Next,
    notes: [
      'Optional. Use it only if there is time, or in Q&A.',
      'Real listings: the engine reads any listing file. Start with one operator\'s houses and rooms.',
      'Real students: check that six picks match what students say they value. Picks like these tend to understate the value of time (Small 2012).',
      'Fall timetables: today one December week stands in for both terms. Daylight is already computed per term date.',
      'Late night and weather: FlexRide is on demand and not in the timetables. Walking is 1.3 m/s for everyone, with no hills or snow.',
      'Mid-trip stop limits: a stop in the middle of a trip where the bus only drops off or only picks up is not modeled yet. First and last stops already are.',
    ],
  },
];
