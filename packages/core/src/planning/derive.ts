import {
  DEFAULT_MAP_MODE,
  type Attention,
  type MapMode,
  type NodeState,
  type Ticket,
  type TicketType,
} from '../model/types';

export function attention(t: Pick<Ticket, 'type' | 'hitl'>): Attention {
  if (t.type === 'grilling' || t.type === 'prototype') return 'hitl';
  if (t.type === 'research') return 'afk';
  return t.hitl ? 'hitl' : 'afk';
}

/** Types whose HITL/AFK mode is chosen per ticket. */
export const FLEXIBLE_ATTENTION: TicketType[] = ['task', 'execute'];

export function nodeState(t: Ticket, byId: Map<string, Ticket>, mode: MapMode = DEFAULT_MAP_MODE): NodeState {
  if (t.state === 'closed') return t.closeReason === 'not_planned' ? 'out-of-scope' : 'decided';
  if (t.assignee) return 'claimed';
  if (mode === 'plan-only' && t.type === 'execute') return 'parked';
  const blocked = t.blockedBy.some((b) => byId.get(b)?.state === 'open');
  return blocked ? 'blocked' : 'frontier';
}

export function deriveStates(tickets: Ticket[], mode: MapMode = DEFAULT_MAP_MODE): Map<string, NodeState> {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  return new Map(tickets.map((t) => [t.id, nodeState(t, byId, mode)]));
}

/** Frontier = open, unblocked, unclaimed. Ordered by creation (oldest first). */
export function frontier(tickets: Ticket[], mode: MapMode = DEFAULT_MAP_MODE): Ticket[] {
  const s = deriveStates(tickets, mode);
  return tickets.filter((t) => s.get(t.id) === 'frontier').sort((a, b) => a.createdAt - b.createdAt);
}

export interface LaidOutNode {
  ticket: Ticket;
  state: NodeState;
  x: number;
  y: number;
  layer: number;
}

export const NODE_W = 200;
export const NODE_H = 56;

export type LayoutDirection = 'LR' | 'TB';

/**
 * Layered layout: a ticket's layer is the length of its longest blocking
 * chain. LR puts layers in columns, TB in rows. Out-of-scope tickets are
 * pulled into a separate quarantine strip below the graph.
 */
export function layout(tickets: Ticket[], direction: LayoutDirection = 'LR', mode: MapMode = DEFAULT_MAP_MODE) {
  const LAYER = direction === 'LR' ? 240 : 88;
  const LANE = direction === 'LR' ? 76 : 222;
  const states = deriveStates(tickets, mode);
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const t = byId.get(id);
    const v = t && t.blockedBy.length ? 1 + Math.max(...t.blockedBy.filter((b) => byId.has(b)).map(d), -1) : 0;
    visiting.delete(id);
    depth.set(id, v);
    return v;
  };
  const active = tickets.filter((t) => states.get(t.id) !== 'out-of-scope');
  const ruled = tickets.filter((t) => states.get(t.id) === 'out-of-scope');
  const layers: Ticket[][] = [];
  for (const t of active) (layers[d(t.id)] ??= []).push(t);

  const nodes: LaidOutNode[] = [];
  const laneOf = new Map<string, number>();
  let maxLanes = 0;
  layers.forEach((layer) => {
    if (!layer) return;
    // Order by barycentre of blockers to reduce crossings.
    layer.sort((a, b) => {
      const bc = (t: Ticket) => {
        const ys = t.blockedBy.map((x) => laneOf.get(x)).filter((v): v is number => v !== undefined);
        return ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : t.createdAt / 1e12;
      };
      return bc(a) - bc(b) || a.createdAt - b.createdAt;
    });
    maxLanes = Math.max(maxLanes, layer.length);
    layer.forEach((t, i) => laneOf.set(t.id, i));
  });
  layers.forEach((layer, li) => {
    if (!layer) return;
    const offset = ((maxLanes - layer.length) * LANE) / 2;
    layer.forEach((t, i) => {
      const along = li * LAYER;
      const across = offset + i * LANE;
      nodes.push({
        ticket: t,
        state: states.get(t.id)!,
        layer: li,
        x: direction === 'LR' ? along : across,
        y: direction === 'LR' ? across : along,
      });
    });
  });

  const nLayers = Math.max(layers.length, 1);
  const layersSpan = nLayers * LAYER - (LAYER - (direction === 'LR' ? NODE_W : NODE_H));
  const lanesSpan = Math.max(maxLanes, 1) * LANE - (LANE - (direction === 'LR' ? NODE_H : NODE_W));
  const graphW = direction === 'LR' ? layersSpan : lanesSpan;
  const graphH = direction === 'LR' ? lanesSpan : layersSpan;
  const quarantineY = graphH + 54;
  const perRow = Math.max(1, Math.floor((graphW + 24) / (NODE_W + 24)));
  ruled.forEach((t, i) => {
    nodes.push({
      ticket: t,
      state: 'out-of-scope',
      layer: -1,
      x: (i % perRow) * (NODE_W + 24),
      y: quarantineY + Math.floor(i / perRow) * (NODE_H + 16),
    });
  });

  const edges: { from: LaidOutNode; to: LaidOutNode }[] = [];
  const pos = new Map(nodes.map((n) => [n.ticket.id, n]));
  for (const n of nodes) {
    for (const b of n.ticket.blockedBy) {
      const from = pos.get(b);
      if (from) edges.push({ from, to: n });
    }
  }
  const ruledRows = Math.ceil(ruled.length / perRow);
  const width = Math.max(graphW, Math.min(ruled.length, perRow) * (NODE_W + 24) - 24);
  const height = ruled.length ? quarantineY + ruledRows * (NODE_H + 16) - 16 : graphH;
  return { direction, nodes, edges, width, graphH, quarantineY, height, quarantineH: ruledRows * (NODE_H + 16) + 24 };
}
