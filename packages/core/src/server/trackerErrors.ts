import type { IncomingMessage, ServerResponse } from 'node:http';
import { TrackerError } from '../adapters/remote/http';
import { OperationError } from '../planning/operations';

const STATUS: Record<TrackerError['code'], number> = {
  offline: 503,
  rate_limited: 429,
  auth: 401,
  not_found: 404,
  invalid: 400,
  http: 502,
};

/** JSON error response for tracker and operation failures; false for anything else. */
export function sendTrackerError(res: ServerResponse, err: unknown): boolean {
  if (!(err instanceof TrackerError) && !(err instanceof OperationError)) return false;
  const body =
    err instanceof TrackerError ? { error: err.message, code: err.code, resetAt: err.resetAt } : { error: err.message };
  res.statusCode = err instanceof TrackerError ? STATUS[err.code] : 409;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
  return true;
}

/** Routes that reach credentials must not be drivable by other sites from a browser. */
export function crossSite(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return true;
  return req.method !== 'GET' && !String(req.headers['content-type'] ?? '').startsWith('application/json');
}
