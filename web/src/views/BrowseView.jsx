// Browse: the sample homes, nine to a page, three across. With a profile, each card checks the home against
// what the student asked for (student/match.js): "Includes" and "Does not include", from real walk times,
// router trip times and the listing's rooms. Without a profile it shows the plain listing facts.
import Icon, { iconFor } from '../components/Icon.jsx';
import { useEffect, useMemo, useState } from 'react';
import { Button, Seg } from '../components/index.js';
import { useProfile, useSaved } from '../student/store.js';
import { useRanking, money, fromPrice } from '../student/rank.js';
import { matchHome, mainPlace } from '../student/match.js';
import { Heart, FitPill, go, short, beds } from '../student/parts.jsx';
import '../student/student.css';

const PAGE = 9;

// A topic icon (bus, walk, moon, $...) before a fact line; the line's own words say the same, so it is decorative.
function FactIcon({ text }) {
  const n = iconFor(text);
  return n ? <Icon name={n} size={14} label={null} className="br-topic" /> : null;
}

function Check({ ok }) {
  return ok ? (
    <svg className="br-ic ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg className="br-ic no" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  );
}

function Facts({ home }) {
  const sq = home.rooms.map((r) => r.sqft);
  const priv = home.rooms.filter((r) => r.bath === 'private').length;
  return (
    <ul className="br-list">
      <li><Check ok />{home.rooms.length} bedroom{home.rooms.length > 1 ? 's' : ''}, {Math.min(...sq)} to {Math.max(...sq)} sq ft</li>
      <li><Check ok={priv > 0} />{priv ? `${priv} private bathroom${priv > 1 ? 's' : ''}` : 'Shared bathrooms'}</li>
      <li><Check ok />Utilities about {money(home.utilities / home.rooms.length)} per room</li>
    </ul>
  );
}

export default function BrowseView({ api }) {
  const P = useProfile(api);
  const S = useSaved();
  const { res, busy } = useRanking(api, P.profile);
  const { homes } = api.data;
  const profile = P.profile;
  const budget = profile?.budget ?? null;
  const [area, setArea] = useState('all');
  const [inBudget, setInBudget] = useState(false);
  const [sort, setSort] = useState(null); // null: Most matches when the profile asks for things, else Best fit
  const [page, setPage] = useState(0);

  const areas = useMemo(() => [...new Set(homes.map((h) => h.area))].sort(), [homes]);
  const anchor = useMemo(() => (profile ? mainPlace(api, profile) : null), [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const medianWeekMin = useMemo(() => {
    if (!res?.weekMap) return null;
    const v = [...res.weekMap.values()].map((w) => w.weeklyMin).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  }, [res]);

  const all = useMemo(() => homes.map((h) => {
    const r = res?.byId.get(h.id) || null;
    const m = profile ? matchHome({ api, home: h, profile, item: r, medianWeekMin, anchor }) : null;
    return { home: h, r, m, price: r?.rent ?? fromPrice(h), from: fromPrice(h) };
  }), [homes, res, profile, medianWeekMin, anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyAsk = all.some((x) => (x.m?.asked || 0) > 0);
  const sortKey = sort || (anyAsk ? 'match' : 'fit');
  const list = useMemo(() => {
    let l = all;
    if (area !== 'all') l = l.filter((x) => x.home.area === area);
    if (inBudget && budget) l = l.filter((x) => x.price <= budget);
    const cmp = {
      fit: (a, b) => (a.r && b.r ? a.r.pos - b.r.pos : a.from - b.from),
      match: (a, b) => (b.m?.met ?? 0) - (a.m?.met ?? 0) || (a.r && b.r ? a.r.pos - b.r.pos : a.from - b.from),
      price: (a, b) => a.from - b.from,
    }[sortKey] || ((a, b) => a.from - b.from);
    return [...l].sort(cmp);
  }, [all, area, inBudget, budget, sortKey]);

  useEffect(() => { setPage(0); }, [area, inBudget, sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const shown = list.slice(pg * PAGE, pg * PAGE + PAGE);
  const turn = (i) => { setPage(i); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const sortOptions = res
    ? [{ value: 'fit', label: 'Best fit' }, { value: 'match', label: 'Most matches' }, { value: 'price', label: 'Lowest rent' }]
    : [{ value: 'price', label: 'Lowest rent' }];

  return (
    <div className="st">
      <div className="st-head">
        <div>
          <h1>Browse homes</h1>
          <p>{homes.length} sample homes{profile ? ', checked against your week' : ''}. Tap a heart to save.</p>
        </div>
        <div className="st-head-r">
          <button type="button" className="textlink" onClick={() => go('listings')}>Found a post in a group chat? Paste it</button>
          <Button variant="primary" onClick={() => go('saved')}>Saved ({S.ids.length})</Button>
        </div>
      </div>

      {P.empty ? (
        <div className="st-banner">
          <p>Add your profile and every home shows what it has and does not have for you: budget, room size, how close it is, your late trips home.</p>
          <Button variant="primary" small onClick={() => go('profile')}>Set up my profile</Button>
        </div>
      ) : !profile?.entries.length ? (
        <div className="st-banner">
          <p>Your profile has no days and times yet. Cards check what you asked for; add when you go where to see trip times and fit.</p>
          <Button variant="primary" small onClick={() => go('profile')}>Add times</Button>
        </div>
      ) : busy && !res ? <div className="st-banner plain"><p>Checking every home against your week...</p></div> : null}

      <div className="br-bar">
        <select className="st-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
          <option value="all">All areas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {budget ? <Button small pressed={inBudget} onClick={() => setInBudget((v) => !v)}>Within ${budget.toLocaleString('en-US')}</Button> : null}
        <span className="lbl" style={{ marginLeft: 'auto' }}>Sort</span>
        <Seg label="Sort" value={res ? sortKey : 'price'} onChange={setSort} options={sortOptions} />
      </div>
      {res && (
        <details className="sv-more br-why" style={{ margin: '-6px 0 14px' }}>
          <summary>Why?</summary>
          <p className="st-sub"><b>Has N of M</b> counts what you asked for. The fit badge is the all-in score for your week: rent plus your
          time, late nights and room, across the weeks your schedule could turn out to be.</p>
        </details>
      )}

      <div className="br-grid">
        {shown.map(({ home, r, m, price }) => (
          <article key={home.id} className="st-card br-card">
            <div className="br-top">
              <div className="grow">
                <h3>{short(home.name)}</h3>
                <div className="st-sub">{home.area} &middot; {beds(home)} &middot; Sample listing</div>
              </div>
              <Heart on={S.has(home.id)} name={short(home.name)} onClick={() => S.toggle(home.id)} />
            </div>
            <div className="br-price-row">
              <div className="br-price">{money(price)}<span> /mo{r?.note?.roomLabel ? `, ${r.note.roomLabel}` : ' and up'}</span></div>
              {r && <FitPill tier={r.tier} />}
            </div>
            {m ? (
              <>
                {m.asked > 0 && <p className="br-score"><b>Has {m.met} of {m.asked}</b> things you asked for</p>}
                {m.yes.length > 0 && (
                  <div className="br-sec">
                    <h4>Includes</h4>
                    <ul className="br-list">{m.yes.map((l) => <li key={l.key}><Check ok /><span><FactIcon text={l.text} />{l.text}</span></li>)}</ul>
                  </div>
                )}
                {m.no.length > 0 && (
                  <div className="br-sec">
                    <h4>Does not include</h4>
                    <ul className="br-list miss">{m.no.map((l) => <li key={l.key}><Check ok={false} /><span><FactIcon text={l.text} />{l.text}</span></li>)}</ul>
                  </div>
                )}
                {m.unknown.length > 0 && <p className="st-sub">Not in the listing: {m.unknown.join(', ')}.</p>}
              </>
            ) : <Facts home={home} />}
          </article>
        ))}
      </div>
      {!list.length && <p className="st-sub">No homes match. Try another area.</p>}

      {pages > 1 && (
        <nav className="br-pages" aria-label="Pages">
          <Button small onClick={() => turn(pg - 1)} disabled={pg === 0}>Previous</Button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" className="br-pg" aria-current={i === pg ? 'page' : undefined} onClick={() => turn(i)}>{i + 1}</button>
          ))}
          <Button small onClick={() => turn(pg + 1)} disabled={pg === pages - 1}>Next</Button>
          <span className="st-sub" style={{ marginLeft: 8 }}>{pg * PAGE + 1} to {Math.min(list.length, pg * PAGE + PAGE)} of {list.length}</span>
        </nav>
      )}
      <p className="st-engine">Homes, rooms and rents are made up for the demo, at real street locations. Walk times use real streets; trip times use the real bus timetables.</p>
    </div>
  );
}
