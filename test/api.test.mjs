// web/api.mjs: model output parsing and the prompt (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, extractPrompt } from '../web/api.mjs';
import { parseSchedule } from '../engine/ics.js';
import { readFile } from 'node:fs/promises';

test('parseModelJson takes fenced or bare JSON and drops junk', () => {
  assert.deepEqual(parseModelJson('```json\n{"lines":["Lectures Mon Wed 9:00-10:30 EECS",""],"notes":["x"]}\n```'),
    { lines: ['Lectures Mon Wed 9:00-10:30 EECS'], notes: ['x'] });
  assert.deepEqual(parseModelJson('Sure! {"lines":["a"]} hope that helps'), { lines: ['a'], notes: [] });
  assert.equal(parseModelJson('no json here'), null);
});

test('lines in the prompt format go through the existing parser', async () => {
  const places = JSON.parse(await readFile(new URL('../web/public/data/places.json', import.meta.url)));
  const r = parseSchedule('Lectures Mon Wed Fri 9:00-10:30 EECS\nLate lab Tue Thu 19:00-23:30 Duderstadt Center', places);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items.map((i) => i.place), ['eecs', 'dude']);
  assert.match(extractPrompt(places), /Duderstadt Center/);
});

test('redactEmails hides addresses in provider errors; model list is deduped with GEMINI_MODEL first', async () => {
  const { redactEmails, geminiModels } = await import('../web/api.mjs');
  assert.equal(redactEmails('only to your own email address (someone@example.com). Verify'), 'only to your own email address ([account email]). Verify');
  const prev = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'gemini-flash-latest';
  const list = geminiModels();
  assert.equal(list[0], 'gemini-flash-latest');
  assert.equal(new Set(list).size, list.length);
  if (prev === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = prev;
});
