import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import { GitHubAdapter, testGitHub } from '../adapters/remote/github';
import { TrackerError } from '../adapters/remote/http';
import { LinearAdapter, testLinear } from '../adapters/remote/linear';
import { orphanedWrites, outboxFile, outboxKey } from '../adapters/remote/outboxFile';
import type { SyncedAdapter } from '../adapters/remote/synced';
import type { RemoteKind, TrackerConnectRequest, TrackerSettings, TrackerTestRequest, TrackerTestResult } from '../adapters/remote/types';
import { BRAND } from '../model/brand';
import { OperationError } from '../planning/operations';
import type { TrackerEvent } from '../model/types';
import { configDir, credentialStore, detectGitHubRepo, projectConfig, resolveGitHubToken, resolveLinearKey, run, type ProjectTrackerConfig, type Run } from './trackerConfig';

export interface TrackerRoutesOptions {
  /** Tracker folder; `trackers.json` lives here. */
  root: string;
  /** Repo checkout, for detecting the GitHub `origin`. */
  cwd?: string;
  /** Answers when the project uses local markdown. */
  markdown: TrackerAdapter;
  env?: Record<string, string | undefined>;
  exec?: Run;
  fetch?: typeof fetch;
  configDir?: string;
}

const CALL_NAMES = [
  'listMaps',
  'loadMap',
  'createMap',
  'setMapMode',
  'updateMapSections',
  'createTicket',
  'addBlocking',
  'assign',
  'comment',
  'close',
  'listDecisions',
  'createDecision',
  'markSuperseded',
] as const satisfies readonly (keyof TrackerAdapter)[];
const CALLS = new Set<keyof TrackerAdapter>(CALL_NAMES);

const STATUS: Record<TrackerError['code'], number> = { offline: 503, rate_limited: 429, auth: 401, not_found: 404, invalid: 400, http: 502 };

/** JSON error response for tracker and operation failures; false for anything else. */
export function sendTrackerError(res: ServerResponse, err: unknown): boolean {
  if (!(err instanceof TrackerError) && !(err instanceof OperationError)) return false;
  const body = err instanceof TrackerError ? { error: err.message, code: err.code, resetAt: err.resetAt } : { error: err.message };
  res.statusCode = err instanceof TrackerError ? STATUS[err.code] : 409;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
  return true;
}

class BadRequest extends Error {}

/** Routes that reach credentials must not be drivable by other sites from a browser. */
export function crossSite(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return true;
  return req.method !== 'GET' && !String(req.headers['content-type'] ?? '').startsWith('application/json');
}

const isKind = (k: string | undefined): k is RemoteKind => k === 'github' || k === 'linear';

