// The local assistant: a language model running in Ollama on this laptop (http://localhost:11434). It reads
// what the student types plus their current calendar and answers with a short reply and a list of changes.
// Every change is checked here before it is applied: days, times and places must be real, ids must exist,
// a tour must fit an open slot from the timetable planner. Nothing leaves the laptop.
// When Ollama is not running, the profile page falls back to the rule-based reader (engine/profile.js).

import { FIELDS, OPS, validRequirement } from './listing.js';
import { matchPlace } from '../../../engine/ics.js';

const BASE = 'http://localhost:11434';
export const lastStatus = { ok: false, model: null };
const PREFERRED = ['llama3.2:3b', 'llama3.2', 'qwen2.5:3b', 'qwen2.5:7b', 'llama3.1:8b', 'llama3.1', 'gemma2:2b', 'phi3'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

async function withTimeout(p, ms) {
  let t; const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); });
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(t); }
}

// { ok, model, models } or { ok: false }
export async function assistantStatus() {
  try {
    const r = await withTimeout(fetch(`${BASE}/api/tags`), 1500);
    if (!r.ok) return { ok: false };
    const j = await r.json();
    const models = (j.models || []).map((m) => m.name);
    if (!models.length) return { ok: false, reason: 'no-model' };
    const model = PREFERRED.find((p) => models.includes(p)) || PREFERRED.map((p) => models.find((m) => m.startsWith(p))).find(Boolean) || models[0];
    Object.assign(lastStatus, { ok: true, model, models });
    return { ok: true, model, models };
  } catch { return { ok: false }; }
}

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['add_event', 'change_event', 'remove_event', 'set_budget', 'set_bike', 'set_late_walk', 'schedule_tour', 'require', 'drop_requirement'] },
          field: { type: 'string' }, op: { type: 'string', enum: OPS },
          id: { type: 'string' }, label: { type: 'string' },
          days: { type: 'array', items: { type: 'string', enum: DAYS } },
          start: { type: 'string' }, end: { type: 'string' }, place: { type: 'string' },
          amount: { type: 'number' }, value: { type: 'string' }, home: { type: 'string' },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
};

const SYSTEM = () => `You edit a university student's weekly calendar in a housing app. Reply ONLY with JSON:
{"reply": one short friendly sentence, "actions": [ ... ]}.
Action types:
- add_event: label, days (mon..sun), start and end as 24-hour "HH:MM", place (a place id from the list, or "" if none was named).
- change_event: id (from the calendar), and only the fields that change (days, start, end, place, label).
- remove_event: id.
- set_budget: amount (dollars per month). set_bike: value "yes" or "no". set_late_walk: value "short", "normal" or "long".
- schedule_tour: home (an id from saved homes), days (one day), start "HH:MM". Tours are 30 minutes.
- require: something they want in a home, as a test on one listing field: label (short, for the student), field, op, value.
  Fields: ${Object.entries(FIELDS).map(([k, v]) => `${k} (${v.split(':')[0].split(',')[0]})`).join('; ')}.
  op is one of = != <= >= < > contains not_contains. value is a string: a number, yes/no, a date YYYY-MM-DD, or text.
  Examples: "close to Hadley" -> field walk_min_to:ccrb op <= value 15; "in-unit laundry" -> laundry_free = yes;
  "I have a cat" -> pets contains cat; "8 month lease" -> lease_months = 8; "move in by Aug 20" -> move_in <= 2027-08-20;
  "under 20 min to class" -> trip_min_to:<their main class place id> <= 20; "big room" -> max_room_sqft >= 170; "no basement" -> basement_room = no.
- drop_requirement: label of one they no longer want.
One request can need several actions (a budget, two requirements and an event). Leases here start in Aug or Sep 2027.
If the text is a resume or a schedule, add each weekly event with a time and each housing wish; ignore jobs or classes with no weekly time.
When your previous reply asked a question, the student's next message is the answer: act on it (a bare number after
"What is your budget?" is the budget). Do not ask the same question twice.
To move an event to another building, use change_event with its id and the new place id.
Rules: use only ids and place ids given below. Never invent a place; if none fits, use "". Read "2 to 3" as 14:00 to 15:00
unless morning is clear. If the request is unclear or impossible, return no actions and ask one short question in reply.`;

const OPTIONS = { temperature: 0, num_ctx: 3072, num_predict: 300 };

