import type { SlackStatus } from '@miloops-hq/connector-slack';
import { useState, useCallback, useEffect } from 'react';
import { slackApi } from './slackApi';

/** Slack status from the local server; undefined while loading, null when there is no server (static build). */
export function useSlackStatus(pollMs = 0) {
  const [s, setS] = useState<SlackStatus | null>();
  const load = useCallback(() => slackApi.get().then(setS, () => setS(null)), []);
  useEffect(() => {
    void load();
    if (!pollMs) return;
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return [s, setS] as const;
}
