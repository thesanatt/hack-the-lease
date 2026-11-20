// Me mode: one student's real week through every candidate home on the real timetables, about six pairwise
// picks to learn what time and room features are worth, then a ranking across the fall weeks they might have.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Pill, Button, Seg, Stat, MapView, NotBuilt } from '../components/index.js';
import { useConfigVersion } from '../engine/useConfig.js';
import { rng } from '../../../engine/rng.js';
import { PARAM_INFO, utility } from '../../../engine/model.js';
import WeekEditor from './me/WeekEditor.jsx';
import HomeList from './me/HomeList.jsx';
import TripExplainer, { tripLegs, tripPaths } from './me/TripExplainer.jsx';
import PickCard from './me/PickCard.jsx';
import Learned from './me/Learned.jsx';
import Ranking from './me/Ranking.jsx';
import { editableWeek, modalRoutine, uncertainRoutine, lateEntry, moveToCentral, TERM_CHOICES, autoAnswer, DAY_LABEL } from './me/routine.js';
import { money, hm } from './me/format.js';

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

  const topPBest = useMemo(() => {
    if (!prefs?.pBestHomes || !post || !homeOptions) return null;
    return Math.max(...prefs.pBestHomes(post, homeOptions).map((x) => x.pBest));
  }, [homeOptions, pickVersion]); // eslint-disable-line react-hooks/exhaustive-deps
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
        const mean = prefs.posteriorMean ? prefs.posteriorMean(post) : null;
        const be = [];
        if (rank.length >= 2 && mean && decide.breakEven) {
          const [a, b] = rank;
          const arg = (r) => ({ home: homeById.get(r.homeId), weeks: weeksByScenario.map((m) => m.get(r.homeId)) });
          for (const param of ['vTime', 'vDark']) {
            try { be.push({ ...decide.breakEven(arg(a), arg(b), param, mean, cfg), A: a.homeId, B: b.homeId }); } catch (e) { console.warn(e); }
          }
        }
        const t2 = performance.now();
        setRanked({ rank, ev, be, mean, scenMs: t1 - t0, rankMs: t2 - t1, nScen: scen.length, nDraws: thetas.length });
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

  const routeNames = useMemo(() => [...new Set(trip?.rides?.map((r) => r.route) || [])], [trip]);
  const mapPlaces = useMemo(() => {
    const ids = new Set(effEntries.filter((e) => e.on !== false).map((e) => e.place));
    return places.filter((p) => ids.has(p.id));
  }, [effEntries, places]);
  const mapHomes = useMemo(() => homes.map((h) => ({ ...h, short: h.name.split(' ').slice(0, 2).join(' ') })), [homes]);

  if (!persona) return <div className="note warn">No personas are loaded.</div>;

  return (
    <div>
      <Panel title="Me" kicker="One student. Pick a persona, edit the week, answer a few picks, read the ranking."
        aside={<Pill tone="muted">SAMPLE</Pill>}>
        <p className="small muted">{api.data.homesLabel} {api.data.personasLabel}</p>
        <div className="row-flex" style={{ marginBottom: 8 }}>
          {personas.map((p) => (
            <Button key={p.id} pressed={p.id === personaId} onClick={() => setPersonaId(p.id)} title={p.program}>
              {p.name}
            </Button>
          ))}
        </div>
        <div className="stats">
          <Stat label="Persona" value={persona.name} note={persona.program} />
          <Stat label="Private rent cap" value={persona.cap ? money(persona.cap) : '--'} unit="/mo" />
          <Stat label="Bike" value={persona.modes?.bike ? 'yes' : 'no'} />
          <Stat label="Longest walk" value={persona.modes?.maxWalkMin ?? '--'} unit="min" note={`${persona.modes?.maxLateWalkMin ?? '--'} min after ${persona.modes?.lateHour ?? '--'}`} />
          <Stat label="Homes" value={homes.length} />
        </div>
      </Panel>

      <div className="grid-me">
        <Panel title="Your week" kicker="Toggle an entry, change its place, add a job">
          <WeekEditor entries={effEntries} setEntries={setEntries} places={places} placeById={placeById}
            lateId={lab?.id} movedId={labCentral ? lab?.id : null} />
        </Panel>
        <Panel title="Map" kicker={trip ? `${DAY_LABEL[trip.day]} ${trip.time}${routeNames.length ? `, routes ${routeNames.join(', ')}` : ''}` : 'Homes and your places'}>
          <MapView homes={mapHomes} places={mapPlaces} selectedHomeId={shownHome} onHomeClick={(id) => { setSelHome(id); setSelTrip(null); }}
            labelIds={ranked?.rank ? ranked.rank.slice(0, 6).map((r) => r.homeId) : homes.slice(0, 6).map((h) => h.id)}
            paths={paths} height={360} fit={paths.length ? 'paths' : 'all'} />
          <p className="small muted" style={{ marginTop: 4 }}>Bus legs are drawn stop to stop in the route color; walks are dashed.</p>
        </Panel>
      </div>

      {!week ? <NotBuilt module="week" what="running the week through each home" /> : (
        <div className="grid-me">
          <Panel title="Homes" kicker={weekMap ? `${homes.length} homes, most likely week, ${Math.round(weekMs)} ms` : ''}>
            {weekMap ? (
              <HomeList homes={homes} weekMap={weekMap} routineWeek={modal.week} selected={shownHome}
                onSelect={(id) => { setSelHome(id); setSelTrip(null); }} sortKey={sortKey} setSortKey={setSortKey} cfg={cfg} />
            ) : <div className="note bad">The week could not be evaluated. See the console.</div>}
          </Panel>
          <div className="sticky">
            <Panel title={homeById.get(shownHome)?.name || 'Home'} kicker="This week from here, trip by trip">
              {shownWeek && (
                <>
                  <div className="stats">
                    <Stat label="Door to door" value={hm(shownWeek.weeklyMin)} unit="/wk" />
                    <Stat label="Walking" value={Math.round(shownWeek.walkMin)} unit="min" />
                    <Stat label="Waiting" value={Math.round(shownWeek.waitMin)} unit="min" />
                    <Stat label="No ride" value={shownWeek.stranded.length} tone={shownWeek.stranded.length ? 'bad' : ''} />
                  </div>
                  <TripExplainer api={api} home={homeById.get(shownHome)} week={shownWeek} routineWeek={modal.week}
                    selectedIdx={tripIdx} onSelect={setSelTrip} dusk={duskS} legs={legs} />
                </>
              )}
            </Panel>
          </div>
        </div>
      )}

      {!prefs ? <NotBuilt module="prefs" what="learning what your time is worth from picks" /> : week && (
        <div className="grid-me">
          <Panel title="Which week would you rather live?" kicker={`question chosen in ${Math.round(pairMs)} ms`}
            aside={<Button small variant="quiet" onClick={resetPicks}>Start over</Button>}>
            {homeOptions && (
              <PickCard api={api} pair={pair} options={cands?.options || []} weekMap={weekMap} routineWeek={modal.week}
                nPicks={post?.nPicks ?? 0} stop={stop} canAuto={!!persona.theta} onAnswer={answer} onAuto={onAuto}
                onAutoAll={onAutoAll} last={last} busy={busy} />
            )}
          </Panel>
          <Panel title="What the picks say" kicker="80% intervals, dollars">
            <Learned summary={summary} prior={post?.prior || {}} info={PARAM_INFO} truth={persona.theta} />
          </Panel>
        </div>
      )}

      {!decide ? <NotBuilt module="decide" what="the ranking across possible fall weeks" /> : week && prefs && (
        <Panel title="Ranking" kicker={ranked?.rank ? `${homes.length} homes x ${ranked.nScen} possible fall weeks x ${ranked.nDraws} preference draws: weeks ${Math.round(ranked.scenMs)} ms, ranking ${Math.round(ranked.rankMs)} ms` : 'Computing'}
          aside={baseline && <Button small variant="quiet" onClick={() => setBaseline(null)}>Clear comparison</Button>}>
          <div className="row-flex" style={{ marginBottom: 10 }}>
            <span className="caps">What if</span>
            {lab ? (
              <Button small pressed={labCentral} onClick={() => { snapshot(); setLabCentral((v) => !v); }}
                title={`${lab.label}, ${lab.days.map((d) => DAY_LABEL[d]).join(' ')} ${lab.start} to ${lab.end}`}>
                {labCentral ? `${lab.label} moved to Central` : `Move ${lab.label.toLowerCase()} to Central`}
              </Button>
            ) : <span className="small muted">No evening entry to move.</span>}
            <span className="small muted">Daylight</span>
            <Seg value={term} onChange={(v) => { snapshot(); setTerm(v); }} label="Daylight dates"
              options={Object.entries(TERM_CHOICES).map(([k, t]) => ({ value: k, label: t.label }))} />
            <span className="small muted">Change time</span>
            <Seg value={changeS} onChange={(v) => { snapshot(); api.setConfig({ changeDefaultS: v === 60 ? undefined : v }); }} label="Minimum change time"
              options={[0, 60, 180].map((s) => ({ value: s, label: `${s} s` }))} />
          </div>
          {ranked?.error && <div className="note bad">The ranking failed: {ranked.error}</div>}
          {ranked?.rank && (
            <>
              <Ranking api={api} rank={ranked.rank} baseline={baseline} selected={shownHome} onSelect={(id) => { setSelHome(id); setSelTrip(null); }} />
              <div className="grid2" style={{ marginTop: 12 }}>
                <div>
                  <h3>Value of knowing your schedule</h3>
                  {ranked.ev != null && (ranked.ev >= 1 ? (
                    <p>Knowing which fall week you get before you sign is worth about <strong className="mono">{money(ranked.ev)}</strong> per month to you. If finding out costs less than that, find out before you sign.</p>
                  ) : (
                    <p>Your choice does not depend on which fall week you get (under {money(1)} per month).</p>
                  ))}
                  <p className="small muted">Expected value of perfect information over the {ranked.nScen} sampled weeks, in dollars per month.</p>
                </div>
                <div>
                  <h3>Break-even</h3>
                  {ranked.be.map((b) => {
                    const nm = (k) => homeById.get(k === 'A' ? b.A : b.B)?.name;
                    const what = b.param === 'vTime' ? 'your time is worth' : 'an hour walking after dark costs you';
                    if (b.value != null && b.value > 300) {
                      return <p key={b.param} className="small muted">{nm(b.belowWins)} stays ahead unless {what} more than $300 per hour, far above your estimate of {money(b.current, 1)}.</p>;
                    }
                    return b.value != null ? (
                      <p key={b.param}>
                        {nm(b.aboveWins)} wins if {what} more than <strong className="mono">{money(b.value)}</strong> per hour; below
                        that, {nm(b.belowWins)}. Current estimate {money(b.current, 1)}.
                      </p>
                    ) : (
                      <p key={b.param} className="small muted">{b.param === 'vTime' ? 'Value of time' : 'Darkness'}: no break-even between the top two ({b.reason}).</p>
                    );
                  })}
                  <p className="small muted">Top two homes, other weights at the posterior mean.</p>
                </div>
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
