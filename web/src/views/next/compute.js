// Next year: what not knowing next year's schedule costs, drawn from a class catalog (docs/NEXT_YEAR.md).
//
//   runNextYear(api, { plan, sections, k = 200, seed = 1, priority = 'normal', odds = {}, settled = {}, onProgress })
//     -> { plan, factors, scenarios, rank, voi, safest, homeById, stats, ms, costs, campus, nAll, persona }
//
// Plain JS (no React, no DOM), so the pitch and node scripts can import it.
// The slow part is routing: every possible week through every home. That runs once per
// (config version, plan, catalog, k, seed, priority, odds) and is cached. Settling an unknown only filters
// the routed weeks and re-ranks, which takes a few tens of milliseconds.
// Identical weeks (the same meetings at the same places and times) are routed once and shared.

// The plan the tab and pitch slide 2 open on. The Nursing junior's clinical section and maybe job change
// which home is best, so the price is easy to see; the CS junior plan comes out under $1 a month.
export const NEXT_DEFAULT_PLAN = 'nursing';

const BASE_MAX = 8;       // routed scenario sets kept
const EVAL_MAX = 40;      // settled results kept
const WEEK_MAX = 4000;    // routed distinct weeks kept

const baseCache = new Map();   // key -> Promise<base>
const evalCache = new Map();   // key -> result
const weekCache = new Map();   // version|modes|week signature -> Map homeId -> WeekResult
const thetaCache = new Map();  // config version -> thetas
const sectionIds = new WeakMap();
let nextSectionId = 1;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const nextTick = () => new Promise((r) => setTimeout(r, 0));

function remember(map, key, value, max) {
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
  return value;
}

// A stable id for a catalog (sections array) by identity, so cache keys stay short.
export function catalogId(sections) {
  if (!sections || typeof sections !== 'object') return 'none';
  if (!sectionIds.has(sections)) sectionIds.set(sections, nextSectionId++);
  return `c${sectionIds.get(sections)}`;
}

// Odds as a stable string: keys sorted, values rounded to 1%.
export function oddsKey(odds = {}) {
  return Object.keys(odds).sort().map((k) => `${k}=${Math.round(Number(odds[k]) * 100)}`).join(',');
}

export function settledKey(settled = {}) {
  return Object.keys(settled).sort().map((k) => `${k}=${settled[k]}`).join(',');
}

export function baseKey(api, { plan, sections, k, seed, priority, odds }) {
  return [api.version ?? 0, catalogId(sections), JSON.stringify(plan), k, seed, priority, oddsKey(odds)].join('|');
}

// What makes two weeks route the same: meetings (days, place, start, end) and the walking limits.
export function weekSignature(week, modes) {
  const rows = (week || []).map((e) => `${(e.days || []).join('')}@${e.place}@${e.start}-${e.end}`).sort();
  return `${JSON.stringify(modes || {})}#${rows.join(';')}`;
}

function thetasFor(api) {
  const v = api.version ?? 0;
  if (thetaCache.has(v)) return thetaCache.get(v);
  const prefs = api.mod('prefs');
  const cfg = api.config;
  // The same values as the You tab before any pick.
  const post = prefs.createPosterior({ seed: 7, cfg });
  return remember(thetaCache, v, prefs.draws(post, cfg.posteriorDraws, 3), 4);
}

