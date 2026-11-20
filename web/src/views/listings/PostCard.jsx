// One pasted post: its number (same as the map), the fields as chips (solid = read from the post, dashed = a
// guess or missing, green edge = you set it), a location chip that can ask for a pin, and "Reach out".
// Props: post, l (effective listing), cover ({ ok, note }), pinning (bool), onEdit(patch), onPin(), onCancelPin(),
//        onRemove(), draft (string), onDraft(text), open (bool), onToggle(), firstName, setFirstName,
//        fit (fit.fitScores entry or null), to (the email the student typed for this post), setTo(text)
import { useEffect, useRef, useState } from 'react';
import { fmtRange, shortStreet } from '../../../../engine/listing.js';
import { money } from '../me/format.js';
import { cleanEmail, mailtoHref } from './fit.js';
import FitBlock from './FitBlock.jsx';

const TITLE = {
  found: 'Read from the post. Click to change.',
  guessed: 'A guess. Click to change.',
  missing: 'Not in the post. Click to add.',
  edited: 'You set this. Click to change.',
};

function Chip({ conf, label, children, editor, onSave, wide }) {
  const [edit, setEdit] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!edit) return undefined;
    const el = box.current?.querySelector('input, select');
    el?.focus();
    return undefined;
  }, [edit]);
  if (edit) {
    const done = (save) => {
      if (save) {
        const vals = {};
        box.current?.querySelectorAll('[name]').forEach((el) => { vals[el.name] = el.value; });
        onSave(vals);
      }
      setEdit(false);
    };
    return (
      <span className={`lv-chip editing${wide ? ' wide' : ''}`} ref={box}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); }}>
        <span className="lv-chip-k">{label}</span>
        {editor}
        <button type="button" className="lv-ok" onClick={() => done(true)}>Save</button>
      </span>
    );
  }
  return (
    <button type="button" className={`lv-chip ${conf}`} title={TITLE[conf] || TITLE.found} onClick={() => setEdit(true)}
      aria-label={`${label}: ${typeof children === 'string' ? children : ''}. ${TITLE[conf] || ''}`}>
      {children}
    </button>
  );
}

const num = (v) => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };

function bedsText(l) {
  if (l.beds === 0) return 'Studio';
  if (l.beds != null && l.bedsInUnit != null) return `${l.beds} of ${l.bedsInUnit} beds`;
  if (l.beds != null) return `${l.beds} ${l.beds === 1 ? 'room' : 'rooms'}`;
  if (l.bedsInUnit != null) return `${l.bedsInUnit} bed unit`;
  return 'Add beds';
}

function placeText(l) {
  const loc = l.location || {};
  if (loc.how === 'pin') return 'Your pin';
  if (loc.how === 'intersection') return `${shortStreet(l.street)} at ${shortStreet(l.cross)}`;
  if (loc.how === 'street') return `On ${shortStreet(l.street)}`;
  if (loc.how === 'place') return `Near ${String(l.place?.label || '').replace(/\s*\([^)]*\)/g, '')}`;
  return null;
}

