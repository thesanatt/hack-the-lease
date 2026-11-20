// Tour times: a Mon to Fri by 9 AM to 7 PM grid of half-hours. Green where all members are free and can get to the
// chosen house and back to their next class on the real timetables; the three best are numbered. Engine: engine/tours.js.
// Only names, weeks and walking limits go to the engine. Caps and rents are never read here.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { modOf } from './kit.jsx';
import { modalRoutine } from './logic.js';
import { DAY_SHORT, clock12 } from './tours/format.js';
import './tours/tours.css';
import { tourIcs, mailtoHref, slotDates, slotLabel } from '../../../../engine/book.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const FROM = 9 * 3600, TO = 19 * 3600, STEP = 1800;
const toSec = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 3600 + (m || 0) * 60; };

export default function TourTimes({ api, chosen, members, weeks, cfg, colors }) {
  const tours = modOf(api, 'tours');
  const planner = api?.planner;
  const house = chosen?.home || null;
  const places = api?.data?.places || [];

  // Only id, name and the most likely week (with walking limits) leave this component.
  const people = useMemo(
    () => (members || []).map((m) => ({ id: m.id, name: m.name, routine: modalRoutine(m) })),
    [members],
  );
  const [state, setState] = useState({ status: 'idle', picks: null, all: null, error: null, houseId: null });

  useEffect(() => {
    if (!tours?.findTourSlots || !planner || !house || !people.length) return undefined;
    let live = true;
    setState((s) => ({ ...s, status: 'running' }));
    const id = setTimeout(() => {
      try {
        const picks = tours.findTourSlots(planner, { house, members: people, places, cfg });
        const all = tours.findTourSlots(planner, { house, members: people, places, cfg, opts: { top: 1000, gapMin: 0 } });
        if (live) setState({ status: 'done', picks, all, error: null, houseId: house.id });
      } catch (e) {
        if (live) setState({ status: 'error', picks: null, all: null, error: String(e.message || e), houseId: house.id });
      }
    }, 0);
    return () => { live = false; clearTimeout(id); };
  }, [tours, planner, house, people, places, cfg]);

  const n = people.length;
  const fresh = state.houseId === house?.id;
  const r = fresh ? state.picks : null;
  const all = fresh ? state.all : null;

  return (
    <section className="gv-section" aria-label="Tour times">
      <header>
        <h2>Tour times</h2>
        {r && <span className="gv-small gv-gray">{r.feasibleSlots} of {r.checked} half-hours work for all {n}</span>}
      </header>
      <div className="gv-card">
        {!tours ? <p className="gv-gray">Tour search is not available.</p>
          : !house ? <p className="gv-gray">Pick a house first.</p>
          : state.status === 'error' && fresh ? <p className="gv-note">Tour search failed: {state.error}</p>
          : !r ? <p className="gv-wait" aria-live="polite">Checking every weekday half-hour against {n} weeks</p>
          : (
            <div className="gv-tours">
              <div>
                <TourGrid people={people} picks={r.slots} works={all?.slots || r.slots} />
                <div className="gv-legend">
                  <span><i className="gv-sw" style={{ background: '#1f6f4a' }} />Best</span>
                  <span><i className="gv-sw" style={{ background: '#9cc4a4' }} />Works for all {n}</span>
                  <span><i className="gv-sw" style={{ background: '#fff', border: '1px dashed #b9b3a7' }} />Free, no way there in time</span>
                  <span><i className="gv-sw" style={{ background: '#efe8da' }} />Someone has class</span>
                </div>
              </div>
              <Draft house={house} n={n} slots={r.slots} tours={tours} names={people.map((p) => p.name)} />
            </div>
          )}
      </div>
    </section>
  );
}