/** Queued writes belong to one repo / team, so switching target never replays them into another. */
const queueKey = (cfg: ProjectTrackerConfig, kind: RemoteKind) => (kind === 'github' ? outboxKey('github', cfg.github?.repo) : outboxKey('linear', cfg.linear?.teamId, cfg.linear?.projectId));

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
  const env = o.env ?? process.env;
  const exec = o.exec ?? run;
  const project = projectConfig(o.root);
  const creds = credentialStore(o.configDir ?? configDir(env));
  const apiUrl = { github: env[`${BRAND.slug.toUpperCase()}_GITHUB_API`], linear: env[`${BRAND.slug.toUpperCase()}_LINEAR_API`] };
  const adapters: Partial<Record<RemoteKind, Promise<SyncedAdapter>>> = {};
  const live: Partial<Record<RemoteKind, SyncedAdapter>> = {};
  let detected: Promise<string | undefined> | undefined;
  let ghToken: { at: number; value: ReturnType<typeof resolveGitHubToken> } | undefined;

  const githubToken = () => {
    if (!ghToken || Date.now() - ghToken.at > 30_000) ghToken = { at: Date.now(), value: resolveGitHubToken(creds.read(), env, exec) };
    return ghToken.value;
  };

  function reset(kind: RemoteKind) {
    live[kind]?.dispose();
    delete live[kind];
    delete adapters[kind];
    ghToken = undefined;
  }

  async function build(kind: RemoteKind): Promise<SyncedAdapter> {
    const cfg = project.read();
    if (kind === 'github') {
      if (!cfg.github?.repo) throw new TrackerError('invalid', 'GitHub is not connected; connect it in Settings');
      const t = await githubToken();
      if (!t) throw new TrackerError('auth', 'No GitHub token: run `gh auth login`, set GITHUB_TOKEN, or paste one in Settings');
      return new GitHubAdapter({ repo: cfg.github.repo, token: t.token, apiUrl: apiUrl.github, fetch: o.fetch, outbox: outboxFile(o.root, queueKey(cfg, 'github')) });
    }
    if (!cfg.linear?.teamId) throw new TrackerError('invalid', 'Linear is not connected; connect it in Settings');
    const k = resolveLinearKey(creds.read(), env);
    if (!k) throw new TrackerError('auth', 'No Linear API key: set LINEAR_API_KEY or paste one in Settings');
    const display = [cfg.linear.teamKey, cfg.linear.projectName].filter(Boolean).join(' · ') || undefined;
    return new LinearAdapter({ apiKey: k.token, teamId: cfg.linear.teamId, projectId: cfg.linear.projectId, display, apiUrl: apiUrl.linear, fetch: o.fetch, outbox: outboxFile(o.root, queueKey(cfg, 'linear')) });
  }

  function adapter(kind: RemoteKind) {
    adapters[kind] ??= build(kind).then(
      (a) => (live[kind] = a),
      (e) => {
        delete adapters[kind];
        throw e;
      },
    );
    return adapters[kind]!;
  }

  /** Writes an earlier run queued but never sent: start the adapter now so they replay (and show in Settings). */
  function resumeQueued() {
    const cfg = project.read();
    if (isKind(cfg.active) && orphanedWrites(o.root, queueKey(cfg, cfg.active))) adapter(cfg.active).catch(() => {});
  }
  resumeQueued();

  async function settings(): Promise<TrackerSettings> {
    const cfg = project.read();
    detected ??= detectGitHubRepo(o.cwd ?? process.cwd(), exec);
    const [gh, repo] = await Promise.all([githubToken(), detected]);
    const status = (k: RemoteKind) => (live[k] ? { ...live[k]!.status } : undefined);
    return {
      active: cfg.active,
      github: { repo: cfg.github?.repo, detectedRepo: repo, auth: gh?.source ?? null, status: status('github') },
      linear: { ...cfg.linear, auth: resolveLinearKey(creds.read(), env)?.source ?? null, status: status('linear') },
    };
  }

  async function test(req: TrackerTestRequest): Promise<TrackerTestResult> {
    const cfg = project.read();
    if (req.kind === 'github') {
      const token = req.token?.trim() || (await githubToken())?.token;
      if (!token) return { ok: false, code: 'auth', error: 'No GitHub token found. Run `gh auth login`, or paste a token.' };
      detected ??= detectGitHubRepo(o.cwd ?? process.cwd(), exec);
      const repo = req.repo?.trim() || cfg.github?.repo || (await detected);
      if (!repo) return { ok: false, code: 'invalid', error: 'Enter the repository as owner/name' };
      return testGitHub({ repo, token, apiUrl: apiUrl.github, fetch: o.fetch });
    }
    const apiKey = req.apiKey?.trim() || resolveLinearKey(creds.read(), env)?.token;
    if (!apiKey) return { ok: false, code: 'auth', error: 'Paste a Linear personal API key.' };
    return testLinear({ apiKey, teamId: req.teamId ?? cfg.linear?.teamId, apiUrl: apiUrl.linear, fetch: o.fetch });
  }

  async function connect(req: TrackerConnectRequest): Promise<{ status: number; body: unknown }> {
    const cfg = project.read();
    if (req.active === 'markdown') {
      project.write({ ...cfg, active: 'markdown' });
      return { status: 200, body: await settings() };
    }
    if (req.active === 'github') {
      const repo = req.github?.repo?.trim();
      if (!repo) throw new BadRequest('"github.repo" is required');
      const result = await test({ kind: 'github', repo, token: req.github?.token });
      if (!result.ok) return { status: 400, body: result };
      if (req.github?.token?.trim()) creds.write({ ...creds.read(), github: { token: req.github.token.trim() } });
      project.write({ ...cfg, active: 'github', github: { repo: result.target ?? repo } });
      reset('github');
      return { status: 200, body: await settings() };
    }
    if (req.active === 'linear') {
      const l = req.linear;
      if (!l?.teamId) throw new BadRequest('"linear.teamId" is required');
      const result = await test({ kind: 'linear', apiKey: l.apiKey, teamId: l.teamId });
      if (!result.ok) return { status: 400, body: result };
      if (l.apiKey?.trim()) creds.write({ ...creds.read(), linear: { apiKey: l.apiKey.trim() } });
      project.write({ ...cfg, active: 'linear', linear: { teamId: l.teamId, teamKey: l.teamKey, teamName: l.teamName, projectId: l.projectId || undefined, projectName: l.projectId ? l.projectName : undefined } });
      reset('linear');
      return { status: 200, body: await settings() };
    }
    throw new BadRequest('"active" must be markdown, github or linear');
  }

  async function body<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
    } catch {
      throw new BadRequest('body must be JSON');
    }
  }

  const json = (res: ServerResponse, status: number, v: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(v));
  };

  function events(kind: RemoteKind, req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n');
    let off = () => {};
    let closed = false;
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      closed = true;
      clearInterval(ping);
      off();
    });
    adapter(kind).then(
      (a) => {
        if (closed) return;
        const status = () => res.write(`event: status\ndata: ${JSON.stringify({ ...a.status, location: a.location })}\n\n`);
        const offEvents = a.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
        const offStatus = a.onStatus(status);
        off = () => {
          offEvents();
          offStatus();
        };
        status();
      },
      (e: Error) => res.write(`event: status\ndata: ${JSON.stringify({ state: e instanceof TrackerError && e.code === 'auth' ? 'auth-error' : 'offline', queued: 0, error: e.message })}\n\n`),
    );
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    const call = p.match(/^\/tracker\/([^/]+)\/(call|events)$/);
    const forget = p.match(/^\/trackers\/credentials\/([^/]+)$/);
    if (p !== '/trackers' && p !== '/trackers/test' && !call && !forget) return false;
    try {
      if (crossSite(req)) return void json(res, 403, { error: 'cross-site request refused' }), true;
      if (p === '/trackers' && req.method === 'GET') return void json(res, 200, await settings()), true;
      if (p === '/trackers' && req.method === 'PUT') {
        const r = await connect(await body<TrackerConnectRequest>(req));
        return void json(res, r.status, r.body), true;
      }
      if (p === '/trackers/test' && req.method === 'POST') {
        const b = await body<TrackerTestRequest>(req);
        if (!isKind(b.kind)) throw new BadRequest('"kind" must be github or linear');
        return void json(res, 200, await test(b)), true;
      }
      if (forget && req.method === 'DELETE') {
        const kind = forget[1];
        if (!isKind(kind)) throw new BadRequest('unknown tracker');
        const c = creds.read();
        delete c[kind];
        creds.write(c);
        reset(kind);
        return void json(res, 200, await settings()), true;
      }
      if (call) {
        const kind = call[1];
        if (!isKind(kind)) throw new BadRequest('unknown tracker');
        if (call[2] === 'events' && req.method === 'GET') return events(kind, req, res), true;
        if (call[2] === 'call' && req.method === 'POST') {
          const b = await body<{ method?: string; args?: unknown[] }>(req);
          const method = b.method as keyof TrackerAdapter;
          if (!CALLS.has(method)) throw new BadRequest(`unknown method "${b.method}"`);
          const a = await adapter(kind);
          const fn = a[method] as (...args: unknown[]) => Promise<unknown>;
          const result = await fn.apply(a, Array.isArray(b.args) ? b.args : []);
          return void json(res, 200, { result: result ?? null }), true;
        }
      }
      json(res, 405, { error: 'method not allowed' });
    } catch (err) {
      if (err instanceof BadRequest) json(res, 400, { error: err.message });
      else if (!sendTrackerError(res, err)) json(res, 500, { error: String((err as Error)?.message ?? err) });
    }
    return true;
  }

  return {
    handle,
    /** The adapter the project is connected to, for routes shared with local markdown (decisions). */
    async active(): Promise<TrackerAdapter> {
      const a = project.read().active;
      return isKind(a) ? adapter(a) : o.markdown;
    },
    close() {
      for (const k of Object.keys(live) as RemoteKind[]) reset(k);
    },
  };
}

