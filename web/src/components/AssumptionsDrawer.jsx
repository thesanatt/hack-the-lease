// AssumptionsDrawer: every constant the engine uses, editable live (engine/config.js through api.setConfig).
// Props:
//   api      the engine adapter
//   open     bool
//   onClose  () => void
import { useEffect, useState } from 'react';
import { CONFIG } from '../../../engine/config.js';
import Button from './Button.jsx';

export const ASSUMPTIONS = [
  { group: 'Getting around' },
  { key: 'walkMs', label: 'Walking speed', unit: 'm/s', step: 0.05, min: 0.5, max: 2.5, src: 'assumption' },
  { key: 'bikeMs', label: 'Biking speed', unit: 'm/s', step: 0.1, min: 2, max: 8, src: 'assumption, about 15 km/h' },
  { key: 'bikeOverheadS', label: 'Unlock, park and lock a bike', unit: 's', step: 10, min: 0, max: 600, src: 'assumption' },
  { key: 'changeDefaultS', label: 'Minimum time to change buses', unit: 's', step: 30, min: 0, max: 600, src: 'assumption; TheRide transfers.txt sets some stops' },
  { key: 'maxAccessM', label: 'Longest walk to a stop', unit: 'm', step: 100, min: 300, max: 2500, src: 'assumption; applies to points added after the change' },
  { group: 'How minutes count' },
  { key: 'mWalk', label: 'A walking minute counts as', unit: 'x riding', step: 0.05, min: 1, max: 3, src: 'Wardman, Chintakayala, de Jong 2016 (urban)' },
  { key: 'mWait', label: 'A waiting minute counts as', unit: 'x riding', step: 0.05, min: 1, max: 3, src: 'Wardman, Chintakayala, de Jong 2016 (urban)' },
  { key: 'mBike', label: 'A biking minute counts as', unit: 'x riding', step: 0.05, min: 0.5, max: 3, src: 'assumption' },
  { key: 'slackWeight', label: 'Early-arrival minute counts as', unit: 'x riding', step: 0.1, min: 0, max: 2, src: 'assumption' },
  { key: 'darkBikeFactor', label: 'A dark biking minute counts as', unit: 'x dark walking', step: 0.05, min: 0, max: 2, src: 'assumption from Uttley and Fotios 2017 ratios' },
  { key: 'longDarkWaitMin', label: 'Dark wait counts after', unit: 'min', step: 1, min: 0, max: 30, src: 'Fan, Guthrie, Levinson 2016' },
  { group: 'Your week' },
  { key: 'homeBreakMin', label: 'Gap that sends you home between things', unit: 'min', step: 10, min: 60, max: 360, src: 'assumption' },
  { key: 'homeBreakFitMin', label: 'Time at home that must fit', unit: 'min', step: 5, min: 0, max: 120, src: 'assumption' },
  { key: 'scenarios', label: 'Possible fall weeks sampled', unit: 'weeks', step: 4, min: 4, max: 64, src: 'assumption' },
  { group: 'Learning your preferences' },
  { key: 'tau', label: 'Pick noise (logit scale)', unit: '$/month', step: 5, min: 5, max: 100, src: 'assumption; the recovery test varies it' },
  { key: 'picksMax', label: 'Most picks asked', unit: 'picks', step: 1, min: 3, max: 12, src: 'assumption' },
  { key: 'stopIG', label: 'Stop when a question teaches less than', unit: 'nats', step: 0.01, min: 0, max: 0.5, src: 'assumption' },
  { key: 'stopPBest', label: 'Or when one home is best with', unit: 'probability', step: 0.05, min: 0.5, max: 0.99, src: 'assumption' },
  { key: 'posteriorDraws', label: 'Preference draws in the ranking', unit: 'draws', step: 50, min: 50, max: 1000, src: 'assumption' },
];

export default function AssumptionsDrawer({ api, open, onClose }) {
  const [, force] = useState(0);
  const [draft, setDraft] = useState({});
  useEffect(() => api.subscribe(() => force((n) => n + 1)), [api]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const cfg = api.config;
  const commit = (key, raw, a) => {
    const v = Number(raw);
    setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(a.max ?? Infinity, Math.max(a.min ?? -Infinity, v));
    api.setConfig({ [key]: clamped === CONFIG[key] ? undefined : clamped });
  };
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Assumptions">
        <div className="row-flex" style={{ justifyContent: 'space-between' }}>
          <h2>Assumptions</h2>
          <Button small onClick={onClose}>Close</Button>
        </div>
        <p className="small">
          Every number the model uses, with where it comes from. Change one and the views recompute. Values marked
          assumption are modeling choices, not data.
        </p>
        <div className="row-flex">
          <Button small onClick={() => api.resetConfig()} disabled={!Object.keys(api.overrides).length}>Reset all</Button>
          <span className="small muted">{Object.keys(api.overrides).length} changed</span>
        </div>
        {ASSUMPTIONS.map((a) => (a.group ? <h3 key={a.group}>{a.group}</h3> : (
          <div key={a.key} className={`row ${a.key in api.overrides ? 'changed' : ''}`}>
            <div>
              <div className="lbl">{a.label} <span className="muted small">{a.unit}</span></div>
              <div className="src">{a.src}{a.key in api.overrides ? `; default ${CONFIG[a.key]}` : ''}</div>
            </div>
            <input type="number" aria-label={a.label} step={a.step} min={a.min} max={a.max}
              value={draft[a.key] ?? cfg[a.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [a.key]: e.target.value }))}
              onBlur={(e) => commit(a.key, e.target.value, a)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(a.key, e.currentTarget.value, a); }} />
          </div>
        )))}
        <h3>Daylight dates</h3>
        <p className="small">
          A September to August lease spans fall and winter terms. Dark minutes are averaged over these dates; the
          December 2026 timetable stands in for both terms:{' '}
          <span className="mono">{cfg.termDates.map((d) => d.date).join(', ')}</span>.
        </p>
      </aside>
    </>
  );
}
