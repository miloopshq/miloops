import type { TicketType, NodeState } from '@miloops-hq/core';

export const TYPE_CODE: Record<TicketType, string> = {
  research: 'RSCH',
  prototype: 'PROT',
  grilling: 'GRIL',
  task: 'TASK',
  execute: 'EXEC',
};

export const STATE_TEXT: Record<NodeState, string> = {
  decided: 'Decided',
  claimed: 'Claimed',
  frontier: 'Frontier',
  blocked: 'Blocked',
  parked: 'Parked (plan-only)',
  'out-of-scope': 'Out of scope',
};

export const STATE_LABEL: Record<NodeState, string> = {
  decided: 'decided',
  claimed: 'claimed',
  frontier: 'frontier',
  blocked: 'blocked',
  parked: 'parked',
  'out-of-scope': 'ruled out',
};
