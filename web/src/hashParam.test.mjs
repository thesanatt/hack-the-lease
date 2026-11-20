import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitHash, paramFromHash, hashParam, pickFromHash } from './hashParam.js';

test('splitHash separates the view from the query', () => {
  assert.deepEqual(splitHash('#me?who=maya'), { view: 'me', query: 'who=maya' });
  assert.deepEqual(splitHash('#next'), { view: 'next', query: '' });
  assert.deepEqual(splitHash(''), { view: '', query: '' });
  assert.deepEqual(splitHash(undefined), { view: '', query: '' });
});

test('paramFromHash reads one value and returns null when missing', () => {
  assert.equal(paramFromHash('#me?who=maya', 'who'), 'maya');
  assert.equal(paramFromHash('#next?plan=cs&x=1', 'plan'), 'cs');
  assert.equal(paramFromHash('#me', 'who'), null);
  assert.equal(paramFromHash('#me?who=', 'who'), null);
  assert.equal(paramFromHash('#me?plan=cs', 'who'), null);
});

test('hashParam and pickFromHash use window.location.hash', () => {
  const had = 'window' in globalThis;
  const old = globalThis.window;
  try {
    globalThis.window = { location: { hash: '#me?who=priya' } };
    assert.equal(hashParam('who'), 'priya');
    const items = [{ id: 'jordan' }, { id: 'priya' }];
    assert.equal(pickFromHash('who', items, 'jordan'), 'priya');
    globalThis.window = { location: { hash: '#me?who=nobody' } };
    assert.equal(pickFromHash('who', items, 'jordan'), 'jordan');
    delete globalThis.window;
    assert.equal(hashParam('who'), null);
  } finally {
    if (had) globalThis.window = old; else delete globalThis.window;
  }
});
