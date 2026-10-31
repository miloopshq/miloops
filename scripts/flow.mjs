// Screenshots for the end-to-end user flow doc (flow-NN-*.png). Needs a dev server on an empty tracker.
// Usage: node scripts/flow.mjs [outDir] [url] [terminalTranscript.txt]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] ?? 'capture');
const url = process.argv[3] ?? 'http://localhost:5173/';
const transcript = process.argv[4] ? fs.readFileSync(process.argv[4], 'utf8') : '';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const wait = (ms) => page.waitForTimeout(ms);
let n = 0;
const shot = async (name) => {
  const file = path.join(outDir, `flow-${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('screenshot', file);
};

// 1. Install: the real terminal transcript.
if (transcript) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await page.setContent(
    `<body style="margin:0;background:#06090b;display:flex;align-items:center;justify-content:center;height:100vh">
      <pre style="width:1100px;background:#0b1114;color:#b6c8cb;border:1px solid rgba(132,182,194,.18);font:15px/1.6 ui-monospace,monospace;padding:28px 32px;border-radius:8px;white-space:pre-wrap">${esc(transcript).replace(/^(\$ .*)$/gm, '<b style="color:rgb(132,182,194)">$1</b>')}</pre>
    </body>`,
  );
  await shot('install');
  if (process.env.ONLY === 'install') {
    await browser.close();
    process.exit(0);
  }
}

// 2–3. First launch shows onboarding.
await page.goto(url);
await page.locator('.dialog.onboarding').waitFor();
await wait(1200);
await shot('first-launch');
await page.locator('.choice', { hasText: 'Full transcript' }).click();
await wait(500);
await shot('onboarding-choices');
await page.getByRole('button', { name: 'Get started' }).click();
await wait(1500);

// 4. Empty tracker.
await shot('empty-tracker');

// 5. New mission dialog, filled in.
await page.getByRole('button', { name: 'New mission' }).click();
await page.locator('.dialog').waitFor();
await page.locator('.dialog textarea').nth(1).fill('Admins asked for this in the Q3 survey. Must work with existing SSO.');
await wait(600);
await shot('new-mission');
await page.locator('.dialog footer .btn.primary').click();

// 6. Charting: tickets appear, research subagents claim theirs.
await page.locator('.node').nth(3).waitFor({ timeout: 20000 });
await wait(9000);
await shot('first-tickets');

// 7. Dispatch an agent on the HITL grilling ticket; it asks a question.
await page.locator('.node', { hasText: 'Who is the primary' }).click();
await wait(800);
await page.locator('.inspector').getByRole('button', { name: 'Dispatch agent' }).click();
await page.locator('.inbox-list li').first().waitFor({ timeout: 20000 });
await wait(1500);
await shot('waiting-on-you');

// 8. Answer in the inbox conversation.
const chip = () => page.locator('.comms .suggest .chip').first();
await chip().click();
await wait(400);
await page.locator('.comms .suggest .chip').first().waitFor({ timeout: 15000 });
const box = page.locator('.comms-input textarea');
await box.click();
await box.pressSequentially('Losing access mid-meeting. Role changes must apply within a minute.', { delay: 20 });
await box.press('Enter');
await page.locator('.comms .suggest .chip').first().waitFor({ timeout: 15000 });
await wait(600);
await chip().click();
await page.locator('.msg-text', { hasText: 'Draft resolution' }).waitFor({ timeout: 15000 });
await wait(1000);
await shot('answer');

// 9. Record it: the ticket closes and the decision lands in the plan.
await chip().click();
await page.locator('.comms .status', { hasText: 'Resolved' }).waitFor({ timeout: 20000 });
await wait(1500);
await page.locator('.sections .tab', { hasText: 'Decisions' }).click();
await page.locator('.node', { hasText: 'Who is the primary' }).click();
await wait(1200);
await shot('decided');

await browser.close();
