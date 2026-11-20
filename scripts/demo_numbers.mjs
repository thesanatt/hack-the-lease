// Every number the demo script (docs/DEMO.md) and the Q&A sheet (docs/QA.md) quote, recomputed from the engine.
//   node scripts/demo_numbers.mjs            (from the repo root, Node 22, no network, about 3 s)
// It repeats what the app does on screen, with the same seeds, so the numbers here match the browser:
//   Me view       web/src/views/MeView.jsx (posterior seed 7, scenario seed 11, draws seed 3, auto-answer seeds 1000+k)
//   Group view    web/src/views/GroupView.jsx + group/logic.js (EF draws seed 11)
//   Operator view web/src/views/OperatorView.jsx (population seed 11, engine operator.js path)
// Homes, rooms and rents are SYNTHETIC. People are FICTIONAL personas. Timetables, streets and places are real.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
import { CONFIG } from '../engine/config.js';
import { rng } from '../engine/rng.js';
import * as model from '../engine/model.js';
import * as week from '../engine/week.js';
import * as prefs from '../engine/prefs.js';
import * as decide from '../engine/decide.js';
import * as fair from '../engine/fair.js';
import * as operator from '../engine/operator.js';
import { editableWeek, modalRoutine, uncertainRoutine, lateEntry, moveToCentral, TERM_CHOICES, autoAnswer } from '../web/src/views/me/routine.js';
import * as G from '../web/src/views/group/logic.js';
import { pickIrregular, canAddHalfBath } from '../web/src/views/operator/logic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'web', 'public', 'data');
const json = (rel) => JSON.parse(readFileSync(path.join(DATA, rel), 'utf8'));
const cfg = CONFIG;

