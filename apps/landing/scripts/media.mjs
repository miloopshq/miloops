// Re-captures the command-center screenshots and the hero video in public/media/ from the real app.
// Start the command center on an empty local tracker first, e.g. from the repo root:
//   rm -rf /tmp/fieldnote-app && MILOOPS_DIR=/tmp/fieldnote-app/.miloops npm run dev
// then `npm run media` here. The folder name shows as the project name in the header.
// Env: CC_URL (default http://localhost:5173/), CHROME_PATH (default /usr/local/bin/google-chrome).
// Prints the "Fixed zones" overlay boxes (`--x/--y/--w/--h`) for index.html.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const media = join(root, 'public/media');
const url = process.env.CC_URL ?? 'http://localhost:5173/';
const size = { width: 1680, height: 945 };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' });
const videoDir = mkdtempSync(join(tmpdir(), 'landing-video-'));
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: videoDir, size } });
const page = await ctx.newPage();
const videoStart = Date.now();
page.on('pageerror', (e) => console.log('pageerror:', e.message));

const wait = (ms, p = page) => p.waitForTimeout(ms);
const chip = () => page.locator('.comms .suggest .chip').first();
/** Integrations still in progress keep an empty filter in Decisions; the landing doesn't show them. */
const hideUnshipped = () =>
  page.evaluate(() =>
    document.querySelectorAll('.dv-opt, .dv-filters option').forEach((el) => {
      if (/slack/i.test(el.textContent ?? '')) el.style.display = 'none';
    }),
  );

/** Caption for the hero video; hidden while a screenshot is taken. */
let captionText = '';
const setCaption = (text) =>
  page.evaluate((t) => {
    let el = document.getElementById('landing-caption');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'landing-caption' });
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '36px', transform: 'translateX(-50%)', zIndex: '1000', pointerEvents: 'none',
        background: 'rgba(5,9,11,0.94)', color: '#e6eef0', border: '1px solid rgba(132,182,194,0.4)',
        font: '500 26px Barlow, sans-serif', padding: '12px 22px', whiteSpace: 'nowrap',
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.display = t ? 'block' : 'none';
  }, text);
const caption = async (text) => {
  captionText = text;
  await setCaption(text);
};
const shot = async (name, p = page) => {
  if (p === page) await setCaption('');
  await p.screenshot({ path: join(media, `${name}.png`) });
  if (p === page) await setCaption(captionText);
  console.log('saved', `${name}.png`);
};

/** Overlay boxes for the landing's "Fixed zones" figure, as % of the viewport. */
const zoneBoxes = () =>
  page.evaluate(() => {
    const sel = { inbox: '.inbox', mission: '.h-title', map: '.map-zone', ticket: '.inspector', activity: '.log-zone', sessions: '.step-zone', plan: '.sections' };
    const pct = (v, d) => +((v / d) * 100).toFixed(1);
    return Object.fromEntries(
      Object.entries(sel).map(([k, s]) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return [k, r && `--x:${pct(r.left, innerWidth)};--y:${pct(r.top, innerHeight)};--w:${pct(r.width, innerWidth)};--h:${pct(r.height, innerHeight)}`];
      }),
    );
  });

await page.goto(url);
await page.locator('.dialog.onboarding').waitFor({ timeout: 20000 });
await wait(800);
await page.getByRole('button', { name: 'Get started' }).click();
await wait(1200);
await page.getByRole('button', { name: 'Load sample mission' }).click();
await page.locator('.node').first().waitFor({ timeout: 15000 });
await page.getByRole('button', { name: /Autopilot/ }).click();
await caption('Your agents work the mission live. Spend and tokens stay on screen.');
await page.locator('.inbox-list li').first().waitFor({ timeout: 30000 });
await wait(4000);
await page.locator('.node', { hasText: 'silent auto-merge' }).first().click();
await wait(1500);
await shot('command-center-overview');
console.log('zones', await zoneBoxes());