export default function PostCard({ post, l, cover, pinning, onEdit, onPin, onCancelPin, onRemove, draft, onDraft, open, onToggle, firstName, setFirstName, fit, to = '', setTo }) {
  const c = l.confidence || {};
  const [copied, setCopied] = useState(false);
  const ta = useRef(null);
  const dateConf = c.start === 'edited' || c.end === 'edited' ? 'edited' : (c.start === 'missing' && c.end === 'missing') ? 'missing' : (c.start === 'guessed' || c.end === 'guessed') ? 'guessed' : 'found';
  const bedConf = c.beds === 'edited' || c.bedsInUnit === 'edited' ? 'edited' : c.beds === 'missing' && c.bedsInUnit === 'missing' ? 'missing' : c.beds === 'guessed' ? 'guessed' : 'found';
  const where = placeText(l);
  const locConf = l.location?.how === 'pin' ? 'edited' : l.location?.how === 'intersection' ? 'found' : l.location?.how ? 'guessed' : 'missing';
  const rentText = Number.isFinite(l.rent)
    ? `${money(l.rent)}/mo${l.rentWhole && l.rentWhole !== l.rent ? ` (${money(l.rentWhole)} split ${l.bedsInUnit} ways)` : l.rentWhole ? ' whole unit' : ''}`
    : 'Add rent';

  const copy = async () => {
    const text = draft;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* fall back below */ }
    if (!ok && ta.current) {
      try { ta.current.select(); ok = document.execCommand('copy'); } catch { ok = false; }
    }
    setCopied(ok ? 'Copied' : 'Select the text and copy it');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article className={`lv-card${pinning ? ' pinning' : ''}`} aria-label={`Post ${post.n}`}>
      <header className="lv-card-h">
        <span className="lv-num" aria-hidden="true">{post.n}</span>
        <h3>{l.name}</h3>
        {post.count > 1 && <span className="lv-seen" title="The same street, rent and start month were pasted more than once">seen {post.count} times</span>}
        <span className="lv-spacer" />
        {post.sample && <span className="lv-sample">Sample post</span>}
        <button type="button" className="textlink" onClick={onRemove} aria-label={`Remove post ${post.n}`}>Remove</button>
      </header>

      <div className="lv-chips">
        <Chip conf={Number.isFinite(l.rent) ? c.rent : 'missing'} label="Rent a month" onSave={(v) => onEdit({ rent: num(v.rent) })}
          editor={<input name="rent" inputMode="numeric" defaultValue={l.rent ?? ''} size={6} aria-label="Rent a month in dollars" />}>
          {rentText}
        </Chip>
        <Chip conf={dateConf} label="Dates" wide onSave={(v) => onEdit({ start: v.start || null, end: v.end || null })}
          editor={<>
            <input type="date" name="start" defaultValue={l.start || ''} aria-label="Start date" />
            <input type="date" name="end" defaultValue={l.end || ''} aria-label="End date" />
          </>}>
          {l.start || l.end ? fmtRange(l.start, l.end) : 'Add dates'}
        </Chip>
        <Chip conf={bedConf} label="Beds" onSave={(v) => onEdit({ beds: num(v.beds), bedsInUnit: num(v.bedsInUnit) })}
          editor={<>
            <input name="beds" inputMode="numeric" size={2} defaultValue={l.beds ?? ''} aria-label="Rooms offered (0 for a studio)" />
            <span className="lv-of">of</span>
            <input name="bedsInUnit" inputMode="numeric" size={2} defaultValue={l.bedsInUnit ?? ''} aria-label="Bedrooms in the unit" />
          </>}>
          {bedsText(l)}
        </Chip>
        <Chip conf={l.furnished == null ? 'missing' : c.furnished} label="Furnished"
          onSave={(v) => onEdit({ furnished: v.furnished === 'yes' ? true : v.furnished === 'no' ? false : null })}
          editor={<select name="furnished" defaultValue={l.furnished == null ? '' : l.furnished ? 'yes' : 'no'} aria-label="Furnished">
            <option value="yes">Furnished</option><option value="no">Unfurnished</option><option value="">Not said</option>
          </select>}>
          {l.furnished == null ? 'Furnished?' : l.furnished ? 'Furnished' : 'Unfurnished'}
        </Chip>
        <Chip conf={l.utilities == null ? 'missing' : c.utilities} label="Utilities"
          onSave={(v) => onEdit({ utilities: v.utilities || null })}
          editor={<select name="utilities" defaultValue={l.utilities || ''} aria-label="Utilities">
            <option value="included">Included</option><option value="extra">Extra</option><option value="">Not said</option>
          </select>}>
          {l.utilities == null ? 'Utilities?' : l.utilities === 'included' ? 'Utilities included' : 'Plus utilities'}
        </Chip>
        {where && <span className={`lv-chip static ${locConf}`} title={l.location?.note || ''}>{where}</span>}
        {pinning ? (
          <span className="lv-pinwait" role="status">Click the map <button type="button" className="textlink" onClick={onCancelPin}>Cancel</button></span>
        ) : (
          <button type="button" className={`lv-pin${l.location?.how ? '' : ' need'}`} onClick={onPin}
            title={l.location?.note || ''}>
            {l.location?.how === 'pin' ? 'Move pin' : 'Drop a pin'}
          </button>
        )}
      </div>

      {cover?.note && <p className={`lv-cover${cover.ok === false ? ' bad' : ''}`}>{cover.note}</p>}

      {fit && <FitBlock s={fit} />}

      <div className="lv-reach">
        <button type="button" className="textlink" aria-expanded={open} onClick={onToggle}>{open ? 'Hide message' : 'Reach out'}</button>
        {open && (
          <div className="lv-draft">
            <div className="lv-names">
              <label className="lv-name">Your first name <input value={firstName} onChange={(e) => setFirstName(e.target.value)} size={10} placeholder="optional" /></label>
              <label className="lv-name">Their email <input type="email" value={to} onChange={(e) => setTo?.(e.target.value)} size={16} placeholder="optional"
                autoComplete="off" title="Kept only in this browser. Quorum never reads emails from posts." /></label>
            </div>
            <textarea ref={ta} value={draft} onChange={(e) => onDraft(e.target.value)} rows={5} aria-label={`Message for post ${post.n}`} />
            <div className="lv-draft-f">
              <button type="button" className="btn small" onClick={copy}>Copy</button>
              <a className="lv-mail" href={mailtoHref({ to, title: l.name, body: draft })}
                title={`Opens your mail app${cleanEmail(to) ? ` to ${cleanEmail(to)}` : ''} with this message. You press Send.`}>Email it</a>
              <span className="lv-copied" role="status">{copied || ''}</span>
              <span className="lv-quiet">Quorum sends nothing.</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
