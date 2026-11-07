import type { TrackerAdapter } from '../adapters/adapter';
import type { Ticket } from '../model/types';
import { OperationError } from '../planning/operations/operationError';
import type { IntegrationOverlap } from './workspace';

export const INTEGRATION_TITLE = 'Bring together';

/** The integration ticket already added for this pair: open, titled "Bring together…", blocked by both. */
export function integrationTicketFor(tickets: Ticket[], o: IntegrationOverlap) {
  const [a, b] = o.tickets.map((s) => s.ticketId);
  return tickets.find(
    (t) =>
      t.closeReason !== 'not_planned' &&
      t.title.startsWith(INTEGRATION_TITLE) &&
      t.blockedBy.includes(a) &&
      t.blockedBy.includes(b),
  );
}

/**
 * The trail lead's "Add integration ticket": a task, blocked by both tickets, that lists the files both branches
 * changed. Teamtrail only suggests it; an agent (or you) brings the work together. Nothing is merged or rebased.
 */
export async function addIntegrationTicket(adapter: TrackerAdapter, o: IntegrationOverlap) {
  const snap = await adapter.loadMap(o.mapId);
  if (integrationTicketFor(snap.tickets, o))
    throw new OperationError('An integration ticket for these two already exists');
  const [a, b] = o.tickets;
  const files = o.files.map((f) => `- \`${f}\``).join('\n');
  const t = await adapter.createTicket(o.mapId, {
    title: `${INTEGRATION_TITLE} ${a.ticketKey} and ${b.ticketKey}`,
    type: 'task',
    body: [
      `${a.ticketKey} (${a.agent}, branch \`${a.branch}\`) and ${b.ticketKey} (${b.agent}, branch \`${b.branch}\`) changed the same files:`,
      files,
      'Bring the two branches together once both are done, and check the result. Teamtrail never merges for you.',
      `Part of trail ${snap.map.key}.`,
    ].join('\n\n'),
  });
  await adapter.addBlocking(o.mapId, a.ticketId, t.id);
  await adapter.addBlocking(o.mapId, b.ticketId, t.id);
  return t;
}
