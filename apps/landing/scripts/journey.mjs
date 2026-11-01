// Renders the hero video public/media/landing-journey-720.mp4 (and its poster): "a day with MILOOPS".
// The command center is the real app, driven live; terminal and Claude Code scenes, chapter labels and
// captions are an overlay in the same page (journey/stage.mjs). Frames come from a CDP screencast and
// are encoded with ffmpeg (needed on PATH).
// Start the command center on an empty local tracker first, as for `npm run media`:
//   rm -rf /tmp/fieldnote-app && MILOOPS_DIR=/tmp/fieldnote-app/.miloops npm run dev   # repo root
// Env: CC_URL (default http://localhost:5173/), CHROME_PATH (default /usr/local/bin/google-chrome).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { AGAIN, CHECK_IN, FRAME, RESUME, SETUP } from './journey/scenes.mjs';
import { installStage } from './journey/stage.mjs';
import { realChrome, simClick } from './lib/realChrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const media = join(root, 'public/media');
const framesDir = join(root, 'capture-frames');
const size = { width: 1680, height: 945 };
const url = new URL(process.env.CC_URL ?? 'http://localhost:5173/');
url.searchParams.set('simulate', '');
const milo = `data:image/png;base64,${readFileSync(join(root, '../../brand/slack-icon-512.png')).toString('base64')}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' });
const page = await (await browser.newContext({ viewport: size })).newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.addInitScript(installStage, milo);
const wait = (ms) => page.waitForTimeout(ms);
const stage = (fn, ...args) => page.evaluate(([f, a]) => window.__stage[f](...a), [fn, args]);
const caption = (label, text) => stage('caption', label, text);
const term = async (title, lines, label, text) => {
  await caption(label, text);
  await stage('term', title, lines);
};
const chip = () => page.locator('.comms .suggest .chip').first();
const setVisible = (v) =>
  page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);

// Pre-roll (not recorded): onboard, load the sample mission, let agents run while "away".
await realChrome(page);
// A briefing needs time away: shrink the away threshold so coming back after the run opens one.
await page.addInitScript(() => {
  const key = 'miloops.prefs';
  const prefs = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(key, JSON.stringify({ ...prefs, briefing: { enabled: true, awayMinutes: 0.05 } }));
});
await page.goto(url.href);
await page.locator('.dialog.onboarding').waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'Get started' }).click();
await page.getByRole('button', { name: 'Load sample mission' }).click();
await page.locator('.node').first().waitFor({ timeout: 15000 });
await simClick(page, '.command-bar .toggle');
await setVisible(false);
await stage('card', 'title');

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, ts: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: size.width, maxHeight: size.height });

await wait(2800);
await term('fieldnote-app — zsh', SETUP, 'Setup once', 'Install once. One command connects Claude Code or Codex.');
await term(
  'fieldnote-app — claude',
  FRAME,
  'New project · frame the mission',
  'Type your idea in Claude Code. MILO asks a few questions to frame the mission.',
);

// New mission in the command center, charted live.
await stage('hide');
await caption('New project · command center', 'Or start it here. Describe the mission and MILO charts it.');
await wait(900);
await page.locator('.mission-btn').click();
await wait(600);
await page.getByRole('menuitem', { name: '+ New mission' }).click();
const fields = page.locator('.dialog input[type="text"], .dialog input:not([type]), .dialog textarea');
await fields.nth(0).pressSequentially('Ship team workspaces', { delay: 35 });
await fields.nth(1).pressSequentially('Teams share notebooks with roles; admins manage members.', { delay: 22 });
await wait(700);
await page.locator('.dialog footer .btn.primary').click();
await caption('New project · mission map', 'MILO maps the mission. Open decisions wait for you.');
await page.locator('.node').nth(3).waitFor({ timeout: 20000 });
await wait(6500);
await page.screenshot({ path: join(framesDir, 'poster.png') });

// An agent asks; answer in the inbox.
await page.locator('.node', { hasText: 'Who is the primary' }).first().click();
await wait(500);
await simClick(page, '.inspector button', 'Dispatch agent');
await caption('During the day · an agent asks', 'When an agent needs you, its ticket turns red. Answer in the inbox.');
await page.locator('.inbox-list li button', { hasText: 'Who is the primary' }).first().click({ timeout: 20000 });
await chip().waitFor({ timeout: 20000 });
await wait(2400);
await chip().click();
await caption('Running', 'Specialists pick up every ticket that isn’t blocked.');
await wait(4200);

await term(
  'fieldnote-app — zsh',
  AGAIN,
  'Existing project · same command',
  'Come back later and run the same command.',
);
await stage('hide');
await setVisible(true);
await caption('Existing project · briefing', 'Back after a break? MILO briefs you on what’s done and what needs you.');
await wait(4500);
await page.getByRole('button', { name: 'Dismiss' }).click();
await page.locator('.decisions-btn').click();
await page.locator('.dv-row').first().click();
await caption('Existing project · decisions', 'Every answer is logged with its reasoning.');
await wait(4000);
await page.locator('.decisions-btn').click();

await term(
  'fieldnote-app — claude',
  RESUME,
  'Existing project · resume',
  'Resume, and work picks up where it left off.',
);
await term('fieldnote-app — claude', CHECK_IN, 'From Claude Code', 'Or check in with /milo status and /milo inbox.');
await stage('hide');
await caption('Every mission', 'Running several missions? Switch in one click.');
await wait(700);
await page.keyboard.press('Escape');
await page.locator('.mission-btn').click({ force: true });
await wait(2600);
await page.keyboard.press('Escape');
await caption('', '');
await stage('card', 'end');
await wait(3200);

await cdp.send('Page.stopScreencast');
const end = Date.now() / 1000;
await browser.close();

// Frames arrive on repaint; per-frame durations from their timestamps keep holds at real length.
const list = frames
  .map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.ts ?? end) - f.ts).toFixed(4)}`)
  .join('\n');
writeFileSync(join(framesDir, 'list.txt'), `${list}\nfile '${frames.at(-1).file}'\n`);
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
ff([
  ...['-f', 'concat', '-safe', '0', '-i', join(framesDir, 'list.txt')],
  ...['-vf', 'scale=1280:720:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22'],
  ...['-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(media, 'landing-journey-720.mp4')],
]);
ff([
  '-i',
  join(framesDir, 'poster.png'),
  '-vf',
  'scale=1280:720:flags=lanczos',
  join(media, 'landing-journey-poster.png'),
]);
rmSync(framesDir, { recursive: true, force: true });
console.log(`saved landing-journey-720.mp4 (${frames.length} frames) and landing-journey-poster.png`);
