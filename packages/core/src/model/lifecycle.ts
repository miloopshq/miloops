/**
 * Ticket lifecycle. The tracker stores open/closed, the assignee and, on top
 * of those, a `TicketStatus` (frontmatter `status`, or the issue meta marker).
 * Everything the UI and agents see is the derived `TicketPhase`
 * (planning/lifecycle/phase.ts), and only `transition()` changes it.
 */

/** Stored status of an open ticket; absent means the phase follows from the assignee and blockers. */
export type TicketStatus = 'verifying' | 'rework' | 'blocked';

export const TICKET_STATUSES: TicketStatus[] = ['verifying', 'rework', 'blocked'];

/**
 * User-facing phase. `backlog` waits on blockers (or is parked on a plan-only
 * mission); `blocked` waits on a human.
 */
export type TicketPhase = 'backlog' | 'ready' | 'working' | 'verifying' | 'rework' | 'blocked' | 'done' | 'cancelled';

export const TICKET_PHASES: TicketPhase[] = [
  'backlog',
  'ready',
  'working',
  'verifying',
  'rework',
  'blocked',
  'done',
  'cancelled',
];

export type LifecycleEvent =
  | 'claim'
  | 'release'
  | 'expire'
  | 'complete'
  | 'submit'
  | 'checks.pass'
  | 'checks.fail'
  | 'checks.error'
  | 'reverify'
  | 'review.pass'
  | 'review.fail'
  | 'review.needs_human'
  | 'approve'
  | 'reject'
  | 'accept'
  | 'unblock'
  | 'cancel';

/** `engine`: MILOOPS itself (lease reaper, check runner, reconciler). */
export type ActorKind = 'agent' | 'operator' | 'engine';

/** What a transition may change besides assignment and closing. `null` clears the status. */
export interface TicketMetaPatch {
  status?: TicketStatus | null;
}

/** One line of a mission's history (`.events/<mapId>.jsonl`). History and UI only; the tracker holds the state. */
export interface TransitionEntry {
  v: 1;
  kind: 'transition';
  at: number;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  event: LifecycleEvent;
  from: TicketPhase;
  to: TicketPhase;
  /** Actor id: an agent callsign, `operator`, `miloops`. */
  actor: string;
  actorKind: ActorKind;
  reason?: string;
  sessionId?: string;
}

/** Where transitions are recorded: a JSONL file in node, the command-center server from the browser, nowhere in demos. */
export interface Journal {
  append(entry: TransitionEntry): void | Promise<void>;
}
