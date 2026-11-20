// The pitch slides: problem, what a student sees, what a group gets, how it works, evidence, the business as a
// hypothesis, and an optional next-steps slide. Every number is computed live by the engine (slides 1 to 3) or
// read from web/public/data/evidence/*.json (slides 4 and 5). Nothing numeric is typed in here except labels and
// the published method names. Each slide has presenter notes (press N).
import { useEffect, useMemo, useState } from 'react';
import { campusExample, studentExample, groupExample, evidenceFigures, DATE_LABEL, TIMES, DEFAULT_HOME } from './data.js';

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

// 2. What one student sees.
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
  const Col = ({ x, tag }) => (
    <div className="pd-vs-col">
      <div className="pd-vs-tag">{tag}</div>
      <h3>{x.home.name}</h3>
      <p className="pd-small">{x.room?.label ? `${x.room.label}, ` : ''}ranks {x.rank} of {r.n} for this week</p>
      <dl className="pd-figs">
        <div><dt>Rent</dt><dd>{usd(x.rent)}<small>/mo</small></dd></div>
        <div><dt>In motion</dt><dd>{int(x.hours)}<small>h/mo</small></dd></div>
        <div><dt>Walking in the dark</dt><dd>{one(x.darkHours)}<small>h/mo</small></dd></div>
        <div><dt>Trips with no ride</dt><dd>{int(x.stranded)}<small>/wk</small></dd></div>
      </dl>
    </div>
  );
  return (
    <>
      <div className="pd-kicker">What a student sees</div>
      <h1 className="pd-title">The cheapest rent is not the cheapest home.</h1>
      {st.status === 'running' && <p className="pd-body pd-muted">Running the week through every home now...</p>}
      {(st.status === 'missing' || st.status === 'error') && <p className="pd-body pd-muted">The week or ranking module is not in this build.</p>}
      {st.status === 'done' && r && (
        <>
          <p className="pd-sub">
            {r.persona.name} <span className="pd-tag syn">FICTIONAL</span>, {r.persona.program}. The same week run through
            all {r.n} homes <span className="pd-tag syn">SYNTHETIC</span>, every trip on the real bus timetables.
          </p>
          {same ? (
            <div className="pd-vs one"><Col x={r.best} tag="Lowest rent and best for this week" /></div>
          ) : (
            <div className="pd-vs">
              <Col x={r.cheapest} tag="Lowest rent" />
              <div className="pd-vs-gap">
                <span className="pd-gap-num">{usd(r.gap)}</span>
                <span className="pd-gap-txt">a month better for {r.persona.name}, counting time, dark walks, trips with no ride and the room</span>
              </div>
              <Col x={r.best} tag={`Best for ${r.persona.name}'s week`} />
            </div>
          )}
        </>
      )}
      <p className="pd-src pd-spread">
        Computed now, in this browser: the most likely week (entries with a chance of at least one half), every trip
        routed door to door. Values are {r?.persona.name || 'the persona'}'s demo values, the ones the Me tab uses to
        answer picks automatically. In the Me tab a real student sets them with about {api.config?.picksMax ?? 6} either-or picks.
      </p>
    </>
  );
}

