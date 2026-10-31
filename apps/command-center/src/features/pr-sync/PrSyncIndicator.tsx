import { prSyncView } from '@miloops-hq/core';
import { Label, MiloMark, type MarkState } from '../../components/ui';
import { usePrSync } from '../../hooks';

const MARK: Record<ReturnType<typeof prSyncView>['tone'], MarkState> = {
  ok: 'ok',
  failed: 'error',
  stale: 'syncing',
  unknown: 'idle',
  off: 'idle',
};

/** PR/CI reconciler health. Hidden without a server; never green unless the last tick fully succeeded. */
export function PrSyncIndicator({ now }: { now: number }) {
  const s = usePrSync();
  if (!s.reached) return null;
  const v = prSyncView(s.live ? s.status : null, now);
  return (
    <span className={`tracker-chip pr-sync tone-${v.tone}`} title={v.title}>
      <Label size="sm">CI</Label>
      <MiloMark variant="status" state={MARK[v.tone]} size={13} className="sync-glyph" />
      <span className="tl">{v.label}</span>
    </span>
  );
}
