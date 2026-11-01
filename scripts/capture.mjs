// Scripted demo run: drives the UI, saves screenshots and a screen recording.
// Usage: node scripts/capture.mjs [outDir] [url]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = path.resolve(process.argv[2] ?? 'capture');
const url = process.argv[3] ?? 'http://localhost:5173/';
const size = { width: 1680, height: 945 };
fs.mkdirSync(outDir, { recursive: true });
const videoTmp = fs.mkdtempSync('/tmp/cc-video-');

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: videoTmp, size } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const wait = (ms, p = page) => p.waitForTimeout(ms);
const shot = async (name, p = page) => {
  const file = path.join(outDir, `${name}.png`);
  await p.screenshot({ path: file });
  console.log('screenshot', file);
};
const answer = async () => {
  const chip = page.locator('.comms .suggest .chip').first();
  await chip.waitFor({ timeout: 15000 });
  await wait(900);
  await chip.click();
};
const newMission = async (p, settle) => {
  await p.locator('.mission-btn').click();
  await wait(900, p);
  await p.getByRole('menuitem', { name: '+ New mission' }).click();
  await wait(900, p);
  await p.locator('.dialog footer .btn.primary').click();
  await wait(settle, p);
};

/** Outline every fixed zone with its name, for the layout diagram. */
const ZONES = [
  ['.header', '2 · Mission + destination'],
  ['.inbox .inbox-part', '1 · Waiting on you'],
  ['.inbox .comms', '1 · Answer'],
  ['.inbox .upnext', '3 · Up next'],
  ['.map-zone', '4 · Map'],
  ['.inspector', '5 · Ticket'],
  ['.step-zone', '6 · Current step + sessions'],
  ['.log-zone', '6 · Activity log'],
  ['.sections', '7 · Plan'],
];
const annotate = (zones) =>
  page.evaluate((zones) => {
    const layer = document.createElement('div');
    layer.id = 'zone-annotations';
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '100',
      pointerEvents: 'none',
      background: 'rgba(3,6,7,0.5)',
    });
    for (const [sel, name] of zones) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!r) continue;
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'absolute',
        left: `${r.left + 2}px`,
        top: `${r.top + 2}px`,
        width: `${r.width - 4}px`,
        height: `${r.height - 4}px`,
        border: '1.5px solid #4fd8e8',
        borderRadius: '6px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      });
      const tag = document.createElement('span');
      tag.textContent = name;
      Object.assign(tag.style, {
        background: '#4fd8e8',
        color: '#031417',
        font: '600 14px Inter, sans-serif',
        padding: '5px 12px',
        borderRadius: '4px',
      });
      box.appendChild(tag);
      layer.appendChild(box);
    }
    document.body.appendChild(layer);
  }, zones);

// Simulated agents (sample mission, Autopilot, Dispatch agent) only run with ?simulate outside the demo.
const withSimulate = new URL(url);
withSimulate.searchParams.set('simulate', '');
await page.goto(withSimulate.href);
await wait(1500);

// First run: onboarding. Keep local markdown, choose full HITL transcripts.
await page.locator('.dialog.onboarding').waitFor();
await wait(1200);
await page.locator('.choice', { hasText: 'Full transcript' }).click();
await wait(900);
await shot('command-center-onboarding');
await page.getByRole('button', { name: 'Get started' }).click();
await wait(1500);

// Empty markdown tracker: load the sample mission through the adapter.
await page.getByRole('button', { name: 'Load sample mission' }).click();
await page.locator('.node').first().waitFor({ timeout: 15000 });
await wait(800);
await page.getByRole('button', { name: /Autopilot/ }).click();

// A parallel HITL session is already waiting on the operator; it lands in the inbox.
await page.locator('.inbox-list li').first().waitFor({ timeout: 20000 });
await wait(5000);
await shot('command-center-overview');

await annotate(ZONES);
await wait(300);
await shot('command-center-layout-zones');
await wait(2500);
await page.evaluate(() => document.getElementById('zone-annotations')?.remove());

