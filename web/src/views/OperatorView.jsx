// Operator view: a portfolio table of every home, "who this house fits" from the SYNTHETIC demand map
// (2,000 synthetic weeks routed on the real timetables), per-room envy-free rents for typical SYNTHETIC groups,
// the assumed room values that drive them (live sliders), and a renovation lever.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Label, Stat, Button, Pending, Note, Guard, usd, signedUsd, pct, ms, modOf, homesOf, configOf, seeded } from './group/kit.jsx';
import { useConfigVersion } from '../engine/useConfig.js';
import { pickIrregular, drawGroups, renovate, canAddHalfBath, roomPricingLocal, renovationDelta } from './operator/logic.js';
import {
  CAMPUS_WORDS, EXTRAS, jobWords, studyWords, gymWords, weekWords, parseKey, countKinds, kindGrid, winsSummary,
  firstRank, portfolioRow, actionFor, SORTS,
} from './operator/fit.js';
import JumpBar from '../components/JumpBar.jsx';
import './operator/operator.css';

const BATH = { private: 'private bath', half: 'half bath', shared: 'shared bath' };
const FLOOR = { basement: 'basement', 1: '1st floor', 2: '2nd floor', attic: 'attic' };
const LIGHT = ['little daylight', 'some daylight', 'bright'];
const SEED = 2026;      // local fallback draws
const POP_SEED = 11;    // same seed as scripts/build_operator.mjs
const n0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : 'n/a');

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

export default function OperatorView({ api }) {
  return (
    <div className="qv-view op-view">
      <div className="qv-head">
        <h1>Operator</h1>
        <p>Which weeks each home fits, and what each room would rent for if typical groups split the house rent so nobody would swap rooms.</p>
        <Label>SYNTHETIC population and homes, not market rents</Label>
      </div>
      <Guard name="Operator view"><OperatorBody api={api} /></Guard>
    </div>
  );
}

