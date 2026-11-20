// Listings (#listings): paste a sublet or room post from any group or site; Quorum reads it (engine/listing.js,
// rules, no language model), puts it on the map, routes the student's week from it on the real timetables, ranks
// it against the sample homes by cost to you a month (the You tab's numbers), and drafts a first message to copy.
// Posts stay in this browser. docs/LISTINGS.md part 3.
import { useEffect, useMemo, useState } from 'react';
import { Button, MapView, NotBuilt } from '../components/index.js';
import { useConfigVersion } from '../engine/useConfig.js';
import { parsePost, dedupeKey, draftMessage, redact, covers, shortName } from '../../../engine/listing.js';
import { money } from './me/format.js';
import { loadPosts, savePosts, newId } from './listings/store.js';
import {
  SEMESTERS, weekOf, centroidOf, effective, routable, postPointId, rankAll, shownRows, bestSentence, tripFact, tourFact,
} from './listings/compute.js';
import PostCard from './listings/PostCard.jsx';
import Compare from './listings/Compare.jsx';
import { fitScores, datesScore } from './listings/fit.js';
import { fitLine, missingLine, answerSentence } from './listings/plain.js';
import { pickFromHash } from '../hashParam.js';
import './listings/listings.css';

let streetsP = null;
let samplesP = null;
const getJson = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const loadStreets = () => (streetsP ||= getJson('./data/streets/streets.geojson'));
const loadSamples = () => (samplesP ||= getJson('./data/posts_sample.json'));

const round5 = (v) => Math.round(v * 1e5) / 1e5;
// Map label for a post: the street part only ("Plymouth Rd" for "Plymouth Rd near Huron Pkwy"), cut at a word
// and never with a period, so it does not read like an abbreviation. The full name is in the tooltip and the card.
const mapName = (s, n = 20) => {
  const t = String(s).split(' near ')[0];
  if (t.length <= n) return t;
  const w = t.slice(0, n + 1).split(' ');
  return (w.length > 1 ? w.slice(0, -1).join(' ') : t.slice(0, n)).trim();
};

