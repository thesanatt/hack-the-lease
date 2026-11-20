// tours.js tour dates (U-M Thanksgiving break) and send.js (Send by email, safe errors). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDate, dateLabel } from './tours.js';
import { canSend, resetSendStatus, sendEmail, redactEmails, mailtoHref } from './send.js';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const FRI = new Date(2026, 10, 20); // Fri Nov 20 2026, demo day

test('tour dates skip U-M Thanksgiving break (Wed Nov 25 to Sun Nov 29 2026), rolling to the next week', () => {
  assert.equal(ymd(nextDate('mon', FRI)), '2026-11-23');
  assert.equal(ymd(nextDate('tue', FRI)), '2026-11-24');
  assert.equal(ymd(nextDate('wed', FRI)), '2026-12-02');
  assert.equal(ymd(nextDate('thu', FRI)), '2026-12-03');
  assert.equal(ymd(nextDate('fri', FRI)), '2026-12-04');
  assert.equal(ymd(nextDate('sun', new Date(2026, 10, 23))), '2026-12-06');
  assert.equal(ymd(nextDate('mon', new Date(2026, 10, 24))), '2026-11-30');
  assert.equal(dateLabel(nextDate('wed', FRI)), 'Wednesday, Dec 2');
});

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('canSend is false without a server or key, true only when /api/status says send', async () => {
  resetSendStatus(); assert.equal(await canSend(async () => res(404, {})), false);
  resetSendStatus(); assert.equal(await canSend(async () => { throw new Error('offline'); }), false);
  resetSendStatus(); assert.equal(await canSend(async () => res(200, { send: false })), false);
  resetSendStatus(); assert.equal(await canSend(async () => res(200, { send: true })), true);
  resetSendStatus();
});

test('sendEmail posts once and never returns an email address in its note', async () => {
  let calls = 0;
  const ok = await sendEmail({ to: 'a@b.co', subject: 's', body: 'b' }, async (url, o) => { calls++; assert.equal(url, '/api/send'); assert.deepEqual(JSON.parse(o.body), { to: 'a@b.co', subject: 's', text: 'b' }); return res(200, { id: 'x' }); });
  assert.deepEqual(ok, { ok: true }); assert.equal(calls, 1);
  const bad = await sendEmail({ to: 'nope', subject: 's', body: 'b' }, async () => { throw new Error('should not call'); });
  assert.equal(bad.ok, false);
  const leak = await sendEmail({ to: 'a@b.co', subject: 's', body: 'b' }, async () => res(502, { error: 'Resend: only to owner@example.com' }));
  assert.equal(leak.ok, false); assert.doesNotMatch(leak.note, /@/);
  for (const s of [404, 501]) {
    const r = await sendEmail({ to: 'a@b.co', subject: 's', body: 'b' }, async () => res(s, { error: 'x@y.com' }));
    assert.equal(r.ok, false); assert.doesNotMatch(r.note, /@/);
  }
  const off = await sendEmail({ to: 'a@b.co', subject: 's', body: 'b' }, async () => { throw new Error('down'); });
  assert.equal(off.ok, false);
  assert.equal(redactEmails('to me@x.org now'), 'to [email] now');
  assert.match(mailtoHref({ to: 'a@b.co', subject: 'Hi there', body: 'x&y' }), /^mailto:a@b\.co\?subject=Hi%20there&body=x%26y$/);
});
