import type { TicketType, NodeState } from '@miloops-hq/core';

/** Ticket types as people read them, in sentence case. */
export const TYPE_TEXT: Record<TicketType, string> = {
  research: 'Research',
  prototype: 'Prototype',
  grilling: 'Grilling',
  task: 'Task',
  execute: 'Execute',
  review: 'Review',
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
