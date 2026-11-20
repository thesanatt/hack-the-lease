// Group mode: pick a house, assign rooms and split the rent envy-free for a friend group of five.
// Engine: fair.solveHouse / fair.privateGap (fair.js), week.js through api.weekFor, model.js.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Panel, Pill, Label, Stat, Button, Pending, Note, Guard, usd, pct, ms,
  modOf, homesOf, personasOf, configOf, seeded,
} from './group/kit.jsx';
import {
  pickGroup, modalRoutine, candidateHouses, solveAllHouses, efRate, capThreshold, favoriteRoom, drawSampleThetas,
} from './group/logic.js';
import { MemberCard } from './group/Members.jsx';
import EnvyMatrix from './group/EnvyMatrix.jsx';
import { useConfigVersion } from '../engine/useConfig.js';

const EF_SPREAD = 0.25; // log-sd of the value draws for the EF rate (assumption; demo members have no posterior)

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAME = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const FALLBACK_COLORS = ['#b4441c', '#2f6b8f', '#5d7a2e', '#8a5a9e', '#9a6a00', '#4a443c'];

export default function GroupView({ api }) {
  return (
    <div className="qv-view">
      <div className="qv-head">
        <h1>Group</h1>
        <p>One house, one room each, one rent split that nobody would swap out of, under every private cap.</p>
        <Label>SAMPLE DATA: FICTIONAL members, SYNTHETIC homes and rents</Label>
      </div>
      <Guard name="Group view"><GroupBody api={api} /></Guard>
    </div>
  );
}

