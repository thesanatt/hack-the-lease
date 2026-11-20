// App frame: one top bar (wordmark, five tabs, the Sample data chip, a quiet Assumptions link), the view, and
// the attribution footer. No rail, no per-view preamble: each view leads with its own picture.
// Each view is `export default function XView({ api })`. Views other than Me are loaded through
// import.meta.glob, so a missing file shows a note instead of breaking the build.
import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { loadSerif } from './fonts.js';
import { createEngine } from './engine/index.js';
import { AssumptionsDrawer } from './components/index.js';
import MeView from './views/MeView.jsx';
import { splitHash } from './hashParam.js';

const viewFiles = import.meta.glob('./views/*View.jsx');
const lazyView = (name) => {
  const key = `./views/${name}View.jsx`;
  return viewFiles[key] ? lazy(viewFiles[key]) : null;
};

// Hash routes stay #me, #group, #operator, #evidence, #pitch. "Next semester" keeps #next (it was "Next year").
const VIEWS = [
  { id: 'home', label: 'Home', file: 'Home', Comp: lazyView('Home') },
  { id: 'profile', label: 'My profile', file: 'Profile', Comp: lazyView('Profile') },
  { id: 'browse', label: 'Browse', file: 'Browse', Comp: lazyView('Browse') },
  { id: 'saved', label: 'Saved', file: 'Saved', Comp: lazyView('Saved') },
  { id: 'roommate', label: 'Roommates', file: 'Roommate', Comp: lazyView('Roommate') },
  // In the top bar's More menu; their hash links (#next, #evidence, #pitch) work as before.
  { id: 'next', label: 'Next semester', file: 'Next', Comp: lazyView('Next'), more: true },
  { id: 'evidence', label: 'How we know', file: 'Evidence', Comp: lazyView('Evidence'), more: true },
  { id: 'pitch', label: 'Pitch', file: 'Pitch', Comp: lazyView('Pitch'), more: true },
  // The fair rent split: the next step from Roommates ("Split the rent fairly"), open by #group.
  { id: 'group', label: 'Your group', file: 'Group', Comp: lazyView('Group'), hidden: true },
  // Off the top bar, still reachable by link for Q&A: the full You view, the post paster, the owners view.
  { id: 'me', label: 'You (detail)', file: 'Me', Comp: MeView, hidden: true },
  { id: 'listings', label: 'Paste a post', file: 'Listings', Comp: lazyView('Listings'), hidden: true },
  { id: 'operator', label: 'Owners', file: 'Operator', Comp: lazyView('Operator'), hidden: true },
];

// One view failing to load or render must not blank the whole app: the top bar stays and says what broke.
class ViewBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty bad" role="status">
        <span className="empty-label">{this.props.label} did not open</span>
        <span>{String(this.state.error.message || this.state.error)}</span>
      </div>
    );
  }
}

let enginePromise = null;
const progressListeners = new Set();
function getEngine() {
  if (!enginePromise) {
    enginePromise = createEngine({ onProgress: (msg, f) => progressListeners.forEach((fn) => fn(msg, f)) });
  }
  return enginePromise;
}

// The part before "?" picks the view; deep links like #me?who=maya keep their query for the view to read.
const viewFromHash = () => {
  const { view } = splitHash(window.location.hash);
  return VIEWS.some((v) => v.id === view) ? view : 'home';
};
const queryFromHash = () => splitHash(window.location.hash).query;

