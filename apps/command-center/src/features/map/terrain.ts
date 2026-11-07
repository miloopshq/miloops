import { NODE_H, NODE_W } from '@miloops-hq/core';

export type TerrainSprite = 'pine' | 'oak' | 'rock' | 'tuft';

export interface TerrainItem {
  sprite: TerrainSprite;
  x: number;
  y: number;
}
export interface TerrainRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Terrain {
  grass: TerrainRect[];
  water: TerrainRect[];
  items: TerrainItem[];
}

/** How far the landscape runs past the tickets, so panning doesn't hit an edge straight away. */
const MARGIN = 280;
/** Everything sits on the sprites' 4-unit pixel grid. */
const PIXEL = 4;
const MAX_ITEMS = 220;

const snap = (v: number) => Math.round(v / PIXEL) * PIXEL;

/** A small seeded random generator (mulberry32): the same trail always gets the same landscape. */
function seeded(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A blocky patch: a few overlapping rectangles around a centre. */
function blob(random: () => number, cx: number, cy: number, size: number) {
  return Array.from({ length: 6 }, () => {
    const w = size * (0.5 + random() * 0.7);
    const h = size * (0.3 + random() * 0.4);
    return {
      x: snap(cx + (random() - 0.5) * size * 0.8 - w / 2),
      y: snap(cy + (random() - 0.5) * size * 0.5 - h / 2),
      w: snap(w),
      h: snap(h),
    };
  });
}

/**
 * The faded landscape under a trail's tickets. Pure and deterministic: it depends only on the trail's id, the map's
 * size and where the tickets are. Trees and rocks stay clear of tickets so they never compete with them.
 */
export function terrainFor(input: { seed: string; width: number; height: number; nodes: { x: number; y: number }[] }) {
  const { width, height, nodes } = input;
  const random = seeded(input.seed);
  const pick = (from: number, to: number) => from + random() * (to - from);
  const clear = (x: number, y: number) =>
    !nodes.some((n) => x > n.x - 52 && x < n.x + NODE_W + 28 && y > n.y - 52 && y < n.y + NODE_H + 28);
  const area = (width + MARGIN * 2) * (height + MARGIN * 2);

  const grass = Array.from({ length: Math.round(area / 90000) }, () =>
    blob(random, pick(-MARGIN, width + MARGIN), pick(-MARGIN, height + MARGIN), pick(160, 360)),
  ).flat();

  const water = [
    ...blob(random, width + MARGIN * 0.55, height + MARGIN * 0.55, 300),
    ...blob(random, -MARGIN * 0.5, -MARGIN * 0.45, 220),
  ];

  const items: TerrainItem[] = [];
  const add = (sprite: TerrainSprite, x: number, y: number) => {
    if (items.length < MAX_ITEMS && clear(x, y)) items.push({ sprite, x: snap(x), y: snap(y) });
  };
  for (let i = 0; i < Math.round(area / 30000); i++) {
    const cx = pick(-MARGIN, width + MARGIN);
    const cy = pick(-MARGIN, height + MARGIN);
    const trees = 3 + Math.floor(random() * 5);
    for (let t = 0; t < trees; t++) {
      add(random() < 0.65 ? 'pine' : 'oak', cx + pick(-70, 70), cy + pick(-44, 44));
    }
  }
  for (let i = 0; i < Math.round(area / 45000); i++) {
    add(random() < 0.4 ? 'rock' : 'tuft', pick(-MARGIN, width + MARGIN), pick(-MARGIN, height + MARGIN));
  }
  items.sort((a, b) => a.y - b.y);
  return { grass, water, items } satisfies Terrain;
}
