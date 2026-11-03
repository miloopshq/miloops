import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { MarkdownAdapter } from '../adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../adapters/markdown/nodeMarkdownFs';
import { AnswerError } from '../agents/agentDocs';
import { handleAgents } from './agentRoutes';
import type { BridgeOptions, TrackerBridge } from './bridgeTypes';
import { handleBriefs } from './briefRoutes';
import { handleCriteria } from './criteriaRoutes';
import { handleDecisions } from './decisionRoutes';
import { BadRequest, openEventStream, readText, sendJson } from './http';
import { handleJournal } from './journalRoutes';
import { handleKnowledge } from './knowledgeRoutes';
import { handleLeases } from './leaseRoutes';
import { sendTrackerError } from './trackerErrors';
import { createTrackerRoutes } from './trackerRoutes';
import { handleVerification } from './verificationRoutes';
import { handleVerificationSync } from './verificationSyncRoutes';
import { watchLeases } from './watchLeases';
import { watchTrackerFolder } from './watchTrackerFolder';
import { watchVerification } from './watchVerification';

/**
 * HTTP API for the local-markdown tracker. Shared by the Vite dev plugin and
 * the `miloops` CLI so both serve the same contract.
 */
export function createTrackerBridge(root: string, options: BridgeOptions = {}): TrackerBridge {
  const {
    plugins: factories = [],
    url: publicUrl = () => undefined,
    leases: leaseTiming,
    reconciler: reconcilerTiming,
    ...trackers
  } = options;
  const abs = path.resolve(root);
  const fs = nodeMarkdownFs(abs);
  const markdown = new MarkdownAdapter({ ...fs, watch: undefined }, abs);
  const routes = createTrackerRoutes({ ...trackers, root: abs, markdown });
  const plugins = factories.map((f) => f({ root: abs, active: () => routes.active(), url: publicUrl }));
  const clients = new Set<ServerResponse>();
  const send = (text: string) => {
    for (const c of clients) c.write(text);
  };
  const unwatch = watchTrackerFolder(abs, fs, send);
  const unwatchLeases = watchLeases(abs, () => routes.active(), send, leaseTiming);
  const reconciler = watchVerification(abs, () => routes.active(), routes.ciAccess, send, reconcilerTiming);

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (url.pathname === '/events') {
        openEventStream(res);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (url.pathname === '/list') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ root: abs, files: await fs.list() }));
        return;
      }
      if (url.pathname === '/file') {
        const p = url.searchParams.get('path') ?? '';
        if (req.method === 'PUT') {
          await fs.write(p, await readText(req));
          res.end('ok');
          return;
        }
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.end(await fs.read(p));
        return;
      }
      if (await routes.handle(req, res, url)) return;
      for (const p of plugins) if (await p.handle(req, res, url)) return;
      if (url.pathname.startsWith('/decisions') && (await handleDecisions(await routes.active(), req, res, url)))
        return;
      if (await handleLeases(abs, () => routes.active(), req, res, url)) return;
      if (await handleJournal(abs, req, res, url)) return;
      if (await handleVerification(abs, () => routes.active(), req, res, url)) return;
      if (await handleVerificationSync(abs, () => routes.active(), reconciler, req, res, url)) return;
      if (await handleAgents(abs, req, res, url)) return;
      if (await handleBriefs(abs, req, res, url)) return;
      if (await handleKnowledge(abs, req, res, url)) return;
      if (await handleCriteria(abs, req, res, url)) return;
      res.statusCode = 404;
      res.end('not found');
    } catch (err) {
      if (err instanceof BadRequest || err instanceof AnswerError)
        sendJson(res, err instanceof BadRequest ? 400 : 409, { error: err.message });
      else if (!sendTrackerError(res, err)) {
        res.statusCode = 500;
        res.end(String(err));
      }
    }
  }

  return {
    root: abs,
    handle,
    close() {
      for (const p of plugins) p.close();
      routes.close();
      unwatch();
      unwatchLeases();
      reconciler.stop();
      for (const c of clients) c.end();
      clients.clear();
    },
  };
}
