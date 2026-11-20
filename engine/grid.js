// Reading a week-grid calendar screenshot (Wolverine Access, Google Calendar, Atlas Schedule Builder and the
// like) from its geometry, not just its text:
//   columns from the day headers (Sun..Sat), the time scale from the hour labels (6am, 7am...) snapped to the
//   grid's own horizontal lines, and each class from a colored block: its column is the day, its top and
//   bottom edges are the start and end. The text inside each block is read separately by the caller.
//
//   findGrid(img, words) -> { days: [{ day, cx, x0, x1 }], top, minuteAt(y), rowPx } | null
//   findBlocks(img, grid) -> [{ day, x0, y0, x1, y1, start, end }]   (start/end "HH:MM", snapped to 15 minutes)
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
  const t = String(text).toLowerCase().replace(/[il|]/g, '1').replace(/o/g, '0').replace(/^s(?=\s*[ap])/, '5').replace(/\s+/g, '');
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
  // robust fit, minutes = a * y + b: the median of pairwise slopes (Theil-Sen), so one misread label cannot
  // tilt the scale; then the median intercept
  const slopes = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[j].y !== pts[i].y) slopes.push((pts[j].m - pts[i].m) / (pts[j].y - pts[i].y));
  slopes.sort((p, q) => p - q);
  const a = slopes[Math.floor(slopes.length / 2)];
  const ints = pts.map((p) => p.m - a * p.y).sort((p, q) => p - q);
  const b = ints[Math.floor(ints.length / 2)];
  if (!(a > 0)) return null;
  rowPx = 60 / a;
  return { days, top, left, right: days[days.length - 1].x1, rowPx, minuteAt: (y) => a * y + b };
}

// Block edges snap to 15 minutes: borders and anti-aliasing move an edge a few pixels, and class times sit on
// quarter hours.
const hhmm = (min) => { const m = Math.max(0, Math.min(23 * 60 + 45, Math.round(min / 15) * 15)); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

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
      // a bar across several days is an all-day banner (a course title, an exam week), not a weekly class
      const colW = grid.days[0].x1 - grid.days[0].x0;
      if (box.x1 - box.x0 > colW * 1.5) continue;
      const cx = (box.x0 + box.x1) / 2;
      const col = grid.days.find((d) => cx >= d.x0 && cx < d.x1);
      if (!col) continue;
      const color = px(img, Math.min(img.width - 1, box.x0 + 6), Math.min(img.height - 1, box.y0 + 6));
      out.push({ ...box, color, day: col.day, start: hhmm(grid.minuteAt(box.y0)), end: hhmm(grid.minuteAt(box.y1 + 1)) });
    }
  }
  return out.sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
}

// The rectangle to read inside a block: a little in from its edges, so thick borders do not hide the text.
export function insetRect(bk) {
  const d = Math.max(3, Math.round(Math.min(bk.x1 - bk.x0, bk.y1 - bk.y0) * 0.06));
  return { left: bk.x0 + d, top: bk.y0 + d, width: Math.max(4, bk.x1 - bk.x0 + 1 - 2 * d), height: Math.max(4, bk.y1 - bk.y0 + 1 - 2 * d) };
}

// Course codes as text recognition reads them: "TCHNCLCM3q0" -> TCHNCLCM 300, "ECS498" -> EECS 498.
const SUBJECTS = ['EECS', 'MATH', 'PHYSICS', 'CHEM', 'STATS', 'ECON', 'PSYCH', 'BIOLOGY', 'ENGLISH', 'HISTORY', 'ENGR', 'MECHENG',
  'AEROSP', 'NURS', 'FIN', 'MKT', 'ACC', 'MUSIC', 'THEORY', 'CLCIV', 'TCHNCLCM', 'SPANISH', 'FRENCH', 'ASIAN', 'COMM', 'POLSCI', 'SOC', 'PHIL',
  'IOE', 'CEE', 'ROB', 'DATASCI', 'SI', 'LING', 'ASTRO', 'EARTH', 'EEB', 'MCDB', 'BIOLCHEM', 'ANTHRCUL', 'WRITING', 'NEURO', 'ARCH', 'ART'];
export function courseCode(text) {
  const t = String(text || '').toUpperCase().replace(/[“”"'`]/g, '');
  const m = /([A-Z]{2,9})\s?-?\s?([0-9OQILSZ]{3})(?![0-9A-Z])/.exec(t);
  if (!m) return null;
  const num = m[2].replace(/[OQ]/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/Z/g, '2');
  if (!/^\d{3}$/.test(num)) return null;
  let subj = m[1];
  if (!SUBJECTS.includes(subj)) {
    // common OCR slips (VI for M, RN for M, 0 for O), then one letter added, dropped or changed
    const swap = subj.replace(/VI/g, 'M').replace(/RN/g, 'M').replace(/0/g, 'O').replace(/5/g, 'S');
    const fix = SUBJECTS.includes(swap) ? swap : SUBJECTS.find((x) => x.length >= 3 && editDist1(x, subj));
    if (fix) subj = fix;
  }
  return `${subj} ${num}`;
}

function editDist1(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

const ampm = (s) => { const [h, m] = s.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'AM' : 'PM'}`; };

// One line per course, component and time, with every day it meets: the course reader in profile.js reads
// these like a registrar list. Exams (MID, FIN, section 999) are left out: they are not weekly.
export function blockLines(blocks) {
  const groups = new Map();
  const near = (a, b) => a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40;
  for (const b of blocks) {
    if (!courseCode(b.text)) {
      const twin = blocks.find((x) => x !== b && courseCode(x.text) && x.start === b.start && x.end === b.end && near(x.color, b.color));
      if (twin) b.text = twin.text;
    }
  }
  for (const b of blocks) {
    const t = String(b.text || '').replace(/\s+/g, ' ').trim();
    const code = courseCode(t);
    if (!code) continue;
    const m = [null, ...code.split(' ')];
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
