import { readdirSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { nodeMarkdownFs } from './node';
import { MarkdownAdapter } from './adapters/markdown';
import { DECISION_SOURCES, parseDecision } from './decisions';
import { OperationError, recordDecision, supersedeDecision } from './operations';
import { AnswerError, readAgentDoc, readAgentDocs, writeAgentAnswer } from './agentHost';
import { SESSION_DOC_PATH, agentPaths, isAgentPath, type AgentAnswer } from './agentLink';
import type { DecisionInput, DecisionRecord } from './types';

export interface TrackerBridge {
  root: string;
  /**
   * Handles a request whose URL has already had the API prefix stripped:
   *   GET  /list, GET|PUT /file?path=        raw tracker files (the browser's MarkdownFs)
   *   GET  /events                           SSE: `{ path }` per changed file; named `decision` events (DecisionEvent);
   *                                          named `agent` events (AgentSessionDoc) when an agent session reports
   *   GET  /agents                           `{ sessions: AgentSessionDoc[] }` running and recent agent sessions
   *   POST /agents/answer                    body `{ sessionId, questionId, text, author? }` → AgentAnswer
   *   GET  /decisions[?mission=<id>]         `{ decisions: DecisionRecord[] }`
   *   POST /decisions                        body `{ mission, appendToMission?, ...DecisionInput }` → DecisionRecord (idempotent per source.kind + source.ref)
   *   POST /decisions/<id>/supersede         body `{ mission, ...DecisionInput }` → the new DecisionRecord
   */
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): void;
}

/** Payload of the SSE `decision` event. */
export interface DecisionEvent {
  kind: 'decision.recorded' | 'decision.superseded' | 'decision.updated';
  mapId: string;
  decision: DecisionRecord;
}

const DECISION_PATH = /^([^/]+)\/decisions\/([^/]+)\.md$/;

class BadRequest extends Error {}

/**
 * HTTP API for the local-markdown tracker. Shared by the Vite dev plugin and
 * the `miloops` CLI so both serve the same contract.
 */
