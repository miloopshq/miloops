// Renders the v2 MILO robot concept sheet (screen-face bust with headphones) and a merch mock for the top pick.
// Usage: OUT_DIR=captures CHROME=/path/to/chrome TOP=crt node tools/robot-concepts-v2.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(process.env.OUT_DIR || 'out');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
const TOP = process.env.TOP || 'crt';

// L shell, P headphones/trim, D dark screen, S blue screen, E dark face pixels, O status light,
// R alert only, K outline (added automatically).
const INK = '#13222a';
const PAL = { L: '#d3dfe3', P: '#6f8e9a', D: INK, S: '#8fb2be', E: INK, O: '#c98b5e', R: '#ff4d42', K: INK };

// Grids are at most 14×14 so the 1px outline lands on a 16×16 canvas.
// Patches are [row, col, str]: a key sets that pixel, '.' keeps it, '-' clears it. Alert also turns O into R.
// `holes` are the keys cut out in the one-colour version (the outline is always cut).
const CONCEPTS = [
  {
    id: 'crt', name: 'CRT', holes: 'D',
    pitch: 'A square monitor head with a dark screen and light pixel eyes. Over-ear headphones, floating hands, and the status light on the chest.',
    grid: [
      '....PPPPPP....',
      '...P......P...',
      '..P.LLLLLL.P..',
      '.PPLLLLLLLLPP.',
      '.PPLDDDDDDLPP.',
      '.PPLDLDDLDLPP.',
      '.PPLDLDDLDLPP.',
      '.PPLDDDDDDLPP.',
      '.PPLDDLLDDLPP.',
      '...LDDDDDDL...',
      '....LLLLLL....',
      '.....PPPP.....',
      '.LL.LLOOLL.LL.',
      '.LL..LLLL..LL.',
    ],
    states: {
      speaking: [[8, 5, 'LLLL'], [9, 6, 'LL']],
      thinking: [[4, 5, 'L..L'], [6, 5, 'D..D'], [8, 6, 'DL']],
      alert: [[4, 5, 'L..L'], [9, 6, 'LL']],
    },
  },
  {
    id: 'tv', name: 'Broadcast', holes: 'S',
    pitch: 'A wide TV head with a calm blue screen and big ear cups. The status light is an LED on the left cup.',
    grid: [
      '...PPPPPPPP...',
      '.PP........PP.',
      'PPLLLLLLLLLLPP',
      'PPLSSSSSSSSLPP',
      'OPLSESSSSESLPP',
      'PPLSESSSSESLPP',
      'PPLSSSEESSSLPP',
      'PPLSSSSSSSSLPP',
      '..LLLLLLLLLL..',
      '.....PPPP.....',
      '..LL.LLLL.LL..',
      '..LL.LLLL.LL..',
      '.....LLLL.....',
    ],
    states: {
      speaking: [[6, 5, 'EEEE'], [7, 6, 'EE']],
      thinking: [[3, 4, 'E....E'], [5, 4, 'S....S']],
      alert: [[3, 4, 'E....E'], [7, 6, 'EE']],
    },
  },
  {
    id: 'operator', name: 'Operator', holes: 'D',
    pitch: 'The CRT head with a mic boom. One hand holds the headset, and the mic tip is the status light.',
    grid: [
      '....PPPPPP....',
      '...P......P...',
      '..P.LLLLLL.P..',
      '.PPLLLLLLLLPP.',
      '.PPLDDDDDDLPP.',
      '.PPLDLDDLDLPP.',
      '.PPLDLDDLDLPP.',
      '.PPLDDDDDDLPP.',
      '.PPLDDLLDDLPP.',
      'LL.LDDDDDDL.P.',
      'LL..LLLLLL.O..',
      '.....PPPP.....',
      '....LLLLLL.LL.',
      '.....LLLL..LL.',
    ],
    states: {
      speaking: [[8, 5, 'LLLL'], [9, 6, 'LL']],
      thinking: [[4, 5, 'L..L'], [6, 5, 'D..D'], [8, 6, 'DL']],
      alert: [[4, 5, 'L..L'], [9, 6, 'LL']],
    },
  },
  {
    id: 'chibi', name: 'Pocket', holes: 'S',
    pitch: 'Mostly head: a big blue screen with a tiny body and mitten hands. The status light sits on top of the headband.',
    grid: [
      '......OO......',
      '...PPPPPPPP...',
      '..P........P..',
      '.PPLLLLLLLLPP.',
      '.PPLSSSSSSLPP.',
      '.PPLSESSESLPP.',
      '.PPLSESSESLPP.',
      '.PPLSSSSSSLPP.',
      '.PPLSSEESSLPP.',
      '...LLLLLLLL...',
      '.LL.LLLLLL.LL.',
      '.....LLLL.....',
    ],
    states: {
      speaking: [[8, 5, 'EEEE']],
      thinking: [[4, 5, 'E..E'], [6, 5, 'S..S'], [8, 6, 'SE']],
      alert: [[4, 5, 'E..E']],
    },
  },
];

