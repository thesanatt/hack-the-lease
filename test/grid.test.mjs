import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGrid, findBlocks, blockLines, hourOf } from '../engine/grid.js';
import { readProfile, normalizeScheduleText } from '../engine/profile.js';
import { readFileSync } from 'node:fs';

// A tiny week grid drawn in memory: five day columns, hours 8am to 5pm at 60 px, gray hour lines, two blocks.
function drawGrid() {
  const width = 700, height = 680, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (x0, y0, x1, y1, [r, g, b]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * width + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; } };
  for (let k = 0; k <= 9; k++) fill(80, 60 + k * 60, 690, 60 + k * 60, [210, 210, 210]);
  fill(82, 121, 199, 209, [110, 160, 255]);   // Mon 9:00 to 10:30
  fill(322, 121, 439, 209, [110, 160, 255]);  // Wed 9:00 to 10:30
  fill(442, 301, 559, 419, [255, 240, 20]);   // Thu 12:00 to 2:00
  const words = [];
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach((d, i) => words.push({ text: d, x0: 120 + i * 120, y0: 20, x1: 160 + i * 120, y1: 36 }));
  for (let h = 8; h <= 17; h++) words.push({ text: `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`, x0: 10, y0: 60 + (h - 8) * 60 + 8, x1: 50, y1: 60 + (h - 8) * 60 + 24 });
  return { img: { width, height, data }, words };
}

test('grid: columns, time scale and blocks from a week calendar', () => {
  const { img, words } = drawGrid();
  const grid = findGrid(img, words);
  assert.deepEqual(grid.days.map((d) => d.day), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.ok(Math.abs(grid.rowPx - 60) < 1);
  const blocks = findBlocks(img, grid);
  assert.deepEqual(blocks.map((b) => [b.day, b.start, b.end]), [['mon', '09:00', '10:30'], ['wed', '09:00', '10:30'], ['thu', '12:00', '14:00']]);
  blocks[0].text = 'EECS280 - LEC\n(001)'; blocks[1].text = 'EECS280- LEC (001)'; blocks[2].text = 'MATH214 - MID\n(999)';
  assert.deepEqual(blockLines(blocks), ['EECS 280 LEC MoWe 9:00AM - 10:30AM'], 'exams are left out');
});

test('grid: hour labels as read, misreads included', () => {
  assert.equal(hourOf('1lam'), 11);
  assert.equal(hourOf('12pm'), 12);
  assert.equal(hourOf('12am'), 0);
  assert.equal(hourOf('6 PM'), 18);
  assert.equal(hourOf('Mon'), null);
});

test('grid: the lines it writes read back as classes', () => {
  const places = JSON.parse(readFileSync(new URL('../web/public/data/places.json', import.meta.url)));
  const p = readProfile(normalizeScheduleText('Class schedule (read from a week calendar)\nEECS 280 LEC MoWe 12:00PM - 1:30PM\nCLCIV 371 DIS TuTh 4:00PM - 5:00PM'), { places, personas: [] });
  assert.deepEqual(p.entries.map((e) => [e.label, e.days.join(''), e.start, e.end]),
    [['EECS 280', 'monwed', '12:00', '13:30'], ['CLCIV 371 discussion', 'tuethu', '16:00', '17:00']]);
});
