// Send text to the local model, check what it proposes, apply it to the profile in one step, and describe it.
// Used by Tell Quorum and by file uploads (resume and note text) when the local AI is on.
import { interpret, buildContext, checkActions } from './assistant.js';
import { tourOptions, nextDate, tripText, clock12, dateLabel } from './tours.js';
import { short } from './parts.jsx';

const DAY = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export async function applyAssistant({ api, P, T, saved, text, model, signal, history = [] }) {
  const profile = P.profile || { allEntries: [], off: new Set(), modes: {}, reqs: [] };
  const savedHomes = saved.ids.map((id) => api.data.homeById.get(id)).filter(Boolean);
  const context = buildContext({ profile, places: api.data.places, savedHomes, tours: T.list });
  const { reply, actions } = await interpret({ text, model, context, signal, history });
  const { edits, notes } = checkActions(actions, { profile, api, placeIds: new Set(api.data.places.map((p) => p.id)), savedIds: new Set(saved.ids) });
  const before = { edits: JSON.parse(JSON.stringify(P.state.edits)), tours: [...T.list] };
  const next = JSON.parse(JSON.stringify(P.state.edits));
  next.added = next.added || []; next.fix = next.fix || {}; next.off = next.off || []; next.reqs = next.reqs || [];
  const changes = [];
  const byId = new Map((profile.allEntries || []).map((e) => [e.id, e]));
  const placeName = (id) => api.data.placeById.get(id)?.label || 'no building';
  for (const e of edits) {
    if (e.kind === 'add') { next.added.push(e.entry); changes.push(`Added ${e.entry.label}, ${e.entry.days.map((d) => DAY[d]).join(' ')} ${clock12(e.entry.start)} to ${clock12(e.entry.end)}${e.entry.place ? `, ${placeName(e.entry.place)}` : ''}.`); }
    if (e.kind === 'change') {
      next.fix[e.id] = { ...(next.fix[e.id] || {}), ...e.patch };
      const what = [e.patch.place && `to ${placeName(e.patch.place)}`, (e.patch.start || e.patch.days) && `to ${(e.patch.days || byId.get(e.id)?.days || []).map((d) => DAY[d]).join(' ')} ${clock12(e.patch.start || byId.get(e.id)?.start)}`].filter(Boolean).join(' and ');
      changes.push(`Moved ${byId.get(e.id)?.label || e.id}${what ? ` ${what}` : ''}.`);
    }
    if (e.kind === 'remove') { if (!next.off.includes(e.id)) next.off.push(e.id); changes.push(`Removed ${byId.get(e.id)?.label || e.id}.`); }
    if (e.kind === 'budget') { next.budget = e.value; changes.push(`Budget set to $${e.value.toLocaleString('en-US')} a month.`); }
    if (e.kind === 'bike') { next.bike = e.value; changes.push(e.value ? 'You bike.' : 'You do not bike.'); }
    if (e.kind === 'late') { next.late = e.value; changes.push(`Walking home late: up to ${e.value} minutes.`); }
    if (e.kind === 'req') { next.reqs = [...next.reqs.filter((r) => r.label.toLowerCase() !== e.req.label.toLowerCase()), e.req]; changes.push(`Browse now checks: ${e.req.label}.`); }
    if (e.kind === 'dropreq') {
      const k = e.label.toLowerCase();
      const gone = next.reqs.filter((r) => r.label.toLowerCase().includes(k) || k.includes(r.label.toLowerCase()));
      next.reqs = next.reqs.filter((r) => !gone.includes(r));
      if (gone.length) changes.push(`No longer checking: ${gone.map((r) => r.label).join(', ')}.`); else notes.push(`No wish called "${e.label}".`);
    }
    if (e.kind === 'tour') {
      const home = api.data.homeById.get(e.home);
      const opts = tourOptions(api, profile, home, T.list);
      const o = opts?.options.find((x) => x.day === e.day && x.start === e.start);
      if (o) {
        const date = nextDate(o.day);
        T.book({ id: `tour-${home.id}`, homeId: home.id, day: o.day, start: o.start, end: o.end, date: date.toISOString(),
          label: `Tour: ${short(home.name)}`, to: tripText(api, o.to, true), back: tripText(api, o.back, false) });
        changes.push(`Tour of ${short(home.name)} booked for ${dateLabel(date)}, ${clock12(o.start)}.`);
      } else {
        const that = (opts?.options || []).filter((x) => x.day === e.day).slice(0, 4).map((x) => clock12(x.start));
        notes.push(`${short(home.name)} is not open for you then${that.length ? `. Open that day: ${that.join(', ')}` : ', and that day has no open time'}.`);
      }
    }
  }
  P.replaceEdits(next);
  // the model's reply only stands when something changed or it asked a question
  const said = changes.length || !actions.length ? reply : 'Nothing was changed.';
  return { reply: said, changes, notes, undo: before, turn: { user: text, reply, actions } };
}
