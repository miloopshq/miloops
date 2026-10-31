import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { TrackerAdapter } from '../adapters/adapter';
import { readLeases } from '../agents/leaseStore';
import { reclaimExpired } from '../agents/returnToQueue';
import { leasePaths } from '../agents/ticketLease';

/**
 * Sends a named `leases` SSE event (`{ leases }`) whenever a lease file changes,
 * and returns expired leases to the queue every `reapMs`, so a crashed agent's
 * ticket frees up even when no other agent asks for work. Returns the stop function.
 */
export function watchLeases(
  root: string,
  active: () => Promise<TrackerAdapter>,
  send: (text: string) => void,
  opts: { pollMs?: number; reapMs?: number } = {},
): () => void {
  const dir = path.join(root, leasePaths.dir);
  let last = '';
  const signature = () => {
    try {
      return readdirSync(dir)
        .filter((n) => n.endsWith('.json'))
        .map((n) => `${n}:${statSync(path.join(dir, n), { throwIfNoEntry: false })?.mtimeMs}`)
        .join('|');
    } catch {
      return '';
    }
  };
  const poll = setInterval(() => {
    const sig = signature();
    if (sig === last) return;
    last = sig;
    send(`event: leases\ndata: ${JSON.stringify({ leases: readLeases(root) })}\n\n`);
  }, opts.pollMs ?? 1000);
  let reaping = false;
  const reap = setInterval(() => {
    if (reaping) return;
    reaping = true;
    void active()
      .then((a) => reclaimExpired(root, a))
      .catch(() => {})
      .finally(() => (reaping = false));
  }, opts.reapMs ?? 15_000);
  poll.unref?.();
  reap.unref?.();
  return () => {
    clearInterval(poll);
    clearInterval(reap);
  };
}
