// You: one student's real week through every candidate home on the real timetables, about six pairwise picks
// to learn what time and room features are worth, then a ranking across the fall weeks they might have.
// Layout: map plus "Your top 3", Details, the trade-off chart with What if chips, the picks, then the week.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, MapView, NotBuilt } from '../components/index.js';
import { useConfigVersion } from '../engine/useConfig.js';
import { useNotes } from './me/Verdict.jsx';
import CalendarDrop from './me/CalendarDrop.jsx';
import { rng } from '../../../engine/rng.js';
import { PARAM_INFO, utility } from '../../../engine/model.js';
import WeekEditor from './me/WeekEditor.jsx';
import WeekCalendar from './me/WeekCalendar.jsx';
import HomeList from './me/HomeList.jsx';
import TripExplainer, { tripLegs, tripPaths } from './me/TripExplainer.jsx';
import PickCard from './me/PickCard.jsx';
import Learned from './me/Learned.jsx';
import TopThree from './me/TopThree.jsx';
import Tradeoff from './me/Tradeoff.jsx';
import Details from './me/Details.jsx';
import { editableWeek, modalRoutine, uncertainRoutine, lateEntry, moveToCentral, TERM_CHOICES, autoAnswer, DAY_LABEL } from './me/routine.js';
import { pct } from './me/format.js';
import './me/verdict/you.css';

const SCENARIO_SEED = 11;

function timed(fn) {
  const t = performance.now();
  const v = fn();
  return [v, performance.now() - t];
}

