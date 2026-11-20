// Owners view. One house as a diagram with each room's fair rent range against its asking rent, who the house
// fits by kind of week, every home as a small multiple, and a renovation lever with the assumed bath value.
// Fair rents: envy-free splits of the house rent for sample groups drawn from assumed room values (engine
// operator.roomPricing, live in the browser). Fit: the shipped demand map in operator.json.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Guard, usd, signedUsd, ms, modOf, homesOf, configOf, seeded } from './group/kit.jsx';
import { useConfigVersion } from '../engine/useConfig.js';
import { pickIrregular, drawGroups, renovate, canAddHalfBath, roomPricingLocal, renovationDelta } from './operator/logic.js';
import { countKinds } from './operator/fit.js';
import { roomState } from './operator/viz.js';
import HouseRents, { RentKey } from './operator/HouseRents.jsx';
import FitBars from './operator/FitBars.jsx';
import Portfolio, { PortfolioKey } from './operator/Portfolio.jsx';
import Renovation from './operator/Renovation.jsx';
import './operator/operator.css';

const SEED = 2026;      // local fallback draws
const POP_SEED = 11;    // same seed as scripts/build_operator.mjs

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

export default function OperatorView({ api }) {
  return (
    <div className="ow">
      <Guard name="Owners view"><OwnersBody api={api} /></Guard>
    </div>
  );
}

