import type { ReplanProposal } from '../../model/replan';

/**
 * Tickets a pending proposal would cancel, revise or rewire, mapped to the proposal's id. They can't be claimed until
 * the operator decides, so nobody works on something that may be about to change.
 */
export function frozenTickets(proposals: ReplanProposal[]): Map<string, string> {
  const frozen = new Map<string, string>();
  for (const p of proposals.filter((x) => x.status === 'pending')) {
    for (const c of p.changes) {
      const touches = c.op === 'cancel_ticket' || c.op === 'edit_ticket' || c.op === 'rewire';
      if (touches && !frozen.has(c.ticket)) frozen.set(c.ticket, p.id);
    }
  }
  return frozen;
}