export default function MeView({ api }) {
  const version = useConfigVersion(api);
  const cfg = api.config;
  const { personas, homes, places, placeById, homeById } = api.data;
  const week = api.mod('week'), prefs = api.mod('prefs'), decide = api.mod('decide'), solar = api.mod('solar');

  const [personaId, setPersonaId] = useState(personas[0]?.id);
  const persona = personas.find((p) => p.id === personaId) || personas[0];
  const [entries, setEntries] = useState(() => editableWeek(persona));
  const [labCentral, setLabCentral] = useState(false);
  const [term, setTerm] = useState('lease');
  const [sortKey, setSortKey] = useState('genMin');
  const [selHome, setSelHome] = useState(null);
  const [selTrip, setSelTrip] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [pickVersion, setPickVersion] = useState(0);
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const postRef = useRef(null);

  // persona change: fresh week, fresh posterior
  useEffect(() => {
    setEntries(editableWeek(persona));
    setLabCentral(false); setBaseline(null); setSelHome(null); setSelTrip(null); setLast(null);
    postRef.current = null; setPickVersion((v) => v + 1);
  }, [personaId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!postRef.current && prefs?.createPosterior) postRef.current = prefs.createPosterior({ seed: 7, cfg });
  const post = postRef.current;

  const homeIds = useMemo(() => homes.map((h) => h.id), [homes]);
  const lab = useMemo(() => lateEntry(entries, placeById), [entries, placeById]);
  const effEntries = useMemo(() => (labCentral && lab ? moveToCentral(entries, lab.id, placeById) : entries), [entries, labCentral, lab, placeById]);
  const dates = TERM_CHOICES[term].dates || cfg.termDates;
  const modal = useMemo(() => modalRoutine(effEntries, persona?.modes), [effEntries, persona]);

  // the most likely week, every home
  const [weekMap, weekMs] = useMemo(() => {
    if (!week) return [null, 0];
    try { return timed(() => api.weekFor(modal, homeIds, { dates })); } catch (e) { console.error(e); return [null, 0]; }
  }, [week, modal, homeIds, term, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // options per home on the most likely week (for picks)
  const homeOptions = useMemo(() => (weekMap ? homes.map((h) => ({
    id: h.id, options: h.rooms.map((r) => api.optionFor(h, r, weekMap.get(h.id))),
  })) : null), [weekMap, homes, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // next question
  const [cands, pair, pairMs] = useMemo(() => {
    if (!prefs || !post || !homeOptions) return [null, null, 0];
    const c = prefs.buildCandidates(post, homeOptions);
    const [p, ms] = timed(() => prefs.nextPair(post, c, { cfg }));
    return [c, p, ms];
  }, [homeOptions, pickVersion, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const topBest = useMemo(() => {
    if (!prefs?.pBestHomes || !post || !homeOptions) return null;
    return prefs.pBestHomes(post, homeOptions).reduce((a, b) => (b.pBest > a.pBest ? b : a));
  }, [homeOptions, pickVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const topPBest = topBest ? topBest.pBest : null;
  const stop = prefs && post ? prefs.shouldStop(post, post.nPicks, topPBest, pair?.ig ?? null, cfg) : null;
  const summary = useMemo(() => (prefs && post ? prefs.summary(post, cfg) : null), [pickVersion, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // scenario weeks and the ranking (deferred one frame so typing stays responsive)
  const [ranked, setRanked] = useState(null);
  useEffect(() => {
    if (!week || !decide || !prefs || !post) return undefined;
    const id = setTimeout(() => {
      try {
        const t0 = performance.now();
        const scen = week.sampleWeeks(uncertainRoutine(effEntries, persona?.modes), cfg.scenarios, SCENARIO_SEED);
        const weeksByScenario = scen.map((s) => api.weekFor(s, homeIds, { dates }));
        const t1 = performance.now();
        const thetas = prefs.draws(post, cfg.posteriorDraws, 3);
        const rank = decide.meRank({ homes, weeksByScenario, thetas, cfg });
        const ev = decide.evpi ? decide.evpi(rank.tensor).evpi : null;
        // One point estimate everywhere: the posterior median, the same statistic "What the picks say" shows.
        const sum = prefs.summary ? prefs.summary(post, cfg) : null;
        const mean = sum
          ? Object.fromEntries(Object.entries(sum).map(([k, s]) => [k, s.median]))
          : (prefs.posteriorMean ? prefs.posteriorMean(post) : null);
        const be = [];
        if (rank.length >= 2 && mean && decide.breakEven) {
          const [a, b] = rank;
          const arg = (r) => ({ home: homeById.get(r.homeId), weeks: weeksByScenario.map((m) => m.get(r.homeId)) });
          for (const param of ['vTime', 'vDark']) {
            try { be.push({ ...decide.breakEven(arg(a), arg(b), param, mean, cfg), A: a.homeId, B: b.homeId }); } catch (e) { console.warn(e); }
          }
        }
        const t2 = performance.now();
        setRanked({ rank, ev, be, mean, pointKind: sum ? 'median' : 'mean', pv: pickVersion, scenMs: t1 - t0, rankMs: t2 - t1, nScen: scen.length, nDraws: thetas.length });
      } catch (e) { console.error(e); setRanked({ error: String(e.message || e) }); }
    }, 0);
    return () => clearTimeout(id);
  }, [effEntries, term, version, pickVersion, personaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // selection
  const shownHome = selHome && homeById.has(selHome) ? selHome : ranked?.rank?.[0]?.homeId || homes[0]?.id;
  const shownWeek = weekMap?.get(shownHome);
  const defaultTrip = useMemo(() => {
    if (!shownWeek) return null;
    let best = 0, score = -1;
    shownWeek.trips.forEach((t, i) => {
      const s = (t.stranded ? 1000 : 0) + (t.darkMin || 0) * 10 + (t.mode === 'transit' ? 5 : 0);
      if (s > score) { score = s; best = i; }
    });
    return best;
  }, [shownWeek]);
  const tripIdx = selTrip != null && shownWeek?.trips[selTrip] ? selTrip : defaultTrip;
  const trip = shownWeek?.trips[tripIdx];
  const legs = useMemo(() => (trip ? tripLegs(api, trip) : null), [trip]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths = useMemo(() => tripPaths(api, trip, legs), [trip, legs]); // eslint-disable-line react-hooks/exhaustive-deps
  const duskS = solar?.dusk ? solar.dusk((dates[dates.length - 1] || dates[0]).date, cfg) : null;

  // answering
  const answer = (choice) => {
    if (!pair || !cands) return;
    const A = cands.options[pair.i], B = cands.options[pair.j];
    prefs.update(post, A, B, choice, cfg);
    const n = (o) => homeById.get(o.homeId)?.name;
    setLast(choice === 'skip' ? 'too close to call (recorded nothing)' : `week ${choice}, ${choice === 'A' ? n(A) : n(B)}`);
    setPickVersion((v) => v + 1);
  };
  const autoOne = (p = pair, c = cands) => {
    if (!p || !c || !persona?.theta) return null;
    const A = c.options[p.i], B = c.options[p.j];
    const u = rng(1000 + post.picks.length)();
    const { choice, pA } = autoAnswer(utility(persona.theta, A), utility(persona.theta, B), cfg.tau, u);
    prefs.update(post, A, B, choice, cfg);
    return { choice, pA, A, B };
  };
  const onAuto = () => {
    const r = autoOne();
    if (r) {
      setLast(`auto: week ${r.choice}, ${homeById.get((r.choice === 'A' ? r.A : r.B).homeId)?.name} (demo values gave A a ${Math.round(r.pA * 100)}% chance)`);
      setPickVersion((v) => v + 1);
    }
  };
  const onAutoAll = () => {
    setBusy(true);
    setTimeout(() => {
      let n = 0;
      for (let k = 0; k < cfg.picksMax; k++) {
        const c = prefs.buildCandidates(post, homeOptions);
        const p = prefs.nextPair(post, c, { cfg });
        const tp = Math.max(...prefs.pBestHomes(post, homeOptions).map((x) => x.pBest));
        if (prefs.shouldStop(post, post.nPicks, tp, p?.ig ?? null, cfg).stop || !p) break;
        autoOne(p, c); n++;
      }
      setLast(`auto-answered ${n} picks with the persona's demo values`);
      setBusy(false);
      setPickVersion((v) => v + 1);
    }, 0);
  };
  const resetPicks = () => { postRef.current = null; setLast(null); setPickVersion((v) => v + 1); };

  // sensitivity: remember the order before a toggle so the table can show what moved
  const snapshot = () => setBaseline((b) => b || (ranked?.rank ? new Map(ranked.rank.map((r, i) => [r.homeId, i])) : null));
  const changeS = cfg.changeDefaultS;

  // The stop rule looks at the most likely week only; the ranking covers every sampled week. Say both in one sentence.
  const stopShown = (() => {
    if (!stop || stop.reason !== 'pbest' || !topBest) return stop;
    const nm = homeById.get(topBest.id)?.name || 'One home';
    const r = ranked?.pv === pickVersion ? ranked?.rank?.find((x) => x.homeId === topBest.id) : null;
    const across = r && ranked.nScen ? `Across all ${ranked.nScen} possible weeks: ${pct(r.pBest)}.` : 'Across all possible weeks: computing.';
    return { ...stop, text: `${nm} is best on your most likely week (${topBest.pBest.toFixed(2)}). ${across}` };
  })();

  const routeNames = useMemo(() => [...new Set(trip?.rides?.map((r) => r.route) || [])], [trip]);
  const mapPlaces = useMemo(() => {
    const ids = new Set(effEntries.filter((e) => e.on !== false).map((e) => e.place));
    return places.filter((p) => ids.has(p.id));
  }, [effEntries, places]);
  const mapHomes = useMemo(() => homes.map((h) => ({ ...h, short: h.name.split(' ').slice(0, 2).join(' ') })), [homes]);

  const [editing, setEditing] = useState(false);
  const notes = useNotes({ api, homes, weekMap, ranked, summary, cfg, persona });
  const rank = ranked?.rank || null;
  // Fit for color by rank order, in five even steps (quintiles): 1 for the best fifth, 0 for the worst.
  // Rank order spreads the scale; expected regret itself bunches most homes near the best end.
  const fitById = useMemo(() => {
    if (!rank?.length) return null;
    const n = rank.length;
    return Object.fromEntries(rank.map((r, i) => [r.homeId, n > 1 ? (4 - Math.min(4, Math.floor((i / n) * 5))) / 4 : 1]));
  }, [rank]);
  const rankById = useMemo(() => (rank ? Object.fromEntries(rank.slice(0, 3).map((r, i) => [r.homeId, i + 1])) : null), [rank]);
  const select = (id) => { setSelHome(id); setSelTrip(null); };

  if (!persona) return <div className="note warn">No personas are loaded.</div>;

  const termKeys = Object.keys(TERM_CHOICES);
  const tripCaption = trip
    ? `${homeById.get(shownHome)?.name}: ${DAY_LABEL[trip.day]} ${trip.time}${routeNames.length ? `, bus ${routeNames.join(' then ')}` : trip.mode === 'walk' ? ', on foot' : ''}`
    : null;

  return (
    <div className="you">
      <div className="you-who" role="group" aria-label="Whose week">
        <span className="you-who-l">Whose week</span>
        {personas.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={p.id === personaId} onClick={() => setPersonaId(p.id)} title={p.program}>
            {p.name}
          </button>
        ))}
      </div>

      {!week ? <NotBuilt module="week" what="running the week through each home" /> : (
        <section className="you-hero" aria-label="Your best homes">
          <div className="you-map">
            <MapView homes={mapHomes} places={mapPlaces} selectedHomeId={shownHome} onHomeClick={select}
              labelIds={[]}
              fitById={fitById || undefined} rankById={rankById || undefined}
              paths={paths} height={664} fit="all" />
            {tripCaption && <p className="you-map-cap">{tripCaption}</p>}
          </div>
          <div className="you-top">
            <h2>Your top 3</h2>
            <TopThree api={api} rank={rank} notes={notes} weekMap={weekMap} routineWeek={modal.week} dusk={duskS}
              selected={shownHome} onSelect={select} />
          </div>
        </section>
      )}

      {week && decide && prefs && (
        <Details api={api} ranked={ranked} notes={notes} shownHome={shownHome} homeById={homeById} persona={persona}
          baseline={baseline} onClearBaseline={() => setBaseline(null)} onSelect={select}>
          {shownWeek && (
            <div className="dt-block">
              <h3>Trips from {homeById.get(shownHome)?.name}</h3>
              <TripExplainer api={api} home={homeById.get(shownHome)} week={shownWeek} routineWeek={modal.week}
                selectedIdx={tripIdx} onSelect={setSelTrip} dusk={duskS} legs={legs} />
            </div>
          )}
          {weekMap && (
            <div className="dt-block">
              <h3>Every home, your most likely week</h3>
              <HomeList homes={homes} weekMap={weekMap} routineWeek={modal.week} selected={shownHome}
                onSelect={select} sortKey={sortKey} setSortKey={setSortKey} cfg={cfg} />
            </div>
          )}
        </Details>
      )}

      {week && decide && prefs && (
        <section className="you-sec" aria-labelledby="you-to">
          <h2 id="you-to">Trade-offs</h2>
          <div className="you-whatif" role="group" aria-label="What if">
            <span className="you-who-l">What if</span>
            {lab && (
              <button type="button" className="chip" aria-pressed={labCentral} onClick={() => { snapshot(); setLabCentral((v) => !v); }}
                title={`${lab.label}, ${lab.days.map((d) => DAY_LABEL[d]).join(' ')} ${lab.start} to ${lab.end}`}>
                {lab.label} on Central
              </button>
            )}
            <span className="chip-group" role="group" aria-label="Daylight dates">
              {termKeys.map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={term === k} onClick={() => { snapshot(); setTerm(k); }}>
                  {k === 'lease' ? 'Whole lease' : TERM_CHOICES[k].label}
                </button>
              ))}
            </span>
            <span className="you-who-l">Bus change</span>
            <span className="chip-group" role="group" aria-label="Minimum time to change buses">
              {[0, 60, 180].map((v) => (
                <button key={v} type="button" className="chip" aria-pressed={changeS === v}
                  title={`Allow at least ${v / 60} min to change buses`}
                  onClick={() => { snapshot(); api.setConfig({ changeDefaultS: v === 60 ? undefined : v }); }}>
                  {v / 60} min
                </button>
              ))}
            </span>
          </div>
          <Tradeoff api={api} rank={rank} weekMap={weekMap} fitById={fitById} selected={shownHome} onSelect={select} />
        </section>
      )}

      {!prefs ? <NotBuilt module="prefs" what="learning what your time is worth from picks" /> : week && (
        <section className="you-sec" aria-labelledby="you-picks">
          <div className="you-sec-head">
            <h2 id="you-picks">Teach it what you care about</h2>
            <Button small variant="quiet" onClick={resetPicks}>Start over</Button>
          </div>
          {homeOptions && (
            <PickCard api={api} pair={pair} options={cands?.options || []} weekMap={weekMap} routineWeek={modal.week}
              nPicks={post?.nPicks ?? 0} stop={stopShown} canAuto={!!persona.theta} onAnswer={answer} onAuto={onAuto}
              onAutoAll={onAutoAll} last={last} busy={busy} personaName={persona.name} dusk={duskS} />
          )}
          {(post?.nPicks ?? 0) >= 1 && (
            <div className="you-learned">
              <Learned summary={summary} prior={post?.prior || {}} info={PARAM_INFO} truth={persona.theta} />
            </div>
          )}
        </section>
      )}

      <section className="you-sec" aria-labelledby="you-week">
        <div className="you-sec-head">
          <h2 id="you-week">Your week</h2>
          {editing && <Button small variant="quiet" onClick={() => setEditing(false)}>Done editing</Button>}
        </div>
        <WeekCalendar entries={effEntries} placeById={placeById} onEdit={() => setEditing(true)} />
        <CalendarDrop api={api} places={places} placeById={placeById} entries={entries} setEntries={setEntries} persona={persona} />
        {editing && (
          <WeekEditor entries={effEntries} setEntries={setEntries} places={places} placeById={placeById}
            lateId={lab?.id} movedId={labCentral ? lab?.id : null} />
        )}
      </section>
    </div>
  );
}
