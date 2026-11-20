import { loadAll } from '../engine/load.js';
import { nodeGetter } from '../engine/node-load.js';
const t0 = performance.now();
const { planner, places, tt } = await loadAll(nodeGetter());
const t1 = performance.now();
const P = Object.fromEntries(places.map((p) => [p.id, p]));
for (const id of ['ugli', 'pierpont', 'uh', 'dude', 'btc']) planner.addPoint(id, P[id].lat, P[id].lon);
const t2 = performance.now();
const hhmm = (s) => `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
function show(day, from, to, t) {
  const j = planner.legs(day, from, to, t);
  console.log(`\n${day} ${from} -> ${to} leave ${hhmm(t)}: arrive ${j ? hhmm(j.arrive) : 'none'} (${j ? Math.round((j.arrive - t) / 60) : '-'} min)`);
  if (j) for (const l of j.legs) console.log(`   ${l.type.padEnd(8)} ${hhmm(l.dep)}-${hhmm(l.arr)} ${l.route ? l.route + ' ' + l.headsign : ''} ${l.fromName ?? ''} -> ${l.toName ?? ''}`);
  console.log(`   walk only: ${Math.round(planner.walkSec(from, to) / 60)} min, bike: ${Math.round(planner.bikeSec(from, to) / 60)} min`);
}
const t3 = performance.now();
show('tue', 'ugli', 'pierpont', 10 * 3600);
show('tue', 'dude', 'ugli', 23.5 * 3600);
show('tue', 'ugli', 'uh', 6 * 3600);
show('sun', 'pierpont', 'btc', 9 * 3600);
const t4 = performance.now();
const reps = 50; const a = performance.now();
for (let i = 0; i < reps; i++) planner.leaveAt('tue', 'ugli', 8 * 3600 + i * 600, ['pierpont', 'uh', 'dude']);
const per = (performance.now() - a) / reps;
console.log(`\nload ${(t1 - t0).toFixed(0)} ms, 5 points ${(t2 - t1).toFixed(0)} ms, one-to-all scan ${per.toFixed(2)} ms`);
