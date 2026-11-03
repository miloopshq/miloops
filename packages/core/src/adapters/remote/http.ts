import { sleep } from '../../lib/emitter';

export type TrackerErrorCode = 'offline' | 'rate_limited' | 'auth' | 'not_found' | 'invalid' | 'http';

/** Every failure a remote tracker reports, classified so callers can queue, wait, or surface it. */
export class TrackerError extends Error {
  constructor(
    readonly code: TrackerErrorCode,
    message: string,
    readonly status?: number,
    /** For `rate_limited`: when the window resets (epoch ms). */
    readonly resetAt?: number,
  ) {
    super(message);
    this.name = 'TrackerError';
  }
}

/** Offline and rate-limited failures clear up on their own; writes that hit them can be queued. */
export const isTransient = (e: unknown): e is TrackerError =>
  e instanceof TrackerError && (e.code === 'offline' || e.code === 'rate_limited');

export interface RateInfo {
  limit?: number;
  remaining?: number;
  resetAt?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
}

export interface HttpOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Longest rate-limit wait absorbed inside one call; longer limits surface as `rate_limited`. */
  maxWaitMs?: number;
  /** Retries for 5xx and short rate limits. */
  retries?: number;
  timeoutMs?: number;
}

/** Per-service rules: how a response says "rate limited" and where the quota headers live. */
export interface HttpProfile {
  name: string;
  /** Epoch ms the caller may retry at, when `res` is a rate-limit response. */
  rateLimitedUntil(status: number, headers: Headers, body: unknown, now: number): number | undefined;
  rate(headers: Headers): RateInfo | undefined;
  /** Error text from a service error body. */
  message(body: unknown): string | undefined;
}

const num = (v: string | null) => (v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

/** JSON when it parses; non-JSON error pages stay as text, and an empty body is `undefined`. */
function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function statusCode(status: number): TrackerErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 422 || status === 400) return 'invalid';
  return 'http';
}

/** A plain-text error body, trimmed; anything else has no message. */
const textMessage = (b: unknown) => (typeof b === 'string' && b ? b.slice(0, 200) : undefined);

function graphqlCode(code: string): TrackerErrorCode {
  if (/AUTH|FORBIDDEN/i.test(code)) return 'auth';
  if (/NOT_FOUND|ENTITY_NOT_FOUND/i.test(code)) return 'not_found';
  if (/INVALID|VALIDATION|BAD_USER_INPUT/i.test(code)) return 'invalid';
  return 'http';
}

export class HttpClient {
  rate: RateInfo = {};
  private f: typeof fetch;
  private wait: (ms: number) => Promise<void>;
  private now: () => number;

  constructor(
    private profile: HttpProfile,
    private o: HttpOptions = {},
  ) {
    this.f = o.fetch ?? ((...a) => fetch(...a));
    this.wait = o.sleep ?? sleep;
    this.now = o.now ?? Date.now;
  }

  async send<T = unknown>(url: string, init: RequestInit = {}): Promise<HttpResponse<T>> {
    const { name } = this.profile;
    const retries = this.o.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.f(url, { ...init, signal: AbortSignal.timeout(this.o.timeoutMs ?? 20_000) });
      } catch (err) {
        throw new TrackerError('offline', `${name} unreachable (${(err as Error).message || err})`);
      }
      const body = parseBody(await res.text().catch(() => ''));
      const rate = this.profile.rate(res.headers);
      if (rate) this.rate = rate;
      const until = this.profile.rateLimitedUntil(res.status, res.headers, body, this.now());
      if (until !== undefined) {
        const ms = Math.max(1000, until - this.now());
        if (attempt < retries && ms <= (this.o.maxWaitMs ?? 15_000)) {
          await this.wait(ms);
          continue;
        }
        throw new TrackerError(
          'rate_limited',
          `${name} rate limit reached; resumes at ${new Date(until).toISOString().slice(11, 16)} UTC`,
          res.status,
          until,
        );
      }
      if (res.status >= 500 && attempt < retries) {
        await this.wait(1000 * 2 ** attempt);
        continue;
      }
      if (res.status >= 400) {
        const detail = this.profile.message(body) ?? res.statusText;
        throw new TrackerError(statusCode(res.status), `${name} ${res.status}: ${detail}`, res.status);
      }
      return { status: res.status, headers: res.headers, body: body as T };
    }
  }
}

export const github: HttpProfile = {
  name: 'GitHub',
  rateLimitedUntil(status, h, body, now) {
    const ra = num(h.get('retry-after'));
    const graphqlLimited =
      status === 200 &&
      Array.isArray((body as { errors?: { type?: string }[] })?.errors) &&
      (body as { errors: { type?: string }[] }).errors.some((e) => e.type === 'RATE_LIMITED');
    if (status !== 403 && status !== 429 && !graphqlLimited) return undefined;
    if (ra !== undefined) return now + ra * 1000;
    if (h.get('x-ratelimit-remaining') === '0') return (num(h.get('x-ratelimit-reset')) ?? now / 1000 + 60) * 1000;
    if (graphqlLimited || /rate limit/i.test(String((body as { message?: string })?.message ?? '')))
      return now + 60_000;
    return undefined;
  },
  rate(h) {
    const limit = num(h.get('x-ratelimit-limit'));
    if (limit === undefined) return undefined;
    const reset = num(h.get('x-ratelimit-reset'));
    return {
      limit,
      remaining: num(h.get('x-ratelimit-remaining')),
      resetAt: reset === undefined ? undefined : reset * 1000,
    };
  },
  message: (b) =>
    typeof b === 'object' && b && 'message' in b ? String((b as { message: unknown }).message) : textMessage(b),
};

interface GqlErrorBody {
  errors?: { message?: string; extensions?: { code?: string; type?: string } }[];
}

export const linear: HttpProfile = {
  name: 'Linear',
  rateLimitedUntil(status, h, body, now) {
    const limited =
      status === 429 || !!(body as GqlErrorBody)?.errors?.some((e) => e.extensions?.code === 'RATELIMITED');
    if (!limited) return undefined;
    return num(h.get('x-ratelimit-requests-reset')) ?? now + 60_000;
  },
  rate(h) {
    const limit = num(h.get('x-ratelimit-requests-limit'));
    if (limit === undefined) return undefined;
    return {
      limit,
      remaining: num(h.get('x-ratelimit-requests-remaining')),
      resetAt: num(h.get('x-ratelimit-requests-reset')),
    };
  },
  message: (b) => (b as GqlErrorBody)?.errors?.[0]?.message ?? textMessage(b),
};

/** GraphQL `errors` on a 200 response, classified like HTTP errors. */
export function graphqlError(name: string, body: unknown): TrackerError | undefined {
  const errs = (body as GqlErrorBody)?.errors;
  if (!errs?.length) return undefined;
  const e = errs[0];
  const code = e.extensions?.code ?? e.extensions?.type ?? (e as { type?: string }).type ?? '';
  return new TrackerError(graphqlCode(code), `${name}: ${e.message ?? code}`);
}
