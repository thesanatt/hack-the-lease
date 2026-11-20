// Stress test for the local AI (Tell Quorum): realistic student requests through the real model in Ollama,
// with the app's own instructions, context and validator. Prints what the model proposed, what the app kept or
// skipped, and whether the reading matches what a person would expect. Needs Ollama running with a model.
//   node scripts/assistant_stress.mjs            (uses llama3.2:3b, or the first model installed)
//   node scripts/assistant_stress.mjs llama3.2:1b
//   OLLAMA=http://localhost:11434 node scripts/assistant_stress.mjs
import { readFileSync } from 'node:fs';
import { readProfile } from '../engine/profile.js';
import { assistantStatus, interpret, buildContext, checkActions } from '../web/src/student/assistant.js';

const data = (f) => JSON.parse(readFileSync(new URL(`../web/public/data/${f}`, import.meta.url)));
const places = data('places.json');
const homes = data('homes.json').homes;
const api = { data: { places, placeById: new Map(places.map((p) => [p.id, p])), homeById: new Map(homes.map((h) => [h.id, h])) } };

// The sample student: the fictional resume's week.
const resume = `EECS 281 Mon Wed 10:30am-12pm, EECS Building\nEECS 370 Tue Thu 9am-10:30am, Beyster Building\nEECS 482 Mon Wed 3pm-4:30pm, Beyster Building
Research Assistant, Ford Robotics Building. Tue and Thu 1pm to 5pm\nBarista, coffee shop in Kerrytown. Saturdays 9am-2pm`;
const p0 = readProfile(resume, { places, personas: [] });
const profile = { ...p0, allEntries: p0.entries, off: new Set(), reqs: [] };
const saved = ['h3', 'h2'];
const context = buildContext({ profile, places, savedHomes: saved.map((id) => api.data.homeById.get(id)), tours: [] });

const has = (acts, type, pred = () => true) => acts.some((a) => a.type === type && pred(a));
const req = (field, extra = () => true) => (acts) => has(acts, 'require', (a) => (field instanceof RegExp ? field.test(a.field) : a.field === field) && extra(a));
const CASES = [
  ['i want to live close to hadley athletic center. keep this in mind when filtering options', req(/^(walk|trip)_min_to:ccrb$/)],
  ['need in unit laundry and a dishwasher pls', (a) => req('laundry_free')(a) && req('dishwasher')(a)],
  ['i have a cat named mochi, she comes with me', (a) => req(/^pets(_allowed)?$/)(a)],
  ['budget is like 900 max, utilities included', (a) => has(a, 'set_budget', (x) => Number(x.amount) === 900) || req('rent', (x) => /900/.test(x.value))(a)],
  ["can't do basements, i get claustrophobic", req('basement_room')],
  ['looking for an 8 month lease since i go home for summer', req('lease_months', (x) => /8/.test(x.value))],
  ['i need to move in by aug 20 for band camp', req('move_in', (x) => /2027-08-20/.test(x.value))],
  ["i'd rather be within a 10 minute walk of the ugli", req('walk_min_to:ugli', (x) => /10/.test(x.value))],
  ['add my club meeting thursday 2-3 at the union', (a) => has(a, 'add_event', (x) => (x.days || []).includes('thu') && x.start === '14:00' && x.place === 'union')],
  ['i have soccer practice tues and thurs 7 to 9 pm at the IM building', (a) => has(a, 'add_event', (x) => x.start === '19:00' && x.place === 'imsb')],
  ['drop eecs 482, i switched sections', (a) => has(a, 'remove_event')],
  ['my eecs 370 actually starts at 11am now, same length', (a) => has(a, 'change_event', (x) => x.start === '11:00')],
  ['i bike everywhere', (a) => has(a, 'set_bike', (x) => /yes|true/i.test(String(x.value)))],
  ["i'm not comfortable walking home late alone", (a) => has(a, 'set_late_walk', (x) => /short/i.test(String(x.value)))],
  ['book a tour of broadway on monday at 2pm', (a) => has(a, 'schedule_tour', (x) => x.home === 'h3' && x.start === '14:00')],
  ['parking is a must, i drive to my internship in canton', req('parking_spots', (x) => />=?|>/.test(x.op))],
  ["quiet street please, i'm a light sleeper", req('quiet_street')],
  ['want a big room, at least 160 sq ft, with lots of sunlight', (a) => req('max_room_sqft', (x) => /160/.test(x.value))(a) && req('bright_room')(a)],
  ['furnished would be nice', req('furnished')],
  ['central air is a must, summers are brutal', req(/^(central_air|air_conditioning)$/)],
  ['no more than 20 minutes to class by bus', req(/^trip_min_to:/, (x) => /20/.test(x.value))],
  ['somewhere near kerrytown would be cool, i love the farmers market', req(/^(walk|trip)_min_to:kerrytown$/)],
  ['need a place with a yard for my dog', (a) => req('outdoor_space')(a) && req(/^pets(_allowed)?$/)(a)],
  ['internet included pls', req('internet_included')],
  ['anything built after 2000', req('built_year', (x) => /2000/.test(x.value))],
  ['I want an apartment, not a house', req('kind', (x) => /apartment/i.test(x.value) || (x.op === '!=' && /house/i.test(x.value)))],
  ['budget 1100, close to north campus, and i need a dishwasher', (a) => has(a, 'set_budget') && req(/min_to:(pierpont|beyster|eecs|dude|ggbrown|fmcrb)/)(a) && req('dishwasher')(a)],
  ["i'm vegan", (a) => a.length === 0],
  ['asdf', (a) => a.length === 0],
  ['what is the weather tomorrow', (a) => a.length === 0],
];

