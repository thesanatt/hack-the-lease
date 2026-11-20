// Zero-dependency static server for the built app (Node 18+).
//   cd web && npm run build && node dist/serve.mjs          (serves dist on http://localhost:4173)
//   node serve.mjs [dir] [port]                              (from web/, serves ./dist by default)
// Fallback without Node:  cd web/dist && python -m http.server 4173
// Everything is served from this one origin; the app makes no other network requests.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const argDir = process.argv[2];
const root = path.resolve(argDir || (existsSync(path.join(here, 'index.html')) ? here : path.join(here, 'dist')));
const port = Number(process.argv[3] || process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.geojson': 'application/geo+json',
  '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

const server = createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
  const st = statSync(file);
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': st.size,
    'cache-control': 'no-cache',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});

server.listen(port, () => console.log(`Quorum: serving ${root} at http://localhost:${port}`));
