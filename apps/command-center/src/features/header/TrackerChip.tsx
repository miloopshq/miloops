import type { TrackerHealth } from '@miloops-hq/core';
import { Label, MiloMark, type MarkState } from '../../components/ui';
import { dur } from '../../lib';

export const SYNC_TEXT: Record<TrackerHealth['status'], string> = {
  idle: 'Idle',
  syncing: 'Syncing',
  ok: 'Synced',
  error: 'Sync error',
};

/** `metrics.trackerHealth`: sync status; write counts and last-write latency are in the tooltip. */
export function TrackerChip({ label, health, now }: { label: string; health: TrackerHealth; now: number }) {
  const title = [
    `${SYNC_TEXT[health.status]} · ${health.writes} writes · ${health.errors} errors`,
    health.lastWriteAt
      ? `Last write ${dur(health.lastWriteMs ?? 0)}, ${dur(now - health.lastWriteAt)} ago`
      : 'No writes yet',
    health.lastError,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span className={`tracker-chip sync-${health.status}`} title={title}>
      <Label size="sm">Tracker</Label>
      <MiloMark variant="status" state={health.status as MarkState} size={13} className="sync-glyph" />
      <span className="tl">{label}</span>
    </span>
  );
}
