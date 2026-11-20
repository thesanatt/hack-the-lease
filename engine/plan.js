// Door-to-door trip planning on top of the street graph and the timetable.
// A "point" is any place: a candidate home, a campus building, a job, a dropped pin.
// Each trip query is answered for every home at once (one CSA scan per trip).

import { ACCESS } from './transit.js';

export const DEFAULTS = {
  walkMs: 1.3,          // walking speed, m/s (assumption)
  bikeMs: 4.2,          // cycling speed, m/s, about 15 km/h (assumption)
  bikeOverheadS: 120,   // unlock, lock and park a bike (assumption)
  maxAccessM: 1300,     // furthest walk to or from a bus stop considered, meters
  searchM: 9000,        // Dijkstra radius per point
};

export class Planner {
  constructor(streets, timetable, opts = {}) {
    this.S = streets;
    this.TT = timetable;
    this.o = { ...DEFAULTS, ...opts };
    const snap = timetable.meta.stop_snap;
    this.stopNode = Int32Array.from(snap, (s) => s[0]);
    this.stopSnapM = Float64Array.from(snap, (s) => s[1]);
    this.points = new Map();
  }

  addPoint(id, lat, lon) {
    if (this.points.has(id)) return this.points.get(id);
    const { node, dist: snapM } = this.S.nearest(lat, lon);
    const { dist, parent } = this.S.dijkstra(node, 'walk', this.o.searchM);
    const p = { id, lat, lon, node, snapM, walk: Float32Array.from(dist), walkParent: parent, bike: null };
    // stops reachable on foot within maxAccessM
    p.access = [];
    for (let s = 0; s < this.stopNode.length; s++) {
      const m = snapM + p.walk[this.stopNode[s]] + this.stopSnapM[s];
      if (m <= this.o.maxAccessM) p.access.push({ stop: s, m, sec: Math.round(m / this.o.walkMs) });
    }
    this.points.set(id, p);
    return p;
  }

  removePoint(id) { this.points.delete(id); }

  walkM(a, b) {
    const pa = this.points.get(a), pb = this.points.get(b);
    return pa.snapM + pa.walk[pb.node] + pb.snapM;
  }

  walkSec(a, b) { return Math.round(this.walkM(a, b) / this.o.walkMs); }

  bikeSnap(p) {
    if (p.bikeNode === undefined) {
      const { node, dist } = this.S.nearest(p.lat, p.lon, 'bike');
      p.bikeNode = node; p.bikeSnapM = dist;
    }
    return p;
  }

  bikeSec(a, b) {
    const pa = this.bikeSnap(this.points.get(a)), pb = this.bikeSnap(this.points.get(b));
    if (!pa.bike) {
      const { dist, parent } = this.S.dijkstra(pa.bikeNode, 'bike', this.o.searchM);
      pa.bike = Float32Array.from(dist);
      pa.bikeParent = parent;
    }
    const m = pa.bike[pb.bikeNode];
    if (!Number.isFinite(m)) return Infinity;
    // the bike is walked between the door and the nearest bikeable street
    return Math.round(m / this.o.bikeMs + (pa.bikeSnapM + pb.bikeSnapM) / this.o.walkMs + this.o.bikeOverheadS);
  }

  // Arrive at `place` by `deadline` (seconds of service day), from every home.
  // Returns Map homeId -> {walk, bike, transit} each {depart, arrive, sec} or null.
  arriveBy(day, placeId, deadline, homeIds) {
    const place = this.points.get(placeId);
    const sinks = place.access.map((a) => ({ stop: a.stop, t: deadline - a.sec, tag: a.stop }));
    const snap = this.TT.backward(day, sinks);
    const out = new Map();
    for (const h of homeIds) {
      const home = this.points.get(h);
      let best = -Infinity, bestStop = -1, bestAccess = 0;
      for (const a of home.access) {
        const td = snap.t[a.stop] - a.sec;
        if (td > best) { best = td; bestStop = a.stop; bestAccess = a.sec; }
      }
      const w = this.walkSec(h, placeId), b = this.bikeSec(h, placeId);
      const r = {
        walk: { depart: deadline - w, arrive: deadline, sec: w },
        bike: Number.isFinite(b) ? { depart: deadline - b, arrive: deadline, sec: b } : null,
        transit: null,
      };
      if (bestStop >= 0 && best > -Infinity && snap.kind[bestStop] !== ACCESS) {
        r.transit = { depart: best, arrive: deadline, sec: deadline - best, firstStop: bestStop, accessSec: bestAccess, snap };
      }
      out.set(h, r);
    }
    return out;
  }

