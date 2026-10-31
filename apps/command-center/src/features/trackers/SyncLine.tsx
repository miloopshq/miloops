import type { SyncStatus } from '@miloops-hq/core';
import { syncedAgo, hhmm } from '../../lib';

export function SyncLine({ status }: { status?: SyncStatus }) {
  if (!status) return null;
  const rate = status.rate?.limit
    ? `${status.rate.remaining?.toLocaleString() ?? '?'}/${status.rate.limit.toLocaleString()} req`
    : '';
  const queued = status.queued ? ` · ${status.queued} queued` : '';
  const [cls, text] =
    status.state === 'online'
      ? ['ok', `Online · synced ${syncedAgo(status.lastSyncAt)}${queued}`]
      : status.state === 'offline'
        ? ['warn', `Offline${queued}`]
        : status.state === 'rate-limited'
          ? ['warn', `Rate limited · resumes ${hhmm(status.resetAt)}${queued}`]
          : status.state === 'auth-error'
            ? ['alert', `Credentials rejected${queued}`]
            : ['', `Connecting${queued}`];
  return (
    <div className={`sync-line ${cls}`} title={status.error}>
      <span className="dot" />
      <span>{text}</span>
      {rate && <span className="rate">{rate}</span>}
    </div>
  );
}
