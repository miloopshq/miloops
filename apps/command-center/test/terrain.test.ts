import { describe, expect, it } from 'vitest';
import { terrainFor } from '../src/features/map/terrain';

const nodes = [
  { x: 0, y: 0 },
  { x: 330, y: 112 },
];
const input = { seed: 'trail-1', width: 800, height: 400, nodes };

describe('terrainFor', () => {
  it('gives the same trail the same landscape', () => {
    expect(terrainFor(input)).toEqual(terrainFor({ ...input }));
  });

  it('gives different trails different landscapes', () => {
    expect(terrainFor(input)).not.toEqual(terrainFor({ ...input, seed: 'trail-2' }));
  });

  it('keeps trees and rocks clear of the tickets', () => {
    for (const item of terrainFor(input).items) {
      for (const n of nodes) {
        const insideX = item.x > n.x && item.x < n.x + 200;
        const insideY = item.y > n.y && item.y < n.y + 56;
        expect(insideX && insideY).toBe(false);
      }
    }
  });
});
