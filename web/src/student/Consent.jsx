// A confirm step before the student shares something: their files and notes with Quorum (My profile), or parts of
// their roommate profile with other students. "Yes, don't ask again" is remembered per kind on this device.
//   const [ask, modal] = useConsent('profile');   ... if (!(await ask({ items }))) return;   ... render {modal}
import { useRef, useState } from 'react';
import { Button } from '../components/index.js';

const KEY = (kind) => `quorum.consent.${kind}`;
const remembered = (kind) => { try { return localStorage.getItem(KEY(kind)) === 'always'; } catch { return false; } };

const TEXT = {
  profile: {
    title: "You're sharing this with Quorum",
    body: 'Quorum reads it to build your profile: your week, budget and what you want in a home. It is read on this device, and when the local AI is on, by a model running on this laptop. Emails and phone numbers are dropped. Nothing is uploaded.',
    q: 'Do you want to share it?',
  },
  public: {
    title: "You're making this public",
    body: 'Other students who like the same homes will be able to see it on your roommate profile. You can hide it again at any time.',
    q: 'Do you want to share it publicly?',
  },
};

export function useConsent(kind) {
  const [req, setReq] = useState(null);   // { items, resolve }
  const ref = useRef(null);
  const ask = (opts = {}) => {
    if (remembered(kind)) return Promise.resolve(true);
    return new Promise((resolve) => { ref.current = resolve; setReq({ items: opts.items || [] }); });
  };
  const done = (ok, always = false) => {
    if (always) { try { localStorage.setItem(KEY(kind), 'always'); } catch { /* not remembered */ } }
    setReq(null);
    ref.current?.(ok);
  };
  const t = TEXT[kind];
  const modal = req ? (
    <div className="cs-back" role="dialog" aria-modal="true" aria-labelledby="cs-title" onKeyDown={(e) => { if (e.key === 'Escape') done(false); }}>
      <div className="cs-card">
        <h2 id="cs-title">{t.title}</h2>
        {req.items.length > 0 && <ul className="cs-items">{req.items.map((x) => <li key={x}>{x}</li>)}</ul>}
        <p>{t.body}</p>
        <p><b>{t.q}</b></p>
        <div className="cs-acts">
          <Button variant="primary" onClick={() => done(true)}>Yes, this time</Button>
          <Button onClick={() => done(true, true)}>Yes, don't ask again</Button>
          <button type="button" className="pf-x" onClick={() => done(false)} autoFocus>Cancel</button>
        </div>
      </div>
    </div>
  ) : null;
  return [ask, modal];
}

export function forgetConsent() { try { localStorage.removeItem(KEY('profile')); localStorage.removeItem(KEY('public')); } catch { /* nothing */ } }
