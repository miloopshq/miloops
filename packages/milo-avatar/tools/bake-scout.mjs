// Draws Scout and writes src/milo/art.ts: node tools/bake-scout.mjs
// The art is code so a change to the cap or the pack redoes every expression. A head sits at (OX, OY) on a 36×38
// grid, the same size by day and by night; expressions are stored as patches over the idle frame.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OX = 5;
const OY = 7;

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
  L: '#fff3c4',
  x: '#ffe08a57',
  z: '#ffe08a33',
  v: '#ffe08a17', // lamp, glow
};
/** Palette key -> tone, for the single-ink style. K outline, l line, R alert, everything else prints. */
const TONES = Object.fromEntries(
  Object.keys(PALETTE).map((k) => {
    if ('RrQ'.includes(k)) return [k, 'R0'];
    if ('KCDEnjuf'.includes(k)) return [k, 'K'];
    return [k, 'H'.includes(k) ? 'G1' : 'G0'];
  }),
);

/** The headphone band's left and right edge per row, from the top. */
const BAND_ARC = [
  [8, 17],
  [6, 19],
  [4, 21],
  [3, 22],
  [2, 23],
  [1, 24],
  [0, 25],
  [-1, 26],
];

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

function headphones({ rect }, x, y) {
  // The band arcs over the cap: two pixels thick, outlined by the darker tone.
  BAND_ARC.forEach(([l, r], i) => {
    rect(x + l, y - 8 + i, x + r, y - 8 + i, 'f');
    if (i > 0) rect(x + l + 2, y - 8 + i, x + r - 2, y - 8 + i, '.');
  });
  rect(x + 8, y - 7, x + 17, y - 7, 'F');
  rect(x - 1, y, x, y + 9, 'f');
  rect(x + 25, y, x + 26, y + 9, 'f');
  // Ear cups on both sides of the shell.
  for (const [l, r, light, dark] of [
    [-4, -1, 'q', 'u'],
    [26, 29, 'q', 'u'],
  ]) {
    rect(x + l, y + 9, x + r, y + 23, 'K');
    rect(x + l + 1, y + 10, x + r - 1, y + 22, 'p');
    rect(x + l + 1, y + 10, x + r - 1, y + 10, light);
    rect(x + l + 1, y + 21, x + r - 1, y + 22, dark);
    rect(x + l, y + 9, x + l, y + 9, '.');
    rect(x + r, y + 9, x + r, y + 9, '.');
    rect(x + l, y + 23, x + l, y + 23, '.');
    rect(x + r, y + 23, x + r, y + 23, '.');
  }
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

/** A headlamp on the crown of the cap. Its glow fills the gap under the band, so the sprite stays the same size. */
function headlamp(g, x, y) {
  g.rect(x + 10, y - 5, x + 15, y - 2, 'K');
  g.rect(x + 11, y - 4, x + 14, y - 3, 'y');
  g.rect(x + 12, y - 4, x + 13, y - 3, 'L');
}

function glow(rows, x, y) {
  const cx = x + 12.5;
  return rows.map((row, r) => {
    const [left, right] = BAND_ARC[r - (y - 8)] ?? [];
    if (left === undefined || r === y - 8) return row;
    return [...row]
      .map((key, c) => {
        if (key !== '.' || c <= x + left || c >= x + right) return key;
        const far = Math.abs(c - cx);
        if (far < 5) return 'x';
        return far < 8 ? 'z' : 'v';
      })
      .join('');
  });
}

function frame({ night = false, e = 'open', m = 'rest', l = 'on' } = {}) {
  const g = grid(36, 38);
  headphones(g, OX, OY);
  head(g, OX, OY);
  eyes(g, OX, OY, e);
  mouth(g, OX, OY, m);
  light(g, OX, OY, l);
  if (!night) return g.rows();
  headlamp(g, OX, OY);
  return glow(g.rows(), OX, OY);
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
  '.....ffffff.....',
  '....fKKKKKKf....',
  '...fKgggggjKf...',
  '...fKgWWgjjKf...',
  '..ffKgoogjjKff..',
  '.pfKnnnnnnnnKfp.',
  '.pKKKKKKKKKKKKp.',
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

/** Palette key -> colour. R and r appear only in the alert patch; x, z and v are the see-through lamp glow. */
export const PALETTE: Record<string, string> = ${json(PALETTE)};

/** Palette key -> tone, for the single-ink style. */
export const TONES: Record<string, string> = ${json(TONES)};

/** 36×38 Scout, idle: steady eyes, flat mouth, status light on. */
export const HEAD: string[] = ${rowsTs(HEAD)};

/** Scout for night: the same size and head, so the same patches apply, with a headlamp on the cap. */
export const NIGHT: string[] = ${rowsTs(frame({ night: true }))};

export const HEAD_PATCHES = ${json(patches)} satisfies Record<string, Record<string, Patch>>;

/** Hand-drawn 16×16 Scout for xs and favicons. Never animates. */
export const MINI: string[] = ${rowsTs(MINI)};

export const MINI_ALERT: Patch = [[4, 6, 'RR']];
`,
);
