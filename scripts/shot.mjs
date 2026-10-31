// Quick screenshot helper: node scripts/shot.mjs <url> <out.png> [waitMs]
import { chromium } from 'playwright-core';

const [url = 'http://localhost:5173/', out = '/tmp/shot.png', wait = '6000'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1680), height: Number(process.env.H ?? 945) }, isMobile: !!process.env.MOBILE, hasTouch: !!process.env.MOBILE, deviceScaleFactor: Number(process.env.DPR ?? 1) });
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
if (!process.env.ONBOARD) await page.addInitScript(() => localStorage.setItem('miloops.prefs', JSON.stringify({ onboarded: true, tracker: 'demo', hitlTranscript: 'summary' })));
await page.goto(url);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
