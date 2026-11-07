// Draws Scout and writes src/milo/art.ts: node tools/bake-scout.mjs
// The art is code so a change to the cap or the pack redoes every expression. A head sits at (OX, OY) on a 34×40
// grid, the same size by day and by night; expressions are stored as patches over the idle frame.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OX = 4;
const OY = 9;

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
  y: '#e6b34a', // pack, straps, buckles // bedroll, bottle
  f: '#4a544e',
  F: '#7d8a82',
  L: '#fff3c4', // lamp, glow
};
/** Palette key -> tone, for the single-ink style. K outline, l line, R alert, everything else prints. */
const TONES = Object.fromEntries(
  Object.keys(PALETTE).map((k) => {
    if ('RrQ'.includes(k)) return [k, 'R0'];
    if ('KCDEnjuf'.includes(k)) return [k, 'K'];
    return [k, 'H'.includes(k) ? 'G1' : 'G0'];
  }),
);

/** The cap's crown: left and right edge per row, from the top. The headphone band hugs it just outside. */
const CROWN = [
  [9, 16],
  [7, 18],
  [5, 20],
  [4, 21],
  [3, 22],
  [3, 22],
  [2, 23],
  [2, 23],
  [2, 23],
  [2, 23],
  [2, 23],
  [2, 23],
  [2, 23],
];
const CROWN_TOP = -8;

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

function headphones({ px, rect }, x, y) {
  // A thin band over the cap, coming down to the ear cups.
  rect(x + 9, y + CROWN_TOP - 1, x + 16, y + CROWN_TOP - 1, 'F');
  CROWN.forEach(([l, r], i) => {
    px(x + l - 1, y + CROWN_TOP + i, 'F');
    px(x + r + 1, y + CROWN_TOP + i, 'F');
  });
  for (const [c, d] of [
    [1, 5],
    [0, 6],
    [-1, 7],
    [24, 5],
    [25, 6],
    [26, 7],
  ])
    px(x + c, y + d, 'F');
  // Only the ear cups show beside the head.
  for (const [l, r] of [
    [-3, -1],
    [26, 28],
  ]) {
    rect(l + x, y + 8, r + x, y + 20, 'K');
    rect(l + x + (l < 0 ? 1 : 0), y + 9, r + x - (l < 0 ? 0 : 1), y + 19, 'p');
    rect(l + x + (l < 0 ? 1 : 0), y + 9, r + x - (l < 0 ? 0 : 1), y + 9, 'q');
    rect(l + x + (l < 0 ? 1 : 0), y + 18, r + x - (l < 0 ? 0 : 1), y + 19, 'u');
  }
}

function head(g, x, y) {
  const { px, rect, round } = g;
  round(x, y + 5, x + 25, y + 27, 'S', 3);
  rect(x + 23, y + 8, x + 24, y + 25, 's');
  rect(x + 2, y + 25, x + 23, y + 26, 's');
  rect(x + 3, y + 26, x + 22, y + 26, 'd');
  rect(x + 5, y + 28, x + 20, y + 29, 'd');
  rect(x + 5, y + 30, x + 20, y + 30, 'K');
  rect(x + 4, y + 28, x + 4, y + 29, 'K');
  rect(x + 21, y + 28, x + 21, y + 29, 'K');
  round(x + 4, y + 9, x + 21, y + 22, 'C', 2);
  for (let r = y + 11; r < y + 21; r += 2) rect(x + 5, r, x + 20, r, 'D');
  rect(x + 6, y + 11, x + 7, y + 11, 'E');
  px(x + 6, y + 12, 'E');
  rect(x + 5, y + 24, x + 9, y + 24, 'd');
  for (const c of [17, 19, 21]) px(x + c, y + 24, 'K');
  headphones(g, x, y);
  // The cap is the main shape: a big round crown and a wide brim that curves down at its ends.
  CROWN.forEach(([l, r], i) => {
    const row = y + CROWN_TOP + i;
    rect(x + l, row, x + r, row, 'K');
    rect(x + l + 1, row, x + r - 1, row, 'g');
  });
  rect(x + 9, y + CROWN_TOP, x + 16, y + CROWN_TOP, 'K');
  rect(x + 5, y - 5, x + 7, y + 3, 'h');
  rect(x + 8, y - 6, x + 10, y - 6, 'h');
  rect(x + 19, y - 3, x + 22, y + 4, 'j');
  rect(x + 2, y + 5, x + 23, y + 5, 'K');
  rect(x + 2, y + 6, x + 23, y + 7, 'n');
  rect(x + 6, y + 6, x + 19, y + 6, 'j');
  rect(x + 1, y + 6, x + 1, y + 8, 'K');
  rect(x + 24, y + 6, x + 24, y + 8, 'K');
  rect(x + 2, y + 8, x + 23, y + 8, 'K');
  rect(x + 2, y + 9, x + 3, y + 9, 'K');
  rect(x + 22, y + 9, x + 23, y + 9, 'K');
  // Cap patch with the status light.
  rect(x + 10, y - 3, x + 15, y + 1, 'W');
  light(g, x, y, 'on');
}

function light({ rect }, x, y, kind) {
  const [body, top] = { on: ['o', 'O'], dim: ['Q', 'Q'], alert: ['R', 'r'] }[kind];
  rect(x + 11, y - 2, x + 14, y, body);
  rect(x + 12, y - 2, x + 13, y - 2, top);
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

/** A headlamp strapped on the crown of the cap, inside the band, so the sprite stays the same size. */
function headlamp(g, x, y) {
  g.rect(x + 10, y - 8, x + 15, y - 5, 'K');
  g.rect(x + 11, y - 7, x + 14, y - 6, 'y');
  g.rect(x + 12, y - 7, x + 13, y - 6, 'L');
}

function frame({ night = false, e = 'open', m = 'rest', l = 'on' } = {}) {
  const g = grid(34, 40);
  head(g, OX, OY);
  eyes(g, OX, OY, e);
  mouth(g, OX, OY, m);
  light(g, OX, OY, l);
  if (night) headlamp(g, OX, OY);
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
  '.....FFFFFF.....',
  '....FKKKKKKF....',
  '...FKgggggjKF...',
  '...FKgWWWgjKF...',
  '..FKggWooWgjKF..',
  '..FKggggggjjKF..',
  '.KKKnnnnnnnnKKK.',
  '.pKSSSSSSSSSSKp.',
  'ppKSCCCCCCCCSKpp',
  'ppKSCHHCCHHCSKpp',
  'ppKSCCCCCCCCSKpp',
  'ppKSCCCGGCCCSKpp',
  '.pKSCCCCCCCCSKp.',
  '..KSSSSSSSSSsK..',
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

/** Palette key -> colour. R and r appear only in the alert patch. */
export const PALETTE: Record<string, string> = ${json(PALETTE)};

/** Palette key -> tone, for the single-ink style. */
export const TONES: Record<string, string> = ${json(TONES)};

/** 34×40 Scout, idle: steady eyes, flat mouth, status light on. */
export const HEAD: string[] = ${rowsTs(HEAD)};

/** Scout for night: the same size and head, so the same patches apply, with a headlamp on the cap. */
export const NIGHT: string[] = ${rowsTs(frame({ night: true }))};

export const HEAD_PATCHES = ${json(patches)} satisfies Record<string, Record<string, Patch>>;

/** Hand-drawn 16×16 Scout for xs and favicons. Never animates. */
export const MINI: string[] = ${rowsTs(MINI)};

export const MINI_ALERT: Patch = [[4, 7, 'RR']];
`,
);
