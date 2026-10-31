import { leaseHealth, type TicketLease } from '@miloops-hq/core';
import { Pill } from '../../components/ui';
import { dur } from '../../lib';

/** "stalled" on a claim whose lease is about to run out, with the time left. Nothing while the agent is active. */
export function LeasePill({ lease, now }: { lease?: TicketLease; now: number }) {
  if (!lease) return null;
  const health = leaseHealth(lease, now);
  if (health === 'live') return null;
  const left = lease.expiresAt - now;
  return (
    <Pill
      tone="amber"
      className="stalled"
      title={`No activity from ${lease.agent}; the ticket returns to the queue when the lease runs out`}
    >
      stalled · {health === 'expired' ? 'returning' : dur(left)}
    </Pill>
  );
}
