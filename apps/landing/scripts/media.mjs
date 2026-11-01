// Re-captures the command-center screenshots in public/media/ from the real app, on a real project: the dev
// seed in a temp folder, the built `miloops` server, and real MCP agents working it (lib/realProject.mjs).
// Run: npm run build -w miloops (once), then `npm run media` here.
// Env: CHROME_PATH (default /usr/local/bin/google-chrome).
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { realProject } from './lib/realProject.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const media = join(root, 'public/media');
const project = await realProject();
// Always end the server and agents and delete the temp project, even when a step fails.
process.on('exit', () => project.stop());
const size = { width: 1680, height: 945 };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' });
// 2x pixels so the zoomed crops stay sharp; full-app shots are saved at 1x.
const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
const page = await ctx.newPage();
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

const setVisible = (v) =>
  page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);

const shot = async (name) => {
  await page.screenshot({ path: join(media, `${name}.png`), scale: 'css' });
  console.log('saved', `${name}.png`);
};

/**
 * Close-up of the part a landing section talks about: the union of `sels` plus padding,
 * widened or heightened to `aspect` (w/h) around its center, kept inside the viewport. Saved at 2x.
 */
const zoom = async (name, sels, { aspect = 4 / 3, pad = 16 } = {}) => {
  const boxes = await Promise.all(sels.map((s) => page.locator(s).first().boundingBox()));
  let x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  let y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  let x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  let y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  const grow = (a0, a1, len, max) => {
    const c = (a0 + a1) / 2;
    const lo = Math.min(Math.max(0, c - len / 2), max - len);
    return [Math.max(0, lo), Math.min(max, Math.max(0, lo) + len)];
  };
  const vp = page.viewportSize();
  if ((x1 - x0) / (y1 - y0) < aspect) [x0, x1] = grow(x0, x1, (y1 - y0) * aspect, vp.width);
  else [y0, y1] = grow(y0, y1, (x1 - x0) / aspect, vp.height);
  [x0, y0] = [Math.max(0, x0), Math.max(0, y0)];
  [x1, y1] = [Math.min(vp.width, x1), Math.min(vp.height, y1)];
  const clip = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  await page.screenshot({ path: join(media, `${name}.png`), clip });
  console.log('saved', `${name}.png`, `${clip.width * 2}x${clip.height * 2}`);
};

/** Waits until the agents' output shows `text` (e.g. "asking:"), counting occurrences. */
const agentStep = async (text, times = 1) => {
  for (let t = 0; t < 240; t++) {
    if (project.agentLog().split(text).length - 1 >= times) return;
    await wait(500);
  }
  throw new Error(`agents never reached "${text}"\n${project.agentLog()}`);
};

// A briefing needs time away: a short away threshold, then the tab hidden while the agents work.
await page.addInitScript(() => {
  if (sessionStorage.getItem('capture-init')) return;
  sessionStorage.setItem('capture-init', '1');
  const key = 'miloops.prefs';
  const prefs = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(key, JSON.stringify({ ...prefs, briefing: { enabled: true, awayMinutes: 0.05 } }));
});
await page.goto(project.url);
await page.locator('.dialog.onboarding').waitFor({ timeout: 20000 });
await wait(800);
await page.getByRole('button', { name: 'Get started' }).click();
await page.locator('.node').first().waitFor({ timeout: 15000 });
await setVisible(false);
await agentStep('asking:');
await agentStep('closed #');
await wait(4000);

await setVisible(true);
await page.locator('.bf-tile').first().waitFor({ timeout: 10000 });
await wait(2500);
// Top of the briefing: MILO's summary and the stat tiles.
await zoom('command-center-briefing', ['.dialog.briefing h2', '.dialog.briefing .bf-tiles'], {
  aspect: 16 / 10,
  pad: 24,
});
await page.getByRole('button', { name: 'Dismiss' }).click();
// Back to the normal away threshold, so the briefing stays closed for the rest of the run.
await page.evaluate(() => {
  const prefs = JSON.parse(localStorage.getItem('miloops.prefs') || '{}');
  localStorage.setItem('miloops.prefs', JSON.stringify({ ...prefs, briefing: { enabled: true, awayMinutes: 15 } }));
});
await page.reload();
await page.locator('.node').first().waitFor({ timeout: 15000 });
await wait(1500);

await page.locator('.node', { hasText: 'silent auto-merge' }).first().click();
await wait(1500);
await shot('command-center-overview');
await zoom('flow-06-first-tickets', ['.map-zone'], { aspect: 16 / 10 });

await page.locator('.mission-btn').click();
await wait(1200);
await zoom('command-center-missions', ['.mission-btn', '.mission-menu'], { aspect: 16 / 10, pad: 48 });
await page.getByRole('menuitem', { name: '+ New mission' }).click();
await page.locator('.dialog').waitFor();
const fields = page.locator('.dialog input, .dialog textarea');
await fields.nth(0).fill('Ship team workspaces');
await fields.nth(1).fill('Teams share notebooks with roles, and admins manage members without contacting support.');
await fields
  .nth(2)
  .pressSequentially('Admins asked for this in the Q3 survey. Must work with existing SSO.', { delay: 18 });
await wait(600);
await zoom('flow-05-new-mission', ['.dialog'], { aspect: 16 / 10 });
await page.keyboard.press('Escape');
await wait(600);

await page.locator('.inbox-list li button').first().click();
await chip().waitFor({ timeout: 20000 });
await wait(1500);
await zoom('flow-07-waiting-on-you', ['.inbox .comms'], { aspect: 16 / 10 });
await chip().click();
await agentStep('asking:', 2);
await page.locator('.inbox-list li button').first().click();
await chip().waitFor({ timeout: 20000 });
await wait(1500);
// A taller window shows the whole conversation with the suggested replies.
await page.setViewportSize({ ...size, height: 1200 });
await wait(800);
await zoom('command-center-hitl-conversation', ['.comms .msg.open-q', '.comms .suggest'], { aspect: 16 / 10 });
await page.setViewportSize(size);
await wait(500);

await page.locator('.decisions-btn').click();
await page.locator('.dv-row').first().waitFor({ timeout: 10000 });
await hideUnshipped();
await page.locator('.dv-row button').first().click();
await wait(1500);
await hideUnshipped();
// Top of the open decision: question, answer, facts and alternatives.
await zoom('command-center-decisions', ['.dv-detail .d-head', '.dv-detail .facts'], { aspect: 16 / 10 });
await page.locator('.decisions-btn').click();
await wait(1500);

// Phone view of the same project.
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
await wait(2500);
// Top half only: the header and the Waiting on you inbox.
const { data } = await cdp.send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 390, height: 430, scale: 1 },
});
writeFileSync(join(media, 'command-center-phone.png'), Buffer.from(data, 'base64'));
console.log('saved command-center-phone.png');
await ctx.close();
await browser.close();
process.exit(0);
