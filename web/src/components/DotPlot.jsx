// DotPlot: a quantile dotplot (Fernandes et al. 2018). Each dot is one of N equally likely outcomes.
// Props:
//   dots     number[] (e.g. 50 quantiles of monthly regret in dollars)
//   max      right end of the axis (shared across rows so rows compare); default max(dots)
//   min      left end (default 0)
//   width    px (default 220), height px (default 34)
//   color    dot fill (default var(--text))
//   marker   number, draws a thin vertical line (e.g. the mean) (optional)
//   axis     bool, draws tick labels under the plot (default false)
//   format   tick label formatter (default "$v")
//   title    accessible description
export default function DotPlot({ dots = [], max, min = 0, width = 220, height = 34, color = 'var(--text)', marker, axis = false, format, title }) {
  const n = dots.length;
  if (!n) return null;
  const hi = max ?? Math.max(...dots, 1);
  const span = Math.max(hi - min, 1e-9);
  const fmt = format || ((v) => `$${Math.round(v)}`);
  // Wilkinson-style: bin by dot diameter, stack upward
  const cols = Math.max(12, Math.floor(width / 5));
  const binW = width / cols;
  const counts = new Array(cols).fill(0);
  const pts = [];
  const sorted = [...dots].sort((a, b) => a - b);
  for (const v of sorted) {
    const b = Math.min(cols - 1, Math.max(0, Math.floor(((v - min) / span) * cols)));
    pts.push([b, counts[b]++]);
  }
  const maxStack = Math.max(...counts);
  const plotH = height - (axis ? 12 : 0);
  const d = Math.min(binW, (plotH - 2) / Math.max(maxStack, 1));
  const r = Math.max(1.2, d / 2 - 0.3);
  const x = (v) => ((v - min) / span) * width;
  return (
    <svg className="dotplot" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title || `${n} equally likely outcomes`}>
      <line x1={0} x2={width} y1={plotH - 0.5} y2={plotH - 0.5} stroke="var(--line)" />
      {pts.map(([b, k], i) => (
        <circle key={i} cx={(b + 0.5) * binW} cy={plotH - 1 - r - k * d} r={r} fill={color} />
      ))}
      {marker != null && Number.isFinite(marker) && (
        <line x1={x(marker)} x2={x(marker)} y1={0} y2={plotH} stroke="var(--accent)" strokeWidth={1.5} />
      )}
      {axis && (
        <>
          <text x={0} y={height - 1}>{fmt(min)}</text>
          <text x={width} y={height - 1} textAnchor="end">{fmt(hi)}</text>
        </>
      )}
    </svg>
  );
}