export function createTrackerBridge(root: string): TrackerBridge {
  const abs = path.resolve(root);
  const fs = nodeMarkdownFs(abs);
  const adapter = new MarkdownAdapter({ ...fs, watch: undefined }, abs);
  const clients = new Set<ServerResponse>();
  const seen = new Map<string, { text: string; supersededBy?: string }>();
  const send = (text: string) => {
    for (const c of clients) c.write(text);
  };

  async function onDecisionFile(rel: string) {
    let text: string;
    try {
      text = await fs.read(rel);
    } catch {
      return;
    }
    const prev = seen.get(rel);
    if (prev?.text === text) return;
    const decision = { ...parseDecision(text), mapId: rel.split('/')[0] };
    seen.set(rel, { text, supersededBy: decision.supersededBy });
    const kind: DecisionEvent['kind'] = !prev ? 'decision.recorded' : decision.supersededBy && !prev.supersededBy ? 'decision.superseded' : 'decision.updated';
    const ev: DecisionEvent = { kind, mapId: decision.mapId, decision };
    send(`event: decision\ndata: ${JSON.stringify(ev)}\n\n`);
  }

  void fs.list().then(async (files) => {
    for (const f of files.filter((x) => DECISION_PATH.test(x))) {
      const text = await fs.read(f).catch(() => '');
      seen.set(f, { text, supersededBy: text ? parseDecision(text).supersededBy : undefined });
    }
  });

  const sentDocs = new Map<string, string>();
  function onAgentFile(rel: string) {
    if (!SESSION_DOC_PATH.test(rel)) return;
    const doc = readAgentDoc(abs, rel);
    if (!doc) return;
    const text = JSON.stringify(doc);
    if (sentDocs.get(rel) === text) return;
    sentDocs.set(rel, text);
    send(`event: agent\ndata: ${text}\n\n`);
  }
  // Session docs are replaced by rename, which recursive fs.watch on Linux reports only once per file,
  // so they are polled by mtime. A killed agent writes nothing more: running sessions are re-read to notice.
  const mtimes = new Map<string, number>();
  let ticks = 0;
  const liveness = setInterval(() => {
    const recheck = ++ticks % 10 === 0;
    let names: string[] = [];
    try {
      names = readdirSync(path.join(abs, agentPaths.sessions)).filter((n) => n.endsWith('.json'));
    } catch {
      return;
    }
    for (const n of names) {
      const rel = `${agentPaths.sessions}/${n}`;
      const m = statSync(path.join(abs, rel), { throwIfNoEntry: false })?.mtimeMs;
      if (m === undefined) continue;
      if (mtimes.get(rel) !== m || (recheck && sentDocs.get(rel)?.includes('"status":"running"'))) {
        mtimes.set(rel, m);
        onAgentFile(rel);
      }
    }
  }, 500);
  liveness.unref?.();

  const unwatch = fs.watch!((rel) => {
    if (isAgentPath(rel)) return onAgentFile(rel);
    send(`data: ${JSON.stringify({ path: rel })}\n\n`);
    if (DECISION_PATH.test(rel)) void onDecisionFile(rel);
  });

  async function body<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
    } catch {
      throw new BadRequest('body must be JSON');
    }
  }

  async function missionOf(b: { mission?: unknown }) {
    const id = typeof b.mission === 'string' ? b.mission : '';
    if (!(await adapter.listMaps()).some((m) => m.id === id)) throw new BadRequest(`unknown mission "${id}"`);
    return id;
  }

  function checkInput(b: Partial<DecisionInput>, needQuestion: boolean) {
    const required: ('question' | 'answer' | 'decidedBy')[] = [...(needQuestion ? (['question'] as const) : []), 'answer', 'decidedBy'];
    for (const k of required)
      if (typeof b[k] !== 'string' || !b[k]!.trim()) throw new BadRequest(`"${k}" is required`);
    if (!b.source || !(b.source.kind in DECISION_SOURCES)) throw new BadRequest(`"source.kind" must be one of ${Object.keys(DECISION_SOURCES).join(', ')}`);
  }

  const json = (res: ServerResponse, status: number, v: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(v));
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': ok\n\n');
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
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          await fs.write(p, Buffer.concat(chunks).toString('utf8'));
          res.end('ok');
          return;
        }
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.end(await fs.read(p));
        return;
      }
      if (url.pathname === '/decisions' && req.method === 'GET') {
        const only = url.searchParams.get('mission');
        const ids = only ? [only] : (await adapter.listMaps()).map((m) => m.id);
        const decisions = (await Promise.all(ids.map((id) => adapter.listDecisions(id)))).flat().sort((a, b) => b.decidedAt - a.decidedAt);
        json(res, 200, { decisions });
        return;
      }
      if (url.pathname === '/decisions' && req.method === 'POST') {
        const b = await body<Partial<DecisionInput> & { mission?: string; appendToMission?: boolean }>(req);
        const mapId = await missionOf(b);
        checkInput(b, true);
        const { mission: _m, appendToMission, ...input } = b;
        json(res, 201, await recordDecision(adapter, mapId, input as DecisionInput, { appendToMission }));
        return;
      }
      if (url.pathname === '/agents' && req.method === 'GET') {
        json(res, 200, { sessions: await readAgentDocs(abs) });
        return;
      }
      if (url.pathname === '/agents/answer' && req.method === 'POST') {
        const b = await body<Partial<AgentAnswer>>(req);
        for (const k of ['sessionId', 'questionId', 'text'] as const)
          if (typeof b[k] !== 'string' || !b[k]!.trim()) throw new BadRequest(`"${k}" is required`);
        json(res, 201, writeAgentAnswer(abs, { sessionId: b.sessionId!, questionId: b.questionId!, text: b.text!, author: typeof b.author === 'string' && b.author ? b.author : 'operator' }));
        return;
      }
      const sup = url.pathname.match(/^\/decisions\/([^/]+)\/supersede$/);
      if (sup && req.method === 'POST') {
        const b = await body<Partial<DecisionInput> & { mission?: string }>(req);
        const mapId = await missionOf(b);
        checkInput(b, false);
        const { mission: _m, ...input } = b;
        json(res, 201, await supersedeDecision(adapter, mapId, decodeURIComponent(sup[1]), input as DecisionInput));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    } catch (err) {
      if (err instanceof BadRequest || err instanceof OperationError || err instanceof AnswerError) json(res, err instanceof BadRequest ? 400 : 409, { error: err.message });
      else {
        res.statusCode = 500;
        res.end(String(err));
      }
    }
  }

  return {
    root: abs,
    handle,
    close() {
      unwatch();
      clearInterval(liveness);
      for (const c of clients) c.end();
      clients.clear();
    },
  };
}
