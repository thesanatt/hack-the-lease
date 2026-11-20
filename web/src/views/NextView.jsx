// Next semester (hash #next): a student signs a lease before next semester's schedule exists. From a class
// catalog (a labeled sample, or the student's own Registrar file read in this browser) we draw the weeks they
// could end up with, route each one through every home, and show what not knowing costs, the home that loses
// least, and the one thing worth finding out first. docs/NEXT_YEAR.md and docs/LISTINGS.md are the contract.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapView, NotBuilt } from '../components/index.js';
import { useConfigVersion } from '../engine/useConfig.js';
import { runNextYear, loadNextYearSample, NEXT_DEFAULT_PLAN } from './next/compute.js';
import { speedLine } from './next/format.js';
import Controls from './next/Controls.jsx';
import Hero from './next/Hero.jsx';
import Unknowns from './next/Unknowns.jsx';
import Weeks from './next/Weeks.jsx';
import Details from './next/Details.jsx';
import '../views/me/verdict/you.css';
import './next/next.css';

const K = 200;
const SEED = 1;

export default function NextView({ api }) {
  const version = useConfigVersion(api);
  const cat = api.mod('catalog');
  const ready = !!(cat && api.has('week') && api.has('decide') && api.has('prefs'));

  const [sample, setSample] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [file, setFile] = useState(null);           // { name, parsed }
  const [source, setSource] = useState('sample');   // 'sample' | 'file'
  const [planId, setPlanId] = useState(null);
  const [priority, setPriority] = useState('normal');
  const [odds, setOdds] = useState({});             // applied odds by maybe id
  const [settled, setSettled] = useState({});
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(null);           // { f, msg } while computing
  const [error, setError] = useState(null);
  const [selHome, setSelHome] = useState(null);
  const token = useRef(0);

  useEffect(() => {
    if (!ready) return;
    loadNextYearSample(api).then((s) => {
      setSample(s);
      setPlanId((id) => id || (s.plans.find((p) => p.id === NEXT_DEFAULT_PLAN) || s.plans[0])?.id || null);
    }).catch((e) => { console.error(e); setLoadError(String(e.message || e)); });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = sample?.plans.find((p) => p.id === planId) || sample?.plans[0] || null;
  const sections = source === 'file' && file ? file.parsed.sections : sample?.parsed.sections;

  // a new plan or catalog starts with nothing settled and the plan's own odds
  const keepEmpty = (o) => (Object.keys(o).length ? {} : o);
  const fresh = () => { setSettled(keepEmpty); setOdds(keepEmpty); setSelHome(null); };
  const choosePlan = (id) => { if (id !== planId) { fresh(); setPlanId(id); } };
  const chooseSource = (s) => { if (s !== source) { fresh(); setSource(s); } };

  useEffect(() => {
    if (!ready || !plan || !sections) return undefined;
    const my = ++token.current;
    setError(null);
    // only show progress when the routing is slow enough to notice
    const slow = setTimeout(() => { if (token.current === my) setBusy((b) => b || { f: 0, msg: 'Working' }); }, 120);
    runNextYear(api, {
      plan, sections, k: K, seed: SEED, priority, odds, settled,
      onProgress: (f, msg) => { if (token.current === my) setBusy({ f, msg }); },
    }).then((r) => {
      if (token.current !== my) return;
      setRes(r); setBusy(null);
    }).catch((e) => {
      if (token.current !== my) return;
      console.error(e); setError(String(e.message || e)); setBusy(null);
    }).finally(() => clearTimeout(slow));
    return () => clearTimeout(slow);
  }, [ready, plan, sections, priority, odds, settled, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const rank = res?.rank?.length ? res.rank : null;
  const fitById = useMemo(() => {
    if (!rank) return null;
    const n = rank.length;
    return Object.fromEntries(rank.map((r, i) => [r.homeId, n > 1 ? (4 - Math.min(4, Math.floor((i / n) * 5))) / 4 : 1]));
  }, [rank]);
  const rankById = useMemo(() => (rank ? Object.fromEntries(rank.slice(0, 3).map((r, i) => [r.homeId, i + 1])) : null), [rank]);
  const mapHomes = useMemo(() => api.data.homes.map((h) => ({ ...h, short: h.name.split(' ').slice(0, 2).join(' ') })), [api]);
  const mapPlaces = useMemo(() => {
    if (!res?.scenarios) return [];
    const ids = new Set();
    for (const s of res.scenarios) for (const e of s.week || []) ids.add(e.place);
    return api.data.places.filter((p) => ids.has(p.id));
  }, [res, api]);

  if (!cat) return <NotBuilt module="catalog" what="next semester's possible weeks from a class catalog" />;
  if (!ready) return <NotBuilt module="week" what="routing next semester's possible weeks" />;
  if (loadError) return <div className="note warn" role="status">The sample catalog did not load: {loadError}</div>;

  const onFile = (name, text) => {
    try {
      const parsed = cat.parseCatalogCSV(text, api.data.places);
      fresh();
      setFile({ name, parsed });
      setSource('file');
    } catch (e) {
      console.error(e);
      setFile({ name, parsed: null, error: String(e.message || e) });
    }
  };
  const settle = (fid, oid) => setSettled((s) => ({ ...s, [fid]: oid }));
  const unsettle = (fid) => setSettled((s) => { const n = { ...s }; delete n[fid]; return n; });
  const speed = speedLine(res?.routing);
  const shown = selHome && res?.homeById?.has(selHome) ? selHome : res?.safest?.homeId;

  return (
    <div className="you nx">
      <Controls
        plans={sample?.plans || []} planId={plan?.id} setPlanId={choosePlan}
        source={source} setSource={chooseSource} file={file} onFile={onFile}
        maybes={plan?.maybes || []} odds={odds} setOdds={setOdds}
        priority={priority} setPriority={setPriority}
      />

      {error && <div className="note bad" role="status">{error}</div>}

      <section className={`nx-hero${busy ? ' is-busy' : ''}`} aria-label="What not knowing costs">
        <div className="nx-progress" aria-hidden={!busy} role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={busy ? Math.round(busy.f * 100) : 100} aria-label="Computing">
          {busy && <div style={{ width: `${Math.max(4, Math.round(busy.f * 100))}%` }} />}
        </div>
        <Hero res={res} busy={busy} />
        <div className="nx-mapcol">
          <div className="nx-map">
            <MapView homes={mapHomes} places={mapPlaces} selectedHomeId={shown} onHomeClick={setSelHome} labelIds={[]}
              fitById={fitById || undefined} rankById={rankById || undefined} height={440} fit="all" />
          </div>
          {speed && <p className="nx-speed">{speed}</p>}
        </div>
      </section>

      {res && !res.empty && (
        <Unknowns res={res} settled={settled} onSettle={settle} onUnsettle={unsettle} />
      )}
      {res?.empty && (
        <div className="note warn" role="status">
          No possible week matches what you settled.
          {' '}<button type="button" className="btn quiet small" onClick={() => setSettled({})}>Clear</button>
        </div>
      )}

      {res && !res.empty && <Weeks res={res} selected={shown} onSelect={setSelHome} />}

      {res && !res.empty && (
        <Details res={res} source={source} file={file} sample={sample} k={K} seed={SEED} />
      )}
    </div>
  );
}
