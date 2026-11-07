import { type LaidOutNode, NODE_H, NODE_W } from '@miloops-hq/core';

/** Below this zoom a ticket's title is hard to read. */
const READABLE_ZOOM = 0.72;

/**
 * How the map opens: the whole trail if it fits at a readable size, otherwise a readable zoom centred on the work in
 * progress (or what's ready next). Fit still shows the whole trail.
 */
export function openingView<V extends { k: number; x: number; y: number }>(input: {
  fit: V;
  nodes: LaidOutNode[];
  size: { w: number; h: number };
  pad: number;
}): { k: number; x: number; y: number } {
  const { fit, nodes, size, pad } = input;
  if (fit.k >= READABLE_ZOOM) return fit;
  const focus = nodes.find((n) => n.state === 'claimed') ?? nodes.find((n) => n.state === 'frontier') ?? nodes[0];
  if (!focus) return fit;
  const k = READABLE_ZOOM;
  return {
    k,
    x: size.w / 2 - (focus.x + pad + NODE_W / 2) * k,
    y: size.h / 2 - (focus.y + pad + NODE_H / 2) * k,
  };
}
