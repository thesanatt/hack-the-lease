// Records the backup demo video: a real browser walks the demo path at 1280x720 with a caption bar,
// then ffmpeg turns the recording into an MP4 that plays on Mac and Windows.
//   cd scripts/record && npm install && npx playwright install chromium && node record.mjs
// Output: docs/backup/quorum_demo_backup.mp4 (repo root relative)
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..', '..');
const dist = path.join(app, 'web', 'dist');
const outDir = path.join(app, 'docs', 'backup');
const tmp = path.join(here, '.video');
const PORT = 4191;
const W = 1280, H = 720;

const server = spawn(process.execPath, [path.join(dist, 'serve.mjs'), dist, String(PORT)], { stdio: 'ignore' });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  await new Promise((r) => setTimeout(r, 800));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: tmp, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const caption = (text) => page.evaluate((t) => {
    let el = document.getElementById('rec-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rec-caption';
      Object.assign(el.style, {
        position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '99999', padding: '12px 24px',
        background: 'rgba(27,27,24,0.92)', color: '#f5f2ea', font: '500 18px/1.35 "IBM Plex Sans", system-ui, sans-serif',
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  const wait = (s) => page.waitForTimeout(s * 1000);
  const click = async (name, opts = {}) => {
    const loc = page.getByRole(opts.role || 'button', { name, exact: !!opts.exact }).first();
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 4000 });
      await loc.click({ timeout: 4000 });
      return true;
    } catch {
      log('could not click', String(name));
      return false;
    }
  };
  // Switch tabs through the address hash (the same thing the left rail does), then wait for the view.
  const rail = async (name) => {
    await page.evaluate((h) => { window.location.hash = h; }, name.toLowerCase());
    await page.waitForTimeout(1500);
  };
  const scrollTo = async (text) => {
    try { await page.getByText(text, { exact: false }).first().scrollIntoViewIfNeeded({ timeout: 4000 }); } catch { log('no text', String(text)); }
  };

  const jump = (name) => click(name, { exact: true });

  log('pitch slide 1');
  await page.goto(`http://localhost:${PORT}/#pitch`);
  await wait(4);
  await page.keyboard.press('Home');
  await caption('The problem. "10 minutes from campus" depends on which campus, which mode and what hour. Computed live from the TheRide and U-M timetables.');
  await wait(9);

  log('me: verdict');
  await rail('Me');
  await wait(2);
  await caption('Me mode. Jordan (fictional) studies engineering on North Campus and has a late lab. Every home is scored on that week, door to door.');
  await wait(6);
  await caption('The verdict card: the best home for this week, with pros and cons in dollars a month against the middle home.');
  await wait(7);
  try { await page.locator('.vd select').selectOption({ label: '7. Georgetown Blvd house, 5 bed' }); } catch { log('no verdict select'); }
  await caption('The same notes for the cheapest listing. Twice a week there is no way home within Jordan\'s 10 minute walking limit at night.');
  await wait(8);

  log('me: map playback');
  await click(/Show on map/);
  await wait(1.5);
  await caption('That trip on the map: the bus follows its real route shape, walks follow OpenStreetMap streets. Play runs the clock door to door.');
  await click(/Play this trip|Step through this trip/);
  await wait(7.5);

  log('me: calendar import');
  await jump('Your week');
  await click(/Import a calendar file or paste your schedule/);
  try { await page.getByLabel(/Use this to build my week/).check({ timeout: 3000 }); } catch { log('no consent box'); }
  await caption('A week can come from a calendar file. Nothing is read until the box is ticked, and nothing leaves the browser.');
  await wait(4);
  await click(/Use the sample file/);
  await wait(1.5);
  await caption('The SYNTHETIC sample file: rooms are matched to real campus buildings. One it cannot match is flagged, not guessed.');
  await wait(8);
  await click('Discard', { exact: true });

  log('me: picks and ranking');
  await jump('Picks');
  await caption('Which week would you rather live? Each question is the one whose answer teaches the model the most.');
  await wait(6);
  await click(/Auto-answer until done/);
  await caption('The answers here come from Jordan\'s demo values. After a few picks the model knows what Jordan\'s time is worth, with a range.');
  await wait(6);
  await jump('Ranking');
  await caption('Ranking across 24 possible fall weeks and 200 preference draws: expected regret, chance of being best, and all-in cost per month.');
  await wait(8);
  await click(/Move late lab to Central/);
  await caption('What if the late lab moves to Central Campus? The ranking changes, and the screen says by how much.');
  await wait(8);

  log('group');
  await page.evaluate(() => window.scrollTo(0, 0));
  await rail('Group');
  await wait(3);
  await jump('House ranking');
  await caption('Group mode. Five friends, one house. Each room and rent share is set so nobody would swap, under every private cap.');
  await wait(8);
  await jump('Envy matrix');
  await caption('The certificate: a separate checker confirms nobody would rather have another room at its price.');
  await wait(6);
  await jump('Tours');
  await caption('When can all five see the house? Every weekday half-hour is checked against each week and the real buses. Only Friday works.');
  await wait(9);
  await caption('Quorum drafts the note for the SAMPLE listing contact, with no names, rents or caps. It never sends anything.');
  await wait(6);
  await jump('Two moves');
  await click(/Lower the cap/);
  await caption('One member privately lowers her cap. No fair split fits the top house any more, so the group moves. Nobody sees her number.');
  await wait(9);

  log('operator');
  await page.evaluate(() => window.scrollTo(0, 0));
  await rail('Operator');
  await wait(3);
  await caption('Operator view. Where to act across all 30 SYNTHETIC homes: who each home fits and which rooms sit furthest from a fair rent.');
  await wait(8);
  await jump('Room by room');
  await caption('Typical fair rent for each room of an irregular house, across 200 synthetic groups, next to the asking rents.');
  await wait(8);
  await jump('Half bath');
  await caption('The renovation lever. The bath value is an assumption on the slider. At the same house rent, an upgrade moves money between rooms.');
  await wait(8);

  log('pitch slides 4 and 5');
  await page.evaluate(() => window.scrollTo(0, 0));
  await rail('Pitch');
  await wait(2);
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await caption('How it works: our own transit router, question picker and fair-split solver. No LLM and no outside services at runtime.');
  await wait(8);
  await page.keyboard.press('ArrowRight');
  await caption('Evidence: the router checked against an independent reference and against r5py, the split against published cases.');
  await wait(8);
  await caption('All homes, rents and people are synthetic. Timetables, streets and campus places are real.');
  await wait(5);

  const video = page.video();
  await ctx.close();
  await browser.close();
  const webm = await video.path();
  const mp4 = path.join(outDir, 'quorum_demo_backup.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24',
    '-preset', 'veryfast', '-movflags', '+faststart', mp4]);
  log('wrote', mp4);
  if (errors.length) log('page errors:', errors.slice(0, 5));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  server.kill();
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});
