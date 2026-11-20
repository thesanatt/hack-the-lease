// Reading a week-grid calendar screenshot (Wolverine Access, Google Calendar, Atlas Schedule Builder and the
// like) from its geometry, not just its text:
//   columns from the day headers (Sun..Sat), the time scale from the hour labels (6am, 7am...) snapped to the
//   grid's own horizontal lines, and each class from a colored block: its column is the day, its top and
//   bottom edges are the start and end. The text inside each block is read separately by the caller.
//
//   findGrid(img, words) -> { days: [{ day, cx, x0, x1 }], top, minuteAt(y), rowPx } | null
//   findBlocks(img, grid) -> [{ day, x0, y0, x1, y1, start, end }]   (start/end "HH:MM", snapped to 5 minutes)
//   blockLines(blocks) -> ["EECS 280 LEC MoWe 12:00PM - 1:30PM", ...]  (after the caller sets block.text)
// img: { width, height, data } with RGBA bytes (canvas ImageData in the browser, pngjs in tests).
// words: [{ text, x0, y0, x1, y1 }] from the text recognizer, in the same pixel space.

const DAY_RE = /^(sun|mon|tue|wed|thu|fri|sat)/i;
const DAY_ID = { sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat' };
const PAIR = { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' };
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const sat = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);

// "6am", "12pm", "1lam" (11am read with an l), "9 AM", "13:00"
export function hourOf(text) {
  const t = String(text).toLowerCase().replace(/[il|]/g, '1').replace(/o/g, '0').replace(/\s+/g, '');
  let m = /^(\d{1,2})(?::00)?(am|pm|a|p)$/.exec(t);
  if (m) { let h = Number(m[1]) % 12; if (m[2][0] === 'p') h += 12; return h <= 23 ? h : null; }
  m = /^(\d{1,2}):00$/.exec(t);
  if (m && Number(m[1]) <= 23) return Number(m[1]);
  return null;
}

export function findGrid(img, words) {
  const heads = words.filter((w) => DAY_RE.test(w.text) && w.y1 < img.height * 0.3)
    .map((w) => ({ day: DAY_ID[w.text.slice(0, 3).toLowerCase()], cx: (w.x0 + w.x1) / 2, y1: w.y1 }))
    .sort((a, b) => a.cx - b.cx);
  const seen = new Set();
  const days = heads.filter((h) => !seen.has(h.day) && seen.add(h.day));
  if (days.length < 3) return null;
  const gap = (days[days.length - 1].cx - days[0].cx) / (days.length - 1);
  days.forEach((d, i) => {
    d.x0 = i ? (days[i - 1].cx + d.cx) / 2 : d.cx - gap / 2;
    d.x1 = i < days.length - 1 ? (days[i + 1].cx + d.cx) / 2 : d.cx + gap / 2;
  });
  const top = Math.max(...days.map((d) => d.y1)) + 2;
  const left = days[0].x0;

  // hour labels left of the grid
  const labels = words.filter((w) => w.x1 <= left + 8 && w.y0 > top)
    .map((w) => ({ h: hourOf(w.text), yc: (w.y0 + w.y1) / 2, y0: w.y0 })).filter((l) => l.h != null)
    .sort((a, b) => a.yc - b.yc);
  // keep labels whose hours rise with y (drops misreads)
  const clean = [];
  for (const l of labels) if (!clean.length || (l.h > clean[clean.length - 1].h && l.yc > clean[clean.length - 1].yc)) clean.push(l);
  if (clean.length < 2) return null;
  let rowPx = (clean[clean.length - 1].yc - clean[0].yc) / (clean[clean.length - 1].h - clean[0].h);
  if (!(rowPx > 8)) return null;

  // horizontal grid lines: rows where most of the grid width is a light gray, not white, not colored
  const x0 = Math.max(0, Math.round(days[0].x0)), x1 = Math.min(img.width - 1, Math.round(days[days.length - 1].x1));
  const lines = [];
  for (let y = Math.round(top); y < img.height; y++) {
    let n = 0, tot = 0;
    for (let x = x0; x <= x1; x += 2) {
      const c = px(img, x, y); tot++;
      const m = (c[0] + c[1] + c[2]) / 3;
      if (sat(c) < 18 && m > 120 && m < 236) n++;
    }
    if (n / tot > 0.45) { if (lines.length && y - lines[lines.length - 1] <= 2) lines[lines.length - 1] = y; else lines.push(y); }
  }
  // each label's hour starts at the nearest line just above (or at) the label's middle
  const pts = clean.map((l) => {
    const above = lines.filter((y) => y <= l.yc + 2 && l.yc - y < rowPx * 0.7);
    const yb = above.length ? above[above.length - 1] : l.yc - rowPx * 0.25;
    return { y: yb, m: l.h * 60 };
  });
  // least squares: minutes = a * y + b
  const n = pts.length, sx = pts.reduce((s, p) => s + p.y, 0), sy = pts.reduce((s, p) => s + p.m, 0);
  const sxx = pts.reduce((s, p) => s + p.y * p.y, 0), sxy = pts.reduce((s, p) => s + p.y * p.m, 0);
  const a = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - a * sx) / n;
  if (!(a > 0)) return null;
  rowPx = 60 / a;
  return { days, top, left, right: days[days.length - 1].x1, rowPx, minuteAt: (y) => a * y + b };
}

