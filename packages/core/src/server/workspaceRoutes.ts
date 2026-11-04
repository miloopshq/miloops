import type { IncomingMessage, ServerResponse } from 'node:http';
import { OperationError } from '../planning/operations/operationError';
import { readIntegrationScan } from '../workspaces/integrationStore';
import { addIntegrationTicket } from '../workspaces/integrationTicket';
import { parseWorkspaceSettings } from '../workspaces/workspaceFile';
import { listWorkspaces, readWorkspaceSettings, writeWorkspaceSettings } from '../workspaces/workspaceStore';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const view = (root: string) => ({
  ...readWorkspaceSettings(root),
  workspaces: listWorkspaces(root),
  integration: readIntegrationScan(root),
});

/**
 * `/workspaces`: the project's worktree setting (`workspaces.json`), the prepared worktrees and the latest overlap
 * check. GET reads; PUT saves the setting (400 with every error); POST `/workspaces/integration { mapId, a, b }`
 * is the operator's "Add integration ticket" for an overlap the check found. False when the path doesn't match.
 */
export async function handleWorkspaces(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/workspaces' && req.method === 'GET') return (sendJson(res, 200, view(ctx.root)), true);
  if (url.pathname === '/workspaces' && req.method === 'PUT') {
    const { settings, errors } = parseWorkspaceSettings(JSON.stringify(await readJson<unknown>(req, '{}')));
    if (!settings) return (sendJson(res, 400, { error: errors.join('; '), errors }), true);
    writeWorkspaceSettings(ctx.root, settings);
    return (sendJson(res, 200, view(ctx.root)), true);
  }
  if (url.pathname === '/workspaces/integration' && req.method === 'POST') {
    const b = await readJson<{ mapId?: string; a?: string; b?: string }>(req, '{}');
    if (typeof b.mapId !== 'string' || typeof b.a !== 'string' || typeof b.b !== 'string')
      throw new BadRequest('"mapId", "a" and "b" (ticket ids) are required');
    const pair = new Set([b.a, b.b]);
    const overlap = readIntegrationScan(ctx.root).overlaps.find(
      (o) => o.mapId === b.mapId && o.tickets.every((t) => pair.has(t.ticketId)),
    );
    if (!overlap) return (sendJson(res, 404, { error: 'no overlap between these tickets right now' }), true);
    try {
      const t = await addIntegrationTicket(await ctx.active(), overlap);
      sendJson(res, 200, { ticket: { id: t.id, key: t.key, title: t.title } });
    } catch (e) {
      if (!(e instanceof OperationError)) throw e;
      sendJson(res, 409, { error: e.message });
    }
    return true;
  }
  return false;
}
