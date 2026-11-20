// Load the built data artifacts. `get(path)` returns an ArrayBuffer for .bin files and parsed
// JSON otherwise; the browser passes a fetch-based getter, Node passes a file-based one.

import { Streets } from './graph.js';
import { Timetable } from './transit.js';
import { Planner } from './plan.js';

export async function loadAll(get) {
  const meta = await get('transit/meta.json');
  const files = [...new Set(Object.values(meta.days).map((d) => d.file))];
  const bufs = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await get(`transit/${f}`)])));
  const connBuffers = Object.fromEntries(Object.entries(meta.days).map(([day, d]) => [day, bufs[d.file]]));
  const [nodes, walk, bike, places] = await Promise.all([
    get('streets/walk_nodes.bin'), get('streets/walk_csr.bin'), get('streets/bike_csr.bin'), get('places.json'),
  ]);
  const streets = new Streets(nodes, walk, bike);
  const tt = new Timetable(meta, connBuffers);
  const planner = new Planner(streets, tt);
  return { meta, streets, tt, planner, places };
}

export function browserGetter(base = './data/') {
  return async (path) => {
    const r = await fetch(base + path);
    if (!r.ok) throw new Error(`load failed: ${path} (${r.status})`);
    return path.endsWith('.bin') ? r.arrayBuffer() : r.json();
  };
}
