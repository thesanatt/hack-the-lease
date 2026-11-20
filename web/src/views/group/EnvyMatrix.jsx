import React from 'react';
import { usd } from './kit.jsx';

// envy[i][j] = (v_i(own) - p_own) - (v_i(room of j) - p_j). Each entry is how many dollars a month
// member i would lose by swapping into j's room at j's rent. Every entry >= 0 means nobody would swap.
export default function EnvyMatrix({ names, envy, colors }) {
  if (!envy) return null;
  const n = names.length;
  return (
    <div className="qv-scroll">
      <table className="qv-table qv-matrix" aria-label="Envy matrix: per-pair margins in dollars per month">
        <thead>
          <tr>
            <th scope="col">Member would rather keep own room by</th>
            {names.map((nm, j) => <th key={j} scope="col" className="num">vs {nm}</th>)}
          </tr>
        </thead>
        <tbody>
          {names.map((nm, i) => (
            <tr key={i}>
              <th scope="row" style={{ textTransform: 'none', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink, #1d1a16)', borderBottom: '1px solid var(--line, #d6cdbd)' }}>
                {colors?.[i] && <span className="qv-swatch" style={{ background: colors[i] }} />}{nm}
              </th>
              {Array.from({ length: n }, (_, j) => {
                if (i === j) return <td key={j} className="diag">.</td>;
                const e = envy[i][j];
                const cls = !Number.isFinite(e) ? '' : e < -1e-6 ? 'fail' : e < 5 ? 'tight' : '';
                return <td key={j} className={`cell ${cls}`}>{Number.isFinite(e) ? usd(e) : 'n/a'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
