// My profile: blank until the student adds something. Two ways in: drop a file (resume, class schedule,
// calendar) or write anything. engine/profile.js reads it into a week, how they get around, a budget and what
// they care about; every item can be switched off or changed here, and the Saved and Browse tabs rank by it.
import { useEffect, useRef, useState } from 'react';
import { Button, Seg } from '../components/index.js';
import { useProfile, useSaved } from '../student/store.js';
import { fileText } from '../student/files.js';
import { go } from '../student/parts.jsx';
import WeekRows from '../student/WeekRows.jsx';
import { useConsent, forgetConsent } from '../student/Consent.jsx';
import AssistantBox from '../student/AssistantBox.jsx';
import { assistantStatus, lastStatus } from '../student/assistant.js';
import { applyAssistant } from '../student/applyAssistant.js';
import Calendar from '../student/Calendar.jsx';
import TourPanel from '../student/TourPanel.jsx';
import { useTours, tourOptions } from '../student/tours.js';
import { splitHash } from '../hashParam.js';
import '../student/student.css';

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

function Chip({ label, why, onX, soft }) {
  return (
    <span className={`st-pill ${soft ? 'typ' : 'mine'} pf-chip`} title={why ? `From: "${why}"` : undefined}>
      {label}{onX && <button type="button" aria-label={`Remove ${label}`} onClick={onX}>x</button>}
    </span>
  );
}

