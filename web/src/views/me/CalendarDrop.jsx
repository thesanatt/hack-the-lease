// Calendar import for the Your week panel: drop an .ics file, paste plain lines, or load the SYNTHETIC
// sample file. Nothing is read until the consent box is ticked, and nothing leaves the browser: the file is
// read with the browser's own file reader and parsed by engine/ics.js on this page.
// Props: api, places, placeById, entries, setEntries, persona
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Pill } from '../../components/index.js';
import { parseSchedule, toWeekEntries } from '../../../../engine/ics.js';
import ImportPreview from './calendar/ImportPreview.jsx';

const MAX_BYTES = 2 * 1024 * 1024;
const SAMPLE_URL = `${import.meta.env.BASE_URL || './'}samples/sample_week.ics`;
const PASTE_HINT = 'Mon Wed Fri 9:00-10:30 EECS\nEECS 482 lecture, Tue Thu 1:30-3pm, BBB 1670\nLate lab Tue Thu 7pm-11:30pm at the Dude';

export default function CalendarDrop({ places, placeById, entries, setEntries, persona }) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState(null); // { items, skipped, warnings, source }
  const [include, setInclude] = useState({});
  const [resolve, setResolve] = useState({});
  const [msg, setMsg] = useState(null); // { tone, text }
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);

  // a new persona starts with a clean box
  useEffect(() => { setParsed(null); setPaste(''); setMsg(null); setInclude({}); setResolve({}); }, [persona?.id]);

  const read = (text, source) => {
    const r = parseSchedule(text, places);
    setInclude({}); setResolve({});
    if (!r.items.length) {
      setParsed(null);
      setMsg({ tone: 'warn', text: r.warnings[0] || (r.skipped.length ? `Nothing usable: ${r.skipped.map((s) => s.reason).join('; ')}.` : 'Nothing usable was found.') });
      return;
    }
    setParsed({ ...r, source, ics: /BEGIN:VCALENDAR/i.test(text) });
    setMsg(null);
  };

  const readFile = async (file) => {
    if (!consent) { setMsg({ tone: 'warn', text: 'Tick the box first. Nothing was read.' }); return; }
    if (!file) return;
    if (file.size > MAX_BYTES) { setMsg({ tone: 'warn', text: 'That file is over 2 MB. Export one term or one calendar instead.' }); return; }
    try { read(await file.text(), file.name); } catch { setMsg({ tone: 'bad', text: 'The file could not be read.' }); }
  };

  const loadSample = async () => {
    try {
      const r = await fetch(SAMPLE_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      read(await r.text(), 'sample_week.ics (SYNTHETIC)');
    } catch { setMsg({ tone: 'bad', text: 'The sample file is missing from this build.' }); }
  };

  const onDrop = (ev) => {
    ev.preventDefault(); setOver(false);
    readFile(ev.dataTransfer?.files?.[0]);
  };

  const counts = useMemo(() => {
    if (!parsed) return null;
    const used = parsed.items.filter((it) => include[it.key] !== false);
    const ready = used.filter((it) => it.place || resolve[it.key]);
    return { used: used.length, ready: ready.length, unresolved: used.length - ready.length };
  }, [parsed, include, resolve]);

  const build = (existing) => toWeekEntries(
    parsed.items, existing, new Map(Object.entries(resolve).filter(([, v]) => v)),
    new Set(parsed.items.filter((it) => include[it.key] !== false).map((it) => it.key)),
  );

  const apply = (mode) => {
    if (!parsed || !counts?.ready) return;
    const add = build(mode === 'add' ? entries.map((e) => e.id) : []);
    setEntries((es) => (mode === 'add' ? [...es, ...add] : add));
    const left = counts.unresolved ? ` ${counts.unresolved} without a place ${counts.unresolved === 1 ? 'was' : 'were'} left out.` : '';
    setMsg({
      tone: 'good',
      text: mode === 'add'
        ? `Added ${add.length} ${add.length === 1 ? 'entry' : 'entries'} to your week.${left} The ranking reruns with them.`
        : `Your week is now the ${add.length} imported ${add.length === 1 ? 'entry' : 'entries'}.${left} The ranking reruns with them.`,
    });
    setParsed(null); setPaste(''); setInclude({}); setResolve({});
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 8 }}>
        <Button variant="quiet" small onClick={() => setOpen(true)}>Import a calendar file or paste your schedule</Button>
      </div>
    );
  }

  const zone = {
    border: `1px dashed ${over && consent ? 'var(--accent)' : 'var(--ink-2, var(--ink))'}`,
    background: over && consent ? 'var(--paper)' : 'transparent',
    padding: '10px 12px', borderRadius: 'var(--r)', opacity: consent ? 1 : 0.55, flex: '1 1 220px', minWidth: 0,
  };

  return (
    <section aria-label="Import a calendar" style={{ border: '1px solid var(--line)', background: 'var(--paper-2)', padding: '10px 12px', marginBottom: 12, borderRadius: 'var(--r)' }}>
      <div className="row-flex" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="caps">Import your week</span>
        <Button variant="quiet" small onClick={() => setOpen(false)}>Close</Button>
      </div>

      <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={(ev) => { setConsent(ev.target.checked); if (ev.target.checked) setMsg(null); }} style={{ marginTop: 3 }} />
        <span><strong>Use this to build my week.</strong> It is read in this browser and never sent anywhere.</span>
      </label>

      <div className="row-flex" style={{ alignItems: 'stretch', gap: 10 }}>
        <div
          style={zone}
          onDragOver={(ev) => { ev.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          aria-label="Drop zone for an .ics calendar file"
        >
          <div style={{ fontWeight: 600 }}>Drop an .ics file here</div>
          <div className="small muted" style={{ marginBottom: 6 }}>
            An export from Google Calendar, Outlook or Apple Calendar works.
          </div>
          <div className="row-flex" style={{ gap: 6 }}>
            <Button small disabled={!consent} onClick={() => fileRef.current?.click()}>Choose a file</Button>
            <Button small disabled={!consent} onClick={loadSample}>Use the sample file</Button>
            <Pill tone="muted" title="A made-up North Campus engineering week with real U-M building names">SYNTHETIC</Pill>
          </div>
          <input ref={fileRef} type="file" accept=".ics,text/calendar" style={{ display: 'none' }}
            onChange={(ev) => { readFile(ev.target.files?.[0]); ev.target.value = ''; }} />
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 0, opacity: consent ? 1 : 0.55 }}>
          <label className="small" htmlFor="cal-paste" style={{ fontWeight: 600, display: 'block' }}>Or paste your schedule, one class per line</label>
          <textarea id="cal-paste" rows={3} value={paste} disabled={!consent} placeholder={PASTE_HINT}
            onChange={(ev) => setPaste(ev.target.value)}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', padding: 6, borderRadius: 'var(--r)', resize: 'vertical' }} />
          <Button small disabled={!consent || !paste.trim()} onClick={() => read(paste, 'pasted text')}>Read pasted lines</Button>
        </div>
      </div>

      {msg && <div className={`note ${msg.tone}`} role="status" style={{ marginTop: 10, marginBottom: 0 }}>{msg.text}</div>}

      {parsed && (
        <div style={{ marginTop: 10 }}>
          <div className="small" style={{ marginBottom: 4 }}>
            <strong>{parsed.items.length} weekly {parsed.items.length === 1 ? 'entry' : 'entries'}</strong> read from {parsed.source}.
            {' '}Times are Ann Arbor time.{parsed.ics ?' One-time events sit on their weekday.' : ''}
          </div>
          <ImportPreview items={parsed.items} skipped={parsed.skipped} places={places} placeById={placeById}
            include={include} setInclude={setInclude} resolve={resolve} setResolve={setResolve} />
          <div className="row-flex" style={{ marginTop: 8 }}>
            <Button variant="primary" small disabled={!counts.ready} onClick={() => apply('replace')}>Replace my week</Button>
            <Button small disabled={!counts.ready} onClick={() => apply('add')}>Add to my week</Button>
            <Button variant="quiet" small onClick={() => { setParsed(null); setMsg(null); }}>Discard</Button>
            <span className="small muted">
              {counts.ready} ready.
              {counts.unresolved > 0 && ` ${counts.unresolved} ${counts.unresolved === 1 ? 'needs' : 'need'} a place and ${counts.unresolved === 1 ? 'is' : 'are'} left out until you pick one.`}
            </span>
          </div>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
        Nothing leaves this browser. The file is not uploaded or stored. Only the day, time, title and place of each
        event are used; descriptions and attendees are ignored.
      </p>
    </section>
  );
}
