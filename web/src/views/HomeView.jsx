// Home: the pitch-style landing page in front of the app. Every number on it is computed here from the same
// engine the app uses, not typed in:
//   - the problem pair: Pitch slide 1 (views/pitch/data.js campusExample), North Campus at 2 PM and Central
//     Campus at 11:30 PM for the default sample home, on the real timetables;
//   - the proof pair: the sample student's resume (public/samples/sample_resume.pdf, FICTIONAL), read in this
//     browser like My profile reads it, ranked by student/rank.js computeRanking, before and after the one
//     line DEMO.md step 5 adds. The number is Broadway's share of possible weeks where it is best of all 30.
// Photo: Svetlana Kravtsova, Pexels License (credited in the footer line). Font: Instrument Serif, OFL.
import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { campusExample } from './pitch/data.js';
import { computeRanking } from '../student/rank.js';
import { fileText } from '../student/files.js';
import { readProfile, redactContact } from '../../../engine/profile.js';
import { applyEdits } from '../student/store.js';
import '@fontsource/ibm-plex-sans/latin-700.css';
import './home.css';

const go = (id) => { window.location.hash = id; };
const ADD_LINE = "Budget $950 a month. I don't like walking home alone at night."; // DEMO.md step 5, word for word
const PROOF_HOME = 'Broadway St house';

let fontP = null;
function loadSerif() {
  if (!fontP && typeof FontFace === 'function') {
    const f = new FontFace('Instrument Serif', `url(${new URL('./fonts/instrument-serif-latin-400-italic.woff2', document.baseURI)}) format('woff2')`, { style: 'italic', weight: '400' });
    fontP = f.load().then((ff) => document.fonts.add(ff)).catch(() => null);
  }
  return fontP;
}

// Fade each section in once as it scrolls into view. Reduced motion: shown at once (CSS also turns it off).
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const els = [...root.querySelectorAll('.hm-reveal')];
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver !== 'function') { els.forEach((e) => e.classList.add('in')); return undefined; }
    const io = new IntersectionObserver((list) => list.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: 0.15 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return ref;
}

function useProblem(api) {
  const [v, setV] = useState(null);
  useEffect(() => {
    try {
      const ex = campusExample(api);
      const north = ex.rows.find((r) => r.id === 'beyster')?.bus[0];
      const central = ex.rows.find((r) => r.id === 'ugli')?.bus[1];
      setV(Number.isFinite(north) && Number.isFinite(central) ? { north, central } : null);
    } catch { setV(null); }
  }, [api]);
  return v;
}

function useProof(api) {
  const [v, setV] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const b = await (await fetch('./samples/sample_resume.pdf')).blob();
        const text = redactContact(await fileText(new File([b], 'sample_resume.pdf', { type: 'application/pdf' })));
        const opts = { places: api.data.places, personas: api.data.personas };
        const home = api.data.homes.find((h) => h.name.startsWith(PROOF_HOME));
        const before = computeRanking(api, applyEdits(readProfile(text, opts), { off: [] }));
        const after = computeRanking(api, applyEdits(readProfile(`${text}\n\n${redactContact(ADD_LINE)}`, opts), { off: [] }));
        const a = before?.byId.get(home?.id)?.pBest, z = after?.byId.get(home?.id)?.pBest;
        if (live && Number.isFinite(a) && Number.isFinite(z)) {
          setV({ before: Math.round(a * 100), after: Math.round(z * 100), trips: after.trips, ms: after.ms });
        }
      } catch (e) { console.warn('home proof', e); }
    })();
    return () => { live = false; };
  }, [api]);
  return v;
}

const STEPS = [
  { icon: 'calendar', title: 'Add your week', text: 'Drop a resume or schedule.' },
  { icon: 'star', title: 'See your fit', text: 'Every home, checked on real buses.' },
  { icon: 'key', title: 'Book a tour', text: 'Pick a time. Send the email.' },
];

