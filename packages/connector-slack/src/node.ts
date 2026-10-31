import type { IncomingMessage, ServerResponse } from 'node:http';
import { configDir, crossSite, type BridgeContext, type BridgePlugin, type BridgePluginFactory } from '@miloops-hq/core/bridge';
import { SlackService, type SlackServiceOptions } from './service';
import type { SlackSettingsPatch } from './types';

export { SlackService, type SlackServiceOptions } from './service';
export { SlackApi, SlackApiError } from './api';
export { SocketMode, probeSocket, type Envelope, type WebSocketCtor, type WebSocketLike } from './socket';
export * from './index';

class BadRequest extends Error {}

/**
 * The Slack routes. Tokens are verified and stored here, in the local process,
 * and never sent back to the browser:
 *   GET    /slack            SlackStatus
 *   POST   /slack/created    step 1 done (Slack's create-from-manifest page was opened)
 *   POST   /slack/token      `{ token }` → SlackTokenResult (xapp- or xoxb-, routed by prefix, checked live)
 *   PUT    /slack/settings   SlackSettingsPatch → SlackStatus
 *   POST   /slack/owner/reset
 *   GET    /slack/members    `{ members: SlackUser[] }` for the allowlist picker
 *   DELETE /slack            Remove: disconnect and forget tokens and settings
 */
export function slackRoutes(service: SlackService) {
  const json = (res: ServerResponse, status: number, v: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(v));
  };
  async function body<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
    } catch {
      throw new BadRequest('body must be JSON');
    }
  }
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (p !== '/slack' && !p.startsWith('/slack/')) return false;
    try {
      if (crossSite(req)) return json(res, 403, { error: 'cross-site request refused' }), true;
      const m = req.method;
      if (p === '/slack' && m === 'GET') return json(res, 200, service.status()), true;
      if (p === '/slack' && m === 'DELETE') return json(res, 200, service.remove()), true;
      if (p === '/slack/created' && m === 'POST') return json(res, 200, service.markCreated()), true;
      if (p === '/slack/token' && m === 'POST') {
        const b = await body<{ token?: unknown }>(req);
        if (typeof b.token !== 'string' || !b.token.trim()) throw new BadRequest('"token" is required');
        const r = await service.pasteToken(b.token);
        return json(res, r.ok ? 200 : 400, r), true;
      }
      if (p === '/slack/settings' && m === 'PUT') return json(res, 200, service.updateSettings(await body<SlackSettingsPatch>(req))), true;
      if (p === '/slack/owner/reset' && m === 'POST') return json(res, 200, service.resetOwner()), true;
      if (p === '/slack/members' && m === 'GET') return json(res, 200, { members: await service.members() }), true;
      json(res, 405, { error: 'method not allowed' });
    } catch (err) {
      json(res, err instanceof BadRequest ? 400 : 500, { error: String((err as Error)?.message ?? err) });
    }
    return true;
  };
}

/** Optional module for the local server: `createTrackerBridge(root, { plugins: [slackPlugin()] })`. */
export function slackPlugin(o: Partial<Omit<SlackServiceOptions, 'root' | 'active' | 'url'>> = {}): BridgePluginFactory {
  return (ctx: BridgeContext): BridgePlugin => {
    const service = new SlackService({ pollMs: 1000, ...o, configDir: o.configDir ?? configDir(o.env), root: ctx.root, active: ctx.active, url: ctx.url });
    const handle = slackRoutes(service);
    return { handle, close: () => service.close() };
  };
}
