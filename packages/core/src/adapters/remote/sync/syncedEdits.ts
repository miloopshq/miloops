import type { TicketEdit } from '../../adapter';
import { ticketOf } from './queuedWrites';
import { SyncedWriter } from './syncedWriter';

/**
 * Ticket edits a replan needs: drop a blocker, rewrite the text, reopen. Queued like the other writes, so they wait
 * for the tracker while it is offline and replay in order.
 */
export abstract class SyncedEdits extends SyncedWriter {
  async removeBlocking(mapId: string, blockerId: string, blockedId: string) {
    const e = await this.entry(mapId);
    const blocker = ticketOf(e, blockerId);
    const blocked = ticketOf(e, blockedId);
    if (!blocked.blockedBy.includes(blockerId)) return;
    await this.change(
      mapId,
      `${blocker.key} no longer blocks ${blocked.key}`,
      { kind: 'unblocking', blockerId, blockedId },
      { kind: 'edge.removed', mapId, blockerId, blockedId },
    );
  }

  async editTicket(mapId: string, ticketId: string, edit: TicketEdit) {
    const t = ticketOf(await this.entry(mapId), ticketId);
    await this.change(
      mapId,
      `edit ${t.key}`,
      { kind: 'edit', ticketId, edit },
      { kind: 'ticket.updated', mapId, ticketId },
    );
  }

  async reopen(mapId: string, ticketId: string) {
    const t = ticketOf(await this.entry(mapId), ticketId);
    await this.change(
      mapId,
      `reopen ${t.key}`,
      { kind: 'reopen', ticketId },
      { kind: 'ticket.updated', mapId, ticketId },
    );
  }
}
