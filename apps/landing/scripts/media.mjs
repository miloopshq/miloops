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
const ctx = await browser.newContext({ viewport: size });
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
  await page.screenshot({ path: join(media, `${name}.png`) });
  console.log('saved', `${name}.png`);
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
    };
    const pct = (v, d) => +((v / d) * 100).toFixed(1);
    return Object.fromEntries(
      Object.entries(sel).map(([k, s]) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return [
          k,
          r &&
            `--x:${pct(r.left, innerWidth)};--y:${pct(r.top, innerHeight)};--w:${pct(r.width, innerWidth)};--h:${pct(r.height, innerHeight)}`,
        ];
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
await shot('flow-05-new-mission');
await page.locator('.dialog footer .btn.primary').click();
await page.locator('.node').nth(3).waitFor({ timeout: 20000 });
await wait(9000);
await shot('flow-06-first-tickets');

await page.locator('.mission-btn').click();
await wait(1500);
await shot('command-center-missions');
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
await shot('flow-07-waiting-on-you');

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

await page.locator('.briefing-btn').click();
await page.locator('.bf-tile').first().waitFor({ timeout: 10000 });
await wait(2500);
await shot('command-center-briefing');
await wait(1500);
await page.getByRole('button', { name: 'Dismiss' }).click();
await wait(800);

await page.locator('.decisions-btn').click();
await page.locator('.dv-row').first().waitFor({ timeout: 10000 });
await hideUnshipped();
await page.locator('.dv-row', { hasText: 'silent auto-merge' }).first().click();
await wait(1500);
await hideUnshipped();
await shot('command-center-decisions');
await wait(3000);
await page.locator('.decisions-btn').click();
await wait(1500);

// Phone view of the same live session (simulated sessions run in the page that started them).
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
await wait(2500);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(media, 'command-center-phone.png'), Buffer.from(data, 'base64'));
console.log('saved command-center-phone.png');
await ctx.close();

await browser.close();
