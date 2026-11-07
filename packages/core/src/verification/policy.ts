import type { VerificationLevel } from '../model/lifecycle';
import type { MapDoc, Ticket } from '../model/types';
import type { VerificationConfig } from '../model/verification';
import { DEFAULT_CONFIG } from './config';

export interface LevelInfo {
  level: VerificationLevel;
  /** Where the level came from: a ticket override, the trail, or nothing set (off). */
  source: 'ticket' | 'trail' | 'none';
  /** Check names to run, in order. */
  checks: string[];
}

/**
 * The verification a ticket's completion needs. A ticket override wins; else
 * the trail level, for the ticket types it applies to; else off. The config
 * `default` is only used when a trail is created, so trails that predate
 * verification stay off.
 */
export function verificationFor(config: VerificationConfig | undefined, map: MapDoc, t: Ticket): LevelInfo {
  const c = config ?? DEFAULT_CONFIG;
  const checks = t.checks ?? c.run;
  if (t.verification) return { level: t.verification, source: 'ticket', checks };
  if (map.verification && c.appliesTo.includes(t.type)) return { level: map.verification, source: 'trail', checks };
  return { level: 'off', source: 'none', checks };
}
