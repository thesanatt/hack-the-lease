// Builds the printable student cards for the judges.
//   cd scripts/cards && npm install && node make_cards.mjs
//   node make_cards.mjs --base http://localhost:4173/      (QR codes point at a local build instead)
// Output: docs/cards/student_cards.html (what gets printed) and docs/cards/student_cards.pdf.
// One card per persona in web/public/data/personas.json except Jordan, 4 cards per US Letter page.
// Each card: fictional name, program, three lines of the week, "Fictional student, sample data",
// and a QR code to <base>#me?who=<id>, which opens the You tab on that student's week.
// Needs Playwright from scripts/record (cd scripts/record && npm install && npx playwright install chromium).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const outDir = path.join(root, 'docs', 'cards');

const args = process.argv.slice(2);
const argVal = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const BASE = argVal('--base', 'https://quorum-a2.vercel.app/');
const SKIP = new Set(['jordan']);

const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const personasRaw = readJson('web/public/data/personas.json');
const personas = (Array.isArray(personasRaw) ? personasRaw : personasRaw.personas).filter((p) => !SKIP.has(p.id));
const placesRaw = readJson('web/public/data/places.json');
const placeName = new Map((Array.isArray(placesRaw) ? placesRaw : placesRaw.places).map((p) => [p.id, p.label || p.name || p.id]));

// ---------------------------------------------------------------- text helpers (ASCII only)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function days(list) {
  const d = [...(list || [])].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  if (d.length === 5 && d.join() === 'mon,tue,wed,thu,fri') return 'Mon to Fri';
  return d.map((x) => DAY[x] || x).join(' ');
}

function clock(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 && h < 24 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return { text: m ? `${h12}:${String(m).padStart(2, '0')}` : `${h12}`, ap };
}

export function span(start, end) {
  const a = clock(start), b = clock(end);
  return a.ap === b.ap ? `${a.text} to ${b.text} ${b.ap}` : `${a.text} ${a.ap} to ${b.text} ${b.ap}`;
}

