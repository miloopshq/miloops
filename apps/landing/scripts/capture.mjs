// Captures landing screenshots and a scroll-through recording.
// Run `npm run build && npm run preview` first, then `npm run capture`.
// Env: LANDING_URL (default http://localhost:4173), CAPTURE_OUT (default capture),
//      CHROME_PATH (default /usr/local/bin/google-chrome). Needs ffmpeg on PATH for the video.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.LANDING_URL ?? 'http://localhost:4173';
const out = resolve(root, process.env.CAPTURE_OUT ?? 'capture');
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--no-sandbox'],
});

async function open(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const v = document.querySelector('video');
    if (v) {
      v.currentTime = 36;
      await v.play().catch(() => {});
    }
  });
  await sleep(1500);
  return page;
}

async function revealAll(page) {
  await page.addStyleTag({ content: '.reveal,.hero__title span{opacity:1!important;transform:none!important;transition:none!important}' });
  await page.evaluate(async () => {
    const imgs = [...document.images];
    imgs.forEach((img) => (img.loading = 'eager'));
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
  });
}

if (want('hero')) {
  const page = await open({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.screenshot({ path: join(out, 'landing-hero.png') });
  await page.close();
  console.log('landing-hero.png');
}

if (want('desktop')) {
  const page = await open({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await revealAll(page);
  await page.evaluate(() => document.querySelector('#nav')?.setAttribute('style', 'position:relative'));
  await sleep(300);
  await page.screenshot({ path: join(out, 'landing-desktop.png'), fullPage: true });
  await page.close();
  console.log('landing-desktop.png');
}

if (want('mobile')) {
  const page = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await revealAll(page);
  await page.evaluate(() => {
    document.querySelector('#nav')?.setAttribute('style', 'position:relative');
    document.querySelector('.zones__shot')?.setAttribute('style', 'position:relative;top:0');
  });
  await sleep(300);
  await page.screenshot({ path: join(out, 'landing-mobile.png'), fullPage: true });
  await page.close();
  console.log('landing-mobile.png');
}

if (want('video')) {
  const page = await open({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const framesDir = join(root, 'capture-frames');
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, ts: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
  await sleep(3500);

  const scrollTo = (selector, ms) =>
    page.evaluate(
      (sel, duration) =>
        new Promise((done) => {
          const el = sel === 'bottom' ? null : document.querySelector(sel);
          const startY = window.scrollY;
          const max = document.documentElement.scrollHeight - innerHeight;
          const target = el ? Math.min(max, el.getBoundingClientRect().top + startY - 72) : max;
          const t0 = performance.now();
          const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
          const step = (now) => {
            const t = Math.min(1, (now - t0) / duration);
            window.scrollTo(0, startY + (target - startY) * ease(t));
            t < 1 ? requestAnimationFrame(step) : done();
          };
          requestAnimationFrame(step);
        }),
      selector,
      ms,
    );

  await scrollTo('#why', 1800);
  await sleep(1600);
  await scrollTo('#how', 1600);
  await sleep(1200);
  await page.click('#tab-3');
  await sleep(1400);
  await page.click('#tab-4');
  await sleep(1400);
  await scrollTo('#zones', 1600);
  await sleep(800);
  for (const zone of ['inbox', 'mission', 'map', 'sessions']) {
    await page.hover(`.zones__list button[data-zone="${zone}"]`);
    await sleep(1000);
  }
  await scrollTo('#features', 1800);
  await sleep(2000);
  await scrollTo('.showcase', 1600);
  await sleep(1600);
  await scrollTo('#open-source', 2200);
  await sleep(2000);
  await scrollTo('#faq', 1600);
  await page.click('#faq details:nth-of-type(2) summary');
  await sleep(1600);
  await scrollTo('bottom', 1800);
  await sleep(2000);
  await cdp.send('Page.stopScreencast');
  const endTs = Date.now() / 1000;
  await page.close();

  // Frames arrive only on repaint; per-frame durations from CDP timestamps keep idle holds at real length.
  const list = frames
    .map((f, i) => {
      const next = frames[i + 1]?.ts ?? Math.max(f.ts + 0.5, endTs);
      return `file '${f.file}'\nduration ${Math.max(0.001, next - f.ts).toFixed(4)}`;
    })
    .join('\n');
  const listFile = join(framesDir, 'list.txt');
  writeFileSync(listFile, `${list}\nfile '${frames.at(-1).file}'\n`);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', 'fps=30,scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart',
    join(out, 'landing-demo.mp4'),
  ]);
  rmSync(framesDir, { recursive: true, force: true });
  console.log('landing-demo.mp4');
}

await browser.close();
