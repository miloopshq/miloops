import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import { logFlagChanges } from '../evidence/reconcile';
import { dropTicketSync, readTicketSync, readTicketSyncs, writeTicketSync } from '../evidence/syncStore';
import { BadRequest, readJson, sendJson } from './http';
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
  root: string,
  active: () => Promise<TrackerAdapter>,
  watch: VerificationWatch,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
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
  if (b.pr !== null && !(typeof b.pr === 'number' && Number.isInteger(b.pr) && b.pr > 0))
    throw new BadRequest('"pr" must be a pull request number, or null to unlink');
  const { mapId, ticketId } = b;
  const t = (await (await active()).loadMap(mapId)).tickets.find((x) => x.id === ticketId);
  if (!t) return (sendJson(res, 404, { error: 'no such ticket' }), true);
  const prev = readTicketSync(root, mapId, ticketId);
  const now = Date.now();
  if (b.pr === null) {
    dropTicketSync(root, mapId, ticketId);
    logFlagChanges(root, prev, undefined, now);
    sendJson(res, 200, { ticket: null });
    return true;
  }
  const same = prev?.pr?.number === b.pr;
  const next = {
    v: 1 as const,
    mapId,
    ticketId,
    ticketKey: t.key,
    provider: prev?.provider ?? 'github',
    link: { number: b.pr, source: 'explicit' as const, at: now },
    checks: same ? prev.checks : [],
    checksSummary: same ? prev.checksSummary : ('none' as const),
    flags: same ? prev.flags : [],
    ...(same ? { pr: prev.pr, syncedAt: prev.syncedAt } : {}),
  };
  writeTicketSync(root, next);
  if (!same) logFlagChanges(root, prev, next, now);
  watch.kick();
  sendJson(res, 200, { ticket: next });
  return true;
}
