// The six pitch slides. Every number on them is computed live by the engine (slides 1 and 2) or read from
// web/public/data/evidence/*.json (slides 3 and 4). Nothing numeric is typed in here except labels and the
// published method names. Each slide has presenter notes (press N).
import { useEffect, useMemo, useState } from 'react';
import { campusExample, groupExample, evidenceFigures, DATE_LABEL, TIMES, DEFAULT_HOME } from './data.js';

const int = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '-');
const usd = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString('en-US')}` : '-');
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '-');
const one = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const clock = (sec) => {
  if (!Number.isFinite(sec)) return '';
  const t = Math.round(sec / 60), h24 = Math.floor(t / 60) % 24, m = t % 60;
  return `${((h24 + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};
const Missing = ({ what }) => <span className="pd-muted">{what} has not been run on this build.</span>;

// 1. The problem, in the case writer's own example.
function Problem({ api }) {
  const homes = api.data.homes;
  const [homeId, setHomeId] = useState(() => (api.data.homeById?.has(DEFAULT_HOME) ? DEFAULT_HOME : homes[0]?.id));
  const ex = useMemo(() => { try { return campusExample(api, homeId); } catch (e) { console.warn(e); return null; } }, [api, homeId, api.version]);
  const cells = ex ? ex.rows.flatMap((r) => [r.walk, ...r.bus]).filter(Number.isFinite) : [];
  const lo = cells.length ? Math.min(...cells) : null, hi = cells.length ? Math.max(...cells) : null;
  return (
    <>
      <div className="pd-kicker">The problem</div>
      <h1 className="pd-title">"10 minutes from campus."<br />Which campus? Walk or bus? What hour?</h1>
      {ex ? (
        <>
          <div className="pd-row">
            <p className="pd-sub">
              One listing, {ex.home?.name} <span className="pd-tag syn">SYNTHETIC</span>. Minutes home from three campus
              buildings on {DATE_LABEL}: {lo} to {hi}.
            </p>
            <label className="pd-small">
              Home{' '}
              <select className="pd-pick" value={homeId} onChange={(e) => { setHomeId(e.target.value); e.target.blur(); /* arrows go back to the slides */ }}>
                {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
          </div>
          <table className="pd-tt">
            <thead>
              <tr>
                <th scope="col">Leave from</th>
                <th scope="col">Walk</th>
                <th scope="col">Bus, leave at {TIMES[0].label}</th>
                <th scope="col" className="pd-col-late">Bus, leave at {TIMES[1].label}</th>
              </tr>
            </thead>
            <tbody>
              {ex.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.campus}<span>{r.place}</span></th>
                  <td className={r.walk == null ? 'na' : ''}>{r.walk ?? 'no route'}{r.walk != null && <small>min</small>}</td>
                  {r.bus.map((b, i) => (
                    <td key={i} className={b == null ? 'na' : i === 1 ? 'late' : ''}>
                      {b ?? 'no bus'}{b != null && <small>min</small>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pd-body">
            And the lease is signed months before the fall schedule is final. Ann Arbor's ORD-24-03 lets a landlord
            sign next year's tenant 210 days into the current lease.
          </p>
        </>
      ) : <p className="pd-body pd-muted">The router did not return a result for this home.</p>}
      <p className="pd-src pd-spread">
        Computed now, in this browser, by the Quorum router on the real TheRide and U-M timetables ({DATE_LABEL})
        and OpenStreetMap streets. Bus minutes run from leaving the building to the front door, wait at the stop
        included. Walk at 1.3 m/s.{ex?.duskS ? ` Civil dusk that day: ${clock(ex.duskS)}, so the 11:30 PM walk is in the dark.` : ''}{' '}
        The home and its rent are SYNTHETIC; the street is real.
      </p>
    </>
  );
}

// 2. What Quorum does, for one student and for a group.
function WhatItDoes({ api }) {
  const [g, setG] = useState({ status: 'running' });
  useEffect(() => {
    let live = true;
    groupExample(api).then((r) => live && setG({ status: r ? 'done' : 'missing', r }))
      .catch((e) => { console.warn(e); if (live) setG({ status: 'error' }); });
    return () => { live = false; };
  }, [api, api.version]);
  const r = g.r;
  return (
    <>
      <div className="pd-kicker">What Quorum does</div>
      <h1 className="pd-title">Choose where to live from the week you will live.</h1>
      <div className="pd-cols">
        <div className="pd-col">
          <h3>For one student</h3>
          <p className="pd-body">
            You enter your week once. Quorum runs every trip of that week from every home on the real bus timetables
            and streets, then ranks the homes by what your time, a walk after dark and the room are worth to you.
          </p>
          <p className="pd-body">
            It learns those values from about six either-or picks, and it ranks across many plausible fall weeks,
            because your schedule is not final when you sign.
          </p>
          <div className="pd-live">
            <p className="pd-small">Live in the Me tab with Jordan <span className="pd-tag syn">FICTIONAL</span>, a North Campus engineering student with a late lab.</p>
          </div>
        </div>
        <div className="pd-col">
          <h3>For a group of friends</h3>
          <p className="pd-body">
            Each friend enters a week and a private rent cap that the others never see. Quorum picks the house,
            gives each person a room and splits the rent so nobody would rather swap rooms at those prices, and
            nobody pays over their cap.
          </p>
          <div className="pd-live">
            {g.status === 'running' && <p className="pd-small">Solving the demo group now...</p>}
            {(g.status === 'missing' || g.status === 'error') && <p className="pd-small pd-muted">The group solver is not in this build.</p>}
            {g.status === 'done' && r && (
              <>
                <p className="pd-small">
                  Demo group of {r.split.length} <span className="pd-tag syn">FICTIONAL</span>, {r.houses} houses <span className="pd-tag syn">SYNTHETIC</span>.
                  Top house: <b>{r.house.name}</b>, {usd(r.house.rent)} a month.
                </p>
                <div className="pd-split">
                  {r.split.map((s) => (
                    <span key={s.name}><i style={{ background: s.color || 'var(--ink)' }} /><b>{s.name}</b>{usd(s.price)}</span>
                  ))}
                </div>
                {r.capMove && (
                  <p className="pd-small">
                    Cut {r.capMove.name}'s private cap by ${r.capMove.delta}:{' '}
                    {r.capMove.topAfter?.id === r.house.id
                      ? `${r.house.name} stays on top.`
                      : `${r.house.name} ${r.capMove.oldTopFeasible ? 'drops' : 'becomes infeasible'} and the group moves to ${r.capMove.topAfter?.name}.`}
                  </p>
                )}
                <p className="pd-src">Solved now, in this browser, by the same code as the Group tab.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const Arrow = () => (
  <div className="pd-arrow" aria-hidden="true">
    <svg viewBox="0 0 32 24"><path d="M2 12h24M18 4l8 8-8 8" fill="none" stroke="currentColor" strokeWidth="2.5" /></svg>
  </div>
);

// 3. How it works.
function HowItWorks({ api, ev }) {
  const f = ev ? evidenceFigures(ev) : {};
  const c = api.config || {};
  return (
    <>
      <div className="pd-kicker">How it works</div>
      <h1 className="pd-title">Five steps, all in the browser, offline.</h1>
      <div className="pd-flow">
        <div className="pd-step data">
          <h4>Timetables and streets</h4>
          <p>TheRide and U-M bus timetables (GTFS) for the week of Nov 30 2026. OpenStreetMap walking streets.</p>
          <p className="m"><span className="pd-tag real">REAL DATA</span></p>
        </div>
        <Arrow />
        <div className="pd-step">
          <h4>The router</h4>
          <p>Earliest arrival and latest departure by bus and foot. One scan gives a trip to every home at once.</p>
          <p className="m">Connection Scan Algorithm (Dibbelt et al. 2017){f.msPerScan ? `, ${f.msPerScan} ms per scan` : ''}</p>
        </div>
        <Arrow />
        <div className="pd-step">
          <h4>The week</h4>
          <p>Every trip of your week from every home: arrive on time, then leave when you are done. Walk, wait, ride and dark minutes.</p>
          <p className="m">Daylight from the NOAA solar equations</p>
        </div>
        <Arrow />
        <div className="pd-step">
          <h4>The picks</h4>
          <p>About {c.picksMax ?? 6} either-or questions. Each one is the question whose answer teaches the model the most.</p>
          <p className="m">Bayesian active learning, BALD (Houlsby et al. 2011); particle filter</p>
        </div>
        <Arrow />
        <div className="pd-last">
          <div className="pd-step">
            <h4>The ranking</h4>
            <p>Homes sorted by expected regret in dollars a month over {c.scenarios ?? '-'} sampled fall weeks and {c.posteriorDraws ?? '-'} draws of your values.</p>
            <p className="m">Monte Carlo over weeks and values</p>
          </div>
          <div className="pd-step split">
            <h4>The fair split</h4>
            <p>Rooms and rents that nobody envies, best for the worst-off friend, under private caps.</p>
            <p className="m">Envy-free maximin LP (Gal, Mash, Procaccia, Zick 2017; Spliddit); caps (Procaccia, Velez, Yu 2018)</p>
          </div>
        </div>
      </div>
      <p className="pd-body pd-spread">No API keys and no language model. Every output traces back to a bus trip, a timetable row or a linear program.</p>
      <p className="pd-src">Router, week, picks and fair split are our own code in engine/*.js (plain JavaScript, no runtime dependencies). React and MapLibre GL JS draw the app.</p>
    </>
  );
}

// 4. Evidence, read from the evidence files.
function Evidence({ ev }) {
  if (!ev) return <><div className="pd-kicker">Evidence</div><h1 className="pd-title">Reading the evidence files...</h1></>;
  const f = evidenceFigures(ev);
  return (
    <>
      <div className="pd-kicker">Evidence</div>
      <h1 className="pd-title">We checked each model against something independent.</h1>
      <div className="pd-ev">
        <section>
          <h3>The router</h3>
          {f.trips ? (
            <div className={`pd-big ${f.trips.pass ? 'ok' : ''}`}>
              {int(f.trips.equal)} of {int(f.trips.total)}
              <small>stop-to-stop trips equal to the second against a separate Python router written from the raw timetables ({f.trips.date}).</small>
            </div>
          ) : <Missing what="router.json" />}
          <ul>
            {f.arrivals && <li>{int(f.arrivals.equal)} of {int(f.arrivals.total)} stop arrivals equal.</li>}
            {f.r5 ? (
              <li>
                Against r5py {f.r5.version} (Conveyal R5) on {int(f.r5.pairs)} place-to-home trips: median difference {one(f.r5.median)} min,
                {' '}{pct(f.r5.within2)} within 2 min, over the {int(f.r5.both)} trips both engines can make. R5 differs by design: it waits at least 60 s before
                every boarding and allows 1000 m transfers.
              </li>
            ) : <li><Missing what="r5.json" /></li>}
          </ul>
        </section>
        <section>
          <h3>The fair split</h3>
          {f.lp ? (
            <div className={`pd-big ${f.lp.envyFree === f.lp.instances ? 'ok' : ''}`}>
              {int(f.lp.envyFree)} of {int(f.lp.instances)}
              <small>random houses of 2 to 6 people: envy-free, rents add up to the house rent, and a separate checker agrees.</small>
            </div>
          ) : <Missing what="lp.json" />}
          {f.lp && (
            <ul>
              <li>Hand cases {f.lp.published.map((p) => p.k).join(', ')}, including the infeasible-cap example published by Procaccia, Velez and Yu (2018): {f.lp.published.every((p) => p.pass) ? 'all pass' : 'not all pass'}.</li>
              {Number.isFinite(f.lp.p50ms5) && <li>Median solve for a five-person house: {f.lp.p50ms5} ms.</li>}
            </ul>
          )}
        </section>
        <section>
          <h3>The picks</h3>
          {f.rec?.main ? (
            <div className="pd-big ok">
              {usd(-f.rec.main.diff.mean)} a month
              <small>less regret with our questions than with random questions, on students whose values sit far from our prior (95% interval {usd(-f.rec.main.diff.hi)} to {usd(-f.rec.main.diff.lo)}).</small>
            </div>
          ) : <Missing what="recovery.json" />}
          {f.rec && (
            <ul>
              <li>{int(f.rec.trials)} SYNTHETIC students per setting, {f.rec.picks} picks each. Top home found {pct(f.rec.main?.top1Bald, 0)} of the time, against {pct(f.rec.main?.top1Random, 0)} with random questions.</li>
              <li>
                Lower regret than random in {f.rec.randomWins} of {f.rec.randomSettings} settings. Against a fixed list of good
                questions chosen in advance, on the same hard students: lower in {f.rec.fixedOffLower}, higher
                in {f.rec.fixedOffHigher}, no clear difference in {f.rec.fixedOffSettings - f.rec.fixedOffLower - f.rec.fixedOffHigher} of {f.rec.fixedOffSettings} settings.
              </li>
            </ul>
          )}
        </section>
      </div>
      <p className="pd-src pd-spread">Read live from web/public/data/evidence/router.json, r5.json, lp.json and recovery.json. Full tables in the Evidence tab.</p>
    </>
  );
}

// 5. The business, as a hypothesis.
function Business() {
  return (
    <>
      <div className="pd-kicker">The business <span className="pd-tag hyp">HYPOTHESIS, NOT TESTED</span></div>
      <h1 className="pd-title">The group is the buyer. The operator would pay.</h1>
      <div className="pd-grid2">
        <ul className="pd-list">
          <li><b>Groups use it free.</b> Friends decide together which house to rent, so the group is the unit we serve.</li>
          <li><b>An operator of one-of-a-kind houses</b> gets groups that arrive already agreed on the house, the rooms and the split.</li>
          <li><b>It also gets demand per room,</b> not per house: what each odd room is worth to the students who would live there, and what a renovation changes in dollars. That is the Operator tab.</li>
        </ul>
        <div className="pd-box">
          <h3>What is synthetic today</h3>
          <ul>
            <li>Homes, rooms and rents: <span className="pd-tag syn">SYNTHETIC</span>, placed on real streets.</li>
            <li>The students: <span className="pd-tag syn">FICTIONAL</span>.</li>
            <li>The Operator tab's student population: <span className="pd-tag syn">SYNTHETIC</span>.</li>
            <li>Real: TheRide and U-M timetables, OpenStreetMap streets and places, daylight.</li>
          </ul>
          <p className="pd-small">No market size, price or revenue figure here. We have not measured one.</p>
        </div>
      </div>
    </>
  );
}

// 6. Next.
function Next() {
  return (
    <>
      <div className="pd-kicker">What we would do next</div>
      <h1 className="pd-title">Make it true for a real house and a real group.</h1>
      <ul className="pd-list">
        <li><b>Real listings.</b> The engine reads any listing file. Start with one operator's houses and rooms.</li>
        <li><b>Real students.</b> Check that six picks match what students say they value. Picks like these tend to understate the value of time (Small 2012).</li>
        <li><b>Fall timetables.</b> Today one December week stands in for both terms. Daylight is already computed per term date.</li>
        <li><b>Late night and weather.</b> FlexRide is on demand and not in the timetables. Walking is 1.3 m/s for everyone, with no hills or snow.</li>
        <li><b>Mid-trip stop limits.</b> A stop in the middle of a trip where the bus only drops off or only picks up is not modeled yet. First and last stops already are.</li>
      </ul>
    </>
  );
}

export const SLIDES = [
  {
    id: 'problem', title: 'The problem', Comp: Problem,
    notes: [
      'Read the title. This is the example from the case sheet.',
      'Point at the table: same home, three campuses, two hours. The numbers are computed live, not typed in.',
      'The late column is the bus at 11:30 PM. Fewer buses, so longer waits, and the walk is in the dark.',
      'Second problem: in Ann Arbor you sign months before you know your fall schedule.',
      'If asked: you can switch the home in the menu above the table.',
    ],
  },
  {
    id: 'what', title: 'What Quorum does', Comp: WhatItDoes,
    notes: [
      'Left: one student. Right: a group of friends.',
      'The group result on the right is solved live. It is the same as the Group tab.',
      'Read the cap sentence: one friend lowers a private cap a little and the whole group moves house. That is the sensitivity item.',
      'Then switch to the app and demo Me, then Group.',
    ],
  },
  {
    id: 'how', title: 'How it works', Comp: HowItWorks,
    notes: [
      'Left to right: real timetables and streets, our router, the week, the picks, then the ranking and the fair split.',
      'Router: Connection Scan Algorithm, a published method for timetable routing.',
      'Picks: each question is chosen to teach the model the most. That is the AI part. No language model, on purpose: it runs offline and every number can be traced.',
      'Fair split: the envy-free rent method behind Spliddit, with private caps.',
    ],
  },
  {
    id: 'evidence', title: 'Evidence', Comp: Evidence,
    notes: [
      'Router: a second router, written separately in Python, gets the same answer on every trip.',
      'R5 is a widely used transit engine. It differs by design, so small gaps are expected.',
      'Fair split: thousands of random houses, every split envy-free and checked by separate code. Read the number off the slide.',
      'Picks: tested on SYNTHETIC students. Read the regret number and the comparison with a fixed list exactly as the slide states it, including any setting where we did not win.',
    ],
  },
  {
    id: 'business', title: 'The business', Comp: Business,
    notes: [
      'Say "hypothesis" out loud. We have not tested it with an operator.',
      'Groups use it free. The operator of irregular houses gets agreed groups and per-room demand.',
      'Be clear about what is synthetic: homes, rents, rooms, people. Timetables, streets and places are real.',
    ],
  },
  {
    id: 'next', title: 'Next', Comp: Next,
    notes: [
      'Optional. Use it only if there is time, or in Q&A.',
      'Each item is a known limit we already state in the app.',
    ],
  },
];
