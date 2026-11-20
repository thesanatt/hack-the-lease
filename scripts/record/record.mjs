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

  // Waits until the Next year hero shows a price that contains `text` and nothing is computing.
  const nxReady = async (text) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const ok = await page.evaluate((t) => (document.querySelector('.nx-big')?.textContent || '').includes(t) && !document.querySelector('.nx-hero.is-busy'), text);
      if (ok) return true;
      await page.waitForTimeout(100);
    }
    log('Next year price did not show', text);
    return false;
  };

  log('pitch slide 1');
  await page.goto(`http://localhost:${PORT}/#pitch`);
  await wait(4);
  await key('Home');
  await caption('The problem. "10 minutes from campus" depends on which campus and what hour. Computed live from TheRide and U-M timetables.');
  await wait(7);
  await caption("And the lease is signed before the student knows where next year's classes will be.");
  await wait(5);

  log('next year: nursing');
  await tab('Next year');
  await nxReady('$31');
  await caption('Next year. A sample Nursing junior: clinical section, one course and a maybe job are still unknown. 200 possible weeks from a sample class catalog.');
  await wait(7);
  await caption('Each week is routed through all 30 homes on the real buses. Not knowing costs her $31 a month, plus or minus $11.');
  await wait(6);
  await caption('The home that loses least: Catherine St, $1,164 to $1,511 a month across the weeks, the best in 66% of them.');
  await wait(6);
  // Put the bars at the top of the screen (the heading alone is already in view at 1280x720).
  await page.evaluate(() => { const el = document.getElementById('nx-first'); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' }); });
  await wait(1);
  await caption('What to find out first: her PNE 350 clinical section is worth $23 a month to know, the job $22. Her lectures are worth $0.');
  await wait(7);
  await click('104, Medical Campus, Tue 2:00 PM', { exact: true });
  await nxReady('$23');
  await caption('Settle it: say her clinical is section 104, the late shift. Now the job is the one thing left to ask about, $22 a month.');
  await wait(6);
  await key('Home');
  await caption('The home that loses least changes to Broadway St, $1,184 to $1,624 a month. The map renumbers.');
  await wait(6);

  log('next year: cs');
  await click('CS junior', { exact: true });
  await nxReady('Under $1');
  await caption('A sample CS junior, with maybe a research lab job on North Campus. Here not knowing costs under $1 a month.');
  await wait(6);
  await caption('Catherine St is the best in 96% of the possible weeks. The answer flips: sign now, nothing is worth finding out first.');
  await wait(5);
  await caption('A student can load their own Registrar file. It never leaves the browser.');
  await wait(7);

  log('you: top 3');
  await tab('You');
  await wait(2);
  await caption('Once the week is known, the You tab ranks every home for it. Jordan (fictional) has a lab until 11:30 PM twice a week.');
  await wait(6);
  await caption('Top pick Broadway St: $1,351 a month once time and late nights count.');
  await wait(5);

  log('you: cheapest rent on the chart');
  await key('End');
  await scrollTo('The cheapest rent, rooms from');
  await caption('The cheapest rent, Georgetown Blvd, rooms from $821, costs Jordan $187 a month more.');
  await wait(5);
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
  await caption("Georgetown at night: bus 22, then an 11 minute walk in the dark, over Jordan's 10 minute limit.");
  await click(/Play this trip|Step through this trip/);
  await wait(8.5);

  log('group');
  await tab('Your group');
  await wait(2);
  await caption('Five fictional friends, one house. Each gets a room, and the $4,150 rent is split so nobody would swap. A separate checker confirms it.');
  await wait(8);
  await click('Lower a cap', { exact: true });
  await caption('Priya privately lowers her cap. Broadway no longer fits, so the group moves to Georgetown. Only Priya sees her $25 gap.');
  await wait(9);

  log('pitch evidence');
  await tab('Pitch');
  await key('End');
  await key('ArrowLeft');
  await key('ArrowLeft');
  await wait(1);
  await caption('Evidence: the router matches a separate router on 3,000 of 3,000 trips; the split is envy-free on 2,000 of 2,000 random houses.');
  await wait(8);
  await caption('The class catalog, homes, rents and people are samples. Timetables, streets and campus places are real.');
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
