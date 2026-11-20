import React from 'react';
import AutoStrip from '../../components/AutoStrip.jsx';
import { usd } from './kit.jsx';

// One row per member: color chip, a mini week ribbon from the chosen house, and the cap shown as "private".
// The cap and the gap appear only inside that member's own private view.
// The member's name is the button that opens their private view. dusk (optional) draws one evening band.
export function MemberRow({ m, color, revealed, onToggle, privateInfo, onCap, trips, entries, dusk }) {
  return (
    <div className="gv-member">
      <div className="gv-member-row">
        <button type="button" className="gv-chip gv-chip-btn" aria-expanded={revealed} onClick={onToggle}
          title={revealed ? `Close ${m.name}'s private view` : `Open ${m.name}'s private view`}>
          <span className="gv-dot" style={{ background: color }} />{m.name}
        </button>
        <div aria-label={`${m.name}'s week from this house`} role="group">
          <AutoStrip compact trips={trips || []} entries={entries || []} fromHour={7} toHour={25} dusk={dusk ?? undefined} />
        </div>
        {revealed && <PrivatePanel m={m} info={privateInfo} onCap={onCap} />}
      </div>
    </div>
  );
}

function PrivatePanel({ m, info, onCap }) {
  if (!info) return null;
  const { cap, rent, house, feasible, gap, gapHouse } = info;
  const blocked = gapHouse || house;
  const room = cap != null && rent != null ? cap - rent : null;
  return (
    <div className="gv-private" role="region" aria-label={`${m.name}'s private view`}>
      <div className="gv-private-row">
        <label htmlFor={`cap-${m.id}`}>Only {m.name} sees this. Cap</label>
        <input id={`cap-${m.id}`} type="number" step="10" min="0" value={cap ?? ''}
          onChange={(e) => onCap(e.target.value === '' ? null : Number(e.target.value))} />
        {rent != null && room != null && (
          <span className={room >= -1e-6 ? 'gv-good-t' : 'gv-bad-t'}>
            <span className="big">{usd(Math.abs(room))}</span> {room >= -1e-6 ? 'under' : 'over'}
          </span>
        )}
      </div>
      {(!feasible || gapHouse) && Number.isFinite(gap) && (
        <div style={{ marginTop: 6 }}>
          {gap > 0.5
            ? <>{blocked} fits if your cap rises by <b className="gv-num">{usd(gap)}</b>.</>
            : <>Your cap is not what rules out {blocked}.</>}
        </div>
      )}
    </div>
  );
}
