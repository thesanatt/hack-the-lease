// Preference recovery test (docs/SYSTEM_DESIGN.md section 5.3). Writes web/public/data/evidence/recovery.json.
//
//   node scripts/recovery.mjs                 SYNTHETIC option sets (no week.js or homes.json needed)
//   node scripts/recovery.mjs --real          one persona's real weeks on the real timetables (needs week.js,
//                                             homes.json, personas.json); falls back to synthetic if missing
//   options: --trials 300 --picks 6 --seed 1 --n 4000 --subsample 1000 --persona jordan --out <path> --quick
//            --homes <file> --personas <file> (with --real: read these instead of web/public/data)
//
// Policies bald, random, fixed; answer noise tau x 0.5, 1, 2; truths from the prior and from an off-prior
// stress set. Simulated students and their answers are SYNTHETIC.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../engine/config.js';
import { PARAMS, travelFeatures } from '../engine/model.js';
import { recoveryTest, BALD_SUBSAMPLE } from '../engine/prefs.js';
import { rng } from '../engine/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };

const quick = flag('quick');
const trials = Number(opt('trials', quick ? 30 : 300));
const picks = Number(opt('picks', CONFIG.picksMax));
const seed = Number(opt('seed', 1));
const n = Number(opt('n', CONFIG.particles));
const subsample = Number(opt('subsample', BALD_SUBSAMPLE));
const out = opt('out', path.join(ROOT, 'web', 'public', 'data', 'evidence', 'recovery.json'));
const cfg = CONFIG;

async function realWorld(personaId) {
  const { loadAll } = await import('../engine/load.js');
  const { nodeGetter } = await import('../engine/node-load.js');
  const week = await import('../engine/week.js');
  const get = nodeGetter();
  const { readFile } = await import('node:fs/promises');
  const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
  // --homes and --personas override the data files (for testing the --real path before they exist)
  const homesFile = opt('homes') ? await readJson(opt('homes')) : await get('homes.json');
  const personasFile = opt('personas') ? await readJson(opt('personas')) : await get('personas.json');
  const homes = homesFile.homes ?? homesFile;
  const personas = personasFile.personas ?? personasFile;
  const persona = personas.find((p) => p.id === personaId) ?? personas[0];
  const { planner, places } = await loadAll(get);
  for (const h of homes) planner.addPoint(h.id, h.lat, h.lon);
  const homeIds = homes.map((h) => h.id);
  const routine = { id: persona.id, week: persona.week, modes: persona.modes };
  // Modal week: entries with p >= 0.5, each at its written place (no alt).
  const modal = {
    id: `${persona.id}:modal`, modes: persona.modes,
    week: persona.week.filter((e) => (e.p ?? 1) >= 0.5).map(({ p, alt, ...e }) => e),
  };
  const t0 = performance.now();
  const w0 = week.evaluateWeek(planner, modal, homeIds, { cfg, places });
  const scen = week.sampleWeeks(routine, cfg.scenarios, seed);
  const ws = scen.map((rt) => week.evaluateWeek(planner, rt, homeIds, { cfg, places }));
  const weekMs = performance.now() - t0;
  const meanTravel = (id) => {
    const t = { hoursPerMonth: 0, darkHoursPerMonth: 0, strandedPerMonth: 0 };
    for (const m of ws) { const f = travelFeatures(m.get(id), cfg); for (const k in t) t[k] += f[k] / ws.length; }
    return t;
  };
  const W = {
    label: `Real weeks for persona ${persona.id} (FICTIONAL persona, SYNTHETIC homes) on the real timetables`,
    homes: homes.map((h) => {
      const nR = h.rooms.length || 1;
      const mk = (travel) => h.rooms.map((room) => ({
        id: room.id, homeId: h.id, roomId: room.id, rent: room.asking + (h.utilities ?? 0) / nR, travel, room,
      }));
      return { id: h.id, s0: mk(travelFeatures(w0.get(h.id), cfg)), mean: mk(meanTravel(h.id)) };
    }),
  };
  return { world: W, persona: persona.id, weekMs, scenarios: scen.length };
}

function pairedDiff(a, b, pick, seedB) {
  // mean over trials of regret(a) - regret(b) at one pick, with a percentile bootstrap 95% interval
  const d = a.trialRegrets.map((r, t) => r[pick] - b.trialRegrets[t][pick]);
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  const r = rng(seedB);
  const boots = [];
  for (let k = 0; k < 2000; k++) {
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[r.int(d.length)];
    boots.push(s / d.length);
  }
  boots.sort((x, y) => x - y);
  return { mean, lo: boots[Math.floor(0.025 * boots.length)], hi: boots[Math.floor(0.975 * boots.length)] };
}

function auc(res) {
  // per-trial mean regret over picks 1..picks
  return { ...res, trialRegrets: res.trialRegrets.map((r) => [r.slice(1).reduce((s, x) => s + x, 0) / (r.length - 1)]) };
}

const started = performance.now();
let world = null, source = 'synthetic', realInfo = null;
if (flag('real')) {
  try {
    realInfo = await realWorld(opt('persona', 'jordan'));
    world = realInfo.world; source = 'real';
    console.log(`real world: ${world.homes.length} homes, persona ${realInfo.persona}, weeks in ${realInfo.weekMs.toFixed(0)} ms`);
  } catch (e) {
    console.log(`--real unavailable (${e.message}); using SYNTHETIC option sets`);
  }
}

