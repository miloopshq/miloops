import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

declare const __FIXTURES__: string;
export const FIXTURES = __FIXTURES__;

/**
 * One HTTP exchange. GraphQL requests are keyed by operation name and
 * variables (the query text is the adapter's business); REST by method, path
 * and JSON body. `res.status: 0` replays a network failure (offline).
 */
export interface Exchange {
  req: { method: string; url: string; operation?: string; variables?: unknown; body?: unknown; ifNoneMatch?: string };
  res: { status: number; headers?: Record<string, string>; body?: unknown };
}

export interface Fixture {
  /** `live`: recorded against the real API; `fake`: recorded against test/fakes (shapes from the live API and schema). */
  source: 'live' | 'fake';
  recordedAt: string;
  notes?: string;
  exchanges: Exchange[];
}

const KEEP_HEADERS = /^(etag|retry-after|x-ratelimit-.*|content-type)$/i;

function describe(url: string, init: RequestInit = {}): Exchange['req'] {
  const u = new URL(url);
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
  const ifNoneMatch = new Headers(init.headers).get('if-none-match') ?? undefined;
  const req: Exchange['req'] = { method, url: u.pathname + u.search, ...(ifNoneMatch ? { ifNoneMatch } : {}) };
  if (body && typeof body.query === 'string') {
    req.operation = body.query.match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1] ?? 'anonymous';
    if (body.variables && Object.keys(body.variables).length) req.variables = body.variables;
  } else if (body !== undefined) req.body = body;
  return req;
}

/** Wraps a fetch and keeps every exchange; `save` writes them as a fixture. */
export function recorder(inner: typeof fetch, trim: (req: Exchange['req'], body: unknown) => unknown = (_r, b) => b) {
  const exchanges: Exchange[] = [];
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const req = describe(String(input instanceof Request ? input.url : input), init);
    let res: Response;
    try {
      res = await inner(input, init);
    } catch (err) {
      exchanges.push({ req, res: { status: 0 } });
      throw err;
    }
    const text = await res.text();
    const headers = Object.fromEntries([...res.headers].filter(([k]) => KEEP_HEADERS.test(k)));
    const body = text ? trim(req, JSON.parse(text)) : undefined;
    exchanges.push({ req, res: { status: res.status, headers, ...(body === undefined ? {} : { body }) } });
    return new Response(res.status === 304 || !text ? null : JSON.stringify(body), { status: res.status, headers: res.headers });
  };
  return {
    fetch: fetchFn as typeof fetch,
    exchanges,
    save(name: string, source: Fixture['source'], notes?: string) {
      const fx: Fixture = { source, recordedAt: new Date().toISOString(), notes, exchanges };
      writeFileSync(path.join(FIXTURES, name), JSON.stringify(fx, null, 2) + '\n');
      return fx;
    },
  };
}

/** A fetch that answers from a fixture, in order, and fails the test on any unexpected request. */
export function replay(name: string) {
  const fx = JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as Fixture;
  let i = 0;
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const got = describe(String(input instanceof Request ? input.url : input), init);
    const ex = fx.exchanges[i++];
    assert.ok(ex, `${name}: unexpected request #${i}: ${got.method} ${got.url} ${got.operation ?? ''}`);
    assert.deepEqual(got, ex.req, `${name}: request #${i} differs from the fixture`);
    if (ex.res.status === 0) throw new TypeError('fetch failed');
    return new Response(ex.res.status === 304 || ex.res.body === undefined ? null : JSON.stringify(ex.res.body), { status: ex.res.status, headers: ex.res.headers });
  };
  return {
    fixture: fx,
    fetch: fetchFn as typeof fetch,
    get used() {
      return i;
    },
    done() {
      assert.equal(i, fx.exchanges.length, `${name}: ${fx.exchanges.length - i} recorded exchanges were never requested`);
    },
  };
}

/** A fetch that fails (network down) or answers with `respond` while `fault` is set. */
export function faulty(inner: typeof fetch) {
  const state: { fault?: 'offline' | ((url: string, init: RequestInit) => Response | undefined) } = {};
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    if (state.fault === 'offline') throw new TypeError('fetch failed');
    const r = typeof state.fault === 'function' ? state.fault(String(input), init) : undefined;
    return r ?? inner(input, init);
  };
  return { fetch: fetchFn as typeof fetch, state };
}
