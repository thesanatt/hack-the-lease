// Connection Scan Algorithm (Dibbelt, Pajor, Strasser, Wagner 2013) over the merged
// TheRide + U-M timetable, with walking transfer footpaths and leg reconstruction.
//
// forward():  earliest arrival at every stop, leaving the given sources at given times.
// backward(): latest departure from every stop that still reaches the sinks in time.
// Both are one-to-all, so one scan answers a trip for every candidate home at once.

export const NONE = 0, ACCESS = 1, RIDE = 2, FOOT = 3;
const W = 5; // ints per connection: depStop, arrStop, dep, arr, trip

export class Timetable {
  constructor(meta, connBuffers) {
    this.meta = meta;
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
    const fp = meta.footpaths;
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
    this.transferBuffer = 60; // seconds to change between vehicles at a stop (assumption)
    // scratch arrays, reused across queries
    this.t = new Float64Array(this.nStops);
    this.kind = new Uint8Array(this.nStops);
    this.pa = new Int32Array(this.nStops);
    this.pb = new Int32Array(this.nStops);
    this.trip = new Int32Array(this.nTrips);
  }

  firstDepAtOrAfter(day, t) {
    const { c, n } = this.days[day];
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m * W + 2] < t) lo = m + 1; else hi = m; }
    return lo;
  }

  // sources: [{stop, t, tag}]. Returns a snapshot {t, kind, pa, pb} (copied arrays).
  forward(day, sources, horizon = 3 * 3600) {
    const { c, n } = this.days[day];
    const T = this.t.fill(Infinity), K = this.kind.fill(NONE), PA = this.pa, PB = this.pb;
    const trip = this.trip.fill(-1);
    let t0 = Infinity;
    for (const s of sources) {
      if (s.t < T[s.stop]) { T[s.stop] = s.t; K[s.stop] = ACCESS; PA[s.stop] = s.tag ?? 0; PB[s.stop] = 0; }
      t0 = Math.min(t0, s.t);
    }
    const tEnd = t0 + horizon, buf = this.transferBuffer, fo = this.fpOut;
    for (let i = this.firstDepAtOrAfter(day, t0); i < n; i++) {
      const o = i * W, dep = c[o + 2];
      if (dep > tEnd) break;
      const tr = c[o + 4], ds = c[o];
      if (trip[tr] < 0) {
        const ready = T[ds] + (K[ds] === RIDE ? buf : 0);
        if (ready > dep) continue;
        trip[tr] = i;
      }
      const as = c[o + 1], arr = c[o + 3];
      if (arr < T[as]) {
        T[as] = arr; K[as] = RIDE; PA[as] = trip[tr]; PB[as] = i;
        for (let e = fo.off[as]; e < fo.off[as + 1]; e++) {
          const to = fo.other[e], ta = arr + fo.dur[e];
          if (ta < T[to]) { T[to] = ta; K[to] = FOOT; PA[to] = as; PB[to] = fo.dur[e]; }
        }
      }
    }
    return { t: T.slice(), kind: K.slice(), pa: PA.slice(), pb: PB.slice(), day };
  }

  // sinks: [{stop, t}] where t is the latest time you may be at that stop.
  backward(day, sinks, horizon = 3 * 3600) {
    const { c, n } = this.days[day];
    const T = this.t.fill(-Infinity), K = this.kind.fill(NONE), PA = this.pa, PB = this.pb;
    const trip = this.trip.fill(-1);
    let t1 = -Infinity;
    for (const s of sinks) {
      if (s.t > T[s.stop]) { T[s.stop] = s.t; K[s.stop] = ACCESS; PA[s.stop] = s.tag ?? 0; PB[s.stop] = 0; }
      t1 = Math.max(t1, s.t);
    }
    const tStart = t1 - horizon, buf = this.transferBuffer, fi = this.fpIn;
    // last connection departing at or before t1
    let i = this.firstDepAtOrAfter(day, t1 + 1) - 1;
    for (; i >= 0; i--) {
      const o = i * W, dep = c[o + 2];
      if (dep < tStart) break;
      const tr = c[o + 4], as = c[o + 1], arr = c[o + 3];
      if (trip[tr] < 0) {
        const need = T[as] - (K[as] === RIDE ? buf : 0);
        if (arr > need) continue;
        trip[tr] = i; // exit connection of this trip
      }
      const ds = c[o];
      if (dep > T[ds]) {
        T[ds] = dep; K[ds] = RIDE; PA[ds] = i; PB[ds] = trip[tr];
        for (let e = fi.off[ds]; e < fi.off[ds + 1]; e++) {
          const from = fi.other[e], td = dep - fi.dur[e];
          if (td > T[from]) { T[from] = td; K[from] = FOOT; PA[from] = ds; PB[from] = fi.dur[e]; }
        }
      }
    }
    return { t: T.slice(), kind: K.slice(), pa: PA.slice(), pb: PB.slice(), day };
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

  // Legs from the access stop to `stop` in a forward snapshot.
  legsForward(snap, stop) {
    const legs = [];
    let s = stop, guard = 0;
    while (snap.kind[s] !== ACCESS && guard++ < 64) {
      if (snap.kind[s] === RIDE) {
        const leg = this.rideLeg(snap.day, snap.pa[s], snap.pb[s]);
        legs.push(leg); s = leg.from;
      } else if (snap.kind[s] === FOOT) {
        legs.push({ type: 'transfer', from: snap.pa[s], to: s, dur: snap.pb[s],
          fromName: this.stops[snap.pa[s]].name, toName: this.stops[s].name });
        s = snap.pa[s];
      } else return null;
    }
    return { accessStop: s, accessTag: snap.pa[s], legs: legs.reverse() };
  }

  // Legs from `stop` to the sink stop in a backward snapshot.
  legsBackward(snap, stop) {
    const legs = [];
    let s = stop, guard = 0;
    while (snap.kind[s] !== ACCESS && guard++ < 64) {
      if (snap.kind[s] === RIDE) {
        const leg = this.rideLeg(snap.day, snap.pa[s], snap.pb[s]);
        legs.push(leg); s = leg.to;
      } else if (snap.kind[s] === FOOT) {
        legs.push({ type: 'transfer', from: s, to: snap.pa[s], dur: snap.pb[s],
          fromName: this.stops[s].name, toName: this.stops[snap.pa[s]].name });
        s = snap.pa[s];
      } else return null;
    }
    return { sinkStop: s, sinkTag: snap.pa[s], legs };
  }
}
