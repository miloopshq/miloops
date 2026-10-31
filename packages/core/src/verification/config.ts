import { VERIFICATION_LEVELS } from '../model/lifecycle';
import { TICKET_TYPES, type TicketType } from '../model/types';
import type { CheckSpec, VerificationConfig } from '../model/verification';

export const DEFAULT_CHECK_TIMEOUT_SEC = 600;

/** Values for keys the file leaves out. Without the file there is no config, and nothing is verified. */
export const DEFAULT_CONFIG: VerificationConfig = {
  v: 1,
  default: 'checks',
  appliesTo: ['execute', 'task'],
  checks: {},
  run: [],
  failFast: true,
  maxAttempts: 3,
  totalTimeoutSec: 1800,
  noChanges: { allow: ['research', 'grilling', 'prototype'], else: 'flag' },
  stale: 'reverify',
  github: { enabled: 'auto', requiredChecks: [], pollSec: 60 },
};

const KEYS = new Set(Object.keys(DEFAULT_CONFIG));
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const posInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;

function types(v: unknown, at: string, errors: string[]): TicketType[] | undefined {
  if (!strings(v) || !(v as string[]).every((t) => (TICKET_TYPES as string[]).includes(t))) {
    errors.push(`${at} must list ticket types (${TICKET_TYPES.join(', ')})`);
    return undefined;
  }
  return v as TicketType[];
}

function check(name: string, v: unknown, errors: string[]): CheckSpec | undefined {
  const at = `checks.${name}`;
  if (!isObj(v)) return void errors.push(`${at} must be an object`);
  if (typeof v.run === 'string') return void errors.push(`${at}.run must be an argv array, not a shell string`);
  if (!strings(v.run) || !(v.run as string[]).length || !(v.run as string[])[0])
    return void errors.push(`${at}.run must be a non-empty array of strings`);
  if (v.timeoutSec !== undefined && !posInt(v.timeoutSec)) errors.push(`${at}.timeoutSec must be a positive integer`);
  if (v.cwd !== undefined && typeof v.cwd !== 'string') errors.push(`${at}.cwd must be a path`);
  const unknown = Object.keys(v).filter((k) => !['run', 'timeoutSec', 'cwd'].includes(k));
  if (unknown.length) errors.push(`${at}: unknown ${unknown.join(', ')}`);
  return {
    run: v.run as string[],
    timeoutSec: (v.timeoutSec as number) ?? DEFAULT_CHECK_TIMEOUT_SEC,
    ...(typeof v.cwd === 'string' ? { cwd: v.cwd } : {}),
  };
}

/** Parses `verification.json`; every problem is reported, and `config` is only set when there are none. */
export function parseVerificationConfig(text: string): { config?: VerificationConfig; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  if (!isObj(raw)) return { errors: ['must be a JSON object'] };
  const errors: string[] = [];
  const c: VerificationConfig = structuredClone(DEFAULT_CONFIG);
  if (raw.v !== 1) errors.push('"v" must be 1');
  for (const k of Object.keys(raw)) if (!KEYS.has(k)) errors.push(`unknown key "${k}"`);
  if (raw.default !== undefined) {
    if (VERIFICATION_LEVELS.includes(raw.default as never)) c.default = raw.default as VerificationConfig['default'];
    else errors.push(`"default" must be one of ${VERIFICATION_LEVELS.join(', ')}`);
  }
  if (raw.appliesTo !== undefined) c.appliesTo = types(raw.appliesTo, '"appliesTo"', errors) ?? c.appliesTo;
  if (raw.checks !== undefined) {
    if (!isObj(raw.checks)) errors.push('"checks" must be an object of named checks');
    else
      for (const [name, spec] of Object.entries(raw.checks)) {
        const s = check(name, spec, errors);
        if (s) c.checks[name] = s;
      }
  }
  if (raw.run !== undefined) {
    if (!strings(raw.run)) errors.push('"run" must list check names');
    else c.run = raw.run as string[];
  }
  for (const name of c.run) if (!c.checks[name]) errors.push(`"run" names unknown check "${name}"`);
  if (raw.failFast !== undefined) {
    if (typeof raw.failFast === 'boolean') c.failFast = raw.failFast;
    else errors.push('"failFast" must be true or false');
  }
  for (const k of ['maxAttempts', 'totalTimeoutSec'] as const) {
    if (raw[k] === undefined) continue;
    if (posInt(raw[k])) c[k] = raw[k] as number;
    else errors.push(`"${k}" must be a positive integer`);
  }
  if (raw.noChanges !== undefined) {
    const n = raw.noChanges;
    if (!isObj(n)) errors.push('"noChanges" must be an object');
    else {
      if (n.allow !== undefined) c.noChanges.allow = types(n.allow, '"noChanges.allow"', errors) ?? c.noChanges.allow;
      if (n.else !== undefined) {
        if (['flag', 'fail', 'human'].includes(n.else as string)) c.noChanges.else = n.else as 'flag';
        else errors.push('"noChanges.else" must be flag, fail or human');
      }
    }
  }
  if (raw.stale !== undefined) {
    if (raw.stale === 'reverify' || raw.stale === 'flag') c.stale = raw.stale;
    else errors.push('"stale" must be reverify or flag');
  }
  if (raw.github !== undefined) {
    const g = raw.github;
    if (!isObj(g)) errors.push('"github" must be an object');
    else {
      if (g.enabled !== undefined) {
        if (g.enabled === 'auto' || g.enabled === 'off') c.github.enabled = g.enabled;
        else errors.push('"github.enabled" must be auto or off');
      }
      if (g.requiredChecks !== undefined) {
        if (strings(g.requiredChecks)) c.github.requiredChecks = g.requiredChecks as string[];
        else errors.push('"github.requiredChecks" must list check names');
      }
      if (g.pollSec !== undefined) {
        if (posInt(g.pollSec) && (g.pollSec as number) >= 15) c.github.pollSec = g.pollSec as number;
        else errors.push('"github.pollSec" must be an integer of at least 15');
      }
    }
  }
  return errors.length ? { errors } : { config: c, errors };
}
