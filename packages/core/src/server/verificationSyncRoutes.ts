import type { IncomingMessage, ServerResponse } from 'node:http';
import { logFlagChanges } from '../evidence/reconcile';
import { dropTicketSync, readTicketSync, readTicketSyncs, writeTicketSync } from '../evidence/syncStore';
import type { TicketSync } from '../model/prEvidence';
import type { Ticket } from '../model/types';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';
import type { VerificationWatch } from './watchVerification';

/**
 * PR and CI evidence the reconciler keeps (watchVerification.ts):
 *   GET /verification/sync[?mapId=]   `{ status: PrSyncStatus, tickets: TicketSync[] }`
 *   PUT /verification/sync/link       body `{ mapId, ticketId, pr: number | null }`: link a PR to a ticket,
 *                                     or drop the link and its flags. Reads the PR on the next tick. After an
 *                                     unlink, a body marker or branch name can link the ticket again.
 */
export async function handleVerificationSync(
  ctx: RouteContext & { watch: VerificationWatch },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const { root, watch } = ctx;
  if (url.pathname === '/verification/sync' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId') ?? undefined;
    sendJson(res, 200, { status: watch.status(), tickets: readTicketSyncs(root, mapId) });
    return true;
  }
  if (url.pathname !== '/verification/sync/link') return false;
  if (req.method !== 'PUT') return (sendJson(res, 405, { error: 'method not allowed' }), true);
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const b = await readJson<{ mapId?: unknown; ticketId?: unknown; pr?: unknown }>(req, '{}');
  if (typeof b.mapId !== 'string' || typeof b.ticketId !== 'string')
    throw new BadRequest('"mapId" and "ticketId" are required');
  if (b.pr !== null && !isPrNumber(b.pr)) throw new BadRequest('"pr" must be a pull request number, or null to unlink');
  const { mapId, ticketId } = b;
  const t = (await (await ctx.active()).loadMap(mapId)).tickets.find((x) => x.id === ticketId);
  if (!t) return (sendJson(res, 404, { error: 'no such ticket' }), true);
  const prev = readTicketSync(root, mapId, ticketId);
  const now = Date.now();
  if (b.pr === null) {
    dropTicketSync(root, mapId, ticketId);
    logFlagChanges(root, prev, undefined, now);
    sendJson(res, 200, { ticket: null });
    return true;
  }
  const next = linked({ mapId, ticket: t, pr: b.pr, prev, now });
  writeTicketSync(root, next);
  if (prev?.pr?.number !== b.pr) logFlagChanges(root, prev, next, now);
  watch.kick();
  sendJson(res, 200, { ticket: next });
  return true;
}

const isPrNumber = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/** The ticket's sync with an explicit link to `pr`; what was read of the same PR before is kept. */
function linked(i: { mapId: string; ticket: Ticket; pr: number; prev?: TicketSync; now: number }): TicketSync {
  const { prev } = i;
  const base = {
    v: 1 as const,
    mapId: i.mapId,
    ticketId: i.ticket.id,
    ticketKey: i.ticket.key,
    provider: prev?.provider ?? 'github',
    link: { number: i.pr, source: 'explicit' as const, at: i.now },
  };
  if (prev?.pr?.number !== i.pr) return { ...base, checks: [], checksSummary: 'none', flags: [] };
  const { checks, checksSummary, flags, pr, syncedAt } = prev;
  return { ...base, checks, checksSummary, flags, pr, syncedAt };
}
