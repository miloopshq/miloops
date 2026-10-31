import { leaseHealth, type TicketLease } from '@miloops-hq/core';
import { Button, Meta, Pill } from '../../components/ui';
import { useNow } from '../../hooks';
import { ago, dur } from '../../lib';

/** An agent's claim lease on the ticket: last activity, time left before it returns to the queue, manual release. */
export function LeaseFacts({ lease, onRelease }: { lease: TicketLease; onRelease: () => void }) {
  const now = useNow(1000);
  const health = leaseHealth(lease, now);
  const left = lease.expiresAt - now;
  return (
    <div className={`lease lease-${health}`}>
      <div className="lease-head">
        <Meta parts={['Lease', lease.agent, `active ${ago(now - lease.renewedAt)} ago`]} />
        {health !== 'live' && <Pill tone="amber">Stalled</Pill>}
      </div>
      <p className="lease-line">
        {health === 'expired'
          ? 'Lease expired · returning to the queue'
          : health === 'stalled'
            ? `Agent went quiet · returns to the queue in ${dur(left)}`
            : `Renewed by agent activity · returns to the queue after ${dur(left)} of silence`}
      </p>
      {lease.notes.length > 0 && (
        <ul className="lease-notes">
          {lease.notes.slice(-3).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <Button variant={health === 'live' ? 'default' : 'urgent'} onClick={onRelease}>
          Release to queue
        </Button>
      </div>
    </div>
  );
}
