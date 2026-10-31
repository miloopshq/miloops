// Renders the MILO robot concept sheet and the merch mock sheet (exploration only, not the component).
// Usage: OUT_DIR=captures CHROME=/path/to/chrome node tools/robot-concepts.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(process.env.OUT_DIR || 'out');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
const TOP = (process.env.TOP || 'nut,bubble').split(',');

// B body, O accent (status light), E feature (dark in colour, a hole in one-colour), K outline (auto), R alert only.
const INK = '#13222a';
const PAL = { B: '#8fb2be', O: '#c98b5e', E: INK, K: INK, R: '#ff4d42' };
const MONO = (c) => ({ B: c, O: c, R: c });

// Each grid is at most 14×14 so the 1px outline lands on a 16×16 canvas.
// Patches are [row, col, str]: a key sets that pixel, '.' keeps it, '-' clears it.
const CONCEPTS = [
  {
    id: 'dispatch', name: 'Dispatch', pitch: 'Operator head with headphones. The orange ear cups are the status light.',
    grid: [
      '....BBBBBB....',
      '...B......B...',
      '..B..BBBB..B..',
      '..B.BBBBBB.B..',
      '.OOBBBBBBBBOO.',
      '.OOBBBBBBBBOO.',
      '.OOBEEBBEEBOO.',
      '.OOBEEBBEEBOO.',
      '.OOBBBBBBBBOO.',
      '.OOBBBBBBBBOO.',
      '.B.BBBEEBBB...',
      '..B.BBBBBB....',
      '...BOO........',
    ],
    states: {
      speaking: [[10, 5, 'EEEE'], [11, 6, 'EE']],
      thinking: [[5, 4, 'EE..EE'], [7, 4, 'BB..BB']],
      alert: [[5, 4, 'EE..EE']],
    },
  },
  {
    id: 'bubble', name: 'Bubble', pitch: 'The head is a speech bubble. When thinking it becomes the typing dots.',
    grid: [
      '......OO......',
      '......BB......',
      '..BBBBBBBBBB..',
      '.BBBBBBBBBBBB.',
      '.BBBBBBBBBBBB.',
      '.BBBEEBBEEBBB.',
      '.BBBEEBBEEBBB.',
      '.BBBBBBBBBBBB.',
      '.BBBBBEEBBBBB.',
      '.BBBBBBBBBBBB.',
      '..BBBBBBBBBB..',
      '..BBB.........',
      '..BB..........',
      '..B...........',
    ],
    states: {
      speaking: [[8, 5, 'EEEE'], [9, 6, 'EE']],
      thinking: [[5, 2, 'BEEBEEBEEB'], [6, 2, 'BEEBEEBEEB'], [8, 6, 'BB']],
      alert: [[4, 4, 'EE..EE']],
    },
  },
  {
    id: 'beacon', name: 'Beacon', pitch: 'A rounded body under a signal lamp. The lamp is the state indicator.',
    grid: [
      '.....OOOO.....',
      '.....OOOO.....',
      '......BB......',
      '...BBBBBBBB...',
      '..BBBBBBBBBB..',
      '..BBBBBBBBBB..',
      '..BEEEBBEEEB..',
      '..BBBBBBBBBB..',
      '..BBBBBBBBBB..',
      '..BBBBEEBBBB..',
      '..BBBBBBBBBB..',
      '...BBBBBBBB...',
      '....BBBBBB....',
    ],
    states: {
      speaking: [[9, 5, 'EEEE'], [10, 6, 'EE']],
      thinking: [[6, 3, 'BEE..BEE']],
      alert: [[5, 3, 'EEE..EEE']],
    },
  },
  {
    id: 'nut', name: 'Hex', pitch: 'A hex-nut head with a dark visor. The orange eyes glow inside it.',
    grid: [
      '......OO......',
      '......BB......',
      '....BBBBBB....',
      '...BBBBBBBB...',
      '..BBBBBBBBBB..',
      '.BBBBBBBBBBBB.',
      'BBEEEEEEEEEEBB',
      'BBEOOEEEEOOEBB',
      'BBEOOEEEEOOEBB',
      'BBEEEEEEEEEEBB',
      '.BBBBBBBBBBBB.',
      '..BBBBBBBBBB..',
      '...BBBBBBBB...',
      '....BBBBBB....',
    ],
    states: {
      speaking: [[11, 6, 'EE']],
      thinking: [[7, 3, 'EOOEEEEOO'], [8, 3, 'EOOEEEEOO']],
      alert: [[6, 3, 'OO....OO']],
    },
  },
  {
    id: 'flag', name: 'Inbox', pitch: 'A mailbox bot with a side flag. The flag turns red when a decision is waiting.',
    grid: [
      '...BBBBB...BOO',
      '..BBBBBBB..BOO',
      '.BBBBBBBBB.BOO',
      '.BBBBBBBBB.B..',
      '.BEEBBBEEB.B..',
      '.BEEBBBEEB.B..',
      '.BBBBBBBBB.B..',
      '.BBBEEEBBBBB..',
      '.BBBBBBBBB....',
      '.BBBBBBBBB....',
      '..BB...BB.....',
    ],
    states: {
      speaking: [[7, 3, 'BEEEB'], [8, 4, 'EEE']],
      thinking: [[3, 2, 'EE...EE'], [5, 2, 'BB...BB']],
      alert: [[3, 2, 'EE...EE']],
    },
  },
];

