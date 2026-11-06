// Draws Scout and writes src/milo/art.ts: node tools/bake-scout.mjs
// The art is code so a change to the cap or the pack redoes every expression. A head sits at (OX, OY) on a 32×37
// grid (50×37 at night, for the flashlight beam); expressions are stored as patches over the idle frame.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OX = 3;
const OY = 6;

const PALETTE = {
  K: '#1d2622',
  S: '#eae3cf',
  s: '#d6cdb4',
  d: '#b4aa8f', // outline, shell
  C: '#14241f',
  D: '#18302a',
  E: '#2c5a48',
  G: '#6fbf8f',
  H: '#b4e8c0',
  I: '#eaffe9', // screen, glow
  g: '#3f6b45',
  h: '#5a8a5c',
  j: '#2c4f35',
  n: '#223d2b',
  W: '#f2ecd8', // cap
  o: '#e2711d',
  O: '#f6a04d',
  Q: '#8f5a2c',
  R: '#d8342a',
  r: '#ff7a66', // status light: on, dim, alert
  p: '#b9562a',
  q: '#d67a45',
  u: '#8a3d1d',
  t: '#6e4a2e',
  y: '#e6b34a', // pack, straps, buckles
  b: '#d8c79c',
  a: '#b39f70',
  e: '#2a6f86',
  m: '#9aa6a0', // bedroll, bottle
  f: '#4a544e',
  F: '#7d8a82',
  L: '#fff3c4',
  x: '#ffe08a57',
  z: '#ffe08a33',
  v: '#ffe08a17', // flashlight, beam
};
/** Palette key -> tone, for the single-ink style. K outline, l line, R alert, everything else prints. */
const TONES = Object.fromEntries(
  Object.keys(PALETTE).map((k) => {
    if ('RrQ'.includes(k)) return [k, 'R0'];
    if ('KCDEnjuf'.includes(k)) return [k, 'K'];
    return [k, 'H'.includes(k) ? 'G1' : 'G0'];
  }),
);

function grid(w, h) {
  const cells = Array.from({ length: h }, () => Array(w).fill('.'));
  const px = (x, y, k) => {
    if (y >= 0 && y < h && x >= 0 && x < w) cells[y][x] = k;
  };
  const rect = (x0, y0, x1, y1, k) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, k);
  };
  const round = (x0, y0, x1, y1, k, r) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = Math.min(x - x0, x1 - x);
        const dy = Math.min(y - y0, y1 - y);
        if (dx + dy < r) continue;
        px(x, y, dx === 0 || dy === 0 || dx + dy === r ? 'K' : k);
      }
  };
  return { px, rect, round, rows: () => cells.map((r) => r.join('')) };
}

function pack({ px, rect }, x, y) {
  // Bedroll on top, behind the cap.
  rect(x + 1, y - 6, x + 24, y - 2, 'K');
  rect(x + 1, y - 5, x + 24, y - 3, 'b');
  rect(x + 2, y - 3, x + 23, y - 3, 'a');
  for (const [cx, cy] of [
    [1, -6],
    [24, -6],
    [1, -2],
    [24, -2],
  ])
    px(x + cx, y + cy, '.');
  px(x + 1, y - 4, 'a');
  px(x + 24, y - 4, 'a');
  rect(x + 3, y - 5, x + 3, y - 3, 't');
  rect(x + 22, y - 5, x + 22, y - 3, 't');
  // The square body: one pixel showing each side, with flap buckles.
  rect(x - 2, y - 1, x + 27, y + 25, 'K');
  rect(x - 1, y, x + 26, y + 24, 'p');
  rect(x - 1, y, x + 26, y, 'q');
  rect(x - 1, y + 1, x - 1, y + 24, 'q');
  rect(x + 26, y + 1, x + 26, y + 24, 'u');
  px(x - 1, y + 3, 'y');
  px(x + 26, y + 3, 'y');
  // Side pocket on the left, water bottle on the right.
  rect(x - 3, y + 13, x - 1, y + 24, 'K');
  rect(x - 2, y + 14, x - 1, y + 23, 'u');
  rect(x - 2, y + 14, x - 1, y + 14, 'q');
  px(x - 2, y + 17, 'y');
  rect(x + 26, y + 6, x + 28, y + 24, 'K');
  rect(x + 27, y + 7, x + 27, y + 15, 'e');
  px(x + 27, y + 7, 'm');
  rect(x + 26, y + 16, x + 28, y + 16, 'K');
  rect(x + 26, y + 17, x + 27, y + 23, 'u');
  px(x + 27, y + 19, 'y');
}

