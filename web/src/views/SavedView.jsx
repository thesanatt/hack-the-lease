// Saved: the homes the student hearted, best for their profile week first. Each card is one verdict in
// words, two numbers (rent, weekly travel time) and a "Why this rank?" fold with the engine's detail.
// Ranking: student/rank.js (the You tab's engine with the profile's week and prior). Homes are SYNTHETIC.
import { useMemo, useState } from 'react';
import { Button, MapView } from '../components/index.js';
import Icon from '../components/Icon.jsx';
import { useProfile, useSaved } from '../student/store.js';
import { useRanking, verdict, money, hoursText, fromPrice } from '../student/rank.js';
import { Heart, FitPill, go, short } from '../student/parts.jsx';
import ListingDetails from '../student/ListingDetails.jsx';
import { ContactPanel } from '../student/TourPanel.jsx';
import Interested from '../student/Interested.jsx';
import { useShare, sampleStudents } from '../student/share.js';
import { useTours, dateLabel, clock12 } from '../student/tours.js';
import '../student/student.css';

// A ring for the share of possible weeks where this home is the best of all 30 (the same number Why this rank? gives).
function FitRing({ p }) {
  const pct = Math.round(p * 100), r = 22, c = 2 * Math.PI * r;
  return (
    <div className="sv-ring" role="img" aria-label={`Best home in ${pct}% of your possible weeks`}>
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--sky-soft)" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--sky)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 28 28)" />
        <text x="28" y="32.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--cream)">{pct}%</text>
      </svg>
      <span>best weeks</span>
    </div>
  );
}

