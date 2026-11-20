// Connection Scan Algorithm (Dibbelt, Pajor, Strasser, Wagner 2013) over the merged
// TheRide + U-M timetable, with walking transfer footpaths and leg reconstruction.
//
// forward():  earliest arrival at every stop, leaving the given sources at given times.
// backward(): latest departure from every stop that still reaches the sinks in time.
// Both are one-to-all, so one scan answers a trip for every candidate home at once.
//
// Two labels per stop (RAPTOR's split between vehicle and footpath arrivals, Delling et al. 2012):
//   forward:  ride[s] best arrival by vehicle, foot[s] best arrival by a footpath after a vehicle.
//             A new boarding at s is possible from min(ride[s] + change[s], foot[s], seed[s]).
//   backward: ride[s] latest boarding departure at s, foot[s] latest moment to start walking from s
//             to a later boarding. Alighting at s is allowed by max(ride[s] - change[s], foot[s], seed[s]).
// The change time applies only after (forward) or before (backward) a ride at the same stop; footpath
// durations already include it (pipeline/build_walk.py applies max(walk, min_transfer_time)).
// Seeds never appear in the exported t: a transit journey has at least one ride.

import { CONFIG } from './config.js';

export const NONE = 0, ACCESS = 1, RIDE = 2, FOOT = 3;
export const SEED = ACCESS; // a trip boarded straight from a seed (or alighted straight into a sink)
const W = 5; // ints per connection: depStop, arrStop, dep, arr, trip

export class Timetable {
  constructor(meta, connBuffers, cfg = CONFIG) {
    this.meta = meta;
    this.cfg = cfg;
    this.stops = meta.stops;
    this.routes = meta.routes;
    this.trips = meta.trips;
    this.nStops = meta.stops.length;
    this.nTrips = meta.trips.length;
    this.days = {};
    for (const [day, buf] of Object.entries(connBuffers)) {
      const c = new Int32Array(buf);
      this.days[day] = { c, n: c.length / W };
    }
    // Footpath adjacency, outgoing and incoming.
    const fp = meta.footpaths || [];
    const build = (from, to) => {
      const off = new Int32Array(this.nStops + 1);
      for (const f of fp) off[f[from] + 1]++;
      for (let i = 0; i < this.nStops; i++) off[i + 1] += off[i];
      const pos = off.slice(0, this.nStops);
      const other = new Int32Array(fp.length), dur = new Int32Array(fp.length);
      for (const f of fp) { const k = pos[f[from]]++; other[k] = f[to]; dur[k] = f[2]; }
      return { off, other, dur };
    };
    this.fpOut = build(0, 1);
    this.fpIn = build(1, 0);
    // Per-stop change time. meta.change[s] >= 0 comes from a feed's transfers.txt (same-stop
    // min_transfer_time); -1 means the default cfg.changeDefaultS (an assumption).
    this.changeFeed = Int32Array.from(meta.change || new Array(this.nStops).fill(-1));
    this.change = new Int32Array(this.nStops);
    this.setChangeDefault(cfg.changeDefaultS ?? 60);
    // scratch arrays, reused across queries
    this.ride = new Float64Array(this.nStops);
    this.foot = new Float64Array(this.nStops);
    this.seed = new Float64Array(this.nStops);
    this.seedTag = new Int32Array(this.nStops);
    this.rideParent = new Int32Array(2 * this.nStops);
    this.footParent = new Int32Array(2 * this.nStops);
    this.trip = new Int32Array(this.nTrips);
    this.via = new Uint8Array(this.nTrips);
  }

  // Sensitivity toggle (test R7): change time at every stop the feeds do not list.
  setChangeDefault(sec) {
    this.changeDefault = sec;
    for (let s = 0; s < this.nStops; s++) this.change[s] = this.changeFeed[s] >= 0 ? this.changeFeed[s] : sec;
  }

  // Older callers read or set a scalar buffer; it maps to the default change time.
  get transferBuffer() { return this.changeDefault; }
  set transferBuffer(sec) { this.setChangeDefault(sec); }

