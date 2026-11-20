import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import '@fontsource/source-serif-4/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/tokens.css';
import './styles/app.css';

// If the build changed while this page was open, a view's file has a new name and fails to load.
// Reload once (Vite's documented vite:preloadError hook) instead of showing a blank page.
window.addEventListener('vite:preloadError', (event) => {
  let tried = false;
  try { tried = sessionStorage.getItem('quorum-reloaded') === '1'; sessionStorage.setItem('quorum-reloaded', '1'); } catch { /* storage blocked */ }
  if (!tried) { event.preventDefault(); window.location.reload(); }
});
// Allow another one-time reload only after the page has been stable for 10 s, so a truly missing file
// cannot cause a reload loop.
window.addEventListener('load', () => setTimeout(() => {
  try { sessionStorage.removeItem('quorum-reloaded'); } catch { /* storage blocked */ }
}, 10000));
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
