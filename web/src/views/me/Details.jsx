// Details: one disclosure under the top 3. Why and watch out for the shown home, chance of being best, expected
// regret, the value of knowing your schedule, the break-even, the full ranking with its 50-dot plots, then any
// extra blocks the view passes as children (every home, trip by trip).
// Props: api, ranked, notes, shownHome, homeById, persona, baseline, onClearBaseline(), onSelect(id), children
import { useState } from 'react';
import { Button } from '../../components/index.js';
import Verdict from './Verdict.jsx';
import Ranking from './Ranking.jsx';
import { fmtEstimate } from './Learned.jsx';
import { money, pct } from './format.js';

function Big({ value, unit, label, title }) {
  return (
    <div className="dt-big" title={title}>
      <span className="v">{value}{unit && <span className="u">{unit}</span>}</span>
      <span className="l">{label}</span>
    </div>
  );
}

function BreakEven({ ranked, homeById }) {
  const kind = ranked.pointKind === 'median' ? 'median' : 'estimate';
  return ranked.be.map((b) => {
    const nm = (k) => homeById.get(k === 'A' ? b.A : b.B)?.name;
    const what = b.param === 'vTime' ? 'your time is worth' : 'an hour walking after dark costs you';
    const est = `$${fmtEstimate(b.current)}`;
    if (b.value != null && b.value > 300) {
      return <li key={b.param}>{nm(b.belowWins)} stays ahead unless {what} over $300 an hour (your {kind}: {est}).</li>;
    }
    return b.value != null ? (
      <li key={b.param}>{nm(b.aboveWins)} wins if {what} over <b>{money(b.value)}</b> an hour; below that, {nm(b.belowWins)}. Your {kind}: {est}.</li>
    ) : (
      <li key={b.param} className="muted">{b.param === 'vTime' ? 'Value of time' : 'Darkness'}: no break-even between the top two.</li>
    );
  });
}

export default function Details({ api, ranked, notes, shownHome, homeById, persona, baseline, onClearBaseline, onSelect, children }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const rank = ranked?.rank;
  const top = rank?.[0];
  return (
    <details className="you-details" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Details</summary>
      {open && (
        <div className="dt-body">
          {ranked?.error && <div className="note bad">The ranking failed: {ranked.error}</div>}
          {rank && (
            <>
              <div className="dt-bigs">
                <Big value={pct(top.pBest)} label={`chance ${homeById.get(top.homeId)?.name} is best`}
                  title={`Share of ${ranked.nScen} possible weeks x ${ranked.nDraws} value draws where it is best`} />
                <Big value={money(top.expRegret)} unit="/mo" label="expected regret, top pick"
                  title="Mean of how much worse it is than the best home in each draw" />
                {ranked.ev != null && (
                  <Big value={ranked.ev >= 1 ? money(ranked.ev) : `< ${money(1)}`} unit="/mo" label="value of knowing your schedule first"
                    title={`Expected value of perfect information over the ${ranked.nScen} sampled weeks`} />
                )}
              </div>
              <Verdict api={api} ranked={ranked} notes={notes} homeId={shownHome} homeById={homeById} persona={persona} />
              {ranked.be.length > 0 && (
                <div className="dt-block">
                  <h3>Break-even, top two</h3>
                  <ul className="dt-list"><BreakEven ranked={ranked} homeById={homeById} /></ul>
                </div>
              )}
              <div className="dt-block">
                <div className="dt-head">
                  <h3>Full ranking</h3>
                  {baseline && <Button small variant="quiet" onClick={onClearBaseline}>Clear comparison</Button>}
                </div>
                <Ranking api={api} rank={rank} baseline={baseline} limit={showAll ? rank.length : 10} selected={shownHome} onSelect={onSelect} />
                {rank.length > 10 && (
                  <Button small variant="quiet" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show the top 10' : `Show all ${rank.length}`}</Button>
                )}
                <p className="dt-note">{rank.length} homes x {ranked.nScen} possible weeks x {ranked.nDraws} value draws, sorted by expected regret.</p>
              </div>
            </>
          )}
          {children}
        </div>
      )}
    </details>
  );
}
