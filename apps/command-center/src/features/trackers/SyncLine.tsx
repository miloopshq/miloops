import type { SyncStatus } from '@miloops-hq/core';
import { syncedAgo, hhmm } from '../../lib';

export function SyncLine({ status }: { status?: SyncStatus }) {
  if (!status) return null;
  const rate = status.rate?.limit
    ? `${status.rate.remaining?.toLocaleString() ?? '?'}/${status.rate.limit.toLocaleString()} req`
    : '';
  const queued = status.queued ? ` · ${status.queued} queued` : '';
  const [cls, text] = stateLine(status, queued);
  return (
    <div className={`sync-line ${cls}`} title={status.error}>
      <span className="dot" />
      <span>{text}</span>
      {rate && <span className="rate">{rate}</span>}
    </div>
  );
}

function stateLine(status: SyncStatus, queued: string): [string, string] {
  switch (status.state) {
    case 'online':
      return ['ok', `Online · synced ${syncedAgo(status.lastSyncAt)}${queued}`];
    case 'offline':
      return ['warn', `Offline${queued}`];
    case 'rate-limited':
      return ['warn', `Rate limited · resumes ${hhmm(status.resetAt)}${queued}`];
    case 'auth-error':
      return ['alert', `Credentials rejected${queued}`];
    default:
      return ['', `Connecting${queued}`];
  }
}