function GroupBody({ api }) {
  useConfigVersion(api);
  const model = modOf(api, 'model');
  const fair = modOf(api, 'fair');
  const cfg = configOf(api);
  const personas = personasOf(api);
  const homes = homesOf(api);
  const places = api?.data?.places || [];
  const placeName = (id) => places.find((p) => p.id === id)?.label || id;

  const members = useMemo(() => pickGroup(personas).filter((m) => m.theta), [personas]);
  const houses = useMemo(() => candidateHouses(homes, members.length || 5), [homes, members.length]);

  const [caps, setCaps] = useState({});              // member id -> cap override (private)
  const [reveal, setReveal] = useState({});          // member id -> private view open
  const [late, setLate] = useState(null);            // { memberId, place, day, start, end }
  const [lateDraft, setLateDraft] = useState({ memberId: '', place: 'meijer', day: 'sat', start: '16:00', end: '23:30' });
  const [capMember, setCapMember] = useState('');
  const [selected, setSelected] = useState(null);    // house id shown in detail
  const [weeks, setWeeks] = useState({ status: 'idle', byMember: null, ms: 0, error: null });
  const [lastMove, setLastMove] = useState(null);
  const baseline = useRef(null);

  const hasWeek = typeof api?.weekFor === 'function' && (typeof api?.has !== 'function' || api.has('week'));

  // Week results per member over every candidate house (one weekFor call per member).
  useEffect(() => {
    if (!hasWeek || !members.length || !houses.length) { setWeeks({ status: hasWeek ? 'idle' : 'missing', byMember: null, ms: 0 }); return; }
    let live = true;
    setWeeks((w) => ({ ...w, status: 'running' }));
    (async () => {
      const t0 = performance.now();
      const byMember = new Map();
      const ids = houses.map((h) => h.id);
      try {
        for (const m of members) {
          const extra = late && late.memberId === m.id
            ? [{ id: 'late-shift', label: 'Late shift', days: [late.day], place: late.place, start: late.start, end: late.end }]
            : [];
          const res = await Promise.resolve(api.weekFor(modalRoutine(m, extra), ids, { cfg }));
          byMember.set(m.id, res instanceof Map ? res : new Map(Object.entries(res || {})));
          await new Promise((r) => setTimeout(r, 0));
        }
        if (live) setWeeks({ status: 'done', byMember, ms: performance.now() - t0, error: null });
      } catch (e) {
        if (live) setWeeks({ status: 'error', byMember: null, ms: 0, error: String(e.message || e) });
      }
    })();
    return () => { live = false; };
  }, [api, hasWeek, members, houses, late, cfg]);

  const sampleThetas = useMemo(
    () => (members.length ? drawSampleThetas(members, seeded(11), { k: cfg?.efSamples ?? 100, spread: EF_SPREAD }) : null),
    [members, cfg],
  );
  const solved = useMemo(() => {
    if (!fair || !model || !members.length || !houses.length) return null;
    if (hasWeek && weeks.status !== 'done' && weeks.status !== 'error') return null;
    return solveAllHouses({ fair, houses, members, weekByMember: weeks.byMember, model, cfg, caps, sampleThetas });
  }, [fair, model, members, houses, weeks, cfg, caps, hasWeek, sampleThetas]);

  // The first solve with no sensitivity move applied is the baseline the moves are compared against.
  useEffect(() => {
    if (solved && !baseline.current && !late && !Object.keys(caps).length) {
      baseline.current = { topId: solved.rows[0]?.home.id, rows: solved.rows };
    }
  }, [solved, late, caps]);

  if (!personas || !homes) {
    return <Pending what={!personas ? 'personas.json (fictional members)' : 'homes.json (SYNTHETIC homes)'} detail="The data builder writes it to web/public/data/." />;
  }
  if (!model) return <Pending what="engine/model.js" />;
  if (members.length < 2) return <Pending what="The demo group" detail="personas.json needs at least two members with a theta (flag them with group: true)." />;
  if (!houses.length) return <Note>No house in homes.json has a room for each of the {members.length} members.</Note>;

  const colors = members.map((m, i) => m.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
  const capOf = (m) => (caps[m.id] !== undefined ? caps[m.id] : m.cap ?? null);
  const rows = solved?.rows || [];
  const top = rows[0];
  const chosen = rows.find((r) => r.home.id === selected) || top;

  // Default member for the cap move: the one whose cap is closest to binding in the top feasible house.
  const tightest = (() => {
    const r = rows.find((x) => x.feasible) || top;
    const res = r?.res;
    if (!res?.assignment || !res?.prices) return members[0]?.id;
    let best = members[0]?.id, bestSlack = Infinity;
    members.forEach((m, i) => {
      const cap = capOf(m);
      if (cap == null) return;
      const slack = cap - res.prices[res.assignment[i]];
      if (slack < bestSlack) { bestSlack = slack; best = m.id; }
    });
    return best;
  })();

  // ---- sensitivity move 1: lower one member's cap until the top house has no fitting split ----
  const doCapMove = () => {
    const id = capMember || tightest;
    const i = members.findIndex((m) => m.id === id);
    const target = rows.find((r) => r.feasible) || top;
    if (!target || i < 0) return;
    let need = null;
    try { need = capThreshold(fair, target.problem, i, cfg); } catch (e) { setLastMove({ kind: 'cap', error: String(e.message || e) }); return; }
    if (!(need > 1)) { setLastMove({ kind: 'cap', memberId: id, houseId: target.home.id, impossible: true }); return; }
    const newCap = Math.max(0, Math.floor((need - 1) / 10) * 10 - 20);
    setCaps((c) => ({ ...c, [id]: newCap }));
    setReveal((r) => ({ ...r, [id]: true }));
    setSelected(target.home.id);
    setLastMove({ kind: 'cap', memberId: id, houseId: target.home.id, from: capOf(members[i]), to: newCap });
  };

  // ---- sensitivity move 2: add a late shift to one member and show the stranded trip ----
  const doLateMove = () => {
    const memberId = lateDraft.memberId || members[members.length - 1].id;
    setLate({ ...lateDraft, memberId });
    setSelected(chosen?.home.id || null);
    setLastMove({ kind: 'late', memberId });
  };

  const reset = () => { setCaps({}); setLate(null); setLastMove(null); setSelected(null); setReveal({}); };

  // Private info per member for the chosen house.
  const privateInfo = (m, i) => {
    const info = { cap: capOf(m), house: chosen?.home.name, feasible: chosen ? chosen.feasible : true };
    if (chosen?.res) info.rent = chosen.res.prices[chosen.res.assignment[i]];
    if (chosen && !chosen.feasible && reveal[m.id] && fair?.privateGap) {
      try { info.gap = fair.privateGap(chosen.problem, i, { cfg, compensateCommute: !!cfg?.compensateCommute }); } catch { info.gap = NaN; }
    }
    return info;
  };

  const lateMember = late && members.find((m) => m.id === late.memberId);
  const lateIdx = lateMember ? members.indexOf(lateMember) : -1;

  return (
    <div className="qv-grid">
      <div className="qv-span-12">
        <Panel kicker="The group" title={`${members.length} members, private caps`} right={<Label>FICTIONAL</Label>}>
          <div className="qv-members">
            {members.map((m, i) => (
              <MemberCard key={m.id} m={m} color={colors[i]} revealed={!!reveal[m.id]}
                place={homeArea(m, placeName)}
                onToggle={() => setReveal((r) => ({ ...r, [m.id]: !r[m.id] }))}
                privateInfo={privateInfo(m, i)}
                onCap={(v) => setCaps((c) => ({ ...c, [m.id]: v }))} />
            ))}
          </div>
          <p className="qv-small qv-muted" style={{ marginBottom: 0 }}>
            Caps never leave the solver. Each member sees only their own cap and their own gap. A gap reveals a little
            about the others' caps in aggregate. Room values are each persona's own demo values, not a shared prior.
          </p>
        </Panel>
      </div>

      <div className="qv-span-12">
        <Panel kicker="Sensitivity" title="Two moves" right={(late || Object.keys(caps).length) ? <Button tone="quiet" onClick={reset}>Reset to the original group</Button> : null}>
          {!fair ? <Pending what="engine/fair.js" /> : (
            <div className="qv-stack">
              <div className="qv-row">
                <span>Lower</span>
                <select aria-label="Member whose cap is lowered" value={capMember || tightest} onChange={(e) => setCapMember(e.target.value)}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <span>'s cap until {(rows.find((r) => r.feasible) || top)?.home.name || 'the top house'} has no split that fits every cap</span>
                <Button tone="primary" onClick={doCapMove} disabled={!top}>Lower the cap</Button>
              </div>
              <div className="qv-row">
                <span>Add a late shift for</span>
                <select aria-label="Member with the late shift" value={lateDraft.memberId || members[members.length - 1].id}
                  onChange={(e) => setLateDraft((d) => ({ ...d, memberId: e.target.value }))}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <span>at</span>
                <select aria-label="Shift place" value={lateDraft.place} onChange={(e) => setLateDraft((d) => ({ ...d, place: e.target.value }))}>
                  {places.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <select aria-label="Shift day" value={lateDraft.day} onChange={(e) => setLateDraft((d) => ({ ...d, day: e.target.value }))}>
                  {DAYS.map((d) => <option key={d} value={d}>{DAY_NAME[d]}</option>)}
                </select>
                <input aria-label="Shift start" type="time" value={lateDraft.start} onChange={(e) => setLateDraft((d) => ({ ...d, start: e.target.value }))} />
                <span>to</span>
                <input aria-label="Shift end" type="time" value={lateDraft.end} onChange={(e) => setLateDraft((d) => ({ ...d, end: e.target.value }))} />
                <Button tone="primary" onClick={doLateMove} disabled={!hasWeek}>Add the shift</Button>
              </div>
              {!hasWeek && <Pending what="engine/week.js" detail="Commutes and the late-shift move need it. Rent splits below still work without it." />}
              <MoveResult move={lastMove} members={members} rows={rows} baseline={baseline.current} weeks={weeks} />
            </div>
          )}
        </Panel>
      </div>

      <div className="qv-span-7">
        <Panel kicker="Which house" title="House ranking" right={solved ? <span className="qv-small qv-muted">{rows.length} houses solved in {ms(solved.totalMs)}</span> : null}>
          {!fair ? <Pending what="engine/fair.js" detail="House ranking needs the envy-free solver." /> : !solved ? (
            <p className="qv-muted">{weeks.status === 'running' ? 'Running every member\'s week through every house...' : 'Waiting for week results...'}</p>
          ) : (
            <HouseTable rows={rows} chosenId={chosen?.home.id} onPick={setSelected} />
          )}
          {solved && (
            <p className="qv-small qv-muted" style={{ marginBottom: 0 }}>
              Net cost is a member's rent share, utilities share and commute time in dollars (at their own value of time),
              minus what their room is worth to them{hasWeek ? '' : ' (commute not included yet)'}. The house with the lowest
              worst-off net cost wins. Houses with a split under every cap come first.
              {solved.disagree ? ' Members\' individual top houses differ, so the group disagrees here.' : ' Every member\'s own top house is the same.'}
              {weeks.status === 'done' ? ` Weeks: ${ms(weeks.ms)}.` : ''}
            </p>
          )}
          {weeks.status === 'error' && <Note tone="bad">Week results failed: {weeks.error}. Commute costs are left out.</Note>}
        </Panel>
      </div>

      <div className="qv-span-5">
        <Panel kicker="The split" title={chosen ? chosen.home.name : 'Chosen house'} right={chosen ? <Pill tone={chosen.feasible ? 'good' : 'bad'}>{chosen.feasible ? 'fits every cap' : 'no split fits every cap'}</Pill> : null}>
          {!fair ? <Pending what="engine/fair.js" /> : !chosen ? <p className="qv-muted">Solving...</p> : (
            <SplitTable row={chosen} members={members} colors={colors} />
          )}
        </Panel>
      </div>

      <div className="qv-span-12">
        <Panel kicker="Certificate" title="Envy matrix" right={chosen?.check ? <Pill tone={chosen.check.ok ? 'good' : 'bad'}>{chosen.check.ok ? 'checker passed' : 'checker failed'}</Pill> : null}>
          {!fair ? <Pending what="engine/fair.js" /> : !chosen?.res ? <p className="qv-muted">Solving...</p> : (
            <Certificate row={chosen} members={members} colors={colors} model={model} cfg={cfg} />
          )}
        </Panel>
      </div>

      {late && (
        <div className="qv-span-12">
          <Panel kicker="Late shift" title={`${lateMember?.name || 'Member'}: ${DAY_NAME[late.day]} ${late.start} to ${late.end} at ${placeName(late.place)}`}>
            <StrandedPanel row={chosen} member={lateMember} idx={lateIdx} weeks={weeks} rows={rows} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function homeArea(m, placeName) {
  const first = (m.week || [])[0];
  return first ? placeName(first.place) : '';
}

function HouseTable({ rows, chosenId, onPick }) {
  return (
    <div className="qv-scroll">
      <table className="qv-table">
        <thead>
          <tr>
            <th>#</th><th>House</th><th className="num">Rent /mo</th><th title="Whether a split exists that keeps every member under their private cap">Under caps</th>
            <th className="num" title="The worst-off member's net monthly cost: rent share, utilities share and commute time in dollars, minus what the room is worth to them">Worst-off /mo</th>
            <th className="num" title="The same net monthly cost, summed over the group">Group /mo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={r.home.id} className={r.home.id === chosenId ? 'sel' : r.feasible ? '' : 'dim'}
              onClick={() => onPick(r.home.id)} style={{ cursor: 'pointer' }} title={`Solved in ${ms(r.solveMs)}`}>
              <td className="qv-mono">{k + 1}</td>
              <td>
                <button type="button" className="qv-btn quiet" style={{ padding: 0, border: 'none', background: 'transparent', textAlign: 'left', fontWeight: 600 }}
                  onClick={(e) => { e.stopPropagation(); onPick(r.home.id); }}>
                  {r.home.name}
                </button>
                <div className="qv-small qv-muted">{r.home.area}, {r.home.rooms.length} rooms</div>
              </td>
              <td className="num">{usd(r.home.rent)}</td>
              <td>{r.error ? <Pill tone="bad">solver error</Pill> : <Pill tone={r.feasible ? 'good' : 'bad'}>{r.feasible ? 'fits' : 'no split fits'}</Pill>}</td>
              <td className="num">{usd(-r.E)}</td>
              <td className="num">{usd(-r.W)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BATH = { private: 'private bath', half: 'half bath', shared: 'shared bath' };
const FLOOR = { basement: 'basement', 1: '1st floor', 2: '2nd floor', attic: 'attic' };
const LIGHT = ['little daylight', 'some daylight', 'bright'];

function SplitTable({ row, members, colors }) {
  const { res, problem, home } = row;
  if (!res) return <Note tone="bad">The solver failed on this house: {row.error}</Note>;
  const assigned = new Set(res.assignment);
  const common = home.rooms.map((room, j) => ({ room, j })).filter(({ j }) => !assigned.has(j));
  const sum = res.prices.reduce((s, x) => s + x, 0);
  return (
    <>
      <div className="qv-scroll">
        <table className="qv-table">
          <thead><tr><th>Member</th><th>Room</th><th className="num">Rent share</th></tr></thead>
          <tbody>
            {members.map((m, i) => {
              const j = res.assignment[i];
              const room = home.rooms[j];
              return (
                <tr key={m.id}>
                  <td><span className="qv-swatch" style={{ background: colors[i] }} />{m.name}</td>
                  <td>{room?.label}<div className="qv-small qv-muted">{room ? `${room.sqft} sq ft, ${BATH[room.bath] || room.bath}, ${FLOOR[room.floor] || room.floor}, ${LIGHT[room.light] ?? `light ${room.light}`}` : ''}</div></td>
                  <td className="num">{usd(res.prices[j], 2)}</td>
                </tr>
              );
            })}
            {common.map(({ room, j }) => (
              <tr key={room.id} className="dim">
                <td>Common space</td><td>{room.label}</td><td className="num">{usd(res.prices[j], 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2}>Total (house rent {usd(problem.rent)})</td><td className="num">{usd(sum, 2)}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="qv-small qv-muted">
        Utilities {usd(home.utilities)} a month, split evenly ({usd((home.utilities || 0) / members.length, 2)} each), not part of the rent split.
        {res.negativePrice ? ' One room has a negative rent: it is paid to be taken, because the envy-free rule forces it.' : ''}
      </p>
      {!row.feasible && (
        <Note tone="bad">
          No envy-free split of {home.name} fits every private cap. These are the envy-free rents that minimize the worst
          overrun. Who is over is private: each member sees their own gap in their private view.
        </Note>
      )}
    </>
  );
}

function Certificate({ row, members, colors, model, cfg }) {
  const { res, problem, check } = row;
  const names = members.map((m) => m.name);
  const envy = res.envy || check.envy;
  const offDiag = [];
  for (let i = 0; i < members.length; i++) for (let j = 0; j < members.length; j++) if (i !== j && Number.isFinite(envy?.[i]?.[j])) offDiag.push(envy[i][j]);
  const minMargin = offDiag.length ? Math.min(...offDiag) : NaN;
  const robust = res.robustSlack ?? res.slackRobust ?? null;
  const ef = useMemo(() => {
    if (Number.isFinite(res.efRate)) return { rate: res.efRate, k: res.efSamples || cfg?.efSamples || 100, spread: EF_SPREAD, source: 'engine' };
    const r = seeded(11);
    const out = efRate(problem, res, members.map((m) => m.theta), model, r, { k: cfg?.efSamples ?? 100, spread: EF_SPREAD });
    return { ...out, source: 'view' };
  }, [res, problem, members, model, cfg]);
  const favs = members.map((m, i) => favoriteRoom(problem.members[i].values));
  const distinctFav = new Set(favs).size;

  if (!check.ok) {
    return (
      <Note tone="bad">
        The independent checker rejected this split, so no matrix is shown as passing. {check.issues.join('. ')}.
      </Note>
    );
  }
  return (
    <div className="qv-stack">
      <p style={{ margin: 0 }}>
        Each entry is how many dollars a month that row's member would lose by swapping into the column member's room at
        that room's rent, by the row member's own room values. All entries are at least zero, so nobody would swap.
      </p>
      <EnvyMatrix names={names} envy={envy} colors={colors} />
      <div className="qv-stats">
        <Stat label="smallest margin in this split" value={usd(minMargin, 2)} />
        <Stat label={`envy-free rate over ${ef.k} value draws`} value={pct(ef.rate)} note={ef.source === 'engine' ? 'measured by the solver' : 'measured in this view'} />
        <Stat label="members whose favorite room differs" value={`${distinctFav} distinct favorites`} />
      </div>
      {minMargin < 0.5 && ef.rate < 0.5 && (
        <p className="qv-small" style={{ margin: 0 }}>
          The maximin split sets some margins to $0 to raise the worst-off member, so most value draws break at least
          one of them.
        </p>
      )}
      {Number.isFinite(robust) && robust > 1 && (
        <p style={{ margin: 0 }}>
          The envy-free split of this house with the widest margins tolerates room value errors up to <b className="qv-mono">{usd(robust)}</b> per
          member in total and stays envy-free (Peters, Procaccia and Zhu 2022, Proposition 3.1).
        </p>
      )}
      <p className="qv-small qv-muted" style={{ margin: 0 }}>
        Rents are the envy-free split that maximizes the worst-off member (Gal, Mash, Procaccia and Zick 2017), with caps
        as in Procaccia, Velez and Yu 2018. The checker in this view re-derived every margin, the rent sum
        ({usd(check.sumErr, 6)} off) and the caps from the inputs before showing this matrix.
        {` EF rate: demo members have one set of values each, so the ${ef.k} draws perturb each value with log-sd ${ef.spread} (assumption) and keep these prices fixed.`}
        {res.efficientAssignments ? ` Efficient room assignments checked: ${res.efficientAssignments}.` : ''}
      </p>
    </div>
  );
}

function MoveResult({ move, members, rows, baseline }) {
  if (!move) return null;
  const m = members.find((x) => x.id === move.memberId);
  if (move.error) return <Note tone="bad">The cap move failed: {move.error}</Note>;
  if (move.kind === 'cap') {
    const row = rows.find((r) => r.home.id === move.houseId);
    if (move.impossible) return <Note>No cap for {m?.name} makes {row?.home.name || 'this house'} infeasible: their envy-free rent can go to $0.</Note>;
    const nextFeasible = rows.find((r) => r.feasible);
    return (
      <Note tone="warn">
        {m?.name}'s cap was lowered (the new value is in {m?.name}'s private view). {row?.home.name} now
        {row && !row.feasible ? ' has no envy-free split that fits every cap.' : ' still fits.'}
        {nextFeasible ? ` The top feasible house is now ${nextFeasible.home.name}.` : ' No house fits every cap now.'}
        {' '}Only {m?.name}'s private view shows how far the cap is from working.
      </Note>
    );
  }
  if (move.kind === 'late') {
    const before = baseline?.topId && baseline.rows.find((r) => r.home.id === baseline.topId);
    const now = rows[0];
    return (
      <Note tone="warn">
        Late shift added for {m?.name}. Top house {before && now && before.home.id !== now.home.id
          ? `changed from ${before.home.name} to ${now.home.name}.`
          : `stays ${now?.home.name || 'the same'}: the shift costs ${m?.name} time in every house, but not enough to change the order.`}
        {' '}The stranded trip is shown below.
      </Note>
    );
  }
  return null;
}

function fmtClock(t) {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (!Number.isFinite(t)) return '';
  const h = Math.floor(t / 3600), mi = Math.floor((t % 3600) / 60);
  return `${String(h % 24).padStart(2, '0')}:${String(mi).padStart(2, '0')}${h >= 24 ? ' (next day)' : ''}`;
}
function fmtOption(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  const min = o.min ?? (o.sec != null ? o.sec / 60 : null);
  const parts = [`${o.mode || 'fastest'}${min != null ? ` ${Math.round(min)} min door to door` : ''}`];
  if (Number.isFinite(o.walkMin) && o.mode !== 'walk') parts.push(`${Math.round(o.walkMin)} min of it walking`);
  if (Array.isArray(o.routes) && o.routes.length) parts.push(`route ${[...new Set(o.routes.map((r) => (typeof r === 'object' ? r.short ?? r.name ?? r.id : r)))].join(', ')}`);
  return parts.join(', ');
}

function StrandedPanel({ row, member, idx, weeks, rows }) {
  if (weeks.status === 'running') return <p className="qv-muted">Re-running {member?.name}'s week in every house...</p>;
  if (!weeks.byMember || !member) return <Pending what="engine/week.js" detail="The late shift needs week results." />;
  const byHome = weeks.byMember.get(member.id);
  const houseRows = rows.map((r) => ({ r, wr: byHome?.get(r.home.id) }));
  const here = row && byHome?.get(row.home.id);
  const strandedHere = here?.stranded || [];
  const countStranded = houseRows.filter(({ wr }) => wr?.stranded?.length).length;
  return (
    <div className="qv-stack">
      {here ? (
        strandedHere.length ? (
          <div className="qv-scroll">
            <table className="qv-table">
              <thead><tr><th>Day</th><th>Trip</th><th>Time</th><th className="num">Walking it needs</th><th className="num">Walk cap</th><th>Fastest option, not allowed</th></tr></thead>
              <tbody>
                {strandedHere.map((s, k) => (
                  <tr key={k}>
                    <td>{DAY_NAME[s.day] || s.day}</td>
                    <td>{s.kind === 'leaveAt' ? `Home from ${s.label}` : s.kind === 'arriveBy' ? `To ${s.label}` : s.label}</td>
                    <td className="qv-mono">{fmtClock(s.time)}</td>
                    <td className="num">{Number.isFinite(s.needed) ? `${Math.round(s.needed)} min` : 'no route'}</td>
                    <td className="num">{Number.isFinite(s.capMin) ? `${Math.round(s.capMin)} min` : ''}</td>
                    <td>{fmtOption(s.bestOption) || 'none found'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Note tone="good">From {row.home.name}, {member.name} still has an allowed way home after the shift.</Note>
      ) : <p className="qv-muted">No week result for this house.</p>}
      <p className="qv-small qv-muted" style={{ margin: 0 }}>
        Stranded means no allowed option: transit has stopped and the walk is over {member.name}'s late walking cap
        ({member.modes?.maxLateWalkMin ?? 'n/a'} min after {member.modes?.lateHour || 'the late hour'}). The trip still counts the fastest
        disallowed option's minutes. {countStranded} of {rows.length} houses leave {member.name} stranded on this shift.
        TheRide FlexRide or a ride-hail can cover this trip in practice; the model does not count them.
      </p>
      <div className="qv-scroll">
        <table className="qv-table">
          <thead><tr><th>House</th><th className="num">{member.name}'s weekly min</th><th className="num">Stranded trips</th><th className="num">{member.name}'s utility</th></tr></thead>
          <tbody>
            {houseRows.map(({ r, wr }) => (
              <tr key={r.home.id} className={r.home.id === row?.home.id ? 'sel' : ''}>
                <td>{r.home.name}</td>
                <td className="num">{wr ? Math.round(wr.weeklyMin) : 'n/a'}</td>
                <td className="num">{wr ? wr.stranded?.length ?? 0 : 'n/a'}</td>
                <td className="num">{usd(r.U?.[idx])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
