// Vercel Functions for the live site. Same logic as web/api.mjs (used by serve.mjs locally).
// Keys come from Vercel project env vars: GEMINI_API_KEY, RESEND_API_KEY (optional GEMINI_MODEL, RESEND_FROM).
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
export function post(fn) {
  return async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"POST only"}'); return; }
    try { const [c, o] = await fn(await body(req)); res.statusCode = c; res.end(JSON.stringify(o)); }
    catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })); }
  };
}
