// Small shared pieces for Saved, My profile and Browse.
import { TIER } from './rank.js';

export function Heart({ on, onClick, name }) {
  return (
    <button type="button" className="st-heart" aria-pressed={!!on} onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={on ? `Remove ${name} from saved` : `Save ${name}`} aria-label={on ? `Remove ${name} from saved` : `Save ${name}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.6 0 5.5 3.7 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function FitPill({ tier }) {
  if (!tier) return null;
  return <span className={`st-pill ${tier}`}>{TIER[tier]}</span>;
}

export const go = (id) => { window.location.hash = id; };

export const short = (name) => String(name || '').replace(/,\s*\d+\s*bed$/i, '');
export const beds = (home) => `${home.rooms?.length || 1} bed ${home.kind || 'home'}`;
