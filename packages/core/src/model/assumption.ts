/**
 * Assumptions a mission relies on ("the v2 API supports batch writes"), kept in the map body's Assumptions section so
 * they round-trip through every tracker. Agents challenge them with evidence; a replan the operator approves can
 * invalidate them. Ids are `S-<n>` (`A-` is taken by verification attempts, `D-` by decisions).
 */
export type AssumptionStatus = 'holding' | 'challenged' | 'invalidated' | 'confirmed';

export const ASSUMPTION_STATUSES: AssumptionStatus[] = ['holding', 'challenged', 'invalidated', 'confirmed'];

/** Why an agent thinks an assumption no longer holds. */
export interface AssumptionChallenge {
  /** Actor id of who challenged it. */
  by: string;
  at: number;
  evidence: string;
  /** The ticket where the contradicting finding came up. */
  ticketId?: string;
}

export interface Assumption {
  id: string;
  text: string;
  status: AssumptionStatus;
  /** Ids of the tickets that depend on it. */
  tickets: string[];
  /** Where it came from, e.g. `brief:A-2` when seeded from the accepted discovery brief. */
  source?: string;
  challenge?: AssumptionChallenge;
  /** The replan that invalidated it (`R-<n>`), or who confirmed it (`operator`). */
  decidedBy?: string;
}

/** An assumption to add; `tickets` are ticket ids. */
export interface AssumptionInput {
  text: string;
  tickets?: string[];
  source?: string;
}

export const isAssumptionStatus = (v: unknown): v is AssumptionStatus =>
  ASSUMPTION_STATUSES.includes(v as AssumptionStatus);
