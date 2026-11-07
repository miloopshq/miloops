import type { SessionInfo } from '@teamtrail/core';

export const isRunning = (s: SessionInfo) => s.status === 'running';

/** A running session blocked on the trail lead's answer. */
export const isWaiting = (s: SessionInfo) => isRunning(s) && !!s.waitingOn;