const hhmm = (min) => { const m = Math.max(0, Math.min(23 * 60 + 55, Math.round(min / 5) * 5)); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// Colored blocks inside the grid: connected regions of saturated color, on a 2 px lattice.
export function findBlocks(img, grid) {
  const S = 2;
  const W = Math.ceil(img.width / S), H = Math.ceil(img.height / S);
  const mask = new Uint8Array(W * H);
  const gx0 = Math.floor(grid.left / S), gx1 = Math.ceil(grid.right / S), gy0 = Math.ceil(grid.top / S);
  for (let j = gy0; j < H; j++) {
    for (let i = gx0; i < Math.min(W, gx1); i++) {
      const c = px(img, Math.min(img.width - 1, i * S), Math.min(img.height - 1, j * S));
      if (sat(c) > 45 && Math.max(...c) > 110) mask[j * W + i] = 1;
    }
  }
  // the text inside a block is not colored; close small holes by also marking pixels boxed in by color
  const seen = new Uint8Array(W * H);
  const out = [];
  const minW = (grid.days[0].x1 - grid.days[0].x0) * 0.25 / S, minH = grid.rowPx * 0.25 / S;
  for (let j = gy0; j < H; j++) {
    for (let i = gx0; i < gx1; i++) {
      const k = j * W + i;
      if (!mask[k] || seen[k]) continue;
      let xa = i, xb = i, ya = j, yb = j, area = 0;
      const stack = [k]; seen[k] = 1;
      while (stack.length) {
        const q = stack.pop(); const qx = q % W, qy = (q - qx) / W; area++;
        if (qx < xa) xa = qx; if (qx > xb) xb = qx; if (qy < ya) ya = qy; if (qy > yb) yb = qy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < gx0 || nx >= gx1 || ny < gy0 || ny >= H) continue;
          const nk = ny * W + nx;
          if (mask[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
        }
      }
      if (xb - xa < minW || yb - ya < minH) continue;
      if (area < 0.4 * (xb - xa + 1) * (yb - ya + 1)) continue; // a block is mostly filled
      const box = { x0: xa * S, y0: ya * S, x1: xb * S + S - 1, y1: yb * S + S - 1 };
      const cx = (box.x0 + box.x1) / 2;
      const col = grid.days.find((d) => cx >= d.x0 && cx < d.x1);
      if (!col) continue;
      out.push({ ...box, day: col.day, start: hhmm(grid.minuteAt(box.y0)), end: hhmm(grid.minuteAt(box.y1 + 1)) });
    }
  }
  return out.sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
}

const ampm = (s) => { const [h, m] = s.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'AM' : 'PM'}`; };

// One line per course, component and time, with every day it meets: the course reader in profile.js reads
// these like a registrar list. Exams (MID, FIN, section 999) are left out: they are not weekly.
export function blockLines(blocks) {
  const groups = new Map();
  for (const b of blocks) {
    const t = String(b.text || '').replace(/\s+/g, ' ').trim();
    const m = /\b([A-Z]{2,8})\s?-?\s?(\d{3})\b/.exec(t.toUpperCase().replace(/[O](?=\d)/g, '0'));
    if (!m) continue;
    const comp = (/\b(LEC|DIS|LAB|SEM|REC|MID|FIN|EXAM)\b/i.exec(t)?.[1] || '').toUpperCase();
    if (/MID|FIN|EXAM/.test(comp) || /\(?9{3}\)?/.test(t)) continue;
    const key = `${m[1]} ${m[2]}|${comp}|${b.start}|${b.end}`;
    if (!groups.has(key)) groups.set(key, { code: `${m[1]} ${m[2]}`, comp, start: b.start, end: b.end, days: new Set() });
    groups.get(key).days.add(b.day);
  }
  return [...groups.values()].map((g) => {
    const days = ORDER.filter((d) => g.days.has(d)).map((d) => PAIR[d]).join('');
    return `${g.code}${g.comp ? ` ${g.comp}` : ''} ${days} ${ampm(g.start)} - ${ampm(g.end)}`;
  });
}
