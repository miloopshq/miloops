import { readLease } from '../agents/leaseStore';
import type { Ticket } from '../model/types';
import { readAttempts } from './evidenceStore';

export interface Reviewer {
  agent: string;
  /** Every session this reviewer's connection has opened. */
  sessionIds: string[];
}

/**
 * Why `who` may not review `t`, or undefined when they may: the reviewer must
 * not be its assignee or appear, by trail name or session, in any of its
 * attempts or its claim.
 */
export function reviewConflict(root: string, mapId: string, t: Ticket, who: Reviewer): string | undefined {
  const lease = readLease(root, mapId, t.id);
  const people = [
    ...readAttempts(root, mapId, t.id).map((a) => ({ agent: a.agent, sessionId: a.sessionId })),
    ...(lease ? [{ agent: lease.agent, sessionId: lease.sessionId }] : []),
    ...(t.assignee ? [{ agent: t.assignee, sessionId: undefined }] : []),
  ];
  const sessions = new Set(who.sessionIds);
  if (people.some((p) => p.agent === who.agent)) return `${who.agent} worked on ${t.key}, so another agent reviews it`;
  if (people.some((p) => p.sessionId && sessions.has(p.sessionId)))
    return `this connection worked on ${t.key}, so another agent reviews it`;
  return undefined;
}
