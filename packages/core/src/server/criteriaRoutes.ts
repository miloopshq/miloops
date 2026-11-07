import type { IncomingMessage, ServerResponse } from 'node:http';
import { readCriteria, writeTicketCriteria } from '../criteria/criteriaStore';
import { BadRequest, readJson, sendJson } from './http';

const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 300;

/**
 * `/criteria` routes over the acceptance criteria under `root`; false when none matches.
 * GET `?mapId=` lists every ticket's criteria; POST `/criteria/confirm` (`mapId`, `title`, `ticketId`, `ticketKey`,
 * `confirmed`) is the trail lead confirming a ticket's criteria (or taking that back).
 */
export async function handleCriteria(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!url.pathname.startsWith('/criteria')) return false;
  if (url.pathname === '/criteria' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (!text(mapId)) throw new BadRequest('"mapId" is required');
    sendJson(res, 200, { tickets: readCriteria(root, mapId!) });
    return true;
  }
  if (url.pathname === '/criteria/confirm' && req.method === 'POST') {
    const b = await readJson<Record<string, unknown>>(req, '{}');
    if (![b.mapId, b.ticketId, b.ticketKey].every(text))
      throw new BadRequest('"mapId", "ticketId" and "ticketKey" are required');
    const current = readCriteria(root, b.mapId as string).find((t) => t.ticketId === b.ticketId);
    if (!current?.criteria.length)
      return (sendJson(res, 404, { error: 'this ticket has no acceptance criteria' }), true);
    const saved = writeTicketCriteria(
      root,
      { id: b.mapId as string, title: text(b.title) ? (b.title as string) : (b.mapId as string) },
      { id: b.ticketId as string, key: b.ticketKey as string },
      { confirmed: b.confirmed !== false },
    );
    sendJson(res, 200, { ticket: saved });
    return true;
  }
  return false;
}