export default function ProfileView({ api }) {
  const P = useProfile(api);
  const saved = useSaved();
  const T = useTours();
  const [askShare, consentModal] = useConsent('profile');
  useEffect(() => { assistantStatus(); }, []);
  // With the local AI on, free text (a resume, notes, the first box) is read by the model; calendars and
  // schedule screenshots stay with the exact readers.
  const viaAI = async (name, t) => {
    const res = await applyAssistant({ api, P, T, saved, text: `Uploaded ${name}:\n${t.slice(0, 6000)}`, model: lastStatus.model });
    P.addSource('file', name, t, { viaAI: true });
    return res;
  };
  const tourId = new URLSearchParams(splitHash(window.location.hash).query || '').get('tour');
  const tourHome = tourId ? api.data.homeById.get(tourId) : null;
  const [chosen, setChosen] = useState(null);
  const [opts, setOpts] = useState(null);
  const tourSig = JSON.stringify([tourId, P.profile?.scheduled?.map((e) => [e.id, e.days, e.start, e.end, e.place]), P.profile?.modes, T.list.map((t) => [t.homeId, t.day, t.start])]);
  useEffect(() => {
    if (!tourHome || !P.profile) { setOpts(null); return undefined; }
    const id = setTimeout(() => { try { setOpts(tourOptions(api, P.profile, tourHome, T.list)); } catch (e) { console.error(e); setOpts(null); } }, 20);
    return () => clearTimeout(id);
  }, [tourSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [over, setOver] = useState(false);

  // exact: read with the rules even when the local AI is on (the built-in sample, so the demo numbers hold)
  const addFiles = async (files, exact = false) => {
    if (!files.length) return;
    if (!exact && !(await askShare({ items: files.map((f) => f.name) }))) { setMsg({ text: 'Nothing was shared.' }); return; }
    for (const f of files) {
      setMsg({ text: `Reading ${f.name}...` });
      try {
        const t = await fileText(f, (x, what) => setMsg({ text: `${what || `Reading ${f.name}`}... ${Math.round((x || 0) * 100)}%` }));
        const structured = /\.(ics|ical|png|jpe?g|webp|bmp|gif)$/i.test(f.name) || /^Class schedule \(read from a week calendar\)/.test(t);
        if (lastStatus.ok && !structured && !exact) {
          setMsg({ text: `Local AI is reading ${f.name}...` });
          const res = await viaAI(f.name, t);
          setMsg({ text: `Read ${f.name}. ${res.changes.length} change${res.changes.length === 1 ? '' : 's'}${res.notes.length ? `; ${res.notes.length} skipped` : ''}.` });
        } else {
          P.addSource('file', f.name, t);
          setMsg({ text: `Read ${f.name}.` });
        }
      } catch (e) { setMsg({ text: String(e.message || e), bad: true }); }
    }
  };
  const [fileInput, pick] = useFileInput(addFiles);
  const addText = async () => {
    const t = text.trim();
    if (!t) return;
    if (!(await askShare({ items: [t.length > 80 ? `${t.slice(0, 77)}...` : t] }))) return;
    const name = t.length > 48 ? `${t.slice(0, 45).trim()}...` : t;
    if (lastStatus.ok) {
      setMsg({ text: 'Local AI is reading this...' });
      try { const res = await applyAssistant({ api, P, T, saved, text: t, model: lastStatus.model }); P.addSource('text', name, t, { viaAI: true }); setMsg({ text: res.reply || 'Done.' }); }
      catch (e) { P.addSource('text', name, t); setMsg({ text: `Local AI failed (${String(e.message || e)}); read with the rules instead.` }); }
    } else P.addSource('text', name, t);
    setText('');
  };
  const trySample = async () => {
    try {
      const r = await fetch('./samples/sample_resume.pdf');
      const b = await r.blob();
      await addFiles([new File([b], 'Sample resume (fictional student).pdf', { type: 'application/pdf' })], true);
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
        {consentModal}
        <div className="st-head">
          <div>
            <h1>My profile</h1>
            <p>Tell Quorum about your week. It finds the places you go and ranks homes for the life you actually live.</p>
          </div>
        </div>
        <div className="pf-start">
          <div className={`pf-drop${over ? ' over' : ''}`} {...dropProps}>
            <h2>Add a file</h2>
            <p className="st-sub">A resume, a class schedule, a screenshot of your schedule or a calendar file (PDF, PNG, JPG, text or .ics).</p>
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
      {consentModal}
      <div className="st-head">
        <div>
          <h1>My profile</h1>
          <p>What Quorum read. Switch anything off or change it; your homes re-rank right away.</p>
        </div>
        <div className="st-head-r">
          <Button variant="primary" onClick={() => go(saved.ids.length ? 'saved' : 'browse')}>
            {saved.ids.length ? `See my ${saved.ids.length} saved home${saved.ids.length > 1 ? 's' : ''}` : 'Browse homes'}
          </Button>
        </div>
      </div>

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
            <h2>My calendar <span className="st-sub">{tourHome ? 'Green: open tour times. Click one.' : 'From what you added. Tours you book show in green.'}</span></h2>
            {p.scheduled.length || T.list.length ? (
              <Calendar entries={p.scheduled} placeById={placeById}
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

          {(p.reqs.length + p.wants.length + p.near.length + p.likes.length + p.notes.length + p.courses.length + p.links.length + (p.minSqft ? 1 : 0)) > 0 && (
            <div className="st-card pf-sec">
              <h2>What you want <span className="st-sub">Browse checks each home against these. Remove any that are wrong.</span></h2>
              <div className="pf-chips">
                {p.reqs.map((r) => <Chip key={`req:${r.label}`} label={r.label} why={`${r.field} ${r.op} ${r.value}`} onX={() => P.dropPref(`req:${r.label}`)} />)}
                {p.near.map((n) => <Chip key={`near:${n.place}`} label={`Near ${n.label}`} why={n.why} onX={() => P.dropPref(`near:${n.place}`)} />)}
                {p.minSqft ? <Chip label={`Room over ${p.minSqft} sq ft`} why={p.minSqftWhy} /> : null}
                {p.wants.map((w) => <Chip key={`want:${w.key}`} label={w.label} why={w.why} onX={() => P.dropPref(`want:${w.key}`)} />)}
                {p.likes.map((l) => <Chip key={`like:${l.key}`} label={l.label} why={l.why} onX={() => P.dropPref(`like:${l.key}`)} />)}
                {p.notes.map((n) => <Chip key={`note:${n.key}`} label={n.label} why={n.why} soft onX={() => P.dropPref(`note:${n.key}`)} />)}
              </div>
              {p.courses.length > 0 && <p className="st-sub" style={{ marginTop: 10 }}>Courses: {p.courses.slice(0, 8).join(', ')}</p>}
              {p.links.length > 0 && <p className="st-sub">Links (kept, not opened): {p.links.map((l) => l.host).join(', ')}</p>}
            </div>
          )}
        </div>

        <aside className="pf-side">
          <AssistantBox api={api} P={P} T={T} saved={saved} pick={pick} msg={msg} askShare={askShare} />
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
            <button type="button" className="textlink" style={{ marginTop: 8 }} onClick={() => { P.clear(); forgetConsent(); setMsg(null); }}>Clear my profile</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
