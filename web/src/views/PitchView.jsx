// Pitch: seven slides inside the app, for the 5-minute presentation.
// Keys: Right, Down, PageDown or Space = next. Left, Up or PageUp = back. Home and End jump.
// F = full screen (Esc leaves it). N = presenter notes under the slide.
// Slides 1 and 2 compute their numbers live with the engine; slides 3 and 4 read web/public/data/evidence/*.json.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SLIDES } from './pitch/slides.jsx';
import { loadEvidence } from './pitch/data.js';
import { useConfigVersion } from '../engine/useConfig.js';
import './pitch/pitch.css';

const KEY = 'quorum.pitch.slide';
const readSlide = () => {
  try { const n = Number(sessionStorage.getItem(KEY)); return Number.isInteger(n) && n >= 0 && n < SLIDES.length ? n : 0; } catch { return 0; }
};
const typing = (el) => !!el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));

export default function PitchView({ api }) {
  useConfigVersion(api);
  const [i, setI] = useState(readSlide);
  const [notes, setNotes] = useState(false);
  const [ev, setEv] = useState(null);
  const deck = useRef(null);

  useEffect(() => { let live = true; loadEvidence().then((e) => live && setEv(e)); return () => { live = false; }; }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, String(i)); } catch { /* storage blocked: fine */ } }, [i]);

  const go = useCallback((n) => setI(Math.max(0, Math.min(SLIDES.length - 1, n))), []);
  const full = useCallback(() => {
    const el = deck.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const k = e.key;
      if (k === ' ' && e.target?.tagName === 'BUTTON') return; // let Space press the focused button only
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') { e.preventDefault(); setI((x) => Math.min(SLIDES.length - 1, x + 1)); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
      else if (k === 'Home') { e.preventDefault(); setI(0); }
      else if (k === 'End') { e.preventDefault(); setI(SLIDES.length - 1); }
      else if (k === 'f' || k === 'F') { e.preventDefault(); full(); }
      else if (k === 'n' || k === 'N') { e.preventDefault(); setNotes((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  const s = SLIDES[i];
  const Comp = s.Comp;
  return (
    <div className="pd" ref={deck} aria-roledescription="slide deck">
      <div className="pd-bar">
        <span className="pd-count">{i + 1} / {SLIDES.length}</span>
        <span className="pd-ticks" role="tablist" aria-label="Slides">
          {SLIDES.map((x, k) => (
            <button key={x.id} role="tab" aria-current={k === i ? 'step' : undefined} aria-label={`Slide ${k + 1}: ${x.title}`} onClick={() => go(k)} />
          ))}
        </span>
        <span className="pd-spacer" />
        <span className="pd-keys">F full screen, N notes</span>
        <button className="pd-nav" onClick={() => go(i - 1)} disabled={i === 0}>Back</button>
        <button className="pd-nav" onClick={() => go(i + 1)} disabled={i === SLIDES.length - 1}>Next</button>
      </div>
      <section className="pd-slide" aria-roledescription="slide" aria-label={`${i + 1} of ${SLIDES.length}: ${s.title}`} key={s.id}>
        <Comp api={api} ev={ev} />
      </section>
      {notes && (
        <aside className="pd-notes" aria-label="Presenter notes">
          <h4>Notes for slide {i + 1}: {s.title} (N hides them)</h4>
          <ul>{s.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>
        </aside>
      )}
    </div>
  );
}
