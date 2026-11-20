// The student's own data, kept only in this browser (localStorage), never uploaded.
//   profile state: { sources: [{ id, kind: 'file'|'text', name, text, addedAt }], edits: { off: [entryId], budget, bike, late } }
//     text is stored with emails and phone numbers already removed (engine/profile.js redactContact).
//   saved: [homeId] in the order they were saved.
// Tabs remount on every switch, so each hook reads the store on mount and listens for changes.
import { useEffect, useMemo, useState } from 'react';
import { readProfile, redactContact } from '../../../engine/profile.js';

const PKEY = 'quorum.profile.v1';
const SKEY = 'quorum.saved.v1';
const EVT = 'quorum-store';
const EMPTY = { sources: [], edits: { off: [] } };
const EMPTY_PROFILE = { program: null, entries: [], typical: [], modes: { bike: false, maxWalkMin: 20, lateHour: '22:00', maxLateWalkMin: 12 }, modesWhy: {},
  budget: null, budgetWhy: null, wage: null, wageWhy: null, likes: [], notes: [], courses: [], links: [], unplaced: [], kept: { emails: 0, phones: 0 }, near: [], minSqft: null, groupSize: null };

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: keep in memory */ } mem[k] = v; window.dispatchEvent(new Event(EVT)); };
const mem = {};
const get = (k, d) => mem[k] ?? read(k, d);

function useStored(key, dflt) {
  const [v, setV] = useState(() => get(key, dflt));
  useEffect(() => {
    const on = () => setV(get(key, dflt));
    window.addEventListener(EVT, on); window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', on); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, (next) => write(key, typeof next === 'function' ? next(get(key, dflt)) : next)];
}

// ---------------------------------------------------------------- saved homes
export function useSaved() {
  const [ids, setIds] = useStored(SKEY, []);
  const toggle = (id) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return { ids, has: (id) => ids.includes(id), toggle, clear: () => setIds([]), set: setIds };
}

// ---------------------------------------------------------------- profile
let nextId = 1;
const newId = () => `src${Date.now().toString(36)}${nextId++}`;

export function useProfile(api) {
  const [state, setState] = useStored(PKEY, EMPTY);
  const st = { ...EMPTY, ...state, edits: { off: [], ...(state?.edits || {}) } };
  const text = st.sources.filter((s) => !s.viaAI).map((s) => s.text).join('\n\n');
  const base = useMemo(() => (text.trim() ? readProfile(text, { places: api.data.places, personas: api.data.personas }) : null),
    [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const profile = useMemo(() => applyEdits(base || (st.sources.length || st.edits.added?.length || st.edits.reqs?.length ? EMPTY_PROFILE : null), st.edits), [base, st.sources.length, JSON.stringify(st.edits)]); // eslint-disable-line react-hooks/exhaustive-deps

  const addSource = (kind, name, rawText, flags = {}) => setState((cur) => ({
    ...EMPTY, ...cur,
    sources: [...(cur?.sources || []), {
      id: newId(), kind, name, text: redactContact(rawText), addedAt: new Date().toISOString(), ...flags,
      dropped: {
        emails: (rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length,
        phones: (rawText.match(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g) || []).length,
      },
    }],
  }));
  const removeSource = (id) => setState((cur) => ({ ...cur, sources: (cur.sources || []).filter((s) => s.id !== id) }));
  const edit = (patch) => setState((cur) => ({ ...cur, edits: { off: [], ...(cur?.edits || {}), ...patch } }));
  const fixEntry = (id, patch) => edit({ fix: { ...(st.edits.fix || {}), [id]: { ...((st.edits.fix || {})[id] || {}), ...patch } } });
  const dropPref = (k) => edit({ offPrefs: [...new Set([...(st.edits.offPrefs || []), k])] });
  const toggleEntry = (id) => edit({ off: st.edits.off.includes(id) ? st.edits.off.filter((x) => x !== id) : [...st.edits.off, id] });
  const clear = () => setState(EMPTY);
  // whole-edits replace, for Undo after the assistant changed several things at once
  const replaceEdits = (edits) => setState((cur) => ({ ...cur, edits: { off: [], ...edits } }));
  return { state: st, profile, base, addSource, removeSource, edit, toggleEntry, fixEntry, replaceEdits, dropPref, clear, empty: !st.sources.length && !(st.edits.added || []).length };
}

// Edits the student made on the profile page win over what was read. Only complete rows (days, start and end)
// go to the router; the rest wait on screen for a time. The typical week is used only when switched on.
export const hasTime = (e) => !!(e.days?.length && e.start && e.end && e.start < e.end);
export const isComplete = (e) => hasTime(e) && !!e.place;
export function applyEdits(p, edits = {}) {
  if (!p) return null;
  const off = new Set(edits.off || []);
  const offP = new Set(edits.offPrefs || []);
  const fix = edits.fix || {};
  const merge = (e) => (fix[e.id] ? { ...e, ...fix[e.id], edited: true, placeGuessed: fix[e.id].place ? false : e.placeGuessed } : e);
  let all = [...p.entries, ...(edits.added || [])].map(merge);
  if (edits.useTypical) all = [...all, ...(p.typical || []).map(merge)];
  all = all.map((e) => ({ ...e, complete: isComplete(e), timed: hasTime(e) }));
  const modes = { ...p.modes };
  if (edits.bike != null) modes.bike = edits.bike;
  if (edits.late != null) modes.maxLateWalkMin = edits.late;
  return {
    ...p,
    allEntries: all,
    entries: all.filter((e) => e.complete && !off.has(e.id)),
    waiting: all.filter((e) => !e.timed && !off.has(e.id)),
    // everything with a day and a time, with or without a building: the calendar and tour busy times
    scheduled: all.filter((e) => e.timed && !off.has(e.id)),
    timeOnly: all.filter((e) => e.timed && !e.place && !off.has(e.id)),
    off,
    modes,
    useTypical: !!edits.useTypical,
    reqs: (edits.reqs || []).filter((r) => !offP.has(`req:${r.label}`)),
    near: [...(p.near || []), ...(edits.near || []).filter((n) => !(p.near || []).some((x) => x.place === n.place))].filter((n) => !offP.has(`near:${n.place}`)),
    wants: [...(p.wants || []), ...(edits.wants || []).filter((w) => !(p.wants || []).some((x) => x.key === w.key))].filter((w) => !offP.has(`want:${w.key}`)),
    likes: [...(p.likes || []), ...(edits.likes || []).filter((w) => !(p.likes || []).some((x) => x.key === w.key))].filter((w) => !offP.has(`like:${w.key}`)),
    notes: [...(p.notes || []), ...(edits.notes || []).filter((w) => !(p.notes || []).some((x) => x.key === w.key))].filter((w) => !offP.has(`note:${w.key}`)),
    budget: edits.budget !== undefined ? edits.budget : p.budget,
  };
}

// A short signature of what the ranking depends on, for caching across tabs.
export const profileKey = (p) => (p ? JSON.stringify([p.entries.map((e) => [e.id, e.place, e.days, e.start, e.end, e.p]), p.modes, p.wage, p.likes.map((l) => l.key)]) : 'none');
