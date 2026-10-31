import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { VerificationConfig } from '../model/verification';
import { parseVerificationConfig } from './config';

/** `<tracker dir>/verification.json`, committed with the repo. */
export const VERIFICATION_FILE = 'verification.json';

export interface ConfigRead {
  path: string;
  exists: boolean;
  config?: VerificationConfig;
  errors: string[];
  /** `sha256:<hex>` of the file as read; attempts record it to notice edits. */
  hash?: string;
}

export const configHash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

export function readVerificationConfig(root: string): ConfigRead {
  const file = path.join(root, VERIFICATION_FILE);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { path: file, exists: false, errors: [] };
  }
  return { path: file, exists: true, ...parseVerificationConfig(text), hash: configHash(text) };
}
