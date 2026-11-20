// Hero, left side: the price of not knowing next semester's schedule, and the home that loses least.
// Props: res (runNextYear result or null), busy ({ f, msg } or null)
import { money, moneyRange, pct } from './format.js';

export default function Hero({ res, busy }) {
  if (!res || res.empty) {
    return (
      <div className="nx-left">
        <div className="nx-card nx-price ghost">
          <p className="nx-wait">{busy ? busy.msg : 'Reading the catalog'}</p>
        </div>
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
      <div className="nx-card nx-price">
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
          <span className="nx-safe-tag">Loses least</span>
          <div className="nx-nums">
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
    </div>
  );
}