  // Leave `place` at time t, to every home.
  leaveAt(day, placeId, t, homeIds) {
    const place = this.points.get(placeId);
    const sources = place.access.map((a) => ({ stop: a.stop, t: t + a.sec, tag: a.stop }));
    const snap = this.TT.forward(day, sources);
    const out = new Map();
    for (const h of homeIds) {
      const home = this.points.get(h);
      let best = Infinity, bestStop = -1, bestEgress = 0;
      for (const a of home.access) {
        const ta = snap.t[a.stop] + a.sec;
        if (ta < best) { best = ta; bestStop = a.stop; bestEgress = a.sec; }
      }
      const w = this.walkSec(placeId, h), b = this.bikeSec(placeId, h);
      const r = {
        walk: { depart: t, arrive: t + w, sec: w },
        bike: Number.isFinite(b) ? { depart: t, arrive: t + b, sec: b } : null,
        transit: null,
      };
      if (bestStop >= 0 && best < Infinity && snap.kind[bestStop] !== ACCESS) {
        r.transit = { depart: t, arrive: best, sec: best - t, lastStop: bestStop, egressSec: bestEgress, snap };
      }
      out.set(h, r);
    }
    return out;
  }

  // Full leg list for one transit option, for the trip explainer and the animation.
  // Re-runs a single-origin forward scan from the actual departure so the legs are the
  // earliest-arrival journey (the backward scan only fixes the latest departure time).
  legs(day, fromId, toId, departT) {
    const from = this.points.get(fromId), to = this.points.get(toId);
    const sources = from.access.map((a) => ({ stop: a.stop, t: departT + a.sec, tag: a.stop }));
    const snap = this.TT.forward(day, sources);
    let best = Infinity, bestStop = -1, egress = 0;
    for (const a of to.access) {
      const ta = snap.t[a.stop] + a.sec;
      if (ta < best) { best = ta; bestStop = a.stop; egress = a.sec; }
    }
    if (bestStop < 0 || snap.kind[bestStop] === ACCESS) return null;
    const j = this.TT.legsForward(snap, bestStop);
    if (!j) return null;
    const first = from.access.find((a) => a.stop === j.accessStop);
    const out = [];
    out.push({ type: 'walk', from: fromId, toStop: j.accessStop, dep: departT, arr: departT + first.sec, sec: first.sec,
      toName: this.TT.stops[j.accessStop].name });
    let clock = departT + first.sec;
    for (const leg of j.legs) {
      if (leg.type === 'ride') {
        if (leg.dep > clock) out.push({ type: 'wait', at: leg.from, atName: leg.fromName, dep: clock, arr: leg.dep, sec: leg.dep - clock });
        out.push({ ...leg, sec: leg.arr - leg.dep });
        clock = leg.arr;
      } else {
        out.push({ ...leg, type: 'transfer', dep: clock, arr: clock + leg.dur, sec: leg.dur });
        clock += leg.dur;
      }
    }
    out.push({ type: 'walk', fromStop: bestStop, to: toId, dep: clock, arr: clock + egress, sec: egress,
      fromName: this.TT.stops[bestStop].name });
    return { depart: departT, arrive: clock + egress, legs: out };
  }

  // Street path coordinates between two points (for drawing walks and bike rides).
  pathCoords(fromId, toId, mode = 'walk') {
    const pa = this.points.get(fromId), pb = this.points.get(toId);
    if (mode === 'bike') {
      this.bikeSec(fromId, toId);
      return this.S.path(pa.bikeParent, pb.bikeNode);
    }
    return this.S.path(pa.walkParent, pb.node);
  }
}
