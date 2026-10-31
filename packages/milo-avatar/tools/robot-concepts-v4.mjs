// Renders the v4 MILO robot concept sheet (head only, composed on-duty tone; detailed 32×32 master + hand-simplified 16×16) and a merch mock for the top pick.
// Usage: OUT_DIR=captures CHROME=/path/to/chrome TOP=crt node tools/robot-concepts-v4.mjs
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = resolve(process.env.OUT_DIR || 'out');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
const TOP = process.env.TOP || 'crt';

// Material ramps. Tokens are material letter + tone (higher = lighter). `l` + letter is that material's line colour.
const PAL = {
  K: '#0b151a',
  L4: '#f5f9fa',
  L3: '#e2ebee',
  L2: '#c7d5da',
  L1: '#9db1b9',
  L0: '#76909b',
  lL: '#4b6470',
  P3: '#a9bfc7',
  P2: '#87a2ac',
  P1: '#66828d',
  P0: '#47606a',
  lP: '#2a3f48',
  C1: '#34464e',
  C0: '#25343b',
  lC: '#16232a',
  D3: '#2e5462',
  D2: '#234350',
  D1: '#16303a',
  D0: '#11262e',
  G2: '#f0fcff',
  G1: '#a6dce8',
  G0: '#5d9fb1',
  S3: '#d6e8ee',
  S2: '#b3cfd8',
  S1: '#90b3bf',
  S0: '#7499a7',
  lS: '#46697a',
  E1: '#1a3039',
  O3: '#f7cba3',
  O2: '#e2a473',
  O1: '#c98b5e',
  O0: '#8e5d3a',
  lO: '#5c3820',
  Wo: '#e2d2c6',
  R3: '#ffb8b0',
  R2: '#ff7b70',
  R1: '#ff4d42',
  R0: '#b3261e',
  lR: '#6c1812',
  Wr: '#efc7c3',
};
const mat = (t) => (t[0] === 'l' ? t[1] : t[0]);

class Grid {
  constructor(w = 32, h = 32) {
    this.w = w;
    this.h = h;
    this.p = Array.from({ length: h }, () => Array(w).fill(null));
  }
  set(x, y, t) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y][x] = t;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.p[y][x] : null;
  }
}

function rr(x0, y0, w, h, r) {
  return (x, y) => {
    if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
    const cx = x < x0 + r ? x0 + r : x >= x0 + w - r ? x0 + w - r - 1 : x;
    const cy = y < y0 + r ? y0 + r : y >= y0 + h - r ? y0 + h - r - 1 : y;
    const dx = x - cx,
      dy = y - cy;
    return dx * dx + dy * dy <= r * r + r * 0.6;
  };
}

// Light from the top-left: lit rim, base, shaded bottom/right rim, plus a second shaded row along the bottom.
function shade(g, inside, m, { hi = 3, base = 2, sh = 1, soft = false, spec = false } = {}) {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (!inside(x, y)) continue;
      const up = inside(x, y - 1),
        lf = inside(x - 1, y),
        dn = inside(x, y + 1),
        rt = inside(x + 1, y);
      let t = base;
      if ((!up && rt) || (!lf && dn)) t = hi;
      if ((!dn && lf) || (!rt && up)) t = sh;
      if ((!up && !rt) || (!dn && !lf)) t = base;
      if (!soft && t === base && !inside(x, y + 2) && lf && rt) t = sh;
      g.set(x, y, m + t);
    }
  if (spec) {
    outer: for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++)
        if (inside(x, y) && inside(x + 1, y + 1)) {
          g.set(x + 1, y + 1, m + 4);
          g.set(x + 2, y + 1, m + 4);
          g.set(x + 1, y + 2, m + 4);
          break outer;
        }
  }
}

