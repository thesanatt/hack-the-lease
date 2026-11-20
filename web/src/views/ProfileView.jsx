// My profile: blank until the student adds something. Two ways in: drop a file (resume, class schedule,
// calendar) or write anything. engine/profile.js reads it into a week, how they get around, a budget and what
// they care about; every item can be switched off or changed here, and the Saved and Browse tabs rank by it.
import { useEffect, useRef, useState } from 'react';
import { Button, Seg } from '../components/index.js';
import { useProfile, useSaved } from '../student/store.js';
import { fileText } from '../student/files.js';
import { go } from '../student/parts.jsx';
import WeekRows from '../student/WeekRows.jsx';
import Calendar from '../student/Calendar.jsx';
import TourPanel from '../student/TourPanel.jsx';
import { useTours, tourOptions } from '../student/tours.js';
import { splitHash } from '../hashParam.js';
import '../student/student.css';

// Three steps across the top. at: the step the student is on (4 = all done). Step 2 opens Saved, 3 a tour.
const STEPS = [['Add your week', 'profile'], ['See your fit', 'saved'], ['Book a tour', 'saved']];
function Steps({ at }) {
  return (
    <ol className="pf-steps" aria-label="Steps">
      {STEPS.map(([label, to], i) => {
        const n = i + 1, done = n < at, now = n === at;
        return (
          <li key={label} className={done ? 'done' : now ? 'now' : ''} aria-current={now ? 'step' : undefined}>
            <span className="n" aria-hidden="true">{done ? '✓' : n}</span>
            {done || now ? <button type="button" className="pf-step-go" onClick={() => go(to)}>{label}</button> : <span>{label}</span>}
            {done && <span className="sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}

const PLACEHOLDER = 'For example: I study nursing. Clinicals at University Hospital Tue and Thu 6:30am to 3pm. '
  + 'I study late at the UgLi, work at a cafe in Kerrytown on weekends for $15/hr, and I do not like walking home alone at night. '
  + 'Budget about $900 a month. My own bathroom would be nice.';

const LATE = [
  { value: 6, label: 'Short', title: 'Up to 6 minutes on foot after 10 PM' },
  { value: 12, label: 'Normal', title: 'Up to 12 minutes on foot after 10 PM' },
  { value: 20, label: 'Long is fine', title: 'Up to 20 minutes on foot after 10 PM' },
];

function useFileInput(onFiles) {
  const ref = useRef(null);
  const input = <input ref={ref} type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.ics,image/*,text/plain,application/pdf,text/calendar"
    onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />;
  return [input, () => ref.current?.click()];
}

export default function ProfileView({ api }) {
  const P = useProfile(api);
  const saved = useSaved();
  const T = useTours();
  const tourId = new URLSearchParams(splitHash(window.location.hash).query || '').get('tour');
  const tourHome = tourId ? api.data.homeById.get(tourId) : null;
  const [chosen, setChosen] = useState(null);
  const [opts, setOpts] = useState(null);
  const tourSig = JSON.stringify([tourId, P.profile?.entries?.map((e) => [e.id, e.days, e.start, e.end, e.place]), P.profile?.modes, T.list.map((t) => [t.homeId, t.day, t.start])]);
  useEffect(() => {
    if (!tourHome || !P.profile) { setOpts(null); return undefined; }
    const id = setTimeout(() => { try { setOpts(tourOptions(api, P.profile, tourHome, T.list)); } catch (e) { console.error(e); setOpts(null); } }, 20);
    return () => clearTimeout(id);
  }, [tourSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [over, setOver] = useState(false);

  const addFiles = async (files) => {
    for (const f of files) {
      setMsg({ text: `Reading ${f.name}...` });
      try {
        const t = await fileText(f, (x, what) => setMsg({ text: `${what || `Reading ${f.name}`}... ${Math.round((x || 0) * 100)}%` }));
        P.addSource('file', f.name, t);
        setMsg({ text: `Read ${f.name}.` });
      } catch (e) { setMsg({ text: String(e.message || e), bad: true }); }
    }
  };
  const [fileInput, pick] = useFileInput(addFiles);
  const addText = () => {
    const t = text.trim();
    if (!t) return;
    P.addSource('text', t.length > 48 ? `${t.slice(0, 45).trim()}...` : t, t);
    setText(''); setMsg(null);
  };
  const trySample = async () => {
    try {
      const r = await fetch('./samples/sample_resume.pdf');
      const b = await r.blob();
      await addFiles([new File([b], 'Sample resume (fictional student).pdf', { type: 'application/pdf' })]);
    } catch (e) { setMsg({ text: String(e.message || e), bad: true }); }
  };
  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); },
  };

  if (P.empty) {
    return (
      <div className="st">
        {fileInput}
        <div className="st-head">
          <div>
            <h1>My profile</h1>
            <p>Add your week. Quorum ranks homes for it.</p>
          </div>
        </div>
        <Steps at={1} />
        <div className="pf-start">
          <div className={`pf-drop${over ? ' over' : ''}`} {...dropProps}>
            <h2>Add a file</h2>
            <p className="st-sub">Resume, class schedule, screenshot or .ics.</p>
            <Button variant="primary" onClick={pick}>Choose a file</Button>
            <span className="st-sub">or drop it here</span>
          </div>
          <div className="st-card pf-write">
            <h2>Or write anything</h2>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER} aria-label="About you" />
            <div><Button variant="primary" onClick={addText} disabled={!text.trim()}>Add to my profile</Button></div>
          </div>
        </div>
        {msg && <p className={`pf-msg${msg.bad ? ' bad' : ''}`} style={{ marginTop: 12 }}>{msg.text}</p>}
        <div className="pf-privacy">
          <span>Read on this device. Nothing is uploaded. Emails and phone numbers are dropped.</span>
          <button type="button" className="textlink" onClick={trySample}>Try a sample student</button>
        </div>
      </div>
    );
  }

  const p = P.profile;
  const kept = P.state.sources.reduce((a, s) => ({ emails: a.emails + (s.dropped?.emails || 0), phones: a.phones + (s.dropped?.phones || 0) }), { emails: 0, phones: 0 });
  const { placeById } = api.data;
  const areaOf = (e) => placeById.get(e.place)?.area;
  const areas = {};
  for (const e of p.entries) areas[areaOf(e)] = (areas[areaOf(e)] || 0) + e.days.length;
  const mainArea = Object.entries(areas).sort((a, b) => b[1] - a[1])[0]?.[0];
  const moving = p.modes.bike ? 'by bike, bus and on foot' : 'by bus and on foot';

  return (
    <div className="st">
      {fileInput}
      <div className="st-head">
        <div>
          <h1>My profile</h1>
          <p>Change anything; homes re-rank.</p>
        </div>
        <div className="st-head-r">
          <Button variant="primary" onClick={() => go(saved.ids.length ? 'saved' : 'browse')}>
            {saved.ids.length ? `See my ${saved.ids.length} saved home${saved.ids.length > 1 ? 's' : ''}` : 'Browse homes'}
          </Button>
        </div>
      </div>
      <Steps at={T.list.length ? 4 : saved.ids.length ? 3 : 2} />

      <div className="pf-grid">
        <div className="st-stack">
          <div className="st-card">
            <p className="pf-summary">
              {p.program ? <>{p.program.label} student. </> : null}
              {mainArea ? <>Most of your week is on <b>{mainArea === 'Downtown' ? 'Downtown' : `${mainArea} Campus`}</b>. </> : null}
              You get around {moving}.{' '}
              {p.budget ? <>Budget <b>${p.budget.toLocaleString('en-US')}</b> a month.</> : 'No budget set.'}
            </p>
          </div>

          {tourHome && <TourPanel api={api} home={tourHome} profile={p} opts={opts} chosen={chosen} setChosen={setChosen} T={T} />}

          <div className="st-card pf-sec">
            <h2>My calendar <span className="st-sub">{tourHome ? 'Blue: open tour times. Click one.' : 'Booked tours show in blue.'}</span></h2>
            {p.entries.length || T.list.length ? (
              <Calendar entries={p.entries} placeById={placeById}
                tours={T.list.filter((t) => !(tourHome && chosen && t.homeId === tourHome.id))}
                options={tourHome && opts ? opts.options : []} chosen={chosen} onPick={(o) => setChosen(o.key)} />
            ) : <p className="st-sub">Your calendar fills in when you add classes or a schedule with days and times.</p>}
          </div>

          <WeekRows P={P} places={api.data.places} placeById={placeById} />

          <div className="st-card pf-sec">
            <h2>Getting around and money</h2>
            <div className="pf-set">
              <span>Bike</span>
              <Seg label="Bike" value={p.modes.bike} onChange={(v) => P.edit({ bike: v })}
                options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} />
              {p.modesWhy.bike && P.state.edits.bike == null && <span className="why">From: "{p.modesWhy.bike}"</span>}
              <span>Walking home late</span>
              <Seg label="Walking home after 10 PM" value={LATE.reduce((a, b) => (Math.abs(b.value - p.modes.maxLateWalkMin) < Math.abs(a.value - p.modes.maxLateWalkMin) ? b : a)).value}
                onChange={(v) => P.edit({ late: v })} options={LATE} />
              {p.modesWhy.late && P.state.edits.late == null && <span className="why">From: "{p.modesWhy.late}"</span>}
              <span>Monthly budget</span>
              <span className="pf-budget">$<input type="number" min="300" max="5000" step="25" value={p.budget ?? ''} placeholder="none"
                onChange={(e) => P.edit({ budget: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Monthly budget in dollars" /> a month</span>
              {p.budgetWhy && P.state.edits.budget === undefined && <span className="why">From: "{p.budgetWhy}"</span>}
              {p.wage ? <><span>Your time</span><span>About ${Math.round(p.wage / 2)} an hour, half of your ${p.wage}/hr pay</span></> : null}
            </div>
          </div>

          {(p.likes.length > 0 || p.notes.length > 0 || p.courses.length > 0 || p.links.length > 0) && (
            <div className="st-card pf-sec">
              <h2>Also noted</h2>
              <div className="st-stack" style={{ gap: 12 }}>
                {(p.likes.length > 0 || p.notes.length > 0) && (
                  <div className="pf-chips">
                    {p.likes.map((l) => <span key={l.key} className="st-pill mine" title={`From: "${l.why}"`}>{l.label}</span>)}
                    {p.notes.map((n) => <span key={n.key} className="st-pill typ" title={`From: "${n.why}"`}>{n.label}</span>)}
                  </div>
                )}
                {p.courses.length > 0 && <p className="st-sub">Courses: {p.courses.slice(0, 8).join(', ')}</p>}
                {p.links.length > 0 && <p className="st-sub">Links (kept, not opened): {p.links.map((l) => l.host).join(', ')}</p>}
              </div>
            </div>
          )}
        </div>

        <aside className="pf-side">
          <div className="st-card pf-add">
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Add more</h2>
            <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Add more about you"
              placeholder="Anything else: a job, where you study, your budget, links..." />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" small onClick={addText} disabled={!text.trim()}>Add</Button>
              <Button small onClick={pick}>Attach a file</Button>
            </div>
            {msg && <p className={`pf-msg${msg.bad ? ' bad' : ''}`}>{msg.text}</p>}
          </div>
          <div className="st-card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>What you added</h2>
            <ul className="pf-src">
              {P.state.sources.map((s) => (
                <li key={s.id}>
                  <span className="k">{s.kind === 'file' ? 'File' : 'Note'}</span>
                  <span className="nm" title={s.name}>{s.name}</span>
                  <button type="button" className="pf-x" onClick={() => P.removeSource(s.id)}>Remove</button>
                </li>
              ))}
            </ul>
            <p className="st-sub" style={{ marginTop: 10 }}>
              Kept only in this browser.{kept.emails + kept.phones > 0 ? ` Dropped ${[kept.emails && `${kept.emails} email${kept.emails > 1 ? 's' : ''}`, kept.phones && `${kept.phones} phone number${kept.phones > 1 ? 's' : ''}`].filter(Boolean).join(' and ')}.` : ''}
            </p>
            <button type="button" className="textlink" style={{ marginTop: 8 }} onClick={() => { P.clear(); setMsg(null); }}>Clear my profile</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
