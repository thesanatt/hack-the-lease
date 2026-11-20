// Pill: a small chip. Sentence case, a soft fill, no outline.
// Props:
//   tone   'ink' (default, quiet gray chip) | 'solid' | 'accent' | 'good' | 'bad' | 'warn' | 'muted' | 'route'
//   color  background hex for tone='route' (GTFS route color); text turns dark on light colors
//   title  tooltip (optional)
//   children
export default function Pill({ tone = 'ink', color, title, children }) {
  const c = color && color[0] !== '#' ? `#${color}` : color;
  const style = tone === 'route' && c ? { background: c, color: readableOn(c) } : undefined;
  return <span className={`pill ${tone || 'ink'}`} style={style} title={title}>{children}</span>;
}

export function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#ffffff';
}
