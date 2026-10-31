import type { LaidOutNode, LayoutDirection } from '@miloops-hq/core';
import { edgePath } from './edgePath';

export function GraphEdge({ from, to, direction }: { from: LaidOutNode; to: LaidOutNode; direction: LayoutDirection }) {
  const open = from.ticket.state === 'open';
  return (
    <path
      className={`edge ${open ? 'edge-open' : 'edge-done'}`}
      d={edgePath(direction, from, to)}
      markerEnd="url(#arrow)"
    />
  );
}