const st = await assistantStatus();
if (!st.ok) { console.log('Ollama is not reachable at http://localhost:11434, or has no model. Start it and pull a model first.'); process.exit(1); }
const model = process.argv[2] || st.model;
console.log(`Model: ${model}. ${CASES.length} requests.\n`);
let pass = 0, valid = 0, ms = 0;
for (const [text, expect] of CASES) {
  const t0 = Date.now();
  let out;
  try { out = await interpret({ text, model, context }); } catch (e) { console.log(`ERROR  ${text}\n       ${e.message}\n`); continue; }
  const dt = Date.now() - t0; ms += dt;
  const { edits, notes } = checkActions(out.actions, { profile, api, placeIds: new Set(places.map((p) => p.id)), savedIds: new Set(saved) });
  const ok = expect(out.actions);
  const allValid = notes.length === 0;
  pass += ok ? 1 : 0; valid += allValid ? 1 : 0;
  console.log(`${ok ? 'PASS' : 'MISS'}  ${allValid ? '' : '(some skipped) '}${text}   [${(dt / 1000).toFixed(1)} s]`);
  console.log(`       reply: ${out.reply}`);
  for (const a of out.actions) console.log(`       ${JSON.stringify(a)}`);
  for (const n of notes) console.log(`       skipped: ${n}`);
  console.log(`       kept ${edits.length} of ${out.actions.length}\n`);
}
// Follow-ups: a short answer to the assistant's own question, with the conversation so far.
const FOLLOW = [
  [['what should my budget be set to?'], '2000', (a) => has(a, 'set_budget', (x) => Number(x.amount) === 2000)],
  [['add a club meeting on thursday'], '2 to 3 at the union', (a) => has(a, 'add_event', (x) => x.start === '14:00')],
];
for (const [before, answer, expect] of FOLLOW) {
  const history = [];
  for (const b of before) { const o = await interpret({ text: b, model, context, history }); history.push({ user: b, reply: o.reply, actions: o.actions }); }
  const o = await interpret({ text: answer, model, context, history });
  const ok = expect(o.actions);
  pass += ok ? 1 : 0;
  console.log(`${ok ? 'PASS' : 'MISS'}  follow-up: "${before.join(' / ')}" -> asked "${history.at(-1).reply}" -> "${answer}"`);
  for (const a of o.actions) console.log(`       ${JSON.stringify(a)}`);
}
console.log(`Understood as expected: ${pass} of ${CASES.length + FOLLOW.length}. Every proposed change valid: ${valid} of ${CASES.length}. Average ${(ms / CASES.length / 1000).toFixed(1)} s.`);
