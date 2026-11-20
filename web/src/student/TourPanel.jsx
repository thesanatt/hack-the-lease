// Picking a tour time for one liked home, on My profile above the calendar. The three best open slots are
// listed; every open slot is also on the calendar. Choosing one shows the trips there and on; booking puts it
// on the calendar, with a calendar file and a message to the landlord. Homes and contacts are samples.
import { useEffect, useState } from 'react';
import { Button } from '../components/index.js';
import { canSend, sendEmail, mailtoHref } from './send.js';
import { go, short } from './parts.jsx';
import { nextDate, dateLabel, clock12, tripText, tourIcs, download, landlordMessage } from './tours.js';

export function ContactPanel({ api, home, profile, tour, onClose }) {
  const d = api.data.detailsById?.get(home.id);
  const [text, setText] = useState(() => landlordMessage({ home, details: d, profile, tour }));
  const [copied, setCopied] = useState(false);
  const c = d?.contact;
  const [subject, setSubject] = useState(() => `Your listing: ${short(home.name)}`);
  // Send by email only when the server has a key; otherwise this panel is exactly as before.
  const [sendOn, setSendOn] = useState(false);
  const [to, setTo] = useState(() => { try { return sessionStorage.getItem('quorum.sendTo') || ''; } catch { return ''; } });
  const [sent, setSent] = useState({ state: 'edit', note: '' }); // edit | sending | sent | error
  useEffect(() => { let live = true; canSend().then((v) => { if (live) setSendOn(v); }); return () => { live = false; }; }, []);
  const editTo = (v) => { setTo(v); setSent({ state: 'edit', note: '' }); try { sessionStorage.setItem('quorum.sendTo', v); } catch { /* memory only */ } };
  const send = async () => {
    setSent({ state: 'sending', note: '' });
    const r = await sendEmail({ to, subject, body: text });
    setSent(r.ok ? { state: 'sent', note: 'Sent.' } : { state: 'error', note: r.note });
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="ct" onClick={(e) => e.stopPropagation()}>
      <div className="ct-head">
        <div>
          <b>{c?.name || 'Listing contact'}</b>
          {c && <span className="st-sub"> &middot; {c.email} &middot; {c.phone}</span>}
        </div>
        {onClose && <button type="button" className="pf-x" onClick={onClose}>Close</button>}
      </div>
      {sendOn && (
        <div className="ct-send">
          <input className="ct-in" type="email" placeholder="To: email address" value={to} disabled={sent.state === 'sending'}
            onChange={(e) => editTo(e.target.value)} aria-label="To" />
          <input className="ct-in" type="text" value={subject} disabled={sent.state === 'sending'}
            onChange={(e) => { setSubject(e.target.value); if (sent.state === 'sent') setSent({ state: 'edit', note: '' }); }} aria-label="Subject" />
        </div>
      )}
      <textarea className="ct-text" value={text} onChange={(e) => { setText(e.target.value); if (sent.state === 'sent') setSent({ state: 'edit', note: '' }); }} aria-label="Message to the landlord" />
      {sendOn ? (
        <div className="ct-acts">
          <Button variant="primary" small disabled={!to.trim() || sent.state === 'sending' || sent.state === 'sent'} onClick={send}>
            {sent.state === 'sending' ? 'Sending...' : sent.state === 'sent' ? 'Sent ✓' : 'Send'}
          </Button>
          <Button small onClick={copy}>{copied ? 'Copied' : 'Copy message'}</Button>
          {sent.state === 'error' && <a className="btn small" href={mailtoHref({ to: to || c?.email || '', subject, body: text })}>Open in my mail app</a>}
          <span className="st-sub" role="status">{sent.note || 'Nothing is sent until you press Send. Sample contact, not a real landlord.'}</span>
        </div>
      ) : (
        <div className="ct-acts">
          <Button variant="primary" small onClick={copy}>{copied ? 'Copied' : 'Copy message'}</Button>
          {c && <a className="btn small" href={`mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>Open in my email</a>}
          <span className="st-sub">Quorum sends nothing. Sample contact, not a real landlord.</span>
        </div>
      )}
    </div>
  );
}

export default function TourPanel({ api, home, profile, opts, chosen, setChosen, T }) {
  const booked = T.forHome(home.id);
  const [contact, setContact] = useState(false);
  const opt = opts?.options.find((o) => o.key === chosen) || null;
  const book = () => {
    const date = nextDate(opt.day);
    T.book({ id: `tour-${home.id}`, homeId: home.id, day: opt.day, start: opt.start, end: opt.end, date: date.toISOString(),
      label: `Tour: ${short(home.name)}`, to: tripText(api, opt.to, true), back: tripText(api, opt.back, false) });
    setChosen(null);
  };
  const ics = () => {
    const note = [booked.to, booked.back].filter(Boolean).join('. ');
    download(`tour-${short(home.name).replace(/\W+/g, '-').toLowerCase()}.ics`,
      tourIcs({ home, date: new Date(booked.date), start: booked.start, end: booked.end, note }));
  };

  return (
    <div className="st-card tp">
      <div className="tp-head">
        <div>
          <h2>Tour {short(home.name)}</h2>
          <p className="st-sub">{home.area} &middot; Sample listing. Times when you are free and can get there and back on time.</p>
        </div>
        <Button small onClick={() => go('saved')}>Back to Saved</Button>
      </div>

      {booked && !opt ? (
        <div className="tp-booked">
          <p className="st-lead" style={{ fontSize: 17 }}>Booked: <b>{dateLabel(new Date(booked.date))}, {clock12(booked.start)}</b></p>
          {booked.to && <p className="st-sub">{booked.to}. {booked.back || ''}</p>}
          <div className="ct-acts">
            <Button variant="primary" small onClick={ics}>Add to my calendar app (.ics)</Button>
            <Button small onClick={() => setContact((v) => !v)}>Message the landlord</Button>
            <button type="button" className="pf-x" onClick={() => T.cancel(home.id)}>Cancel tour</button>
          </div>
          {contact && <ContactPanel api={api} home={home} profile={profile} tour={booked} onClose={() => setContact(false)} />}
          <p className="st-sub" style={{ marginTop: 8 }}>To change it, pick another blue time.</p>
        </div>
      ) : null}

      {!profile?.entries?.length ? (
        <p className="pf-msg">Add your week first (classes, work), so Quorum can find times you are free.</p>
      ) : !opts ? <p className="st-sub">Finding open times on the bus timetables...</p>
        : !opts.options.length ? <p className="pf-msg">No open weekday time between 9 AM and 7 PM fits your week. Try removing a row, or message the landlord for an evening.</p>
          : !booked || opt ? (
            <div className="tp-best">
              <span className="st-sub">Best times</span>
              {opts.best.map((o) => (
                <button key={o.key} type="button" className={`tp-opt${chosen === o.key ? ' on' : ''}`} onClick={() => setChosen(o.key)}>
                  <i>{o.rank}</i>{dateLabel(nextDate(o.day))}, {clock12(o.start)}
                </button>
              ))}
              <span className="st-sub">or any blue time on your calendar</span>
            </div>
          ) : null}

      {opt && (
        <div className="tp-pick">
          <p><b>{dateLabel(nextDate(opt.day))}, {clock12(opt.start)} to {clock12(opt.end)}</b></p>
          {opt.to && <p className="st-sub">{tripText(api, opt.to, true)}.</p>}
          {opt.back && <p className="st-sub">{tripText(api, opt.back, false)}.</p>}
          <div className="ct-acts">
            <Button variant="primary" small onClick={book}>{booked ? 'Move my tour here' : 'Book this time'}</Button>
            <Button small onClick={() => setChosen(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
