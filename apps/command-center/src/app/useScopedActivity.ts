import type { ActivityState } from '@miloops-hq/core';
import { useMemo } from 'react';

/** Map-scoped zones only see this mission's sessions; the inbox sees every mission. */
export function useScopedActivity(activity: ActivityState, mapId: string | undefined) {
  return useMemo(() => {
    const sessions = activity.sessions.filter((s) => s.mapId === mapId);
    const other = new Set(activity.sessions.filter((s) => s.mapId !== mapId).map((s) => s.id));
    return { ...activity, sessions, feed: activity.feed.filter((e) => !e.sessionId || !other.has(e.sessionId)) };
  }, [activity, mapId]);
}
