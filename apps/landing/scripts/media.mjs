// Re-captures the command-center screenshots in public/media/ from the real app.
// The hero video (landing-journey-720.mp4 + poster) is a separately rendered journey and is not touched here.
// Start the command center on an empty local tracker first, e.g. from the repo root:
//   rm -rf /tmp/fieldnote-app && MILOOPS_DIR=/tmp/fieldnote-app/.miloops npm run dev
// then `npm run media` here. The folder name shows as the project name in the header.
// Env: CC_URL (default http://localhost:5173/), CHROME_PATH (default /usr/local/bin/google-chrome).
// Prints the "Fixed zones" overlay boxes (`--x/--y/--w/--h`) for index.html.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const media = join(root, 'public/media');
const url = process.env.CC_URL ?? 'http://localhost:5173/';
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
  if ((x1 - x0) / (y1 - y0) < aspect) [x0, x1] = grow(x0, x1, (y1 - y0) * aspect, size.width);
  else [y0, y1] = grow(y0, y1, (x1 - x0) / aspect, size.height);
  [x0, y0] = [Math.max(0, x0), Math.max(0, y0)];
  [x1, y1] = [Math.min(size.width, x1), Math.min(size.height, y1)];
  const clip = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  await page.screenshot({ path: join(media, `${name}.png`), clip });
  console.log('saved', `${name}.png`, `${clip.width * 2}x${clip.height * 2}`);
};

/** Overlay boxes for the landing's "Fixed zones" figure, as % of the viewport. */
const zoneBoxes = () =>
  page.evaluate(() => {
    const sel = {
      inbox: '.inbox',
      mission: '.h-title',
      map: '.map-zone',
      ticket: '.inspector',
      activity: '.log-zone',
      sessions: '.step-zone',
      plan: '.sections',
      // A list of selectors is measured as one box around all of them.
      spend: ['.step-zone .sessions-head', '.step-zone .sessions-list'],
    };
    /** Boxes that scroll inside a panel are cut to that panel. */
    const within = { spend: '.step-zone' };
    const pct = (v, d) => +((v / d) * 100).toFixed(1);
    const box = (s, clip) => {
      const rs = [s].flat().map((x) => document.querySelector(x)?.getBoundingClientRect());
      if (rs.some((r) => !r)) return undefined;
      const c = (clip && document.querySelector(clip)?.getBoundingClientRect()) || {
        left: 0,
        top: 0,
        right: innerWidth,
        bottom: innerHeight,
      };
      const left = Math.max(c.left, Math.min(...rs.map((r) => r.left)));
      const top = Math.max(c.top, Math.min(...rs.map((r) => r.top)));
      const right = Math.min(c.right, Math.max(...rs.map((r) => r.right)));
      const bottom = Math.min(c.bottom, Math.max(...rs.map((r) => r.bottom)));
      return { left, top, width: right - left, height: bottom - top };
    };
    return Object.fromEntries(
      Object.entries(sel).map(([k, s]) => {
        const r = box(s, within[k]);
        return [
          k,
          r &&
            `--x:${pct(r.left, innerWidth)};--y:${pct(r.top, innerHeight)};--w:${pct(r.width, innerWidth)};--h:${pct(r.height, innerHeight)}`,
        ];
      }),
    );
  });

// Autopilot is hidden outside the demo tracker unless the URL opts in.
const withAutopilot = new URL(url);
withAutopilot.searchParams.set('autopilot', '');
await page.goto(withAutopilot.href);
await page.locator('.dialog.onboarding').waitFor({ timeout: 20000 });
await wait(800);
await page.getByRole('button', { name: 'Get started' }).click();
await wait(1200);
await page.getByRole('button', { name: 'Load sample mission' }).click();
await page.locator('.node').first().waitFor({ timeout: 15000 });
await page.getByRole('button', { name: /Autopilot/ }).click();
// Away from here on (tab hidden), so the Briefing button later covers everything the agents decided.
await setVisible(false);
await page.locator('.inbox-list li').first().waitFor({ timeout: 30000 });
await wait(4000);
await page.locator('.node', { hasText: 'silent auto-merge' }).first().click();
await wait(1500);
await shot('command-center-overview');
console.log('zones', await zoneBoxes());

await page.locator('.mission-btn').click();
await wait(800);
await page.getByRole('menuitem', { name: '+ New mission' }).click();
await page.locator('.dialog').waitFor();
const fields = page.locator('.dialog input[type="text"], .dialog input:not([type]), .dialog textarea');
await fields.nth(0).fill('Ship team workspaces');
await fields
  .nth(1)
  .fill('Teams can share notebooks with role-based access, and admins can manage members without contacting support.');
await fields
  .nth(2)
  .pressSequentially('Admins asked for this in the Q3 survey. Must work with existing SSO.', { delay: 18 });
await wait(600);
await zoom('flow-05-new-mission', ['.dialog'], { aspect: 16 / 10 });
await page.locator('.dialog footer .btn.primary').click();
await page.locator('.node').nth(3).waitFor({ timeout: 20000 });
await wait(9000);
await zoom('flow-06-first-tickets', ['.map-zone'], { aspect: 16 / 10 });

await page.locator('.mission-btn').click();
await wait(1500);
await zoom('command-center-missions', ['.mission-btn', '.mission-menu'], { aspect: 16 / 10, pad: 48 });
await wait(1500);
await page.keyboard.press('Escape');
await wait(600);

await page.locator('.node', { hasText: 'Who is the primary' }).first().click();
await wait(800);
await page.locator('.inspector').getByRole('button', { name: 'Dispatch agent' }).click();
await page.locator('.inbox-list li', { hasText: 'Who is the primary' }).first().waitFor({ timeout: 20000 });
await page.locator('.inbox-list li button', { hasText: 'Who is the primary' }).first().click();
await chip().waitFor({ timeout: 20000 });
await wait(1500);
await zoom('flow-07-waiting-on-you', ['.inbox .comms'], { aspect: 16 / 10 });

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
await zoom('command-center-hitl-conversation', ['.comms .msg.open-q', '.comms .suggest'], { aspect: 16 / 10 });
await chip().click();
await page.locator('.comms .status', { hasText: 'Resolved' }).waitFor({ timeout: 20000 });
await wait(2500);

await page.locator('.briefing-btn').click();
await page.locator('.bf-tile').first().waitFor({ timeout: 10000 });
await wait(2500);
// Top of the briefing: MILO's summary and the stat tiles.
await zoom('command-center-briefing', ['.dialog.briefing h2', '.dialog.briefing .bf-tiles'], {
  aspect: 16 / 10,
  pad: 24,
});
await wait(1500);
await page.getByRole('button', { name: 'Dismiss' }).click();
await wait(800);

await page.locator('.decisions-btn').click();
await page.locator('.dv-row').first().waitFor({ timeout: 10000 });
await hideUnshipped();
await page.locator('.dv-row', { hasText: 'silent auto-merge' }).first().click();
await wait(1500);
await hideUnshipped();
// Top of the open decision: question, answer, facts and alternatives.
await zoom('command-center-decisions', ['.dv-detail .d-head', '.dv-detail .dv-alts'], { aspect: 16 / 10 });
await wait(3000);
await page.locator('.decisions-btn').click();
await wait(1500);

// Phone view of the same live session (simulated sessions run in the page that started them).
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