const usd = (x, d = 0) => (x < 0 ? '-' : '') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const m1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const clk = (s) => { const t = Math.round(s / 60); const h = Math.floor(t / 60) % 24, mi = t % 60; return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const H = (t) => console.log(`\n== ${t}`);
const say = (...a) => console.log(' ', ...a);

// ---------- load (same order as web/src/engine/index.js) ----------
const tLoad = performance.now();
const { planner, places } = await loadAll(nodeGetter());
const homesFile = json('homes.json');
const homes = homesFile.homes;
const pf = json('personas.json');
const personas = Array.isArray(pf) ? pf : pf.personas;
for (const h of homes) planner.addPoint(h.id, h.lat, h.lon);
for (const p of places) planner.addPoint(p.id, p.lat, p.lon);
const homeById = new Map(homes.map((h) => [h.id, h]));
const placeById = new Map(places.map((p) => [p.id, p]));
const homeIds = homes.map((h) => h.id);
const nm = (id) => homeById.get(id)?.name || id;
const weekFor = (routine, ids, opts = {}) => week.evaluateWeek(planner, routine, ids, { cfg, dates: cfg.termDates, ...opts });
const optionFor = (home, room, w) => {
  const n = home.rooms?.length || 1;
  return { rent: (room.asking ?? home.rent / n) + (home.utilities || 0) / n, travel: model.travelFeatures(w, cfg), room, homeId: home.id, roomId: room.id };
};
console.log(`Quorum demo numbers. Data: ${homes.length} SYNTHETIC homes, ${personas.length} FICTIONAL personas, ${places.length} real places.`);
console.log(`Loaded timetables, streets and ${homes.length + places.length} points in ${Math.round(performance.now() - tLoad)} ms.`);

// ---------- 0. Pitch slide 1 (same call as web/src/views/pitch/data.js campusExample) ----------
{
  const SLIDE_HOME = 'h23', SLIDE_DAY = 'tue', SLIDE_DATE = '2026-12-01';
  const CAMPUSES = [['ugli', 'Central Campus'], ['beyster', 'North Campus'], ['uh', 'Medical Campus']];
  const TIMES = [[14 * 3600, '2:00 PM'], [23.5 * 3600, '11:30 PM']];
  H(`0. Pitch slide 1: one listing, ${nm(SLIDE_HOME)} (${homeById.get(SLIDE_HOME).area}), minutes home on Tue Dec 1 2026`);
  const cells = [];
  for (const [pid, campus] of CAMPUSES) {
    let walk = null; const bus = [];
    for (const [t] of TIMES) {
      const res = planner.leaveAt(SLIDE_DAY, pid, t, [SLIDE_HOME])?.get(SLIDE_HOME);
      if (walk == null && res?.walk) walk = Math.round(res.walk.sec / 60);
      bus.push(res?.transit ? Math.round((res.transit.arrive - t) / 60) : null);
    }
    cells.push(walk, ...bus);
    say(`${campus.padEnd(15)} (${placeById.get(pid)?.label}): walk ${walk ?? 'no route'} min, bus leaving ${TIMES[0][1]} ${bus[0] ?? 'no bus'} min, bus leaving ${TIMES[1][1]} ${bus[1] ?? 'no bus'} min`);
  }
  const fin = cells.filter(Number.isFinite);
  say(`range on the slide: ${Math.min(...fin)} to ${Math.max(...fin)} min. Civil dusk that day ${clk(week.dusk(SLIDE_DATE, cfg))}.`);
}

// ---------- Jordan ----------
const jordan = personas.find((p) => p.id === 'jordan');
const entries = editableWeek(jordan);
const lab = lateEntry(entries, placeById);
const modal = modalRoutine(entries, jordan.modes);

const t0 = performance.now();
const weekMap = weekFor(modal, homeIds);
const weekMs = performance.now() - t0;

// ---------- 1. "10 minutes from what?" ----------
H('1. "10 minutes from what?" Jordan\'s late lab, Tue 11:30 PM, Duderstadt Center to home');
say(`Jordan: ${jordan.program}. Late walking cap ${jordan.modes.maxLateWalkMin} min after ${jordan.modes.lateHour}, day cap ${jordan.modes.maxWalkMin} min, no bike.`);
say(`Lab entry: ${lab.label} at ${placeById.get(lab.place).label}, ${lab.days.join('/')} ${lab.start} to ${lab.end}, chance ${lab.p}.`);
const lateTrip = (id) => weekMap.get(id).trips.find((t) => t.day === 'tue' && t.place === lab.place && t.kind === 'leaveAt');
const amTrip = (id) => weekMap.get(id).trips.find((t) => t.day === 'mon' && t.kind === 'arriveBy');
const PAIR = ['h3', 'h5', 'h4'];
for (const id of PAIR) {
  const t = lateTrip(id), a = amTrip(id);
  const walkOnly = planner.walkSec(lab.place, id) / 60;
  say(`${nm(id)} (${homeById.get(id).area}):`);
  say(`   Mon morning to ${placeById.get(a.place).label}: ${a.mode}, ${Math.round(a.sec / 60)} min`);
  say(`   Tue 11:30 PM home: ${t.mode}, ${Math.round(t.sec / 60)} min door to door, ${m1(t.walkMin)} min walking (longest stretch ${m1(t.longestWalkMin)}), ${m1(t.waitMin)} wait, ${m1(t.rideMin)} on the bus, routes ${(t.routes || []).join(', ') || 'none'}`);
  say(`   over Jordan's ${jordan.modes.maxLateWalkMin} min late walking cap: ${t.stranded ? 'YES (counted as "No ride")' : 'no'}. Walking the whole way: ${Math.round(walkOnly)} min. Dark minutes on this trip (lease average): ${Math.round(t.darkMin || 0)}`);
  const j = planner.legs('tue', lab.place, id, week.parseHM(lab.end));
  if (j) say(`   legs: ${j.legs.map((l) => (l.type === 'ride' ? `bus ${l.route} ${clk(l.dep)} ${l.fromName} to ${l.toName}` : `${l.type} ${Math.round(l.sec / 60)}m`)).join(' | ')}`);
  say(`   week from here: ${Math.round(weekMap.get(id).weeklyMin)} min door to door, ${weekMap.get(id).stranded.length} trips with no allowed ride`);
}
say(`Jordan's week over all ${homes.length} homes (first run, cold scan cache): ${Math.round(weekMs)} ms`);
const t0b = performance.now(); weekFor(modal, homeIds); say(`Same week again (warm cache): ${Math.round(performance.now() - t0b)} ms`);

// ---------- 2. Me mode ----------
function rankNow(post, effEntries, dates = cfg.termDates) {
  const ts = performance.now();
  const scen = week.sampleWeeks(uncertainRoutine(effEntries, jordan.modes), cfg.scenarios, 11);
  const weeksByScenario = scen.map((s) => weekFor(s, homeIds, { dates }));
  const tw = performance.now();
  const thetas = prefs.draws(post, cfg.posteriorDraws, 3);
  const rank = decide.meRank({ homes, weeksByScenario, thetas, cfg });
  const ev = decide.evpi(rank.tensor).evpi;
  // Same point estimate as MeView: every weight at its posterior MEDIAN (what "What the picks say" shows).
  const sm = prefs.summary(post, cfg);
  const mean = Object.fromEntries(Object.entries(sm).map(([k, x]) => [k, x.median]));
  const [a, b] = rank;
  const arg = (r) => ({ home: homeById.get(r.homeId), weeks: weeksByScenario.map((m) => m.get(r.homeId)) });
  const be = ['vTime', 'vDark'].map((param) => ({ ...decide.breakEven(arg(a), arg(b), param, mean, cfg), A: a.homeId, B: b.homeId }));
  return { rank, ev, be, mean, scenMs: tw - ts, rankMs: performance.now() - tw, nScen: scen.length, nDraws: thetas.length };
}
function printRank(r, k = 3, baseline = null) {
  r.rank.slice(0, k).forEach((row, i) => {
    const was = baseline ? baseline.findIndex((x) => x.homeId === row.homeId) : -1;
    say(`#${i + 1} ${nm(row.homeId)}, ${row.roomLabel} ${usd(row.price)}/mo: expected regret ${usd(row.expRegret)}/mo, P(best) ${pct(row.pBest)}, all-in ${usd(-row.meanU)} (${usd(-row.hi)} to ${usd(-row.lo)})${baseline ? `  [before: #${was + 1}]` : ''}`);
  });
  if (r.rank.leadersDiffer) say(`note: most often best is ${nm(r.rank.pBestLeader)}, but lowest expected regret is ${nm(r.rank.regretLeader)}`);
  say(`Value of knowing the schedule (EVPI over ${r.nScen} weeks): ${usd(r.ev)}/mo (${r.ev.toFixed(2)})`);
  for (const b of r.be) {
    const n2 = (k2) => nm(k2 === 'A' ? b.A : b.B);
    const what = b.param === 'vTime' ? 'time is worth' : 'an hour walking after dark costs';
    if (b.value == null) say(`Break-even ${b.param}: none between the top two (${b.reason}); ${n2(b.alwaysWins)} wins at every value`);
    else if (b.value > 300) say(`Break-even ${b.param}: ${n2(b.belowWins)} stays ahead unless ${what} more than $300/h (computed ${usd(b.value)}); current ${usd(b.current, 1)}/h`);
    else say(`Break-even ${b.param}: ${n2(b.aboveWins)} wins if ${what} more than ${usd(b.value)}/h; below that ${n2(b.belowWins)}. Current estimate ${usd(b.current, 1)}/h`);
  }
  say(`compute: ${r.nScen} weeks x ${homes.length} homes in ${Math.round(r.scenMs)} ms, ranking with ${r.nDraws} preference draws in ${Math.round(r.rankMs)} ms`);
}

H('2a. Me mode, Jordan, before any pick (posterior = prior)');
let post = prefs.createPosterior({ seed: 7, cfg });
const S0 = prefs.summary(post, cfg);
for (const k of model.PARAMS) say(`prior ${k}: median ${usd(S0[k].median, 1)}, 80% ${usd(S0[k].lo, 1)} to ${usd(S0[k].hi, 1)}`);
const r0 = rankNow(post, entries);
printRank(r0);

H('2b. Me mode after "Auto-answer until done" (persona demo values, the same seeded draws as the app)');
const homeOptions = homes.map((h) => ({ id: h.id, options: h.rooms.map((r) => optionFor(h, r, weekMap.get(h.id))) }));
let nAuto = 0;
for (let k = 0; k < cfg.picksMax; k++) {
  const c = prefs.buildCandidates(post, homeOptions);
  const p = prefs.nextPair(post, c, { cfg });
  const tp = Math.max(...prefs.pBestHomes(post, homeOptions).map((x) => x.pBest));
  const st = prefs.shouldStop(post, post.nPicks, tp, p?.ig ?? null, cfg);
  if (st.stop || !p) { say(`stop rule: ${st.text}`); break; }
  const A = c.options[p.i], B = c.options[p.j];
  const u = rng(1000 + post.picks.length)();
  const { choice, pA } = autoAnswer(model.utility(jordan.theta, A), model.utility(jordan.theta, B), cfg.tau, u);
  prefs.update(post, A, B, choice, cfg);
  nAuto++;
  say(`pick ${nAuto}: A ${nm(A.homeId)} ${A.room.label} vs B ${nm(B.homeId)} ${B.room.label}, IG ${p.ig.toFixed(3)} nats -> ${choice} (P(A) ${Math.round(pA * 100)}%)`);
  // What the pick card shows for each side (PickCard.jsx Option), so a presenter can answer it by hand.
  for (const [tag, o] of [['A', A], ['B', B]]) {
    const w = weekMap.get(o.homeId), r = o.room;
    const dk = w.darkWalkMin + cfg.darkBikeFactor * (w.darkBikeMin || 0) + (w.darkLongWaitMin || 0);
    say(`   ${tag}: ${homeById.get(o.homeId).area}, ${r.label} ${r.sqft} sq ft, ${r.bath} bath, light ${r.light}; rent with utilities ${usd(o.rent)}/mo; door to door ${Math.round(w.weeklyMin)} min/wk; walking or waiting ${Math.round((w.walkMin || 0) + (w.waitMin || 0))} min/wk; after dark ${Math.round(dk)} min/wk; no ride ${w.stranded.length}/wk`);
  }
}
{
  const c = prefs.buildCandidates(post, homeOptions);
  const p = prefs.nextPair(post, c, { cfg });
  const tp = Math.max(...prefs.pBestHomes(post, homeOptions).map((x) => x.pBest));
  say(`after ${post.nPicks} picks: ${prefs.shouldStop(post, post.nPicks, tp, p?.ig ?? null, cfg).text}`);
}
const S = prefs.summary(post, cfg);
for (const k of model.PARAMS) say(`learned ${k}: median ${usd(S[k].median, 1)}, 80% ${usd(S[k].lo, 1)} to ${usd(S[k].hi, 1)}${S[k].mostlyPrior ? '  (mostly prior)' : ''}   [demo truth ${jordan.theta[k]}]`);
const r1 = rankNow(post, entries);
printRank(r1);
const tb = prefs.pBestHomes(post, homeOptions).reduce((a, b) => (b.pBest > a.pBest ? b : a));
say(`stop-rule pill now reads: "${nm(tb.id)} is best on your most likely week (${tb.pBest.toFixed(2)}). Across all ${r1.nScen} possible weeks: ${Math.round(100 * r1.rank[0].pBest)}%." (${pct(r1.rank[0].pBest)} of ${r1.nScen} weeks x ${r1.nDraws} value draws)`);
say(`(break-even uses every weight at its posterior median, as the app does; the posterior mean of vTime would be ${usd(prefs.posteriorMean(post).vTime, 1)}/h)`);
say(`what the picks changed: leader room ${r0.rank[0].roomLabel} -> ${r1.rank[0].roomLabel}; regret ${usd(r0.rank[0].expRegret)} -> ${usd(r1.rank[0].expRegret)}; P(best) ${pct(r0.rank[0].pBest)} -> ${pct(r1.rank[0].pBest)}; vTime 80% ${usd(S0.vTime.lo, 1)}-${usd(S0.vTime.hi, 1)} -> ${usd(S.vTime.lo, 1)}-${usd(S.vTime.hi, 1)}; vStrand median ${usd(S0.vStrand.median, 1)} -> ${usd(S.vStrand.median, 1)}; value of knowing ${usd(r0.ev)} -> ${usd(r1.ev)}`);

// ---------- 2c. Baseline: a plain listing filter ----------
H('2c. Baseline: a listing filter "cheapest home in North Campus", ranked by Quorum for Jordan');
{
  const priceFrom = (h) => Math.min(...h.rooms.map((r) => (r.asking ?? h.rent / h.rooms.length) + (h.utilities || 0) / h.rooms.length));
  const north = homes.filter((h) => h.area === 'North Campus').sort((x, y) => priceFrom(x) - priceFrom(y));
  say(`North Campus homes by "From /mo" (cheapest room, asking rent plus an equal share of utilities): ${north.map((h) => `${h.name} ${usd(priceFrom(h))}`).join('; ')}`);
  const pick = north[0];
  for (const [lbl, r] of [['before any pick', r0], ['after the picks', r1]]) {
    const i = r.rank.findIndex((x) => x.homeId === pick.id), row = r.rank[i], lead = r.rank[0];
    say(`${lbl}: the filter picks ${pick.name}, which Quorum ranks #${i + 1} of ${r.rank.length}: expected regret ${usd(row.expRegret)}/mo vs ${usd(lead.expRegret)} for #1 ${nm(lead.homeId)}, ${usd(row.expRegret - lead.expRegret)}/mo worse; P(best) ${pct(row.pBest)}; all-in ${usd(-row.meanU)} vs ${usd(-lead.meanU)}`);
  }
}

// ---------- 3. Sensitivity ----------
H(`3a. Sensitivity: "Move ${lab.label.toLowerCase()} to Central" (same picks)`);
const moved = moveToCentral(entries, lab.id, placeById);
say(`lab moves from ${placeById.get(lab.place).label} to ${placeById.get(moved.find((e) => e.id === lab.id).place).label}`);
const r2 = rankNow(post, moved);
printRank(r2, 3, r1.rank);
{
  const iB = r2.rank.findIndex((x) => x.homeId === r1.rank[0].homeId);
  const t3 = r2.rank.slice(0, 3).map((x) => x.expRegret);
  say(`old leader ${nm(r1.rank[0].homeId)} falls from #1 to #${iB + 1} (expected regret ${usd(r2.rank[iB].expRegret)}/mo, P(best) ${pct(r2.rank[iB].pBest)})`);
  say(`top three spread ${usd(Math.max(...t3) - Math.min(...t3))}/mo (${t3.map((x) => usd(x)).join(', ')}); leader P(best) ${pct(r2.rank[0].pBest)}`);
}

for (const term of ['sep', 'dec']) {
  H(`3b. Sensitivity: Daylight "${TERM_CHOICES[term].label}" instead of "Whole lease (6 dates)" (lab back on North)`);
  const r3 = rankNow(post, entries, TERM_CHOICES[term].dates);
  printRank(r3, 3, r1.rank);
  const w = weekFor(modal, [r1.rank[0].homeId, r1.rank[1].homeId], { dates: TERM_CHOICES[term].dates });
  for (const id of [r1.rank[0].homeId, r1.rank[1].homeId]) {
    const x = w.get(id);
    say(`   ${nm(id)}: ${Math.round(x.darkWalkMin + cfg.darkBikeFactor * (x.darkBikeMin || 0) + (x.darkLongWaitMin || 0))} dark min/wk this month vs ${Math.round(weekMap.get(id).darkWalkMin + cfg.darkBikeFactor * (weekMap.get(id).darkBikeMin || 0) + (weekMap.get(id).darkLongWaitMin || 0))} lease average`);
  }
}
say(`civil dusk Ann Arbor: Sep 15 ${clk(week.dusk('2026-09-15', cfg))}, Dec 1 ${clk(week.dusk('2026-12-01', cfg))}`);

// ---------- 4. Group ----------
H('4. Group: five FICTIONAL members, whole-house leases');
const members = G.pickGroup(personas).filter((m) => m.theta);
const houses = G.candidateHouses(homes, members.length);
const tg = performance.now();
const byMember = new Map(members.map((m) => [m.id, weekFor(G.modalRoutine(m), houses.map((h) => h.id))]));
const groupWeeksMs = performance.now() - tg;
const sampleThetas = G.drawSampleThetas(members, rng(11), { k: cfg.efSamples ?? 100, spread: 0.25 });
const solve = (caps) => G.solveAllHouses({ fair, houses, members, weekByMember: byMember, model, cfg, caps, sampleThetas });
const s0 = solve({});
say(`members: ${members.map((m) => `${m.name} (cap ${usd(m.cap)})`).join(', ')}`);
say(`${houses.length} candidate houses; weeks ${Math.round(groupWeeksMs)} ms; all houses solved in ${Math.round(s0.totalMs)} ms; members' own top houses differ: ${s0.disagree}`);
s0.rows.slice(0, 4).forEach((r, k) => say(`#${k + 1} ${r.home.name} ${usd(r.home.rent)}: ${r.feasible ? 'feasible' : 'infeasible'}, worst-off net cost ${usd(-r.E)}/mo, group net ${usd(-r.W)}/mo`));
const top = s0.rows[0];
const printSplit = (row) => {
  members.forEach((m, i) => {
    const j = row.res.assignment[i];
    const net = row.U && Number.isFinite(row.U[i]) ? `, net cost ${usd(-row.U[i])}/mo` : '';
    say(`   ${m.name.padEnd(6)} ${row.home.rooms[j].label.padEnd(16)} ${usd(row.res.prices[j], 2)}   (cap ${usd(row.problem.members[i].cap)}, under cap by ${usd(row.problem.members[i].cap - row.res.prices[j], 2)}${net})`);
  });
  say(`   sum ${usd(row.res.prices.reduce((s, x) => s + x, 0), 2)} = rent ${usd(row.home.rent)}; utilities ${usd(row.home.utilities)} split evenly, ${usd(row.home.utilities / members.length, 2)} each`);
};
say(`Split of ${top.home.name}:`);
printSplit(top);
const off = [];
top.check.envy.forEach((r, i) => r.forEach((e, j) => { if (i !== j) off.push({ e, i, j }); }));
off.sort((a, b) => a.e - b.e);
say(`envy matrix: checker ${top.check.ok ? 'passed' : 'FAILED'}, smallest margin ${usd(off[0].e, 2)} (${members[off[0].i].name} looking at ${members[off[0].j].name}'s room), largest ${usd(off[off.length - 1].e, 2)}`);
say(`   zero margins (ties held by the maximin rule): ${off.filter((x) => x.e < 0.005).length} of ${off.length}`);
{ const ps = top.res.prices; say(`   split range ${usd(Math.min(...ps))} to ${usd(Math.max(...ps))}; net cost = rent share + utilities share + commute time in dollars - the room's value to that person`); }
say(`   envy-free rate over ${top.res.efSamples ?? cfg.efSamples} value draws: ${pct(top.res.efRate)}; widest-margin slack ${Number.isFinite(top.res.robustSlack) ? usd(top.res.robustSlack, 2) : 'n/a'}; distinct favorite rooms ${new Set(top.problem.members.map((x) => G.favoriteRoom(x.values))).size}`);
say('   rows (who looks), columns (whose room), dollars per month:');
say('          ' + members.map((m) => m.name.padStart(8)).join(''));
top.check.envy.forEach((r, i) => say('   ' + members[i].name.padEnd(7) + r.map((e) => (e == null ? '       -' : e.toFixed(0).padStart(8))).join('')));

// cap move, exactly as the "Lower the cap" button does it
const tightest = (() => {
  const r = s0.rows.find((x) => x.feasible) || top;
  let best = members[0].id, bestSlack = Infinity;
  members.forEach((m, i) => { const sl = m.cap - r.res.prices[r.res.assignment[i]]; if (sl < bestSlack) { bestSlack = sl; best = m.id; } });
  return best;
})();
const ci = members.findIndex((m) => m.id === tightest);
const need = G.capThreshold(fair, top.problem, ci, cfg);
const newCap = Math.max(0, Math.floor((need - 1) / 10) * 10 - 20);
H(`4b. "Lower the cap": default member ${members[ci].name} (closest to her cap in ${top.home.name})`);
say(`${members[ci].name}'s lowest cap that keeps ${top.home.name} feasible: ${usd(need, 2)} (her envy-free rent floor there)`);
say(`button sets ${members[ci].name}'s cap ${usd(members[ci].cap)} -> ${usd(newCap)} (a cut of ${usd(members[ci].cap - newCap)})`);
const s1 = solve({ [tightest]: newCap });
const tRow = s1.rows.find((r) => r.home.id === top.home.id);
say(`${top.home.name} now ${tRow.feasible ? 'still feasible' : 'has no envy-free split under every cap'}; top feasible house now ${s1.rows.find((r) => r.feasible)?.home.name || 'none'}`);
const gap = fair.privateGap(tRow.problem, ci, { cfg, compensateCommute: !!cfg.compensateCommute });
say(`${members[ci].name}'s private view on ${top.home.name}: cap would need to rise by ${usd(gap)} (${gap.toFixed(2)})`);
say(`Shown for ${top.home.name} after the cut (smallest worst overrun, not envy-free under every cap):`); printSplit(tRow);
const nf = s1.rows.find((r) => r.feasible);
if (nf) {
  say(`Split of ${nf.home.name} with the lower cap (the split panel moves here by itself):`); printSplit(nf);
  const o2 = []; nf.check.envy.forEach((r, i) => r.forEach((e, j) => { if (i !== j) o2.push(e); }));
  say(`   checker ${nf.check.ok ? 'passed' : 'FAILED'}; zero margins ${o2.filter((e) => e < 0.005).length} of ${o2.length}; envy-free rate over value draws ${pct(nf.res.efRate)}; worst-off net cost ${usd(-nf.E)}/mo (was ${usd(-top.E)} in ${top.home.name})`);
  say(`   feasible houses after the cut, best first: ${s1.rows.filter((r) => r.feasible).map((r) => `${r.home.name} worst-off ${usd(-r.E)}`).join('; ')}`);
}
for (const cut of [10, 25, 50]) {
  const s = solve({ [tightest]: members[ci].cap - cut });
  say(`check: cap cut by exactly ${usd(cut)} -> ${top.home.name} ${s.rows.find((r) => r.home.id === top.home.id).feasible ? 'feasible' : 'infeasible'}; top feasible ${s.rows.find((r) => r.feasible)?.home.name}`);
}

// ---------- 5. Operator ----------
H('5. Operator: one irregular house, SYNTHETIC population');
const opData = json('operator.json');
const home = pickIrregular(homes, opData?.houseId || opData?.featured || null);
const population = operator.makePopulation({ n: cfg.population, seed: 11, cfg });
const renoChoices = home.rooms.map((r, j) => ({ r, j })).filter(({ r }) => canAddHalfBath(r));
const reno = renoChoices.find(({ r }) => r.floor === 'basement') || renoChoices[0];
const wBath = model.PARAM_INFO.wBath.prior.median, wSize = model.PARAM_INFO.wSize.prior.median;
const to = performance.now();
const groups = operator.groupsFor({ home, population, cfg, count: cfg.operatorGroups });
const op = operator.roomPricing({ home, groups, renovation: reno ? { roomId: home.rooms[reno.j].id, bath: 'half' } : null, cfg, medians: { wBath, wSize }, prior: population.prior });
const opMs = performance.now() - to;
say(`${home.name} (${home.area}), house rent ${usd(home.rent)}, ${home.rooms.length} rooms, ${op.groups} synthetic groups from a population of ${cfg.population} (seed 11), ${Math.round(opMs)} ms incl. the renovation re-solve`);
say(`prior medians: private bath ${usd(wBath)}/mo, size ${usd(wSize, 1)}/mo per 10 sq ft, light ${usd(model.PARAM_INFO.wLight.prior.median)}/mo per level`);
home.rooms.forEach((rm, j) => { const r = op.rooms[j]; say(`   ${rm.label.padEnd(16)} ${String(rm.sqft).padStart(3)} sq ft ${rm.bath.padEnd(7)} floor ${String(rm.floor).padEnd(8)} light ${rm.light}: p10 ${usd(r.p10)} p50 ${usd(r.p50)} p90 ${usd(r.p90)}  asking ${usd(rm.asking)}`); });
{
  const gaps = home.rooms.map((rm, j) => ({ label: rm.label, asking: rm.asking, fair: op.rooms[j].p50, gap: rm.asking - op.rooms[j].p50 }));
  say(`asking minus fair (p50): ${gaps.map((g) => `${g.label} ${g.gap >= 0 ? '+' : ''}${usd(g.gap)}`).join('; ')}`);
  const lo = gaps.reduce((a, b) => (b.gap < a.gap ? b : a)), hi = gaps.reduce((a, b) => (b.gap > a.gap ? b : a));
  say(`most underpriced: ${lo.label} asking ${usd(lo.asking)} vs fair ${usd(lo.fair)} (${usd(-lo.gap)} under); most overpriced: ${hi.label} asking ${usd(hi.asking)} vs fair ${usd(hi.fair)} (${usd(hi.gap)} over); asking rents sum to ${usd(gaps.reduce((t, g) => t + g.asking, 0))}`);
}
if (op.renovationDelta) {
  say(`half bath added to ${home.rooms[reno.j].label}: its p50 fair share ${op.renovationDelta.roomP50 >= 0 ? '+' : ''}${usd(op.renovationDelta.roomP50)}/mo at the same house rent; median group headroom ${op.renovationDelta.headroom >= 0 ? '+' : ''}${usd(op.renovationDelta.headroom)}/mo`);
}

if (reno) {
  // The half bath counts as half of a private bath (engine/model.js), so its value follows the assumed bath median.
  for (const wb of [30, 120]) {
    const o = operator.roomPricing({ home, groups, renovation: { roomId: home.rooms[reno.j].id, bath: 'half' }, cfg, medians: { wBath: wb, wSize }, prior: population.prior });
    say(`   with the private bathroom slider at ${usd(wb)}/mo: half bath ${o.renovationDelta.roomP50 >= 0 ? '+' : ''}${usd(o.renovationDelta.roomP50)}/mo room share, ${o.renovationDelta.headroom >= 0 ? '+' : ''}${usd(o.renovationDelta.headroom)}/mo headroom`);
  }
  say(`   +${usd(op.renovationDelta.headroom)}/mo headroom is ${usd(12 * op.renovationDelta.headroom)} a year. No build cost is in the data, so no payback is computed.`);
}

// ---------- 6. Evidence files ----------
H('6. Validation numbers, read from web/public/data/evidence/');
const ev = (f) => json(`evidence/${f}`);
const R2 = ev('router.json'), R6 = ev('r5.json'), LP = ev('lp.json'), RC = ev('recovery.json');
say(`R2 reference router (${R2.service_date}, ${R2.day}): ${R2.equal} of ${R2.queries} stop-to-stop queries equal, ${R2.all_targets.equal.toLocaleString('en-US')} of ${R2.all_targets.stop_comparisons.toLocaleString('en-US')} stop arrivals equal`);
say(`R6 r5py ${R6.r5py_version}: ${R6.result.pairs} place-to-home pairs, ${R6.result.both_reachable} reachable in both, median abs diff ${R6.result.median_abs_error_min.toFixed(1)} min, within 2 min ${pct(R6.result.share_within_2_min)}, p90 ${R6.result.p90_abs_error_min} min, mean signed (Quorum minus R5) ${R6.result.mean_signed_error_min_quorum_minus_r5} min`);
say(`LP: F1 ${LP.F1.envyFree} of ${LP.F1.instances} random instances envy-free and checker-ok, F2 closed form ${LP.F2.closedForm.match}/${LP.F2.closedForm.instances}, F4 to F6 published examples pass: ${LP.F4.pass && LP.F5.pass && LP.F6.pass}`);
say(`Recovery: ${RC.trials} SYNTHETIC trials x ${RC.picks} picks. ${RC.headline.text}`);
say(`   answers are simulated from the same logit choice model the posterior assumes (${RC.setup.answers})`);
for (const off of [false, true]) {
  const x = RC.results.find((r) => r.policy === 'bald' && r.tauScale === 1 && r.offPrior === off);
  if (x) say(`   ${off ? 'off-prior' : 'prior'} set, BALD, tau x1, 80% interval coverage after ${RC.picks} picks: ${model.PARAMS.map((k) => `${k} ${pct(x.coverage[k])}`).join(', ')}`);
}
say(`R6 detail: ${R6.result.pairs - R6.result.both_reachable} of ${R6.result.pairs} trips not reachable in both routers (only in Quorum: ${R6.result.reachable_only_in_quorum ?? 'n/a'})`);
console.log('\nDone.');
