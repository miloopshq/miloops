import type { TrackerAdapter } from '../adapters/adapter';
import { journalFile } from '../history/journalFile';
import { transition } from '../planning/lifecycle/transition';
import { dropLease, readLeases, takeLease } from './leaseStore';
import { handoffComment, leaseHealth, TOMBSTONE_MS, type LeaseReturnReason, type TicketLease } from './ticketLease';

/** Who returns expired leases in the handoff comment and the tombstone. */
export const LEASE_REAPER = 'miloops';

export type ReturnOutcome = { returned: TicketLease } | { dropped: TicketLease } | { busy: true };

/**
 * Puts a leased ticket back on the queue: a handoff comment with the agent's
 * notes, then the assignment is cleared. Both are ordinary tracker writes, so
 * GitHub and Linear queue them in the outbox while offline. A lease whose
 * ticket was closed or reassigned meanwhile is only dropped.
 */
export async function returnToQueue(
  root: string,
  adapter: TrackerAdapter,
  lease: TicketLease,
  reason: LeaseReturnReason,
  by: string,
  now = Date.now(),
): Promise<ReturnOutcome> {
  const taken = takeLease(root, lease);
  if (!taken) return { busy: true };
  const l = taken.lease;
  if (l.returned || (reason === 'expired' && leaseHealth(l, now) !== 'expired')) {
    taken.put(l);
    return { busy: true };
  }
  try {
    const snap = await adapter.loadMap(l.mapId);
    const t = snap.tickets.find((x) => x.id === l.ticketId);
    if (!t || t.state === 'closed' || t.assignee !== l.agent) {
      taken.drop();
      return { dropped: l };
    }
    await adapter.comment(l.mapId, l.ticketId, by, handoffComment(l, reason, by));
    await transition(
      adapter,
      l.mapId,
      l.ticketId,
      {
        event: reason === 'expired' ? 'expire' : 'release',
        actor: by,
        actorKind: reason === 'expired' ? 'engine' : 'operator',
        reason: reason === 'expired' ? `${l.agent} went silent` : `claim of ${l.agent} released`,
        sessionId: l.sessionId,
      },
      { journal: journalFile(root) },
    );
  } catch (e) {
    taken.put(l);
    throw e;
  }
  const tomb: TicketLease = { ...l, returned: { at: now, reason, by } };
  taken.put(tomb);
  return { returned: tomb };
}

/** Returns every expired lease under `root` to the queue and forgets old tombstones. Never throws. */
export async function reclaimExpired(root: string, adapter: TrackerAdapter, now = Date.now()) {
  const returned: TicketLease[] = [];
  for (const l of readLeases(root)) {
    if (l.returned) {
      if (now - l.returned.at > TOMBSTONE_MS) dropLease(root, l.mapId, l.ticketId);
      continue;
    }
    if (leaseHealth(l, now) !== 'expired') continue;
    const r = await returnToQueue(root, adapter, l, 'expired', LEASE_REAPER, now).catch(() => undefined);
    if (r && 'returned' in r) returned.push(r.returned);
  }
  return returned;
}