async function buildBase(api, opts, onProgress) {
  const cat = api.mod('catalog');
  const { plan, sections, k, seed, priority, odds } = opts;
  const t0 = now();
  const persona = api.data.personas.find((p) => p.id === plan.personaId) || api.data.personas[0] || null;
  const modes = persona?.modes;
  // campus names on the options ("011, North Campus, Tue 4:30 PM")
  const tagged = cat.withAreas ? cat.withAreas(sections, plan, api.data.places) : { sections, plan };
  const drawn = cat.sampleNextYear({ plan: tagged.plan, sections: tagged.sections, k, seed, priority, odds, modes });
  const scenarios = drawn.scenarios || [];
  const tS = now();
  const homeIds = api.data.homes.map((h) => h.id);
  const dates = api.config.termDates;
  const version = api.version ?? 0;
  const weeks = new Array(scenarios.length);
  let routed = 0, last = now();
  onProgress?.(0, `Routing ${scenarios.length} possible weeks`);
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const m = s.modes || modes;
    const key = `${version}|${weekSignature(s.week, m)}`;
    let w = weekCache.get(key);
    if (!w) {
      w = api.weekFor({ ...s, modes: m }, homeIds, { dates });
      if (!w) throw new Error('The week module is not built yet.');
      remember(weekCache, key, w, WEEK_MAX);
      routed++;
    }
    weeks[i] = w;
    if (now() - last > 40) {
      onProgress?.((i + 1) / scenarios.length, `Routing week ${i + 1} of ${scenarios.length}`);
      await nextTick();
      last = now();
    }
  }
  const t1 = now();
  const thetas = thetasFor(api);
  onProgress?.(1, 'Ranking homes');
  await nextTick();
  return {
    plan, persona, scenarios, weeks, thetas,
    factors: drawn.factors || [], stats: drawn.stats || { k: scenarios.length, conflictsUnresolved: 0, missingCourses: [] },
    indexById: new Map(scenarios.map((s, i) => [s.id, i])),
    ms: { sample: tS - t0, route: t1 - tS }, routed,
  };
}

// Per-scenario monthly cost of each home: -Ubar[s][h], Ubar = mean over value draws.
// Returns { homeIds, K, H, cost: Float64Array(K*H) indexed s*H + h }.
export function costMatrix(tensor) {
  const { U, M, K, H } = tensor;
  const cost = new Float64Array(K * H);
  for (let m = 0; m < M; m++) {
    for (let s = 0; s < K; s++) {
      const b = (m * K + s) * H;
      for (let h = 0; h < H; h++) cost[s * H + h] -= U[b + h] / M;
    }
  }
  return { homeIds: tensor.homeIds, K, H, cost };
}

// Expected regret per home with the value draws averaged first, the same way the price is computed: the mean
// over weeks of (this home's cost minus the cheapest home's cost that week). The top home's regret is the price.
export function regretByHome(costs) {
  const out = new Map();
  if (!costs?.cost || !costs.K || !costs.H) return out;
  const { cost, K, H, homeIds } = costs;
  const sum = new Float64Array(H);
  let best = 0;
  for (let s = 0; s < K; s++) {
    let lo = Infinity;
    for (let h = 0; h < H; h++) { const c = cost[s * H + h]; sum[h] += c; if (c < lo) lo = c; }
    best += lo;
  }
  for (let h = 0; h < H; h++) out.set(homeIds ? homeIds[h] : h, (sum[h] - best) / K);
  return out;
}

const toMin = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

// Share of class hours by campus area across the weeks. Fixed entries and maybes are not classes.
// Returns [{ area, hours, share }] sorted by share, high to low.
export function campusShares(scenarios, plan, placeById) {
  const notClass = new Set();
  for (const e of [...(plan?.fixed || []), ...(plan?.maybes || [])]) {
    if (e.id) notClass.add(`id:${e.id}`);
    if (e.label) notClass.add(`label:${e.label}`);
  }
  const by = new Map();
  let total = 0;
  for (const s of scenarios) {
    for (const e of s.week || []) {
      if (notClass.has(`id:${e.id}`) || notClass.has(`label:${e.label}`)) continue;
      const hrs = (Math.max(0, toMin(e.end) - toMin(e.start)) / 60) * (e.days?.length || 0);
      if (!hrs) continue;
      const area = placeById?.get(e.place)?.area || 'Other';
      by.set(area, (by.get(area) || 0) + hrs);
      total += hrs;
    }
  }
  return [...by.entries()].map(([area, hours]) => ({ area, hours, share: total ? hours / total : 0 }))
    .sort((a, b) => b.share - a.share);
}

