// web/api.mjs sendMail: refuses without a key or a valid address, and hides account emails in errors. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail, redactEmails } from '../web/api.mjs';

test('sendMail returns 501 with no RESEND_API_KEY, 400 for a bad address', async () => {
  const prev = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  assert.equal((await sendMail({ to: 'a@b.co' }))[0], 501);
  process.env.RESEND_API_KEY = 'test-not-a-key';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('no network in tests'); };
  try { assert.equal((await sendMail({ to: 'not an email' }))[0], 400); } finally { globalThis.fetch = realFetch; }
  if (prev === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = prev;
});

test('redactEmails hides addresses in provider errors', () => {
  assert.equal(redactEmails('only to your own email address (someone@example.com). Verify'), 'only to your own email address ([account email]). Verify');
});
