import type { SessionInfo } from '@miloops-hq/core';

export const isRunning = (s: SessionInfo) => s.status === 'running';

/** A running session blocked on the operator's answer. */
export const isWaiting = (s: SessionInfo) => isRunning(s) && !!s.waitingOn;
