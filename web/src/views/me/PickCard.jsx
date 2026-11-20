// "Which week would you rather live?" Two real homes side by side, each with its week ribbon and three numbers,
// and a "This one" button under each. Progress shows as dots.
// Props: api, pair ({i, j, ig, mu, s2}), options (flat option list), weekMap, routineWeek, nPicks, stop ({stop, text}),
//        canAuto (persona has demo theta), onAnswer(choice 'A'|'B'|'skip'), onAuto(), onAutoAll(), last (last pick summary),
//        busy, personaName (optional, names the demo auto-answer button), dusk (optional, seconds; evening band on the ribbons)
import { useEffect, useState } from 'react';
import { AutoStrip } from '../../components/index.js';
import { money } from './format.js';
import { darkOf } from './HomeList.jsx';
import { nightCounts, countWord } from './answer.js';
import './calendar/parts.css';

// Nights with a trip that has no allowed ride or walks after dark. Counted from the week's own trips.
export function lateNights(week) {
  if (!week) return 0;
  const days = new Set();
  for (const t of week.trips || []) if (t.stranded || (t.darkMin || 0) > 0.5) days.add(t.day);
  return days.size;
}

const hours = (min) => (min == null || !Number.isFinite(min) ? '--' : (min / 60).toFixed(1));

// A number with its unit; the two cards sit side by side, so the numbers compare directly.
function Num({ text, unit, flag, title, className = '' }) {
  return (
    <div className={`mp-num ${className}`} title={title}>
      <span className="v">{text}</span>
      <span className="u">{unit}{flag && <span className="mp-flag"> {flag}</span>}</span>
    </div>
  );
}

// The late nights in words, for simple mode. Same counting as lateNights.
function plainNights(week) {
  const c = nightCounts(week);
  const n = (k) => `${countWord(k)} night${k === 1 ? '' : 's'} a week`;
  if (!week) return '';
  if (c.any === 0) return 'Never walk in the dark';
  if (c.noRide > 0) return `Stuck without a ride ${n(c.noRide)}`;
  return `Walk in the dark ${n(c.dark)}`;
}

function Option({ api, opt, other, week, otherWeek, routineWeek, onPick, busy, tag, dusk }) {
  const home = api.data.homeById.get(opt.homeId);
  const r = opt.room;
  const bath = { private: 'private bath', half: 'half bath', shared: 'shared bath' }[r.bath] || r.bath;
  const nA = lateNights(week), nB = lateNights(otherWeek);
  const tA = week?.weeklyMin ?? 0, tB = otherWeek?.weeklyMin ?? 0;
  const dark = Math.round(darkOf(week, api.config));
  return (
    <div className="mp-opt">
      <div className="mp-opt-card">
        <div>
          <h3 className="mp-name">{home?.name}</h3>
          <div className="room">{r.label}<span className="num-detail">, {r.sqft} sq ft</span>, {bath}</div>
        </div>
        {week && <AutoStrip compact trips={week.trips} entries={routineWeek} dusk={dusk ?? undefined} />}
        <div className="mp-nums">
          <Num worse={opt.rent > other.rent + 0.5} text={money(opt.rent)} unit="a month, rent + utilities"
            title="Asking rent plus an equal share of utilities" />
          <Num className="num-detail" worse={tA > tB + 3} text={hours(tA)} unit="hours a week getting around"
            title="Door to door, every trip in the week" />
          <Num className="num-detail" worse={nA > nB} text={String(nA)} flag={week?.stranded?.length > 0 ? 'with no ride' : null}
            unit={nA === 1 ? 'late night' : 'late nights'}
            title={`Nights with no ride or walking in the dark. ${dark} min a week after dark${week?.stranded?.length ? `, ${week.stranded.length} trips with no ride` : ''}.`} />
        </div>
        <ul className="mp-plain simple-only">
          <li className={tA > tB + 3 ? 'bad' : ''}>{tA < tB - 3 ? 'Shorter trips' : tA > tB + 3 ? 'Longer trips' : 'About the same trip time'}</li>
          <li className={nA > nB ? 'bad' : ''}>{plainNights(week)}</li>
        </ul>
      </div>
      <button type="button" className="mp-this" onClick={onPick} disabled={busy}
        aria-label={`This one: ${home?.name}, week ${tag}`}>This one</button>
    </div>
  );
}

export default function PickCard({ api, pair, options, weekMap, routineWeek, nPicks, stop, canAuto, onAnswer, onAuto, onAutoAll, busy, personaName, dusk }) {
  const A = pair ? options[pair.i] : null, B = pair ? options[pair.j] : null;
  const max = api.config?.picksMax || 6;
  // Once the stop rule fires, the next question stays folded until asked for, so a stray click cannot answer it.
  const [more, setMore] = useState(false);
  useEffect(() => { setMore(false); }, [nPicks, stop?.stop]);
  const folded = !!stop?.stop && !more;
  const done = !!stop?.stop;
  const who = personaName ? `Answer for ${personaName}` : 'Answer for me (demo)';
  const dots = Array.from({ length: Math.max(max, nPicks) }, (_, k) => k < nPicks);

  return (
    <div>
      <div className="mp-pick-top">
        <span className={`mp-dots ${done ? 'done' : ''}`} role="img" aria-label={`${nPicks} of ${max} picks${done ? ', enough to rank' : ''}`}>
          {dots.map((on, k) => <i key={k} className={on ? 'on' : ''} />)}
          {done && <span className="txt">Enough to rank</span>}
        </span>
      </div>
      {folded && pair && A && B ? (
        <button type="button" className="mp-text-btn" onClick={() => setMore(true)} disabled={busy}>Ask one more</button>
      ) : pair && A && B ? (
        <>
          <div className="mp-pair" key={`${pair.i}-${pair.j}-${nPicks}`}>
            <Option api={api} tag="A" opt={A} other={B} week={weekMap.get(A.homeId)} otherWeek={weekMap.get(B.homeId)}
              routineWeek={routineWeek} busy={busy} dusk={dusk} onPick={() => onAnswer('A')} />
            <Option api={api} tag="B" opt={B} other={A} week={weekMap.get(B.homeId)} otherWeek={weekMap.get(A.homeId)}
              routineWeek={routineWeek} busy={busy} dusk={dusk} onPick={() => onAnswer('B')} />
          </div>
          <div className="mp-pick-more">
            <button type="button" className="mp-text-btn" onClick={() => onAnswer('skip')} disabled={busy}>Too close to call</button>
            {canAuto && (
              <>
                <button type="button" className="mp-text-btn" onClick={onAuto} disabled={busy}
                  title="Answers with this persona's demo values, for the demo">{who}</button>
                {!done && (
                  <button type="button" className="mp-text-btn" onClick={onAutoAll} disabled={busy}
                    title="Keeps answering with the demo values until the picks are enough">Answer the rest</button>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <p className="mp-gray">No question is left to ask with these homes.</p>
      )}
    </div>
  );
}
