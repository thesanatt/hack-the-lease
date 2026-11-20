// Details for Next year: one disclosure with the method in plain words, the run settings, the full table and
// the data labels. Closed by default.
// Props: res, source ('sample' | 'file'), file ({ name, parsed }), sample ({ meta, plansLabel, parsed }), k, seed
import { money, pct } from './format.js';
import { regretByHome } from './compute.js';

export default function Details({ res, source, file, sample, k, seed }) {
  const vh = new Map((res.voi?.homes || []).map((h) => [h.homeId, h]));
  const regret = regretByHome(res.costs);
  const parsed = source === 'file' ? file?.parsed : sample?.parsed;
  const sk = parsed?.skipped || {};
  const missing = res.stats?.missingCourses || [];
  const label = source === 'file'
    ? `Your file (${file?.name}), read in this browser. It was not uploaded.`
    : (sample?.meta?.label || 'SAMPLE catalog');
  return (
    <details className="you-details nx-details">
      <summary>How we got this</summary>
      <div className="dt-body">
        <div className="dt-block">
          <h3>Method</h3>
          <ul className="dt-list">
            <li>From the catalog we draw {k} weeks you could end up with: one open section per class, your elective, and each maybe by its odds. Sections fill at random by when you register.</li>
            <li>Each week runs door to door from every home on the real bus timetables, the same way as the You tab.</li>
            <li>What a home costs you in a week: its rent and utilities, plus the time getting around, dark walks and missed rides, priced at {res.nDraws} draws of what your time is worth, less what the room is worth to you.</li>
            <li>What not knowing costs: the average cost of the home you would pick for each week if you knew it, against the one home that does best on average (expected value of perfect information).</li>
            <li>What one unknown is worth: the same, when only that unknown is settled (partial perfect information). Plus or minus is about two standard errors from resampling the weeks.</li>
            <li>Settling an unknown keeps only the weeks that match. Nothing is routed again.</li>
            <li>Expected regret in the table below is the same measure for each home, so the top home's regret is the price above.</li>
          </ul>
        </div>
        <div className="dt-bigs">
          <div className="dt-big"><span className="v">{res.scenarios.length}<span className="u"> of {res.nAll}</span></span><span className="l">possible weeks in play (seed {seed})</span></div>
          <div className="dt-big"><span className="v">{res.nDraws}</span><span className="l">value draws</span></div>
          <div className="dt-big"><span className="v">{Math.round(res.ms?.total || 0)}<span className="u"> ms</span></span><span className="l">to route and rank</span></div>
        </div>
        <div className="dt-block">
          <h3>Every home</h3>
          <table className="nx-table">
            <thead>
              <tr><th>#</th><th>Home</th><th className="n">Expected regret</th><th className="n">Worst 10%</th><th className="n">Best in, of the weeks</th></tr>
            </thead>
            <tbody>
              {res.rank.map((r, i) => (
                <tr key={r.homeId}>
                  <td className="n">{i + 1}</td>
                  <td>{res.homeById.get(r.homeId)?.name}</td>
                  <td className="n">{money(regret.has(r.homeId) ? regret.get(r.homeId) : r.expRegret)}/mo</td>
                  <td className="n">{money(vh.get(r.homeId)?.worst10)}/mo</td>
                  <td className="n">{pct(vh.get(r.homeId)?.pBest ?? r.pBest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dt-block">
          <h3>Data</h3>
          <ul className="dt-list">
            <li>{label}</li>
            {source === 'sample' && sample?.plansLabel && <li>{sample.plansLabel}</li>}
            <li>Sections read: {parsed?.sections?.length ?? 0}. Skipped: {sk.arranged || 0} arranged, {sk.noTime || 0} with no time, {sk.noPlace || 0} with no known place.</li>
            {missing.length > 0 && <li>Not in this catalog: {missing.join(', ')}.</li>}
            {res.stats?.conflictsUnresolved > 0 && <li>{res.stats.conflictsUnresolved} weeks kept an overlap after 30 redraws.</li>}
            {parsed?.unmatched?.length > 0 && <li>Rooms we could not place: {parsed.unmatched.slice(0, 8).join(', ')}{parsed.unmatched.length > 8 ? ' and more' : ''}.</li>}
          </ul>
        </div>
      </div>
    </details>
  );
}
