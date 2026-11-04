import type { LaidOutNode, LayoutDirection } from '@miloops-hq/core';
import { edgePath } from './edgePath';

/** A blocking edge; a pending replan draws the ones it would add dashed and the ones it would remove struck. */
export function GraphEdge(props: {
  from: LaidOutNode;
  to: LaidOutNode;
  direction: LayoutDirection;
  added?: boolean;
  removed?: boolean;
}) {
  const { from, to, direction } = props;
  const open = from.ticket.state === 'open';
  const classes = [
    'edge',
    open ? 'edge-open' : 'edge-done',
    props.added ? 'edge-added' : '',
    props.removed ? 'edge-removed' : '',
  ];
  return <path className={classes.join(' ')} d={edgePath(direction, from, to)} markerEnd="url(#arrow)" />;
}
