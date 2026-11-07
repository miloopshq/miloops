import type { DiffMark, MapSnapshot, RerouteDiff, Ticket } from '@teamtrail/core';

/** The map as a pending proposal would leave it, drawn over the real one. */
export interface MapPreview {
  /** Every ticket with its blockers afterwards, plus ghost tickets for the ones the proposal adds. */
  tickets: Ticket[];
  marks: Map<string, DiffMark>;
  /** Edges the proposal adds, as `<blocker>><blocked>`. */
  newEdges: Set<string>;
  /** Edges the proposal removes, still drawn (struck) so the change is visible. */
  removedEdges: Set<string>;
  frozen: Set<string>;
}

export const edgeKey = (blocker: string, blocked: string) => `${blocker}>${blocked}`;

/** Builds the preview from a proposal's dry-run diff; added tickets become ghosts keyed by their ref. */
export function mapPreview(snap: MapSnapshot, diff: RerouteDiff, frozen: string[] = []): MapPreview {
  const byId = new Map(snap.tickets.map((t) => [t.id, t]));
  const tickets = diff.nodes.map((n): Ticket => {
    const real = byId.get(n.id);
    if (real) return { ...real, blockedBy: [...n.blockedBy, ...(n.removedEdges ?? [])] };
    return {
      id: n.id,
      key: '+',
      title: n.title,
      type: n.type,
      body: '',
      state: 'open',
      blockedBy: n.blockedBy,
      comments: [],
      createdAt: snap.map.updatedAt,
      updatedAt: snap.map.updatedAt,
    };
  });
  return {
    tickets,
    marks: new Map(diff.nodes.map((n) => [n.id, n.mark])),
    newEdges: new Set(diff.nodes.flatMap((n) => n.newEdges.map((b) => edgeKey(b, n.id)))),
    removedEdges: new Set(diff.nodes.flatMap((n) => (n.removedEdges ?? []).map((b) => edgeKey(b, n.id)))),
    frozen: new Set(frozen),
  };
}
