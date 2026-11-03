import type { DiffMark, DiffNode, ReplanChange, ReplanDiff } from '../../model/replan';
import type { MapSnapshot, Ticket } from '../../model/types';
import { newEdges } from './replanEdges';

/**
 * The dry run of a proposal: every ticket with how it comes out (added, cancelled, revised, rewired, reopened or
 * unchanged) and its blockers afterwards, plus the mission lines that change. Pure; assumes a valid proposal.
 */
export function replanDiff(snap: MapSnapshot, changes: ReplanChange[]): ReplanDiff {
  const marks = markOf(changes);
  const edges = newEdges(changes);
  const edgesInto = (id: string) => edges.filter((e) => e.blocked === id).map((e) => e.blocker);
  const existing = snap.tickets.map((t) => existingNode(t, marks.get(t.id) ?? 'unchanged', edgesInto(t.id)));
  const added = changes.flatMap((c) => addedNodes(snap, c, edgesInto));
  const destination = changes.find((c) => c.op === 'update_destination');
  return {
    nodes: [...existing, ...added],
    ...(destination ? { destination: { before: snap.map.sections.destination, after: destination.text } } : {}),
    unspecified: changes.flatMap((c) => (c.op === 'add_unspecified' ? [c.text] : [])),
    outOfScope: changes.flatMap((c) => (c.op === 'add_out_of_scope' ? [c.text] : [])),
    superseded: changes.flatMap((c) =>
      c.op === 'supersede_decision' ? [{ decision: c.decision, answer: c.answer }] : [],
    ),
  };
}

/** The strongest mark each existing ticket gets: cancelling wins over revising, revising over rewiring. */
function markOf(changes: ReplanChange[]): Map<string, DiffMark> {
  const rank: DiffMark[] = ['unchanged', 'rewired', 'revised', 'reopened', 'cancelled'];
  const marks = new Map<string, DiffMark>();
  const mark = (id: string, m: DiffMark) => {
    const prev = marks.get(id) ?? 'unchanged';
    if (rank.indexOf(m) > rank.indexOf(prev)) marks.set(id, m);
  };
  for (const c of changes) {
    if (c.op === 'cancel_ticket') mark(c.ticket, 'cancelled');
    if (c.op === 'edit_ticket') mark(c.ticket, 'revised');
    if (c.op === 'rewire') mark(c.ticket, 'rewired');
  }
  return marks;
}

function existingNode(t: Ticket, mark: DiffMark, newBlockers: string[]): DiffNode {
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    type: t.type,
    mark,
    blockedBy: [...new Set([...t.blockedBy, ...newBlockers])],
    newEdges: newBlockers,
  };
}

/** `add_ticket` adds its ticket; `reopen` adds a follow-up for the closed one. */
function addedNodes(snap: MapSnapshot, c: ReplanChange, edgesInto: (id: string) => string[]): DiffNode[] {
  if (c.op === 'add_ticket') {
    const blockers = edgesInto(c.ref);
    return [{ id: c.ref, title: c.title, type: c.type, mark: 'added', blockedBy: blockers, newEdges: blockers }];
  }
  if (c.op !== 'reopen') return [];
  const t = snap.tickets.find((x) => x.id === c.ticket);
  if (!t) return [];
  return [{ id: `reopen:${t.id}`, title: reopenTitle(t), type: t.type, mark: 'reopened', blockedBy: [], newEdges: [] }];
}

/** Title of the follow-up ticket a `reopen` change adds. */
export const reopenTitle = (t: Pick<Ticket, 'key' | 'title'>) => `Reopen ${t.key}: ${t.title}`;