function band(g, cx, cy, a, b, th) {
  const e = (x, y, aa, bb) => ((x + 0.5 - cx) / aa) ** 2 + ((y + 0.5 - cy) / bb) ** 2;
  for (let y = 0; y < cy; y++)
    for (let x = 0; x < g.w; x++) {
      const o = e(x, y, a, b),
        i = e(x, y, a - th, b - th);
      if (o <= 1 && i > 1) {
        const rim = e(x, y - 1, a, b) > 1 || e(x - (x < cx ? 1 : -1), y, a, b) > 1;
        const inner = e(x, y + 1, a - th, b - th) <= 1;
        g.set(x, y, rim ? 'P2' : inner ? 'P0' : 'P1');
      }
    }
}

function light(g, x, y, state, halo = true) {
  const m = state === 'alert' ? 'R' : 'O';
  const dim = state === 'thinking';
  g.set(x, y, dim ? 'O1' : m + '3');
  g.set(x + 1, y, dim ? 'O0' : m + '2');
  g.set(x, y + 1, dim ? 'O0' : m + '2');
  g.set(x + 1, y + 1, dim ? 'O0' : m + '1');
  if (halo && state === 'alert')
    for (const [dx, dy] of [
      [-1, 0],
      [2, 0],
      [-1, 1],
      [2, 1],
      [0, -1],
      [1, -1],
      [0, 2],
      [1, 2],
    ]) {
      const t = g.get(x + dx, y + dy);
      if (t && t[0] === 'L') g.set(x + dx, y + dy, state === 'alert' ? 'Wr' : 'Wo');
    }
}

