import type { TicketType } from './types';

/*
 * A replan proposal: typed changes to a mission's map, proposed by an agent with evidence, applied only when the
 * operator approves. Tickets are named by id; tickets the proposal adds are named by their `ref`, which later changes
 * in the same proposal may use (`blockedBy`, `ticket`).
 *
 * The tracker adapters can add blocking edges but not remove them, and cannot rewrite a ticket's text, so:
 * `rewire` only adds blockers (to drop a dependency, cancel the ticket and add a replacement), and `edit_ticket`
 * posts the revised title and body on the ticket. `reopen` adds a follow-up ticket for a done or cancelled one.
 */
export type ReplanChange =
  | {
      op: 'add_ticket';
      ref: string;
      title: string;
      type: TicketType;
      body?: string;
      hitl?: boolean;
      blockedBy?: string[];
    }
  | { op: 'cancel_ticket'; ticket: string; reason: string }
  | { op: 'edit_ticket'; ticket: string; title?: string; body?: string }
  | { op: 'rewire'; ticket: string; addBlockedBy: string[] }
  | { op: 'supersede_decision'; decision: string; answer: string; rationale: string }
  | { op: 'update_destination'; text: string }
  | { op: 'add_unspecified'; text: string }
  | { op: 'add_out_of_scope'; text: string }
  | { op: 'reopen'; ticket: string; reason: string };

export type ReplanOp = ReplanChange['op'];

export const REPLAN_OPS: ReplanOp[] = [
  'add_ticket',
  'cancel_ticket',
  'edit_ticket',
  'rewire',
  'supersede_decision',
  'update_destination',
  'add_unspecified',
  'add_out_of_scope',
  'reopen',
];

/**
 * `replan`: the plan changes to reach the same destination.
 * `challenge-destination`: the destination itself is wrong; carries a `reason` and a suggested new destination.
 */
export type ReplanKind = 'replan' | 'challenge-destination';

/** Why the destination is challenged: the work exists already, the mission targets the wrong problem, or it should be rescoped. */
export type DestinationReason = 'already-exists' | 'wrong-problem' | 'rescope';

export const DESTINATION_REASONS: DestinationReason[] = ['already-exists', 'wrong-problem', 'rescope'];

export type ReplanStatus = 'pending' | 'approved' | 'rejected' | 'superseded';

export interface ReplanProposal {
  v: 1;
  /** `R-<n>`, per mission. */
  id: string;
  mapId: string;
  kind: ReplanKind;
  /** challenge-destination only. */
  destinationReason?: DestinationReason;
  /** Actor id (agent callsign) and session that proposed it. */
  by: string;
  sessionId?: string;
  at: number;
  reason: string;
  evidence: string;
  /** Assumption ids (`S-<n>`) the evidence invalidates. */
  invalidates: string[];
  changes: ReplanChange[];
  status: ReplanStatus;
  decidedBy?: string;
  decidedAt?: number;
  /** The operator's note: required to reject, optional to approve. */
  note?: string;
  /** Superseded by a newer proposal of the same agent. */
  supersededBy?: string;
  /** Indexes of the changes already executed, so an interrupted apply resumes where it stopped. */
  applied: number[];
  /** Ticket ids created by `add_ticket` / `reopen` changes, by change index (resume uses them, never re-creates). */
  created: Record<number, string>;
}

/** One validation problem; `change` is the index of the offending change, absent for proposal-level problems. */
export interface ReplanError {
  change?: number;
  message: string;
}

/** How a ticket comes out of the proposal in the dry run. */
export type DiffMark = 'added' | 'cancelled' | 'revised' | 'rewired' | 'reopened' | 'unchanged';

export interface DiffNode {
  /** Ticket id, or `ref` for tickets the proposal adds. */
  id: string;
  key?: string;
  title: string;
  type: TicketType;
  mark: DiffMark;
  /** Blockers after the change; for added tickets, ids or refs. */
  blockedBy: string[];
  /** Edges this proposal adds, as blocker ids or refs. */
  newEdges: string[];
}

/** The dry-run result: every ticket before and after, plus the mission-level lines that change. */
export interface ReplanDiff {
  nodes: DiffNode[];
  destination?: { before: string; after: string };
  unspecified: string[];
  outOfScope: string[];
  superseded: { decision: string; answer: string }[];
}
