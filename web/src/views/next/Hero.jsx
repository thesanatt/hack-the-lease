// Hero, left side: the answer in words, the price of not knowing next semester's schedule, the home that loses
// least, and the one next step. In simple mode (a `simple` class on an ancestor) the price card, ranges and
// percentages hide (class num-detail) and plain lines (class simple-only) show instead.
// Props: res (runNextYear result or null), busy ({ f, msg } or null), settledAny (boolean)
import { money, moneyRange, pct, answerSentences, safeLine } from './format.js';

function Answer({ res, settledAny }) {
  const top = res.voi?.byFactor?.[0] || null;
  const { parts, bold } = answerSentences(res.voi?.evpi?.value || 0, top, settledAny);
  return (
    <h2 className="nx-answer" aria-live="polite">
      {parts.map((p, i) => (i === bold ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>)).reduce((a, b) => [a, ' ', b])}
    </h2>
  );
}

export default function Hero({ res, busy, settledAny = false }) {
  if (!res || res.empty) {
    return (
      <div className="nx-left">
        <p className="nx-answer nx-answer-wait">{busy ? busy.msg : 'Reading the catalog'}</p>
        <div className="nx-card nx-price ghost num-detail" />
        <div className="nx-card ghost" />
      </div>
    );
  }
  const ev = res.voi?.evpi || { value: 0, se: 0 };
  const s = res.safest;
  const home = s?.home;
  const pm = Math.max(1, Math.round(2 * (ev.se || 0)));
  const small = !(ev.value >= 0.5);
  return (
    <div className="nx-left">
      <Answer res={res} settledAny={settledAny} />
      <div className="nx-card nx-price num-detail">
        {/* Under 50 cents rounds to $0, which reads like a bug: say "Under $1", as pitch slide 2 does. */}
        <span className="nx-big">{small ? 'Under $1' : money(ev.value)}<span className="nx-unit"> a month</span></span>
        <span className="nx-big-l">what not knowing next semester's schedule costs you</span>
        {!small && <span className="nx-pm" title="About two standard errors, from resampling the possible weeks">plus or minus {money(pm)}</span>}
      </div>
      {home && (
        <div className="nx-card nx-safe">
          <div className="t3-head">
            <span className="t3-rank" aria-hidden="true">1</span>
            <h3 className="t3-name">{home.name}</h3>
            <span className="t3-room">{s.roomLabel || ''}</span>
            <span className="t3-sample">Sample listing</span>
          </div>
          <span className="nx-safe-tag num-detail">Loses least</span>
          <span className="nx-safe-tag simple-only">Your safe pick</span>
          <p className="nx-safe-why simple-only">{safeLine(s.pBest)}</p>
          <div className="nx-nums num-detail">
            <div className="t3-num">
              <span className="v">{moneyRange(s.p10, s.p90)}<span className="u">/mo</span></span>
              <span className="l">across your possible weeks</span>
            </div>
            <div className="t3-num">
              <span className="v">{pct(s.pBest)}</span>
              <span className="l">of them it is the best</span>
            </div>
          </div>
        </div>
      )}
      <div className="nx-next">
        <a className="btn primary" href="#listings">Found a post? Paste it</a>
      </div>
    </div>
  );
}
