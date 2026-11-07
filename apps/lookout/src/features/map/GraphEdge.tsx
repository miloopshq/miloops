import type { LaidOutNode, LayoutDirection } from '@teamtrail/core';
import { edgePath } from './edgePath';

/** A stretch of trail between two tickets: a cleared path with dashes on it. A pending reroute draws the stretches it
 * would add and remove differently. */
export function GraphEdge(props: {
  from: LaidOutNode;
  to: LaidOutNode;
  direction: LayoutDirection;
  added?: boolean;
  removed?: boolean;
}) {
  const { from, to, direction } = props;
  const walked = from.ticket.state !== 'open';
  const classes = [
    'edge',
    walked ? 'edge-done' : 'edge-open',
    props.added ? 'edge-added' : '',
    props.removed ? 'edge-removed' : '',
  ];
  const d = edgePath(direction, from, to);
  return (
    <>
      <path className="edge-path" d={d} />
      <path className={classes.join(' ')} d={d} />
    </>
  );
}
