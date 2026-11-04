import type { ReplanChange } from '../../model/replan';
import type { Ticket } from '../../model/types';

/** A blocking edge a proposal adds: `blocker` must close before `blocked`; ids or new refs, from change `change`. */
export interface NewEdge {
  blocker: string;
  blocked: string;
  change: number;
}

/** Every edge the changes add, in order. */
export function newEdges(changes: ReplanChange[]): NewEdge[] {
  return changes.flatMap((c, change) => {
    if (c.op === 'add_ticket') return (c.blockedBy ?? []).map((blocker) => ({ blocker, blocked: c.ref, change }));
    if (c.op === 'rewire') return c.addBlockedBy.map((blocker) => ({ blocker, blocked: c.ticket, change }));
    return [];
  });
}

/**
 * The indexes of changes whose edges would close a cycle, adding edges in order on top of the open tickets' edges.
 * Cancelled tickets no longer block anything, so their edges are left out.
 */
export function cycleChanges(tickets: Ticket[], changes: ReplanChange[]): number[] {
  const cancelled = new Set(changes.flatMap((c) => (c.op === 'cancel_ticket' ? [c.ticket] : [])));
  const blockers = new Map<string, Set<string>>();
  const link = (blocker: string, blocked: string) => {
    if (cancelled.has(blocker) || cancelled.has(blocked)) return;
    if (!blockers.has(blocked)) blockers.set(blocked, new Set());
    blockers.get(blocked)!.add(blocker);
  };
  for (const t of tickets.filter((x) => x.state === 'open')) for (const b of t.blockedBy) link(b, t.id);
  const bad = new Set<number>();
  for (const e of newEdges(changes)) {
    if (reaches(blockers, e.blocker, e.blocked)) bad.add(e.change);
    else link(e.blocker, e.blocked);
  }
  return [...bad];
}

/** True when `from` already waits (transitively) on `to`, or is `to`: the edge to→from would close a cycle. */
function reaches(blockers: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(blockers.get(cur) ?? []));
  }
  return false;
}
