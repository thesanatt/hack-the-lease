// Calendar import: a compact "Import a calendar" button that opens a panel. The consent box comes first; nothing is
// read until it is ticked, and nothing leaves the browser (the file is read with the browser's own file reader and
// parsed by engine/ics.js on this page). The preview is drawn as calendar blocks before anything is applied.
// Props: api, places, placeById, entries, setEntries, persona
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseSchedule, toWeekEntries } from '../../../../engine/ics.js';
import ImportPreview from './calendar/ImportPreview.jsx';
import './calendar/parts.css';

const MAX_BYTES = 2 * 1024 * 1024;
const SAMPLE_URL = `${import.meta.env.BASE_URL || './'}samples/sample_week.ics`;
const PASTE_HINT = 'Mon Wed Fri 9:00-10:30 EECS\nLate lab Tue Thu 7pm-11:30pm at the Dude';

function CalIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" strokeWidth="1.3" />
      <line x1="5" y1="1" x2="5" y2="4" stroke="currentColor" strokeWidth="1.3" />
      <line x1="11" y1="1" x2="11" y2="4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="4" y="8.5" width="3" height="2.5" fill="currentColor" />
    </svg>
  );
}

export default function CalendarDrop({ places, placeById, entries, setEntries, persona }) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState(null); // { items, skipped, warnings, source, ics }
  const [include, setInclude] = useState({});
  const [resolve, setResolve] = useState({});
  const [msg, setMsg] = useState(null); // { tone, text }
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const dlgRef = useRef(null);

  // a new persona starts with a clean box
  useEffect(() => { setParsed(null); setPaste(''); setMsg(null); setInclude({}); setResolve({}); }, [persona?.id]);

  useEffect(() => {
    const d = dlgRef.current;
    if (!d) return;
    if (open && !d.open) { try { d.showModal(); } catch { d.setAttribute('open', ''); } }
    if (!open && d.open) d.close();
  }, [open]);

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
      read(await r.text(), 'the sample week');
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
    setParsed(null); setPaste(''); setInclude({}); setResolve({}); setMsg(null);
    setOpen(false);
  };

  const drop = `mp-drop ${consent ? '' : 'disabled'} ${over && consent ? 'over' : ''}`;

  return (
    <>
      <button type="button" className="mp-btn" onClick={() => setOpen(true)}>
        <CalIcon /> Import a calendar
      </button>
      <dialog ref={dlgRef} className="mp-import-dlg" aria-labelledby="mp-import-title"
        onClose={() => setOpen(false)} onCancel={() => setOpen(false)}>
        {open && (
          <div className="mp-import">
            <div className="mp-import-head">
              <h3 id="mp-import-title" className="mp-name">Import a calendar</h3>
              <button type="button" className="mp-text-btn" onClick={() => setOpen(false)}>Close</button>
            </div>

            <label className="mp-consent">
              <input type="checkbox" checked={consent} onChange={(ev) => { setConsent(ev.target.checked); if (ev.target.checked) setMsg(null); }} />
              <span>
                Use my calendar to build my week
                <small>Read in this browser only. Never uploaded or stored.</small>
              </span>
            </label>

            <div className={drop} aria-disabled={!consent}
              onDragOver={(ev) => { ev.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)} onDrop={onDrop}>
              <span className="cal-ico"><CalIcon size={34} /></span>
              <span className="t">Drop an .ics file<small>From Google, Outlook or Apple Calendar</small></span>
              <button type="button" className="mp-btn" disabled={!consent} onClick={() => fileRef.current?.click()}>Choose a file</button>
              <button type="button" className="mp-btn" disabled={!consent} onClick={loadSample}>Use the sample week</button>
              <input ref={fileRef} type="file" accept=".ics,text/calendar" style={{ display: 'none' }}
                onChange={(ev) => { readFile(ev.target.files?.[0]); ev.target.value = ''; }} />
            </div>

            {!pasteOpen ? (
              <div><button type="button" className="mp-text-btn" disabled={!consent} onClick={() => setPasteOpen(true)}>Paste text instead</button></div>
            ) : (
              <div className="mp-paste">
                <label className="mp-gray" htmlFor="mp-paste">One class per line</label>
                <textarea id="mp-paste" rows={3} value={paste} disabled={!consent} placeholder={PASTE_HINT}
                  onChange={(ev) => setPaste(ev.target.value)} />
                <button type="button" className="mp-btn" disabled={!consent || !paste.trim()} onClick={() => read(paste, 'pasted text')}>Read these lines</button>
              </div>
            )}

            {msg && <div className={`mp-msg ${msg.tone}`} role="status">{msg.text}</div>}

            {parsed && (
              <>
                <div className="mp-prev-head">
                  <strong>{parsed.items.length} weekly {parsed.items.length === 1 ? 'class' : 'classes'} from {parsed.source}</strong>
                  <span>Click a block to leave it out</span>
                </div>
                <ImportPreview items={parsed.items} skipped={parsed.skipped} places={places} placeById={placeById}
                  include={include} setInclude={setInclude} resolve={resolve} setResolve={setResolve} />
                <div className="mp-import-actions">
                  <button type="button" className="btn primary" disabled={!counts.ready} onClick={() => apply('replace')}>Replace my week</button>
                  <button type="button" className="mp-text-btn" disabled={!counts.ready} onClick={() => apply('add')}>Add to my week</button>
                  <button type="button" className="mp-text-btn" onClick={() => { setParsed(null); setMsg(null); }}>Discard</button>
                  {counts.unresolved > 0 && <span className="mp-gray">{counts.unresolved} without a place {counts.unresolved === 1 ? 'is' : 'are'} left out</span>}
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
