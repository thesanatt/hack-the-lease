// Read a dropped file into plain text, in the browser. PDF through pdf.js, screenshots and photos through
// Tesseract (text recognition, run on this device from files bundled in /ocr, no network); text, Markdown,
// CSV and calendar (.ics) files as text. Both libraries load only when needed. Nothing leaves the device.
import { normalizeScheduleText } from '../../../engine/profile.js';
import { findGrid, findBlocks, blockLines } from '../../../engine/grid.js';

const TEXT_EXT = /\.(txt|md|markdown|csv|ics|ical|text|json)$/i;
const IMG_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

export async function fileText(file, onProgress = () => {}) {
  const name = file.name || 'file';
  if (/\.pdf$/i.test(name) || file.type === 'application/pdf') return pdfText(file);
  if (IMG_EXT.test(name) || (file.type || '').startsWith('image/')) return imageText(file, onProgress);
  if (/\.(heic|heif)$/i.test(name)) throw new Error('iPhone HEIC photos are not read. Take a screenshot (PNG) instead.');
  if (TEXT_EXT.test(name) || (file.type || '').startsWith('text/')) return file.text();
  if (/\.docx?$/i.test(name)) throw new Error('Word files are not read yet. Save it as a PDF, or paste the text in the box.');
  throw new Error(`${name} is not a file Quorum can read. Use a PDF, a screenshot (PNG or JPG), a text file or a calendar (.ics) file.`);
}

let pdfjsP = null;
async function loadPdfjs() {
  if (!pdfjsP) {
    pdfjsP = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsP;
}

export async function pdfText(file) {
  const lib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 8); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = '', out = [], lastY = null;
    for (const it of tc.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2 && line) { out.push(line.trim()); line = ''; }
      line += (line && !line.endsWith(' ') && it.str && !it.str.startsWith(' ') ? ' ' : '') + it.str;
      if (it.hasEOL) { out.push(line.trim()); line = ''; }
      lastY = y;
    }
    if (line.trim()) out.push(line.trim());
    pages.push(out.filter(Boolean).join('\n'));
  }
  const text = pages.join('\n');
  if (!text.trim()) throw new Error('This PDF has no readable text (it may be a scan). Paste the text in the box instead.');
  return text;
}

// ---------------------------------------------------------------- screenshots
let ocrP = null;
async function ocrWorker(onProgress) {
  if (!ocrP) {
    ocrP = import('tesseract.js').then(async ({ createWorker }) => {
      const base = new URL('./ocr/', window.location.href).href;
      return createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`, corePath: base, langPath: `${base}lang`, gzip: true, cacheMethod: 'none',
        logger: (m) => { if (m.status === 'recognizing text') ocrP.progress?.(m.progress); },
      });
    });
  }
  ocrP.progress = onProgress;
  return ocrP;
}

// Small screenshots read better larger. Color is kept: the week-grid reader finds class blocks by color.
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.max(1, Math.min(3, 1800 / Math.max(bmp.width, 1)));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

// A week-grid calendar (days across, hours down, colored class blocks) is read from its layout: engine/grid.js
// finds the columns, the time scale and each block, then each block's own text is read. Anything else (a list
// of classes, a resume photo) is read as lines of text.
export async function imageText(file, onProgress = () => {}) {
  onProgress(0, 'Reading the image');
  const [worker, canvas] = await Promise.all([ocrWorker((x) => onProgress(x, 'Reading the image')), prepare(file)]);
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  const words = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) words.push({ text: w.text, ...w.bbox });
  const img = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  const grid = findGrid(img, words);
  if (grid) {
    const blocks = findBlocks(img, grid);
    for (let i = 0; i < blocks.length; i++) {
      const bk = blocks[i];
      onProgress(i / blocks.length, `Reading class block ${i + 1} of ${blocks.length}`);
      const r = await worker.recognize(canvas, { rectangle: { left: bk.x0, top: bk.y0, width: bk.x1 - bk.x0 + 1, height: bk.y1 - bk.y0 + 1 } });
      bk.text = r.data.text;
    }
    const lines = blockLines(blocks);
    if (lines.length) return `Class schedule (read from a week calendar)\n${lines.join('\n')}`;
  }
  const text = normalizeScheduleText(data.text || '');
  if (!text.trim()) throw new Error('No text found in this image. Try a sharper screenshot, or paste the text in the box.');
  return text;
}
