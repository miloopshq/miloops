import type { ActivityState } from '@teamtrail/core';

/** Pick the session whose step to feature: the latest one that reported a step. */
export function featured(activity: ActivityState) {
  const last = [...activity.feed].reverse().find((e) => e.level === 'step' && e.sessionId);
  return last ? activity.sessions.find((s) => s.id === last.sessionId) : undefined;
}
