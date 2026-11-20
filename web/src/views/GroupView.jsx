// Your group: one house, one room each, a rent split nobody would swap out of, under every private cap.
// Engine: fair.solveHouse / fair.privateGap (fair.js), week.js through api.weekFor, model.js, tours.js.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Guard, usd, pct, ms, modOf, homesOf, personasOf, configOf, seeded } from './group/kit.jsx';
import {
  pickGroup, modalRoutine, candidateHouses, solveAllHouses, efRate, capThreshold, favoriteRoom, drawSampleThetas,
} from './group/logic.js';
import { MemberRow } from './group/Members.jsx';
import HouseDiagram, { MiniHouse } from './group/HouseDiagram.jsx';
import SwapGrid, { swapMargins } from './group/SwapGrid.jsx';
import TourTimes from './group/TourTimes.jsx';
import { useConfigVersion } from '../engine/useConfig.js';
import './group/group.css';

const EF_SPREAD = 0.25; // log-sd of the value draws for the EF rate (assumption; demo members have no posterior)

const DAY_NAME = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const FALLBACK_COLORS = ['#b4441c', '#2f6b8f', '#5d7a2e', '#8a5a9e', '#9a6a00', '#4a443c'];
const LATE_SHIFT = { place: 'meijer', day: 'sat', start: '16:00', end: '23:30' };
const shortName = (name) => String(name || '').replace(/\s+house,.*$/i, '').replace(/,.*$/, '');
const clock = (hm) => { const [h, m] = String(hm).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 || h >= 24 ? 'AM' : 'PM'}`; };

export default function GroupView({ api }) {
  return (
    <div className="gv">
      <div className="gv-head">
        <h1>Your group</h1>
        <span className="gv-sub">One house, one room each, a split nobody would swap.</span>
      </div>
      <Guard name="Your group"><GroupBody api={api} /></Guard>
    </div>
  );
}

function Check({ ok }) {
  return ok ? (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="9" fill="#1f6f4a" /><path d="M5 9.4l2.6 2.6L13 6.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="#9a1f1f" strokeWidth="2" /><path d="M9 4.8v5.2M9 12.6v.4" stroke="#9a1f1f" strokeWidth="2" strokeLinecap="round" /></svg>
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
  const [selected, setSelected] = useState(null);    // house id shown in the hero
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

  // The first solve with no move applied is the baseline the moves are compared against.
  useEffect(() => {
    if (solved && !baseline.current && !late && !Object.keys(caps).length) {
      baseline.current = { topId: solved.rows[0]?.home.id, rows: solved.rows };
    }
  }, [solved, late, caps]);

  // After the late shift re-runs the weeks: if the shown house leaves that member with no way home, move the hero
  // to the best house that still gets them home.
  const lateMember = late?.memberId;
  const strandedAt = (houseId) => {
    if (!late) return false;
    const wr = weeks.byMember?.get(lateMember)?.get(houseId);
    return (wr?.stranded || []).some((x) => x.day === late.day);
  };
  useEffect(() => {
    // Wait for the weeks re-run with the shift in it (a new byMember map), not the result from before the move.
    if (lastMove?.kind !== 'late' || lastMove.resolved || weeks.status !== 'done' || !solved || weeks.byMember === lastMove.weeksAt) return;
    const rs = solved.rows;
    const fromId = lastMove.fromId || rs[0]?.home.id;
    let toId = fromId, noneHome = false;
    // Move to the best house under every cap that still gets them home. If none does, follow the new top house
    // under every cap (the ranking already prices the trip with no way home), so the hero and the ranking agree.
    if (strandedAt(fromId)) {
      const ok = rs.find((r) => r.feasible && !strandedAt(r.home.id));
      if (ok) toId = ok.home.id;
      else { noneHome = true; toId = rs.find((r) => r.feasible)?.home.id || fromId; }
    }
    if (toId !== fromId) setSelected(toId);
    setLastMove({ ...lastMove, resolved: true, fromId, toId, noneHome });
  }, [lastMove, weeks, solved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!personas || !homes) return <p className="gv-wait">Loading the group and the houses</p>;
  if (!model || !fair) return <p className="gv-wait">The rent solver is not available.</p>;
  if (members.length < 2) return <p className="gv-wait">The demo group needs at least two members.</p>;
  if (!houses.length) return <p className="gv-wait">No house has a room for each of the {members.length} members.</p>;

  const colors = members.map((m, i) => m.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
  const capOf = (m) => (caps[m.id] !== undefined ? caps[m.id] : m.cap ?? null);
  const rows = solved?.rows || [];
  const top = rows[0];
  const chosen = rows.find((r) => r.home.id === selected) || top;

  // Default member for the cap move: the one whose cap is closest to binding in the top house that fits.
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

  // Move 1: lower one member's cap until the top house has no fitting split.
  const doCapMove = () => {
    const id = tightest;
    const i = members.findIndex((m) => m.id === id);
    const target = rows.find((r) => r.feasible) || top;
    if (!target || i < 0) return;
    let need = null;
    try { need = capThreshold(fair, target.problem, i, cfg); } catch (e) { setLastMove({ kind: 'cap', error: String(e.message || e) }); return; }
    if (!(need > 1)) { setLastMove({ kind: 'cap', memberId: id, houseId: target.home.id, impossible: true }); return; }
    const newCap = Math.max(0, Math.floor((need - 1) / 10) * 10 - 20);
    setCaps((c) => ({ ...c, [id]: newCap }));
    setReveal((r) => ({ ...r, [id]: true }));
    setSelected(null); // the hero follows the new top house (houses that fit every cap rank first)
    setLastMove({ kind: 'cap', memberId: id, houseId: target.home.id, from: capOf(members[i]), to: newCap });
  };

  // Move 2: add a late shift for the last member and see whether they still get home.
  const doLateMove = () => {
    const memberId = members[members.length - 1].id;
    setLate({ ...LATE_SHIFT, memberId });
    setSelected(chosen?.home.id || null);
    setLastMove({ kind: 'late', memberId, fromId: chosen?.home.id || null, weeksAt: weeks.byMember });
  };

  const reset = () => { setCaps({}); setLate(null); setLastMove(null); setSelected(null); setReveal({}); };
  const moved = !!(late || Object.keys(caps).length);

  // Private info per member for the shown house.
  const privateInfo = (m, i) => {
    const info = { cap: capOf(m), house: chosen?.home.name, feasible: chosen ? chosen.feasible : true };
    if (chosen?.res) info.rent = chosen.res.prices[chosen.res.assignment[i]];
    let gapRow = chosen && !chosen.feasible ? chosen : null;
    if (!gapRow && lastMove?.kind === 'cap' && lastMove.memberId === m.id && !lastMove.impossible) {
      const broken = rows.find((r) => r.home.id === lastMove.houseId);
      if (broken && !broken.feasible) gapRow = broken;
    }
    if (gapRow) info.gapHouse = shortName(gapRow.home.name);
    if (gapRow && reveal[m.id] && fair?.privateGap) {
      try { info.gap = fair.privateGap(gapRow.problem, i, { cfg, compensateCommute: !!cfg?.compensateCommute }); } catch { info.gap = NaN; }
    }
    return info;
  };

  const tripsOf = (m) => weeks.byMember?.get(m.id)?.get(chosen?.home.id)?.trips || [];
  const entriesOf = (m) => modalRoutine(m, late && late.memberId === m.id
    ? [{ id: 'late-shift', label: 'Late shift', days: [late.day], place: late.place, start: late.start, end: late.end }] : []).week;

  const res = chosen?.res;
  const swapOk = !!chosen?.check?.ok;
  const solar = modOf(api, 'solar');
  const termDates = cfg?.termDates || [];
  let duskS = null;
  try { duskS = solar?.dusk && termDates.length ? solar.dusk((termDates[termDates.length - 1] || termDates[0]).date, cfg) : null; } catch { duskS = null; }
  const lateName = members.find((m) => m.id === lateMember)?.name;

  return (
    <>
      <div className="gv-hero">
        <div className="gv-card">
          {!chosen ? (
            <p className="gv-wait" aria-live="polite">Running every week through every house</p>
          ) : (
            <>
              <div className="gv-hero-top">
                <div>
                  <div className="gv-house-name">{shortName(chosen.home.name)}</div>
                  <div className="gv-checks">
                    {res && <span className={`gv-check${swapOk ? '' : ' bad'}`}><Check ok={swapOk} />{swapOk ? 'Nobody would swap' : 'Swap check failed'}</span>}
                    <span className={`gv-check${chosen.feasible ? '' : ' bad'}`}><Check ok={chosen.feasible} />{chosen.feasible ? 'Under every cap' : "Over someone's cap"}</span>
                    {late && lateName && strandedAt(chosen.home.id) && <span className="gv-check bad"><Check ok={false} />No way home for {lateName}</span>}
                  </div>
                </div>
                <div className="gv-total">
                  <div className="big">{usd(chosen.home.rent)}<span className="unit">/month</span></div>
                  <div className="gv-small gv-gray">{chosen.home.rooms.length} rooms, {chosen.home.area}</div>
                </div>
              </div>
              {res ? (
                <div className="gv-swap-in" key={chosen.home.id}><HouseDiagram home={chosen.home} assignment={res.assignment} prices={res.prices} members={members} colors={colors} usd={usd} /></div>
              ) : <p className="gv-note">The solver failed on this house: {chosen.error}</p>}
              <div className="gv-moves">
                <button type="button" className="gv-btn" onClick={doCapMove} disabled={!top || !!lastMove?.kind && lastMove.kind === 'cap' && !lastMove.error}>Lower a cap</button>
                <button type="button" className="gv-btn" onClick={doLateMove} disabled={!hasWeek || !!late}>Add a late shift</button>
                {moved && <button type="button" className="gv-link" onClick={reset}>Undo</button>}
                <MoveResult move={lastMove} members={members} rows={rows} baseline={baseline.current} weeks={weeks} chosen={chosen} late={late} placeName={placeName} homeName={(id) => shortName(rows.find((r) => r.home.id === id)?.home.name)} />
              </div>
            </>
          )}
        </div>

        <div className="gv-card" aria-label="Members">
          <div className="gv-members-head">
            <h2>Members</h2>
            <span className="gv-lock"><svg width="11" height="13" viewBox="0 0 11 13" aria-hidden="true"><rect x="0.75" y="5.5" width="9.5" height="6.75" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M3 5.5V3.75a2.5 2.5 0 015 0V5.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>Caps are private</span>
          </div>
          <div className="gv-members">
            {members.map((m, i) => (
              <MemberRow key={m.id} m={m} color={colors[i]} revealed={!!reveal[m.id]}
                trips={tripsOf(m)} entries={entriesOf(m)} dusk={duskS}
                onToggle={() => setReveal((r) => ({ ...r, [m.id]: !r[m.id] }))}
                privateInfo={privateInfo(m, i)}
                onCap={(v) => setCaps((c) => ({ ...c, [m.id]: v }))} />
            ))}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <section className="gv-section" aria-label="Houses compared">
          <header><h2>Houses compared</h2></header>
          <div className="gv-houses">
            {rows.map((r, k) => (
              <button key={r.home.id} type="button" className="gv-house" aria-pressed={r.home.id === chosen?.home.id}
                onClick={() => setSelected(r.home.id)} aria-label={`${r.home.name}, ${usd(r.home.rent)} a month, ${r.feasible ? 'works for everyone' : "over someone's cap"}`}>
                <div className="line"><span className="name">{shortName(r.home.name)}</span><span className="rank">{k + 1}</span></div>
                {r.res ? <MiniHouse home={r.home} assignment={r.res.assignment} colors={colors} /> : <svg className="mini" aria-hidden="true" />}
                <div className="line">
                  <span className="rent">{usd(r.home.rent)}<span className="gv-small gv-gray" style={{ fontWeight: 400 }}>/mo</span></span>
                  <span className={`gv-status${r.feasible && !strandedAt(r.home.id) ? '' : ' bad'}`}>
                    {!r.feasible ? "Over someone's cap" : late && strandedAt(r.home.id) ? `No way home for ${lateName}`
                      : <><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4l2.6 2.6L10 3.6" fill="none" stroke="#1f6f4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Works for everyone</>}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <TourTimes api={api} chosen={chosen} members={members} weeks={weeks} cfg={cfg} colors={colors} />

      {chosen && res && (
        <details className="gv-details">
          <summary>Details</summary>
          <div className="gv-details-body">
            <div>
              <h2 style={{ fontSize: 15, marginBottom: 4 }}>Swap check</h2>
              <p className="gv-how" style={{ marginBottom: 10 }}>What each person would lose a month by moving into another room at its rent.</p>
              {swapOk
                ? <SwapGrid row={chosen} members={members} colors={colors} usd={usd} />
                : <p className="gv-note">The independent checker rejected this split: {chosen.check.issues.join('. ')}.</p>}
              <Certificate row={chosen} members={members} model={model} cfg={cfg} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, marginBottom: 10 }}>House ranking</h2>
              <HouseTable rows={rows} chosenId={chosen.home.id} onPick={setSelected} />
              <p className="gv-how" style={{ marginTop: 8 }}>
                Worst-off is the highest net monthly cost any member pays: rent share, utilities share and commute time
                in dollars, minus what the room is worth to them. Houses under every cap come first.
                {solved ? ` ${rows.length} houses solved in ${ms(solved.totalMs)}.` : ''}
              </p>
              {late && <Stranded row={chosen} member={members.find((m) => m.id === late.memberId)} weeks={weeks} />}
            </div>
            <div className="wide">
              <p className="gv-how">
                How we got this: rents are the envy-free split that maximizes the worst-off member (Gal, Mash, Procaccia
                and Zick 2017), with private caps as in Procaccia, Velez and Yu 2018. An independent checker re-derives
                every margin, the rent sum and the caps before the check mark shows. Caps never leave the solver; each
                member sees only their own cap and gap. Room values are each persona's demo values.
                Utilities {usd(chosen.home.utilities)} a month are split evenly and are not part of the rent split.
              </p>
            </div>
          </div>
        </details>
      )}
    </>
  );
}

function MoveResult({ move, members, rows, baseline, weeks, chosen, late, placeName, homeName }) {
  if (!move) return null;
  const m = members.find((x) => x.id === move.memberId);
  let text = null;
  if (move.error) text = `The cap move failed: ${move.error}`;
  else if (move.kind === 'cap') {
    const row = rows.find((r) => r.home.id === move.houseId);
    const name = shortName(row?.home.name) || 'The top house';
    if (move.impossible) text = `No cap for ${m?.name} rules out ${name}.`;
    else if (row && !row.feasible) {
      const next = rows.find((r) => r.feasible);
      text = `${m?.name}'s lower cap rules out ${name}. ${next ? `The group moves to ${shortName(next.home.name)}.` : 'No house fits every cap now.'}`;
    } else text = `${name} still fits every cap.`;
  } else if (move.kind === 'late') {
    if (weeks.status === 'running' || !move.resolved) text = `Re-running ${m?.name}'s week in every house`;
    else {
      const shift = late ? `${m?.name}'s ${clock(late.end)} ${DAY_NAME[late.day]} shift` : `${m?.name}'s late shift`;
      const from = homeName(move.fromId);
      if (move.noneHome) {
        text = move.toId !== move.fromId
          ? `${shift} has no way home from any house under every cap, so ${homeName(move.toId)}, best for the worst-off member, is now the pick.`
          : `${shift} has no way home from ${from} or any other house under every cap.`;
      } else if (move.toId !== move.fromId) text = `${shift} has no way home from ${from}, so ${homeName(move.toId)} is now the pick.`;
      else text = `${m?.name} still gets home from ${from} after the ${late ? `${clock(late.end)} ` : ''}shift.`;
    }
  }
  return <p className="gv-move-result" aria-live="polite">{text}</p>;
}