// 3. What a group gets.
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
    <>
      <div className="pd-kicker">What a group gets</div>
      <h1 className="pd-title">One house, one room each, a split nobody wants to swap.</h1>
      {g.status === 'running' && <p className="pd-body pd-muted">Solving the demo group now...</p>}
      {(g.status === 'missing' || g.status === 'error') && <p className="pd-body pd-muted">The group solver is not in this build.</p>}
      {g.status === 'done' && r && (
        <div className="pd-grid2">
          <div>
            <p className="pd-sub">
              Demo group of {r.split.length} <span className="pd-tag syn">FICTIONAL</span>. Top of {r.houses} houses <span className="pd-tag syn">SYNTHETIC</span>:
              {' '}<b>{r.house.name}</b>.
            </p>
            <table className="pd-split-tt">
              <thead><tr><th scope="col">Friend</th><th scope="col">Room</th><th scope="col" className="r">Rent a month</th></tr></thead>
              <tbody>
                {r.split.map((s) => (
                  <tr key={s.name}>
                    <th scope="row"><i style={{ background: s.color || 'var(--ink)' }} />{s.name}</th>
                    <td>{s.room || '-'}</td>
                    <td className="r">{usd(s.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row" colSpan={2}>Total{Number.isFinite(r.house.rent) && Math.round(total) === Math.round(r.house.rent) ? ', equal to the house rent' : ''}</th><td className="r">{usd(total)}</td></tr></tfoot>
            </table>
          </div>
          <div className="pd-checks">
            <div className="pd-check">
              <span className="pd-check-k">Envy</span>
              <span className="pd-check-v">{r.checked === true ? 'none' : r.checked === false ? 'check failed' : 'not checked'}</span>
              <span className="pd-small">At these prices no friend prefers another friend's room. A separate checker re-tests it.</span>
            </div>
            <div className="pd-check">
              <span className="pd-check-k">Caps</span>
              <span className="pd-check-v">{r.feasible ? 'all met' : 'not all met'}</span>
              <span className="pd-small">Each friend's cap is private. The others never see it.</span>
            </div>
            {r.capMove && (
              <div className="pd-check move">
                <span className="pd-check-k">If {r.capMove.name}'s cap drops ${r.capMove.delta}</span>
                <span className="pd-small">
                  {r.capMove.topAfter?.id === r.house.id
                    ? `${r.house.name} stays on top.`
                    : `${r.house.name} ${r.capMove.oldTopFeasible ? 'drops' : 'no longer fits every cap'}, and the group moves to ${r.capMove.topAfter?.name}.`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      <p className="pd-src pd-spread">
        Solved now, in this browser, by the same code as the Group tab{r && Number.isFinite(r.ms) ? `, all ${r.houses} houses in ${int(r.ms)} ms` : ''}.
        Envy-free maximin rents (Gal, Mash, Procaccia, Zick 2017) with private caps (Procaccia, Velez, Yu 2018).
      </p>
    </>
  );
}

// 4. How it works, drawn as a route line: each stage is a stop.
function HowItWorks({ api, ev }) {
  const f = ev ? evidenceFigures(ev) : {};
  const c = api.config || {};
  const stops = [
    { k: 'Timetables and streets', t: 'TheRide and U-M bus timetables, week of Nov 30 2026. OpenStreetMap walking streets.', m: 'GTFS, OSM', real: true },
    { k: 'Router', t: 'Fastest door-to-door trip by bus and foot. One scan reaches every home at once.', m: `Connection Scan (Dibbelt et al. 2017)${f.msPerScan ? `, ${f.msPerScan} ms a scan` : ''}` },
    { k: 'Your week', t: 'Every trip of your week from every home. Walk, wait, ride and minutes after dusk.', m: 'Dusk from NOAA solar equations' },
    { k: 'Picks', t: `About ${c.picksMax ?? 6} either-or questions, each the one that teaches the model the most.`, m: 'BALD (Houlsby et al. 2011), particle filter' },
    { k: 'Ranking', t: `Homes by expected regret in $ a month, over ${c.scenarios ?? '-'} possible fall weeks and ${c.posteriorDraws ?? '-'} draws of your values.`, m: 'Monte Carlo', end: true },
    { k: 'Fair split', t: 'Rooms and rents nobody envies, best for the worst-off friend, under private caps.', m: 'Envy-free maximin LP', end: true },
  ];
  return (
    <>
      <div className="pd-kicker">How it works</div>
      <h1 className="pd-title">Six stops, all in the browser, offline.</h1>
      <ol className="pd-route" aria-label="Pipeline">
        {stops.map((s, i) => (
          <li key={s.k} className={`${s.real ? 'real' : ''} ${s.end ? 'end' : ''}`}>
            <span className="pd-stop" aria-hidden="true">{i + 1}</span>
            <h4>{s.k}</h4>
            <p>{s.t}</p>
            <p className="m">{s.real ? <span className="pd-tag real">REAL DATA</span> : s.m}</p>
          </li>
        ))}
      </ol>
      <p className="pd-body pd-spread">No API keys and no language model. Every number traces back to a bus trip, a timetable row or a linear program.</p>
      <p className="pd-src">Router, week, picks, ranking and fair split are our own code in engine/*.js (plain JavaScript, no runtime dependencies). React and MapLibre GL JS draw the app.</p>
    </>
  );
}

// 5. Evidence, read from the evidence files.
function Evidence({ ev }) {
  if (!ev) return <><div className="pd-kicker">Evidence</div><h1 className="pd-title">Reading the evidence files...</h1></>;
  const f = evidenceFigures(ev);
  return (
    <>
      <div className="pd-kicker">Evidence</div>
      <h1 className="pd-title">Each model checked against something independent.</h1>
      <div className="pd-ev">
        <section>
          <h3>The router</h3>
          {f.trips ? (
            <div className={`pd-big ${f.trips.pass ? 'ok' : ''}`}>
              {int(f.trips.equal)}<span className="of"> of {int(f.trips.total)}</span>
              <small>stop-to-stop trips equal to the second, against a separate Python router written from the raw timetables ({f.trips.date}).</small>
            </div>
          ) : <Missing what="router.json" />}
          <ul>
            {f.arrivals && <li>{int(f.arrivals.equal)} of {int(f.arrivals.total)} stop arrivals equal.</li>}
            {f.r5 ? (
              <li>
                Against r5py {f.r5.version} (Conveyal R5), {int(f.r5.pairs)} trips: median gap {one(f.r5.median)} min,
                {' '}{pct(f.r5.within2)} within 2 min of the {int(f.r5.both)} both can make. R5 waits at least 60 s before
                each boarding by design.
              </li>
            ) : <li><Missing what="r5.json" /></li>}
          </ul>
        </section>
        <section>
          <h3>The fair split</h3>
          {f.lp ? (
            <div className={`pd-big ${f.lp.envyFree === f.lp.instances ? 'ok' : ''}`}>
              {int(f.lp.envyFree)}<span className="of"> of {int(f.lp.instances)}</span>
              <small>random houses of 2 to 6 people: envy-free, rents add up, and a separate checker agrees.</small>
            </div>
          ) : <Missing what="lp.json" />}
          {f.lp && (
            <ul>
              <li>Hand cases {f.lp.published.map((p) => p.k).join(', ')}, including the infeasible-cap example of Procaccia, Velez and Yu (2018): {f.lp.published.every((p) => p.pass) ? 'all pass' : 'not all pass'}.</li>
              {Number.isFinite(f.lp.p50ms5) && <li>Median solve, five-person house: {f.lp.p50ms5} ms.</li>}
            </ul>
          )}
        </section>
        <section>
          <h3>The picks</h3>
          {f.rec?.main ? (
            <div className="pd-big ok">
              {usd(-f.rec.main.diff.mean)}<span className="of"> a month</span>
              <small>less regret than random questions, on students whose values sit far from our prior (95% interval {usd(-f.rec.main.diff.hi)} to {usd(-f.rec.main.diff.lo)}).</small>
            </div>
          ) : <Missing what="recovery.json" />}
          {f.rec && (
            <ul>
              <li>{int(f.rec.trials)} SYNTHETIC students per setting, {f.rec.picks} picks each. Top home found {pct(f.rec.main?.top1Bald, 0)} of the time, against {pct(f.rec.main?.top1Random, 0)} with random questions.</li>
              <li>
                Lower regret than random in {f.rec.randomWins} of {f.rec.randomSettings} settings. Against a fixed list of good
                questions on the same hard students: lower in {f.rec.fixedOffLower}, higher
                in {f.rec.fixedOffHigher}, no clear difference in {f.rec.fixedOffSettings - f.rec.fixedOffLower - f.rec.fixedOffHigher} of {f.rec.fixedOffSettings}.
              </li>
            </ul>
          )}
        </section>
      </div>
      <p className="pd-src pd-spread">Read live from web/public/data/evidence/router.json, r5.json, lp.json and recovery.json. Full tables in the Evidence tab.</p>
    </>
  );
}

// 6. The business, as a hypothesis.
function Business() {
  return (
    <>
      <div className="pd-kicker">The business <span className="pd-tag hyp">HYPOTHESIS, NOT TESTED</span></div>
      <h1 className="pd-title">The group is the user. The operator would pay.</h1>
      <table className="pd-biz">
        <thead><tr><th scope="col">Who</th><th scope="col">What they get</th><th scope="col">Pays?</th><th scope="col">How we would test it</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">Groups of friends</th>
            <td>A house, a room each and a split everyone can accept, before anyone signs.</td>
            <td className="pay">Free</td>
            <td>Do groups that use it agree faster than groups that do not?</td>
          </tr>
          <tr>
            <th scope="row">Operators of one-of-a-kind houses</th>
            <td>Groups that arrive agreed, and a fair rent per odd room. That is the Operator tab.</td>
            <td className="pay">Would pay, we think</td>
            <td>One operator, one leasing season: time to sign and empty rooms, with and without it.</td>
          </tr>
        </tbody>
      </table>
      <p className="pd-small pd-spread">
        No market size, price or revenue figure here. We have not measured one. Synthetic today: homes, rooms, rents
        and the Operator population <span className="pd-tag syn">SYNTHETIC</span>, the students <span className="pd-tag syn">FICTIONAL</span>.
        Real: TheRide and U-M timetables, OpenStreetMap streets and places, daylight.
      </p>
    </>
  );
}

// 7. Next (optional).
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
    id: 'student', title: 'What a student sees', Comp: Student,
    notes: [
      'One fictional student, Jordan, a North Campus engineer with a late lab.',
      'Left: the listing with the lowest rent. Right: the home worth the most to Jordan once the whole week is counted.',
      'Read the dollar gap in the middle. It is computed now from the real timetables, not typed in.',
      'Say this out loud: most of the gap is the cheap home\'s trips with no ride home, priced at Jordan\'s demo value per stranded trip. A real student sets that value with the picks.',
      'Then switch to the Me tab and show the picks and the ranking.',
    ],
  },
  {
    id: 'group', title: 'What a group gets', Comp: Group,
    notes: [
      'Five fictional friends. Each enters a week and a private cap.',
      'Read the split: one room each, rents add up to the house rent, and nobody would rather swap.',
      'Read the cap line: one friend lowers a private cap a little and the whole group moves house.',
      'Then switch to the Group tab.',
    ],
  },
  {
    id: 'how', title: 'How it works', Comp: HowItWorks,
    notes: [
      'Read the line left to right like a bus route: real timetables and streets, our router, the week, the picks, then the two outputs, the ranking and the fair split.',
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
      'Groups use it free. The operator of irregular houses gets agreed groups and a fair rent per room.',
      'Read the last column: each row ends in a test we have not run yet.',
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
