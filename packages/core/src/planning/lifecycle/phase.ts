import type { TicketPhase } from '../../model/lifecycle';
import { DEFAULT_MAP_MODE, type MapMode, type NodeState, type Ticket } from '../../model/types';
import { nodeState } from '../derive';

export const PHASE_OF: Record<NodeState, TicketPhase> = {
  frontier: 'ready',
  blocked: 'backlog',
  parked: 'backlog',
  claimed: 'working',
  verifying: 'verifying',
  rework: 'rework',
  held: 'blocked',
  decided: 'done',
  'out-of-scope': 'cancelled',
};

export function ticketPhase(t: Ticket, byId: Map<string, Ticket>, mode: MapMode = DEFAULT_MAP_MODE): TicketPhase {
  return PHASE_OF[nodeState(t, byId, mode)];
}

export function derivePhases(tickets: Ticket[], mode: MapMode = DEFAULT_MAP_MODE): Map<string, TicketPhase> {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  return new Map(tickets.map((t) => [t.id, ticketPhase(t, byId, mode)]));
}
