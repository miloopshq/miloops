import { type LaidOutNode, type LayoutDirection, NODE_H, NODE_W } from '@teamtrail/core';
import { SIGN_TIP } from './edgePath';

interface Laid {
  direction: LayoutDirection;
  nodes: LaidOutNode[];
  edges: { from: LaidOutNode; to: LaidOutNode }[];
  width: number;
  height: number;
  graphH: number;
}

/** Where the X goes, after the last tickets, and the map size once it's included. */
export function destinationSpot(l: Laid) {
  if (l.direction === 'LR') {
    const x = l.width + 96;
    return { x, y: l.graphH / 2, right: x + 60, bottom: l.height };
  }
  const y = l.graphH + 76;
  return { x: l.width / 2, y, right: l.width, bottom: Math.max(l.height, y + 70) };
}

/** The last stretches: from every ticket nothing else waits for, on to the X. */
export function destinationTrail(l: Laid, spot: { x: number; y: number }) {
  const blocking = new Set(l.edges.map((e) => e.from));
  const lastOnes = l.nodes.filter((n) => n.state !== 'out-of-scope' && !blocking.has(n));
  return lastOnes.map((n) => {
    if (l.direction === 'LR') {
      const x1 = n.x + NODE_W + SIGN_TIP;
      const y1 = n.y + NODE_H / 2;
      const x2 = spot.x - 44;
      const mx = (x1 + x2) / 2;
      return `M${x1} ${y1}C${mx} ${y1} ${mx} ${spot.y} ${x2} ${spot.y}`;
    }
    const x1 = n.x + NODE_W / 2;
    const y1 = n.y + NODE_H + 16;
    const y2 = spot.y - 44;
    const my = (y1 + y2) / 2;
    return `M${x1} ${y1}C${x1} ${my} ${spot.x} ${my} ${spot.x} ${y2}`;
  });
}
