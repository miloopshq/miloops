import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RiskPolicy } from '../model/risk';
import { DEFAULT_POLICY } from './defaultPolicy';
import { parsePolicy, serializePolicy } from './policyFile';

/** Committed next to `verification.json`, so the whole team shares one policy. */
export const POLICY_FILE = 'policy.json';

/**
 * The project's risk policy. `defaults` when there's no file. A file with errors also falls back to the
 * defaults, so a typo never lowers the bar, and the errors are reported for the command center to show.
 */
export interface PolicyRead {
  policy: RiskPolicy;
  errors: string[];
  defaults: boolean;
}

export const policyPath = (root: string) => path.join(root, POLICY_FILE);

export function readPolicy(root: string): PolicyRead {
  const f = policyPath(root);
  if (!existsSync(f)) return { policy: DEFAULT_POLICY, errors: [], defaults: true };
  const { policy, errors } = parsePolicy(readFileSync(f, 'utf8'));
  if (policy) return { policy, errors, defaults: false };
  return { policy: DEFAULT_POLICY, errors, defaults: true };
}

export function writePolicy(root: string, policy: RiskPolicy) {
  mkdirSync(root, { recursive: true });
  writeFileSync(policyPath(root), serializePolicy(policy));
}
