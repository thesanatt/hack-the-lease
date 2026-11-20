// The ranking: expected regret (sort key), a 50-dot quantile dotplot of regret, P(best), all-in monthly cost range.
// Props: api, rank (decide.meRank output), baseline (Map homeId -> previous position, optional), limit (rows),
//        selected, onSelect(id)
// Under each home: its biggest plus or minus against the middle home, from the Verdict's notes (engine/explain.js).
import { DotPlot, Pill } from '../../components/index.js';
import { money, pct } from './format.js';
import { useVerdictNotes } from './verdict/store.js';
import './verdict/verdict.css';

function Why({ note }) {
  const w = note?.why;
  if (!note) return null;
  if (!w) return <div className="vd-why muted">Close to the middle home on every count.</div>;
  const good = w.dollars >= 0;
  return (
    <div className={`vd-why ${good ? 'good' : 'bad'}`} title={w.text}>
      <span className="amt">{good ? '+' : '-'}{money(Math.abs(w.dollars))}/mo</span>{' '}
      <span className="muted">{w.label.toLowerCase()}</span>
    </div>
  );
}

export default function Ranking({ api, rank, baseline, limit = 12, selected, onSelect }) {
  const notes = useVerdictNotes();
  if (!rank?.length) return null;
  const rows = rank.slice(0, limit);
  const all = rows.flatMap((r) => r.dots || []).sort((a, b) => a - b);
  const max = Math.max(10, all[Math.floor(0.97 * (all.length - 1))] || 10);
  const name = (id) => api.data.homeById.get(id)?.name || id;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tt">
        <thead>
          <tr>
            <th className="num">#</th>
            <th title="Under each home: its biggest plus or minus against the middle home, dollars per month at your median values">Home, best room, biggest plus or minus</th>
            <th className="num" title="Mean over fall weeks and preference draws of how much worse this home is than the best one, $/month">Expected regret</th>
            <th title="50 equally likely outcomes of monthly regret; dots at 0 mean this home was the best">Regret, 50 equally likely outcomes ($0 to {money(max)})</th>
            <th className="num" title="Share of (week, preference) draws where this home is best">P(best)</th>
            <th className="num" title="Rent plus the money value of travel time, darkness and stranded trips, less the room's value; 80% range">All-in cost /mo</th>
            {baseline && <th className="num">Before</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const was = baseline?.get(r.homeId);
            return (
              <tr key={r.homeId} className={`click ${r.homeId === selected ? 'sel' : ''}`} onClick={() => onSelect?.(r.homeId)}>
                <td className="num">{i + 1}</td>
                <td>
                  <span style={{ fontWeight: 600 }}>{name(r.homeId)}</span>
                  <div className="small muted">{r.roomLabel || r.roomId}{r.price ? `, ${money(r.price)}/mo` : ''}</div>
                  <Why note={notes?.get(r.homeId)} />
                </td>
                <td className="num">{money(r.expRegret)}</td>
                <td><DotPlot dots={r.dots} max={max} width={240} height={30} color={i === 0 ? 'var(--accent)' : 'var(--ink)'} title={`Regret outcomes for ${name(r.homeId)}`} /></td>
                <td className="num">{pct(r.pBest)}</td>
                <td className="num">{money(-r.meanU)} <span className="muted small">({money(-r.hi)} to {money(-r.lo)})</span></td>
                {baseline && (
                  <td className="num">
                    {was == null ? '--' : was === i ? <span className="muted">same</span> : (
                      <Pill tone={was > i ? 'good' : 'bad'}>{was > i ? 'up' : 'down'} from {was + 1}</Pill>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rank.leadersDiffer && (
        <div className="note warn" style={{ marginTop: 8 }}>
          The home with the lowest expected regret ({name(rank.regretLeader)}) is not the one most often best
          ({name(rank.pBestLeader)}). A riskier home can be best in many draws and still cost more on average, so the list
          is sorted by expected regret.
        </div>
      )}
    </div>
  );
}