/**
 * The project's active tracker as a plain adapter, for processes without the
 * HTTP bridge (the MCP server). Every call re-reads `trackers.json`, so
 * connecting GitHub or Linear in Settings applies without restarting the agent;
 * a remote tracker that can't be reached fails the call instead of falling back
 * to local markdown.
 */
export function activeTracker(o: TrackerRoutesOptions): TrackerAdapter & { dispose(): void } {
  const routes = createTrackerRoutes(o);
  const listeners = new Set<(e: TrackerEvent) => void>();
  let current: TrackerAdapter = o.markdown;
  let off: () => void = () => {};
  const attach = () => {
    off();
    off = listeners.size ? current.subscribe((e) => listeners.forEach((l) => l(e))) : () => {};
  };
  const use = async () => {
    const a = await routes.active();
    if (a !== current) {
      current = a;
      attach();
    }
    return a;
  };
  const call = <K extends (typeof CALL_NAMES)[number]>(k: K) =>
    (async (...args: unknown[]) => {
      const a = await use();
      return (a[k] as (...x: unknown[]) => unknown).apply(a, args);
    }) as TrackerAdapter[K];
  return {
    get kind() {
      return current.kind;
    },
    get label() {
      return current.label;
    },
    get location() {
      return current.location;
    },
    listMaps: call('listMaps'),
    loadMap: call('loadMap'),
    createMap: call('createMap'),
    setMapMode: call('setMapMode'),
    updateMapSections: call('updateMapSections'),
    createTicket: call('createTicket'),
    addBlocking: call('addBlocking'),
    assign: call('assign'),
    comment: call('comment'),
    close: call('close'),
    listDecisions: call('listDecisions'),
    createDecision: call('createDecision'),
    markSuperseded: call('markSuperseded'),
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) attach();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) attach();
      };
    },
    dispose() {
      listeners.clear();
      off();
      routes.close();
    },
  };
}
