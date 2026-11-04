import type { PendingQuestion } from '@miloops-hq/core';

const RANK = { blocking: 0, soon: 1, fyi: 2 } as const;

/**
 * The open question a conversation answers: the one the operator picked, when it's still open; otherwise the most
 * urgent (blocking, then soon, then fyi), oldest first. An agent can have several open at once (a side question).
 */
export function pickPending(all: PendingQuestion[], sessionId?: string, preferred?: string) {
  const open = all.filter((p) => p.sessionId === sessionId);
  const picked = open.find((p) => p.id === preferred);
  if (picked) return picked;
  const rank = (p: PendingQuestion) => RANK[p.urgency ?? 'soon'];
  return [...open].sort((a, b) => rank(a) - rank(b) || a.at - b.at)[0];
}
