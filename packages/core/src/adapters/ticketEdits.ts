import type { Ticket, TicketType } from '../model/types';
import type { TicketEdit } from './adapter';

/** A fresh open ticket with no blockers or comments. */
export function newTicket(
  id: string,
  key: string,
  input: { title: string; type: TicketType; body: string; hitl?: boolean },
): Ticket {
  const now = Date.now();
  return { id, key, ...input, state: 'open', blockedBy: [], comments: [], createdAt: now, updatedAt: now };
}

/** The ticket without `blockerId` among its blockers. */
export const withoutBlocker = (t: Ticket, blockerId: string): Ticket => ({
  ...t,
  blockedBy: t.blockedBy.filter((b) => b !== blockerId),
});

/** The ticket with the new title and/or body; an empty title is left as it is. */
export const withEdit = (t: Ticket, edit: TicketEdit): Ticket => ({
  ...t,
  ...(edit.title?.trim() ? { title: edit.title.trim() } : {}),
  ...(edit.body !== undefined ? { body: edit.body } : {}),
});

/** The ticket open again: no close reason or time. */
export function reopened(t: Ticket): Ticket {
  const { closeReason: _reason, closedAt: _at, ...open } = t;
  return { ...open, state: 'open' };
}
