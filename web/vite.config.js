// Vite config for the Quorum web app.
// - base './' so web/dist works from any folder or a USB stick.
// - fs.allow '..' so web/src can import ../../engine/*.js (the shared engine).
// - The Content-Security-Policy meta tag in index.html is kept in the build and removed in dev,
//   because the dev server needs an inline React refresh preamble and a websocket.
// - serve.mjs is copied into dist so `node dist/serve.mjs` serves the build with no dependencies.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function devCsp() {
  return {
    name: 'quorum-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    },
  };
}

function copyServer() {
  return {
    name: 'quorum-copy-server',
    apply: 'build',
    closeBundle() {
      copyFileSync(path.join(here, 'serve.mjs'), path.join(here, 'dist', 'serve.mjs'));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), devCsp(), copyServer()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
});
