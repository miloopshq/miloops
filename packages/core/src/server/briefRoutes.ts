import type { IncomingMessage, ServerResponse } from 'node:http';
import { decided, EMPTY_SECTIONS } from '../discovery/brief';
import { readBrief, writeBrief } from '../discovery/briefStore';
import { BadRequest, readJson, sendJson } from './http';

const text = (v: unknown, max = 300) => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * `/briefs` routes over the discovery briefs under `root`; false when none matches.
 * GET `?mapId=` reads a mission's brief; POST `/briefs/accept`, `/briefs/request-changes` (`note`) are the operator's
 * calls on a submitted brief; POST `/briefs/create` (`ticketId`) starts discovery for a mission created in the UI.
 */
export async function handleBriefs(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!url.pathname.startsWith('/briefs')) return false;
  if (url.pathname === '/briefs' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (!text(mapId)) throw new BadRequest('"mapId" is required');
    sendJson(res, 200, { brief: readBrief(root, mapId!) ?? null });
    return true;
  }
  if (req.method !== 'POST') return false;
  const b = await readJson<{ mapId?: unknown; note?: unknown; ticketId?: unknown }>(req, '{}');
  if (!text(b.mapId)) throw new BadRequest('"mapId" is required');
  const mapId = b.mapId as string;
  const brief = readBrief(root, mapId);
  if (url.pathname === '/briefs/create') {
    if (brief) return (sendJson(res, 200, { brief }), true);
    const created = {
      mapId,
      status: 'draft' as const,
      ticketId: text(b.ticketId) ? (b.ticketId as string) : undefined,
      sections: { ...EMPTY_SECTIONS, assumptions: [], openQuestions: [] },
    };
    writeBrief(root, created);
    sendJson(res, 200, { brief: created });
    return true;
  }
  const kind =
    url.pathname === '/briefs/accept'
      ? 'accept'
      : url.pathname === '/briefs/request-changes'
        ? 'request-changes'
        : null;
  if (!kind) return false;
  if (!brief) return (sendJson(res, 404, { error: 'this mission has no discovery brief' }), true);
  try {
    const next = decided(
      brief,
      kind === 'accept' ? { kind } : { kind, note: typeof b.note === 'string' ? b.note.slice(0, 2000) : '' },
    );
    writeBrief(root, next);
    sendJson(res, 200, { brief: next });
  } catch (e) {
    sendJson(res, 409, { error: (e as Error).message });
  }
  return true;
}
