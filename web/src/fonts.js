// Instrument Serif italic (OFL), self-hosted in public/fonts, for headlines. Loaded with the FontFace API so the
// URL resolves next to index.html (works offline and under font-src 'self'). Safe to call more than once.
let fontP = null;
export function loadSerif() {
  if (!fontP && typeof FontFace === 'function') {
    const url = new URL('./fonts/instrument-serif-latin-400-italic.woff2', document.baseURI);
    const f = new FontFace('Instrument Serif', `url(${url}) format('woff2')`, { style: 'italic', weight: '400' });
    fontP = f.load().then((ff) => document.fonts.add(ff)).catch(() => null);
  }
  return fontP;
}
