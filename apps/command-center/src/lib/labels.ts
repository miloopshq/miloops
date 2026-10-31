import type { TicketType, NodeState } from '@miloops-hq/core';

export const TYPE_CODE: Record<TicketType, string> = {
  research: 'RSCH',
  prototype: 'PROT',
  grilling: 'GRIL',
  task: 'TASK',
  execute: 'EXEC',
};

/** Ticket phases as people read them (core lifecycle.ts); `blocked` and `parked` are both backlog. */
export const STATE_TEXT: Record<NodeState, string> = {
  decided: 'Done',
  claimed: 'Working',
  frontier: 'Ready',
  blocked: 'Backlog',
  parked: 'Parked (plan-only)',
  'out-of-scope': 'Cancelled',
  verifying: 'Verifying',
  rework: 'Rework',
  held: 'Blocked',
};

export const STATE_LABEL: Record<NodeState, string> = {
  decided: 'done',
  claimed: 'working',
  frontier: 'ready',
  blocked: 'backlog',
  parked: 'parked',
  'out-of-scope': 'cancelled',
  verifying: 'verifying',
  rework: 'rework',
  held: 'blocked',
};
