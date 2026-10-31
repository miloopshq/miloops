import { useSyncExternalStore } from 'react';
import { prSync, type PrSyncSnapshot } from '../lib';

/** PR/CI sync status and per-ticket evidence, live. */
export function usePrSync(): PrSyncSnapshot {
  return useSyncExternalStore(prSync.subscribe, prSync.get);
}