function compose(c, state = 'idle') {
  const g = c.grid.map((r) => {
    if (r.length !== 14 && r.length > 14) throw new Error(`${c.id}: row too wide`);
    return r.padEnd(14, '.').split('');
  });
  for (const [r, col, s] of c.states[state] ?? []) {
    [...s].forEach((ch, i) => {
      if (ch === '.') return;
      g[r][col + i] = ch === '-' ? '.' : ch;
    });
  }
  if (state === 'alert') for (const row of g) row.forEach((ch, i) => { if (ch === 'O') row[i] = 'R'; });
  const h = g.length, w = 14;
  const top = Math.floor((14 - h) / 2) + 1, left = 1;
  const out = Array.from({ length: 16 }, () => Array(16).fill('.'));
  g.forEach((row, y) => row.forEach((ch, x) => { out[y + top][x + left] = ch; }));
  const filled = (y, x) => y >= 0 && y < 16 && x >= 0 && x < 16 && out[y][x] !== '.' && out[y][x] !== 'K';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (out[y][x] === '.' && (filled(y - 1, x) || filled(y + 1, x) || filled(y, x - 1) || filled(y, x + 1))) out[y][x] = 'K';
  }
  return out.map((r) => r.join(''));
}

// mode: 'color' | 'mono' (one ink, E/K become holes) | 'sil' (solid silhouette incl. outline)
function svg(rows, scale, mode = 'color', ink = INK, extra = '') {
  const pal = mode === 'color' ? PAL : mode === 'mono' ? MONO(ink) : { B: ink, O: ink, R: ink, E: ink, K: ink };
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const k = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === k) n++;
      if (pal[k]) rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${pal[k]}"/>`;
      x += n;
    }
  });
  return `<svg width="${16 * scale}" height="${16 * scale}" viewBox="0 0 16 16" shape-rendering="crispEdges" ${extra}>${rects}</svg>`;
}

const font = (p) => 'data:font/woff2;base64,' + readFileSync(resolve('node_modules/@fontsource', p)).toString('base64');
const HEAD = `<style>
@font-face{font-family:B;src:url(${font('barlow/files/barlow-latin-400-normal.woff2')})}
@font-face{font-family:M;src:url(${font('share-tech-mono/files/share-tech-mono-latin-400-normal.woff2')})}
@font-face{font-family:D;src:url(${font('chakra-petch/files/chakra-petch-latin-700-normal.woff2')})}
*{box-sizing:border-box;margin:0}
body{background:#071015;color:#c9d6da;font:14px/1.4 B,sans-serif}
#sheet{display:inline-block;padding:36px 40px 40px;background:#071015;
  background-image:linear-gradient(#0c1a20 1px,transparent 1px),linear-gradient(90deg,#0c1a20 1px,transparent 1px);background-size:32px 32px}
h1{font:700 22px D;letter-spacing:.12em;color:#e6eef0}
h1 span{font:13px M;color:#6f8a94;letter-spacing:.18em;margin-left:14px}
.sub{font:13px M;color:#6f8a94;margin:6px 0 26px;letter-spacing:.06em}
.lab{font:11px M;letter-spacing:.14em;color:#6f8a94;text-transform:uppercase}
.mono{font-family:M}
svg{display:block}
</style>`;

