import type { TrackerSettings } from '@teamtrail/core';
import { useState, useCallback, useEffect } from 'react';
import { trackerApi } from './trackerApi';

/** Settings from the local server; undefined while loading, null when there is no server (static build). */
export function useTrackerSettings(pollMs = 0) {
  const [s, setS] = useState<TrackerSettings | null>();
  const load = useCallback(() => trackerApi.get().then(setS, () => setS(null)), []);
  useEffect(() => {
    void load();
    if (!pollMs) return;
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return [s, setS, load] as const;
}