export default function ListingsView({ api }) {
  const version = useConfigVersion(api);
  const { personas, homes, places, placeById } = api.data;
  const [personaId, setPersonaId] = useState(() => pickFromHash('who', personas, personas[0]?.id)); // #listings?who=<id>
  const persona = personas.find((p) => p.id === personaId) || personas[0];
  const [streets, setStreets] = useState(null);
  const [samples, setSamples] = useState(null);
  const [posts, setPosts] = useState(loadPosts);
  const [text, setText] = useState('');
  const [sampleIdx, setSampleIdx] = useState(0);
  const [fromSample, setFromSample] = useState(null);
  const [semKey, setSemKey] = useState('fall');
  const [pinFor, setPinFor] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [firstName, setFirstName] = useState('');
  const [msg, setMsg] = useState(null);
  const [ranked, setRanked] = useState(null);

  useEffect(() => {
    let live = true;
    loadStreets().then((s) => live && setStreets(s || { features: [] }));
    loadSamples().then((s) => live && setSamples(s));
    return () => { live = false; };
  }, []);
  useEffect(() => { savePosts(posts); }, [posts]);

  const routine = useMemo(() => weekOf(persona), [persona]);
  const centroid = useMemo(() => centroidOf(routine, placeById), [routine, placeById]);
  const sem = SEMESTERS[semKey];

  // parse every stored post (fast once the street index is built); a street-only post moves with the student
  const parsed = useMemo(() => {
    if (!streets) return new Map();
    return new Map(posts.map((p) => [p.id, parsePost(p.text, { streets, places, centroid })]));
  }, [posts, streets, places, centroid]);

  const items = useMemo(() => posts.map((post) => {
    const e = effective(post, parsed.get(post.id));
    return { post, l: e ? { ...e, name: shortName(e) || `Post ${post.n}` } : null };
  }), [posts, parsed]);

  // the You tab's starting values: a fresh posterior (seed 7), 200 draws (seed 3), before any pick
  const thetas = useMemo(() => {
    const prefs = api.mod('prefs');
    if (!prefs?.createPosterior) return null;
    return prefs.draws(prefs.createPosterior({ seed: 7, cfg: api.config }), api.config.posteriorDraws, 3);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const rankKey = JSON.stringify([personaId, version, items.map((it) => [it.post.id, it.l?.rent, it.l?.location?.lat, it.l?.location?.lon])]);
  useEffect(() => {
    if (!thetas || !streets) return undefined;
    const id = setTimeout(() => {
      try {
        const r = rankAll({ api, persona, routine, items: items.filter((it) => it.l), thetas });
        setRanked(r ? { ...r, key: rankKey } : null);
      } catch (e) { console.error(e); setRanked(null); }
    }, 0);
    return () => clearTimeout(id);
  }, [rankKey, thetas, streets]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = ranked?.key === rankKey;
  const rows = useMemo(() => (ranked ? shownRows(ranked.rows, 3) : null), [ranked]);
  const coverById = useMemo(() => new Map(items.filter((it) => it.l).map((it) => [it.post.id, covers(it.l, sem)])), [items, sem]);
  const notes = useMemo(() => new Map([...coverById].filter(([, c]) => c.ok === false).map(([k, c]) => [k, c.note])), [coverById]);
  const unranked = items.filter((it) => it.l && (!Number.isFinite(it.l.rent) || !routable(it.l))).map((it) => ({
    n: it.post.n, name: it.l.name,
    why: [!Number.isFinite(it.l.rent) && 'add the rent', !routable(it.l) && 'drop a pin'].filter(Boolean).join(' and '),
  }));
  // Fit scores among the compared places (docs/ROUND3.md part 2): same rows as the table, dates for the chosen semester
  const fits = useMemo(() => {
    if (!rows || !fresh) return null;
    const conf = new Map(items.filter((it) => it.l).map((it) => [it.post.id, it.l.confidence]));
    return fitScores(rows, { dates: (r) => (r.kind === 'post' ? datesScore(coverById.get(r.postId), conf.get(r.postId)) : 100) });
  }, [rows, fresh, items, coverById]);
  const sentence = rows && fresh ? bestSentence(rows, money, { fits: (r) => coverById.get(r.postId)?.ok, semLabel: sem.label }) : null;
  // Plain words for the simple view (docs/SIMPLE.md), built from the same rows, Fit scores and dates.
  const endById = useMemo(() => new Map(items.filter((it) => it.l).map((it) => [it.post.id, it.l.end || null])), [items]);
  const answer = rows && fresh ? answerSentence(rows, money, {
    coverOf: (r) => coverById.get(r.postId), endOf: (r) => endById.get(r.postId), semLabel: sem.label,
  }) : null;
  const lines = useMemo(() => (fits && rows
    ? new Map(rows.map((r) => [r.id, fitLine(fits.get(r.id), r.kind === 'post' ? coverById.get(r.postId) : null)]))
    : null), [fits, rows, coverById]);
  if (rows && fresh) console.log('DBG', JSON.stringify(rows.map((r) => [r.name, Math.round(r.cost), r.dollars && Object.fromEntries(Object.entries(r.dollars).map(([k, v]) => [k, Math.round(v)]))])));
  const topHomeIds = useMemo(() => (ranked ? ranked.rows.filter((r) => r.kind === 'home').slice(0, 3).map((r) => r.id) : []), [ranked]);

  // draft for the open card
  const openItem = items.find((it) => it.post.id === openId && it.l);
  const facts = useMemo(() => {
    if (!openItem || !ranked) return {};
    const pid = postPointId(openItem.post);
    const w = ranked.weekMap?.get(pid);
    return { trip: tripFact(w, placeById), tour: routable(openItem.l) ? tourFact(api, openItem.l, pid, routine) : null };
  }, [openId, ranked, routine]); // eslint-disable-line react-hooks/exhaustive-deps
  const autoDraft = openItem ? draftMessage({ listing: openItem.l, facts, student: { firstName } }) : '';

  // actions
  const trySample = () => {
    const list = samples?.posts || [];
    if (!list.length) return;
    const p = list[sampleIdx % list.length];
    setText(p.text); setFromSample(p.text); setSampleIdx((i) => i + 1); setMsg(null);
  };
  const add = () => {
    const raw = text.trim();
    if (!raw || !streets) return;
    const t = redact(raw);
    const l = parsePost(t, { streets, places, centroid });
    const key = dedupeKey(l, t);
    const dup = posts.find((p) => p.key === key || dedupeKey(effective(p, parsed.get(p.id)) || {}, p.text) === key);
    if (dup) {
      const c = (dup.count || 1) + 1;
      setPosts((ps) => ps.map((p) => (p.id === dup.id ? { ...p, count: c } : p)));
      setMsg(`Same as post ${dup.n}, so it was merged: seen ${c} times.`);
    } else {
      const n = Math.max(0, ...posts.map((p) => p.n || 0)) + 1;
      const post = { id: newId(), n, text: t, key, count: 1, sample: fromSample === raw.trim() || fromSample === text, edits: {}, pin: null };
      setPosts((ps) => [...ps, post]);
      setMsg(t !== raw ? 'Contact details were left out.' : null);
      if (!l.location?.how) setPinFor(post.id);
    }
    setText(''); setFromSample(null);
  };
  const setTo = (id, v) => setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, to: String(v).slice(0, 120) } : p)));
  const edit = (id, patch) => setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, edits: { ...p.edits, ...patch } } : p)));
  const remove = (id) => {
    setPosts((ps) => ps.filter((p) => p.id !== id));
    if (pinFor === id) setPinFor(null);
    if (openId === id) setOpenId(null);
  };
  const clearAll = () => { setPosts([]); setPinFor(null); setOpenId(null); setDrafts({}); setMsg(null); };
  const onMapClick = pinFor ? (ll) => {
    setPosts((ps) => ps.map((p) => (p.id === pinFor ? { ...p, pin: { lat: round5(ll.lat), lon: round5(ll.lng) } } : p)));
    setPinFor(null);
  } : undefined;

  const mapHomes = useMemo(() => homes.map((h) => ({ ...h, short: h.name.split(' ').slice(0, 2).join(' ') })), [homes]);
  const faint = useMemo(() => Object.fromEntries(homes.map((h) => [h.id, 0])), [homes]);
  const pins = items.filter((it) => it.l && routable(it.l)).map((it) => ({
    id: postPointId(it.post), lat: it.l.location.lat, lon: it.l.location.lon,
    label: `Post ${it.post.n}: ${it.l.name}`, short: `${it.post.n} ${mapName(it.l.name)}`, tiny: String(it.post.n),
  }));
  const pinPost = posts.find((p) => p.id === pinFor);

  if (!persona) return <div className="note warn">No personas are loaded.</div>;
  if (!api.has('listing')) return <NotBuilt module="listing" what="reading pasted posts" />;

  return (
    <div className="lv">
      <p className="lv-lede num-detail">Paste posts you can see. Quorum does not collect posts on its own, and nothing leaves this browser.</p>

      <div className="lv-who">
        <span role="group" aria-label="Whose week" className="lv-group">
          <span className="lv-l">Whose week</span>
          {personas.map((p) => (
            <button key={p.id} type="button" className="lv-pchip" aria-pressed={p.id === personaId} onClick={() => setPersonaId(p.id)} title={p.program}>
              {p.name}
            </button>
          ))}
        </span>
        <span role="group" aria-label="Need it for" className="lv-group">
          <span className="lv-l">Need it for</span>
          {Object.entries(SEMESTERS).map(([k, s]) => (
            <button key={k} type="button" className="lv-pchip" aria-pressed={k === semKey} onClick={() => setSemKey(k)} title={s.title}>
              {s.label}
            </button>
          ))}
        </span>
      </div>

      <section className="lv-top">
        <div className="lv-left">
          <div className="lv-paste">
            <label htmlFor="lv-text" className="lv-paste-l">Paste a post from any group or site</label>
            <p className="lv-help simple-only">Copy a room post from a group chat or Facebook, paste it here and press Add. It stays on your computer.</p>
            <textarea id="lv-text" value={text} rows={4} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }}
              placeholder="Subletting my room on Hill St near Church, May 1 to Aug 15, $780/mo utilities included..." />
            <div className="lv-paste-f">
              <Button variant="primary" onClick={add} disabled={!text.trim() || !streets}>Add</Button>
              <button type="button" className="textlink" onClick={trySample} disabled={!samples?.posts?.length}>Try a sample post</button>
              <span className="lv-spacer" />
              {posts.length > 0 && <button type="button" className="textlink" onClick={clearAll}>Clear pasted posts</button>}
            </div>
            {msg && <p className="lv-msg" role="status">{msg}</p>}
          </div>

          <div className="lv-cards">
            {!streets && <p className="lv-wait" role="status">Loading street names</p>}
            {items.filter((it) => it.l).map((it) => (
              <PostCard key={it.post.id} post={it.post} l={it.l} cover={coverById.get(it.post.id)}
                pinning={pinFor === it.post.id}
                onEdit={(patch) => edit(it.post.id, patch)}
                onPin={() => setPinFor(it.post.id)} onCancelPin={() => setPinFor(null)}
                onRemove={() => remove(it.post.id)}
                open={openId === it.post.id} onToggle={() => setOpenId((o) => (o === it.post.id ? null : it.post.id))}
                draft={openId === it.post.id ? (drafts[it.post.id] ?? autoDraft) : ''}
                onDraft={(v) => setDrafts((d) => ({ ...d, [it.post.id]: v }))}
                fit={fits?.get(postPointId(it.post)) || null}
                line={fits?.get(postPointId(it.post))
                  ? fitLine(fits.get(postPointId(it.post)), coverById.get(it.post.id))
                  : missingLine(it.l, routable(it.l)) || (coverById.get(it.post.id)?.ok === false ? fitLine(null, coverById.get(it.post.id)) : null)}
                to={it.post.to || ''} setTo={(v) => setTo(it.post.id, v)}
                firstName={firstName} setFirstName={(v) => { setFirstName(v); setDrafts((d) => { const n = { ...d }; delete n[it.post.id]; return n; }); }} />
            ))}
          </div>
        </div>

        <div className="lv-mapcol">
          <div className={`lv-map${pinFor ? ' pinning' : ''}`}>
            <MapView homes={mapHomes} places={pins} fitById={faint} labelIds={topHomeIds} height={520} fit="all"
              playable={false} onMapClick={onMapClick} />
            {pinPost && <p className="lv-mapcue" role="status">Click the map to place post {pinPost.n}</p>}
          </div>
          <p className="lv-legend"><span className="sq" aria-hidden="true" /> your posts <span className="dt" aria-hidden="true" /> sample homes</p>
        </div>
      </section>

      <section className="lv-sec" aria-labelledby="lv-cmp-h">
        <h2 id="lv-cmp-h">How they compare for your week</h2>
        <Compare rows={rows} notes={notes} sentence={sentence}
          waiting={!fresh ? 'Routing your week from each place' : (!items.length ? 'Paste a post to see it next to the best sample homes.' : null)}
          unranked={unranked} fits={fits} answer={answer} lines={lines} />
      </section>

      <div className="lv-next">
        <a className="lv-next-btn" href="#group">Living with friends? Split a house</a>
      </div>
    </div>
  );
}
