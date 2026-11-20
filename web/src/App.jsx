// App frame: left rail (Me, Group, Operator, Evidence), top bar with the SAMPLE DATA label, attribution footer.
// Each view is `export default function XView({ api })`. Views other than Me are owned by ui-views and loaded
// through import.meta.glob, so a missing file shows a note instead of breaking the build.
import { Suspense, lazy, useEffect, useState } from 'react';
import { createEngine } from './engine/index.js';
import { Pill, Button, AssumptionsDrawer } from './components/index.js';
import MeView from './views/MeView.jsx';

const viewFiles = import.meta.glob('./views/*View.jsx');
const lazyView = (name) => {
  const key = `./views/${name}View.jsx`;
  return viewFiles[key] ? lazy(viewFiles[key]) : null;
};

const VIEWS = [
  { id: 'me', label: 'Me', blurb: 'One student, one week', Comp: MeView },
  { id: 'group', label: 'Group', blurb: 'A house, rooms and a fair split', Comp: lazyView('Group') },
  { id: 'operator', label: 'Operator', blurb: 'Per-room fair rents (SYNTHETIC)', Comp: lazyView('Operator') },
  { id: 'evidence', label: 'Evidence', blurb: 'How we checked the models', Comp: lazyView('Evidence') },
];

let enginePromise = null;
const progressListeners = new Set();
function getEngine() {
  if (!enginePromise) {
    enginePromise = createEngine({ onProgress: (msg, f) => progressListeners.forEach((fn) => fn(msg, f)) });
  }
  return enginePromise;
}

const viewFromHash = () => {
  const h = (window.location.hash || '').replace('#', '');
  return VIEWS.some((v) => v.id === h) ? h : 'me';
};

export default function App() {
  const [api, setApi] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ msg: 'Starting', f: 0 });
  const [view, setView] = useState(viewFromHash);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const fn = (msg, f) => setProgress({ msg, f });
    progressListeners.add(fn);
    getEngine().then((a) => { setApi(a); if (import.meta.env.DEV) window.__quorum = a; }).catch((e) => { console.error(e); setError(e); });
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => { progressListeners.delete(fn); window.removeEventListener('hashchange', onHash); };
  }, []);

  const go = (id) => { window.location.hash = id; setView(id); };
  const current = VIEWS.find((v) => v.id === view);
  const Comp = current?.Comp;

  return (
    <div className="frame">
      <header className="topbar">
        <span className="wordmark">Quorum</span>
        <span className="tagline">Choose where to live from the week you live. TheRide and U-M timetables, week of Nov 30 2026.</span>
        <span className="spacer" />
        <Pill tone="solid" title="Homes, rents and rooms are synthetic. Personas are fictional. Timetables, streets and places are real.">SAMPLE DATA</Pill>
        <Button small onClick={() => setDrawer(true)} disabled={!api}>Assumptions</Button>
      </header>
      <nav className="rail" aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v.id} aria-current={v.id === view ? 'page' : undefined} onClick={() => go(v.id)} title={v.blurb}>
            {v.label}
          </button>
        ))}
        <div className="railnote">
          Homes and rents: SYNTHETIC. People: FICTIONAL. Bus times, streets and places: real data.
        </div>
      </nav>
      <main className="main">
        {error && (
          <div className="note bad">
            The data did not load: {String(error.message || error)}. Serve the app from <code>web/</code> with
            {' '}<code>npm run dev</code>, or build it and run <code>node dist/serve.mjs</code>.
          </div>
        )}
        {!error && !api && (
          <div className="loading" role="status">
            <h2>Reading the timetables</h2>
            <p className="muted">{progress.msg}</p>
            <div className="bar"><div style={{ width: `${Math.round(progress.f * 100)}%` }} /></div>
          </div>
        )}
        {api && (api.data.placeholder.homes || api.data.placeholder.personas) && (
          <div className="note warn">
            PLACEHOLDER: {api.data.placeholder.homes ? 'homes.json ' : ''}{api.data.placeholder.personas ? 'personas.json ' : ''}
            not found in <code>web/public/data/</code>, so a small built-in SAMPLE set is shown.
          </div>
        )}
        {api && Comp && (
          <Suspense fallback={<p className="muted">Loading view</p>}>
            <Comp api={api} />
          </Suspense>
        )}
        {api && !Comp && (
          <div className="note warn" role="status">
            Not built yet: the {current.label} view (<code>web/src/views/{current.label}View.jsx</code>) is not in this build.
          </div>
        )}
      </main>
      <footer className="footer">
        <span>Transit scheduling, geographic, and real-time data provided by permission of AAATA/TheRide</span>
        <span>U-M bus schedules: U-M Logistics, Transportation and Parking</span>
        <span>Map data (c) OpenStreetMap contributors, ODbL</span>
        {api && <span className="muted">Loaded in {Math.round(api.timings.total)} ms</span>}
      </footer>
      {api && <AssumptionsDrawer api={api} open={drawer} onClose={() => setDrawer(false)} />}
    </div>
  );
}
