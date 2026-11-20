import React from 'react';
import { Button, Pill, usd } from './kit.jsx';

// One card per member. The cap is private: masked by default, shown only in the member's own private view.
export function MemberCard({ m, color, revealed, onToggle, privateInfo, onCap, place }) {
  return (
    <div className="qv-member" style={{ borderTop: `3px solid ${color || 'var(--line, #d6cdbd)'}` }}>
      <div className="qv-row" style={{ justifyContent: 'space-between' }}>
        <span className="name">{m.name}</span>
        <Pill title="Room values come from this fictional persona's own theta, not learned picks">demo values</Pill>
      </div>
      <div className="qv-small qv-muted">{m.program || 'Student'}{place ? `, ${place}` : ''}</div>
      <div className="qv-row qv-small" style={{ marginTop: 6 }}>
        <span>Rent cap</span>
        <span className="qv-mono" aria-label={revealed ? undefined : 'hidden'}>{revealed ? usd(privateInfo?.cap) : '$ ****'}</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <Button tone="quiet" aria-expanded={revealed} onClick={onToggle}>
          {revealed ? `Hide ${m.name}'s private view` : `Show ${m.name}'s private view`}
        </Button>
      </div>
      {revealed && <PrivatePanel m={m} info={privateInfo} onCap={onCap} />}
    </div>
  );
}

function PrivatePanel({ m, info, onCap }) {
  if (!info) return null;
  const { cap, rent, house, feasible, gap, gapLoading, gapHouse } = info;
  const blocked = gapHouse || house;
  const room = cap != null && rent != null ? cap - rent : null;
  return (
    <div className="qv-private" role="region" aria-label={`${m.name}'s private view`}>
      <span className="qv-kicker">{m.name}'s private view. Only {m.name} sees this.</span>
      <div className="qv-row">
        <label className="qv-small" htmlFor={`cap-${m.id}`}>Your cap</label>
        <input id={`cap-${m.id}`} type="number" step="10" min="0" value={cap ?? ''}
          onChange={(e) => onCap(e.target.value === '' ? null : Number(e.target.value))} style={{ width: 90 }} />
      </div>
      {house && rent != null && (
        <div style={{ marginTop: 4 }}>
          Your share at {house}: <span className="qv-mono">{usd(rent)}</span>
          {room != null && (
            <span className={room >= -1e-6 ? '' : 'qv-mono'} style={{ color: room >= -1e-6 ? 'var(--good, #2f6b3a)' : 'var(--bad, #a3322a)' }}>
              {' '}({room >= -1e-6 ? `${usd(room)} under your cap` : `${usd(-room)} over your cap`})
            </span>
          )}
        </div>
      )}
      {(!feasible || gapHouse) && (
        <div style={{ marginTop: 4 }}>
          {gapLoading ? 'Working out your gap...' : gap > 0.5
            ? <>For {blocked} to have a split that fits every cap, your cap would need to rise by <b className="qv-mono">{usd(gap)}</b>.</>
            : <>Your cap is not what blocks {blocked}. Someone else's cap is binding, and their gap is in their own private view.</>}
        </div>
      )}
    </div>
  );
}