await caption('Start a new mission from one sentence.');
await page.locator('.mission-btn').click();
await wait(800);
await page.getByRole('menuitem', { name: '+ New mission' }).click();
await page.locator('.dialog').waitFor();
const fields = page.locator('.dialog input[type="text"], .dialog input:not([type]), .dialog textarea');
await fields.nth(0).fill('Ship team workspaces');
await fields.nth(1).fill('Teams can share notebooks with role-based access, and admins can manage members without contacting support.');
await fields.nth(2).pressSequentially('Admins asked for this in the Q3 survey. Must work with existing SSO.', { delay: 18 });
await wait(600);
await shot('flow-05-new-mission');
await page.locator('.dialog footer .btn.primary').click();
await caption('MILO charts the tickets. Agents start on whatever is ready.');
await page.locator('.node').nth(3).waitFor({ timeout: 20000 });
await wait(9000);
await shot('flow-06-first-tickets');

await caption('Run several missions at once. Switch in one click.');
await page.locator('.mission-btn').click();
await wait(1500);
await shot('command-center-missions');
await wait(1500);
await page.keyboard.press('Escape');
await wait(600);

await caption('An agent needs a call only you can make. It lands in Waiting on you.');
await page.locator('.node', { hasText: 'Who is the primary' }).first().click();
await wait(800);
await page.locator('.inspector').getByRole('button', { name: 'Dispatch agent' }).click();
await page.locator('.inbox-list li', { hasText: 'Who is the primary' }).first().waitFor({ timeout: 20000 });
await page.locator('.inbox-list li button', { hasText: 'Who is the primary' }).first().click();
await chip().waitFor({ timeout: 20000 });
await wait(1500);
await shot('flow-07-waiting-on-you');

await caption('Answer in your own words. The agent drafts the decision; you confirm it.');
await page.locator('.inbox-list li button', { hasText: 'silent auto-merge' }).first().click();
await chip().waitFor({ timeout: 20000 });
await wait(1000);
await chip().click();
await chip().waitFor({ timeout: 20000 });
await wait(800);
const box = page.locator('.comms-input textarea, .comms-input input').first();
await box.click();
await box.pressSequentially('Conflicts go to a review queue; deletions always surface.', { delay: 30 });
await box.press('Enter');
await chip().waitFor({ timeout: 20000 });
await wait(800);
await chip().click();
await page.locator('.msg-text', { hasText: 'Draft resolution' }).waitFor({ timeout: 20000 });
await wait(1500);
await shot('command-center-hitl-conversation');
await chip().click();
await page.locator('.comms .status', { hasText: 'Resolved' }).waitFor({ timeout: 20000 });
await wait(2500);

await caption('Back after a break? MILO briefs you: what’s done, what’s blocked, what needs you.');
await page.locator('.briefing-btn').click();
await page.locator('.bf-tile').first().waitFor({ timeout: 10000 });
await wait(2500);
await shot('command-center-briefing');
await wait(1500);
await page.getByRole('button', { name: 'Dismiss' }).click();
await wait(800);

await caption('Every decision is kept with its reasoning. Export it any time.');
await page.locator('.decisions-btn').click();
await page.locator('.dv-row').first().waitFor({ timeout: 10000 });
await hideUnshipped();
await page.locator('.dv-row', { hasText: 'silent auto-merge' }).first().click();
await wait(1500);
await hideUnshipped();
await shot('command-center-decisions');
await wait(3000);
await page.locator('.decisions-btn').click();
await caption('');
await wait(1500);
const videoEnd = (Date.now() - videoStart) / 1000;

// Phone view of the same live session (simulated sessions run in the page that started them).
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
await wait(2500);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(media, 'command-center-phone.png'), Buffer.from(data, 'base64'));
console.log('saved command-center-phone.png');
await ctx.close();

const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
execFileSync('ffmpeg', [
  '-v', 'error', '-y', '-ss', '2', '-to', videoEnd.toFixed(2), '-i', join(videoDir, webm),
  '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  join(media, 'landing-journey-720.mp4'),
]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '4', '-i', join(media, 'landing-journey-720.mp4'), '-frames:v', '1', join(media, 'landing-journey-poster.png')]);
rmSync(videoDir, { recursive: true, force: true });
console.log('saved landing-journey-720.mp4, landing-journey-poster.png');

await browser.close();
