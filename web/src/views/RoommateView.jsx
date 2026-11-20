// Roommate profile: what other students see about you when you like the same home. Built from My profile;
// nothing is shown until you share it, by switch or by telling Quorum ("make my calendar public").
// In this demo it stays on this laptop; the other students you see are FICTIONAL samples.
import { useEffect, useState } from 'react';
import { Button } from '../components/index.js';
import { useProfile } from '../student/store.js';
import { useShare, SHARE_ITEMS, shareByRules, shareByAI, myCard } from '../student/share.js';
import { assistantStatus, lastStatus } from '../student/assistant.js';
import Calendar from '../student/Calendar.jsx';
import { useConsent } from '../student/Consent.jsx';
import { go } from '../student/parts.jsx';
import '../student/student.css';

const RHYTHM = { night: 'Night owl', early: 'Early bird', regular: 'Regular hours' };

export function PublicCard({ card, shares, bio, api, compact = false }) {
  const shown = Object.values(shares || {}).some(Boolean);
  return (
    <div className="rm-card">
      <div className="rm-head">
        <span className="rm-av" style={{ background: card.color || 'var(--accent)' }}>{(card.name || '?')[0]}</span>
        <div>
          <b>{card.name}</b>
          <div className="st-sub">{[shares.program && card.program, shares.habits && RHYTHM[card.rhythm], card.area].filter(Boolean).join(' · ') || 'No details shared'}</div>
        </div>
        {shares.budget && card.budget ? <span className="st-pill mine" style={{ marginLeft: 'auto' }}>${card.budget.toLocaleString('en-US')}/mo budget</span> : null}
      </div>
      {shares.bio && bio && <p className="rm-bio">{bio}</p>}
      {shares.wishes && card.wishes?.length > 0 && <div className="pf-chips">{card.wishes.slice(0, 8).map((w) => <span key={w} className="st-pill typ">{w}</span>)}</div>}
      {shares.calendar && card.week?.length > 0 && !compact && <Calendar entries={card.week} placeById={api.data.placeById} />}
      {shares.calendar && card.week?.length > 0 && compact && <p className="st-sub">Calendar shared ({card.week.length} weekly entries).</p>}
      {!shown && <p className="st-sub">Private. Nothing is shown to other students.</p>}
    </div>
  );
}

export default function RoommateView({ api }) {
  const P = useProfile(api);
  const S = useShare();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [ai, setAi] = useState(null);
  useEffect(() => { assistantStatus().then(setAi); }, []);

  const [askPublic, consentModal] = useConsent('public');
  // Every change that turns something on goes through the public-sharing check first.
  const setPublic = async (patch) => {
    const turningOn = Object.entries(patch).filter(([k, v]) => k in SHARE_ITEMS && v === true && !S.s[k]).map(([k]) => SHARE_ITEMS[k]);
    if (turningOn.length && !(await askPublic({ items: turningOn }))) return false;
    S.set(patch);
    return true;
  };
  const card = myCard(P.profile, S.s, api);
  const run = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    const before = { ...S.s };
    try {
      let reply = '', patch;
      if (lastStatus.ok) ({ reply, patch } = await shareByAI(t, S.s)); else patch = shareByRules(t);
      if (!Object.keys(patch).length) setOut({ reply: reply || 'Nothing changed. Try "make my calendar public" or "hide my budget".', undo: null });
      else if (!(await setPublic(patch))) setOut({ reply: 'Nothing was made public.', undo: null });
      else {
        const said = Object.entries(patch).filter(([k]) => k in SHARE_ITEMS).map(([k, v]) => `${SHARE_ITEMS[k]}: ${v ? 'shown' : 'hidden'}`);
        if (patch.bioText) said.push('Bio updated');
        if (patch.name) said.push(`Name: ${patch.name}`);
        setOut({ reply, said, undo: before });
      }
      setText('');
    } catch (e) { setOut({ reply: String(e.message || e), undo: null }); }
    setBusy(false);
  };

  return (
    <div className="st">
      {consentModal}
      <div className="st-head">
        <div>
          <h1>Roommate profile</h1>
          <p>What other students see when you like the same home. Built from My profile; you choose what is shown.</p>
        </div>
        <div className="st-head-r"><Button onClick={() => go('saved')}>See who likes my homes</Button></div>
      </div>
      {P.empty && <div className="st-banner"><p>Your profile is empty, so there is little to share. Add your week first.</p><Button variant="primary" small onClick={() => go('profile')}>My profile</Button></div>}
      <div className="pf-grid">
        <div className="st-stack">
          <div className="st-card pf-sec">
            <h2>What others see</h2>
            <PublicCard card={card} shares={S.s} bio={S.s.bioText} api={api} />
          </div>
        </div>
        <aside className="pf-side">
          <div className="st-card pf-add">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Tell Quorum what to share</h2>
              <span className={`st-pill ${ai?.ok ? 'mine' : 'typ'}`}>{ai == null ? 'Checking...' : ai.ok ? `Local AI: ${lastStatus.model}` : 'Local AI off'}</span>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="What to share"
              placeholder='"Make my calendar public to other users", "hide my budget", "bio: CS junior, quiet, loves cooking"' />
            <div><Button variant="primary" small onClick={run} disabled={!text.trim() || busy}>{busy ? 'Thinking...' : 'Do it'}</Button></div>
            {out && (
              <div className="as-out">
                {out.reply && <p>{out.reply}</p>}
                {out.said?.length > 0 && <ul>{out.said.map((x) => <li key={x}>{x}</li>)}</ul>}
                {out.undo && <button type="button" className="pf-x" onClick={() => { S.replace(out.undo); setOut(null); }}>Undo</button>}
              </div>
            )}
          </div>
          <div className="st-card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Shown to others</h2>
            <div className="rm-switches">
              {Object.entries(SHARE_ITEMS).map(([k, label]) => (
                <label key={k}><input type="checkbox" checked={!!S.s[k]} onChange={(e) => setPublic({ [k]: e.target.checked })} /> {label}</label>
              ))}
            </div>
            <label className="rm-field">First name <input value={S.s.name} onChange={(e) => S.set({ name: e.target.value.slice(0, 20) })} placeholder="optional" /></label>
            <label className="rm-field">Bio <textarea value={S.s.bioText} onChange={async (e) => { const v = e.target.value.slice(0, 280); if (await setPublic({ bio: true })) S.set({ bioText: v }); }} placeholder="A sentence about you as a roommate" /></label>
            <p className="st-sub" style={{ marginTop: 8 }}>In this demo your profile stays on this laptop. Other students shown are fictional samples.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
