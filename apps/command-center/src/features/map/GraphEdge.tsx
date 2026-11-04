import type { LaidOutNode, LayoutDirection } from '@miloops-hq/core';
import { edgePath } from './edgePath';

/** A blocking edge; `added` marks one a pending replan would add (drawn dashed). */
export function GraphEdge(props: { from: LaidOutNode; to: LaidOutNode; direction: LayoutDirection; added?: boolean }) {
  const { from, to, direction } = props;
  const open = from.ticket.state === 'open';
  const classes = ['edge', open ? 'edge-open' : 'edge-done', props.added ? 'edge-added' : ''];
  return <path className={classes.join(' ')} d={edgePath(direction, from, to)} markerEnd="url(#arrow)" />;
}
