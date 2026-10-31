import type { IncomingMessage, ServerResponse } from 'node:http';
import { readVerificationConfig, VERIFICATION_FILE } from '../verification/configFile';
import { sendJson } from './http';

/**
 * `GET /verification/config`: the checks MILOOPS would run, read-only. The
 * file is edited in the repo, never through the API, so an agent with API
 * access cannot change what verifies its own work.
 */
export function handleVerification(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname !== '/verification/config' || req.method !== 'GET') return false;
  const read = readVerificationConfig(root);
  sendJson(res, 200, {
    file: VERIFICATION_FILE,
    exists: read.exists,
    errors: read.errors,
    hash: read.hash,
    config: read.config,
  });
  return true;
}