export default function HomeView({ api }) {
  const ref = useReveal();
  const problem = useProblem(api);
  const proof = useProof(api);
  useEffect(() => { loadSerif(); }, []);
  const n = (x) => (x == null ? '--' : x);

  return (
    <div className="hm" ref={ref}>
      <section className="hm-hero" aria-labelledby="hm-h1" style={{ backgroundImage: `url(${new URL('./img/hero-house.jpg', document.baseURI)})` }}>
        <div className="hm-hero-in">
          <p className="hm-label">Built for U-M students</p>
          <h1 id="hm-h1"><em>Finding an apartment</em><strong>should be effortless</strong></h1>
          <button type="button" className="hm-pill" onClick={() => go('profile')}>Find my home <span aria-hidden="true">-&gt;</span></button>
        </div>
      </section>

      <section className="hm-sec hm-problem hm-reveal" aria-labelledby="hm-q">
        <blockquote id="hm-q"><em>"10 minutes from campus."</em> Which campus? At 11 PM?</blockquote>
        <div className="hm-pair">
          <div><b>{n(problem?.north)}<small>min</small></b><span><Icon name="bus" size={16} label={null} />North at 2 PM</span></div>
          <div className="vs" aria-hidden="true">vs</div>
          <div><b>{n(problem?.central)}<small>min</small></b><span><Icon name="moon" size={16} label={null} />Central at 11:30 PM</span></div>
        </div>
        <p className="hm-note">Same sample listing. Real bus timetables.</p>
      </section>

      <section className="hm-sec hm-steps hm-reveal" aria-labelledby="hm-steps-h">
        <h2 id="hm-steps-h" className="hm-label">How it works</h2>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="hm-step-ic"><Icon name={s.icon} size={26} label={null} /></span>
              <span className="hm-step-n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="hm-sec hm-proof hm-reveal" aria-labelledby="hm-proof-h">
        <p className="hm-label">Sample student, best home</p>
        <p className="hm-big" aria-label={proof ? `${proof.before} percent to ${proof.after} percent` : 'Computing'}>
          {proof ? <>{proof.before}%<span className="arrow" aria-hidden="true">-&gt;</span><mark>{proof.after}%</mark></> : <span className="hm-wait">Computing...</span>}
        </p>
        <h2 id="hm-proof-h"><em>Change one thing.</em> The answer moves.</h2>
        <p className="hm-note">Weeks where {PROOF_HOME} wins, before and after a budget.</p>
      </section>

      <section className="hm-sec hm-know hm-reveal" aria-labelledby="hm-know-h">
        <h2 id="hm-know-h" className="hm-label">How we know</h2>
        <div className="hm-tiles">
          <div className="hm-tile"><Icon name="bus" size={22} label={null} /><b>Real timetables</b><span>TheRide and U-M buses, door to door.</span></div>
          <div className="hm-tile"><Icon name="clock" size={22} label={null} /><b>{proof ? `${(Math.round(proof.trips / 100) * 100).toLocaleString('en-US')} trips` : 'Routing...'}</b><span>{proof ? `Routed live in this browser, ${(proof.ms / 1000).toFixed(1)} s.` : 'Routed live in this browser.'}</span></div>
          <div className="hm-tile"><Icon name="check" size={22} label={null} /><b>Nothing uploaded</b><span>No AI. Your files stay here.</span></div>
        </div>
      </section>

      <section className="hm-cta hm-reveal" aria-labelledby="hm-cta-h">
        <h2 id="hm-cta-h"><em>See it work</em> in one click.</h2>
        <button type="button" className="hm-pill" onClick={() => go('profile?sample=1')}>Try it with a sample student <span aria-hidden="true">-&gt;</span></button>
      </section>

      <p className="hm-credit">Photo: Svetlana Kravtsova, Pexels. Homes and the student are samples.</p>
    </div>
  );
}
