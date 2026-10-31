// Builds nothing; run `npm run build` first. Serves dist/ and writes PNG captures + an MP4 demo loop.
// Usage: OUT_DIR=captures CHROME=/path/to/chrome [WORDMARK='MILO|OPS'] node tools/capture.mjs
// WORDMARK overrides the wordmark (text after `|` renders in the brand copper); the default is WORDMARK in preview/main.tsx.
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const font = (f) => createRequire(import.meta.url).resolve(`@fontsource/${f}`);
const WORDMARK = process.env.WORDMARK || readFileSync(new URL('../preview/main.tsx', import.meta.url), 'utf8').match(/^const WORDMARK = '(.+)';$/m)[1];
const wm = `&wordmark=${encodeURIComponent(WORDMARK)}`;
const [wmLead, wmOps = ''] = WORDMARK.split('|');
const OUT = resolve(process.env.OUT_DIR || 'captures');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4174, strictPort: true } });
const base = 'http://localhost:4174/';
const browser = await chromium.launch({ executablePath: CHROME });

async function still(view, file, extra = '') {
  const page = await browser.newPage({ viewport: { width: 1700, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}?view=${view}${extra}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.locator(`[data-capture="${view}"]`).screenshot({ path: join(OUT, file) });
  await page.close();
  console.log('wrote', join(OUT, file));
}

await still('options', 'milo-avatar-options.png');
await still('states', 'milo-avatar-states.png');

// Brand / social kit: exact pixel sizes at deviceScaleFactor 1 so the sprite stays nearest-neighbor crisp.
const BRAND = join(OUT, 'brand');
mkdirSync(BRAND, { recursive: true });
const KIT = [
  ['github-org-avatar.png', 'GitHub org avatar', 1000, 1000, 'square', '&n=1000'],
  ['github-social-preview.png', 'GitHub repo social preview', 1280, 640, 'banner', '&w=1280&h=640'],
  ['og-image-1200x630.png', 'Open Graph · miloops.app', 1200, 630, 'banner', '&w=1200&h=630&url=miloops.app'],
  ['x-header-1500x500.png', 'X header', 1500, 500, 'banner', '&w=1500&h=500&layout=header'],
  ['x-avatar-400.png', 'X avatar', 400, 400, 'square', '&n=400'],
  ['slack-icon-512.png', 'Slack app / workspace icon', 512, 512, 'square', '&n=512'],
  ['linkedin-discord-avatar-512.png', 'LinkedIn / Discord avatar', 512, 512, 'square', '&n=512'],
  ['favicon-64.png', 'Favicon 64', 64, 64, 'favicon', '&px=64'],
  ['favicon-32.png', 'Favicon 32', 32, 32, 'favicon', '&px=32'],
];
for (const [file, , w, h, view, extra] of KIT) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${base}?view=${view}${extra}${view === 'banner' ? wm : ''}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.locator(`[data-capture="${view}"]`).screenshot({ path: join(BRAND, file) });
  await page.close();
  console.log('wrote', join(BRAND, file));
}

// Contact sheet: every asset, plus small-size checks (downsampled, then shown 1x and zoomed nearest-neighbor).
{
  const img = (f) => 'data:image/png;base64,' + readFileSync(join(BRAND, f)).toString('base64');
  const tiles = KIT.map(([f, label, w, h]) => {
    const scale = Math.min(1, 560 / w, 300 / h);
    return `<figure><img src="${img(f)}" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px;${scale >= 1 ? 'image-rendering:pixelated;' : ''}"><figcaption><b>${label}</b> ${w}×${h}<br><span>brand/${f}</span></figcaption></figure>`;
  }).join('');
  const checks = [['slack-icon-512.png', 32, 'Slack 32px'], ['github-org-avatar.png', 40, 'GitHub 40px'], ['x-avatar-400.png', 48, 'X 48px'], ['favicon-32.png', 32, 'Favicon 32px'], ['favicon-64.png', 16, 'Tab 16px']]
    .map(([f, px, label]) => `<figure class="chk"><canvas data-src="${img(f)}" data-px="${px}"></canvas><figcaption><b>${label}</b> 1× and 4× zoom</figcaption></figure>`).join('');
  const page = await browser.newPage({ viewport: { width: 1840, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>
    @font-face{font-family:B;src:url(${'data:font/woff2;base64,' + readFileSync(font('barlow/files/barlow-latin-400-normal.woff2')).toString('base64')})}
    @font-face{font-family:M;src:url(${'data:font/woff2;base64,' + readFileSync(font('share-tech-mono/files/share-tech-mono-latin-400-normal.woff2')).toString('base64')})}
    body{margin:0;background:#04080a;color:#bfdfe3;font:13px B}
    #s{display:inline-block;padding:28px 32px}
    h1{margin:0 0 18px;font:20px M;letter-spacing:.18em;color:#e6f6f7} h1 b{font-weight:400;color:#c98b5e} h1 span{color:#5f7f84;font-size:13px}
    .g{display:flex;flex-wrap:wrap;gap:22px;width:1776px;align-items:flex-end}
    figure{margin:0;display:flex;flex-direction:column;gap:6px} img{display:block;border:1px solid rgba(110,215,228,.16)}
    figcaption{font:12px M;letter-spacing:.06em;color:#5f7f84} figcaption b{color:#e6f6f7;font-weight:400}
    h2{font:13px M;letter-spacing:.14em;color:#e6f6f7;margin:26px 0 12px;text-transform:uppercase}
    canvas{display:block} .row{display:flex;gap:30px;align-items:flex-end}
  </style><div id="s"><h1>${wmLead}<b>${wmOps}</b> <span>// SOCIAL KIT</span></h1><div class="g">${tiles}</div><h2>Small-size checks</h2><div class="row">${checks}</div></div>`);
  await page.evaluate(async () => {
    for (const c of document.querySelectorAll('canvas')) {
      const px = +c.dataset.px; const im = new Image(); im.src = c.dataset.src; await im.decode();
      const small = document.createElement('canvas'); small.width = small.height = px;
      const sx = small.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(im, 0, 0, px, px);
      c.width = px * 5 + 16; c.height = px * 4; const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
      cx.drawImage(small, 0, px * 3); cx.drawImage(small, px + 16, 0, px * 4, px * 4);
    }
  });
  await page.locator('#s').screenshot({ path: join(BRAND, 'social-kit-overview.png') });
  await page.close();
  console.log('wrote', join(BRAND, 'social-kit-overview.png'));
}

// Demo: record one full script loop, then trim the page-load lead-in.
const tmp = join(OUT, '.video-tmp');
rmSync(tmp, { recursive: true, force: true });
const size = { width: 1280, height: 620 };
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size } });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${base}?view=demo`);
// Recorded video ignores deviceScaleFactor, so zoom the page instead to keep the glyphs crisp.
await page.addStyleTag({ content: 'body { zoom: 1.4; }' });
await page.evaluate(() => document.fonts.ready);
const start = (Date.now() - t0) / 1000;
await page.waitForSelector('[data-capture="demo"][data-loop="1"]', { timeout: 60000 });
const end = (Date.now() - t0) / 1000;
await ctx.close();
const webm = join(tmp, readdirSync(tmp).find((f) => f.endsWith('.webm')));
const mp4 = join(OUT, 'milo-avatar-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start + 0.2), '-to', String(end), '-i', webm,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4 + '.tmp.mp4']);
renameSync(mp4 + '.tmp.mp4', mp4);
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', mp4, `(${(end - start).toFixed(1)}s)`);

await browser.close();
await new Promise((r) => server.httpServer.close(r));
