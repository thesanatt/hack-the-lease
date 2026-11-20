// Roommate profiles. What the student chooses to show other students (kept on this laptop in this demo), the
// other students interested in a home (the app's FICTIONAL sample students), and how compatible each is:
// a transparent score from budget, daily rhythm, campus and shared homes; the local model can re-rank with
// a reason per person.
import { useEffect, useState } from 'react';
import { lastStatus } from './assistant.js';

const KEY = 'quorum.share.v1';
const EVT = 'quorum-store';
export const SHARE_ITEMS = {
  calendar: 'My weekly calendar', program: 'What I study', budget: 'My budget', wishes: 'What I want in a home',
  habits: 'Night owl or early bird', bio: 'A short bio', listed: 'Show me on homes I like',
};
const EMPTY = { calendar: false, program: false, budget: false, wishes: false, habits: false, bio: false, listed: false, bioText: '', name: '' };
const read = () => { try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...EMPTY }; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* memory only */ } window.dispatchEvent(new Event(EVT)); };

export function useShare() {
  const [s, setS] = useState(read);
  useEffect(() => { const on = () => setS(read()); window.addEventListener(EVT, on); return () => window.removeEventListener(EVT, on); }, []);
  return { s, set: (patch) => write({ ...read(), ...patch }), replace: (v) => write(v) };
}