function OperatorBody({ api }) {
  useConfigVersion(api);
  const model = modOf(api, 'model');
  const fair = modOf(api, 'fair');
  const cfg = configOf(api);
  const homes = homesOf(api);
  const opData = api?.data?.operator || null;
  const demand = opData?.demand || null;
  const info = model?.PARAM_INFO;

  const preferId = opData?.houseId || opData?.featured || null;
  const defaultHome = useMemo(() => pickIrregular(homes, preferId), [homes, preferId]);
  const pricedHomes = useMemo(() => (homes || []).filter((h) => (h.rooms || []).length >= 2), [homes]);
  const [houseId, setHouseId] = useState(null);
  const home = (houseId && pricedHomes.find((h) => h.id === houseId)) || defaultHome;
  const houseRef = useRef(null);

  const [bathMed, setBathMed] = useState(null);
  const [sizeMed, setSizeMed] = useState(null);
  const [renoRoom, setRenoRoom] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const priorBath = info?.wBath?.prior?.median ?? 60;
  const priorSize = info?.wSize?.prior?.median ?? 8;
  const wBath = bathMed ?? priorBath;
  const wSize = sizeMed ?? priorSize;
  const G = cfg?.operatorGroups ?? 200;

  const renoChoices = home ? home.rooms.map((r, j) => ({ r, j })).filter(({ r }) => canAddHalfBath(r)) : [];
  const defaultReno = renoChoices.find(({ r }) => r.floor === 'basement') || renoChoices[0];
  const renoIdx = renoRoom != null && renoChoices.some(({ j }) => j === renoRoom) ? renoRoom : defaultReno?.j ?? null;

  // The engine path (operator.js) rebuilds the same SYNTHETIC population and groups as scripts/build_operator.mjs.
  const opMod = modOf(api, 'operator');
  const population = useMemo(() => {
    if (!opMod?.makePopulation) return null;
    try { return opMod.makePopulation({ n: cfg?.population ?? 2000, seed: POP_SEED, cfg: cfg || undefined }); } catch { return null; }
  }, [opMod, cfg]);
  const kindCounts = useMemo(() => (population ? countKinds(population) : null), [population]);

  const selectHouse = (id, scroll) => {
    setHouseId(id); setRenoRoom(null);
    if (scroll && houseRef.current?.scrollIntoView) houseRef.current.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  // Recompute 200 ms after the last slider move (debounced; each run is G envy-free solves, twice with a renovation).
  useEffect(() => {
    if (!fair || !model || !home) return;
    setBusy(true);
    const id = setTimeout(() => {
      try {
        const t0 = performance.now();
        const medians = { wBath, wSize };
        const reno = renoIdx != null ? { roomId: home.rooms[renoIdx].id, bath: 'half' } : null;
        let out;
        if (opMod?.roomPricing && opMod?.groupsFor && population) {
          const groups = opMod.groupsFor({ home, population, cfg: cfg || undefined, count: G });
          const r = opMod.roomPricing({ home, groups, renovation: reno, cfg: cfg || undefined, medians, prior: population.prior });
          const solved = r.groups ?? groups.length;
          out = {
            source: 'engine',
            base: { rooms: r.rooms, solved, failed: groups.length - solved, negative: Math.round((r.negativeShare || 0) * solved) },
            delta: r.renovationDelta,
            prior: population.prior,
          };
        } else {
          const prior = model.priorFor ? model.priorFor({ overrides: { wBath: { median: wBath }, wSize: { median: wSize } } }) : null;
          const groups = drawGroups({ model, prior, n: home.rooms.length, G, r: seeded(SEED) });
          const base = roomPricingLocal({ fair, model, home, groups, cfg });
          let delta = null;
          if (renoIdx != null) delta = renovationDelta(base, roomPricingLocal({ fair, model, home: renovate(home, renoIdx, 'half'), groups, cfg }), renoIdx);
          out = { source: 'view', base, delta, prior };
        }
        setResult({ ...out, renoIdx, homeId: home.id, wBath, wSize, totalMs: performance.now() - t0, solves: out.base.solved * (reno ? 2 : 1) });
      } catch (e) {
        setResult({ error: String(e.message || e), homeId: home.id });
      }
      setBusy(false);
    }, 200);
    return () => clearTimeout(id);
  }, [fair, model, opMod, population, home, wBath, wSize, renoIdx, G, cfg]);

  // Portfolio room rents: start from the shipped numbers (our assumed values), then re-solve every home in the
  // browser, one home per tick, whenever the sliders move.
  const pre = useMemo(() => new Map((opData?.homes || []).map((ph) => [ph.homeId, ph.rooms.map((r) => r.p50)])), [opData]);
  const sliderKey = `${wBath}|${wSize}`;
  const [live, setLive] = useState({ key: null, typical: new Map(), done: 0 });
  const [full, setFull] = useState(null);
  useEffect(() => {
    if (!opMod?.roomPricing || !opMod?.groupsFor || !population || !pricedHomes.length) return;
    let i = 0, cancelled = false, timer = null;
    const acc = new Map();
    const total = pricedHomes.length;
    const step = () => {
      if (cancelled) return;
      const h = pricedHomes[i];
      try {
        const groups = opMod.groupsFor({ home: h, population, cfg: cfg || undefined, count: G });
        const r = opMod.roomPricing({ home: h, groups, cfg: cfg || undefined, medians: { wBath, wSize }, prior: population.prior });
        acc.set(h.id, r.rooms.map((x) => x.p50));
      } catch { /* leave this home on its last numbers */ }
      i++;
      if (i % 4 === 0 || i === total) setLive({ key: sliderKey, typical: new Map(acc), done: i });
      if (i === total) setFull({ key: sliderKey, typical: new Map(acc) });
      else timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [opMod, population, pricedHomes, wBath, wSize, G, cfg, sliderKey]);
  const portUpdating = !!opMod?.roomPricing && !!population && !(full && full.key === sliderKey);
  const typicalFor = (id) => (live.key === sliderKey && live.typical.get(id)) || full?.typical.get(id) || pre.get(id) || null;

  if (!homes) return <Pending what="homes.json (SYNTHETIC homes)" detail="The data builder writes it to web/public/data/." />;
  if (!model) return <Pending what="engine/model.js" />;
  if (!home) return <Note>No house with three or more rooms in homes.json.</Note>;

  const res = result && result.homeId === home.id ? result : null;
  const priorRows = ['wBath', 'wSize', 'wLight'].map((k) => {
    const p = res?.prior?.[k] || info?.[k]?.prior || {};
    return { k, label: info?.[k]?.label || k, unit: info?.[k]?.unit || '', median: k === 'wBath' ? wBath : k === 'wSize' ? wSize : p.median, sigma: p.sigma };
  });

  const scale = (() => {
    if (!res?.base) return null;
    const xs = res.base.rooms.flatMap((r) => [r.p10, r.p90]).concat(home.rooms.map((r) => r.asking).filter(Number.isFinite));
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const pad = (hi - lo) * 0.05 || 10;
    return { lo: lo - pad, hi: hi + pad };
  })();
  const pos = (x) => (scale ? `${(100 * (x - scale.lo)) / (scale.hi - scale.lo)}%` : '0%');

  return (
    <div className="qv-grid">
      <div className="qv-span-12">
        <JumpBar items={[
          { label: 'Where to act', find: 'Where to act' }, { label: 'Who it fits', find: 'Who this house fits, SYNTHETIC students' },
          { label: 'Room by room', find: 'Room by room' }, { label: 'Half bath', find: 'Add a half bath to one room' },
        ]} />
      </div>
      <div className="qv-span-12">
        <Portfolio homes={homes} demand={demand} typicalFor={typicalFor} selectedId={home.id}
          onPick={(id) => selectHouse(id, true)} updating={portUpdating} done={live.key === sliderKey ? live.done : 0}
          total={pricedHomes.length} wBath={wBath} wSize={wSize} />
      </div>

      <div className="qv-span-12" ref={houseRef} style={{ scrollMarginTop: 12 }}>
        <Panel kicker="Who this house fits, SYNTHETIC students" title={home.name}
          right={pricedHomes.length > 1 ? (
            <select aria-label="House" style={{ maxWidth: '100%' }} value={home.id} onChange={(e) => selectHouse(e.target.value, false)}>
              {pricedHomes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          ) : null}>
          <FitPanel home={home} homes={homes} demand={demand} kindCounts={kindCounts} assumptions={opMod?.POP_ASSUMPTIONS}
            onPick={(id) => selectHouse(id, false)} pickable={(id) => pricedHomes.some((h) => h.id === id)} />
        </Panel>
      </div>

      <div className="qv-span-12">
        <Panel kicker="Room by room" title={`Fair rent for each room of ${home.name.split(',')[0]}`}>
          <div className="qv-stats">
            <Stat label="house rent per month" value={`${usd(home.rent)}/mo`} />
            <Stat label="rooms" value={home.rooms.length} />
            <Stat label="synthetic groups" value={G} note={res?.source === 'engine' ? `from a population of ${n0(population?.n)}` : `drawn from our assumed values`} />
            {res?.totalMs != null && res.base && <Stat label="worked out in this browser" value={ms(res.totalMs)} note={`${res.solves} house splits`} />}
          </div>
          {!fair ? <Pending what="engine/fair.js" detail="Per-room rents need the envy-free solver." /> : res?.error ? (
            <Note tone="bad">Pricing failed: {res.error}</Note>
          ) : !res ? <p className="qv-muted">Splitting the rent for {G} groups...</p> : (
            <>
              <h3 className="qv-kicker" style={{ margin: '4px 0 6px' }}>Low, typical and high fair rent across {res.base.solved} synthetic groups</h3>
              <div className="qv-scroll">
                <table className="qv-table" style={{ opacity: busy ? 0.6 : 1 }}>
                  <thead>
                    <tr>
                      <th>Room</th><th>Features</th>
                      <th className="num" title="1 in 10 synthetic groups split this room lower">Low /mo</th><th className="num" title="Half the synthetic groups split this room lower, half higher">Typical /mo</th><th className="num" title="1 in 10 synthetic groups split this room higher">High /mo</th>
                      <th className="num">Asking /mo</th><th style={{ minWidth: 180 }}>Range across groups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {home.rooms.map((room, j) => {
                      const r = res.base.rooms[j];
                      return (
                        <tr key={room.id} className={j === res.renoIdx ? 'sel' : ''}>
                          <td>{room.label}</td>
                          <td className="qv-small">{room.sqft} sq ft, {BATH[room.bath] || room.bath}, {FLOOR[room.floor] || room.floor}, {LIGHT[room.light] ?? `light ${room.light}`}</td>
                          <td className="num">{usd(r.p10)}</td>
                          <td className="num"><b>{usd(r.p50)}</b></td>
                          <td className="num">{usd(r.p90)}</td>
                          <td className="num qv-muted">{usd(room.asking)}</td>
                          <td>
                            <div className="qv-range" aria-label={`low ${usd(r.p10)}, typical ${usd(r.p50)}, high ${usd(r.p90)}`}>
                              <div className="track" />
                              <div className="band" style={{ left: pos(r.p10), width: `calc(${pos(r.p90)} - ${pos(r.p10)})` }} />
                              <div className="mid" style={{ left: pos(r.p50) }} />
                              {Number.isFinite(room.asking) && <div className="ask" style={{ left: pos(room.asking) }} title="asking" />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="qv-small qv-muted">
                Bar: low to high fair rent, the middle 8 in 10 of {res.base.solved} synthetic groups. Tick: typical rent.
                Dotted line: asking rent. Each group's rents sum to {usd(home.rent)}; the typical rents of separate rooms
                need not add up to it exactly.
                {res.base.failed ? ` ${res.base.failed} groups could not be split and are left out.` : ''}
                {res.base.negative ? ` ${res.base.negative} groups needed a negative room rent.` : ''}
                {' '}Preference-based, synthetic, not market rents.
              </p>
              <AskingCallout home={home} rooms={res.base.rooms} />
            </>
          )}
        </Panel>
      </div>

      <div className="qv-span-6">
        <Panel kicker="What drives these rents" title="Our assumed room values">
          <table className="qv-table">
            <thead><tr><th>Room feature</th><th className="num">Typical value</th><th>Unit</th></tr></thead>
            <tbody>
              {priorRows.map((p) => (
                <tr key={p.k}><td>{p.label}</td><td className="num">{usd(p.median, p.k === 'wSize' ? 1 : 0)}</td><td className="qv-small">{p.unit}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="qv-stack" style={{ marginTop: 14 }}>
            <Slider id="wbath" label="Private bathroom, typical value" unit="$/month" value={wBath} min={0} max={200} step={5}
              onChange={setBathMed} fmt={(v) => usd(v)} />
            <Slider id="wsize" label="Room size, typical value" unit="$/month per 10 sq ft" value={wSize} min={0} max={30} step={0.5}
              onChange={setSizeMed} fmt={(v) => usd(v, 1)} />
            <div className="qv-row">
              <Button tone="quiet" onClick={() => { setBathMed(null); setSizeMed(null); }} disabled={bathMed == null && sizeMed == null}>Back to our assumed values</Button>
            </div>
          </div>
          <p className="qv-small qv-muted" style={{ marginBottom: 0 }}>
            Each synthetic student's room values spread around these typical values. They are our assumptions, not
            survey data. Commute is left out: it is the same for every room of one house. Every slider position uses the
            same synthetic students. The sliders move the room rents here and in the table of all homes above. They do
            not move who each home fits.
          </p>
        </Panel>
      </div>

      <div className="qv-span-6">
        <Panel kicker="Renovation lever" title="Add a half bath to one room">
          {!fair ? <Pending what="engine/fair.js" /> : !renoChoices.length ? (
            <Note>Every room in {home.name} already has at least a half bath.</Note>
          ) : (
            <div className="qv-stack">
              <div className="qv-row">
                <label htmlFor="reno-room">Room</label>
                <select id="reno-room" value={renoIdx ?? ''} onChange={(e) => setRenoRoom(Number(e.target.value))}>
                  {renoChoices.map(({ r, j }) => <option key={r.id} value={j}>{r.label} ({BATH[r.bath] || r.bath}, {FLOOR[r.floor] || r.floor})</option>)}
                </select>
              </div>
              {res?.delta ? (
                <>
                  <div className="qv-stats">
                    <Stat label={`${home.rooms[res.renoIdx].label}: change in typical fair rent`} value={`${signedUsd(res.delta.roomP50)}/mo`} note="same house rent" />
                    <Stat label="how much more the groups value the whole house" value={`${signedUsd(res.delta.headroom)}/mo`} note="typical group" />
                  </div>
                  <p style={{ margin: 0 }}>
                    At the same house rent of {usd(home.rent)}, this change moves money between rooms. The{' '}
                    {home.rooms[res.renoIdx].label} pays more and the other rooms pay less. The total rent does not change.
                  </p>
                  <p className="qv-small" style={{ margin: '6px 0 0' }}>
                    The bath value is an assumption. A half bath counts as half of a private bath, and the Private
                    bathroom slider sets that value, now <b className="qv-mono">{usd(wBath)}/mo</b>. Move the slider and
                    these numbers move with it.
                  </p>
                </>
              ) : <p className="qv-muted">Working it out...</p>}
            </div>
          )}
        </Panel>
      </div>

      {opData && (
        <div className="qv-span-12">
          <Note>
            Room rents on this page are worked out live in this browser from SYNTHETIC students. Who each home fits
            was worked out ahead of time by the same engine, from the same synthetic students. Nothing leaves this
            browser.
          </Note>
        </div>
      )}
    </div>
  );
}

// ---------- Portfolio: every home in one table ----------
function Portfolio({ homes, demand, typicalFor, selectedId, onPick, updating, done, total, wBath, wSize }) {
  const [sortBy, setSortBy] = useState('off');
  const students = demand?.students || 0;
  const fitOf = useMemo(() => new Map((demand?.homes || []).map((d) => [d.homeId, d])), [demand]);
  const rows = homes.map((home) => portfolioRow({
    home, typical: (home.rooms || []).length >= 2 ? typicalFor(home.id) : null, fit: fitOf.get(home.id), students,
  }));
  const sorted = [...rows].sort(SORTS[sortBy].fn);
  const split = rows.filter((r) => r.off != null);
  const worst = [...split].sort((a, b) => Math.abs(b.worst?.d ?? 0) - Math.abs(a.worst?.d ?? 0))[0];
  const top = demand ? [...rows].filter((r) => r.firstShare != null).sort(SORTS.first.fn)[0] : null;
  const nobody = demand ? rows.filter((r) => r.firstShare === 0).length : 0;
  const singles = rows.length - split.length;
  const maxFirst = Math.max(0.0001, ...rows.map((r) => r.firstShare || 0));

  const SortBtn = ({ k, children }) => (
    <button type="button" aria-pressed={sortBy === k} onClick={() => setSortBy(k)} title={`Sort by ${SORTS[k].label}`}>{children}</button>
  );

  return (
    <Panel kicker="All homes, SYNTHETIC" title="Where to act"
      right={<span className="qv-small qv-muted" aria-live="polite">{updating ? `Updating room rents, ${done} of ${total} homes...` : `Room rents at ${usd(wBath)} private bath, ${usd(wSize, 1)} per 10 sq ft`}</span>}>
      <p style={{ marginTop: 0 }}>
        {top ? <>{top.short} is the most common first pick: {n0(top.firstN)} of {n0(students)} synthetic students. </> : null}
        {worst?.worst ? <>The room furthest from its fair rent is the {worst.worst.label} at {worst.short}: asking {usd(worst.worst.asking)}, typical fair rent {usd(worst.worst.typical)}. </> : null}
        {nobody ? <>{nobody} of {rows.length} homes are not the first pick of any synthetic student.</> : null}
      </p>
      <div className="qv-scroll">
        <table className="qv-table op-port">
          <thead>
            <tr>
              <th><SortBtn k="name">Home</SortBtn></th>
              <th className="num" title={`How many of ${n0(students)} synthetic students rank this home first`}><SortBtn k="first">First choice</SortBtn></th>
              <th className="num" title="Share of synthetic students with this home in their top 3">Top 3</th>
              <th className="num" title="Among students who rank it first: how much more a month they value it than their second choice (typical)"><SortBtn k="premium">Fit premium</SortBtn></th>
              <th className="num" title="Sum of the asking rents of the rooms">Asking total</th>
              <th className="num" title="Sum of each room's typical fair rent">Fair total</th>
              <th className="num" title="Sum over rooms of how far asking rent is from typical fair rent"><SortBtn k="off">Room gaps</SortBtn></th>
              <th title="The room whose asking rent is furthest from its typical fair rent">Where to act</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.homeId} className={r.homeId === selectedId ? 'sel' : ''} tabIndex={0}
                aria-label={`${r.name}. Open this home`}
                onClick={() => onPick(r.homeId)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r.homeId); } }}>
                <td>
                  <b>{r.short}</b>
                  <div className="qv-small qv-muted">{r.area}, {r.kind}, {r.nRooms} {r.nRooms === 1 ? 'room' : 'rooms'}</div>
                </td>
                <td className="num">
                  {r.firstN == null ? 'n/a' : n0(r.firstN)}
                  {r.firstShare != null && <span className="meter" aria-hidden="true"><i style={{ width: `${(100 * r.firstShare) / maxFirst}%` }} /></span>}
                  <div className="qv-small qv-muted">{pct(r.firstShare, 1)}</div>
                </td>
                <td className="num">{pct(r.top3Share, 1)}</td>
                <td className="num">{r.fitPremium == null ? <span className="qv-muted">none</span> : `${usd(r.fitPremium)}/mo`}
                  {r.fitPremium != null && r.firstN < 30 && <div className="qv-small qv-muted">{r.firstN} students, rough</div>}
                </td>
                <td className="num">{usd(r.askTotal)}</td>
                <td className="num">{r.fairTotal == null ? <span className="qv-muted">one rent</span> : usd(r.fairTotal)}</td>
                <td className="num">{r.off == null ? <span className="qv-muted">no split</span> : usd(r.off)}</td>
                <td className="qv-small act">
                  {actionFor(r, usd)}
                  {r.worst && <div className="qv-muted">{r.worst.label}: asking {usd(r.worst.asking)}, fair {usd(r.worst.typical)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="qv-small qv-muted" style={{ marginBottom: 0 }}>
        First choice and top 3: each of {n0(students)} SYNTHETIC students ranks every home for their own week at asking
        rents, with door to door trips on the real bus timetables and streets. Fit premium: the typical student who
        ranks a home first likes it that much more a month than their second choice. Fair total adds each room's typical
        fair rent. Every group's split adds up to the house rent, so the two totals stay close; the gap that matters is
        inside the house. Room gaps add up how far each room's asking rent sits from its typical fair rent.
        {singles ? ` ${singles} homes have one room, so there is no split to price.` : ''} Click a row to open that home.
      </p>
    </Panel>
  );
}

// ---------- Who this house fits ----------
function FitPanel({ home, homes, demand, kindCounts, assumptions, onPick, pickable }) {
  if (!demand) return <Pending what="The fit data in operator.json" detail="scripts/build_operator.mjs writes it." />;
  const fit = demand.homes.find((d) => d.homeId === home.id);
  if (!fit) return <Note>This home is not in the fit data.</Note>;
  const N = demand.students;
  const firstN = Math.round(fit.firstShare * N);
  const top3N = Math.round(fit.top3Share * N);
  const rank = firstRank(demand, home.id);
  const grid = kindGrid(demand, kindCounts);
  const totalKinds = grid.reduce((t, r) => t + r.cells.length, 0);
  const shortOf = new Map(homes.map((h) => [h.id, String(h.name).split(',')[0].replace(/ (house|apartment)$/, '')]));
  const lines = winsSummary(fit.wins, totalKinds);
  const winsSorted = [...fit.wins].sort((a, b) => (kindCounts?.get(b) || 0) - (kindCounts?.get(a) || 0));
  const SHOW = 6;
  const A = assumptions;

  const item = (k) => (
    <li key={k}>{weekWords(parseKey(k), A)}{kindCounts ? <span className="qv-muted">, {n0(kindCounts.get(k) || 0)} students</span> : null}</li>
  );

  return (
    <div className="op-fit">
      <div>
        <div className="qv-stats">
          <Stat label={`of ${n0(N)} rank it first`} value={n0(firstN)} note={rank ? `${pct(fit.firstShare, 1)}, rank ${rank.rank} of ${rank.of}` : pct(fit.firstShare, 1)} />
          <Stat label="have it in their top 3" value={n0(top3N)} note={pct(fit.top3Share, 1)} />
          <Stat label="fit premium" value={fit.fitPremium == null ? 'none' : `${usd(fit.fitPremium)}/mo`} note="typical first picker" />
        </div>
        {fit.fitPremium != null ? (
          <p style={{ marginTop: 0 }}>
            The typical student who ranks {home.name.split(',')[0]} first likes it {usd(fit.fitPremium)} a month more than
            their second choice. If their room cost that much more, about half of them would switch.
            {firstN < 30 ? ` Only ${firstN} students rank it first, so this number is rough.` : ''}
          </p>
        ) : (
          <p style={{ marginTop: 0 }}>No synthetic student ranks it first, so there is no fit premium to report.</p>
        )}
        <h3 className="qv-kicker" style={{ margin: '12px 0 4px' }}>The weeks it wins</h3>
        <p style={{ margin: 0 }}>{lines.join(' ')}</p>
        {winsSorted.length > 0 && (
          <>
            <ul className="op-wins">{winsSorted.slice(0, SHOW).map(item)}</ul>
            {winsSorted.length > SHOW && (
              <details className="qv-raw"><summary>{winsSorted.length - SHOW} more kinds of week</summary>
                <ul className="op-wins">{winsSorted.slice(SHOW).map(item)}</ul>
              </details>
            )}
          </>
        )}
        <p className="qv-small qv-muted">
          A kind of week is a campus, an evening job or none, late library nights or not, and an early gym or not.
          A home wins a kind of week when it is the most common first pick among students with that week.
        </p>
      </div>

      <div>
        <h3 className="qv-kicker" style={{ margin: '0 0 6px' }}>Most common first pick, by kind of week</h3>
        <div className="qv-scroll">
          <table className="op-grid">
            <thead>
              <tr>
                <th>Campus, job</th>
                <th>Classes only</th>
                <th>+ {studyWords(A)}</th>
                <th>+ {gymWords(A)}</th>
                <th>+ both</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => (
                <tr key={`${row.campus}-${row.job}`} className={ri % 3 === 0 && ri ? 'campus-start' : ''}>
                  <th className="row" scope="row">{CAMPUS_WORDS[row.campus]}, {row.job === 'none' ? 'no job' : jobWords(row.job).replace('evening ', '')}</th>
                  {row.cells.map((c, ci) => {
                    const mine = c.winner === home.id;
                    const name = c.winner ? shortOf.get(c.winner) || c.winner : 'none';
                    const can = c.winner && !mine && pickable(c.winner);
                    return (
                      <td key={ci} className={mine ? 'mine' : ''}>
                        <button type="button" disabled={!can} onClick={() => can && onPick(c.winner)}
                          title={`${weekWords(c.a, A)}: ${name}${c.n != null ? `, ${c.n} students` : ''}`}
                          aria-label={`${weekWords(c.a, A)}. Most common first pick: ${name}${c.n != null ? `, ${c.n} students` : ''}`}>
                          {name}
                          {c.n != null && <span className="n">{c.n} students</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="qv-small qv-muted" style={{ marginBottom: 0 }}>
          Red: {home.name.split(',')[0]} wins that kind of week. Click another home to open it. Campus, job, late study
          and gym are drawn independently for each synthetic student, so small cells are rough. This shows fit, not a
          demand forecast.
        </p>
      </div>
    </div>
  );
}

// Asking rents against typical fair rents for this house: which rooms are priced too high or too low, and by how much.
const NEAR = 10; // dollars a month; closer than this counts as about right
function AskingCallout({ home, rooms }) {
  const rows = home.rooms
    .map((room, j) => ({ label: room.label, ask: room.asking, fair: rooms[j]?.p50 }))
    .filter((x) => Number.isFinite(x.ask) && Number.isFinite(x.fair))
    .map((x) => ({ ...x, d: x.ask - x.fair }));
  if (!rows.length) return null;
  const by = (a, b) => Math.abs(b.d) - Math.abs(a.d);
  const high = rows.filter((x) => x.d >= NEAR).sort(by);
  const low = rows.filter((x) => x.d <= -NEAR).sort(by);
  const near = rows.filter((x) => Math.abs(x.d) < NEAR);
  const list = (xs) => xs.map((x) => `${x.label} by ${usd(Math.abs(x.d))}`).join(', ');
  const askSum = rows.reduce((t, x) => t + x.ask, 0);
  return (
    <Note>
      <b>Asking rent against typical fair rent.</b>{' '}
      {low.length ? `Priced too low: ${list(low)}. ` : ''}
      {high.length ? `Priced too high: ${list(high)}. ` : ''}
      {near.length ? `Within ${usd(NEAR)} of typical: ${near.map((x) => x.label).join(', ')}. ` : ''}
      {!low.length && !high.length ? 'Every asking rent is close to its typical fair rent. ' : ''}
      The asking rents add up to {usd(askSum)} a month; the house rent is {usd(home.rent)}.
    </Note>
  );
}

function Slider({ id, label, unit, value, min, max, step, onChange, fmt }) {
  return (
    <div>
      <div className="qv-row" style={{ justifyContent: 'space-between' }}>
        <label htmlFor={id}>{label} <span className="qv-small qv-muted">({unit})</span></label>
        <span className="qv-mono">{fmt(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
