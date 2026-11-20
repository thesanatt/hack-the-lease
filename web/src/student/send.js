// Send the landlord message by email through /api/send (web/api.mjs, Resend). Only offered when the server says
// it has an email key (/api/status). With no server, no key, or any error, the student uses their own mail app.
// Error text shown on screen never contains an email address.

let statusP = null;
// true when this server can send email. Asked once per page load; any failure means false.
export function canSend(fetchFn = globalThis.fetch) {
  if (!statusP) {
    statusP = Promise.resolve()
      .then(() => fetchFn('/api/status'))
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => j?.send === true)
      .catch(() => false);
  }
  return statusP;
}
export const resetSendStatus = () => { statusP = null; };

export const redactEmails = (s) => String(s).replace(/[^\s@()<>"']+@[^\s@()<>"']+\.[A-Za-z]{2,}/g, '[email]');
export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

export function mailtoHref({ to = '', subject = '', body = '' }) {
  return `mailto:${encodeURIComponent(String(to).trim()).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// -> { ok: true } or { ok: false, note } where note is safe to show.
export async function sendEmail({ to, subject, body }, fetchFn = globalThis.fetch) {
  if (!validEmail(to)) return { ok: false, note: 'Enter one valid email address.' };
  try {
    const r = await fetchFn('/api/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: String(to).trim(), subject, text: body }),
    });
    if (r.ok) return { ok: true };
    const j = await r.json().catch(() => ({}));
    const msg = j?.error && r.status !== 404 && r.status !== 501 ? redactEmails(j.error) : 'Email sending is not set up here.';
    return { ok: false, note: `Not sent. ${msg}` };
  } catch {
    return { ok: false, note: 'Not sent. No connection to the server.' };
  }
}
