// Agent endpoints for serve.mjs. Zero dependencies (Node 18+ fetch). Keys live only on this server, never in the page.
//
//   POST /api/extract  { files: [{ name, mime, data(base64) }], text?, places: [{ id, label }] }
//        -> { lines: "Mon Wed Fri 9:00-10:30 EECS\n...", notes: ["..."], model }
//        Gemini reads a messy schedule (screenshot, PDF, syllabus, notes) and rewrites it as plain lines that
//        engine/ics.js parseSchedule already understands. The student still confirms every line in the preview.
//   POST /api/send     { to, subject, text } -> { id }    Sends one email through Resend.
//   GET  /api/status   -> { extract: bool, send: bool }    Which keys are set, so the page can hide what cannot work.
//
// Env (web/.env or the shell): GEMINI_API_KEY, GEMINI_MODEL (default gemini-flash-latest),
//                              RESEND_API_KEY, RESEND_FROM (default "Quorum <onboarding@resend.dev>")
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function loadEnv(dir) {
  for (const f of [path.join(dir, '.env'), path.join(dir, '..', '.env')]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const MAX_BODY = 12 * 1024 * 1024;
const OK_MIME = /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf|text\/.*)$/;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('Too big (12 MB max).')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('Bad JSON.')); } });
    req.on('error', reject);
  });
}

const send = (res, code, obj) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(obj));

export function extractPrompt(places) {
  const list = (places || []).map((p) => `- ${p.label}`).join('\n');
  return `You read a university student's messy files (class schedule screenshots, PDFs, syllabi, notes) and
rewrite their WEEKLY routine as plain lines, one recurring activity per line, in exactly this format:

<Label> <Days> <start>-<end> <Place>

Days use Mon Tue Wed Thu Fri Sat Sun separated by spaces. Times are 24h HH:MM. Examples:
Lectures Mon Wed Fri 9:00-10:30 EECS
Late lab Tue Thu 19:00-23:30 Duderstadt Center
Job Sat 10:00-14:00 Kerrytown

Rules:
- Only things that repeat every week (classes, labs, discussion, job shifts, gym, practice). Skip exams and one-off events.
- For Place, use the closest name from this list when the building clearly matches; otherwise copy the location text as written:
${list}
- Never invent a class, time or place that is not in the files. If a time or place is missing, leave the line out and say why in notes.
- Do not include names, emails, student IDs or grades.

Return JSON only: {"lines": ["..."], "notes": ["short plain sentences about anything skipped or uncertain, and any housing-relevant preferences the student stated, e.g. budget or bikes"]}`;
}

export async function extract(body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [501, { error: 'No GEMINI_API_KEY on the server.' }];
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const parts = [{ text: extractPrompt(body.places) }];
  if (body.text?.trim()) parts.push({ text: `Pasted text:\n${body.text.slice(0, 20000)}` });
  for (const f of (body.files || []).slice(0, 5)) {
    if (!f?.data || !OK_MIME.test(f.mime || '')) continue;
    if (f.mime.startsWith('text/')) parts.push({ text: `File ${f.name}:\n${Buffer.from(f.data, 'base64').toString('utf8').slice(0, 20000)}` });
    else parts.push({ inline_data: { mime_type: f.mime, data: f.data } });
  }
  if (parts.length < 2) return [400, { error: 'Nothing to read. Add a file or paste text.' }];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return [502, { error: `Gemini: ${j?.error?.message || r.status}` }];
  const raw = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const out = parseModelJson(raw);
  if (!out) return [502, { error: 'Gemini answered, but not in the expected format. Try again.' }];
  return [200, { lines: out.lines.join('\n'), notes: out.notes, model }];
}

export function parseModelJson(raw) {
  const s = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let o;
  try { o = JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); if (!m) return null; try { o = JSON.parse(m[0]); } catch { return null; } }
  const lines = (Array.isArray(o?.lines) ? o.lines : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 40);
  const notes = (Array.isArray(o?.notes) ? o.notes : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
  return { lines, notes };
}

export async function sendMail(body) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return [501, { error: 'No RESEND_API_KEY on the server.' }];
  const to = String(body.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return [400, { error: 'Enter one valid email address.' }];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Quorum <onboarding@resend.dev>',
      to: [to], subject: String(body.subject || 'Tour request').slice(0, 200), text: String(body.text || '').slice(0, 10000),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return [502, { error: `Resend: ${j?.message || r.status}` }];
  return [200, { id: j.id }];
}

// Returns true when the request was an /api/ call (handled here).
export async function handleApi(req, res) {
  const p = new URL(req.url, 'http://x').pathname;
  if (!p.startsWith('/api/')) return false;
  try {
    if (p === '/api/status' && req.method === 'GET') {
      send(res, 200, { extract: !!process.env.GEMINI_API_KEY, send: !!process.env.RESEND_API_KEY });
    } else if (p === '/api/extract' && req.method === 'POST') {
      const [c, o] = await extract(await readJson(req)); send(res, c, o);
    } else if (p === '/api/send' && req.method === 'POST') {
      const [c, o] = await sendMail(await readJson(req)); send(res, c, o);
    } else send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
  return true;
}
