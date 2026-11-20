// Preference learning from pairwise picks (docs/SYSTEM_DESIGN.md sections 3.3, 5.3, 6, 10 item 4).
//
// Posterior over the six theta weights (model.PARAMS) as weighted particles [Chopin2002].
//   init:    theta_k ~ prior (independent lognormals, model.samplePrior), w_k = 1/N
//   update:  w_k <- w_k * sigma( +/- (U(theta_k; A) - U(theta_k; B)) / tau ), renormalize
//            U(theta; option) = theta . phi(option) - rent      (model.phi, dollars per month)
//            if ESS = 1 / sum w^2 < essFrac * N: systematic resample, then multiply every weight by
//            exp(jitterSd * N(0,1)) per dimension (log-space jitter; section 10 drops the Metropolis move)
//   nextPair: exact BALD [Houlsby2011] on a deterministic equal-weight subsample of the particles
//            IG = H( mean_k p_k ) - mean_k H(p_k),  p_k = sigma((U_A - U_B) / tau)
//            plus mu = E[(U_A - U_B)/tau], s2 = Var[(U_A - U_B)/tau] over all particles [SaureVielma2019]
//
// Plain ES module, no runtime dependencies, deterministic from seeds (rng.js), constants from cfg.

import { CONFIG } from './config.js';
import { PARAMS, PARAM_INFO, phi, priorFor } from './model.js';
import { rng } from './rng.js';

const D = PARAMS.length;
const Z80 = 1.2815515655446004;      // standard normal 90th percentile: an 80% central interval is +/- Z80 sd
export const BALD_SUBSAMPLE = 1000;  // particles used for the IG scan in nextPair (opts.subsample overrides)

// ---------- small numerics ----------

