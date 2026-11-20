// Other students who like this home (FICTIONAL samples), ranked by compatibility with you. The score is
// transparent (budget, daily rhythm, campus, homes in common); "Rank with local AI" lets the model re-order them
// with a reason each. Each opens to their roommate profile, calendar included when they share it.
import { useMemo, useState } from 'react';
import { Button, readableOn } from '../components/index.js';
import { sampleStudents, compatibility, myCard, rankByAI } from './share.js';
import { lastStatus } from './assistant.js';
import { PublicCard } from '../views/RoommateView.jsx';
import { go } from './parts.jsx';

let cache = null;
const students = (api) => (cache ||= sampleStudents(api));

export default function Interested({ api, home, profile, share, savedIds }) {
  const me = myCard(profile, share, api);
  const scored = useMemo(() => students(api).filter((x) => x.likes.includes(home.id)).map((x) => ({ ...x, ...compatibility(me, x, savedIds) }))
    .sort((a, b) => b.score - a.score), [home.id, JSON.stringify([me.budget, me.rhythm, me.area]), savedIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ai, setAi] = useState(null);       // [{id, reason}]
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const list = ai ? ai.map((r) => ({ ...scored.find((x) => x.id === r.id), reason: r.reason })).filter((x) => x.id) : scored;
  const rank = async () => { setBusy(true); setErr(null); try { setAi(await rankByAI(me, scored)); } catch (e) { setErr(String(e.message || e)); } setBusy(false); };

  return (
    <div className="ct" onClick={(e) => e.stopPropagation()}>
      <div className="ct-head">
        <b>{scored.length} other student{scored.length === 1 ? '' : 's'} like this home</b>
        <span className="st-sub">{ai ? 'Ranked by local AI' : 'Ranked by compatibility score'} · Fictional sample students</span>
      </div>
      {!share.listed && <p className="st-sub" style={{ marginTop: 6 }}>They cannot see you yet. Turn on "Show me on homes I like" in <button type="button" className="pf-x" onClick={() => go('roommate')}>Roommates</button>.</p>}
      <div className="in-list">
        {list.map((x, i) => (
          <div key={x.id} className="in-row">
            <div className="in-top" onClick={() => setOpen(open === x.id ? null : x.id)}>
              <span className="in-rank">{i + 1}</span>
              <span className="rm-av" style={{ background: x.color, color: readableOn(x.color) }}>{x.name[0]}</span>
              <div className="in-who"><b>{x.name}</b><span className="st-sub">{x.program}</span></div>
              <div className="in-score" title="Compatibility score out of 100"><i style={{ width: `${x.score}%` }} /><span>{x.score}% match</span></div>
              <button type="button" className="pf-x">{open === x.id ? 'Close' : 'View profile'}</button>
            </div>
            {x.reason ? <p className="in-why">{x.reason}</p> : <p className="in-why">{x.parts.slice().sort((a, b) => b.pts / b.max - a.pts / a.max)[0].text}.</p>}
            {open === x.id && (
              <div className="in-open">
                <PublicCard card={x} shares={x.shares} bio={x.bio} api={api} />
                <ul className="in-parts">{x.parts.map((p) => <li key={p.text}><span>{p.pts}/{p.max}</span>{p.text}</li>)}</ul>
              </div>
            )}
          </div>
        ))}
      </div>
      {scored.length > 1 && lastStatus.ok && (
        <div className="ct-acts">
          <Button small onClick={rank} disabled={busy}>{busy ? 'Ranking...' : ai ? 'Rank again with local AI' : 'Rank with local AI'}</Button>
          {ai && <button type="button" className="pf-x" onClick={() => setAi(null)}>Use the score instead</button>}
          {err && <span className="pf-msg bad">{err}</span>}
        </div>
      )}
    </div>
  );
}