function TourGrid({ people, picks, works }) {
  const cols = (TO - FROM) / STEP;
  const labelW = 44, cw = 30, ch = 30, g = 2, top = 20;
  const width = labelW + cols * (cw + g);
  const height = top + WEEKDAYS.length * (ch + g);
  const key = (d, s) => `${d}|${s}`;
  const ok = new Set(works.map((x) => key(x.day, x.start)));
  const pickNo = new Map(picks.map((x, k) => [key(x.day, x.start), k + 1]));
  const busyNames = (d, s) => people.filter((p) => (p.routine.week || []).some((e) => (e.days || []).includes(d)
    && toSec(e.start) < s + STEP && toSec(e.end) > s)).map((p) => p.name);
  const hours = [];
  for (let h = 9; h <= 19; h += 2) hours.push(h);
  return (
    <svg className="gv-tourgrid" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Weekday tour grid. ${works.length} half-hours work for everyone. Best: ${picks.map((x) => `${DAY_SHORT[x.day]} ${clock12(x.start)}`).join(', ')}.`}>
      {hours.map((h) => {
        const x = labelW + ((h * 3600 - FROM) / STEP) * (cw + g) - (h === 19 ? g : 0);
        return <text key={h} x={x} y={12} textAnchor={h === 19 ? 'end' : 'start'}>{`${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`}</text>;
      })}
      {WEEKDAYS.map((d, r) => {
        const y = top + r * (ch + g);
        return (
          <g key={d}>
            <text className="day" x={0} y={y + ch / 2 + 4}>{DAY_SHORT[d]}</text>
            {Array.from({ length: cols }, (_, c) => {
              const s = FROM + c * STEP;
              const x = labelW + c * (cw + g);
              const k = key(d, s);
              const no = pickNo.get(k);
              const busy = ok.has(k) ? [] : busyNames(d, s);
              const fill = no ? '#1f6f4a' : ok.has(k) ? '#9cc4a4' : busy.length ? '#efe8da' : '#ffffff';
              const tip = ok.has(k) ? `${DAY_SHORT[d]} ${clock12(s)}: works for everyone${no ? `, best time ${no}` : ''}`
                : busy.length ? `${DAY_SHORT[d]} ${clock12(s)}: ${busy.join(', ')} ${busy.length > 1 ? 'have' : 'has'} class`
                : `${DAY_SHORT[d]} ${clock12(s)}: all free, but someone cannot get there and back in time`;
              return (
                <g key={c}>
                  <title>{tip}</title>
                  <rect x={x + 0.5} y={y + 0.5} width={cw - 1} height={ch - 1} rx="3" fill={fill}
                    stroke={!ok.has(k) && !busy.length ? '#b9b3a7' : 'none'} strokeDasharray="3 2" />
                  {no && <text className="pick-n" x={x + cw / 2} y={y + ch / 2 + 4} textAnchor="middle">{no}</text>}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function Draft({ house, n, slots, tours, names }) {
  const text = useMemo(
    () => (slots.length ? tours.tourMessage({ houseName: house.name, groupSize: n, slots, dates: slotDates(slots) }) : ''),
    [house, n, slots, tours],
  );
  const ref = useRef(null);
  const box = useRef(null);
  const [status, setStatus] = useState('');
  useEffect(() => { setStatus(''); }, [text]);

  // Fallback when the clipboard API is blocked: show the message and select it for Ctrl+C.
  const selectAll = () => {
    if (box.current) box.current.open = true;
    const el = ref.current;
    if (!el) return false;
    el.focus();
    el.select();
    try { return document.execCommand('copy'); } catch { return false; }
  };
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('Copied');
        return;
      }
    } catch { /* fall through to the select-text fallback */ }
    setStatus(selectAll() ? 'Copied' : 'Selected. Press Ctrl+C.');
  };

  // Book: save a calendar invite for this slot, then open the agent's email (editable). Send goes through
  // /api/send (Resend) after the student clicks it; with no key on the server it falls back to the mail app.
  const [mail, setMail] = useState(null); // { slot, to, subject, body, state: 'edit'|'sending'|'sent'|'error', note }
  const book = (s) => {
    const label = slotLabel(s);
    try {
      const ics = tourIcs({ slot: s, houseName: house.name, attendees: names, description: `Group tour of ${house.name}.` });
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url; a.download = `tour-${s.day}-${house.id}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.warn(e); }
    const body = tours.tourMessage({ houseName: house.name, groupSize: n, slots: [s], dates: slotDates([s]) });
    setMail({ slot: s, to: mail?.to || '', subject: `Group tour of ${house.name}: ${label}?`, body, state: 'edit', note: '' });
    setStatus(`Calendar invite saved for ${label}.`);
  };
  const sendMail = async () => {
    setMail((m) => ({ ...m, state: 'sending', note: '' }));
    try {
      const r = await fetch('./api/send', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.body }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 501 || r.status === 404) {
        window.location.href = mailtoHref({ to: mail.to, subject: mail.subject, body: mail.body });
        setMail((m) => ({ ...m, state: 'edit', note: 'No email key on the server, so your mail app opened instead.' }));
        return;
      }
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setMail((m) => ({ ...m, state: 'sent', note: `Sent to ${m.to}.` }));
    } catch (e) {
      setMail((m) => ({ ...m, state: 'error', note: String(e.message || e) }));
    }
  };

  if (!slots.length) return <p className="gv-gray">No weekday time works for all {n} at {house.name}.</p>;
  return (
    <div className="gv-draft">
      <ol className="gv-picks">
        {slots.map((s, k) => (
          <li key={`${s.day}-${s.start}`}>
            <span className="n">{k + 1}</span>
            <span className="when">{DAY_SHORT[s.day]} {clock12(s.start).toUpperCase()}</span>
            <span className="gv-small gv-gray">{s.travelMin} min of travel for the group</span>
            <button type="button" className="gv-btn" onClick={() => book(s)} title={`Calendar invite + email for ${slotLabel(s)}`}>Book</button>
          </li>
        ))}
      </ol>
      <div className="gv-draft-actions">
        <button type="button" className="gv-btn primary" onClick={copy}>Copy message</button>
        <span className="gv-small gv-gray" role="status" aria-live="polite">{status || 'Nothing is sent until you press Send.'}</span>
      </div>
      {mail && (
        <div className="gv-msg gv-agent" aria-label="Tour request email">
          <p className="gv-small"><b>Agent email</b> for {slotLabel(mail.slot)}. Check it, then send.</p>
          <input type="email" placeholder="Landlord or leasing office email" value={mail.to} disabled={mail.state === 'sending'}
            onChange={(e) => setMail({ ...mail, to: e.target.value, state: mail.state === 'sent' ? 'edit' : mail.state })} aria-label="To" />
          <input type="text" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} aria-label="Subject" />
          <textarea rows={Math.min(12, mail.body.split('\n').length + 1)} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} aria-label="Message" />
          <div className="gv-draft-actions">
            <button type="button" className="gv-btn primary" disabled={!mail.to.trim() || mail.state === 'sending' || mail.state === 'sent'} onClick={sendMail}>
              {mail.state === 'sending' ? 'Sending…' : mail.state === 'sent' ? 'Sent ✓' : 'Send'}
            </button>
            <button type="button" className="gv-btn" onClick={() => setMail(null)}>Close</button>
            <span className={`gv-small ${mail.state === 'error' ? 'gv-note' : 'gv-gray'}`} role="status">{mail.note}</span>
          </div>
        </div>
      )}
      <details className="gv-msg" ref={box}>
        <summary>See the message</summary>
        <textarea ref={ref} readOnly value={text} rows={Math.min(14, text.split('\n').length + 1)}
          aria-label="Draft message to the listing contact" onFocus={(e) => e.target.select()} />
      </details>
    </div>
  );
}