// Load the model into memory once, so the first real request does not wait for it; keep it for 30 minutes.
export function warmUp(model) {
  fetch(`${BASE}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', keep_alive: '30m' }) }).catch(() => {});
}

// history: the last few turns of this conversation, [{ user, reply, actions }], oldest first, so a short answer
// ("2000") is read as the answer to the question the assistant just asked.
export async function interpret({ text, model, context, signal, history = [] }) {
  const past = history.slice(-4).flatMap((h) => [
    { role: 'user', content: `Student: ${h.user}` },
    { role: 'assistant', content: JSON.stringify({ reply: h.reply, actions: h.actions || [] }) },
  ]);
  const body = (format) => JSON.stringify({
    model, stream: false, format, keep_alive: '30m', options: OPTIONS,
    messages: [{ role: 'system', content: SYSTEM() }, ...past, { role: 'user', content: `${JSON.stringify(context)}\n\nStudent: ${text}` }],
  });
  const post = (b) => fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b, signal });
  let r = await withTimeout(post(body(SCHEMA)), 180000);
  if (r.status === 400) r = await withTimeout(post(body('json')), 180000);
  if (!r.ok) throw new Error(`The local model answered ${r.status}.`);
  const j = await r.json();
  let out;
  try { out = JSON.parse(j.message?.content || '{}'); } catch { throw new Error('The local model did not answer in the expected format. Try rephrasing.'); }
  return { reply: String(out.reply || ''), actions: Array.isArray(out.actions) ? out.actions : [] };
}

// What the model sees: the calendar, the places it may use, saved homes, booked tours, today.
export function buildContext({ profile, places, savedHomes, tours, today = new Date() }) {
  return {
    today: today.toDateString(),
    calendar: (profile?.allEntries || []).filter((e) => !profile.off?.has(e.id)).map((e) => `${e.id}: ${e.label}, ${e.days.join(' ')} ${e.start}-${e.end}${e.place ? ` @${e.place}` : ''}`),
    places: places.map((p) => `${p.id}=${p.label.replace(/\s*\(.*?\)/, '')}`).join('; '),
    saved_homes: savedHomes.map((h) => `${h.id}=${h.name.replace(/, \d+ bed$/, '')}`).join('; '),
    booked_tours: tours.map((t) => ({ home: t.homeId, day: t.day, start: t.start })),
    budget: profile?.budget ?? null, bike: !!profile?.modes?.bike,
    current_wishes: (profile?.reqs || []).map((r) => r.label),
  };
}

const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const norm = (t) => { const m = HM.exec(String(t || '').trim()); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
const LATE = { short: 6, normal: 12, long: 20 };

// Check each action and turn it into an edit. Returns { edits: [{ kind, ...}], notes: [string] }.
// "weiser_hall", "Weiser Hall", "the dude" -> a place id, through the same name table the file readers use.
function resolvePlace(raw, placeIds, places) {
  if (!raw) return null;
  const r = String(raw).trim();
  if (placeIds.has(r)) return r;
  const m = matchPlace(r.replace(/_/g, ' '), places);
  return m.place && placeIds.has(m.place) ? m.place : null;
}

export function checkActions(actions, { profile, placeIds, savedIds, api }) {
  const places = api?.data?.places || [];
  const ids = new Set((profile?.allEntries || []).map((e) => e.id));
  const ok = [], notes = [];
  let n = 0;
  for (const a of actions || []) {
    const days = (a.days || []).map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => DAYS.includes(d));
    const start = a.start ? norm(a.start) : null, end = a.end ? norm(a.end) : null;
    const place = resolvePlace(a.place, placeIds, places);
    const unknownPlace = a.place && !place ? String(a.place).replace(/_/g, ' ') : null;
    if (unknownPlace) notes.push(`Quorum's map does not have "${unknownPlace}" yet. Choose the closest building with Edit on that row of Your week.`);
    switch (a.type) {
      case 'add_event':
        if (!days.length || !start || !end || start >= end) { notes.push(`Skipped "${a.label || 'event'}": it needs days and a start before its end.`); break; }
        ok.push({ kind: 'add', entry: { ...(unknownPlace ? { placeName: unknownPlace } : {}), id: `ai_${Date.now().toString(36)}_${n++}`, label: String(a.label || 'Event').slice(0, 40), days, start, end, place, p: 1, alt: [], on: true, source: 'assistant' } });
        break;
      case 'change_event': {
        if (!ids.has(a.id)) { notes.push(`Could not find "${a.id}" on your calendar.`); break; }
        const patch = {};
        if (days.length) patch.days = days;
        if (start) patch.start = start;
        if (end) patch.end = end;
        if (place) patch.place = place;   // an unknown building leaves the row where it was
        if (a.label) patch.label = String(a.label).slice(0, 40);
        if (patch.start && patch.end && patch.start >= patch.end) { notes.push('Skipped a change whose end was before its start.'); break; }
        if (Object.keys(patch).length) ok.push({ kind: 'change', id: a.id, patch });
        break;
      }
      case 'remove_event':
        if (!ids.has(a.id)) { notes.push(`Could not find "${a.id}" on your calendar.`); break; }
        ok.push({ kind: 'remove', id: a.id });
        break;
      case 'set_budget': {
        const v = Number(a.amount);
        if (v >= 300 && v <= 5000) ok.push({ kind: 'budget', value: Math.round(v) }); else notes.push('Skipped a budget outside $300 to $5,000.');
        break;
      }
      case 'set_bike': ok.push({ kind: 'bike', value: /^(yes|true)$/i.test(String(a.value)) }); break;
      case 'set_late_walk': if (LATE[String(a.value).toLowerCase()]) ok.push({ kind: 'late', value: LATE[String(a.value).toLowerCase()] }); break;
      case 'require': {
        const req = { label: String(a.label || '').trim().slice(0, 60), field: String(a.field || '').trim(), op: a.op, value: a.value ?? (a.amount != null ? String(a.amount) : undefined) };
        const bad = validRequirement(req, api);
        if (bad) { notes.push(`Skipped "${req.label || 'a wish'}": ${bad}.`); break; }
        ok.push({ kind: 'req', req });
        break;
      }
      case 'drop_requirement': ok.push({ kind: 'dropreq', label: String(a.label || '') }); break;
      case 'schedule_tour':
        if (!savedIds.has(a.home)) { notes.push('Tours are for saved homes. Save the home first.'); break; }
        if (days.length !== 1 || !start) { notes.push('A tour needs one day and a start time.'); break; }
        ok.push({ kind: 'tour', home: a.home, day: days[0], start });
        break;
      default: break;
    }
  }
  return { edits: ok, notes };
}
