import type { TicketMetaPatch } from '../model/lifecycle';
import type { Ticket } from '../model/types';

/** `t` with `patch` applied; `null` clears a field. */
export function withMeta(t: Ticket, patch: TicketMetaPatch): Ticket {
  const next = { ...t };
  if (patch.status !== undefined) {
    if (patch.status === null) delete next.status;
    else next.status = patch.status;
  }
  return next;
}