function conceptCard(c, i) {
  const idle = compose(c);
  const st = ['idle', 'speaking', 'thinking', 'alert'];
  return `<div class="card">
    <div class="ch"><span class="num">0${i + 1}</span><b>${c.name.toUpperCase()}</b>${TOP[0] === c.id ? '<i>RECOMMENDED</i>' : TOP.includes(c.id) ? '<i class="alt">RUNNER-UP</i>' : ''}</div>
    <p class="pitch">${c.pitch}</p>
    <div class="big">${svg(idle, 15)}</div>
    <div class="row">
      <div class="cell"><div class="tile dark">${svg(idle, 2)}${svg(idle, 1)}</div><span class="lab">32 + 16px dark</span></div>
      <div class="cell"><div class="tile light">${svg(idle, 2)}${svg(idle, 1)}</div><span class="lab">32 + 16px light</span></div>
      <div class="cell"><div class="tile light">${svg(idle, 3, 'sil', '#13222a')}</div><span class="lab">silhouette</span></div>
    </div>
    <div class="row">
      <div class="cell"><div class="tile paper">${svg(idle, 6, 'mono', '#13222a')}</div><span class="lab">one colour</span></div>
      <div class="cell"><div class="tile dark">${svg(idle, 6, 'mono', '#c9d6da')}</div><span class="lab">one colour inverse</span></div>
    </div>
    <div class="states">${st.map((s) => `<div class="cell"><div class="tile dark ${s === 'alert' ? 'al' : ''}">${svg(compose(c, s), 3)}</div><span class="lab">${s}</span></div>`).join('')}</div>
  </div>`;
}

const CONCEPT_CSS = `<style>
.grid{display:flex;gap:18px}
.card{width:300px;padding:18px;border:1px solid #1d3038;background:rgba(10,22,28,.92);position:relative}
.card:has(i:not(.alt)){border-color:#c98b5e}
.ch{display:flex;align-items:baseline;gap:10px;font:700 17px D;letter-spacing:.12em;color:#e6eef0}
.num{font:12px M;color:#6f8a94}
.ch i{margin-left:auto;font:normal 10px M;letter-spacing:.14em;color:#071015;background:#c98b5e;padding:2px 6px}
.ch i.alt{background:#3d5864;color:#e6eef0}
.pitch{font-size:13px;color:#9fb3ba;height:38px;margin:6px 0 12px}
.big{display:flex;justify-content:center;padding:12px 0;background:#0b1a20;border:1px solid #16272e}
.row,.states{display:flex;gap:10px;margin-top:12px}
.cell{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.tile{display:flex;gap:10px;align-items:center;justify-content:center;padding:8px;border:1px solid #1d3038;min-height:52px}
.tile.dark{background:#0b1a20}.tile.light{background:#dfe7ea}.tile.paper{background:#eef2f3}
.tile.al{border-color:#ff4d42}
.states .tile{padding:4px}
.states .lab{font-size:10px}
.note{margin-top:22px;font:12px M;color:#6f8a94;letter-spacing:.04em;max-width:1600px}
</style>`;

function conceptsPage() {
  return `${HEAD}${CONCEPT_CSS}<div id="sheet">
    <h1>MILO // ROBOT CONCEPTS <span>01–05 · 16×16 MASTER · 3 COLOURS + ALERT RED</span></h1>
    <p class="sub">Each concept is a 16×16 master drawn with ${['body', 'accent', 'ink'].join(' / ')}. The orange accent is the status light; in alert it turns red. 32px and 16px are shown at their true size.</p>
    <div class="grid">${CONCEPTS.map(conceptCard).join('')}</div>
    <p class="note">Palette: body #8fb2be · accent #c98b5e · ink #13222a · alert only #ff4d42. One-colour versions cut the eyes and mouth out of the silhouette, so they work as a stamp, embroidery or single-ink print. States change only the eyes, the mouth and the accent light.</p>
  </div>`;
}