const results = [];
const raw = {};
for (const offPrior of [true, false]) {
  for (const tauScale of [0.5, 1, 2]) {
    for (const policy of ['bald', 'random', 'fixed']) {
      const t0 = performance.now();
      const r = recoveryTest({ trials, picks, seed, policy, tauScale, offPrior, world, n, subsample, cfg });
      const ms = performance.now() - t0;
      raw[`${offPrior}|${tauScale}|${policy}`] = r;
      const { trialRegrets, ...keep } = r;
      results.push({ ...keep, ms: Math.round(ms), msPerTrial: +(ms / trials).toFixed(1) });
      console.log(`${offPrior ? 'off-prior' : 'prior    '} tau x${tauScale} ${policy.padEnd(6)} `
        + `regret mean ${r.regretMean.toFixed(1)} p50 ${r.regretP50.toFixed(1)} p90 ${r.regretP90.toFixed(1)} `
        + `top1 ${r.top1.toFixed(2)} cov vTime ${r.coverage.vTime.toFixed(2)} minESS ${r.minESS.toFixed(0)} `
        + `(${(ms / 1000).toFixed(1)} s)`);
    }
  }
}

// BALD vs random and BALD vs fixed: paired regret differences (negative favors BALD).
const comparisons = [];
let k = 0;
for (const offPrior of [true, false]) {
  for (const tauScale of [0.5, 1, 2]) {
    const b = raw[`${offPrior}|${tauScale}|bald`];
    for (const other of ['random', 'fixed']) {
      const o = raw[`${offPrior}|${tauScale}|${other}`];
      const at3 = pairedDiff(b, o, Math.min(3, picks), seed * 11 + k++);
      const atEnd = pairedDiff(b, o, picks, seed * 11 + k++);
      const area = pairedDiff(auc(b), auc(o), 0, seed * 11 + k++);
      comparisons.push({
        set: offPrior ? 'off-prior' : 'prior', tauScale, vs: other,
        regretDiffAt3: at3, regretDiffAtEnd: atEnd, regretDiffMeanOverPicks: area,
        top1Bald: b.top1, top1Other: o.top1,
        verdict: area.hi < 0 ? 'bald lower regret' : area.lo > 0 ? `${other} lower regret` : 'no clear difference',
      });
    }
  }
}

const vsRandom = comparisons.filter((c) => c.vs === 'random');
const wins = vsRandom.filter((c) => c.verdict === 'bald lower regret').length;
const losses = vsRandom.filter((c) => c.verdict === 'random lower regret').length;
const offMain = vsRandom.find((c) => c.set === 'off-prior' && c.tauScale === 1);
const headline = {
  baldBeatsRandom: wins > 0 && losses === 0,
  text: `Off-prior stress set, tau x1: mean regret over picks 1 to ${picks} is `
    + `${Math.abs(offMain.regretDiffMeanOverPicks.mean).toFixed(1)} $/month `
    + `${offMain.regretDiffMeanOverPicks.mean <= 0 ? 'lower' : 'higher'} with BALD than with random pairs `
    + `(95% bootstrap interval ${offMain.regretDiffMeanOverPicks.lo.toFixed(1)} to ${offMain.regretDiffMeanOverPicks.hi.toFixed(1)}). `
    + `Across the 6 settings BALD has clearly lower regret than random in ${wins}, clearly higher in ${losses}, `
    + `and no clear difference in ${6 - wins - losses}.`
    + (wins === 0 ? ' BALD does not beat random on this test.' : ''),
};

const doc = {
  test: 'Preference recovery (section 5.3)',
  label: 'SYNTHETIC students and simulated answers',
  date: new Date().toISOString(),
  seed, trials, picks, particles: n, baldSubsample: subsample,
  source, world: world ? world.label : 'A new SYNTHETIC option set of 30 homes per trial (prefs.syntheticWorld)',
  persona: realInfo?.persona ?? null,
  setup: {
    truths: 'prior: true weights drawn from the prior. off-prior: vTime at 0.3x or 3x the prior median (alternating), '
      + 'vDark at the prior 95th percentile, others from the prior.',
    answers: 'logit at tau x tauScale with the true weights; the posterior always assumes tau = ' + cfg.tau,
    policies: 'bald: max information gain each pick. random: a random pair from the same pool. '
      + 'fixed: the 6 highest-gain pairs under the prior, chosen before any answer.',
    pool: 'every pair of homes (best room under the posterior mean) on the modal week, plus room pairs inside a home',
    decision: 'recommend the room with the highest posterior-mean utility on the mean week; regret against the true best',
    stopRule: `stop at ${cfg.picksMax} picks, or after ${cfg.picksMin} when best IG < ${cfg.stopIG} nats or top P(best) >= ${cfg.stopPBest} (modal week)`,
  },
  headline,
  comparisons,
  results,
  params: PARAMS,
  runtimeSec: +((performance.now() - started) / 1000).toFixed(1),
};

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(doc, (k, v) => (typeof v === "number" && !Number.isInteger(v) ? +v.toPrecision(5) : v), 1));
console.log(`\n${headline.text}`);
console.log(`wrote ${out} in ${doc.runtimeSec} s`);
