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

/**
 * How much evidence a completion needs before the ticket is done. Missions
 * without a level are `off`: completing closes the ticket, as always.
 */
export type VerificationLevel = 'off' | 'checks' | 'checks+review' | 'checks+review+human';

export const VERIFICATION_LEVELS: VerificationLevel[] = ['off', 'checks', 'checks+review', 'checks+review+human'];

/** `v` as a level, when it is one (stored values are read leniently). */
export const levelOf = (v: unknown) => VERIFICATION_LEVELS.find((l) => l === v);

/** `engine`: MILOOPS itself (lease reaper, check runner, reconciler). */
export type ActorKind = 'agent' | 'operator' | 'engine';

/** MILOOPS fields stored with a ticket besides assignment and closing. `null` clears a field. */
export interface TicketMetaPatch {
  /** Only `transition()` writes this. */
  status?: TicketStatus | null;
  /** Operator only (`setVerification`). */
  verification?: VerificationLevel | null;
  checks?: string[] | null;
}

/** MILOOPS fields stored with a mission. `null` clears a field. */
export interface MapMetaPatch {
  /** Operator only (`setVerification`). */
  verification?: VerificationLevel | null;
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