function OwnersBody({ api }) {
  useConfigVersion(api);
  const model = modOf(api, 'model');
  const fair = modOf(api, 'fair');
  const opMod = modOf(api, 'operator');
  const cfg = configOf(api);
  const homes = homesOf(api);
  const opData = api?.data?.operator || null;
  const demand = opData?.demand || null;
  const info = model?.PARAM_INFO;
  const G = cfg?.operatorGroups ?? 200;

  const pricedHomes = useMemo(() => (homes || []).filter((h) => (h.rooms || []).length >= 2), [homes]);
  // Open on the most uneven house that some kind of week picks most often, so every chart has something to say.
  const defaultHome = useMemo(() => {
    const winners = new Set((demand?.homes || []).filter((d) => d.wins?.length).map((d) => d.homeId));
    const pool = pricedHomes.filter((h) => winners.has(h.id));
    return pickIrregular(pool.length ? pool : pricedHomes, opData?.houseId || opData?.featured || null);
  }, [pricedHomes, demand, opData]);
  const [houseId, setHouseId] = useState(null);
  const home = (houseId && pricedHomes.find((h) => h.id === houseId)) || defaultHome;
  const topRef = useRef(null);

  const [bathMed, setBathMed] = useState(null);
  const [sizeMed, setSizeMed] = useState(null);
  const [renoRoom, setRenoRoom] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const wBath = bathMed ?? info?.wBath?.prior?.median ?? 60;
  const wSize = sizeMed ?? info?.wSize?.prior?.median ?? 8;

  const renoChoices = home ? home.rooms.map((r, j) => ({ r, j })).filter(({ r }) => canAddHalfBath(r)) : [];
  const defaultReno = renoChoices.find(({ r }) => r.floor === 'basement') || renoChoices[0];
  const renoIdx = renoRoom != null && renoChoices.some(({ j }) => j === renoRoom) ? renoRoom : defaultReno?.j ?? null;

  const population = useMemo(() => {
    if (!opMod?.makePopulation) return null;
    try { return opMod.makePopulation({ n: cfg?.population ?? 2000, seed: POP_SEED, cfg: cfg || undefined }); } catch { return null; }
  }, [opMod, cfg]);
  const kindCounts = useMemo(() => (population ? countKinds(population) : null), [population]);

  const selectHouse = (id, scroll) => {
    setHouseId(id); setRenoRoom(null);
    if (scroll && topRef.current?.scrollIntoView) topRef.current.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  // Selected house: fair rents now and with the renovation. Debounced 200 ms after the last slider move.
  useEffect(() => {
    if (!fair || !model || !home) return undefined;
    setBusy(true);
    const id = setTimeout(() => {
      try {
        const t0 = performance.now();
        const reno = renoIdx != null ? { roomId: home.rooms[renoIdx].id, bath: 'half' } : null;
        let out;
        if (opMod?.roomPricing && opMod?.groupsFor && population) {
          const groups = opMod.groupsFor({ home, population, cfg: cfg || undefined, count: G });
          const r = opMod.roomPricing({ home, groups, renovation: reno, cfg: cfg || undefined, medians: { wBath, wSize }, prior: population.prior });
          const solved = r.groups ?? groups.length;
          out = {
            source: 'engine', rooms: r.rooms, after: r.after || null, delta: r.renovationDelta,
            solved, failed: groups.length - solved, negative: Math.round((r.negativeShare || 0) * solved),
          };
        } else {
          const prior = model.priorFor ? model.priorFor({ overrides: { wBath: { median: wBath }, wSize: { median: wSize } } }) : null;
          const groups = drawGroups({ model, prior, n: home.rooms.length, G, r: seeded(SEED) });
          const base = roomPricingLocal({ fair, model, home, groups, cfg });
          let after = null, delta = null;
          if (renoIdx != null) {
            const a = roomPricingLocal({ fair, model, home: renovate(home, renoIdx, 'half'), groups, cfg });
            after = a.rooms; delta = renovationDelta(base, a, renoIdx);
          }
          out = { source: 'view', rooms: base.rooms, after, delta, solved: base.solved, failed: base.failed, negative: base.negative };
        }
        setResult({ ...out, renoIdx, homeId: home.id, totalMs: performance.now() - t0 });
      } catch (e) {
        setResult({ error: String(e.message || e), homeId: home.id });
      }
      setBusy(false);
    }, 200);
    return () => clearTimeout(id);
  }, [fair, model, opMod, population, home, wBath, wSize, renoIdx, G, cfg]);

  // Portfolio: start from the shipped fair ranges, then re-solve every home, one per tick, when a slider moves.
  const pre = useMemo(() => new Map((opData?.homes || []).map((ph) => [ph.homeId, ph.rooms.map((r) => ({ p10: r.p10, p50: r.p50, p90: r.p90 }))])), [opData]);
  const sliderKey = `${wBath}|${wSize}`;
  const [live, setLive] = useState({ key: null, rooms: new Map() });
  const [full, setFull] = useState(null);
  useEffect(() => {
    if (!opMod?.roomPricing || !opMod?.groupsFor || !population || !pricedHomes.length) return undefined;
    let i = 0, cancelled = false, timer = null;
    const acc = new Map();
    const total = pricedHomes.length;
    const step = () => {
      if (cancelled) return;
      const h = pricedHomes[i];
      try {
        const groups = opMod.groupsFor({ home: h, population, cfg: cfg || undefined, count: G });
        const r = opMod.roomPricing({ home: h, groups, cfg: cfg || undefined, medians: { wBath, wSize }, prior: population.prior });
        acc.set(h.id, r.rooms.map((x) => ({ p10: x.p10, p50: x.p50, p90: x.p90 })));
      } catch { /* keep this home on its last numbers */ }
      i++;
      if (i % 4 === 0 || i === total) setLive({ key: sliderKey, rooms: new Map(acc) });
      if (i === total) setFull({ key: sliderKey, rooms: new Map(acc) });
      else timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [opMod, population, pricedHomes, wBath, wSize, G, cfg, sliderKey]);
  const portUpdating = !!opMod?.roomPricing && !!population && !(full && full.key === sliderKey);
  const res = result && result.homeId === home?.id && !result.error ? result : null;
  const fairFor = (id) => (id === home?.id && res?.rooms)
    || (live.key === sliderKey && live.rooms.get(id)) || full?.rooms.get(id) || pre.get(id) || null;

  if (!homes) return <p className="ow-quiet">Loading homes...</p>;
  if (!model) return <p className="ow-quiet">Loading the model...</p>;
  if (!home) return <p className="ow-quiet">No house with two or more rooms.</p>;

  const fairNow = fairFor(home.id);
  const off = home.rooms.filter((r, j) => { const s = roomState(r.asking, fairNow?.[j]); return s === 'over' || s === 'under'; }).length;
  const fit = demand?.homes.find((d) => d.homeId === home.id) || null;
  const short = String(home.name).split(',')[0];

  return (
    <div className="ow-grid">
      <section className="ow-card ow-span-7" ref={topRef} aria-labelledby="ow-house-h">
        <header className="ow-head">
          <div>
            <h1 id="ow-house-h">{short}</h1>
            <label className="ow-pick">
              <span className="ow-sr">Open another home</span>
              <select value="" onChange={(e) => e.target.value && selectHouse(e.target.value, false)}>
                <option value="" disabled>Another home</option>
                {pricedHomes.filter((h) => h.id !== home.id).map((h) => <option key={h.id} value={h.id}>{String(h.name).split(',')[0]}</option>)}
              </select>
            </label>
          </div>
          <div className="ow-figs">
            <div className="ow-big"><span className="ow-num-28">{usd(home.rent)}</span><span className="ow-unit">a month, whole {home.kind === 'apartment' ? 'apartment' : 'house'}</span></div>
            <div className="ow-big"><span className="ow-num-28">{off} of {home.rooms.length}</span><span className="ow-unit">rooms priced off</span></div>
          </div>
        </header>
        {result?.error && result.homeId === home.id ? (
          <p className="ow-quiet">Could not split the rent: {result.error}</p>
        ) : fairNow ? (
          <>
            <HouseRents home={home} fair={fairNow} busy={busy} />
            <RentKey />
          </>
        ) : <p className="ow-quiet">Splitting the rent...</p>}
      </section>

      <section className="ow-card ow-span-5" aria-labelledby="ow-fit-h">
        <h2 id="ow-fit-h">Who it fits</h2>
        {demand ? <FitBars fit={fit} all={demand.homes} homes={homes} students={demand.students} kindCounts={kindCounts} assumptions={opMod?.POP_ASSUMPTIONS} />
          : <p className="ow-quiet">Fit data is still loading.</p>}
      </section>

      <section className="ow-card ow-span-12" aria-labelledby="ow-port-h">
        <header className="ow-head ow-head-row">
          <h2 id="ow-port-h">Your homes</h2>
          {portUpdating ? <span className="ow-quiet" aria-live="polite">Updating...</span> : <PortfolioKey />}
        </header>
        <Portfolio homes={pricedHomes} fairFor={fairFor} selectedId={home.id} onPick={(id) => selectHouse(id, true)} updating={portUpdating} />
      </section>

      <section className="ow-card ow-span-12" aria-labelledby="ow-reno-h">
        <h2 id="ow-reno-h">Add a half bath at {short}</h2>
        {fair ? (
          <Renovation home={home} choices={renoChoices} renoIdx={renoIdx} onRoom={setRenoRoom}
            base={res && res.renoIdx === renoIdx ? res.rooms : null} after={res && res.renoIdx === renoIdx ? res.after : null}
            delta={res && res.renoIdx === renoIdx ? res.delta : null}
            wBath={wBath} onBath={setBathMed} busy={busy} />
        ) : <p className="ow-quiet">Loading the rent solver...</p>}
      </section>

      <details className="ow-details ow-span-12">
        <summary>Numbers and how we got this</summary>
        <Details home={home} res={res} fairNow={fairNow} G={G} population={population} students={demand?.students}
          wBath={wBath} wSize={wSize} setSizeMed={setSizeMed} reset={() => { setBathMed(null); setSizeMed(null); }}
          changed={bathMed != null || sizeMed != null} info={info} />
      </details>
    </div>
  );
}

function Details({ home, res, fairNow, G, population, students, wSize, setSizeMed, reset, changed, info }) {
  const n0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : 'n/a');
  return (
    <div className="ow-details-body">
      <p className="ow-honest">Fair ranges come from assumed room values on {G} sample groups.</p>
      <table className="ow-table">
        <caption className="ow-sr">Fair rent and asking rent for each room of {home.name}</caption>
        <thead><tr><th>Room</th><th className="n">Low</th><th className="n">Typical</th><th className="n">High</th><th className="n">Asking</th><th className="n">With half bath</th></tr></thead>
        <tbody>
          {home.rooms.map((r, j) => (
            <tr key={r.id}>
              <td>{r.label}</td>
              <td className="n">{usd(fairNow?.[j]?.p10)}</td><td className="n">{usd(fairNow?.[j]?.p50)}</td><td className="n">{usd(fairNow?.[j]?.p90)}</td>
              <td className="n">{usd(r.asking)}</td>
              <td className="n">{res?.after ? usd(res.after[j]?.p50) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ow-details-side">
        <label className="ow-field ow-slider" htmlFor="op-size">
          <span>10 sq ft of room is worth <b className="ow-t-num">{usd(wSize, 1)}/mo</b> <em>assumed</em></span>
          <input id="op-size" type="range" min={0} max={30} step={0.5} value={wSize} onChange={(e) => setSizeMed(Number(e.target.value))} />
        </label>
        <button type="button" className="ow-text-btn" onClick={reset} disabled={!changed}>Back to our assumed values</button>
        <p>
          Each of {G} sample groups{population ? `, drawn from ${n0(population.n)} sample students,` : ''} splits the
          {' '}{usd(home.rent)} rent so nobody would swap rooms. Low and high are the 10th and 90th percentile across
          groups. Room values ({info?.wLight?.label ? 'bath, size and light' : 'bath and size'}) are our assumptions,
          not survey data. A half bath counts as half a private bath. Commute is the same for every room, so it is left
          out. Who it fits ranks every home for {n0(students)} sample weeks routed on the real timetables.
          {res?.failed ? ` ${res.failed} groups could not be split.` : ''}
          {res?.negative ? ` ${res.negative} groups needed a negative room rent.` : ''}
          {res?.totalMs != null ? ` Worked out in this browser in ${ms(res.totalMs)}.` : ''}
          {res?.delta ? ` Change for the group: ${signedUsd(res.delta.headroom)} a month of room value.` : ''}
        </p>
      </div>
    </div>
  );
}
