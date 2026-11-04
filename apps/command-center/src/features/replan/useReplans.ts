import { BRAND, type MapSnapshot } from '@miloops-hq/core';
import { useCallback, useEffect, useState } from 'react';
import { onTrackerEvent } from '../../lib/trackerChanges';
import type { ReplanView } from './types';

const api = `${BRAND.apiPrefix}/replans`;

/**
 * The mission's replan proposals (`/replans`), live: refetched on the `replan` event for this mission and when the
 * map changes (an approved proposal changes it). `pending` is the first pending proposal, if any.
 */
export function useReplans(snap?: MapSnapshot) {
  const mapId = snap?.map.id;
  const [replans, setReplans] = useState<ReplanView[]>([]);
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    if (!mapId) return setReplans([]);
    void fetch(`${api}?map=${encodeURIComponent(mapId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ replans: ReplanView[] }>) : { replans: [] }))
      .then((b) => setReplans(b.replans))
      .catch(() => setReplans([]));
  }, [mapId]);
  const version = snap?.tickets.reduce((n, t) => Math.max(n, t.updatedAt), snap.map.updatedAt);
  useEffect(load, [load, version]);
  useEffect(
    () =>
      onTrackerEvent('replan', (data) => {
        if ((data as { mapId?: string }).mapId === mapId) load();
      }),
    [load, mapId],
  );

  /** Resolves true when the call went through; on failure the error is kept for the dialog. */
  const decide = async (action: 'approve' | 'reject', id: string, note?: string) => {
    const r = await fetch(`${api}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, id, note }),
    });
    const b = (await r.json().catch(() => ({}))) as { error?: string; errors?: { message: string }[] };
    if (r.ok) {
      setError(undefined);
      load();
      return true;
    }
    const details = b.errors?.map((e) => e.message).join('; ');
    setError([b.error ?? `HTTP ${r.status}`, details].filter(Boolean).join(': '));
    return false;
  };

  return {
    replans,
    pending: replans.find((p) => p.status === 'pending'),
    error,
    clearError: () => setError(undefined),
    approve: (id: string, note?: string) => decide('approve', id, note),
    reject: (id: string, note: string) => decide('reject', id, note),
  };
}