// Composed face drawn on the screen rect: narrowed eyes, flat dim mouth, faint horizontal glow only.
// `crt` = light pixels on dark glass, otherwise dark pixels on a blue screen. `visor` joins the eyes with a scan line.
function face(g, s, state, { crt, inset = 1, visor = false } = {}) {
  const ey = s.y + Math.floor(s.h / 2) - 2,
    my = ey + 4;
  const ex = [s.x + inset, s.x + s.w - inset - 3];
  const mx = s.x + s.w / 2 - 1;
  const hi = crt ? 'G1' : 'E1',
    lo = crt ? 'G0' : 'S0',
    core = crt ? 'G2' : 'E1';
  const set = (x, y, t) => g.set(x, y, t);
  if (visor && crt)
    for (let x = ex[0] - 1; x <= ex[1] + 3; x++) if ((g.get(x, ey + 1) || '')[0] === 'D') set(x, ey + 1, 'D3');
  const look = state === 'thinking' ? 1 : 0;
  for (const x0 of ex) {
    const x = x0 + look;
    if (state === 'blink') {
      for (let i = 0; i < 3; i++) set(x + i, ey + 1, lo);
      continue;
    }
    if (state === 'alert') for (let i = 0; i < 3; i++) set(x + i, ey - 1, lo);
    for (let i = 0; i < 3; i++) {
      set(x + i, ey, state === 'alert' ? hi : lo);
      set(x + i, ey + 1, hi);
    }
    if (crt && state === 'alert') set(x + 1, ey + 1, core);
  }
  const mouth = (pts, t) => pts.forEach(([dx, dy]) => set(mx + dx, my + dy, t));
  if (state === 'speaking') {
    mouth(
      [
        [-1, 0],
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      hi,
    );
    mouth(
      [
        [0, 1],
        [1, 1],
      ],
      lo,
    );
  } else if (state === 'speakB')
    mouth(
      [
        [0, 0],
        [1, 0],
      ],
      hi,
    );
  else if (state === 'thinking')
    mouth(
      [
        [1, 0],
        [2, 0],
      ],
      lo,
    );
  else
    mouth(
      [
        [0, 0],
        [1, 0],
      ],
      lo,
    );
  if (crt) {
    for (let y = s.y; y < s.y + s.h; y++)
      for (let x = s.x; x < s.x + s.w; x++) {
        const t = g.get(x, y);
        if (!t || t[0] !== 'D' || t === 'D3') continue;
        if (
          [
            [1, 0],
            [-1, 0],
          ].some(([dx, dy]) => /^G[12]/.test(g.get(x + dx, y + dy) || ''))
        )
          set(x, y, 'D2');
      }
  }
}

function screen(g, s, crt) {
  const inside = rr(s.x, s.y, s.w, s.h, s.r);
  for (let y = s.y; y < s.y + s.h; y++)
    for (let x = s.x; x < s.x + s.w; x++) {
      if (!inside(x, y)) continue;
      if (crt) g.set(x, y, (y - s.y) % 2 ? 'D0' : 'D1');
      else g.set(x, y, y === s.y ? 'S3' : y < s.y + 3 ? 'S2' : y >= s.y + s.h - 2 ? 'S0' : 'S1');
    }
  // glass reflection, top-left (same side as the light)
  for (const [dx, dy] of [
    [1, 1],
    [2, 1],
    [1, 2],
  ])
    if (inside(s.x + dx, s.y + dy)) g.set(s.x + dx, s.y + dy, crt ? 'D3' : 'S3');
  // bezel shadow on the glass edge, top and left
  for (let x = s.x; x < s.x + s.w; x++) if (inside(x, s.y) && crt) g.set(x, s.y, 'D0');
}

const CONCEPTS = {
  crt: {
    name: 'CRT',
    crt: true,
    inset: 2,
    pitch:
      'A square monitor head with dark glass and steady, narrowed eyes, and a flat mouth line. The status light sits in a small pod on the headband.',
    head: { x: 6, y: 7, w: 20, h: 19, r: 3 },
    screen: { x: 9, y: 10, w: 14, h: 12, r: 2 },
    cups: { y: 12, h: 12, lx: 1, rx: 27, w: 4 },
    band: { cx: 16, cy: 16, a: 15, b: 13, th: 2 },
    light: 'band',
  },
  tv: {
    name: 'Broadcast',
    crt: false,
    inset: 3,
    pitch:
      'A wide TV head with a blue screen and heavy-lidded dark eyes. A short antenna on the ear cup carries the status LED.',
    head: { x: 5, y: 8, w: 22, h: 17, r: 3 },
    screen: { x: 8, y: 11, w: 16, h: 10, r: 2 },
    cups: { y: 12, h: 11, lx: 1, rx: 27, w: 4 },
    band: { cx: 16, cy: 16, a: 15, b: 12.5, th: 2 },
    light: 'antenna',
  },
  operator: {
    name: 'Operator',
    crt: true,
    inset: 2,
    visor: true,
    pitch:
      'The CRT head with a visor scan line joining the eyes. The headset mic boom runs under the chin, and its tip is the status light.',
    head: { x: 6, y: 7, w: 20, h: 19, r: 3 },
    screen: { x: 9, y: 10, w: 14, h: 12, r: 2 },
    cups: { y: 12, h: 12, lx: 1, rx: 27, w: 4 },
    band: { cx: 16, cy: 16, a: 15, b: 13, th: 2 },
    light: 'mic',
  },
};

function draw(c, state = 'idle') {
  const g = new Grid();
  const { head: h, screen: s, cups: cu } = c;
  band(g, c.band.cx, c.band.cy, c.band.a, c.band.b, c.band.th);
  for (const x of [cu.lx, cu.rx]) shade(g, rr(x, cu.y, cu.w, cu.h, 2), 'P', { hi: 2, base: 1, sh: 0 });
  // cushions between cups and head
  for (let y = cu.y + 1; y < cu.y + cu.h - 1; y++) {
    g.set(cu.lx + cu.w, y, y === cu.y + 1 ? 'C1' : 'C0');
    g.set(cu.rx - 1, y, y === cu.y + 1 ? 'C1' : 'C0');
  }
  // cup detail: inner ridge
  for (let y = cu.y + 3; y < cu.y + cu.h - 3; y++) {
    g.set(cu.lx + 1, y, 'P2');
    g.set(cu.rx + 2, y, 'P0');
  }
  // head, bezel, screen, face
  shade(g, rr(h.x, h.y, h.w, h.h, h.r), 'L', { spec: true });
  const si = rr(s.x - 1, s.y - 1, s.w + 2, s.h + 2, s.r + 1);
  for (let y = s.y - 1; y <= s.y + s.h; y++)
    for (let x = s.x - 1; x <= s.x + s.w; x++)
      if (si(x, y)) g.set(x, y, y >= s.y + s.h || x >= s.x + s.w ? 'L3' : 'L0');
  screen(g, s, c.crt);
  face(g, s, state, c);
  // lower bezel: vent slots and a small trim button
  const by = s.y + s.h + 1;
  if (by < h.y + h.h - 1) {
    for (const dx of [5, 3, 1]) {
      g.set(s.x + s.w - dx - 1, by, 'L0');
      g.set(s.x + s.w - dx - 1, by + 1, 'L3');
    }
    g.set(s.x + 1, by, 'P1');
    g.set(s.x + 2, by, 'P0');
  }
  // status light
  if (c.light === 'band') {
    shade(g, rr(13, 1, 6, 3, 1), 'P', { hi: 2, base: 1, sh: 0, soft: true });
    light(g, 15, 1, state, false);
  }
  if (c.light === 'antenna') {
    for (let y = 7; y < cu.y; y++) g.set(cu.rx + 3, y, y === 7 ? 'P2' : 'P1');
    light(g, cu.rx + 2, 5, state, false);
  }
  if (c.light === 'mic') {
    for (const [x, y] of [
      [28, 24],
      [27, 25],
      [26, 26],
      [25, 27],
      [24, 27],
      [23, 27],
    ])
      g.set(x, y, 'P0');
    g.set(28, 23, 'P1');
    light(g, 21, 27, state, false);
  }
  // selective outline: material line colour on top/left edges, near-black on bottom/right
  const out = new Grid();
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const t = g.get(x, y);
      if (t) {
        out.set(x, y, t);
        continue;
      }
      const below = g.get(x, y + 1),
        right = g.get(x + 1, y),
        above = g.get(x, y - 1),
        left = g.get(x - 1, y);
      if (!(below || right || above || left)) continue;
      const src = below || right;
      const m = src ? mat(src) : null;
      const lk = m && PAL['l' + m] && !above && !left ? 'l' + m : 'K';
      out.set(x, y, lk);
    }
  const used = out.p.map((r, y) => (r.some(Boolean) ? y : -1)).filter((y) => y >= 0);
  const shift = Math.floor((31 - used[used.length - 1] - used[0]) / 2);
  if (shift > 0) out.p = [...Array.from({ length: shift }, () => Array(32).fill(null)), ...out.p.slice(0, 32 - shift)];
  return out;
}