function head({ px, rect, round }, x, y) {
  round(x, y + 5, x + 25, y + 27, 'S', 3);
  rect(x + 23, y + 8, x + 24, y + 25, 's');
  rect(x + 2, y + 25, x + 23, y + 26, 's');
  rect(x + 3, y + 26, x + 22, y + 26, 'd');
  rect(x + 5, y + 28, x + 20, y + 29, 'd');
  rect(x + 5, y + 30, x + 20, y + 30, 'K');
  rect(x + 4, y + 28, x + 4, y + 29, 'K');
  rect(x + 21, y + 28, x + 21, y + 29, 'K');
  round(x + 4, y + 7, x + 21, y + 22, 'C', 2);
  for (let r = y + 9; r < y + 21; r += 2) rect(x + 5, r, x + 20, r, 'D');
  rect(x + 6, y + 9, x + 7, y + 9, 'E');
  px(x + 6, y + 10, 'E');
  rect(x + 5, y + 24, x + 9, y + 24, 'd');
  for (const c of [17, 19, 21]) px(x + c, y + 24, 'K');
  // Pack straps over the shell.
  rect(x + 2, y + 8, x + 2, y + 25, 't');
  rect(x + 23, y + 8, x + 23, y + 25, 't');
  rect(x + 1, y + 17, x + 3, y + 17, 'y');
  rect(x + 22, y + 17, x + 24, y + 17, 'y');
  // Cap: a soft round crown, then a brim narrower than the head.
  const crown = [
    [9, 16],
    [7, 18],
    [6, 19],
    [5, 20],
    [5, 20],
    [4, 21],
    [4, 21],
    [4, 21],
    [4, 21],
    [4, 21],
  ];
  crown.forEach(([l, r], i) => {
    rect(x + l, y - 4 + i, x + r, y - 4 + i, 'K');
    rect(x + l + 1, y - 4 + i, x + r - 1, y - 4 + i, 'g');
  });
  rect(x + 9, y - 4, x + 16, y - 4, 'K');
  rect(x + 6, y - 1, x + 7, y + 3, 'h');
  rect(x + 8, y - 2, x + 9, y - 2, 'h');
  rect(x + 18, y, x + 20, y + 4, 'j');
  rect(x + 12, y - 5, x + 13, y - 5, 'K');
  rect(x + 3, y + 5, x + 22, y + 5, 'K');
  rect(x + 3, y + 6, x + 22, y + 6, 'n');
  rect(x + 2, y + 7, x + 23, y + 7, 'K');
  rect(x + 5, y + 6, x + 12, y + 6, 'j');
  px(x + 2, y + 6, 'K');
  px(x + 23, y + 6, 'K');
  // Cap patch with the status light.
  rect(x + 10, y - 1, x + 15, y + 3, 'W');
  light({ rect }, x, y, 'on');
}

function light({ rect }, x, y, kind) {
  const [body, top] = { on: ['o', 'O'], dim: ['Q', 'Q'], alert: ['R', 'r'] }[kind];
  rect(x + 11, y, x + 14, y + 2, body);
  rect(x + 12, y, x + 13, y, top);
}

function eyes({ px, rect }, x, y, kind) {
  for (const ex of [x + 8, x + 15]) {
    const r = y + 13;
    if (kind === 'open') {
      rect(ex, r, ex + 2, r, 'G');
      rect(ex - 1, r + 1, ex + 3, r + 1, 'E');
      rect(ex, r + 1, ex + 2, r + 1, 'H');
    } else if (kind === 'closed') {
      rect(ex - 1, r + 1, ex + 3, r + 1, 'E');
      rect(ex, r + 1, ex + 2, r + 1, 'G');
    } else if (kind === 'aside') {
      rect(ex + 2, r, ex + 3, r, 'G');
      rect(ex + 2, r + 1, ex + 3, r + 1, 'H');
    } else {
      rect(ex, r - 1, ex + 2, r - 1, 'G');
      rect(ex - 1, r, ex + 3, r, 'E');
      rect(ex, r, ex + 2, r, 'H');
      rect(ex, r + 1, ex + 2, r + 1, 'H');
      px(ex + 1, r, 'I');
    }
  }
}

function mouth({ px, rect }, x, y, kind) {
  const r = y + 18;
  const c = x + 12;
  if (kind === 'rest') rect(c, r, c + 1, r, 'G');
  if (kind === 'open') {
    rect(c - 2, r - 1, c + 3, r - 1, 'E');
    rect(c - 1, r - 1, c + 2, r - 1, 'H');
    rect(c, r, c + 1, r, 'G');
  }
  if (kind === 'mid') rect(c - 1, r, c + 2, r, 'H');
  if (kind === 'aside') px(c + 2, r, 'G');
}

