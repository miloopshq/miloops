import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import type { TrackerConnectRequest, TrackerTestRequest } from '../adapters/remote/types';
import { githubCiAccess } from './githubCiAccess';
import { BadRequest, readJson, sendJson } from './http';
import { isKind, remoteAdapters } from './remoteAdapters';
import { CALLS } from './trackerCalls';
import { trackerContext, type TrackerRoutesOptions } from './trackerContext';
import { crossSite, sendTrackerError } from './trackerErrors';
import { streamTrackerEvents } from './trackerEvents';
import { trackerSettings } from './trackerSettings';

export type { TrackerRoutesOptions } from './trackerContext';

/**
 * Tracker settings and the remote-tracker API. Credentials are read and
 * stored here, in the local process, and never sent to the browser:
 *   GET    /trackers                       TrackerSettings
 *   PUT    /trackers                       TrackerConnectRequest → TrackerSettings (tests the connection first)
 *   POST   /trackers/test                  TrackerTestRequest → TrackerTestResult
 *   DELETE /trackers/credentials/<kind>    forget the saved token / key
 *   POST   /tracker/<kind>/call            `{ method, args }` → `{ result }` (TrackerAdapter methods)
 *   GET    /tracker/<kind>/events          SSE: TrackerEvent per message; named `status` events (SyncStatus & { location })
 */
export function createTrackerRoutes(o: TrackerRoutesOptions) {
  const ctx = trackerContext(o);
  const remotes = remoteAdapters(ctx);
  const { settings, test, connect } = trackerSettings(ctx, remotes);
  remotes.resumeQueued();

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    const call = p.match(/^\/tracker\/([^/]+)\/(call|events)$/);
    const forget = p.match(/^\/trackers\/credentials\/([^/]+)$/);
    if (p !== '/trackers' && p !== '/trackers/test' && !call && !forget) return false;
    try {
      if (crossSite(req)) return (void sendJson(res, 403, { error: 'cross-site request refused' }), true);
      if (p === '/trackers' && req.method === 'GET') return (void sendJson(res, 200, await settings()), true);
      if (p === '/trackers' && req.method === 'PUT') {
        const r = await connect(await readJson<TrackerConnectRequest>(req, '{}'));
        return (void sendJson(res, r.status, r.body), true);
      }
      if (p === '/trackers/test' && req.method === 'POST') {
        const b = await readJson<TrackerTestRequest>(req, '{}');
        if (!isKind(b.kind)) throw new BadRequest('"kind" must be github or linear');
        return (void sendJson(res, 200, await test(b)), true);
      }
      if (forget && req.method === 'DELETE') {
        const kind = forget[1];
        if (!isKind(kind)) throw new BadRequest('unknown tracker');
        const c = ctx.creds.read();
        delete c[kind];
        ctx.creds.write(c);
        remotes.reset(kind);
        return (void sendJson(res, 200, await settings()), true);
      }
      if (call) {
        const kind = call[1];
        if (!isKind(kind)) throw new BadRequest('unknown tracker');
        if (call[2] === 'events' && req.method === 'GET')
          return (streamTrackerEvents(() => remotes.get(kind), req, res), true);
        if (call[2] === 'call' && req.method === 'POST') {
          const b = await readJson<{ method?: string; args?: unknown[] }>(req, '{}');
          const method = b.method as keyof TrackerAdapter;
          if (!CALLS.has(method)) throw new BadRequest(`unknown method "${b.method}"`);
          const a = await remotes.get(kind);
          const fn = a[method] as (...args: unknown[]) => Promise<unknown>;
          const result = await fn.apply(a, Array.isArray(b.args) ? b.args : []);
          return (void sendJson(res, 200, { result: result ?? null }), true);
        }
      }
      sendJson(res, 405, { error: 'method not allowed' });
    } catch (err) {
      if (err instanceof BadRequest) sendJson(res, 400, { error: err.message });
      else if (!sendTrackerError(res, err)) sendJson(res, 500, { error: String((err as Error)?.message ?? err) });
    }
    return true;
  }

  return {
    handle,
    /** The adapter the project is connected to, for routes shared with local markdown (decisions). */
    async active(): Promise<TrackerAdapter> {
      const a = ctx.project.read().active;
      return isKind(a) ? remotes.get(a) : o.markdown;
    },
    /** GitHub PR and CI reads for the reconciler, with the same token resolution as the tracker. */
    ciAccess: githubCiAccess(ctx),
    close() {
      remotes.close();
    },
  };
}
