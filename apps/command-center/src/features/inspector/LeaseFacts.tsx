import { leaseHealth, type TicketLease } from '@miloops-hq/core';
import { Button, MetaLine, Pill } from '../../components/ui';
import { useNow } from '../../hooks';
import { ago, dur } from '../../lib';

/**
 * An agent's claim on the ticket: who and how recently, when it goes back to the queue, its worktree branch and the
 * files it said it would change, and manual release. Amber once the agent went quiet.
 */
export function LeaseFacts({ lease, onRelease }: { lease: TicketLease; onRelease: () => void }) {
  const now = useNow(1000);
  const health = leaseHealth(lease, now);
  const live = health === 'live';
  return (
    <div className={`lease lease-${health} edge-note ${live ? '' : 'edge-attention'}`}>
      <div className="edge-note-head">
        <MetaLine
          parts={[{ text: `Claimed by ${lease.agent}`, strong: true }, `active ${ago(now - lease.renewedAt)} ago`]}
        />
        {!live && <Pill tone="amber">Stalled</Pill>}
      </div>
      <p className="t-meta lease-line">{leaseLine(health, span(lease.expiresAt - now))}</p>
      {lease.workspace && (
        <p className="t-meta lease-branch">
          Works on <code className="t-code">{lease.workspace.branch}</code> in its own worktree
        </p>
      )}
      {lease.touches && lease.touches.length > 0 && (
        <p className="t-meta lease-touches">
          Expects to change{' '}
          {lease.touches.map((g, i) => (
            <span key={g}>
              {i > 0 && ', '}
              <code className="t-code">{g}</code>
            </span>
          ))}
        </p>
      )}
      {lease.notes.length > 0 && (
        <ul className="lease-notes t-meta">
          {lease.notes.slice(-3).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <Button variant={live ? 'default' : 'urgent'} onClick={onRelease}>
          Release to queue
        </Button>
      </div>
    </div>
  );
}

function leaseLine(health: string, left: string) {
  if (health === 'expired') return 'Lease expired, going back to the queue';
  if (health === 'stalled') return `The agent went quiet. Back in the queue in ${left}.`;
  return `Back in the queue after ${left} without activity.`;
}

/** Long leases read in days ("7 days"), short ones as hours and minutes. */
function span(ms: number) {
  const days = ms / 86_400_000;
  if (days >= 2) return `${Math.round(days)} days`;
  return dur(Math.max(0, ms));
}
