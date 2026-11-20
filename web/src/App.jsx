// App frame: left rail (Me, Group, Operator, Evidence, Pitch), top bar with the SAMPLE DATA label, a one-line
// "how to read this page" guide above each view (not on Pitch), attribution footer.
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
  { id: 'me', label: 'Me', blurb: 'One student, one week', Comp: MeView,
    guide: 'Your week, then the homes it runs through, then a few picks. The ranking puts the lowest regret first.' },
  { id: 'group', label: 'Group', blurb: 'One house, a fair split', Comp: lazyView('Group'),
    guide: 'Read the house ranking, then the split. Caps stay private. At the split prices nobody would swap rooms.' },
  { id: 'operator', label: 'Operator', blurb: 'Fair rent per room', Comp: lazyView('Operator'),
    guide: 'Each row is a home: how many SYNTHETIC students it fits, and which room rent is furthest from fair.' },
  { id: 'evidence', label: 'Evidence', blurb: 'How we checked it', Comp: lazyView('Evidence'),
    guide: 'Each block is one test: what it was checked against and the result from its file. A test not run says so.' },
  { id: 'pitch', label: 'Pitch', blurb: 'Five-minute slides', Comp: lazyView('Pitch'), guide: null },
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
    const onHash = () => { setView(viewFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => { progressListeners.delete(fn); window.removeEventListener('hashchange', onHash); };
  }, []);

  const go = (id) => { window.location.hash = id; setView(id); window.scrollTo(0, 0); };
  const current = VIEWS.find((v) => v.id === view);
  const Comp = current?.Comp;

  return (
    <div className="frame">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to the page</a>
      <header className="topbar">
        <span className="wordmark">Quorum</span>
        <span className="tagline">Choose where to live from the week you live.</span>
        <span className="spacer" />
        <span className="topmeta" title="Every trip is routed on these timetables and on OpenStreetMap streets.">
          <span className="caps">Timetables</span> TheRide and U-M, week of Nov 30 2026
        </span>
        <Pill tone="solid" title="Homes, rents and rooms are synthetic. Personas are fictional. Timetables, streets and places are real.">SAMPLE DATA</Pill>
        <Button small onClick={() => setDrawer(true)} disabled={!api} title="Every constant the model uses, editable">Assumptions</Button>
      </header>
      <nav className="rail" aria-label="Views">
        {VIEWS.map((v, k) => (
          <button key={v.id} aria-current={v.id === view ? 'page' : undefined} onClick={() => go(v.id)} title={v.blurb}>
            <span className="rail-num" aria-hidden="true">{String(k + 1).padStart(2, '0')}</span>
            <span className="rail-label">{v.label}</span>
            <span className="rail-blurb">{v.blurb}</span>
          </button>
        ))}
        <div className="railnote">
          Homes and rents: SYNTHETIC. People: FICTIONAL. Bus times, streets and places: real data.
        </div>
      </nav>
      <main className="main" id="main" tabIndex={-1}>
        {api && current?.guide && (
          <p className="viewguide" key={current.id}>
            <span className="viewguide-folio" aria-hidden="true">{String(VIEWS.indexOf(current) + 1).padStart(2, '0')} {current.label}</span>
            <span className="viewguide-label">How to read this page</span>
            <span className="viewguide-text">{current.guide}</span>
          </p>
        )}
        {error && (
          <div className="note bad">
            The data did not load: {String(error.message || error)}. Serve the app from <code>web/</code> with
            {' '}<code>npm run dev</code>, or build it and run <code>node dist/serve.mjs</code>.
          </div>
        )}
        {!error && !api && (
          <div className="loading" role="status" aria-live="polite">
            <span className="caps muted">Loading, in this browser, offline</span>
            <h2>Reading the timetables</h2>
            <div className="bar" aria-hidden="true"><div style={{ width: `${Math.round(progress.f * 100)}%` }} /></div>
            <p className="loading-step"><span className="mono">{String(Math.round(progress.f * 100)).padStart(3, ' ')}%</span> {progress.msg}</p>
            <p className="small muted">
              TheRide and U-M bus timetables, OpenStreetMap streets and places, then the SYNTHETIC homes. Nothing is
              sent anywhere.
            </p>
          </div>
        )}
        {api && (api.data.placeholder.homes || api.data.placeholder.personas) && (
          <div className="note warn">
            PLACEHOLDER: {api.data.placeholder.homes ? 'homes.json ' : ''}{api.data.placeholder.personas ? 'personas.json ' : ''}
            not found in <code>web/public/data/</code>, so a small built-in SAMPLE set is shown.
          </div>
        )}
        {api && Comp && (
          <Suspense fallback={<div className="empty" role="status"><span className="caps">Loading</span> Opening the {current.label} view.</div>}>
            <Comp api={api} />
          </Suspense>
        )}
        {api && !Comp && (
          <div className="empty warn" role="status">
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