function sigmoid(x) {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

function logSigmoid(x) {
  return x >= 0 ? -Math.log1p(Math.exp(-x)) : x - Math.log1p(Math.exp(x));
}

// Binary entropy (nats) of sigma(x): H = log(1 + e^-|x|) + |x| e^-|x| / (1 + e^-|x|). One exp, one log1p.
function entropyLogit(x) {
  const a = x < 0 ? -x : x;
  const e = Math.exp(-a);
  return Math.log1p(e) + (a * e) / (1 + e);
}

function entropyP(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log(p) - (1 - p) * Math.log(1 - p);
}

function phiVec(option) {
  const f = phi(option);
  const v = new Float64Array(D);
  for (let d = 0; d < D; d++) v[d] = f[PARAMS[d]];
  if (!Number.isFinite(option.rent)) throw new Error('prefs: option.rent must be a finite number');
  for (let d = 0; d < D; d++) if (!Number.isFinite(v[d])) throw new Error(`prefs: phi.${PARAMS[d]} is not finite`);
  return v;
}

function optionKey(o) {
  if (o == null) return null;
  if (o.id != null) return String(o.id);
  if (o.homeId != null || o.roomId != null) return `${o.homeId ?? ''}:${o.roomId ?? ''}`;
  return null;
}

function pairKey(a, b) {
  const ka = optionKey(a), kb = optionKey(b);
  if (ka == null || kb == null) return null;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function normalize(post) {
  const { lw, w, n } = post;
  let m = -Infinity;
  for (let k = 0; k < n; k++) if (lw[k] > m) m = lw[k];
  let s = 0;
  for (let k = 0; k < n; k++) { const v = Math.exp(lw[k] - m); w[k] = v; s += v; }
  let s2 = 0;
  for (let k = 0; k < n; k++) { w[k] /= s; s2 += w[k] * w[k]; }
  post.ess = 1 / s2;
  return post.ess;
}

// Systematic resampling: n indices from weights w with one uniform offset u.
function systematic(w, n, count, u) {
  const idx = new Uint32Array(count);
  let c = w[0], k = 0;
  for (let i = 0; i < count; i++) {
    const t = (i + u) / count;
    while (t > c && k < n - 1) { k++; c += w[k]; }
    idx[i] = k;
  }
  return idx;
}

// ---------- posterior ----------

// createPosterior({ n = cfg.particles, seed = 7, prior = priorFor(), cfg = CONFIG })
// prior: { [param]: { median, sigma } } (output of model.priorFor, which applies the wage rule).
export function createPosterior({ n, seed = 7, prior = null, cfg = CONFIG } = {}) {
  const N = n ?? cfg.particles;
  const pr = prior ?? priorFor();
  const r = rng(seed);
  const th = new Float64Array(N * D);
  for (let k = 0; k < N; k++) {
    for (let d = 0; d < D; d++) {
      const { median, sigma } = pr[PARAMS[d]];
      th[k * D + d] = median * Math.exp(sigma * r.normal());
    }
  }
  return {
    n: N, th, lw: new Float64Array(N), w: new Float64Array(N).fill(1 / N),
    prior: pr, cfg, r, seed,
    picks: [],          // [{ choice, keyA, keyB, x: {mu, s2} }] in order, skips included
    asked: new Set(),   // pair keys already shown (skips included), so nextPair does not repeat them
    nPicks: 0,          // picks that carried information (A or B)
    ess: N, minESS: N, resamples: 0,
  };
}

export function ess(post) { return post.ess; }

// update(post, optA, optB, choice): choice 'A' | 'B' | 'skip' (true/false accepted as A/B).
// 'skip' ("too close to call") adds no likelihood term. Returns post (mutated) with post.last set.
export function update(post, optA, optB, choice, cfg = post.cfg) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const ch = choice === true ? 'A' : choice === false ? 'B' : choice;
  const key = pairKey(optA, optB);
  if (key) post.asked.add(key);
  if (ch === 'skip' || ch == null) {
    post.picks.push({ choice: 'skip', keyA: optionKey(optA), keyB: optionKey(optB) });
    post.last = { choice: 'skip', ess: post.ess, resampled: false };
    return post;
  }
  if (ch !== 'A' && ch !== 'B') throw new Error(`prefs.update: choice must be 'A', 'B' or 'skip', got ${choice}`);
  const sgn = ch === 'A' ? 1 : -1;
  const a = phiVec(optA), b = phiVec(optB);
  const dphi = new Float64Array(D);
  for (let d = 0; d < D; d++) dphi[d] = a[d] - b[d];
  const drent = optA.rent - optB.rent;
  const tau = cfg.tau;
  const { th, lw, n } = post;
  for (let k = 0; k < n; k++) {
    let u = -drent;
    const o = k * D;
    for (let d = 0; d < D; d++) u += th[o + d] * dphi[d];
    lw[k] += logSigmoid((sgn * u) / tau);
  }
  const essBefore = normalize(post);
  if (essBefore < post.minESS) post.minESS = essBefore;
  let resampled = false;
  if (essBefore < cfg.essFrac * n) { rejuvenate(post, cfg); resampled = true; }
  post.nPicks++;
  post.picks.push({ choice: ch, keyA: optionKey(optA), keyB: optionKey(optB) });
  post.last = {
    choice: ch, essBefore, ess: post.ess, resampled,
    ms: typeof performance !== 'undefined' ? performance.now() - t0 : null,
  };
  return post;
}

// Systematic resample to equal weights, then log-space jitter with sd cfg.jitterSd per dimension.
function rejuvenate(post, cfg) {
  const { n, th, w, r } = post;
  const idx = systematic(w, n, n, r());
  const nt = new Float64Array(n * D);
  const sd = cfg.jitterSd;
  for (let i = 0; i < n; i++) {
    const s = idx[i] * D, o = i * D;
    for (let d = 0; d < D; d++) nt[o + d] = th[s + d] * Math.exp(sd * r.normal());
  }
  post.th = nt;
  post.lw.fill(0);
  post.w.fill(1 / n);
  post.ess = n;
  post.resamples++;
}

// Weighted mean of theta (natural units).
export function posteriorMean(post) {
  const { n, th, w } = post;
  const m = {};
  for (let d = 0; d < D; d++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += w[k] * th[k * D + d];
    m[PARAMS[d]] = s;
  }
  return m;
}

function weightedQuantiles(post, d, qs) {
  const { n, th, w } = post;
  const vals = new Float64Array(n);
  for (let k = 0; k < n; k++) vals[k] = th[k * D + d];
  const idx = new Uint32Array(n);
  for (let k = 0; k < n; k++) idx[k] = k;
  idx.sort((x, y) => vals[x] - vals[y]);
  const out = new Array(qs.length);
  let c = 0, qi = 0;
  for (let i = 0; i < n && qi < qs.length; i++) {
    c += w[idx[i]];
    while (qi < qs.length && c >= qs[qi] - 1e-12) { out[qi] = vals[idx[i]]; qi++; }
  }
  while (qi < qs.length) out[qi++] = vals[idx[n - 1]];
  return out;
}

// summary(post) -> { [param]: { median, lo, hi, priorRatio, mostlyPrior } }
// lo, hi: weighted 10th and 90th percentiles (80% interval). priorRatio: posterior 80% width over the
// prior's 80% width, both in log space. mostlyPrior: priorRatio > cfg.mostlyPriorRatio.
export function summary(post, cfg = post.cfg) {
  const out = {};
  for (let d = 0; d < D; d++) {
    const k = PARAMS[d];
    const [lo, median, hi] = weightedQuantiles(post, d, [0.1, 0.5, 0.9]);
    const priorW = 2 * Z80 * post.prior[k].sigma;
    const priorRatio = (Math.log(hi) - Math.log(lo)) / priorW;
    out[k] = { median, lo, hi, priorRatio, mostlyPrior: priorRatio > cfg.mostlyPriorRatio };
  }
  return out;
}

// draws(post, k, seed) -> [theta]: weighted systematic resample of k particles.
export function draws(post, k, seed = 1) {
  const r = rng(seed);
  const idx = systematic(post.w, post.n, k, r());
  const out = new Array(k);
  for (let i = 0; i < k; i++) {
    const t = {}, o = idx[i] * D;
    for (let d = 0; d < D; d++) t[PARAMS[d]] = post.th[o + d];
    out[i] = t;
  }
  // Systematic indices are sorted; shuffle so callers that take a prefix get a fair sample.
  for (let i = k - 1; i > 0; i--) { const j = r.int(i + 1); const tmp = out[i]; out[i] = out[j]; out[j] = tmp; }
  return out;
}

// ---------- question selection ----------

// Deterministic equal-weight subsample (systematic, offset 0.5) so nextPair is repeatable for a given post.
function subsample(post, m) {
  if (m >= post.n) return null;
  return systematic(post.w, post.n, m, 0.5);
}

// nextPair(post, candidates, opts) -> { i, j, ig, mu, s2 } (indices into the option list)
//   candidates: an array of options (every pair i < j is scored), or { options, pairs: [[i, j], ...] }
//               (buildCandidates returns this shape). option = { rent, travel, room, id? | homeId?, roomId? }
//   opts.subsample: particles used for the IG scan (default BALD_SUBSAMPLE = 1000; all particles if fewer)
//   opts.skipAsked: skip pairs already shown (default true; needs option ids)
//   opts.top: also return the best `top` pairs as `top: [{i, j, ig}]`
// mu and s2 are computed for the chosen pair over all weighted particles. Returns null if no pair is left.
export function nextPair(post, candidates, opts = {}) {
  const cfg = opts.cfg ?? post.cfg;
  const options = Array.isArray(candidates) ? candidates : candidates.options;
  let pairs = Array.isArray(candidates) ? null : candidates.pairs;
  const nOpt = options.length;
  if (!pairs) {
    pairs = [];
    for (let i = 0; i < nOpt; i++) for (let j = i + 1; j < nOpt; j++) pairs.push([i, j]);
  }
  const skipAsked = opts.skipAsked !== false;
  const tau = cfg.tau;
  const M = Math.min(opts.subsample ?? BALD_SUBSAMPLE, post.n);
  const sidx = subsample(post, M);
  const wts = sidx ? null : post.w;  // equal weights 1/M when subsampled
  const th = post.th;
  // U[o * M + k] = (theta_k . phi_o - rent_o) / tau
  const U = new Float64Array(nOpt * M);
  const phis = options.map(phiVec);
  for (let o = 0; o < nOpt; o++) {
    const f = phis[o], base = o * M, rent = options[o].rent;
    for (let m = 0; m < M; m++) {
      const p = (sidx ? sidx[m] : m) * D;
      let u = -rent;
      for (let d = 0; d < D; d++) u += th[p + d] * f[d];
      U[base + m] = u / tau;
    }
  }
  const topN = opts.top ?? 0;
  const scored = topN ? [] : null;
  let best = null;
  for (let q = 0; q < pairs.length; q++) {
    const [i, j] = pairs[q];
    if (i === j) continue;
    if (skipAsked && post.asked.size) {
      const key = pairKey(options[i], options[j]);
      if (key && post.asked.has(key)) continue;
    }
    const bi = i * M, bj = j * M;
    let pbar = 0, hbar = 0;
    if (wts) {
      for (let m = 0; m < M; m++) {
        const x = U[bi + m] - U[bj + m];
        const a = x < 0 ? -x : x, e = Math.exp(-a), inv = 1 / (1 + e);
        pbar += wts[m] * (x >= 0 ? inv : e * inv);
        hbar += wts[m] * (Math.log1p(e) + a * e * inv);
      }
    } else {
      for (let m = 0; m < M; m++) {
        const x = U[bi + m] - U[bj + m];
        const a = x < 0 ? -x : x, e = Math.exp(-a), inv = 1 / (1 + e);
        pbar += x >= 0 ? inv : e * inv;
        hbar += Math.log1p(e) + a * e * inv;   // = entropyLogit(x), inlined to share one exp
      }
      pbar /= M; hbar /= M;
    }
    const ig = Math.max(0, entropyP(pbar) - hbar);
    if (scored) scored.push({ i, j, ig });
    if (!best || ig > best.ig) best = { i, j, ig };
  }
  if (!best) return null;
  const { mu, s2 } = pairMoments(post, options[best.i], options[best.j], tau);
  const out = { i: best.i, j: best.j, ig: best.ig, mu, s2 };
  if (scored) { scored.sort((a, b) => b.ig - a.ig); out.top = scored.slice(0, topN); }
  out.subsample = M;
  return out;
}

// mu = E_w[(U_A - U_B)/tau], s2 = Var_w[(U_A - U_B)/tau] over all particles.
export function pairMoments(post, optA, optB, tau = post.cfg.tau) {
  const a = phiVec(optA), b = phiVec(optB);
  const dr = optA.rent - optB.rent;
  const { n, th, w } = post;
  let m1 = 0, m2 = 0;
  for (let k = 0; k < n; k++) {
    let u = -dr;
    const o = k * D;
    for (let d = 0; d < D; d++) u += th[o + d] * (a[d] - b[d]);
    const x = u / tau;
    m1 += w[k] * x; m2 += w[k] * x * x;
  }
  return { mu: m1, s2: Math.max(0, m2 - m1 * m1) };
}

// buildCandidates(post, homes) -> { options, pairs }  (section 3.3 candidate pool)
//   homes: [{ id, options: [option per room, same travel] }]
//   Pairs: every pair of homes, each home shown with its best room under the posterior mean, plus every pair
//   of rooms inside one home (isolates the room weights).
export function buildCandidates(post, homes) {
  const mean = posteriorMean(post);
  const options = [], pairs = [];
  const bestIdx = [];
  const util = (o) => {
    const f = phi(o);
    let u = -o.rent;
    for (const k of PARAMS) u += mean[k] * f[k];
    return u;
  };
  for (const h of homes) {
    if (!h.options.length) continue;
    let b = 0, bu = -Infinity;
    h.options.forEach((o, r) => { const u = util(o); if (u > bu) { bu = u; b = r; } });
    const start = options.length;
    for (const o of h.options) options.push(o);
    bestIdx.push(start + b);
    for (let r1 = 0; r1 < h.options.length; r1++) {
      for (let r2 = r1 + 1; r2 < h.options.length; r2++) pairs.push([start + r1, start + r2]);
    }
  }
  for (let a = 0; a < bestIdx.length; a++) {
    for (let b = a + 1; b < bestIdx.length; b++) pairs.push([bestIdx[a], bestIdx[b]]);
  }
  return { options, pairs, best: bestIdx };
}

// shouldStop(post, nPicks, topPBest, bestIG, cfg) -> { stop, reason }   (section 10 item 4)
//   topPBest: the leading home's P(best) on the single most likely week (caller computes it; null to skip).
//   bestIG: the best remaining question's information gain in nats (nextPair(...).ig; null if none left).
export function shouldStop(post, nPicks = post?.nPicks ?? 0, topPBest = null, bestIG = null, cfg = post?.cfg ?? CONFIG) {
  if (nPicks >= cfg.picksMax) return { stop: true, reason: 'max', text: `Reached ${cfg.picksMax} picks.` };
  if (bestIG == null && nPicks > 0) return { stop: true, reason: 'none-left', text: 'No new question is left to ask.' };
  if (nPicks < cfg.picksMin) return { stop: false, reason: 'min', text: `At least ${cfg.picksMin} picks.` };
  if (topPBest != null && topPBest >= cfg.stopPBest) {
    return { stop: true, reason: 'pbest', text: `One home is best with probability ${topPBest.toFixed(2)} on your most likely week.` };
  }
  if (bestIG != null && bestIG < cfg.stopIG) {
    return { stop: true, reason: 'ig', text: `The best remaining question would teach less than ${cfg.stopIG} nats.` };
  }
  return { stop: false, reason: 'continue', text: 'Another pick would still change the answer.' };
}

// P(best) per home under the posterior on one set of options (one week), on a subsample of particles.
// homes: [{ id, options }]. Returns [{ id, pBest }] in input order.
export function pBestHomes(post, homes, m = BALD_SUBSAMPLE) {
  const M = Math.min(m, post.n);
  const sidx = subsample(post, M);
  const wts = sidx ? null : post.w;
  const flat = [];
  homes.forEach((h, hi) => h.options.forEach((o) => flat.push([hi, phiVec(o), o.rent])));
  const p = new Float64Array(homes.length);
  for (let s = 0; s < M; s++) {
    const o = (sidx ? sidx[s] : s) * D;
    let bu = -Infinity, bh = -1;
    for (const [hi, f, rent] of flat) {
      let u = -rent;
      for (let d = 0; d < D; d++) u += post.th[o + d] * f[d];
      if (u > bu) { bu = u; bh = hi; }
    }
    p[bh] += wts ? wts[s] : 1 / M;
  }
  return homes.map((h, i) => ({ id: h.id, pBest: p[i] }));
}

// ---------- synthetic option sets (recovery test without week.js or homes.json) ----------

// syntheticWorld(seed, { homes = 30, scenarios = 8 }) -> SYNTHETIC world of homes with per-room options.
// Ranges are chosen to match a student week: 8 to 45 generalized travel hours per month, 0 to about 8 dark
// hours, 0 to about 9 stranded trips per month for far homes, asking rent $600 to $1400 plus utilities.
// world.homes[h] = { id, s0: [option per room] (modal week), mean: [option per room] (mean over scenarios) }
export function syntheticWorld(seed = 1, { homes = 30, scenarios = 8 } = {}) {
  const r = rng(seed * 7919 + 13);
  const U = (a, b) => a + (b - a) * r();
  const out = [];
  for (let h = 0; h < homes; h++) {
    const km = U(0.3, 4.5);
    const darkRoute = U(0.3, 1.6);           // route-specific dark exposure, so darkness is not collinear with time
    const lateService = r();                  // how well late buses serve this home
    const genWeek = Math.max(60, 80 + 95 * km + 35 * r.normal()); // generalized minutes per week
    const darkWeek = Math.max(0, (8 + 14 * km) * darkRoute + 6 * r.normal());
    const strandWeek = km > 1.8 && lateService < 0.45 ? [0.5, 1, 1, 2][r.int(4)] : 0;
    const nRooms = 2 + r.int(5);
    const utilShare = U(180, 360) / nRooms;
    const base = 1180 - 95 * km + 70 * r.normal();
    const rooms = [];
    for (let q = 0; q < nRooms; q++) {
      const sqft = Math.round(U(90, 240));
      const bath = ['shared', 'shared', 'half', 'private'][r.int(4)];
      const light = r.int(3);
      const asking = Math.round(Math.min(1400, Math.max(600,
        base + 2.2 * (sqft - 150) + (bath === 'private' ? 70 : bath === 'half' ? 30 : 0) + 15 * (light - 1) + 40 * r.normal())));
      rooms.push({ id: `s${h + 1}r${q + 1}`, label: `Room ${q + 1}`, sqft, bath, light, asking });
    }
    const wpm = 52 / 12;
    const travelOf = (g, dk, st) => ({ hoursPerMonth: (g / 60) * wpm, darkHoursPerMonth: (dk / 60) * wpm, strandedPerMonth: st * wpm });
    const s0 = travelOf(genWeek, darkWeek, strandWeek);
    let mg = 0, md = 0, ms = 0;
    for (let s = 0; s < scenarios; s++) {
      mg += genWeek * U(0.8, 1.25);
      md += darkWeek * U(0.5, 1.6);
      ms += r() < 0.25 ? (km > 1.8 ? 1 : 0) : strandWeek;
    }
    const mean = travelOf(mg / scenarios, md / scenarios, ms / scenarios);
    const mk = (travel) => rooms.map((room) => ({
      id: room.id, homeId: `s${h + 1}`, roomId: room.id, rent: room.asking + utilShare, travel, room,
    }));
    out.push({ id: `s${h + 1}`, s0: mk(s0), mean: mk(mean) });
  }
  return { label: 'SYNTHETIC option set for the recovery test', seed, homes: out };
}

// ---------- recovery test (section 5.3) ----------

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function trueUtil(theta, o) {
  const f = phi(o);
  let u = -o.rent;
  for (const k of PARAMS) u += theta[k] * f[k];
  return u;
}

// Off-prior stress set: vTime at 0.3x or 3x the prior median (alternating), vDark at the prior's 95th percentile,
// the other weights drawn from the prior.
function drawTruth(r, prior, offPrior, t) {
  const th = {};
  for (const k of PARAMS) th[k] = prior[k].median * Math.exp(prior[k].sigma * r.normal());
  if (offPrior) {
    th.vTime = prior.vTime.median * (t % 2 === 0 ? 0.3 : 3);
    th.vDark = prior.vDark.median * Math.exp(1.6448536269514722 * prior.vDark.sigma);
  }
  return th;
}

// recoveryTest({ trials, picks, seed, policy, tauScale, offPrior, world, n, subsample, cfg })
//   policy: 'bald' | 'random' | 'fixed' (fixed = the 6 highest-IG pairs under the prior, chosen before any answer)
//   tauScale: simulated answers use tau * tauScale; the posterior always uses cfg.tau (misspecification check)
//   world: a fixed option world (scripts/recovery.mjs --real), or null for a new syntheticWorld per trial
// Returns { coverage, medianIntervalWidth, maeLogVTime, top1, regretP50, regretP90, minESS, perPick, stop? }
// with top-level values at the last pick and perPick[p] for p = 0..picks. Also regretMean, trialRegrets
// ([trial][pick], for paired comparisons) and, for bald, stop = { p50, mean, reasons } from shouldStop.
// coverage[k]: share of trials whose true weight is inside the 80% interval. medianIntervalWidth[k]: median
// log-space width ln(hi) - ln(lo). maeLogVTime: median |ln median - ln true| for vTime. minESS: lowest ESS
// seen right after an update (before any resample).
export function recoveryTest({
  trials = 300, picks = 6, seed = 1, policy = 'bald', tauScale = 1, offPrior = false,
  world = null, n, subsample = BALD_SUBSAMPLE, cfg = CONFIG, prior = null,
} = {}) {
  const pr = prior ?? priorFor();
  const N = n ?? cfg.particles;
  const rT = rng(seed * 1000003 + (offPrior ? 17 : 0));
  const per = Array.from({ length: picks + 1 }, () => ({
    cover: Object.fromEntries(PARAMS.map((k) => [k, 0])),
    width: Object.fromEntries(PARAMS.map((k) => [k, []])),
    absErrLogVTime: [], top1: 0, regret: [], ess: Infinity,
  }));
  const stopAt = [], stopReasons = {};
  const trialRegrets = [];
  for (let t = 0; t < trials; t++) {
    const myRegrets = [];
    trialRegrets.push(myRegrets);
    const W = world ?? syntheticWorld(seed * 100003 + t);
    const truth = drawTruth(rT, pr, offPrior, t);
    const post = createPosterior({ n: N, seed: seed * 7 + t * 31 + 1, prior: pr, cfg });
    const rAns = rng(seed * 92821 + t * 7 + 3);
    const rPol = rng(seed * 31337 + t * 11 + 5);
    const s0Homes = W.homes.map((h) => ({ id: h.id, options: h.s0 }));
    const decOpts = W.homes.flatMap((h) => h.mean.map((o) => ({ o, home: h.id })));
    // truth on the decision target (mean over scenarios)
    let tb = -Infinity, tbHome = null;
    for (const { o, home } of decOpts) { const u = trueUtil(truth, o); if (u > tb) { tb = u; tbHome = home; } }

    let fixedPairs = null;
    if (policy === 'fixed') {
      const cand = buildCandidates(post, s0Homes);
      const res = nextPair(post, cand, { subsample, top: 200 });
      const used = new Set();
      fixedPairs = [];
      for (const q of res.top) {
        if (fixedPairs.length >= picks) break;
        if (used.has(q.i) || used.has(q.j)) continue;
        fixedPairs.push([cand.options[q.i], cand.options[q.j]]);
        used.add(q.i); used.add(q.j);
      }
      for (const q of res.top) {
        if (fixedPairs.length >= picks) break;
        if (!fixedPairs.some(([a, b]) => a === cand.options[q.i] && b === cand.options[q.j])) {
          fixedPairs.push([cand.options[q.i], cand.options[q.j]]);
        }
      }
    }

    let stopped = false;
    const record = (p) => {
      const s = summary(post, cfg);
      const P = per[p];
      for (const k of PARAMS) {
        if (truth[k] >= s[k].lo && truth[k] <= s[k].hi) P.cover[k]++;
        P.width[k].push(Math.log(s[k].hi) - Math.log(s[k].lo));
      }
      P.absErrLogVTime.push(Math.abs(Math.log(s.vTime.median) - Math.log(truth.vTime)));
      const mean = posteriorMean(post);
      let rb = -Infinity, rec = null;
      for (const d of decOpts) { const u = trueUtil(mean, d.o); if (u > rb) { rb = u; rec = d; } }
      if (rec.home === tbHome) P.top1++;
      const reg = tb - trueUtil(truth, rec.o);
      P.regret.push(reg);
      myRegrets.push(reg);
      if (p > 0 && post.last.essBefore < P.ess) P.ess = post.last.essBefore;
    };
    record(0);
    for (let p = 1; p <= picks; p++) {
      let A, B, ig = null;
      if (policy === 'fixed') {
        [A, B] = fixedPairs[(p - 1) % fixedPairs.length];
      } else {
        const cand = buildCandidates(post, s0Homes);
        if (policy === 'bald') {
          const res = nextPair(post, cand, { subsample });
          if (!stopped) {
            const pb = pBestHomes(post, s0Homes, 500);
            const top = Math.max(...pb.map((x) => x.pBest));
            const st = shouldStop(post, p - 1, top, res ? res.ig : null, cfg);
            if (st.stop) { stopped = true; stopAt.push(p - 1); stopReasons[st.reason] = (stopReasons[st.reason] ?? 0) + 1; }
          }
          A = cand.options[res.i]; B = cand.options[res.j]; ig = res.ig;
        } else if (policy === 'random') {
          let q, tries = 0;
          do { q = cand.pairs[rPol.int(cand.pairs.length)]; tries++; }
          while (tries < 50 && post.asked.has(pairKey(cand.options[q[0]], cand.options[q[1]])));
          A = cand.options[q[0]]; B = cand.options[q[1]];
        } else throw new Error(`recoveryTest: unknown policy ${policy}`);
      }
      const x = (trueUtil(truth, A) - trueUtil(truth, B)) / (cfg.tau * tauScale);
      update(post, A, B, rAns() < sigmoid(x) ? 'A' : 'B', cfg);
      record(p);
    }
    if (policy === 'bald' && !stopped) { stopAt.push(picks); stopReasons.max = (stopReasons.max ?? 0) + 1; }
  }
  const perPick = per.map((P, p) => {
    const reg = [...P.regret].sort((a, b) => a - b);
    const ae = [...P.absErrLogVTime].sort((a, b) => a - b);
    return {
      pick: p,
      coverage: Object.fromEntries(PARAMS.map((k) => [k, P.cover[k] / trials])),
      medianIntervalWidth: Object.fromEntries(PARAMS.map((k) => [k, quantile([...P.width[k]].sort((a, b) => a - b), 0.5)])),
      maeLogVTime: quantile(ae, 0.5),
      top1: P.top1 / trials,
      regretMean: reg.reduce((a, b) => a + b, 0) / trials,
      regretP50: quantile(reg, 0.5),
      regretP90: quantile(reg, 0.9),
      minESS: p === 0 ? N : P.ess,
    };
  });
  const last = perPick[picks];
  const out = {
    policy, tauScale, offPrior, trials, picks, seed, particles: N, subsample,
    coverage: last.coverage, medianIntervalWidth: last.medianIntervalWidth, maeLogVTime: last.maeLogVTime,
    top1: last.top1, regretP50: last.regretP50, regretP90: last.regretP90, regretMean: last.regretMean,
    minESS: Math.min(...perPick.slice(1).map((x) => x.minESS)),
    perPick,
    trialRegrets,     // [trial][pick] regret in $/month, for paired policy comparisons (callers may drop it)
  };
  if (policy === 'bald') {
    const s = [...stopAt].sort((a, b) => a - b);
    out.stop = { p50: quantile(s, 0.5), mean: s.reduce((a, b) => a + b, 0) / s.length, reasons: stopReasons };
  }
  return out;
}

export { PARAM_INFO };