  firstDepAtOrAfter(day, t) {
    const { c, n } = this.days[day];
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m * W + 2] < t) lo = m + 1; else hi = m; }
    return lo;
  }

  // Copy the scratch labels into a snapshot. Keeps {t, kind, pa, pb, day} for older callers:
  // kind RIDE -> pa, pb = the ride's two connection indices; FOOT -> pa = other stop, pb = seconds.
  snapshot(day, dir, better) {
    const N = this.nStops, R = this.ride, F = this.foot, RP = this.rideParent, FP = this.footParent;
    const t = new Float64Array(N), kind = new Uint8Array(N), pa = new Int32Array(N), pb = new Int32Array(N);
    const none = dir === 'forward' ? Infinity : -Infinity;
    for (let s = 0; s < N; s++) {
      const r = R[s], f = F[s];
      if (r === none && f === none) { t[s] = none; continue; }
      if (better(f, r)) { t[s] = f; kind[s] = FOOT; pa[s] = FP[2 * s]; pb[s] = FP[2 * s + 1]; }
      else { t[s] = r; kind[s] = RIDE; pa[s] = RP[2 * s]; pb[s] = RP[2 * s + 1]; }
    }
    return {
      day, dir, t, kind, pa, pb,
      ride: R.slice(), foot: F.slice(), seed: this.seed.slice(), seedTag: this.seedTag.slice(),
      rideParent: RP.slice(), footParent: FP.slice(), via: this.via.slice(),
    };
  }

  // sources: [{stop, t, tag}]. Returns a snapshot (copied arrays).
  forward(day, sources, horizon = this.cfg.horizonS ?? 3 * 3600) {
    const { c, n } = this.days[day];
    const R = this.ride.fill(Infinity), F = this.foot.fill(Infinity), S = this.seed.fill(Infinity);
    const ST = this.seedTag, RP = this.rideParent, FP = this.footParent, via = this.via.fill(NONE);
    const tripIn = this.trip.fill(-1), chg = this.change, fo = this.fpOut;
    let t0 = Infinity;
    for (const s of sources) {
      if (s.t < S[s.stop]) { S[s.stop] = s.t; ST[s.stop] = s.tag ?? 0; }
      t0 = Math.min(t0, s.t);
    }
    if (t0 < Infinity) {
      const tEnd = t0 + horizon;
      for (let i = this.firstDepAtOrAfter(day, t0); i < n; i++) {
        const o = i * W, dep = c[o + 2];
        if (dep > tEnd) break;
        const tr = c[o + 4];
        if (tripIn[tr] < 0) {
          const ds = c[o];
          // earliest moment a boarding at ds is possible; ties prefer fewer rides
          let best = S[ds], v = SEED;
          if (F[ds] < best) { best = F[ds]; v = FOOT; }
          const r = R[ds] + chg[ds];
          if (r < best) { best = r; v = RIDE; }
          if (best > dep) continue;
          tripIn[tr] = i; via[tr] = v;
        }
        const as = c[o + 1], arr = c[o + 3];
        if (arr < R[as]) {
          R[as] = arr; RP[2 * as] = tripIn[tr]; RP[2 * as + 1] = i;
          for (let e = fo.off[as]; e < fo.off[as + 1]; e++) {
            const to = fo.other[e], ta = arr + fo.dur[e];
            if (ta < F[to]) { F[to] = ta; FP[2 * to] = as; FP[2 * to + 1] = fo.dur[e]; }
          }
        }
      }
    }
    return this.snapshot(day, 'forward', (f, r) => f < r);
  }

  // sinks: [{stop, t, tag}] where t is the latest time you may be at that stop.
  backward(day, sinks, horizon = this.cfg.horizonS ?? 3 * 3600) {
    const { c } = this.days[day];
    const R = this.ride.fill(-Infinity), F = this.foot.fill(-Infinity), S = this.seed.fill(-Infinity);
    const ST = this.seedTag, RP = this.rideParent, FP = this.footParent, via = this.via.fill(NONE);
    const tripOut = this.trip.fill(-1), chg = this.change, fi = this.fpIn;
    let t1 = -Infinity;
    for (const s of sinks) {
      if (s.t > S[s.stop]) { S[s.stop] = s.t; ST[s.stop] = s.tag ?? 0; }
      t1 = Math.max(t1, s.t);
    }
    if (t1 > -Infinity) {
      const tStart = t1 - horizon;
      // last connection departing at or before t1
      for (let i = this.firstDepAtOrAfter(day, Math.floor(t1) + 1) - 1; i >= 0; i--) {
        const o = i * W, dep = c[o + 2];
        if (dep < tStart) break;
        const tr = c[o + 4];
        if (tripOut[tr] < 0) {
          const as = c[o + 1], arr = c[o + 3];
          // latest moment you may alight at as and still continue; ties prefer fewer rides
          let best = S[as], v = SEED;
          if (F[as] > best) { best = F[as]; v = FOOT; }
          const r = R[as] - chg[as];
          if (r > best) { best = r; v = RIDE; }
          if (arr > best) continue;
          tripOut[tr] = i; via[tr] = v; // exit connection of this trip
        }
        const ds = c[o];
        if (dep > R[ds]) {
          R[ds] = dep; RP[2 * ds] = i; RP[2 * ds + 1] = tripOut[tr];
          for (let e = fi.off[ds]; e < fi.off[ds + 1]; e++) {
            const from = fi.other[e], td = dep - fi.dur[e];
            if (td > F[from]) { F[from] = td; FP[2 * from] = ds; FP[2 * from + 1] = fi.dur[e]; }
          }
        }
      }
    }
    return this.snapshot(day, 'backward', (f, r) => f > r);
  }

  conn(day, i) {
    const c = this.days[day].c, o = i * W;
    return { depStop: c[o], arrStop: c[o + 1], dep: c[o + 2], arr: c[o + 3], trip: c[o + 4] };
  }

  rideLeg(day, enter, exit) {
    const a = this.conn(day, enter), b = this.conn(day, exit);
    const [ri, headsign] = this.trips[a.trip];
    const r = this.routes[ri];
    return {
      type: 'ride', trip: a.trip, route: r.short, routeName: r.long, color: r.color, feed: r.feed, headsign,
      from: a.depStop, to: b.arrStop, fromName: this.stops[a.depStop].name, toName: this.stops[b.arrStop].name,
      dep: a.dep, arr: b.arr, enter, exit,
    };
  }

  footLeg(from, to, dur) {
    return { type: 'transfer', from, to, dur, fromName: this.stops[from].name, toName: this.stops[to].name };
  }

  // Legs from the seed (access) stop to `stop` in a forward snapshot, following the label that
  // gives snap.t[stop] and then each trip's boarding label. null when no ride reaches `stop`.
  legsForward(snap, stop) {
    let s = stop, label = snap.kind[s], guard = 0;
    if (label !== RIDE && label !== FOOT) return null;
    const legs = [];
    while (label !== SEED) {
      if (guard++ > 64) return null;
      if (label === RIDE) {
        const leg = this.rideLeg(snap.day, snap.rideParent[2 * s], snap.rideParent[2 * s + 1]);
        legs.push(leg); s = leg.from; label = snap.via[leg.trip];
      } else if (label === FOOT) {
        const from = snap.footParent[2 * s];
        legs.push(this.footLeg(from, s, snap.footParent[2 * s + 1]));
        s = from; label = RIDE;
      } else return null;
    }
    return { accessStop: s, accessTag: snap.seedTag[s], legs: legs.reverse() };
  }

  // Legs from `stop` to the sink stop in a backward snapshot. null when no ride leaves `stop`.
  legsBackward(snap, stop) {
    let s = stop, label = snap.kind[s], guard = 0;
    if (label !== RIDE && label !== FOOT) return null;
    const legs = [];
    while (label !== SEED) {
      if (guard++ > 64) return null;
      if (label === RIDE) {
        const leg = this.rideLeg(snap.day, snap.rideParent[2 * s], snap.rideParent[2 * s + 1]);
        legs.push(leg); s = leg.to; label = snap.via[leg.trip];
      } else if (label === FOOT) {
        const to = snap.footParent[2 * s];
        legs.push(this.footLeg(s, to, snap.footParent[2 * s + 1]));
        s = to; label = RIDE;
      } else return null;
    }
    return { sinkStop: s, sinkTag: snap.seedTag[s], legs };
  }
}