// Hand-simplified 16×16 masters for favicon/tiny sizes.
const MINI = {
  crt: [
    '......OO......',
    '...PPPPPPPP...',
    '..P........P..',
    '.P.LLLLLLLL.P.',
    'PPLLLLLLLLLLPP',
    'PPLDDDDDDDDLPP',
    'PPLDGGDDGGDLPP',
    'PPLDDDDDDDDLPP',
    'PPLDDDggDDDLPP',
    'PPLDDDDDDDDLPP',
    '..LLLLLLLLLL..',
    '...LLLLLLLL...',
  ],
  tv: [
    '............O.',
    '...PPPPPPPP.P.',
    '..P........PP.',
    '.P.LLLLLLLL.P.',
    'PPLLLLLLLLLLPP',
    'PPLSSSSSSSSLPP',
    'PPLSEESSEESLPP',
    'PPLSSSSSSSSLPP',
    'PPLSSSeeSSSLPP',
    'PPLSSSSSSSSLPP',
    '..LLLLLLLLLL..',
    '...LLLLLLLL...',
  ],
  operator: [
    '...PPPPPPPP...',
    '..P........P..',
    '.P.LLLLLLLL.P.',
    'PPLLLLLLLLLLPP',
    'PPLDDDDDDDDLPP',
    'PPLvGGvvGGvLPP',
    'PPLDDDDDDDDLPP',
    'PPLDDDggDDDLPP',
    'PPLDDDDDDDDLPP',
    '..LLLLLLLLLLP.',
    '...LLLLLLLLP..',
    '.........OO...',
  ],
};
const MINI_TOK = { L: 'L2', P: 'P1', D: 'D1', G: 'G1', g: 'G0', v: 'D3', S: 'S1', E: 'E1', e: 'E1', O: 'O1' };
function drawMini(id) {
  const rows = MINI[id];
  const g = new Grid(16, 16);
  const top = Math.floor((14 - rows.length) / 2) + 1;
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch !== '.') g.set(x + 1, y + top, MINI_TOK[ch]);
    }),
  );
  const out = new Grid(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const t = g.get(x, y);
      if (t) out.set(x, y, t);
      else if (g.get(x + 1, y) || g.get(x - 1, y) || g.get(x, y + 1) || g.get(x, y - 1)) out.set(x, y, 'K');
    }
  return out;
}