// ---------- merch ----------
function sticker(c) {
  const rows = compose(c);
  return `<div class="m"><div class="stk">${svg(rows, 13, 'color', INK, 'class="die"')}</div><span class="lab">die-cut sticker · 3in</span></div>`;
}
function pin(c) {
  const rows = compose(c);
  const gold = '#c8b07a';
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((k, x) => {
    if (k === '.') return;
    const fill = k === 'K' ? gold : PAL[k];
    rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
  }));
  return `<div class="m"><div class="pinbg"><div class="card2"><svg width="208" height="208" viewBox="0 0 16 16" shape-rendering="crispEdges" class="pin">
      <defs><linearGradient id="gl${c.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="cp${c.id}">${rects.replace(/ fill="[^"]+"/g, '')}</clipPath></defs>
      ${rects}<rect width="16" height="16" fill="url(#gl${c.id})" clip-path="url(#cp${c.id})"/></svg>
      <span class="bc">MILOOPS</span></div></div><span class="lab">hard-enamel pin · gold plating · 1.25in</span></div>`;
}
function tee(c, dark = true) {
  const body = dark ? '#1b2a32' : '#d9e1e3';
  const ink = dark ? '#c9d6da' : '#13222a';
  return `<div class="m"><div class="teebg">
    <svg width="330" height="330" viewBox="0 0 330 330"><path d="M110 22 L60 40 L10 96 L52 132 L76 108 L76 312 L254 312 L254 108 L278 132 L320 96 L270 40 L220 22 Q165 62 110 22Z" fill="${body}" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
    <path d="M110 22 Q165 62 220 22" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="6"/></svg>
    <div class="print">${svg(compose(c), 6, dark ? 'color' : 'mono', ink)}<span style="color:${ink}">MILOOPS</span></div>
  </div><span class="lab">${dark ? 'tee · colour print on charcoal' : 'tee · one-ink print on ash'}</span></div>`;
}
function patch(c) {
  return `<div class="m"><div class="patch">${svg(compose(c), 9, 'color')}</div><span class="lab">embroidered patch · 3in</span></div>`;
}

const MERCH_CSS = `<style>
.mrow{display:flex;gap:22px;align-items:flex-start;margin-bottom:28px}
.mh{width:200px;padding-top:8px}
.mh b{display:block;font:700 18px D;letter-spacing:.12em;color:#e6eef0}
.mh i{display:inline-block;margin-top:6px;font:normal 10px M;letter-spacing:.14em;color:#071015;background:#c98b5e;padding:2px 6px}
.mh i.alt{background:#3d5864;color:#e6eef0}
.mh p{font-size:13px;color:#9fb3ba;margin-top:8px}
.m{display:flex;flex-direction:column;gap:8px}
.m>div{width:330px;height:330px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.stk{background:#2b3a40;background-image:radial-gradient(circle at 30% 20%,#3a4b52,#222f34)}
.die{filter:drop-shadow(0 0 0 #fff) drop-shadow(4px 0 0 #f4f6f6) drop-shadow(-4px 0 0 #f4f6f6) drop-shadow(0 4px 0 #f4f6f6) drop-shadow(0 -4px 0 #f4f6f6) drop-shadow(3px 6px 6px rgba(0,0,0,.45));transform:rotate(-6deg)}
.pinbg{background:#c9c2b4;background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.03) 0 2px,transparent 2px 5px)}
.card2{width:268px;height:290px;background:#0d1a20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;box-shadow:0 8px 18px rgba(0,0,0,.35)}
.pin{filter:drop-shadow(0 3px 2px rgba(0,0,0,.6))}
.bc{font:700 14px D;letter-spacing:.3em;color:#c8b07a}
.teebg{background:#a9b6ba}
.print{position:absolute;top:118px;display:flex;flex-direction:column;align-items:center;gap:8px}
.print span{font:700 13px D;letter-spacing:.32em}
.patch{background:#5a4a3c;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 4px)}
.patch::before{content:'';position:absolute;width:250px;height:250px;border-radius:50%;background:#16252d;box-shadow:0 0 0 9px #c98b5e,0 0 0 11px #9a6a48,0 6px 14px 11px rgba(0,0,0,.4)}
.patch::after{content:'';position:absolute;width:236px;height:236px;border-radius:50%;border:2px dashed rgba(201,139,94,.55)}
.patch svg{position:relative;z-index:1}
</style>`;

function merchPage() {
  const rows = TOP.map((id, i) => {
    const c = CONCEPTS.find((x) => x.id === id);
    return `<div class="mrow"><div class="mh"><b>${c.name.toUpperCase()}</b><i class="${i ? 'alt' : ''}">${i ? 'RUNNER-UP' : 'RECOMMENDED'}</i><p>${c.pitch}</p></div>
      ${sticker(c)}${pin(c)}${tee(c, true)}${tee(c, false)}${patch(c)}</div>`;
  }).join('');
  return `${HEAD}${MERCH_CSS}<div id="sheet"><h1>MILO // MERCH MOCKS <span>TOP 2 CONCEPTS</span></h1>
    <p class="sub">All mocks use the same 16×16 master. The pin uses gold metal lines in place of the ink outline. The ash tee uses the one-colour version.</p>${rows}</div>`;
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
for (const [file, html] of [['milo-robot-concepts.png', conceptsPage()], ['milo-robot-merch.png', merchPage()]]) {
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#sheet').screenshot({ path: join(OUT, file) });
  console.log('wrote', join(OUT, file));
}
await browser.close();
