import { type LaidOutNode, type LayoutDirection, NODE_H, NODE_W } from '@miloops-hq/core';

/** Cubic edge from the blocker's exit side to the blocked ticket's entry side. */
export function edgePath(direction: LayoutDirection, from: LaidOutNode, to: LaidOutNode) {
  if (direction === 'LR') {
    const x1 = from.x + NODE_W,
      y1 = from.y + NODE_H / 2,
      x2 = to.x - 4,
      y2 = to.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  }
  const x1 = from.x + NODE_W / 2,
    y1 = from.y + NODE_H,
    x2 = to.x + NODE_W / 2,
    y2 = to.y - 4;
  const my = (y1 + y2) / 2;
  return `M${x1} ${y1}C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
}
