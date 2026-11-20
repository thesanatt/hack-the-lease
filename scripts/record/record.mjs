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
  const scrollTo = async (text) => {
    try { await page.getByText(text, { exact: false }).first().scrollIntoViewIfNeeded({ timeout: 4000 }); } catch { log('no text', String(text)); }
  };

  const tab = async (name) => {
    try { await page.getByRole('link', { name, exact: true }).first().click({ timeout: 4000 }); } catch { log('no tab', name); }
    await page.waitForTimeout(1500);
  };
  const key = (k) => page.keyboard.press(k);

  log('pitch slide 1');
  await page.goto(`http://localhost:${PORT}/#pitch`);
  await wait(4);
  await key('Home');
  await caption('The problem. "10 minutes from campus" depends on which campus, which way and what hour. Computed live from the TheRide and U-M timetables.');
  await wait(9);

  log('you: top 3');
  await tab('You');
  await wait(2);
  await caption('Jordan (fictional) studies engineering on North Campus and has a late lab. Every home is run through that week, door to door.');
  await wait(6);
  await caption('Your top 3: cost to you a month, hours a week getting around, late nights, and one reason in dollars against a typical home.');
  await wait(7);

  log('you: cheapest rent on the chart');
  await key('End');
  await scrollTo('The cheapest rent costs you');
  await caption('Trade-offs: every home by cost to you and hours getting around. The square marks the cheapest rent, Georgetown Blvd.');
  await wait(6);
  try {
    const r = page.locator('.to-chart svg rect').first();
    await r.scrollIntoViewIfNeeded({ timeout: 3000 });
    const bb = await r.boundingBox();
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  } catch { log('no cheapest square'); }
  await wait(1);
  await key('Home');
  await wait(1);

  log('you: map playback');
  await caption('Georgetown: twice a week there is no way home within Jordan\'s 10 minute walking limit at night. Bus 22, then an 11 minute walk.');
  await click(/Play this trip|Step through this trip/);
  await wait(8.5);

  log('you: calendar import');
  await key('End');
  await click('Import a calendar', { exact: true });
  try { await page.getByLabel(/Use my calendar to build my week/).check({ timeout: 3000 }); } catch { log('no consent box'); }
  await caption('A week can come from a calendar file. Nothing is read until the box is ticked, and nothing leaves the browser.');
  await wait(4);
  await click('Use the sample week', { exact: true });
  await wait(1.5);
  await caption('The SYNTHETIC sample file: classes are matched to real campus buildings. One it cannot match waits for a place, not a guess.');
  await wait(8);
  await click('Discard', { exact: true });
  try { await page.locator('dialog[open]').getByRole('button', { name: 'Close' }).click({ timeout: 2000 }); } catch { log('no close'); }

  log('you: picks');
  await scrollTo('Teach it what you care about');
  await caption('Which week would you rather live? Each question is the one whose answer teaches the model the most.');
  await wait(6);
  await click(/This one: Washtenaw/);
  await wait(1);
  await click('Answer the rest', { exact: true });
  await caption('Jordan\'s demo values answer the rest. After a few picks the model knows about what Jordan\'s time is worth.');
  await wait(6);

  log('you: details');
  await key('Home');
  try { await page.locator('.you-details > summary').click({ timeout: 3000 }); } catch { log('no details'); }
  await wait(1);
  await scrollTo('chance Broadway St house');
  await caption('Details: Broadway is best in 74% of 24 possible weeks and 200 value draws. The cheapest rent, Georgetown, ranks 8th.');
  await wait(8);

  log('you: what if');
  await click('Late lab on Central', { exact: true });
  await wait(2);
  await key('Home');
  await caption('What if the late lab moves to Central Campus? A new top three, within $7 a month of each other. Broadway falls to ninth.');
  await wait(8);

  log('group');
  await tab('Your group');
  await wait(2);
  await caption('Five friends, one house. Each room and rent share is set so nobody would swap, under every private cap. A checker confirms it.');
  await wait(8);
  await scrollTo('Tour times');
  await caption('When can all five see the house? Every weekday half-hour is checked against each week and the real buses. Only Friday works.');
  await wait(8);
  await caption('Quorum drafts the note with no names, rents or caps. It never sends anything.');
  await wait(5);
  await key('Home');
  await click('Lower a cap', { exact: true });
  await caption('Priya privately lowers her cap. No fair split fits Broadway any more, so the group moves. Only Priya sees her $25 gap.');
  await wait(9);

  log('owners');
  await tab('Owners');
  await wait(2);
  await caption('Owners: each room\'s fair rent range from 200 sample groups, against the asking rent. At Church St the back room asks $12 too much.');
  await wait(8);
  await scrollTo('Add a half bath');
  await caption('A half bath in the basement moves $32 a month to that room from the others, at the same house rent. The bath value is an assumption.');
  await wait(8);

  log('pitch slides 4 and 5');
  await tab('Pitch');
  await key('Home');
  for (let i = 0; i < 3; i++) await key('ArrowRight');
  await caption('How it works: our own transit router, question picker and fair-split solver. No LLM and no outside services at runtime.');
  await wait(8);
  await key('ArrowRight');
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
