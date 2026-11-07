import { readAttentionPolicy } from '@teamtrail/core/bridge';

/**
 * How long a trail's lines wait between digest messages: the team's `digestMinutes` from attention.json, read on
 * every flush so an edit applies without a restart. `undefined` means the digest is off (`digestMinutes: 0`): those
 * lines are not posted, and everything still waits in Waiting on you. An explicit `batchMs` wins (tests).
 */
export function digestWindowMs(o: { root: string; batchMs?: number }): number | undefined {
  if (o.batchMs !== undefined) return o.batchMs;
  const minutes = readAttentionPolicy(o.root).value.digestMinutes;
  return minutes > 0 ? minutes * 60_000 : undefined;
}