// "make my calendar public", "hide my budget", "share everything", "my bio: ..." without the model.
export function shareByRules(text) {
  const t = text.toLowerCase();
  const patch = {};
  const hide = /\b(hide|private|remove|don'?t (show|share)|stop sharing|unshare|not public)\b/.test(t);
  const on = !hide;
  const all = /\b(everything|all of it|whole profile|all my)\b/.test(t);
  const words = { calendar: /calendar|schedule|week|classes/, program: /major|program|what i study|study/, budget: /budget|rent|price|money/,
    wishes: /wish|want|preferences?|looking for/, habits: /night owl|early bird|habit|sleep|rhythm/, bio: /\bbio\b|about me/, listed: /list me|show me on|interested list|appear/ };
  for (const [k, re] of Object.entries(words)) if (all || re.test(t)) patch[k] = on;
  const bio = /\b(?:bio|about me)\s*[:-]\s*(.+)$/i.exec(text);
  if (bio) { patch.bioText = bio[1].trim().slice(0, 280); patch.bio = true; }
  const nm = /\b(?:call me|my name is|name:)\s+([A-Z][a-z]+)/.exec(text);
  if (nm) patch.name = nm[1];
  return patch;
}

const SHARE_SCHEMA = { type: 'object', properties: { reply: { type: 'string' }, share: { type: 'object', properties: Object.fromEntries(Object.keys(SHARE_ITEMS).map((k) => [k, { type: 'boolean' }])) }, bio: { type: 'string' }, name: { type: 'string' } }, required: ['reply'] };
export async function shareByAI(text, current) {
  const sys = `You set what a student shows on their public roommate profile. Items: ${Object.entries(SHARE_ITEMS).map(([k, v]) => `${k} (${v})`).join(', ')}.
Reply ONLY with JSON {"reply": one short sentence, "share": {item: true or false, only the items they mention}, "bio": text if they give a bio, "name": first name if they give one}.
"Make my calendar public" -> {"share": {"calendar": true}}. "Hide my budget" -> {"share": {"budget": false}}. "Share everything" -> every item true.
Current settings: ${JSON.stringify(current)}.`;
  const r = await fetch('http://localhost:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: lastStatus.model, stream: false, format: SHARE_SCHEMA, keep_alive: '30m', options: { temperature: 0, num_ctx: 2048 },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: text }] }) });
  if (!r.ok) throw new Error(`The local model answered ${r.status}.`);
  const out = JSON.parse((await r.json()).message?.content || '{}');
  const patch = {};
  for (const [k, v] of Object.entries(out.share || {})) if (k in SHARE_ITEMS && typeof v === 'boolean') patch[k] = v;
  if (typeof out.bio === 'string' && out.bio.trim()) { patch.bioText = out.bio.trim().slice(0, 280); patch.bio = true; }
  if (typeof out.name === 'string' && /^[A-Za-z][a-z]{1,20}$/.test(out.name.trim())) patch.name = out.name.trim();
  return { reply: String(out.reply || ''), patch };
}

// ---------------------------------------------------------------- other students (FICTIONAL samples)
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const FIRST = { jordan: 'Jordan', maya: 'Maya', priya: 'Priya', leo: 'Leo', sam: 'Sam', noor: 'Noor', dev: 'Dev', clara: 'Clara', amara: 'Amara', mateo: 'Mateo' };

// Each sample student: a public roommate profile and the homes they like.
export function sampleStudents(api) {
  const { personas, homes, placeById } = api.data;
  return personas.map((p) => {
    const h = hash(p.id);
    const week = p.week.map((e) => ({ ...e, id: `${p.id}-${e.id}`, source: 'schedule' }));
    const r = rhythm(week);
    const area = mainArea(week, placeById);
    const likes = homes.filter((x) => (hash(p.id + x.id) % 3) === 0 || (hash(x.id) % 10) === (h % 10)).map((x) => x.id);
    return {
      id: p.id, name: FIRST[p.id] || p.name, program: p.program.split(',')[0], color: p.color, week, rhythm: r, area,
      budget: p.cap, bike: !!p.modes?.bike, likes,
      shares: { calendar: h % 4 !== 0, budget: h % 3 !== 0, program: true, habits: true, wishes: true, bio: true },
      bio: `${p.program.split(',')[0]} student. ${r === 'night' ? 'Up late most nights' : r === 'early' ? 'Early riser' : 'Regular hours'}, ${area ? `most days on ${area}` : 'all over campus'}. ${p.modes?.bike ? 'Bikes everywhere.' : 'Takes the bus.'}`,
    };
  });
}

export function rhythm(week) {
  let late = 0, early = 0;
  for (const e of week || []) { const n = e.days?.length || 0; if (e.end >= '22:00' || e.end < '04:00') late += n; if (e.start && e.start < '08:00') early += n; }
  return late >= 2 && late > early ? 'night' : early >= 2 ? 'early' : 'regular';
}
export function mainArea(week, placeById) {
  const c = {};
  for (const e of week || []) { const a = placeById.get(e.place)?.area; if (a) c[a] = (c[a] || 0) + (e.days?.length || 0); }
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best ? (best[0] === 'Downtown' ? 'Downtown' : `${best[0]} Campus`) : null;
}
const NEAR = { 'Central Campus': ['Medical Campus', 'Downtown', 'South Campus'], 'Medical Campus': ['Central Campus', 'North Campus'], 'North Campus': ['Medical Campus'], Downtown: ['Central Campus'] };

// A transparent score out of 100 with its reasons.
export function compatibility(me, them, savedIds) {
  const parts = [];
  let score = 0;
  if (me.budget && them.budget) {
    const gap = Math.abs(me.budget - them.budget), pts = Math.round(30 * Math.max(0, 1 - gap / 300));
    score += pts; parts.push({ pts, max: 30, text: gap <= 75 ? `Similar budgets ($${them.budget.toLocaleString('en-US')})` : `Budgets $${gap} apart` });
  } else { score += 15; parts.push({ pts: 15, max: 30, text: 'Budget not shared by both' }); }
  const rpts = me.rhythm === them.rhythm ? 30 : (me.rhythm === 'regular' || them.rhythm === 'regular') ? 18 : 5;
  score += rpts; parts.push({ pts: rpts, max: 30, text: me.rhythm === them.rhythm ? `Both ${me.rhythm === 'night' ? 'night owls' : me.rhythm === 'early' ? 'early birds' : 'on regular hours'}` : `${them.rhythm === 'night' ? 'Night owl' : them.rhythm === 'early' ? 'Early bird' : 'Regular hours'}, you are ${me.rhythm === 'night' ? 'a night owl' : me.rhythm === 'early' ? 'an early bird' : 'on regular hours'}` });
  const apts = me.area && them.area ? (me.area === them.area ? 20 : (NEAR[me.area] || []).includes(them.area) ? 12 : 5) : 10;
  score += apts; parts.push({ pts: apts, max: 20, text: me.area && them.area ? (me.area === them.area ? `Both mostly on ${me.area}` : `${them.area}, you are on ${me.area}`) : 'Campus not known for both' });
  const both = them.likes.filter((id) => savedIds.includes(id)).length;
  const spts = Math.min(20, both * 7);
  score += spts; parts.push({ pts: spts, max: 20, text: `${both} saved home${both === 1 ? '' : 's'} in common` });
  return { score, parts };
}

// The student's own public view, from their profile and sharing choices.
export function myCard(profile, share, api) {
  const week = profile?.scheduled || [];
  return {
    id: 'me', name: share.name || 'You', program: profile?.program?.label || null, week, rhythm: rhythm(week),
    area: mainArea(week, api.data.placeById), budget: profile?.budget || null, bike: !!profile?.modes?.bike,
    wishes: [...(profile?.reqs || []).map((r) => r.label), ...(profile?.wants || []).map((w) => w.label), ...(profile?.near || []).map((n) => `Near ${n.label}`)],
  };
}

const RANK_SCHEMA = { type: 'object', properties: { ranking: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } } }, required: ['ranking'] };
// The local model orders the candidates and gives one reason each; unknown ids are dropped, missing ones kept.
export async function rankByAI(me, cands) {
  const brief = (x) => ({ id: x.id, name: x.name, program: x.program, budget: x.shares?.budget === false ? 'not shared' : x.budget, rhythm: x.rhythm, area: x.area, bike: x.bike, score: x.score });
  const sys = 'You match college roommates. Order the candidates from most to least compatible with the student, using budget, daily rhythm (night owl, early bird), campus and anything else given. Reply ONLY with JSON {"ranking": [{"id", "reason": one short sentence}]}, every candidate once.';
  const r = await fetch('http://localhost:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: lastStatus.model, stream: false, format: RANK_SCHEMA, keep_alive: '30m', options: { temperature: 0, num_ctx: 3072 },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify({ student: { budget: me.budget, rhythm: me.rhythm, area: me.area, program: me.program, wishes: me.wishes }, candidates: cands.map(brief) }) }] }) });
  if (!r.ok) throw new Error(`The local model answered ${r.status}.`);
  const out = JSON.parse((await r.json()).message?.content || '{}');
  const ids = new Set(cands.map((c) => c.id));
  const seen = new Set();
  const order = (out.ranking || []).filter((x) => ids.has(x.id) && !seen.has(x.id) && seen.add(x.id)).map((x) => ({ id: x.id, reason: String(x.reason || '').slice(0, 160) }));
  for (const c of cands) if (!seen.has(c.id)) order.push({ id: c.id, reason: '' });
  return order;
}
