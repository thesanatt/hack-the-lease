// Rank every home for the student's profile week: the same engine as the You tab (24 possible weeks through
// every home on the real timetables, 200 value draws, expected regret), with the prior set from the profile
// (a wage sets the value of time; "private bathroom matters" and the like raise those weights).
// Results are cached by the profile's signature, so switching tabs is instant.
import { useEffect, useState } from 'react';
import { priorFor } from '../../../engine/model.js';
import { priorOverrides } from '../../../engine/profile.js';
import { modalRoutine, uncertainRoutine } from '../views/me/routine.js';
import { profileKey } from './store.js';

const cache = new Map();

export function computeRanking(api, profile) {
  const entries = profile?.entries || [];
  if (!entries.length) return null;
  const key = `${profileKey(profile)}|${api.version}`;
  if (cache.has(key)) return cache.get(key);
  const week = api.mod('week'), prefs = api.mod('prefs'), decide = api.mod('decide'), ex = api.mod('explain');
  if (!week || !prefs || !decide) return null;
  const cfg = api.config;
  const t0 = performance.now();
  const { homes, placeById } = api.data;
  const homeIds = homes.map((h) => h.id);
  const { wage, overrides } = priorOverrides(profile);
  const post = prefs.createPosterior({ seed: 7, prior: priorFor({ wage, overrides }), cfg });
  const thetas = prefs.draws(post, cfg.posteriorDraws, 3);
  const scen = week.sampleWeeks(uncertainRoutine(entries, profile.modes), cfg.scenarios, 11);
  const weeksByScenario = scen.map((s) => api.weekFor(s, homeIds));
  const rank = decide.meRank({ homes, weeksByScenario, thetas, cfg });
  const modal = modalRoutine(entries, profile.modes);
  const weekMap = api.weekFor(modal, homeIds);
  const theta = Object.fromEntries(Object.entries(prefs.summary(post, cfg)).map(([k, s]) => [k, s.median]));
  const roomIds = new Map(rank.map((r) => [r.homeId, r.roomId]));
  let notes = null;
  try { notes = ex?.explainAll({ homes, weekMap, theta, cfg, places: placeById, modes: profile.modes, roomIds }) || null; } catch (e) { console.error(e); }
  const trips = scen.reduce((n, s) => n + s.week.reduce((m, e) => m + e.days.length * 2, 0), 0) * homes.length;
  const n = rank.length;
  const byId = new Map(rank.map((r, i) => {
    const note = notes?.get(r.homeId) || null;
    const rent = note?.rent ?? null;
    const tier = i < Math.ceil(n * 0.2) ? 'great' : i < Math.ceil(n * 0.5) ? 'good' : 'weak';
    return [r.homeId, { ...r, pos: i + 1, n, tier, note, rent, week: weekMap?.get(r.homeId) || null }];
  }));
  const out = { rank, byId, notes, weekMap, theta, nScen: scen.length, ms: performance.now() - t0, trips };
  cache.set(key, out);
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  return out;
}

export function useRanking(api, profile) {
  const key = profile ? `${profileKey(profile)}|${api.version}` : null;
  const [res, setRes] = useState(() => (key && cache.has(key) ? cache.get(key) : null));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!key) { setRes(null); return undefined; }
    if (cache.has(key)) { setRes(cache.get(key)); return undefined; }
    setBusy(true);
    const id = setTimeout(() => {
      try { setRes(computeRanking(api, profile)); } catch (e) { console.error(e); setRes(null); }
      setBusy(false);
    }, 30);
    return () => clearTimeout(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { res, busy };
}

// ---------------------------------------------------------------- words
export const TIER = { great: 'Great fit', good: 'Good fit', weak: 'Weaker fit' };
const GOOD = { rent: 'lower rent', time: 'quick trips', dark: 'little walking in the dark', strand: 'a ride for every trip', bath: 'a private bathroom', size: 'a bigger room', light: 'lots of daylight' };
const BAD = { rent: 'higher rent', time: 'long trips', dark: 'walks home in the dark', strand: 'late trips with no bus that fits', bath: 'a shared bathroom', size: 'a small room', light: 'a darker room' };

// One plain sentence: what is good, then one thing to watch. No dollar figures.
export function verdict(item) {
  const note = item?.note;
  if (!note) return null;
  const fits = (note.fits || []).filter((r) => !r.vs && r.dollars >= 3).map((r) => GOOD[r.key]).filter(Boolean);
  const watch = (note.watch || []).filter((r) => !r.vs && (r.dollars <= -3 || r.absolute)).map((r) => BAD[r.key]).filter(Boolean);
  const plus = fits.length ? capital(fits.slice(0, 2).join(' and ')) : 'About average on every count';
  const strand = item.week?.stranded?.length || 0;
  let minus = watch[0] || null;
  if (strand && !minus) minus = BAD.strand;
  return { plus: `${plus}.`, minus: minus ? `Watch out for ${minus}.` : null, strand };
}

const capital = (s) => s[0].toUpperCase() + s.slice(1);

export const hoursText = (min) => {
  if (min == null || !Number.isFinite(min)) return '--';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m ? `${m} min` : ''}`.trim() : `${m} min`;
};
export const money = (v) => (v == null || !Number.isFinite(v) ? '--' : `$${Math.round(v).toLocaleString('en-US')}`);

// The cheapest room, rent plus an equal share of utilities: what a listing site would show.
export function fromPrice(home) {
  const n = home.rooms?.length || 1;
  return Math.min(...(home.rooms || [{ asking: home.rent / n }]).map((r) => (r.asking ?? home.rent / n) + (home.utilities || 0) / n));
}