function evaluate(api, base, settled, seed) {
  const cat = api.mod('catalog'), decide = api.mod('decide');
  const cfg = api.config;
  const t0 = now();
  const keep = Object.keys(settled).length ? cat.conditionScenarios(base.scenarios, settled) : base.scenarios;
  const idx = keep.map((s) => base.indexById.get(s.id)).filter((i) => i != null);
  const scenarios = idx.map((i) => base.scenarios[i]);
  const homeById = api.data.homeById;
  if (!scenarios.length) {
    return { plan: base.plan, persona: base.persona, factors: base.factors, scenarios, rank: [], voi: null, safest: null,
      homeById, stats: base.stats, nAll: base.scenarios.length, empty: true, ms: { ...base.ms, rank: 0, voi: 0 } };
  }
  const weeksByScenario = idx.map((i) => base.weeks[i]);
  const rank = decide.meRank({ homes: api.data.homes, weeksByScenario, thetas: base.thetas, cfg });
  const t1 = now();
  const open = base.factors.filter((f) => !(f.id in settled));
  const voi = cat.voi({ tensor: rank.tensor, scenarios, factors: open, boot: 100, seed });
  const t2 = now();
  const costs = costMatrix(rank.tensor);
  const vh = new Map((voi.homes || []).map((h) => [h.homeId, h]));
  const top = rank[0];
  const safest = top ? { ...top, ...(vh.get(top.homeId) || {}), home: homeById.get(top.homeId) } : null;
  return {
    plan: base.plan, persona: base.persona, factors: base.factors, scenarios, rank, voi, safest, homeById,
    stats: base.stats, costs, campus: campusShares(scenarios, base.plan, api.data.placeById),
    nAll: base.scenarios.length, nDraws: base.thetas.length,
    ms: { ...base.ms, rank: t1 - t0, voi: t2 - t1, total: (base.ms.sample || 0) + (base.ms.route || 0) + (t2 - t0) },
  };
}

export async function runNextYear(api, {
  plan, sections, k = 200, seed = 1, priority = 'normal', odds = {}, settled = {}, onProgress,
} = {}) {
  if (!api?.mod('catalog')) throw new Error('The catalog module is not built yet.');
  if (!plan || !sections) throw new Error('A plan and a catalog are needed.');
  const opts = { plan, sections, k, seed, priority, odds };
  const bk = baseKey(api, opts);
  const ek = `${bk}||${settledKey(settled)}`;
  if (evalCache.has(ek)) return evalCache.get(ek);
  let p = baseCache.get(bk);
  if (!p) {
    p = buildBase(api, opts, onProgress);
    remember(baseCache, bk, p, BASE_MAX);
    p.catch(() => baseCache.delete(bk));
  }
  const base = await p;
  return remember(evalCache, ek, evaluate(api, base, settled, seed), EVAL_MAX);
}

// Load the labeled sample catalog and plans the way the engine adapter loads data (fetch from ./data/).
export async function loadNextYearSample(api, base = './data/') {
  const cat = api.mod('catalog');
  const get = async (p, kind) => {
    const r = await fetch(`${base}${p}`);
    if (!r.ok) throw new Error(`${p} did not load (${r.status})`);
    return kind === 'text' ? r.text() : r.json();
  };
  const [csv, plans, meta] = await Promise.all([
    get('catalog_sample.csv', 'text'), get('plans_sample.json', 'json'), get('catalog_sample.meta.json', 'json').catch(() => null),
  ]);
  const parsed = cat.parseCatalogCSV(csv, api.data.places);
  return { parsed, plans: plans.plans || [], plansLabel: plans.label || 'SAMPLE plans', meta };
}

// For tests and for a config change that should drop everything.
export function clearNextYearCache() {
  baseCache.clear(); evalCache.clear(); weekCache.clear(); thetaCache.clear();
}
