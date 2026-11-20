// "How they compare for your week": pasted posts ranked with the three best sample homes, one bar each for
// cost to you a month, then hours a week, late nights and the rent.
// Props: rows (compute.shownRows), notes (Map postId -> cover note), sentence, waiting (string | null),
//        unranked [{ n, name, why }], fits (Map id -> fit.fitScores entry)
import { money } from '../me/format.js';
import { FIT_TITLE } from './fit.js';
import FitBlock from './FitBlock.jsx';

export default function Compare({ rows: allRows, notes, sentence, waiting, unranked, fits }) {
  // Places whose dates miss the semester (Fit 0) go last, so the top of the table is a place you can use.
  // The sort is stable: each group stays in order of cost to you.
  const missed = (r) => (fits?.get(r.id)?.dates === 0 ? 1 : 0);
  const rows = allRows && fits ? [...allRows].sort((a, b) => missed(a) - missed(b)) : allRows;
  // Bars start a little under the cheapest row so the gaps between places can be seen; the header says where.
  const costs = (rows || []).map((r) => r.cost).filter(Number.isFinite);
  const max = Math.max(1, ...costs);
  const base = costs.length ? Math.max(0, Math.floor((Math.min(...costs) - 100) / 100) * 100) : 0;
  return (
    <div className="lv-cmp">
      {sentence && <p className="lv-best">{sentence}</p>}
      {waiting && <p className="lv-wait" role="status">{waiting}</p>}
      {rows?.length > 0 && (
        <table className="lv-tbl">
          <thead>
            <tr>
              <th scope="col" className="nm">Place</th>
              {fits && <th scope="col" className="fit" title={`${FIT_TITLE} Small bars: price, getting around, nights, dates.`}>Fit</th>}
              <th scope="col" className="bar" title="Rent plus what travel time, darkness and trips with no ride cost you, less what the room is worth to you, averaged over the weeks your schedule could turn out to be. Same numbers as the You tab. Hours and late nights are for your most likely week.">Cost to you a month{base > 0 && <span className="u"> (bars start at {money(base)})</span>}</th>
              <th scope="col" className="n">Getting around</th>
              <th scope="col" className="n" title="Nights a week with a trip that has no ride, or walking or biking after dusk">Late nights</th>
              <th scope="col" className="n">Rent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const note = r.kind === 'post' ? notes.get(r.postId) : null;
              return (
                <tr key={r.id} className={`${r.kind}${note ? ' off' : ''}`}>
                  <td className="nm"><div className="lv-nmwrap">
                    {r.kind === 'post' ? <span className="lv-num sm" aria-hidden="true">{r.n}</span> : <span className="lv-dot" aria-hidden="true" />}
                    <span className="lv-nm">{r.name}</span>
                    {r.kind === 'home' && <span className="lv-sub">Sample listing</span>}
                    {note && <span className="lv-sub bad">{note}</span>}
                  </div></td>
                  {fits && <td className="fit"><FitBlock s={fits.get(r.id)} compact /></td>}
                  <td className="bar">
                    <span className="lv-bar"><i style={{ width: `${Math.max(2, ((Math.max(base, r.cost) - base) / Math.max(1, max - base)) * 100)}%` }} /></span>
                    <span className="lv-v">{money(r.cost)}<span className="u">/mo</span></span>
                  </td>
                  <td className="n" data-l="Getting around">{r.hours != null ? r.hours.toFixed(1) : '--'}<span className="u"> h/wk</span></td>
                  <td className="n" data-l="Late nights">{r.late ?? '--'}<span className="u">/wk</span></td>
                  <td className="n" data-l="Rent">{money(r.rent)}{r.utilitiesExtra && <span className="u" title="Utilities are extra and not counted"> + util.</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {unranked?.length > 0 && (
        <ul className="lv-unranked">
          {unranked.map((u) => (
            <li key={u.n}><span className="lv-num sm" aria-hidden="true">{u.n}</span> {u.name}: {u.why}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
