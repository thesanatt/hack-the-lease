// Zero-dependency static server for the built app (Node 18+).
//   cd web && npm run build && node dist/serve.mjs          (serves dist on http://localhost:4173)
//   node serve.mjs [dir] [port]                              (from web/, serves ./dist by default)
// Fallback without Node:  cd web/dist && python -m http.server 4173
// Everything is served from this one origin. /api/* (api.mjs) is the only part that calls out: Gemini and Resend,
// and only when their keys are set in web/.env. Without keys the app is fully offline as before.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleApi, loadEnv } from './api.mjs';

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

loadEnv(here);

const server = createServer(async (req, res) => {
  if (req.url.startsWith('/api/') && await handleApi(req, res)) return;
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

// If the port is taken (often Quorum itself, started twice), say so in plain words and try the next one.
// One 'listening' handler reads the port actually bound, so a failed attempt never prints a wrong address.
let onError = null;
server.on('listening', () => {
  if (onError) server.off('error', onError);
  console.log(`Quorum: serving ${root} at http://localhost:${server.address().port}`);
});
function start(p, triesLeft) {
  onError = (e) => {
    if (e.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`Port ${p} is busy (Quorum may already be running at http://localhost:${p}). Trying ${p + 1}.`);
      start(p + 1, triesLeft - 1);
    } else {
      console.error(`Quorum could not start: ${e.message}`);
      process.exit(1);
    }
  };
  server.once('error', onError);
  server.listen(p);
}
start(port, 10);