function compose(c, state = 'idle') {
  const g = c.grid.map((r) => {
    if (r.length !== 14) throw new Error(`${c.id}: row "${r}" is ${r.length} wide`);
    return r.split('');
  });
  for (const [r, col, s] of c.states[state] ?? []) {
    [...s].forEach((ch, i) => {
      if (ch !== '.') g[r][col + i] = ch === '-' ? '.' : ch;
    });
  }
  if (state === 'alert') for (const row of g) row.forEach((ch, i) => { if (ch === 'O') row[i] = 'R'; });
  const top = Math.floor((14 - g.length) / 2) + 1;
  const out = Array.from({ length: 16 }, () => Array(16).fill('.'));
  g.forEach((row, y) => row.forEach((ch, x) => { out[y + top][x + 1] = ch; }));
  const filled = (y, x) => y >= 0 && y < 16 && x >= 0 && x < 16 && out[y][x] !== '.' && out[y][x] !== 'K';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (out[y][x] === '.' && (filled(y - 1, x) || filled(y + 1, x) || filled(y, x - 1) || filled(y, x + 1))) out[y][x] = 'K';
  }
  return out.map((r) => r.join(''));
}

// mode: 'color' | 'mono' (one ink, holes + outline cut out) | 'sil' (solid silhouette)
function svg(rows, scale, { mode = 'color', ink = INK, holes = '', pal = PAL, extra = '' } = {}) {
  const colour = (k) => {
    if (k === '.') return null;
    if (mode === 'sil') return ink;
    if (mode === 'mono') return k === 'K' || holes.includes(k) ? null : ink;
    return pal[k];
  };
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let n = 1;
      while (x + n < row.length && row[x + n] === row[x]) n++;
      const f = colour(row[x]);
      if (f) rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${f}"/>`;
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
.sub{font:13px M;color:#6f8a94;margin:6px 0 26px;letter-spacing:.06em;max-width:1500px}
.lab{font:11px M;letter-spacing:.14em;color:#6f8a94;text-transform:uppercase}
svg{display:block}
.grid{display:flex;gap:18px}
.card{width:340px;padding:18px;border:1px solid #1d3038;background:rgba(10,22,28,.92)}
.card.top{border-color:#c98b5e}
.ch{display:flex;align-items:baseline;gap:10px;font:700 17px D;letter-spacing:.12em;color:#e6eef0}
.num{font:12px M;color:#6f8a94}
.ch i{margin-left:auto;font:normal 10px M;letter-spacing:.14em;color:#071015;background:#c98b5e;padding:2px 6px}
.pitch{font-size:13px;color:#9fb3ba;height:58px;margin:6px 0 12px}
.big{display:flex;justify-content:center;padding:14px 0;background:#0b1a20;border:1px solid #16272e}
.row,.states{display:flex;gap:10px;margin-top:12px}
.cell{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.tile{display:flex;gap:10px;align-items:center;justify-content:center;padding:8px;border:1px solid #1d3038;min-height:52px}
.tile.dark{background:#0b1a20}.tile.light{background:#dfe7ea}.tile.paper{background:#eef2f3}
.tile.al{border-color:#ff4d42}
.states .tile{padding:5px}
.states .lab{font-size:10px}
.note{margin-top:22px;font:12px M;color:#6f8a94;letter-spacing:.04em;max-width:1500px}
</style>`;

function card(c, i) {
  const idle = compose(c);
  return `<div class="card ${c.id === TOP ? 'top' : ''}">
    <div class="ch"><span class="num">0${i + 1}</span><b>${c.name.toUpperCase()}</b>${c.id === TOP ? '<i>RECOMMENDED</i>' : ''}</div>
    <p class="pitch">${c.pitch}</p>
    <div class="big">${svg(idle, 16)}</div>
    <div class="row">
      <div class="cell"><div class="tile dark">${svg(idle, 2)}${svg(idle, 1)}</div><span class="lab">32 + 16px dark</span></div>
      <div class="cell"><div class="tile light">${svg(idle, 2)}${svg(idle, 1)}</div><span class="lab">32 + 16px light</span></div>
      <div class="cell"><div class="tile light">${svg(idle, 3, { mode: 'sil' })}</div><span class="lab">silhouette</span></div>
    </div>
    <div class="row">
      <div class="cell"><div class="tile paper">${svg(idle, 7, { mode: 'mono', holes: c.holes })}</div><span class="lab">one colour</span></div>
      <div class="cell"><div class="tile dark">${svg(idle, 7, { mode: 'mono', holes: c.holes, ink: '#c9d6da' })}</div><span class="lab">one colour inverse</span></div>
    </div>
    <div class="states">${['idle', 'speaking', 'thinking', 'alert'].map((s) => `<div class="cell"><div class="tile dark ${s === 'alert' ? 'al' : ''}">${svg(compose(c, s), 4)}</div><span class="lab">${s}</span></div>`).join('')}</div>
  </div>`;
}

function conceptsPage() {
  return `${HEAD}<div id="sheet">
    <h1>MILO // ROBOT CONCEPTS V2 <span>SCREEN-FACE BUST · HEADPHONES · 16×16 MASTER</span></h1>
    <p class="sub">A floating bust with headphones and no legs. The screen shows the face and the orange light shows the status; the light turns red only in alert. 32px and 16px are shown at their true size.</p>
    <div class="grid">${CONCEPTS.map(card).join('')}</div>
    <p class="note">Palette: shell #d3dfe3 · headphones #6f8e9a · screen #13222a or #8fb2be · ink #13222a · status #c98b5e · alert only #ff4d42. The one-colour versions cut the screen out of the silhouette, so the face stays legible as a stamp, embroidery or single-ink print. States change only the screen face and the status light.</p>
  </div>`;
}

// ---------- merch (top pick) ----------
function merchPage() {
  const c = CONCEPTS.find((x) => x.id === TOP);
  const rows = compose(c);
  const gold = '#c8b07a';
  const pinPal = { ...PAL, K: gold };
  return `${HEAD}<style>
.mrow{display:flex;gap:22px;align-items:flex-start}
.m{display:flex;flex-direction:column;gap:8px}
.m>div{width:330px;height:330px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.stk{background:radial-gradient(circle at 30% 20%,#3a4b52,#222f34)}
.die{filter:drop-shadow(4px 0 0 #f4f6f6) drop-shadow(-4px 0 0 #f4f6f6) drop-shadow(0 4px 0 #f4f6f6) drop-shadow(0 -4px 0 #f4f6f6) drop-shadow(3px 6px 6px rgba(0,0,0,.45));transform:rotate(-6deg)}
.pinbg{background:#c9c2b4}
.card2{width:268px;height:290px;background:#0d1a20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;box-shadow:0 8px 18px rgba(0,0,0,.35)}
.pin{filter:drop-shadow(0 3px 2px rgba(0,0,0,.6))}
.bc{font:700 14px D;letter-spacing:.3em;color:${gold}}
.teebg{background:#a9b6ba}
.print{position:absolute;top:112px;display:flex;flex-direction:column;align-items:center;gap:8px}
.print span{font:700 13px D;letter-spacing:.32em}
.patch{background:#5a4a3c;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 4px)}
.patch::before{content:'';position:absolute;width:250px;height:250px;border-radius:50%;background:#16252d;box-shadow:0 0 0 9px #6f8e9a,0 0 0 11px #4b6570,0 6px 14px 11px rgba(0,0,0,.4)}
.patch::after{content:'';position:absolute;width:236px;height:236px;border-radius:50%;border:2px dashed rgba(211,223,227,.45)}
.patch svg{position:relative;z-index:1}
.states2{display:flex;gap:14px;margin-top:26px;align-items:flex-end}
</style><div id="sheet"><h1>MILO // MERCH MOCK V2 <span>${c.name.toUpperCase()} · RECOMMENDED</span></h1>
  <p class="sub">All mocks use the same 16×16 master. The pin uses gold metal lines in place of the ink outline. The ash tee uses the one-colour version.</p>
  <div class="mrow">
    <div class="m"><div class="stk">${svg(rows, 14, { extra: 'class="die"' })}</div><span class="lab">die-cut sticker · 3in</span></div>
    <div class="m"><div class="pinbg"><div class="card2">${svg(rows, 13, { pal: pinPal, extra: 'class="pin"' })}<span class="bc">MILOOPS</span></div></div><span class="lab">hard-enamel pin · gold plating · 1.25in</span></div>
    <div class="m"><div class="teebg">${tee('#1b2a32')}<div class="print">${svg(rows, 6)}<span style="color:#c9d6da">MILOOPS</span></div></div><span class="lab">tee · colour print on charcoal</span></div>
    <div class="m"><div class="teebg">${tee('#d9e1e3')}<div class="print">${svg(rows, 6, { mode: 'mono', holes: c.holes })}<span style="color:${INK}">MILOOPS</span></div></div><span class="lab">tee · one-ink print on ash</span></div>
    <div class="m"><div class="patch">${svg(rows, 9)}</div><span class="lab">embroidered patch · 3in</span></div>
  </div>
  <div class="states2">${['idle', 'speaking', 'thinking', 'alert'].map((s) => `<div class="m" style="gap:6px">${svg(compose(c, s), 6, { extra: 'style="background:#0b1a20;border:1px solid ' + (s === 'alert' ? '#ff4d42' : '#1d3038') + '"' })}<span class="lab">sticker set · ${s}</span></div>`).join('')}</div>
</div>`;
}
function tee(fill) {
  return `<svg width="330" height="330" viewBox="0 0 330 330"><path d="M110 22 L60 40 L10 96 L52 132 L76 108 L76 312 L254 312 L254 108 L278 132 L320 96 L270 40 L220 22 Q165 62 110 22Z" fill="${fill}" stroke="rgba(0,0,0,.25)" stroke-width="2"/><path d="M110 22 Q165 62 220 22" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="6"/></svg>`;
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
for (const [file, html] of [['milo-robot-concepts-v2.png', conceptsPage()], ['milo-robot-merch-v2.png', merchPage()]]) {
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#sheet').screenshot({ path: join(OUT, file) });
  console.log('wrote', join(OUT, file));
}
await browser.close();