function flashlight(g) {
  const ly = OY + 16;
  rectBeam(g, ly);
  g.rect(OX + 22, ly - 2, OX + 30, ly + 2, 'K');
  g.rect(OX + 23, ly - 1, OX + 29, ly + 1, 'f');
  g.rect(OX + 23, ly - 1, OX + 29, ly - 1, 'F');
  g.px(OX + 25, ly, 'y');
  g.rect(OX + 30, ly - 1, OX + 30, ly + 1, 'L');
}

/** The beam starts at the lens, widens, dips a little and dissolves. */
function rectBeam({ px }, ly) {
  for (let i = 0, x = OX + 31; x < 50; i++, x++) {
    const half = 1 + Math.floor((i * 2) / 3);
    const c = ly + Math.floor(i / 5);
    for (let y = c - half; y <= c + half; y++) {
      const edge = Math.abs(y - c) >= half;
      let band = i < 6 ? 0 : i < 11 ? 1 : 2;
      if (edge) band += 1;
      if (i >= 15) band = 3;
      if (band === 3 && (x + y) % 2) continue;
      px(x, y, 'xzvv'[band]);
    }
  }
}

function frame({ night = false, e = 'open', m = 'rest', l = 'on' } = {}) {
  const g = grid(night ? 50 : 32, 37);
  pack(g, OX, OY);
  head(g, OX, OY);
  eyes(g, OX, OY, e);
  mouth(g, OX, OY, m);
  light(g, OX, OY, l);
  if (night) flashlight(g);
  return g.rows();
}

/** What changed from the idle frame, as [row, col, keys] runs. */
function patch(rows, base) {
  const out = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] === base[y][x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x] !== base[y][x]) x++;
      out.push([y, start, row.slice(start, x)]);
    }
  });
  return out;
}

const HEAD = frame();
const patches = {
  eyes: {
    closed: patch(frame({ e: 'closed' }), HEAD),
    aside: patch(frame({ e: 'aside' }), HEAD),
    wide: patch(frame({ e: 'wide' }), HEAD),
  },
  mouths: {
    open: patch(frame({ m: 'open' }), HEAD),
    mid: patch(frame({ m: 'mid' }), HEAD),
    aside: patch(frame({ m: 'aside' }), HEAD),
  },
  lights: { dim: patch(frame({ l: 'dim' }), HEAD), alert: patch(frame({ l: 'alert' }), HEAD) },
};

const MINI = [
  '...KKKKKKKKKK...',
  '..bbbKKKKKKbbb..',
  '..bbKgggggjKbb..',
  '...KghWWgjjjK...',
  '.ppKghoogjjjKpe.',
  '.pKnnnnnnnnnnKe.',
  '.pKKKKKKKKKKKKe.',
  '.pKSSSSSSSSSSKp.',
  '.yKSCCCCCCCCSKp.',
  '.pKSCHHCCHHCSKp.',
  '.pKSCCCCCCCCSKp.',
  '.uKSCCCGGCCCSKu.',
  '.uKSCCCCCCCCSKu.',
  '.uKSSSSSSSSSsKu.',
  '...KKKKKKKKKK...',
  '................',
];

const json = (v) => JSON.stringify(v);
const rowsTs = (rows) => `[\n${rows.map((r) => `  '${r}',`).join('\n')}\n]`;
const out = fileURLToPath(new URL('../src/milo/art.ts', import.meta.url));
writeFileSync(
  out,
  `// Generated by tools/bake-scout.mjs. Do not edit by hand.
/* eslint-disable */
import type { Patch } from './types';

/** Palette key -> colour. R and r appear only in the alert patch; x, z and v are the see-through flashlight beam. */
export const PALETTE: Record<string, string> = ${json(PALETTE)};

/** Palette key -> tone, for the single-ink style. */
export const TONES: Record<string, string> = ${json(TONES)};

/** 32×37 Scout, idle: steady eyes, flat mouth, status light on. */
export const HEAD: string[] = ${rowsTs(HEAD)};

/** 50×37 Scout for night: the same head, so the same patches apply, with a flashlight clipped to the strap. */
export const NIGHT: string[] = ${rowsTs(frame({ night: true }))};

export const HEAD_PATCHES = ${json(patches)} satisfies Record<string, Record<string, Patch>>;

/** Hand-drawn 16×16 Scout for xs and favicons. Never animates. */
export const MINI: string[] = ${rowsTs(MINI)};

export const MINI_ALERT: Patch = [[4, 6, 'RR']];
`,
);