// A second mission from the switcher. The first mission's question stays in the inbox, tagged.
await newMission(page, 15000);
await shot('command-center-chart-new-map');
await page.locator('.mission-btn').click();
await wait(1200);
await shot('command-center-missions');
await page.keyboard.press('Escape');
await wait(600);

// Answer the other mission's question without leaving this one.
await page.locator('.inbox-list li button').first().click();
await answer();
await wait(1200);
const box = page.locator('.comms-input textarea');
await page.locator('.comms .suggest .chip').first().waitFor({ timeout: 15000 });
await box.click();
await box.pressSequentially('Conflicts go to a review queue; deletions always surface.', { delay: 28 });
await wait(400);
await box.press('Enter');
await answer();
await page.locator('.msg-text', { hasText: 'Draft resolution' }).waitFor({ timeout: 15000 });
await wait(1200);
await shot('command-center-hitl-conversation');
await page.locator('.comms .suggest .chip').first().click();
await page.locator('.comms .status', { hasText: 'Resolved' }).waitFor({ timeout: 20000 });
await wait(1500);

// Back to the sample mission: the transcript is on the ticket (full mode).
await page.locator('.mission-btn').click();
await wait(700);
await page.locator('.mission-item', { hasText: 'Offline-first' }).click();
await wait(1200);
await page.locator('.node', { hasText: 'silent auto-merge' }).click();
await wait(1000);
await page
  .locator('.inspector details.comments summary')
  .click()
  .catch(() => {});
await wait(2500);

// Promote a not-yet-specified item into an execute ticket.
await page.locator('.sections .list.unspecified li button').first().click();
await wait(900);
await page.locator('.inspector .chip', { hasText: /^execute$/ }).click();
await wait(600);
await page.locator('.inspector').getByRole('button', { name: 'Promote to ticket' }).click();
await wait(3000);

// Per-mission mode: plan-only parks execute tickets; switch back to the default.
await page.locator('.mode-chip').click();
await wait(2800);
await page.locator('.mode-chip').click();
await wait(1500);

// Settings, then the changelog tab.
await page.getByRole('button', { name: 'Settings' }).click();
await wait(1500);
await shot('command-center-settings');
await page.getByRole('tab', { name: 'Changelog' }).click();
await wait(1500);
await shot('command-center-changelog');
await page.keyboard.press('Escape');
await wait(1500);

await context.close();

const webm = fs.readdirSync(videoTmp).find((f) => f.endsWith('.webm'));
const mp4 = path.join(outDir, 'command-center-demo.mp4');
execFileSync('ffmpeg', [
  '-loglevel',
  'error',
  '-y',
  '-i',
  path.join(videoTmp, webm),
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '22',
  '-movflags',
  '+faststart',
  mp4,
]);
console.log('video', mp4);

// Responsive shots: demo tracker, two missions, one question waiting from the other mission.
const prefs = JSON.stringify({ onboarded: true, tracker: 'demo', hitlTranscript: 'summary' });
const demoUrl = new URL(url);
demoUrl.searchParams.set('tracker', 'demo');
demoUrl.searchParams.set('pace', '0.5');
const sizes = [
  ['command-center-wide', { viewport: { width: 1680, height: 945 } }],
  ['command-center-laptop', { viewport: { width: 1280, height: 800 } }],
  [
    'command-center-phone',
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ],
];
await Promise.all(
  sizes.map(async ([name, opts]) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript((p) => localStorage.setItem('miloops.prefs', p), prefs);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log(name, 'pageerror:', e.message));
    await p.goto(demoUrl.toString());
    await p.locator('.inbox-list li').first().waitFor({ timeout: 20000 });
    await newMission(p, 9000);
    if (name !== 'command-center-phone') await p.locator('.node').nth(1).click();
    await wait(1500, p);
    await shot(name, p);
    await ctx.close();
  }),
);
await browser.close();