// "More": the views off the main four, plus Assumptions. A button that opens a small list of links;
// Esc closes it and returns focus to the button, a click outside closes it. The button is underlined when
// the current view is one of its items.
function MoreMenu({ view, go, onAssumptions, assumptionsOn }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null), box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);
  const items = VIEWS.filter((v) => v.more);
  const inMore = items.some((v) => v.id === view);
  return (
    <div className="more" ref={box}>
      <button type="button" ref={btn} className={`tab more-btn${inMore ? ' on' : ''}`} aria-haspopup="true" aria-expanded={open}
        aria-controls="more-list" onClick={() => setOpen((o) => !o)}>
        More<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <ul id="more-list" className="more-list" aria-label="More views">
          {items.map((v) => (
            <li key={v.id}>
              <a href={`#${v.id}`} aria-current={v.id === view ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); setOpen(false); go(v.id); }}>{v.label}</a>
            </li>
          ))}
          <li className="more-sep"><button type="button" disabled={!assumptionsOn} onClick={() => { setOpen(false); onAssumptions(); }}>Assumptions</button></li>
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const [api, setApi] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ msg: 'Starting', f: 0 });
  const [view, setView] = useState(viewFromHash);
  const [query, setQuery] = useState(queryFromHash);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { loadSerif(); }, []);
  useEffect(() => {
    const fn = (msg, f) => setProgress({ msg, f });
    progressListeners.add(fn);
    getEngine().then((a) => { setApi(a); if (import.meta.env.DEV) window.__quorum = a; }).catch((e) => { console.error(e); setError(e); });
    const onHash = () => { setView(viewFromHash()); setQuery(queryFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => { progressListeners.delete(fn); window.removeEventListener('hashchange', onHash); };
  }, []);

  const go = (id) => { window.location.hash = id; setView(id); setQuery(''); window.scrollTo(0, 0); };
  const current = VIEWS.find((v) => v.id === view);
  const Comp = current?.Comp;

  return (
    <div className={`frame view-${view}`}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to the page</a>
      <header className="topbar">
        <a className="wordmark" href="#home" onClick={(e) => { e.preventDefault(); go('home'); }}>Quorum</a>
        <nav className="tabs" aria-label="Views">
          {VIEWS.filter((v) => !v.more && (!v.hidden || v.id === view)).map((v) => (
            <a key={v.id} href={`#${v.id}`} className="tab" aria-current={v.id === view ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); go(v.id); }}>
              {v.label}
            </a>
          ))}
        </nav>
        <span className="spacer" />
        <span className="chip-sample" title="Homes, rents and rooms are made up. People are fictional. Bus timetables, streets and places are real.">
          Sample data
        </span>
        <MoreMenu view={view} go={go} onAssumptions={() => setDrawer(true)} assumptionsOn={!!api} />
      </header>
      <main className="main" id="main" tabIndex={-1}>
        {error && (
          <div className="note bad">
            The data did not load: {String(error.message || error)}. Serve the app from <code>web/</code> with
            {' '}<code>npm run dev</code>, or build it and run <code>node dist/serve.mjs</code>.
          </div>
        )}
        {!error && !api && (
          <div className="loading" role="status" aria-live="polite">
            <h2>Reading the timetables</h2>
            <div className="bar" aria-hidden="true"><div style={{ width: `${Math.round(progress.f * 100)}%` }} /></div>
            <p className="loading-step">{Math.round(progress.f * 100)}% <span className="muted">{progress.msg}</span></p>
          </div>
        )}
        {api && (api.data.placeholder.homes || api.data.placeholder.personas) && (
          <div className="note warn">
            {api.data.placeholder.homes ? 'homes.json ' : ''}{api.data.placeholder.personas ? 'personas.json ' : ''}
            not found in <code>web/public/data/</code>, so a small built-in set is shown.
          </div>
        )}
        {api && Comp && (
          <ViewBoundary key={`${view}?${query}`} label={current.label}>
            <Suspense fallback={<div className="empty" role="status">Opening {current.label}</div>}>
              <Comp api={api} />
            </Suspense>
          </ViewBoundary>
        )}
        {api && !Comp && (
          <div className="empty warn" role="status">
            {current.label} is not in this build (<code>web/src/views/{current.file}View.jsx</code>).
          </div>
        )}
      </main>
      <footer className="footer">
        <span>Transit scheduling, geographic, and real-time data provided by permission of AAATA/TheRide</span>
        <span>U-M bus schedules: U-M Logistics, Transportation and Parking</span>
        <span>Map data (c) OpenStreetMap contributors, ODbL</span>
      </footer>
      {api && <AssumptionsDrawer api={api} open={drawer} onClose={() => setDrawer(false)} />}
    </div>
  );
}
