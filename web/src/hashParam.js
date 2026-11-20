// Deep links: "#me?who=maya", "#listings?who=maya", "#next?plan=cs".
// The part before "?" picks the view (App.jsx). hashParam reads one value from the part after it.

// Split a hash like "#me?who=maya" into { view: 'me', query: 'who=maya' }.
export function splitHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  const i = h.indexOf('?');
  return i < 0 ? { view: h, query: '' } : { view: h.slice(0, i), query: h.slice(i + 1) };
}

// One query value from a hash, or null when it is missing or empty.
export function paramFromHash(hash, name) {
  const { query } = splitHash(hash);
  if (!query) return null;
  try {
    const v = new URLSearchParams(query).get(name);
    return v ? v : null;
  } catch {
    return null;
  }
}

// One query value from the current page's hash, or null. Safe outside a browser.
export function hashParam(name) {
  if (typeof window === 'undefined' || !window.location) return null;
  return paramFromHash(window.location.hash, name);
}

// The id from the hash if it names one of the items, else the fallback. Use it for initial state:
//   useState(() => pickFromHash('who', personas, personas[0]?.id))
export function pickFromHash(name, items, fallback) {
  const v = hashParam(name);
  return v && (items || []).some((it) => it && it.id === v) ? v : fallback;
}
