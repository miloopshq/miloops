import type { IncomingMessage, ServerResponse } from 'node:http';
import { readLease, readLeases } from '../agents/leaseStore';
import { returnToQueue } from '../agents/returnToQueue';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

/** `/agents/leases` routes over the claim leases under `root`; false when none matches. */
export async function handleLeases(
  { root, active }: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/agents/leases' && req.method === 'GET') {
    sendJson(res, 200, { leases: readLeases(root) });
    return true;
  }
  if (url.pathname === '/agents/leases/release' && req.method === 'POST') {
    const b = await readJson<{ mapId?: string; ticketId?: string; by?: string }>(req, '{}');
    if (typeof b.mapId !== 'string' || typeof b.ticketId !== 'string')
      throw new BadRequest('"mapId" and "ticketId" are required');
    const lease = readLease(root, b.mapId, b.ticketId);
    if (!lease || lease.returned) return (sendJson(res, 404, { error: 'no live lease on this ticket' }), true);
    const by = typeof b.by === 'string' && b.by ? b.by : 'operator';
    const r = await returnToQueue(root, await active(), lease, { reason: 'operator', by });
    if ('busy' in r) sendJson(res, 409, { error: 'the lease is being returned already' });
    else sendJson(res, 200, 'returned' in r ? { returned: r.returned } : { dropped: r.dropped });
    return true;
  }
  return false;
}
