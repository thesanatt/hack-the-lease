// Matrix: a square table of numbers, used for the envy matrix.
// Props:
//   rows     [string] row labels (e.g. member names)
//   cols     [string] column labels (defaults to rows)
//   values   number[][] (values[i][j])
//   format   (v, i, j) => string  (default: signed whole dollars)
//   tone     (v, i, j) => '' | 'pos' | 'neg' | 'diag'  (default: diag on i === j, neg below -1e-6, pos above)
//   corner   text for the top-left cell (optional)
//   caption  text under the table (optional)
//   rowNote  (i) => node, extra cell at the end of each row (optional)
export default function Matrix({ rows, cols, values, format, tone, corner = '', caption, rowNote }) {
  const c = cols || rows;
  const fmt = format || ((v) => (v >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(v)));
  const tn = tone || ((v, i, j) => (i === j ? 'diag' : v < -1e-6 ? 'neg' : 'pos'));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tt matrix">
        <thead>
          <tr>
            <th>{corner}</th>
            {c.map((x) => <th key={x} className="num">{x}</th>)}
            {rowNote && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r}>
              <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>{r}</th>
              {c.map((_, j) => {
                const v = values?.[i]?.[j];
                return <td key={j} className={`num ${v == null ? '' : tn(v, i, j)}`}>{v == null ? '' : i === j ? '--' : fmt(v, i, j)}</td>;
              })}
              {rowNote && <td>{rowNote(i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && <p className="small muted" style={{ marginTop: 6 }}>{caption}</p>}
    </div>
  );
}
