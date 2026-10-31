import type { PrSyncStatus } from '../model/prEvidence';

export interface PrSyncView {
  /** `ok` only for a fresh, fully successful sync; anything doubtful is `failed`, `stale` or `unknown`. */
  tone: 'ok' | 'off' | 'failed' | 'stale' | 'unknown';
  label: string;
  title: string;
}

/** A tick overdue by this much means the reconciler stopped; its last `ok` is no longer shown as current. */
const GRACE_MS = 2 * 60_000;

const ago = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`);

/**
 * What the PR/CI sync indicator shows. A failed or rate-limited tick is never
 * shown as synced, even when an earlier tick succeeded; `lastOkAt` only
 * appears as history ("last ok 5m ago"). No status at all is `unknown`.
 */
export function prSyncView(s: PrSyncStatus | null | undefined, now: number): PrSyncView {
  if (!s) return { tone: 'unknown', label: 'PR sync ?', title: 'PR/CI sync state unavailable' };
  const where = s.repo ? ` · ${s.repo}` : '';
  const lastOk = s.lastOkAt ? `last ok ${ago(now - s.lastOkAt)} ago` : 'never synced';
  if (s.state === 'off')
    return { tone: 'off', label: 'PR sync off', title: `PR/CI sync off: ${s.reason ?? 'disabled'}` };
  if (s.state === 'failed')
    return { tone: 'failed', label: 'PR sync failed', title: `${s.reason ?? 'sync failed'}${where}\n${lastOk}` };
  if (s.state === 'rate-limited')
    return {
      tone: 'failed',
      label: 'PR sync paused',
      title: `Rate limited${where}; retrying ${s.nextAt ? `in ${ago(Math.max(0, s.nextAt - now))}` : 'later'}\n${lastOk}`,
    };
  if (!s.lastOkAt || s.lastOkAt !== s.lastAttemptAt || (s.nextAt !== undefined && now > s.nextAt + GRACE_MS))
    return { tone: 'stale', label: 'PR sync stale', title: `No recent sync${where}\n${lastOk}` };
  return { tone: 'ok', label: `PR sync ${ago(now - s.lastOkAt)}`, title: `PR/CI synced${where}, ${lastOk}` };
}
