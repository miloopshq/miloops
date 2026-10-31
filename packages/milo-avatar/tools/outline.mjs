// Adds the 1px K outline around a hand-drawn fill sprite ('.' = empty) and prints rows to paste into frames.ts.
// Usage: node tools/outline.mjs fill.txt ['[[["overlay rows"], row, col], ...]' frames to preview]
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((r) => [...r]);
rows.forEach((r, i) => { if (r.length !== rows[0].length) throw new Error(`row ${i} len ${r.length}`); });
const H = rows.length, W = rows[0].length;
const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '.';
const out = rows.map((r, y) => r.map((c, x) => (c === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ? 'K' : c)));
const stamp = (g, lines, y0, x0) => lines.forEach((l, j) => [...l].forEach((c, i) => { if (c !== '.') g[y0 + j][x0 + i] = c; }));
const frames = JSON.parse(process.argv[3] || '[]');
const res = [out.map((r) => r.join(''))];
for (const f of frames) {
  const g = out.map((r) => r.slice());
  for (const [lines, y, x] of f) stamp(g, lines, y, x);
  res.push(g.map((r) => r.join('')));
}
console.log(res.map((g) => g.join('\n')).join('\n=====\n'));
