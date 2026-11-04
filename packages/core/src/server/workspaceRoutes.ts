import type { IncomingMessage, ServerResponse } from 'node:http';
import { OperationError } from '../planning/operations/operationError';
import { readIntegrationScan } from '../workspaces/integrationStore';
import { addIntegrationTicket } from '../workspaces/integrationTicket';
import { isClaimed, removeWorkspace } from '../workspaces/removeWorkspace';
import { parseWorkspaceSettings } from '../workspaces/workspaceFile';
import { listWorkspaces, readWorkspaceSettings, writeWorkspaceSettings } from '../workspaces/workspaceStore';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const view = (root: string) => ({
  ...readWorkspaceSettings(root),
  workspaces: listWorkspaces(root).map((w) => ({ ...w, active: isClaimed(root, w.mapId, w.ticketId) })),
  integration: readIntegrationScan(root),
});

/**
 * `/workspaces`: the project's worktree setting (`workspaces.json`), the prepared worktrees and the latest overlap
 * check. GET reads; PUT saves the setting (400 with every error); POST `/workspaces/integration { mapId, a, b }`
 * is the operator's "Add integration ticket" for an overlap the check found; POST `/workspaces/remove { mapId,
 * ticketId, force? }` removes a finished ticket's worktree folder (409 with the reason, and `dirty` when it has
 * uncommitted changes). False when the path doesn't match.
 */
export async function handleWorkspaces(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/workspaces' && req.method === 'GET') return (sendJson(res, 200, view(ctx.root)), true);
  if (url.pathname === '/workspaces' && req.method === 'PUT') {
    const { settings, errors } = parseWorkspaceSettings(JSON.stringify(await readJson<unknown>(req, '{}')));
    if (!settings) return (sendJson(res, 400, { error: errors.join('; '), errors }), true);
    writeWorkspaceSettings(ctx.root, settings);
    return (sendJson(res, 200, view(ctx.root)), true);
  }
  if (url.pathname === '/workspaces/remove' && req.method === 'POST') return (await remove(ctx, req, res), true);
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

async function remove(ctx: RouteContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ mapId?: string; ticketId?: string; force?: boolean }>(req, '{}');
  if (typeof b.mapId !== 'string' || typeof b.ticketId !== 'string')
    throw new BadRequest('"mapId" and "ticketId" are required');
  const r = await removeWorkspace({ root: ctx.root, mapId: b.mapId, ticketId: b.ticketId, force: b.force === true });
  if (r.kind === 'refused') return sendJson(res, 409, { error: r.reason, dirty: r.dirty ?? false });
  sendJson(res, 200, { removed: r.workspace, ...view(ctx.root) });
}
