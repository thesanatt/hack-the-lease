// Operator view: one irregular house, per-room envy-free rents for typical SYNTHETIC groups, the prior medians
// that drive them, live sliders for the wBath and wSize medians, and a renovation lever.
import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Label, Stat, Button, Pending, Note, Guard, usd, signedUsd, ms, modOf, homesOf, configOf, seeded } from './group/kit.jsx';
import { useConfigVersion } from '../engine/useConfig.js';
import { pickIrregular, drawGroups, renovate, canAddHalfBath, roomPricingLocal, renovationDelta } from './operator/logic.js';

const BATH = { private: 'private bath', half: 'half bath', shared: 'shared bath' };
const FLOOR = { basement: 'basement', 1: '1st floor', 2: '2nd floor', attic: 'attic' };
const LIGHT = ['little daylight', 'some daylight', 'bright'];
const SEED = 2026;      // local fallback draws
const POP_SEED = 11;    // same seed as scripts/build_operator.mjs

export default function OperatorView({ api }) {
  return (
    <div className="qv-view">
      <div className="qv-head">
        <h1>Operator</h1>
        <p>What each room of an irregular house would rent for, if typical groups split the house rent so nobody would swap rooms.</p>
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
  const info = model?.PARAM_INFO;

  const preferId = opData?.houseId || opData?.featured || null;
  const defaultHome = useMemo(() => pickIrregular(homes, preferId), [homes, preferId]);
  const houseChoices = useMemo(() => (homes || []).filter((h) => h.kind === 'house' && (h.rooms || []).length >= 3), [homes]);
  const [houseId, setHouseId] = useState(null);
  const home = (houseId && (homes || []).find((h) => h.id === houseId)) || defaultHome;

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
        <Panel kicker="One irregular house" title={home.name}
          right={houseChoices.length > 1 ? (
            <select aria-label="House" value={home.id} onChange={(e) => { setHouseId(e.target.value); setRenoRoom(null); }}>
              {houseChoices.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          ) : null}>
          <div className="qv-stats">
            <Stat label="house rent per month" value={`${usd(home.rent)}/mo`} />
            <Stat label="rooms" value={home.rooms.length} />
            <Stat label="synthetic groups" value={G} note={res?.source === 'engine' ? `from a population of ${population?.n ?? ''}, seed ${POP_SEED}` : `drawn from the prior, seed ${SEED}`} />
            {res?.totalMs != null && res.base && <Stat label="live compute" value={ms(res.totalMs)} note={`${res.solves} house solves`} />}
          </div>
          {!fair ? <Pending what="engine/fair.js" detail="Per-room rents need the envy-free solver." /> : res?.error ? (
            <Note tone="bad">Pricing failed: {res.error}</Note>
          ) : !res ? <p className="qv-muted">Solving {G} groups...</p> : (
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
                {res.base.failed ? ` ${res.base.failed} groups failed to solve and are left out.` : ''}
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
            same synthetic students.
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
              ) : <p className="qv-muted">Solving...</p>}
            </div>
          )}
        </Panel>
      </div>

      {opData && (
        <div className="qv-span-12">
          <Note>
            Every number on this page is computed live in this browser for the selected house, from SYNTHETIC students.
          </Note>
        </div>
      )}
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