function HouseTable({ rows, chosenId, onPick }) {
  return (
    <table className="gv-table">
      <thead>
        <tr><th>#</th><th>House</th><th className="num">Rent</th><th>Caps</th><th className="num">Worst-off</th></tr>
      </thead>
      <tbody>
        {rows.map((r, k) => (
          <tr key={r.home.id} className={r.home.id === chosenId ? 'sel' : ''} onClick={() => onPick(r.home.id)}>
            <td className="gv-num">{k + 1}</td>
            <td>{shortName(r.home.name)}</td>
            <td className="num">{usd(r.home.rent)}</td>
            <td className={r.feasible ? 'gv-good-t' : 'gv-bad-t'}>{r.error ? 'solver error' : r.feasible ? 'fits' : 'over'}</td>
            <td className="num">{usd(-r.E)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Certificate({ row, members, model, cfg }) {
  const { res, problem } = row;
  const margins = swapMargins(problem, res).flat().filter((v) => v != null && Number.isFinite(v));
  const minMargin = margins.length ? Math.min(...margins) : NaN;
  const ef = useMemo(() => {
    if (Number.isFinite(res.efRate)) return { rate: res.efRate, k: res.efSamples || cfg?.efSamples || 100 };
    return efRate(problem, res, members.map((m) => m.theta), model, seeded(11), { k: cfg?.efSamples ?? 100, spread: EF_SPREAD });
  }, [res, problem, members, model, cfg]);
  const favs = new Set(members.map((m, i) => favoriteRoom(problem.members[i].values))).size;
  return (
    <div className="gv-stats">
      <div><div className="v">{usd(minMargin, 2)}</div><div className="l">smallest margin</div></div>
      <div><div className="v">{pct(ef.rate)}</div><div className="l">stay swap-free if everyone's values are about {Math.round(EF_SPREAD * 100)}% off ({ef.k} draws)</div></div>
      <div><div className="v">{favs}</div><div className="l">different favorite rooms</div></div>
    </div>
  );
}

function Stranded({ row, member, weeks }) {
  const wr = member && weeks.byMember?.get(member.id)?.get(row?.home.id);
  const list = wr?.stranded || [];
  if (!member || !wr) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 15, marginBottom: 6 }}>{member.name}'s late shift</h2>
      {list.length ? (
        <table className="gv-table">
          <thead><tr><th>Trip</th><th>Time</th><th className="num">Walk needed</th><th className="num">Late walk cap</th></tr></thead>
          <tbody>
            {list.map((s, k) => (
              <tr key={k}>
                <td>{s.kind === 'leaveAt' ? `Home from ${s.label}` : `To ${s.label}`}, {DAY_NAME[s.day]?.slice(0, 3)}</td>
                <td className="gv-num">{s.time}</td>
                <td className="num">{Number.isFinite(s.needed) ? `${Math.round(s.needed)} min` : 'no route'}</td>
                <td className="num">{Number.isFinite(s.capMin) ? `${Math.round(s.capMin)} min` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="gv-how">From {shortName(row.home.name)}, {member.name} still has an allowed way home.</p>}
      <p className="gv-how" style={{ marginTop: 6 }}>No allowed way home means buses have stopped and the walk is over {member.name}'s late walking limit. A ride-hail is not counted.</p>
    </div>
  );
}