// mode: color | mono (dark values as ink) | monoInv (light values as ink, for dark garments) | sil
function svg(g, scale, { mode = 'color', ink = PAL.K, extra = '', pal = PAL } = {}) {
  // One-colour is a value split: dark materials print as ink, light ones stay paper.
  const holes = (t) => !(t === 'K' || t === 'O0' || t === 'P1' || t === 'P0' || 'lDCE'.includes(t[0]));
  const colour = (t) => {
    if (!t) return null;
    if (mode === 'sil') return ink;
    if (mode === 'mono') return holes(t) ? null : ink;
    if (mode === 'monoInv') return holes(t) ? ink : null;
    return pal[t];
  };
  let rects = '';
  for (let y = 0; y < g.h; y++) {
    let x = 0;
    while (x < g.w) {
      const f = colour(g.p[y][x]);
      let n = 1;
      while (x + n < g.w && colour(g.p[y][x + n]) === f) n++;
      if (f) rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${f}"/>`;
      x += n;
    }
  }
  return `<svg width="${g.w * scale}" height="${g.h * scale}" viewBox="0 0 ${g.w} ${g.h}" shape-rendering="crispEdges" ${extra}>${rects}</svg>`;
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
h2{font:700 15px D;letter-spacing:.14em;color:#e6eef0;margin:30px 0 12px}
.sub{font:13px M;color:#6f8a94;margin:6px 0 26px;letter-spacing:.06em;max-width:1300px}
.lab{font:11px M;letter-spacing:.14em;color:#6f8a94;text-transform:uppercase}
svg{display:block}
.grid{display:flex;gap:18px}
.card{width:400px;padding:18px;border:1px solid #1d3038;background:rgba(10,22,28,.92)}
.card.top{border-color:#c98b5e}
.ch{display:flex;align-items:baseline;gap:10px;font:700 17px D;letter-spacing:.12em;color:#e6eef0}
.num{font:12px M;color:#6f8a94}
.ch i{margin-left:auto;font:normal 10px M;letter-spacing:.14em;color:#071015;background:#c98b5e;padding:2px 6px}
.pitch{font-size:13px;color:#9fb3ba;height:58px;margin:6px 0 12px}
.big{display:flex;justify-content:center;padding:12px 0;background:#0b1a20;border:1px solid #16272e}
.row,.states{display:flex;gap:10px;margin-top:12px;align-items:flex-start}
.cell{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.tile{display:flex;gap:10px;align-items:center;justify-content:center;padding:8px;border:1px solid #1d3038;min-height:52px}
.tile.dark{background:#0b1a20}.tile.light{background:#dfe7ea}.tile.paper{background:#eef2f3}
.tile.al{border-color:#ff4d42}
.states .tile{padding:3px}
.states .lab{font-size:10px}
.anim{display:flex;gap:22px;align-items:flex-start;padding:18px;border:1px solid #c98b5e;background:rgba(10,22,28,.92)}
.pair{display:flex;flex-direction:column;gap:8px}
.pair>div{display:flex;gap:8px}
.arrow{font:14px M;color:#6f8a94;align-self:center}
.note{margin-top:22px;font:12px M;color:#6f8a94;letter-spacing:.04em;max-width:1300px}
</style>`;

function card(id, i) {
  const c = CONCEPTS[id];
  const g = draw(c);
  const mini = drawMini(id);
  return `<div class="card ${id === TOP ? 'top' : ''}">
    <div class="ch"><span class="num">0${i + 1}</span><b>${c.name.toUpperCase()}</b>${id === TOP ? '<i>RECOMMENDED</i>' : ''}</div>
    <p class="pitch">${c.pitch}</p>
    <div class="big">${svg(g, 11)}</div>
    <div class="row">
      <div class="cell"><div class="tile dark">${svg(g, 2)}${svg(g, 1)}</div><span class="lab">64 + 32px dark</span></div>
      <div class="cell"><div class="tile light">${svg(g, 2)}${svg(g, 1)}</div><span class="lab">64 + 32px light</span></div>
    </div>
    <div class="row">
      <div class="cell"><div class="tile dark">${svg(mini, 4)}${svg(mini, 2)}${svg(mini, 1)}</div><span class="lab">16px master · 4× 2× 1×</span></div>
      <div class="cell"><div class="tile light">${svg(mini, 1)}</div><span class="lab">16 light</span></div>
    </div>
    <div class="row">
      <div class="cell"><div class="tile paper">${svg(g, 4, { mode: 'mono' })}</div><span class="lab">one colour</span></div>
      <div class="cell"><div class="tile dark">${svg(g, 4, { mode: 'monoInv', ink: '#c9d6da' })}</div><span class="lab">inverse</span></div>
    </div>
    <div class="states">${['idle', 'speaking', 'thinking', 'alert'].map((s) => `<div class="cell"><div class="tile dark ${s === 'alert' ? 'al' : ''}">${svg(draw(c, s), 2)}</div><span class="lab">${s}</span></div>`).join('')}</div>
  </div>`;
}

function conceptsPage() {
  const c = CONCEPTS[TOP];
  const f = (s) => svg(draw(c, s), 6, { extra: 'style="background:#0b1a20;border:1px solid #1d3038"' });
  return `${HEAD}<div id="sheet">
    <h1>MILO // ROBOT CONCEPTS V4 <span>HEAD ONLY · 32×32 DETAILED MASTER · 16×16 HAND-SIMPLIFIED</span></h1>
    <p class="sub">Head only, in a composed, on-duty tone: narrowed eyes, a flat mouth line and restrained glow. The states are carried by the screen face and the status light (headband pod, cup antenna or mic tip). Each material has a 3–4 tone ramp lit from the top-left, with a coloured outline (line colour on lit edges, near-black on shadowed edges). The CRT glass has scanlines, an eye glow and a reflection. The orange status light turns red only in alert.</p>
    <div class="grid">${['crt', 'tv', 'operator'].map(card).join('')}</div>
    <h2>${c.name.toUpperCase()} · ANIMATION FRAME PAIRS</h2>
    <div class="anim">
      <div class="pair"><div>${f('idle')}${f('blink')}</div><span class="lab">idle · steady ⇄ blink (every ~5.6s)</span></div>
      <div class="pair"><div>${f('speaking')}${f('speakB')}</div><span class="lab">speaking · line ⇄ short line, driven by text</span></div>
    </div>
    <p class="note">Palette: shell #e2ebee / #c7d5da / #9db1b9 · headphones #a9bfc7 / #87a2ac / #66828d · cushions #34464e · glass #16302a–#2e5462 · glow #a6dce8 · blue screen #90b3bf · status #c98b5e · alert only #ff4d42. The one-colour versions are a value split: the outlines, glass, cushions and headphones print as ink, and the shell and the glowing face stay paper.</p>
  </div>`;
}

function tee(fill) {
  return `<svg width="330" height="330" viewBox="0 0 330 330"><path d="M110 22 L60 40 L10 96 L52 132 L76 108 L76 312 L254 312 L254 108 L278 132 L320 96 L270 40 L220 22 Q165 62 110 22Z" fill="${fill}" stroke="rgba(0,0,0,.25)" stroke-width="2"/><path d="M110 22 Q165 62 220 22" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="6"/></svg>`;
}

function merchPage() {
  const c = CONCEPTS[TOP];
  const g = draw(c);
  const gold = { ...PAL, K: '#b39a62', lL: '#c8b07a', lP: '#c8b07a', lC: '#c8b07a', lO: '#c8b07a', lS: '#c8b07a' };
  return `${HEAD}<style>
.mrow{display:flex;gap:22px;align-items:flex-start}
.m{display:flex;flex-direction:column;gap:8px}
.m>div{width:330px;height:330px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.stk{background:radial-gradient(circle at 30% 20%,#3a4b52,#222f34)}
.die{filter:drop-shadow(5px 0 0 #f4f6f6) drop-shadow(-5px 0 0 #f4f6f6) drop-shadow(0 5px 0 #f4f6f6) drop-shadow(0 -5px 0 #f4f6f6) drop-shadow(3px 6px 6px rgba(0,0,0,.45));transform:rotate(-6deg)}
.pinbg{background:#c9c2b4}
.card2{width:268px;height:290px;background:#0d1a20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;box-shadow:0 8px 18px rgba(0,0,0,.35)}
.pin{filter:drop-shadow(0 3px 2px rgba(0,0,0,.6))}
.bc{font:700 14px D;letter-spacing:.3em;color:#c8b07a}
.teebg{background:#a9b6ba}
.print{position:absolute;top:104px;display:flex;flex-direction:column;align-items:center;gap:8px}
.print span{font:700 13px D;letter-spacing:.32em}
.patch{background:#5a4a3c;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 4px)}
.patch::before{content:'';position:absolute;width:256px;height:256px;border-radius:50%;background:#16252d;box-shadow:0 0 0 9px #66828d,0 0 0 11px #47606a,0 6px 14px 11px rgba(0,0,0,.4)}
.patch::after{content:'';position:absolute;width:242px;height:242px;border-radius:50%;border:2px dashed rgba(199,213,218,.45)}
.patch svg{position:relative;z-index:1}
.states2{display:flex;gap:14px;margin-top:26px;align-items:flex-end}
</style><div id="sheet"><h1>MILO // MERCH MOCK V4 <span>${c.name.toUpperCase()} · RECOMMENDED</span></h1>
  <p class="sub">Head-only master. The sticker, pin, colour tee and patch use the 32×32 master. The pin swaps the outlines for gold metal lines, and the ash tee uses the one-colour version.</p>
  <div class="mrow">
    <div class="m"><div class="stk">${svg(g, 8, { extra: 'class="die"' })}</div><span class="lab">die-cut sticker · 3in</span></div>
    <div class="m"><div class="pinbg"><div class="card2">${svg(g, 6.5, { pal: gold, extra: 'class="pin"' })}<span class="bc">MILOOPS</span></div></div><span class="lab">hard-enamel pin · gold plating · 1.5in</span></div>
    <div class="m"><div class="teebg">${tee('#1b2a32')}<div class="print">${svg(g, 3.5)}<span style="color:#c9d6da">MILOOPS</span></div></div><span class="lab">tee · colour print on charcoal</span></div>
    <div class="m"><div class="teebg">${tee('#d9e1e3')}<div class="print">${svg(g, 3.5, { mode: 'mono' })}<span style="color:${PAL.K}">MILOOPS</span></div></div><span class="lab">tee · one-ink print on ash</span></div>
    <div class="m"><div class="patch">${svg(g, 6)}</div><span class="lab">embroidered patch · 3.5in</span></div>
  </div>
  <div class="states2">${['idle', 'speaking', 'thinking', 'alert'].map((s) => `<div class="m" style="gap:6px">${svg(draw(c, s), 4, { extra: 'style="background:#0b1a20;border:1px solid ' + (s === 'alert' ? '#ff4d42' : '#1d3038') + '"' })}<span class="lab">sticker set · ${s}</span></div>`).join('')}
    <div class="m" style="gap:6px">${svg(drawMini(TOP), 8, { extra: 'style="background:#0b1a20;border:1px solid #1d3038"' })}<span class="lab">16px favicon master</span></div></div>
</div>`;
}

export { CONCEPTS, PAL, draw, drawMini };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
  for (const [file, html] of [
    ['milo-robot-concepts-v4.png', conceptsPage()],
    ['milo-robot-merch-v4.png', merchPage()],
  ]) {
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#sheet').screenshot({ path: join(OUT, file) });
    console.log('wrote', join(OUT, file));
  }
  await browser.close();
}