function Detail({ item, nScen }) {
  const note = item.note;
  const rows = [...(note?.fits || []), ...(note?.watch || [])].filter((r) => !r.vs);
  return (
    <div className="sv-detail">
      <p>Best of all 30 homes in <b>{Math.round(item.pBest * 100)}%</b> of the {nScen} weeks your schedule could turn out to be. Number {item.pos} of {item.n} overall.</p>
      {rows.length > 0 && (
        <ul>
          {rows.map((r) => (
            <li key={r.key + r.label} className={r.dollars >= 0 ? 'good' : 'bad'}>
              <span className="amt">{r.dollars >= 0 ? '+' : '-'}${Math.abs(Math.round(r.dollars))}/mo</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="st-sub">Dollars compare with the middle of the 30 homes, counting rent, your time and late walks at your values.</p>
    </div>
  );
}

export default function SavedView({ api }) {
  const P = useProfile(api);
  const S = useSaved();
  const { res, busy } = useRanking(api, P.profile);
  const { homeById, placeById } = api.data;
  const [sel, setSel] = useState(null);
  const [contactId, setContactId] = useState(null);
  const [othersId, setOthersId] = useState(null);
  const Sh = useShare();
  const others = useMemo(() => sampleStudents(api), [api]);
  const T = useTours();
  const budget = P.profile?.budget ?? null;

  const items = useMemo(() => {
    const list = S.ids.map((id, i) => {
      const home = homeById.get(id);
      if (!home) return null;
      const r = res?.byId.get(id) || null;
      const rent = r?.rent ?? fromPrice(home);
      return { home, saveIdx: i, ...(r || {}), rent, over: budget != null && rent > budget ? rent - budget : 0 };
    }).filter(Boolean);
    if (res) list.sort((a, b) => (a.over > 0) - (b.over > 0) || a.pos - b.pos);
    return list;
  }, [S.ids, res, budget, homeById]);

  const mapHomes = items.map((it) => ({ ...it.home, short: short(it.home.name) }));
  const rankById = Object.fromEntries(items.map((it, i) => [it.home.id, i + 1]));
  const fitById = res ? Object.fromEntries(items.map((it) => [it.home.id, it.tier === 'great' ? 1 : it.tier === 'good' ? 0.6 : 0.2])) : undefined;
  const mapPlaces = useMemo(() => {
    const ids = new Set((P.profile?.entries || []).map((e) => e.place));
    return [...ids].map((id) => placeById.get(id)).filter(Boolean);
  }, [P.profile, placeById]);
  const shown = sel && items.some((it) => it.home.id === sel) ? sel : items[0]?.home.id;

  if (!items.length) {
    return (
      <div className="st">
        <div className="st-head"><div><h1>Saved homes</h1><p>Homes you like, ranked for your week.</p></div></div>
        <div className="st-card" style={{ padding: 32 }}>
          <p className="st-lead">Nothing saved yet.</p>
          <p className="st-sub" style={{ marginBottom: 16 }}>Tap the heart on any home in Browse. {P.empty ? 'Add your profile first, and Browse will show which homes fit your week.' : ''}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => go('browse')}>Browse homes</Button>
            {P.empty && <Button onClick={() => go('profile')}>Set up my profile</Button>}
          </div>
        </div>
      </div>
    );
  }

  const best = res ? items.find((it) => !it.over) || items[0] : null;
  return (
    <div className="st">
      <div className="st-head">
        <div>
          <h1>Saved homes</h1>
          {best ? <p className="st-lead" style={{ color: 'var(--text)', marginTop: 6 }}>For your week, <b>{short(best.home.name)}</b> is the best of your {items.length}.</p>
            : <p>{items.length} saved. {busy ? 'Ranking them for your week...' : ''}</p>}
        </div>
        <div className="st-head-r">
          <Button onClick={() => go('browse')}>Add more</Button>
        </div>
      </div>

      {P.empty ? (
        <div className="st-banner">
          <p>These are in the order you saved them. Add your profile and Quorum ranks them for the week you actually live.</p>
          <Button variant="primary" small onClick={() => go('profile')}>Set up my profile</Button>
        </div>
      ) : !P.profile?.entries.length ? (
        <div className="st-banner">
          <p>Your profile has no days and times yet, so these are in the order you saved them. Add when you go where, and Quorum ranks them for your week.</p>
          <Button variant="primary" small onClick={() => go('profile')}>Add times</Button>
        </div>
      ) : null}

      <div className="sv-grid">
        <div>
          {items.map((it, i) => {
            const v = res ? verdict(it) : null;
            return (
              <div key={it.home.id} className={`st-card sv-card${i === 0 && res ? ' first' : ''}${shown === it.home.id ? ' sel' : ''}`}
                onClick={() => setSel(it.home.id)}>
                <span className="sv-rank">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="sv-title">
                    <h3>{short(it.home.name)}</h3>
                    {i === 0 && res && !it.over && <span className="st-pill best"><Icon name="star" size={13} label={null} />Best for your week</span>}
                    {res && <FitPill tier={it.tier} />}
                    {it.over > 0 && <span className="st-pill over">{money(it.over)} over budget</span>}
                  </div>
                  <div className="sv-meta">{it.home.area} &middot; {it.note?.roomLabel || `${it.home.rooms.length} rooms`} &middot; Sample listing</div>
                  {v && <p className="sv-why">{v.plus}{v.minus && <> <span className="minus">{v.minus}</span></>}</p>}
                  <div className="sv-facts">
                    <span className="sv-fact big"><Icon name="dollar" size={18} /><b>{money(it.rent)}</b><span>a month</span></span>
                    {it.week && <span className="sv-fact"><Icon name="clock" size={15} /><b>{hoursText(it.week.weeklyMin)}</b><span>a week</span></span>}
                    {res && i === 0 && it.pBest != null && <FitRing p={it.pBest} />}
                  </div>
                  <div className="sv-acts" onClick={(e) => e.stopPropagation()}>
                    {T.forHome(it.home.id) ? (
                      <>
                        <span className="st-pill mine">Tour {dateLabel(new Date(T.forHome(it.home.id).date))}, {clock12(T.forHome(it.home.id).start)}</span>
                        <button type="button" className="pf-x" onClick={() => go(`profile?tour=${it.home.id}`)}>Change</button>
                      </>
                    ) : <Button variant="primary" small onClick={() => go(`profile?tour=${it.home.id}`)}>Schedule a tour</Button>}
                    <Button small pressed={contactId === it.home.id} onClick={() => setContactId(contactId === it.home.id ? null : it.home.id)}>Contact landlord</Button>
                    <Button small pressed={othersId === it.home.id} onClick={() => setOthersId(othersId === it.home.id ? null : it.home.id)}>
                      Others interested ({others.filter((x) => x.likes.includes(it.home.id)).length})
                    </Button>
                  </div>
                  {othersId === it.home.id && <Interested api={api} home={it.home} profile={P.profile} share={Sh.s} savedIds={S.ids} />}
                  {contactId === it.home.id && (
                    <ContactPanel api={api} home={it.home} profile={P.profile} tour={T.forHome(it.home.id)} onClose={() => setContactId(null)} />
                  )}
                  <ListingDetails home={it.home} d={api.data.detailsById?.get(it.home.id)} roomId={it.roomId} />
                </div>
                <Heart on name={short(it.home.name)} onClick={() => S.toggle(it.home.id)} />
                {res && it.note && (
                  <details className="sv-more" onClick={(e) => e.stopPropagation()}>
                    <summary>Why this rank?</summary>
                    <Detail item={it} nScen={res.nScen} />
                  </details>
                )}
              </div>
            );
          })}
          {res && (
            <p className="st-engine">
              Ranked across {res.nScen} weeks your schedule could turn out to be, about {(Math.round(res.trips / 100) * 100).toLocaleString('en-US')} door-to-door trips
              on the real TheRide and U-M bus timetables, in {(res.ms / 1000).toFixed(1)} s in this browser.
            </p>
          )}
          <button type="button" className="textlink" style={{ marginTop: 8 }} onClick={S.clear}>Clear saved homes</button>
        </div>
        <div className="sv-map">
          <MapView homes={mapHomes} places={mapPlaces} selectedHomeId={shown} onHomeClick={setSel} labelIds={[shown]}
            fitById={fitById} rankById={rankById} height={560} fit="all" />
        </div>
      </div>
    </div>
  );
}
