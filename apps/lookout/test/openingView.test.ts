import type { LaidOutNode } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { openingView } from '../src/features/map/openingView';

const node = (state: string, x: number, y: number) => ({ state, x, y }) as unknown as LaidOutNode;
const size = { w: 800, h: 400 };

describe('openingView', () => {
  it('shows the whole trail when it fits at a readable size', () => {
    const fit = { k: 0.9, x: 10, y: 20 };
    expect(openingView({ fit, nodes: [node('frontier', 0, 0)], size, pad: 32 })).toBe(fit);
  });

  it('otherwise centres a readable zoom on the work in progress', () => {
    const fit = { k: 0.3, x: 0, y: 0 };
    const nodes = [node('decided', 0, 0), node('frontier', 300, 0), node('claimed', 600, 100)];
    const view = openingView({ fit, nodes, size, pad: 32 });
    expect(view.k).toBeGreaterThan(fit.k);
    expect(view.x + (600 + 32 + 100) * view.k).toBeCloseTo(size.w / 2);
    expect(view.y + (100 + 32 + 28) * view.k).toBeCloseTo(size.h / 2);
  });
});
