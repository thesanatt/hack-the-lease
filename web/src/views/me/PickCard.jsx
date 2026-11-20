// "Which week would you rather live?" Two real homes, each with its room, rent and this student's week there.
// Props: api, pair ({i, j, ig, mu, s2}), options (flat option list), weekMap, routineWeek, nPicks, stop ({stop, text}),
//        canAuto (persona has demo theta), onAnswer(choice 'A'|'B'|'skip'), onAuto(), onAutoAll(), last (last pick summary),
//        busy
import { Button, Pill, WeekStrip } from '../../components/index.js';
import { hm, money } from './format.js';
import { darkOf } from './HomeList.jsx';

function Option({ api, tag, opt, week, routineWeek }) {
  const home = api.data.homeById.get(opt.homeId);
  const r = opt.room;
  const bath = { private: 'private bath', half: 'half bath', shared: 'shared bath' }[r.bath] || r.bath;
  const light = ['little daylight', 'some daylight', 'bright'][r.light] ?? '';
  return (
    <div className="opt">
      <div className="caps muted">Week {tag}</div>
      <h3>{home?.name}</h3>
      <div className="small muted">{home?.area}. {r.label}: {r.sqft} sq ft, {bath}, {light}</div>
      <dl>
        <dt>Rent with utilities</dt><dd>{money(opt.rent)}/mo</dd>
        <dt>Door to door</dt><dd>{hm(week?.weeklyMin)}/wk</dd>
        <dt>Walking or waiting</dt><dd>{hm((week?.walkMin || 0) + (week?.waitMin || 0))}/wk</dd>
        <dt>After dark</dt><dd>{Math.round(darkOf(week, api.config))} min/wk</dd>
        <dt>Trips with no ride</dt><dd style={{ color: week?.stranded?.length ? 'var(--bad)' : undefined }}>{week?.stranded?.length ?? 0}/wk</dd>
      </dl>
      {week && <WeekStrip compact width={360} trips={week.trips} entries={routineWeek} />}
    </div>
  );
}

export default function PickCard({ api, pair, options, weekMap, routineWeek, nPicks, stop, canAuto, onAnswer, onAuto, onAutoAll, last, busy }) {
  const A = pair ? options[pair.i] : null, B = pair ? options[pair.j] : null;
  const closeness = pair ? (Math.abs(pair.mu) < 0.5 ? 'You look close to 50/50 on this one' : 'The model leans one way here') : '';
  const unknown = pair ? (pair.s2 > 1 ? 'along a trade-off the model knows little about' : 'along a trade-off it already knows fairly well') : '';
  return (
    <div>
      <div className="row-flex" style={{ marginBottom: 8 }}>
        <Pill tone={stop?.stop ? 'good' : 'ink'}>{nPicks} picks</Pill>
        <span className="small">{stop?.text}{stop?.stop ? ' You can stop here; more picks are optional.' : ''}</span>
      </div>
      {pair && A && B ? (
        <>
          <div className="pick">
            <Option api={api} tag="A" opt={A} week={weekMap.get(A.homeId)} routineWeek={routineWeek} />
            <Option api={api} tag="B" opt={B} week={weekMap.get(B.homeId)} routineWeek={routineWeek} />
          </div>
          <div className="row-flex" style={{ marginTop: 10 }}>
            <Button variant="primary" onClick={() => onAnswer('A')} disabled={busy}>I would rather live week A</Button>
            <Button variant="primary" onClick={() => onAnswer('B')} disabled={busy}>Week B</Button>
            <Button onClick={() => onAnswer('skip')} disabled={busy}>Too close to call</Button>
            {canAuto && (
              <>
                <Button onClick={onAuto} disabled={busy} title="Answers with the persona's demo values (a logit draw), for the demo">Auto-answer</Button>
                <Button variant="quiet" onClick={onAutoAll} disabled={busy || stop?.stop}>Auto-answer until done</Button>
              </>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Each question is the one whose answer teaches the model the most ({pair.ig.toFixed(3)} nats). {closeness},
            {' '}{unknown}. Rent, room and the whole week are shown, so the answer prices your time in dollars.
          </p>
        </>
      ) : (
        <p className="small muted">No question is left to ask with these homes.</p>
      )}
      {last && <p className="small">Last answer: {last}</p>}
    </div>
  );
}