// Three lines of the week, in file order. The entry that ends latest is always one of them, since late nights
// often explain the pick. The other lines are the entries that always happen first, then the likely ones.
// A label that repeats (the same lab on two sets of days) shows once.
const endMin = (e) => { const [h, m] = String(e.end || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export function weekLines(persona, n = 3) {
  const seen = new Set();
  const week = (persona.week || []).map((e, i) => ({ e, i }))
    .filter(({ e }) => (seen.has(e.label) ? false : (seen.add(e.label), true)));
  const late = week.reduce((a, x) => (!a || endMin(x.e) > endMin(a.e) ? x : a), null);
  const rest = week.filter((x) => x !== late)
    .sort((x, y) => (y.e.p ?? 1) - (x.e.p ?? 1) || x.i - y.i);
  const pick = late && n > 0 ? [late, ...rest.slice(0, n - 1)] : rest.slice(0, n);
  return pick.sort((x, y) => x.i - y.i).map(({ e }) => ({
    label: e.label,
    when: `${days(e.days)}, ${span(e.start, e.end)}`,
    where: placeName.get(e.place) || e.place,
  }));
}

const asciiCheck = (s, where) => {
  const bad = [...s].find((c) => c.charCodeAt(0) > 126 || (c.charCodeAt(0) < 32 && c !== '\n'));
  if (bad) throw new Error(`non-ASCII character ${JSON.stringify(bad)} in ${where}`);
};

// ---------------------------------------------------------------- fonts (embedded so the HTML stands alone)
function fontFace(family, weight, file) {
  const p = path.join(root, 'web', 'node_modules', '@fontsource', file);
  if (!existsSync(p)) return '';
  const b64 = readFileSync(p).toString('base64');
  return `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal; src: url(data:font/woff2;base64,${b64}) format('woff2'); }\n`;
}
const fonts = [
  fontFace('IBM Plex Sans', 400, 'ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'),
  fontFace('IBM Plex Sans', 600, 'ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'),
  fontFace('IBM Plex Mono', 400, 'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'),
  fontFace('Source Serif 4', 600, 'source-serif-4/files/source-serif-4-latin-600-normal.woff2'),
].join('');

// ---------------------------------------------------------------- cards
async function card(p) {
  const url = `${BASE}#me?who=${encodeURIComponent(p.id)}`;
  const qr = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#000000', light: '#ffffff' } });
  const lines = weekLines(p);
  const html = `
    <section class="card">
      <header class="top"><span class="mark">Quorum</span><span class="tag">Student card</span></header>
      <h1 class="name">${esc(p.name)}</h1>
      <p class="prog">${esc(p.program)}</p>
      <h2 class="wk">Their week</h2>
      <ol class="week">
        ${lines.map((l) => `<li><b>${esc(l.label)}</b><span>${esc(l.when)}</span><span>${esc(l.where)}</span></li>`).join('\n        ')}
      </ol>
      <div class="foot">
        <div class="qr">${qr}</div>
        <div class="scan">
          <p class="how">Scan to see where ${esc(p.name)} should live.</p>
          <p class="url">${esc(BASE.replace(/^https?:\/\//, ''))}<br>#me?who=${esc(encodeURIComponent(p.id))}</p>
          <p class="fict">Fictional student, sample data</p>
        </div>
      </div>
    </section>`;
  asciiCheck(html, `card ${p.id}`);
  return html;
}

const CSS = `
${fonts}
@page { size: 8.5in 11in; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: 'IBM Plex Sans', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 8.5in; height: 11in; padding: 0.25in; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
  page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.card { border: 1px dashed #9a9a9a; padding: 0.26in 0.32in 0.24in; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #000; padding-bottom: 6px; }
.mark { font-family: 'Source Serif 4', Georgia, serif; font-weight: 600; font-size: 18pt; letter-spacing: -0.01em; }
.tag { font-size: 9pt; color: #444; }
.name { font-size: 28pt; font-weight: 600; margin: 10px 0 0; line-height: 1.05; }
.prog { font-size: 10.5pt; line-height: 1.25; margin: 3px 0 0; color: #222; }
.wk { font-size: 9pt; font-weight: 600; margin: 12px 0 5px; color: #444; }
.week { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.week li { display: flex; flex-direction: column; border-left: 2px solid #000; padding-left: 8px; font-size: 9.5pt; line-height: 1.3; }
.week b { font-size: 11pt; font-weight: 600; }
.week span { color: #222; }
.foot { margin-top: auto; display: flex; gap: 14px; align-items: flex-end; padding-top: 10px; }
.qr { width: 1.15in; height: 1.15in; flex: none; }
.qr svg { width: 100%; height: 100%; display: block; }
.scan { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.scan p { margin: 0; }
.how { font-size: 10pt; font-weight: 600; line-height: 1.25; text-wrap: balance; }
.url { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 7.5pt; color: #333; overflow-wrap: anywhere; }
.fict { font-size: 9pt; color: #000; border-top: 1px solid #000; padding-top: 4px; margin-top: 2px !important; }
`;

async function main() {
  if (!personas.length) throw new Error('no personas besides Jordan in personas.json');
  const cards = [];
  for (const p of personas) cards.push(await card(p));
  const pages = [];
  for (let i = 0; i < cards.length; i += 4) pages.push(`<div class="page">${cards.slice(i, i + 4).join('')}</div>`);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Quorum student cards</title>
<!-- Built by scripts/cards/make_cards.mjs. Fictional students, sample data. QR codes open ${esc(BASE)}#me?who=id -->
<style>${CSS}</style></head>
<body>
${pages.join('\n')}
</body></html>
`;
  mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'student_cards.html');
  const pdfPath = path.join(outDir, 'student_cards.pdf');
  writeFileSync(htmlPath, html);

  const require = createRequire(path.join(root, 'scripts', 'record', 'package.json'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: pdfPath, width: '8.5in', height: '11in', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  } finally {
    await browser.close();
  }
  console.log(`${personas.length} cards on ${pages.length} page(s): ${personas.map((p) => p.id).join(', ')}`);
  console.log(`QR base: ${BASE}`);
  console.log(`wrote ${path.relative(root, htmlPath)} and ${path.relative(root, pdfPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
